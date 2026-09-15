/** Produtos simples: CEP e processos. Cascata direta, sem mesclagem. */
import { rotear } from '../core/router.ts';
import { somenteDigitos } from '../core/documents.ts';
import { erros } from '../core/errors.ts';
import type { DadosCep, Processo, RespostaConsulta } from '../core/types.ts';

export async function consultarCep(
  entrada: string,
  finalidade: string,
): Promise<RespostaConsulta<DadosCep>> {
  const cep = somenteDigitos(entrada);
  if (cep.length !== 8) throw erros.documentoInvalido(entrada);
  return rotear<DadosCep>({ produto: 'cep', consulta: cep, finalidade, modo: 'primeira' });
}

export async function consultarProcessos(
  modo: 'numero' | 'nome',
  valor: string,
  finalidade: string,
  tribunal?: string,
): Promise<RespostaConsulta<{ processos: Processo[]; aviso: string | null }>> {
  if (!valor.trim()) throw erros.documentoInvalido(valor);
  return rotear({
    produto: 'processos',
    consulta: `${modo}:${valor.trim()}${tribunal ? `:${tribunal}` : ''}`,
    finalidade,
    modo: 'primeira',
  });
}
