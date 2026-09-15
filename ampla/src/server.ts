/**
 * Plataforma de dados da Ampla — servidor.
 *
 * Sobe a API (/v1), o painel (/) e o health check. Um processo só, sem
 * dependência de nuvem: roda em qualquer VM ou container da Ampla.
 */
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import estaticos from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config, avisosDeConfiguracao } from './config.ts';
import { log } from './core/logger.ts';
import { ErroApi } from './core/errors.ts';
import { migrar } from './db/migrate.ts';
import { bancoDisponivel, pool } from './db/pool.ts';
import { fecharCache } from './cache/redis.ts';
import { limparSessoesExpiradas } from './core/auth.ts';
import { verificarBaseReceita } from './connectors/cnpj-local.ts';
import { rotasConsultas } from './http/routes/consultas.ts';
import { rotasPainel } from './http/routes/painel.ts';
import './connectors/index.ts';

const aqui = dirname(fileURLToPath(import.meta.url));

export async function criarServidor() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 1024 * 256,
  });

  await app.register(cookie, { secret: config.sessionSecret });

  app.setErrorHandler((erro, req, res) => {
    if (erro instanceof ErroApi) {
      return res.status(erro.status).send({
        erro: erro.codigo,
        mensagem: erro.message,
        detalhe: erro.detalhe ?? undefined,
      });
    }
    log.error('erro não tratado', {
      rota: req.url,
      erro: erro instanceof Error ? erro.message : String(erro),
      pilha: erro instanceof Error ? erro.stack : undefined,
    });
    // Nunca devolvemos a mensagem crua: pode conter host ou credencial de fonte.
    return res.status(500).send({ erro: 'erro_interno', mensagem: 'Erro interno.' });
  });

  app.get('/health', async () => ({
    ok: true,
    banco: await bancoDisponivel(),
    baseReceita: await verificarBaseReceita(),
    versao: '0.1.0',
  }));

  await app.register(async (instancia) => rotasConsultas(instancia), { prefix: '/v1' });
  await app.register(async (instancia) => rotasPainel(instancia), { prefix: '/painel/api' });

  await app.register(estaticos, { root: join(aqui, '..', 'web'), prefix: '/' });

  return app;
}

async function iniciar() {
  for (const aviso of avisosDeConfiguracao()) log.warn(aviso);

  await migrar();
  const temBase = await verificarBaseReceita();
  if (!temBase) {
    log.warn(
      'base da Receita vazia — consultas de CNPJ vão cair na BrasilAPI. ' +
        'Para resolver localmente: npm run ingest:cnpj',
    );
  }

  const app = await criarServidor();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  log.info('plataforma no ar', { porta: config.port, ambiente: config.ambiente });

  // Faxina de sessões expiradas, de hora em hora.
  const faxina = setInterval(() => void limparSessoesExpiradas().catch(() => {}), 3_600_000);
  faxina.unref();

  for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sinal, () => {
      log.info('encerrando', { sinal });
      void app
        .close()
        .then(() => Promise.all([pool.end(), fecharCache()]))
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  }
}

// Só inicia quando executado direto (permite importar em testes).
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  iniciar().catch((erro) => {
    log.error('falha ao iniciar', { erro: erro instanceof Error ? erro.stack : String(erro) });
    process.exit(1);
  });
}
