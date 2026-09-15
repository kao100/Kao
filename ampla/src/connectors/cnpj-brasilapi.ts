/**
 * CNPJ pela BrasilAPI — segundo degrau da cascata.
 *
 * Serve para dois casos: enquanto a base da Receita ainda não foi carregada,
 * e para empresas abertas depois do último dump mensal. Gratuita, mas é rede
 * e é de terceiro: por isso vem depois da base local, nunca antes.
 */
import { buscarJson, ErroHttp } from '../core/http.ts';
import { registrar, type Conector } from '../core/registry.ts';
import type { DadosCnpj } from '../core/types.ts';
import { somenteDigitos, formatarCnpj } from '../core/documents.ts';

interface RespostaBrasilApi {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  descricao_situacao_cadastral: string | null;
  data_situacao_cadastral: string | null;
  descricao_motivo_situacao_cadastral: string | null;
  identificador_matriz_filial: number | null;
  data_inicio_atividade: string | null;
  codigo_natureza_juridica: number | null;
  natureza_juridica: string | null;
  porte: string | null;
  capital_social: number | null;
  cnae_fiscal: number | null;
  cnae_fiscal_descricao: string | null;
  cnaes_secundarios: Array<{ codigo: number; descricao: string }> | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  ddd_telefone_1: string | null;
  ddd_telefone_2: string | null;
  email: string | null;
  opcao_pelo_simples: boolean | null;
  data_opcao_pelo_simples: string | null;
  opcao_pelo_mei: boolean | null;
  qsa: Array<{
    nome_socio: string;
    cnpj_cpf_do_socio: string | null;
    qualificacao_socio: string | null;
    data_entrada_sociedade: string | null;
    faixa_etaria: string | null;
    nome_representante_legal: string | null;
    cpf_representante_legal: string | null;
    identificador_de_socio: number | null;
  }> | null;
}

function tipoSocio(codigo: number | null): DadosCnpj['socios'][number]['tipo'] {
  if (codigo === 1) return 'pessoa-juridica';
  if (codigo === 2) return 'pessoa-fisica';
  if (codigo === 3) return 'estrangeiro';
  return 'desconhecido';
}

async function buscar(cnpj: string): Promise<DadosCnpj | null> {
  const digitos = somenteDigitos(cnpj);
  try {
    const r = await buscarJson<RespostaBrasilApi>(
      `https://brasilapi.com.br/api/cnpj/v1/${digitos}`,
      { tempoLimiteMs: 8_000 },
    );

    return {
      cnpj: formatarCnpj(digitos),
      razaoSocial: r.razao_social ?? '',
      nomeFantasia: r.nome_fantasia || null,
      situacaoCadastral: (r.descricao_situacao_cadastral || 'DESCONHECIDA').toUpperCase(),
      dataSituacaoCadastral: r.data_situacao_cadastral,
      motivoSituacao: r.descricao_motivo_situacao_cadastral || null,
      matriz: r.identificador_matriz_filial === 1,
      dataAbertura: r.data_inicio_atividade,
      naturezaJuridica: r.codigo_natureza_juridica
        ? { codigo: String(r.codigo_natureza_juridica), descricao: r.natureza_juridica }
        : null,
      porte: r.porte || null,
      capitalSocial: r.capital_social ?? null,
      cnaePrincipal: r.cnae_fiscal
        ? { codigo: String(r.cnae_fiscal), descricao: r.cnae_fiscal_descricao }
        : null,
      cnaesSecundarios: (r.cnaes_secundarios ?? [])
        // A BrasilAPI devolve [{codigo: -1}] quando não há secundários.
        .filter((c) => c.codigo > 0)
        .map((c) => ({ codigo: String(c.codigo), descricao: c.descricao })),
      endereco: {
        logradouro: r.logradouro || null,
        numero: r.numero || null,
        complemento: r.complemento || null,
        bairro: r.bairro || null,
        municipio: r.municipio || null,
        uf: r.uf || null,
        cep: r.cep ? somenteDigitos(r.cep) : null,
      },
      telefones: [r.ddd_telefone_1, r.ddd_telefone_2].filter((t): t is string => !!t),
      email: r.email || null,
      simplesNacional: {
        optante: r.opcao_pelo_simples === true,
        desde: r.data_opcao_pelo_simples,
        mei: r.opcao_pelo_mei === true,
      },
      socios: (r.qsa ?? []).map((s) => ({
        nome: s.nome_socio,
        documento: s.cnpj_cpf_do_socio || null,
        tipo: tipoSocio(s.identificador_de_socio),
        qualificacao: s.qualificacao_socio || null,
        entradaEm: s.data_entrada_sociedade,
        faixaEtaria: s.faixa_etaria || null,
        representanteLegal: s.nome_representante_legal
          ? { nome: s.nome_representante_legal, documento: s.cpf_representante_legal || null }
          : null,
      })),
    };
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status === 404) return null;
    throw erro;
  }
}

export const conectorCnpjBrasilApi: Conector<DadosCnpj> = {
  id: 'brasilapi-cnpj',
  produto: 'cnpj',
  descricao: 'BrasilAPI — CNPJ (fallback público para a base local)',
  tipoFonte: 'publica',
  custoCentavos: 0,
  ordem: 20,
  disponivel: () => ({ ok: true }),
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorCnpjBrasilApi);
