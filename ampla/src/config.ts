/**
 * Configuração central. Tudo vem de variável de ambiente — nenhum segredo,
 * chave ou URL de fornecedor fica no código.
 */
import { readFileSync, existsSync } from 'node:fs';

// .env simples, sem dependência externa.
if (existsSync('.env')) {
  for (const linha of readFileSync('.env', 'utf8').split('\n')) {
    const corte = linha.indexOf('=');
    if (corte < 1 || linha.trimStart().startsWith('#')) continue;
    const chave = linha.slice(0, corte).trim();
    if (process.env[chave] === undefined) {
      process.env[chave] = linha.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

function texto(chave: string, padrao = ''): string {
  return process.env[chave]?.trim() || padrao;
}

function ligado(chave: string): boolean {
  return ['1', 'true', 'sim', 'yes'].includes(texto(chave).toLowerCase());
}

export const config = {
  port: Number(texto('PORT', '3000')),
  ambiente: texto('NODE_ENV', 'development'),
  producao: texto('NODE_ENV') === 'production',

  databaseUrl: texto('DATABASE_URL', 'postgres://ampla:ampla@localhost:5432/ampla_dados'),
  redisUrl: texto('REDIS_URL', 'redis://localhost:6379'),
  sessionSecret: texto('SESSION_SECRET', 'desenvolvimento-inseguro-troque-em-producao'),

  transparencia: {
    apiKey: texto('TRANSPARENCIA_API_KEY'),
    baseUrl: 'https://api.portaldatransparencia.gov.br/api-de-dados',
  },
  datajud: {
    apiKey: texto('DATAJUD_API_KEY'),
    baseUrl: 'https://api-publica.datajud.cnj.jus.br',
  },

  /** Fontes pagas. Desligadas: não chamam nada e não geram custo. */
  serproCpf: {
    habilitado: ligado('SERPRO_CPF_ENABLED'),
    baseUrl: texto('SERPRO_CPF_BASE_URL'),
    token: texto('SERPRO_CPF_TOKEN'),
  },
  bureau: {
    habilitado: ligado('BUREAU_ENABLED'),
    baseUrl: texto('BUREAU_BASE_URL'),
    token: texto('BUREAU_TOKEN'),
  },
} as const;

export function avisosDeConfiguracao(): string[] {
  const avisos: string[] = [];
  if (!config.transparencia.apiKey) {
    avisos.push('TRANSPARENCIA_API_KEY vazia — PEP e sanções ficam indisponíveis.');
  }
  if (!config.datajud.apiKey) {
    avisos.push('DATAJUD_API_KEY vazia — consulta de processos fica indisponível.');
  }
  if (config.producao && config.sessionSecret.startsWith('desenvolvimento')) {
    avisos.push('SESSION_SECRET padrão em produção — troque imediatamente.');
  }
  return avisos;
}
