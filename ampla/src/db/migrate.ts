/**
 * Roda as migrações em ordem, uma vez cada. Idempotente: pode ser executado
 * a cada deploy.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.ts';
import { log } from '../core/logger.ts';

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaMigracoes = join(aqui, 'migrations');

export async function migrar(): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS migracoes (
        nome      TEXT PRIMARY KEY,
        rodada_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await cliente.query<{ nome: string }>('SELECT nome FROM migracoes');
    const jaRodadas = new Set(rows.map((r) => r.nome));
    const arquivos = readdirSync(pastaMigracoes).filter((f) => f.endsWith('.sql')).sort();

    for (const arquivo of arquivos) {
      if (jaRodadas.has(arquivo)) continue;
      const sql = readFileSync(join(pastaMigracoes, arquivo), 'utf8');
      await cliente.query('BEGIN');
      try {
        await cliente.query(sql);
        await cliente.query('INSERT INTO migracoes (nome) VALUES ($1)', [arquivo]);
        await cliente.query('COMMIT');
        log.info('migração aplicada', { arquivo });
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
      }
    }
  } finally {
    cliente.release();
  }
}

// Execução direta: npm run migrate
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  migrar()
    .then(() => {
      log.info('migrações concluídas');
      return pool.end();
    })
    .catch((erro) => {
      log.error('falha nas migrações', { erro: String(erro) });
      process.exit(1);
    });
}
