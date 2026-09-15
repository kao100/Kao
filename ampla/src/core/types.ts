/**
 * Schema normalizado de resposta.
 *
 * Esta é a peça central da plataforma: toda consulta, venha de base própria,
 * API pública gratuita ou fornecedor pago, é convertida para estes tipos.
 * É o que permite trocar de fornecedor sem reescrever quem consome — e é
 * exatamente o lock-in que um agregador terceiro tem sobre quem o usa.
 */

export type Produto =
  | 'cnpj'
  | 'cpf'
  | 'compliance'
  | 'processos'
  | 'cep'
  | 'divida-ativa';

/** Por que a fonte não respondeu. Diferencia "não achei" de "não consigo". */
export type MotivoIndisponivel =
  | 'nao_encontrado'
  | 'fonte_desabilitada'
  | 'fonte_sem_credencial'
  | 'fonte_indisponivel'
  | 'documento_invalido'
  | 'nao_suportado';

export interface ResultadoFonte<T = unknown> {
  /** Identificador do conector, ex.: 'receita-cnpj-local'. */
  fonte: string;
  ok: boolean;
  dados?: T;
  motivo?: MotivoIndisponivel;
  detalhe?: string;
  /** Custo em centavos desta chamada. Fontes públicas são 0. */
  custoCentavos: number;
  latenciaMs: number;
  /** Quando a fonte é uma base local, quando ela foi atualizada. */
  atualizadoEm?: string;
}

export interface RespostaConsulta<T = unknown> {
  produto: Produto;
  consulta: string;
  encontrado: boolean;
  dados: T | null;
  /** De onde veio o que está em `dados`. */
  origem: 'cache' | 'fonte' | 'nenhuma';
  fontes: Array<Omit<ResultadoFonte, 'dados'>>;
  custoTotalCentavos: number;
  latenciaTotalMs: number;
  consultaId: string;
}

// --- Entidades normalizadas -------------------------------------------------

export interface Endereco {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
}

export interface Socio {
  nome: string;
  documento: string | null;
  tipo: 'pessoa-fisica' | 'pessoa-juridica' | 'estrangeiro' | 'desconhecido';
  qualificacao: string | null;
  entradaEm: string | null;
  faixaEtaria: string | null;
  representanteLegal: { nome: string; documento: string | null } | null;
}

export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string;
  dataSituacaoCadastral: string | null;
  motivoSituacao: string | null;
  matriz: boolean;
  dataAbertura: string | null;
  naturezaJuridica: { codigo: string; descricao: string | null } | null;
  porte: string | null;
  capitalSocial: number | null;
  cnaePrincipal: { codigo: string; descricao: string | null } | null;
  cnaesSecundarios: Array<{ codigo: string; descricao: string | null }>;
  endereco: Endereco;
  telefones: string[];
  email: string | null;
  simplesNacional: { optante: boolean; desde: string | null; mei: boolean } | null;
  socios: Socio[];
}

export interface DadosCpf {
  cpf: string;
  valido: boolean;
  /** Nome só aparece quando alguma fonte autorizada o devolve. */
  nome: string | null;
  situacaoCadastral: string | null;
  nascimento: string | null;
  nomeMae: string | null;
  telefones: string[];
  emails: string[];
  endereco: Endereco | null;
  faixaRenda: string | null;
  obito: boolean | null;
  /** Empresas em que o CPF aparece como sócio, vindo da base da Receita. */
  participacoesSocietarias: Array<{
    cnpj: string;
    razaoSocial: string;
    qualificacao: string | null;
    entradaEm: string | null;
  }>;
  /** Campos que exigem fonte paga e não foram preenchidos. */
  camposIndisponiveis: string[];
}

export interface Sancao {
  lista: string;
  tipo: string | null;
  orgao: string | null;
  descricao: string | null;
  inicio: string | null;
  fim: string | null;
  documento: string | null;
  nome: string | null;
}

export interface DadosCompliance {
  documento: string;
  nome: string | null;
  pep: {
    exposta: boolean;
    funcao: string | null;
    orgao: string | null;
    inicioExercicio: string | null;
    fimCarencia: string | null;
  } | null;
  sancoes: Sancao[];
  dividaAtiva: {
    inscrito: boolean;
    quantidade: number;
    valorTotal: number | null;
    atualizadoEm: string | null;
  } | null;
  /** Resumo de risco calculado a partir do que foi encontrado. */
  alertas: string[];
}

export interface Processo {
  numero: string;
  tribunal: string | null;
  classe: string | null;
  assuntos: string[];
  orgaoJulgador: string | null;
  dataAjuizamento: string | null;
  ultimaAtualizacao: string | null;
  grau: string | null;
}

export interface DadosCep {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  ibge: string | null;
}
