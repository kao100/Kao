/**
 * Produto compliance — PEP, sanções e dívida ativa num retrato só.
 *
 * Modo 'agregar': PGFN e Portal da Transparência respondem perguntas
 * diferentes, então as duas rodam sempre e o resultado é a união delas.
 * Tudo aqui é gratuito — este é o produto de KYC/PLD que a Ampla passa a ter
 * sem pagar ninguém.
 */
import { rotear } from '../core/router.ts';
import { identificarDocumento, somenteDigitos } from '../core/documents.ts';
import { erros } from '../core/errors.ts';
import type { DadosCompliance, RespostaConsulta } from '../core/types.ts';

function mesclar(parciais: Array<{ fonte: string; dados: DadosCompliance }>): DadosCompliance | null {
  if (parciais.length === 0) return null;

  const resultado: DadosCompliance = {
    documento: parciais[0]!.dados.documento,
    nome: null,
    pep: null,
    sancoes: [],
    dividaAtiva: null,
    alertas: [],
  };

  for (const { dados } of parciais) {
    resultado.nome ??= dados.nome;
    if (dados.pep) resultado.pep = dados.pep;
    if (dados.dividaAtiva) resultado.dividaAtiva = dados.dividaAtiva;
    resultado.sancoes.push(...dados.sancoes);
  }

  resultado.alertas = montarAlertas(resultado);
  return resultado;
}

/**
 * Resumo em linguagem de negócio. É o que a mesa de crédito lê antes de
 * abrir o detalhe — e o que entra no parecer.
 */
export function montarAlertas(dados: DadosCompliance): string[] {
  const alertas: string[] = [];

  if (dados.pep?.exposta) {
    const funcao = dados.pep.funcao ? ` (${dados.pep.funcao})` : '';
    alertas.push(`Pessoa exposta politicamente${funcao} — exige diligência reforçada.`);
  }

  const vigentes = dados.sancoes.filter((s) => {
    if (!s.fim) return true;
    const fim = new Date(s.fim);
    return Number.isNaN(fim.getTime()) || fim >= new Date();
  });
  if (vigentes.length > 0) {
    const listas = [...new Set(vigentes.map((s) => s.lista))].join(', ');
    alertas.push(`${vigentes.length} sanção(ões) vigente(s) em ${listas}.`);
  }

  const historicas = dados.sancoes.length - vigentes.length;
  if (historicas > 0) alertas.push(`${historicas} sanção(ões) já encerrada(s) no histórico.`);

  if (dados.dividaAtiva?.inscrito) {
    const valor = dados.dividaAtiva.valorTotal;
    const formatado =
      valor !== null
        ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'valor não informado';
    alertas.push(
      `Inscrito em dívida ativa da União: ${dados.dividaAtiva.quantidade} inscrição(ões), ${formatado}.`,
    );
  }

  if (alertas.length === 0) alertas.push('Nada encontrado nas listas públicas consultadas.');
  return alertas;
}

export async function consultarCompliance(
  entrada: string,
  finalidade: string,
  opcoes: { nome?: string; usarCache?: boolean } = {},
): Promise<RespostaConsulta<DadosCompliance>> {
  const documento = somenteDigitos(entrada);
  if (identificarDocumento(documento) === 'invalido') throw erros.documentoInvalido(entrada);

  return rotear<DadosCompliance>({
    produto: 'compliance',
    consulta: opcoes.nome ? `${documento}|${opcoes.nome}` : documento,
    finalidade,
    modo: 'agregar',
    mesclar,
    usarCache: opcoes.usarCache ?? true,
  });
}
