/** Erros com status HTTP e código estável para quem consome a API. */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhe?: unknown;

  constructor(status: number, codigo: string, mensagem: string, detalhe?: unknown) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
}

export const erros = {
  documentoInvalido: (doc: string) =>
    new ErroApi(400, 'documento_invalido', `Documento inválido: ${doc}`),
  naoAutenticado: (msg = 'Chave de API ausente ou inválida.') =>
    new ErroApi(401, 'nao_autenticado', msg),
  semPermissao: (msg = 'Sem permissão para este recurso.') =>
    new ErroApi(403, 'sem_permissao', msg),
  naoEncontrado: (msg = 'Recurso não encontrado.') =>
    new ErroApi(404, 'nao_encontrado', msg),
  limiteExcedido: (msg: string) => new ErroApi(429, 'limite_excedido', msg),
  finalidadeAusente: () =>
    new ErroApi(
      400,
      'finalidade_ausente',
      'Informe a finalidade da consulta no cabeçalho X-Finalidade ou no parâmetro finalidade. ' +
        'A LGPD exige registro da finalidade de cada tratamento de dado pessoal.',
    ),
  interno: (msg = 'Erro interno.') => new ErroApi(500, 'erro_interno', msg),
};
