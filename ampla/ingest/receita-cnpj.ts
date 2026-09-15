/**
 * Carga dos dados abertos do CNPJ da Receita Federal.
 *
 * Roda uma vez por mês, quando a Receita publica o novo lote. Depois disso,
 * toda consulta de CNPJ da Ampla é resolvida no nosso Postgres: sem chamada
 * externa, sem crédito, sem mensalidade.
 *
 *   npm run ingest:cnpj                 # último mês disponível
 *   npm run ingest:cnpj -- 2026-08      # mês específico
 *   npm run ingest:cnpj -- 2026-08 auxiliares   # só as tabelas de domínio
 *
 * Espaço em disco: ~6 GB de zip e ~90 GB no banco depois de carregado.
 * Tempo: algumas horas na primeira carga, dependendo da máquina.
 */
import { join } from 'node:path';
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

const BASE = 'https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj';

// Layout oficial dos arquivos, na ordem exata das colunas do CSV.
const COLUNAS = {
  empresas: [
    'cnpj_basico', 'razao_social', 'natureza_juridica', 'qualificacao_responsavel',
    'capital_social', 'porte', 'ente_federativo',
  ],
  estabelecimentos: [
    'cnpj_basico', 'cnpj_ordem', 'cnpj_dv', 'matriz_filial', 'nome_fantasia',
    'situacao_cadastral', 'data_situacao_cadastral', 'motivo_situacao_cadastral',
    'nome_cidade_exterior', 'pais', 'data_inicio_atividade', 'cnae_principal',
    'cnae_secundaria', 'tipo_logradouro', 'logradouro', 'numero', 'complemento',
    'bairro', 'cep', 'uf', 'municipio', 'ddd_1', 'telefone_1', 'ddd_2', 'telefone_2',
    'ddd_fax', 'fax', 'email', 'situacao_especial', 'data_situacao_especial',
  ],
  socios: [
    'cnpj_basico', 'identificador_socio', 'nome_socio', 'cpf_cnpj_socio',
    'qualificacao_socio', 'data_entrada_sociedade', 'pais', 'representante_legal',
    'nome_representante', 'qualificacao_representante', 'faixa_etaria',
  ],
  simples: [
    'cnpj_basico', 'opcao_simples', 'data_opcao_simples', 'data_exclusao_simples',
    'opcao_mei', 'data_opcao_mei', 'data_exclusao_mei',
  ],
  auxiliar: ['codigo', 'descricao'],
} as const;

/** 'YYYYMMDD' → DATE. A Receita usa '0' e '00000000' para data ausente. */
const DATA = (coluna: string) =>
  `CASE WHEN ${coluna} ~ '^[0-9]{8}$' AND ${coluna} <> '00000000'
        THEN to_date(${coluna}, 'YYYYMMDD') END`;

/** '1000,00' → NUMERIC. */
const VALOR = (coluna: string) =>
  `NULLIF(replace(${coluna}, ',', '.'), '')::NUMERIC`;

const AUXILIARES = [
  { arquivo: 'Cnaes', tabela: 'rf_cnaes' },
  { arquivo: 'Motivos', tabela: 'rf_motivos' },
  { arquivo: 'Municipios', tabela: 'rf_municipios' },
  { arquivo: 'Naturezas', tabela: 'rf_naturezas' },
  { arquivo: 'Paises', tabela: 'rf_paises' },
  { arquivo: 'Qualificacoes', tabela: 'rf_qualificacoes' },
];

async function pastaDoMes(referencia: string): Promise<string> {
  return garantirPasta(join(PASTA_DADOS, 'receita', referencia));
}

/** Baixa, descompacta e joga num staging de TEXT. */
async function carregarStaging(
  referencia: string,
  arquivos: string[],
  staging: string,
  colunas: readonly string[],
): Promise<void> {
  const pasta = await pastaDoMes(referencia);
  await criarStaging(staging, [...colunas]);

  for (const nome of arquivos) {
    const zip = join(pasta, `${nome}.zip`);
    await baixar(`${BASE}/${referencia}/${nome}.zip`, zip);
    const extraidos = await descompactar(zip, join(pasta, nome));
    for (const csv of extraidos) {
      log.info('carregando csv', { csv, staging });
      await copiarCsv(csv, staging, [...colunas]);
    }
  }
}

