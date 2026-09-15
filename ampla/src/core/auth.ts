/**
 * Autenticação: senhas do painel e chaves de API.
 *
 * Só usa `node:crypto` — sem dependência externa para uma coisa tão sensível.
 */
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { consultarSql, umaLinha } from '../db/pool.ts';

const derivar = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
) => Promise<Buffer>;

// --- Senhas do painel -------------------------------------------------------

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const derivada = await derivar(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, salHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const derivada = await derivar(senha, Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(hashHex, 'hex');
  if (esperado.length !== derivada.length) return false;
  return timingSafeEqual(derivada, esperado);
}

// --- Chaves de API ----------------------------------------------------------

/**
 * A chave é mostrada uma única vez, na criação. O banco guarda só o hash e um
 * prefixo legível — se o banco vazar, nenhuma chave é utilizável.
 *
 * SHA-256 direto basta aqui (diferente de senha): a chave tem 256 bits de
 * entropia aleatória, não há dicionário para atacar.
 */
export function gerarChaveApi(ambiente: 'producao' | 'sandbox'): {
  chave: string;
  prefixo: string;
  hash: string;
} {
  const segredo = randomBytes(32).toString('base64url');
  const marca = ambiente === 'producao' ? 'live' : 'test';
  const chave = `ampla_${marca}_${segredo}`;
  return {
    chave,
    prefixo: chave.slice(0, 18),
    hash: createHash('sha256').update(chave).digest('hex'),
  };
}

export interface ChaveAutenticada {
  id: number;
  nome: string;
  ambiente: 'producao' | 'sandbox';
  limiteDiario: number;
  produtos: string[];
}

export async function autenticarChave(chave: string): Promise<ChaveAutenticada | null> {
  if (!chave.startsWith('ampla_')) return null;
  const hash = createHash('sha256').update(chave).digest('hex');

  const linha = await umaLinha<{
    id: number;
    nome: string;
    ambiente: 'producao' | 'sandbox';
    limite_diario: number;
    produtos: string[];
  }>(
    `SELECT id, nome, ambiente, limite_diario, produtos
       FROM chaves_api
      WHERE hash = $1 AND ativo = TRUE AND revogado_em IS NULL`,
    [hash],
  );
  if (!linha) return null;

  // Sem await: registrar o uso não pode atrasar a consulta do cliente.
  void consultarSql('UPDATE chaves_api SET ultimo_uso_em = now() WHERE id = $1', [linha.id]).catch(
    () => {},
  );

  return {
    id: linha.id,
    nome: linha.nome,
    ambiente: linha.ambiente,
    limiteDiario: linha.limite_diario,
    produtos: linha.produtos ?? [],
  };
}

// --- Sessões do painel ------------------------------------------------------

const DURACAO_SESSAO_HORAS = 12;

export async function criarSessao(usuarioId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await consultarSql(
    `INSERT INTO sessoes (token, usuario_id, expira_em)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
    [token, usuarioId, String(DURACAO_SESSAO_HORAS)],
  );
  return token;
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  papel: 'admin' | 'operador' | 'auditor';
}

export async function usuarioDaSessao(token: string): Promise<UsuarioSessao | null> {
  if (!token) return null;
  return umaLinha<UsuarioSessao>(
    `SELECT u.id, u.nome, u.email, u.papel
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = $1 AND s.expira_em > now() AND u.ativo = TRUE`,
    [token],
  );
}

export async function encerrarSessao(token: string): Promise<void> {
  await consultarSql('DELETE FROM sessoes WHERE token = $1', [token]);
}

export async function limparSessoesExpiradas(): Promise<void> {
  await consultarSql('DELETE FROM sessoes WHERE expira_em < now()');
}
