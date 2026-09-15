/**
 * Portaria da API: identifica quem está chamando, aplica a quota e exige a
 * finalidade da consulta.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { autenticarChave, usuarioDaSessao, type ChaveAutenticada, type UsuarioSessao } from '../core/auth.ts';
import { incrementarContador } from '../cache/redis.ts';
import { erros } from '../core/errors.ts';

declare module 'fastify' {
  interface FastifyRequest {
    chave?: ChaveAutenticada;
    usuario?: UsuarioSessao;
    finalidade?: string;
  }
}

const SEGUNDOS_EM_UM_DIA = 86_400;

function extrairChave(req: FastifyRequest): string | null {
  const autorizacao = req.headers.authorization;
  if (autorizacao?.startsWith('Bearer ')) return autorizacao.slice(7).trim();
  const cabecalho = req.headers['x-api-key'];
  if (typeof cabecalho === 'string' && cabecalho.trim()) return cabecalho.trim();
  return null;
}

/**
 * A finalidade é obrigatória. Parece burocracia, mas é o campo que responde
 * "por que a Ampla consultou o CPF deste cidadão?" quando alguém perguntar —
 * e alguém pergunta.
 */
function extrairFinalidade(req: FastifyRequest): string {
  const cabecalho = req.headers['x-finalidade'];
  if (typeof cabecalho === 'string' && cabecalho.trim()) return cabecalho.trim();
  const query = (req.query as Record<string, unknown> | undefined)?.['finalidade'];
  if (typeof query === 'string' && query.trim()) return query.trim();
  return '';
}

export async function exigirChaveApi(req: FastifyRequest, _res: FastifyReply): Promise<void> {
  const chave = extrairChave(req);
  if (!chave) throw erros.naoAutenticado();

  const autenticada = await autenticarChave(chave);
  if (!autenticada) throw erros.naoAutenticado('Chave de API inválida ou revogada.');

  const finalidade = extrairFinalidade(req);
  if (!finalidade) throw erros.finalidadeAusente();

  const usados = await incrementarContador(
    `chave:${autenticada.id}:${new Date().toISOString().slice(0, 10)}`,
    SEGUNDOS_EM_UM_DIA,
  );
  if (usados > autenticada.limiteDiario) {
    throw erros.limiteExcedido(
      `Limite diário de ${autenticada.limiteDiario} consultas atingido para a chave "${autenticada.nome}".`,
    );
  }

  req.chave = autenticada;
  req.finalidade = finalidade;
}

/** Restringe uma chave aos produtos autorizados (lista vazia = todos). */
export function exigirProduto(produto: string) {
  return async (req: FastifyRequest): Promise<void> => {
    const permitidos = req.chave?.produtos ?? [];
    if (permitidos.length > 0 && !permitidos.includes(produto)) {
      throw erros.semPermissao(`Esta chave não tem acesso ao produto "${produto}".`);
    }
  };
}

export async function exigirSessao(req: FastifyRequest): Promise<void> {
  const token = req.cookies?.['ampla_sessao'];
  const usuario = token ? await usuarioDaSessao(token) : null;
  if (!usuario) throw erros.naoAutenticado('Faça login no painel.');
  req.usuario = usuario;
}

export function exigirPapel(...papeis: Array<UsuarioSessao['papel']>) {
  return async (req: FastifyRequest): Promise<void> => {
    await exigirSessao(req);
    if (!papeis.includes(req.usuario!.papel)) {
      throw erros.semPermissao(`Ação restrita a: ${papeis.join(', ')}.`);
    }
  };
}