async function ingerirAuxiliares(referencia: string): Promise<void> {
  for (const { arquivo, tabela } of AUXILIARES) {
    await carregarStaging(referencia, [arquivo], 'stg_auxiliar', COLUNAS.auxiliar);
    await consultarSql(`TRUNCATE ${tabela}`);
    await consultarSql(
      `INSERT INTO ${tabela} (codigo, descricao)
       SELECT trim(codigo), trim(descricao) FROM stg_auxiliar
       ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao`,
    );
    log.info('tabela auxiliar carregada', { tabela });
  }
  await consultarSql('DROP TABLE IF EXISTS stg_auxiliar');
}

async function ingerirEmpresas(referencia: string): Promise<void> {
  const partes = Array.from({ length: 10 }, (_, i) => `Empresas${i}`);
  await carregarStaging(referencia, partes, 'stg_empresas', COLUNAS.empresas);

  await consultarSql('TRUNCATE rf_empresas');
  await consultarSql(`
    INSERT INTO rf_empresas
      (cnpj_basico, razao_social, natureza_juridica, qualificacao_responsavel,
       capital_social, porte, ente_federativo)
    SELECT lpad(trim(cnpj_basico), 8, '0'), trim(razao_social), trim(natureza_juridica),
           trim(qualificacao_responsavel), ${VALOR('capital_social')},
           trim(porte), NULLIF(trim(ente_federativo), '')
      FROM stg_empresas
     WHERE cnpj_basico IS NOT NULL
    ON CONFLICT (cnpj_basico) DO NOTHING
  `);
  await consultarSql('DROP TABLE IF EXISTS stg_empresas');
}

async function ingerirEstabelecimentos(referencia: string): Promise<void> {
  const partes = Array.from({ length: 10 }, (_, i) => `Estabelecimentos${i}`);
  await carregarStaging(referencia, partes, 'stg_estabelecimentos', COLUNAS.estabelecimentos);

  await consultarSql('TRUNCATE rf_estabelecimentos');
  await consultarSql(`
    INSERT INTO rf_estabelecimentos
      (cnpj_basico, cnpj_ordem, cnpj_dv, matriz_filial, nome_fantasia,
       situacao_cadastral, data_situacao_cadastral, motivo_situacao_cadastral,
       nome_cidade_exterior, pais, data_inicio_atividade, cnae_principal,
       cnae_secundaria, tipo_logradouro, logradouro, numero, complemento, bairro,
       cep, uf, municipio, ddd_1, telefone_1, ddd_2, telefone_2, ddd_fax, fax,
       email, situacao_especial, data_situacao_especial)
    SELECT lpad(trim(cnpj_basico), 8, '0'), lpad(trim(cnpj_ordem), 4, '0'),
           lpad(trim(cnpj_dv), 2, '0'), trim(matriz_filial), NULLIF(trim(nome_fantasia), ''),
           trim(situacao_cadastral), ${DATA('data_situacao_cadastral')},
           trim(motivo_situacao_cadastral), NULLIF(trim(nome_cidade_exterior), ''),
           trim(pais), ${DATA('data_inicio_atividade')}, trim(cnae_principal),
           NULLIF(trim(cnae_secundaria), ''), trim(tipo_logradouro), trim(logradouro),
           trim(numero), NULLIF(trim(complemento), ''), trim(bairro),
           regexp_replace(coalesce(cep, ''), '\\D', '', 'g'), trim(uf), trim(municipio),
           trim(ddd_1), trim(telefone_1), trim(ddd_2), trim(telefone_2),
           trim(ddd_fax), trim(fax), lower(NULLIF(trim(email), '')),
           NULLIF(trim(situacao_especial), ''), ${DATA('data_situacao_especial')}
      FROM stg_estabelecimentos
     WHERE cnpj_basico IS NOT NULL AND cnpj_ordem IS NOT NULL AND cnpj_dv IS NOT NULL
    ON CONFLICT (cnpj_basico, cnpj_ordem, cnpj_dv) DO NOTHING
  `);
  await consultarSql('DROP TABLE IF EXISTS stg_estabelecimentos');
}

