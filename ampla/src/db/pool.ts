import pg from 'pg';
import { config } from '../config.ts';
import { log } from '../core/logger.ts';

// A Receita usa NUMERIC em capital social e valores; o driver devolve string
// por padrão para não perder precisão. Aqui a precisão cabe em double.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// DATE como texto ISO, sem fuso — datas da Receita não têm hora.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// int8 (BIGINT) como número; nossos contadores não passam de 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (erro) => log.error('erro no pool do postgres', { erro: erro.message }));

export async function consultarSql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const resultado = await pool.query<T>(sql, valores);
  return resultado.rows;
}

export async function umaLinha<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  valores: unknown[] = [],
): Promise<T | null> {
  const linhas = await consultarSql<T>(sql, valores);
  return linhas[0] ?? null;
}

export async function bancoDisponivel(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
