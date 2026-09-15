/**
 * Produto CNPJ — base local primeiro, BrasilAPI como reserva.
 * Modo 'primeira': quem responder antes resolve; não há o que mesclar.
 */
import { rotear } from '../core/router.ts';
import { validarCnpj, somenteDigitos } from '../core/documents.ts';
import { erros } from '../core/errors.ts';
import type { DadosCnpj, RespostaConsulta } from '../core/types.ts';

export async function consultarCnpj(
  entrada: string,
  finalidade: string,
  opcoes: { usarCache?: boolean } = {},
): Promise<RespostaConsulta<DadosCnpj>> {
  const cnpj = somenteDigitos(entrada);
  if (!validarCnpj(cnpj)) throw erros.documentoInvalido(entrada);

  return rotear<DadosCnpj>({
    produto: 'cnpj',
    consulta: cnpj,
    finalidade,
    modo: 'primeira',
    usarCache: opcoes.usarCache ?? true,
  });
}
