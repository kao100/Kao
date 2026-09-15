/**
 * CPF pelas fontes que a Ampla tem de graça.
 *
 * Duas coisas, e só duas, dá para saber sobre um CPF sem pagar ninguém:
 *
 *  1. Se o número é válido (dígito verificador). Cálculo local, instantâneo.
 *  2. Em que empresas ele aparece como sócio, pela base da Receita.
 *
 * Nome, endereço, telefone, renda e situação cadastral **não existem em
 * fonte pública** — exigem SERPRO ou bureau. O conector deixa isso explícito
 * em `camposIndisponiveis` em vez de devolver nulo sem explicação.
 *
 * Sobre o item 2: a Receita publica o CPF do sócio mascarado (***123456**),
 * escondendo 5 dígitos. Cada máscara bate com milhares de CPFs no país, então
 * máscara sozinha NÃO identifica ninguém. Por isso o vínculo societário só é
 * devolvido quando o chamador informa também o nome — e mesmo assim marcado
 * como conferência, não como certeza.
 */
import { consultarSql } from '../db/pool.ts';
import { registrar, type Conector } from '../core/registry.ts';
import type { DadosCpf } from '../core/types.ts';
import { somenteDigitos, validarCpf, formatarCpf, cpfParaMascaraReceita } from '../core/documents.ts';

/** Campos que nenhuma fonte gratuita entrega. */
export const CAMPOS_SO_COM_FONTE_PAGA = [
  'nome',
  'situacaoCadastral',
  'nascimento',
  'nomeMae',
  'telefones',
  'emails',
  'endereco',
  'faixaRenda',
  'obito',
];

function normalizarNome(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Considera o mesmo nome quando bate exatamente, ou quando primeiro e último
 * nome coincidem (cobre abreviação de nome do meio, comum na base da Receita).
 */
function mesmoNome(a: string, b: string): boolean {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const pa = na.split(' ');
  const pb = nb.split(' ');
  if (pa.length < 2 || pb.length < 2) return false;
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
}

const SQL_PARTICIPACOES = `
  SELECT s.cnpj_basico, s.nome_socio, s.qualificacao_socio,
         q.descricao AS qualificacao_descricao,
         s.data_entrada_sociedade,
         e.cnpj_ordem, e.cnpj_dv, emp.razao_social
    FROM rf_socios s
    LEFT JOIN rf_qualificacoes q ON q.codigo = s.qualificacao_socio
    LEFT JOIN rf_empresas emp ON emp.cnpj_basico = s.cnpj_basico
    LEFT JOIN rf_estabelecimentos e
           ON e.cnpj_basico = s.cnpj_basico AND e.matriz_filial = '1'
   WHERE s.cpf_cnpj_socio = $1
   LIMIT 500
`;

export interface EntradaCpf {
  cpf: string;
  /** Necessário para confirmar vínculo societário. Sem ele, não devolvemos. */
  nome?: string;
}

/** A consulta chega como "cpf" ou "cpf|nome" para caber na chave de cache. */
export function separarEntradaCpf(entrada: string): EntradaCpf {
  const [cpf = '', nome = ''] = entrada.split('|');
  return { cpf: somenteDigitos(cpf), nome: nome.trim() || undefined };
}

async function buscar(entrada: string): Promise<DadosCpf | null> {
  const { cpf, nome } = separarEntradaCpf(entrada);
  const valido = validarCpf(cpf);

  const base: DadosCpf = {
    cpf: formatarCpf(cpf),
    valido,
    // O nome recebido é entrada do chamador, não dado apurado: deixamos o
    // campo nulo para não devolver como "apurado" algo que só foi digitado.
    nome: null,
    situacaoCadastral: null,
    nascimento: null,
    nomeMae: null,
    telefones: [],
    emails: [],
    endereco: null,
    faixaRenda: null,
    obito: null,
    participacoesSocietarias: [],
    camposIndisponiveis: [...CAMPOS_SO_COM_FONTE_PAGA],
  };

  if (!valido) return base;

  // Sem nome informado, não há como distinguir este CPF dos milhares que
  // compartilham a mesma máscara. Devolver a lista seria vazar dado de
  // terceiro — então não devolvemos.
  if (!nome) return base;

  let linhas: Array<{
    cnpj_basico: string;
    nome_socio: string | null;
    qualificacao_descricao: string | null;
    qualificacao_socio: string | null;
    data_entrada_sociedade: string | null;
    cnpj_ordem: string | null;
    cnpj_dv: string | null;
    razao_social: string | null;
  }> = [];

  try {
    linhas = await consultarSql(SQL_PARTICIPACOES, [cpfParaMascaraReceita(cpf)]);
  } catch {
    // Base da Receita ainda não carregada: o resto da resposta continua válido.
    return base;
  }

  base.participacoesSocietarias = linhas
    .filter((l) => l.nome_socio && mesmoNome(l.nome_socio, nome))
    .map((l) => ({
      cnpj: `${l.cnpj_basico}${l.cnpj_ordem ?? '0001'}${l.cnpj_dv ?? ''}`,
      razaoSocial: l.razao_social ?? '',
      qualificacao: l.qualificacao_descricao || l.qualificacao_socio || null,
      entradaEm: l.data_entrada_sociedade,
    }));

  return base;
}

export const conectorCpfLocal: Conector<DadosCpf> = {
  id: 'cpf-local',
  produto: 'cpf',
  descricao: 'Validação de CPF e vínculo societário pela base da Receita (gratuito)',
  tipoFonte: 'local',
  custoCentavos: 0,
  ordem: 10,
  disponivel: () => ({ ok: true }),
  consultar: (entrada) => buscar(entrada),
};

registrar(conectorCpfLocal);
