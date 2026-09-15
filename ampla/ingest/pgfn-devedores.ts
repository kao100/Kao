/**
 * Carga dos devedores inscritos em dívida ativa da União (PGFN, dados abertos).
 *
 * A PGFN publica por trimestre, quebrado por tipo de dívida e por UF, e muda
 * o padrão de URL com alguma frequência. Por isso este script não adivinha
 * endereço: recebe os arquivos (CSV ou ZIP, locais ou por URL).
 *
 *   npm run ingest:pgfn -- 2026T2 ./data/pgfn/*.csv
 *   npm run ingest:pgfn -- 2026T2 https://dadosabertos.pgfn.gov.br/.../arquivo.zip
 *
 * Downloads em: https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/dados-abertos
 */
import { basename, join } from 'node:path';
import { existsSync } from 'node:fs';
import { consultarSql, pool } from '../src/db/pool.ts';
import { log } from '../src/core/logger.ts';
import {
  PASTA_DADOS,
  baixar,
  concluirIngestao,
  copiarCsv,
  criarStaging,
  descompactar,
  garantirPasta,
  registrarIngestao,
} from './comum.ts';

/** Ordem das colunas no CSV da PGFN. */
const COLUNAS = [
  'cpf_cnpj', 'tipo_pessoa', 'tipo_devedor', 'nome_devedor', 'uf_unidade',
  'unidade_responsavel', 'entidade_responsavel', 'unidade_inscricao',
  'numero_inscricao', 'tipo_situacao', 'situacao', 'receita_principal',
  'data_inscricao', 'indicador_ajuizado', 'valor_consolidado',
];

async function reunirCsvs(entradas: string[], referencia: string): Promise<string[]> {
  const pasta = garantirPasta(join(PASTA_DADOS, 'pgfn', referencia));
  const csvs: string[] = [];

  for (const entrada of entradas) {
    let caminho = entrada;
    if (/^https?:\/\//.test(entrada)) {
      caminho = join(pasta, basename(new URL(entrada).pathname));
      await baixar(entrada, caminho);
    }
    if (!existsSync(caminho)) {
      log.warn('arquivo não encontrado, pulando', { caminho });
      continue;
    }
    if (caminho.toLowerCase().endsWith('.zip')) {
      const extraidos = await descompactar(caminho, join(pasta, basename(caminho, '.zip')));
      csvs.push(...extraidos.filter((f) => /\.(csv|txt)$/i.test(f)));
    } else {
      csvs.push(caminho);
    }
  }
  return csvs;
}

async function principal(): Promise<void> {
  const [, , referencia, ...entradas] = process.argv;
  if (!referencia || entradas.length === 0) {
    console.error(
      'Uso: npm run ingest:pgfn -- <referencia> <arquivo|url> [...]\n' +
        'Ex.:  npm run ingest:pgfn -- 2026T2 ./data/pgfn/*.csv',
    );
    process.exit(1);
  }

  const ingestaoId = await registrarIngestao('pgfn-devedores', referencia);
  try {
    const csvs = await reunirCsvs(entradas, referencia);
    if (csvs.length === 0) throw new Error('Nenhum CSV para carregar.');

    await criarStaging('stg_pgfn', COLUNAS);
    for (const csv of csvs) {
      log.info('carregando csv', { csv });
      await copiarCsv(csv, 'stg_pgfn', COLUNAS);
    }

    // Substitui o trimestre inteiro: a PGFN republica a base completa, não
    // um delta. Carga parcial deixaria inscrição já quitada no banco.
    await consultarSql('TRUNCATE pgfn_devedores');
    await consultarSql(
      `INSERT INTO pgfn_devedores
         (cpf_cnpj, nome, tipo_pessoa, tipo_devedor, unidade, numero_inscricao,
          tipo_situacao, situacao, receita_principal, data_inscricao,
          indicador_ajuizado, valor, referencia)
       SELECT trim(cpf_cnpj), trim(nome_devedor), trim(tipo_pessoa), trim(tipo_devedor),
              trim(unidade_responsavel), trim(numero_inscricao), trim(tipo_situacao),
              trim(situacao), trim(receita_principal),
              CASE WHEN data_inscricao ~ '^\\d{4}-\\d{2}-\\d{2}' THEN data_inscricao::date END,
              trim(indicador_ajuizado),
              NULLIF(replace(replace(valor_consolidado, '.', ''), ',', '.'), '')::numeric,
              $1
         FROM stg_pgfn
        WHERE cpf_cnpj IS NOT NULL AND trim(cpf_cnpj) <> ''`,
      [referencia],
    );
    await consultarSql('DROP TABLE IF EXISTS stg_pgfn');
    await consultarSql('ANALYZE pgfn_devedores');

    const [{ total = 0 } = {}] = await consultarSql<{ total: number }>(
      'SELECT COUNT(*)::bigint AS total FROM pgfn_devedores',
    );
    await concluirIngestao(ingestaoId, total);
    log.info('carga da PGFN concluída', { referencia, inscricoes: total });
  } catch (erro) {
    await concluirIngestao(ingestaoId, 0, erro instanceof Error ? erro.message : String(erro));
    throw erro;
  }
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    log.error('falha na carga da PGFN', { erro: erro instanceof Error ? erro.stack : String(erro) });
    await pool.end().catch(() => {});
    process.exit(1);
  });
