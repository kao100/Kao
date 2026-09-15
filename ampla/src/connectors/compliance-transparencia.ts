/**
 * Compliance pelo Portal da Transparência (CGU) — gratuito.
 *
 * Cobre PEP (pessoa exposta politicamente) e os cadastros de sanção:
 * CEIS (inidôneas e suspensas), CNEP (punidas pela Lei Anticorrupção) e
 * CEPIM (entidades sem fins lucrativos impedidas).
 *
 * É a parte de KYC/PLD que não precisa de fornecedor nenhum: a chave da API
 * é gratuita e sai por autocadastro de e-mail.
 *
 * Os nomes de parâmetro de cada endpoint estão isolados em ENDPOINTS abaixo
 * porque a CGU já os renomeou entre versões. Se um endpoint passar a
 * responder 400, é aqui que se corrige — uma linha, nada mais.
 */
import { config } from '../config.ts';
import { buscarJson, ErroHttp } from '../core/http.ts';
import { registrar, type Conector } from '../core/registry.ts';
import type { DadosCompliance, Sancao } from '../core/types.ts';
import { somenteDigitos, identificarDocumento } from '../core/documents.ts';
import { log } from '../core/logger.ts';

interface DefinicaoEndpoint {
  caminho: string;
  /** Nome do parâmetro de busca, por tipo de documento. */
  parametro: { cpf?: string; cnpj?: string };
  rotulo: string;
}

const ENDPOINTS: DefinicaoEndpoint[] = [
  {
    caminho: 'ceis',
    parametro: { cpf: 'codigoSancionado', cnpj: 'codigoSancionado' },
    rotulo: 'CEIS',
  },
  {
    caminho: 'cnep',
    parametro: { cpf: 'codigoSancionado', cnpj: 'codigoSancionado' },
    rotulo: 'CNEP',
  },
  {
    caminho: 'cepim',
    parametro: { cnpj: 'cnpjSancionado' },
    rotulo: 'CEPIM',
  },
];

function cabecalhos() {
  return { 'chave-api-dados': config.transparencia.apiKey };
}

/** A CGU muda o encaixe dos campos entre cadastros; buscamos pelo caminho mais provável. */
function primeiroTexto(objeto: unknown, caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let atual: any = objeto;
    for (const parte of caminho.split('.')) {
      atual = atual?.[parte];
      if (atual == null) break;
    }
    if (typeof atual === 'string' && atual.trim()) return atual.trim();
    if (typeof atual === 'number') return String(atual);
  }
  return null;
}

async function buscarSancoes(documento: string): Promise<Sancao[]> {
  const tipo = identificarDocumento(documento);
  if (tipo === 'invalido') return [];

  const sancoes: Sancao[] = [];

  for (const endpoint of ENDPOINTS) {
    const parametro = endpoint.parametro[tipo];
    if (!parametro) continue;

    const url =
      `${config.transparencia.baseUrl}/${endpoint.caminho}` +
      `?${parametro}=${somenteDigitos(documento)}&pagina=1`;

    try {
      const itens = await buscarJson<unknown[]>(url, {
        cabecalhos: cabecalhos(),
        tempoLimiteMs: 12_000,
        tentativas: 2,
      });
      if (!Array.isArray(itens)) continue;

      for (const item of itens) {
        sancoes.push({
          lista: endpoint.rotulo,
          tipo: primeiroTexto(item, ['tipoSancao.descricaoResumida', 'tipoSancao.descricao', 'tipo']),
          orgao: primeiroTexto(item, [
            'orgaoSancionador.nome',
            'orgaoSancionador.siglaUf',
            'fonteSancao.nomeExibicao',
          ]),
          descricao: primeiroTexto(item, ['textoPublicacao', 'descricaoFundamentacao', 'motivo']),
          inicio: primeiroTexto(item, ['dataInicioSancao', 'dataPublicacaoSancao']),
          fim: primeiroTexto(item, ['dataFimSancao']),
          documento: primeiroTexto(item, [
            'pessoa.cnpjFormatado',
            'pessoa.cpfFormatado',
            'sancionado.codigoFormatado',
          ]),
          nome: primeiroTexto(item, ['pessoa.nome', 'sancionado.nome', 'nomeInformado']),
        });
      }
    } catch (erro) {
      // Um cadastro fora do ar não pode derrubar os outros dois.
      log.warn('cadastro de sanção indisponível', {
        cadastro: endpoint.rotulo,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return sancoes;
}

async function buscarPep(documento: string): Promise<DadosCompliance['pep']> {
  if (identificarDocumento(documento) !== 'cpf') return null;
  const url = `${config.transparencia.baseUrl}/peps?cpf=${somenteDigitos(documento)}&pagina=1`;
  try {
    const itens = await buscarJson<unknown[]>(url, {
      cabecalhos: cabecalhos(),
      tempoLimiteMs: 12_000,
      tentativas: 2,
    });
    if (!Array.isArray(itens) || itens.length === 0) {
      return { exposta: false, funcao: null, orgao: null, inicioExercicio: null, fimCarencia: null };
    }
    const item = itens[0];
    return {
      exposta: true,
      funcao: primeiroTexto(item, ['descricaoFuncao', 'funcao']),
      orgao: primeiroTexto(item, ['nomeOrgao', 'orgao']),
      inicioExercicio: primeiroTexto(item, ['dataInicioExercicio']),
      fimCarencia: primeiroTexto(item, ['dataFimCarencia']),
    };
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status === 404) {
      return { exposta: false, funcao: null, orgao: null, inicioExercicio: null, fimCarencia: null };
    }
    throw erro;
  }
}

async function buscar(documento: string): Promise<DadosCompliance | null> {
  const [pep, sancoes] = await Promise.all([buscarPep(documento), buscarSancoes(documento)]);
  return {
    documento,
    nome: sancoes.find((s) => s.nome)?.nome ?? null,
    pep,
    sancoes,
    dividaAtiva: null, // vem do conector da PGFN
    alertas: [],
  };
}

export const conectorComplianceTransparencia: Conector<DadosCompliance> = {
  id: 'transparencia-compliance',
  produto: 'compliance',
  descricao: 'Portal da Transparência — PEP, CEIS, CNEP e CEPIM (gratuito)',
  tipoFonte: 'publica',
  custoCentavos: 0,
  ordem: 20,
  disponivel() {
    if (!config.transparencia.apiKey) {
      return {
        ok: false,
        motivo: 'fonte_sem_credencial',
        detalhe:
          'Falta TRANSPARENCIA_API_KEY. A chave é gratuita: ' +
          'https://api.portaldatransparencia.gov.br/api-de-dados/cadastrar-email',
      };
    }
    return { ok: true };
  },
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorComplianceTransparencia);