async function ingerirSocios(referencia: string): Promise<void> {
  const partes = Array.from({ length: 10 }, (_, i) => `Socios${i}`);
  await carregarStaging(referencia, partes, 'stg_socios', COLUNAS.socios);

  await consultarSql('TRUNCATE rf_socios');
  await consultarSql(`
    INSERT INTO rf_socios
      (cnpj_basico, identificador_socio, nome_socio, cpf_cnpj_socio, qualificacao_socio,
       data_entrada_sociedade, pais, representante_legal, nome_representante,
       qualificacao_representante, faixa_etaria)
    SELECT lpad(trim(cnpj_basico), 8, '0'), trim(identificador_socio), trim(nome_socio),
           trim(cpf_cnpj_socio), trim(qualificacao_socio),
           ${DATA('data_entrada_sociedade')}, trim(pais),
           NULLIF(trim(representante_legal), ''), NULLIF(trim(nome_representante), ''),
           trim(qualificacao_representante), trim(faixa_etaria)
      FROM stg_socios
     WHERE cnpj_basico IS NOT NULL
  `);
  await consultarSql('DROP TABLE IF EXISTS stg_socios');
}

async function ingerirSimples(referencia: string): Promise<void> {
  await carregarStaging(referencia, ['Simples'], 'stg_simples', COLUNAS.simples);

  await consultarSql('TRUNCATE rf_simples');
  await consultarSql(`
    INSERT INTO rf_simples
      (cnpj_basico, opcao_simples, data_opcao_simples, data_exclusao_simples,
       opcao_mei, data_opcao_mei, data_exclusao_mei)
    SELECT lpad(trim(cnpj_basico), 8, '0'), trim(opcao_simples),
           ${DATA('data_opcao_simples')}, ${DATA('data_exclusao_simples')},
           trim(opcao_mei), ${DATA('data_opcao_mei')}, ${DATA('data_exclusao_mei')}
      FROM stg_simples
     WHERE cnpj_basico IS NOT NULL
    ON CONFLICT (cnpj_basico) DO NOTHING
  `);
  await consultarSql('DROP TABLE IF EXISTS stg_simples');
}

/** Mês corrente menos um: a Receita publica o lote do mês anterior. */
function referenciaPadrao(): string {
  const agora = new Date();
  agora.setUTCMonth(agora.getUTCMonth() - 1);
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function principal(): Promise<void> {
  const referencia = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2])
    ? process.argv[2]
    : referenciaPadrao();
  const etapa = process.argv[3] ?? 'tudo';

  log.info('iniciando carga da Receita', { referencia, etapa });
  const ingestaoId = await registrarIngestao('receita-cnpj', referencia);

  try {
    if (etapa === 'tudo' || etapa === 'auxiliares') await ingerirAuxiliares(referencia);
    if (etapa === 'tudo' || etapa === 'empresas') await ingerirEmpresas(referencia);
    if (etapa === 'tudo' || etapa === 'estabelecimentos') await ingerirEstabelecimentos(referencia);
    if (etapa === 'tudo' || etapa === 'socios') await ingerirSocios(referencia);
    if (etapa === 'tudo' || etapa === 'simples') await ingerirSimples(referencia);

    // Depois de um TRUNCATE + INSERT deste tamanho, o planejador precisa de
    // estatísticas novas para usar os índices.
    log.info('atualizando estatísticas do banco');
    await consultarSql('ANALYZE rf_empresas');
    await consultarSql('ANALYZE rf_estabelecimentos');
    await consultarSql('ANALYZE rf_socios');
    await consultarSql('ANALYZE rf_simples');

    const [{ total = 0 } = {}] = await consultarSql<{ total: number }>(
      'SELECT COUNT(*)::bigint AS total FROM rf_estabelecimentos',
    );
    await concluirIngestao(ingestaoId, total);
    log.info('carga concluída', { referencia, estabelecimentos: total });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await concluirIngestao(ingestaoId, 0, mensagem);
    throw erro;
  }
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    log.error('falha na carga', { erro: erro instanceof Error ? erro.stack : String(erro) });
    await pool.end().catch(() => {});
    process.exit(1);
  });
