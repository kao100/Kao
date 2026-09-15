/**
 * Utilidades de ingestão: baixar, descompactar e carregar CSV grande no
 * Postgres via COPY.
 *
 * Os arquivos da Receita são grandes (dezenas de GB descompactados), então
 * tudo aqui é por streaming — nada é carregado inteiro em memória.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { from as copyFrom } from 'pg-copy-streams';
import { pool, consultarSql } from '../src/db/pool.ts';
import { log } from '../src/core/logger.ts';

export const PASTA_DADOS = process.env['PASTA_DADOS'] || join(process.cwd(), 'data');

export function garantirPasta(caminho: string): string {
  if (!existsSync(caminho)) mkdirSync(caminho, { recursive: true });
  return caminho;
}

export async function baixar(url: string, destino: string): Promise<void> {
  if (existsSync(destino) && statSync(destino).size > 0) {
    log.info('arquivo já baixado, pulando', { destino });
    return;
  }
  log.info('baixando', { url });
  // curl com retomada: esses downloads passam de 1 GB e caem com frequência.
  await executar('curl', ['-fL', '--retry', '5', '--retry-delay', '5', '-C', '-', '-o', destino, url]);
}

export async function descompactar(zip: string, pasta: string): Promise<string[]> {
  garantirPasta(pasta);
  await executar('unzip', ['-o', '-q', zip, '-d', pasta]);
  return readdirSync(pasta).map((f) => join(pasta, f));
}

function executar(comando: string, args: string[]): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const processo = spawn(comando, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    processo.on('error', rejeitar);
    processo.on('close', (codigo) =>
      codigo === 0 ? resolver() : rejeitar(new Error(`${comando} saiu com código ${codigo}`)),
    );
  });
}

/**
 * Os CSV da Receita vêm em LATIN1 (ISO-8859-1). Convertemos para UTF-8 no
 * caminho, sem materializar o arquivo convertido em disco.
 */
function latin1ParaUtf8(): Transform {
  const decodificador = new TextDecoder('latin1');
  return new Transform({
    transform(pedaco, _codificacao, proximo) {
      proximo(null, Buffer.from(decodificador.decode(pedaco, { stream: true }), 'utf8'));
    },
    flush(proximo) {
      proximo(null, Buffer.from(decodificador.decode(), 'utf8'));
    },
  });
}

/**
 * Carrega um CSV em uma tabela de staging (todas as colunas TEXT).
 * COPY é uma ordem de grandeza mais rápido que INSERT em lote para isto.
 */
export async function copiarCsv(
  arquivo: string,
  tabela: string,
  colunas: string[],
): Promise<void> {
  const cliente = await pool.connect();
  try {
    const sql =
      `COPY ${tabela} (${colunas.join(', ')}) FROM STDIN ` +
      `WITH (FORMAT csv, DELIMITER ';', QUOTE '"', NULL '')`;
    const destino = cliente.query(copyFrom(sql));
    await pipeline(createReadStream(arquivo), latin1ParaUtf8(), destino);
  } finally {
    cliente.release();
  }
}

export async function criarStaging(tabela: string, colunas: string[]): Promise<void> {
  await consultarSql(`DROP TABLE IF EXISTS ${tabela}`);
  await consultarSql(
    `CREATE UNLOGGED TABLE ${tabela} (${colunas.map((c) => `${c} TEXT`).join(', ')})`,
  );
}

export async function registrarIngestao(fonte: string, referencia: string): Promise<number> {
  const linhas = await consultarSql<{ id: number }>(
    'INSERT INTO ingestoes (fonte, referencia) VALUES ($1, $2) RETURNING id',
    [fonte, referencia],
  );
  return linhas[0]!.id;
}

export async function concluirIngestao(id: number, linhas: number, erro?: string): Promise<void> {
  await consultarSql(
    'UPDATE ingestoes SET concluido_em = now(), linhas = $2, erro = $3 WHERE id = $1',
    [id, linhas, erro ?? null],
  );
}

export { createWriteStream };
