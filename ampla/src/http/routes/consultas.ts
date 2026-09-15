/** Rotas públicas da API — o que os sistemas da Ampla consomem. */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { exigirChaveApi, exigirProduto } from '../auth.ts';
import { registrarConsulta } from '../../core/audit.ts';
import { consultarCnpj } from '../../products/cnpj.ts';
import { consultarCpf } from '../../products/cpf.ts';
import { consultarCompliance } from '../../products/compliance.ts';
import { consultarCep, consultarProcessos } from '../../products/simples.ts';
import { inventario } from '../../core/registry.ts';
import { ErroApi } from '../../core/errors.ts';
import type { RespostaConsulta } from '../../core/types.ts';

function ipDe(req: FastifyRequest): string | null {
  return req.ip || null;
}

async function auditar(req: FastifyRequest, resposta: RespostaConsulta<unknown>) {
  await registrarConsulta({
    resposta,
    finalidade: req.finalidade ?? 'nao-informada',
    chaveId: req.chave?.id ?? null,
    usuarioId: req.usuario?.id ?? null,
    ip: ipDe(req),
  });
}

function booleano(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === '1';
}

export function rotasConsultas(app: FastifyInstance): void {
  app.addHook('preHandler', exigirChaveApi);

  app.get<{ Params: { cnpj: string }; Querystring: { sem_cache?: string } }>(
    '/cnpj/:cnpj',
    { preHandler: exigirProduto('cnpj') },
    async (req) => {
      const resposta = await consultarCnpj(req.params.cnpj, req.finalidade!, {
        usarCache: !booleano(req.query.sem_cache),
      });
      await auditar(req, resposta);
      return resposta;
    },
  );

  app.get<{
    Params: { cpf: string };
    Querystring: { nome?: string; campos?: string; sem_cache?: string; sem_fonte_paga?: string };
  }>('/cpf/:cpf', { preHandler: exigirProduto('cpf') }, async (req) => {
    const resposta = await consultarCpf(req.params.cpf, req.finalidade!, {
      nome: req.query.nome,
      campos: req.query.campos?.split(',').map((c) => c.trim()).filter(Boolean),
      usarCache: !booleano(req.query.sem_cache),
      semFontePaga: booleano(req.query.sem_fonte_paga),
    });
    await auditar(req, resposta);
    return resposta;
  });

  app.get<{ Params: { documento: string }; Querystring: { nome?: string; sem_cache?: string } }>(
    '/compliance/:documento',
    { preHandler: exigirProduto('compliance') },
    async (req) => {
      const resposta = await consultarCompliance(req.params.documento, req.finalidade!, {
        nome: req.query.nome,
        usarCache: !booleano(req.query.sem_cache),
      });
      await auditar(req, resposta);
      return resposta;
    },
  );

  app.get<{ Params: { cep: string } }>(
    '/cep/:cep',
    { preHandler: exigirProduto('cep') },
    async (req) => {
      const resposta = await consultarCep(req.params.cep, req.finalidade!);
      await auditar(req, resposta);
      return resposta;
    },
  );

  app.get<{ Querystring: { numero?: string; nome?: string; tribunal?: string } }>(
    '/processos',
    { preHandler: exigirProduto('processos') },
    async (req) => {
      const { numero, nome, tribunal } = req.query;
      if (!numero && !nome) {
        throw new ErroApi(
          400,
          'parametro_ausente',
          'Informe "numero" (do processo) ou "nome" (da parte).',
        );
      }
      const resposta = await consultarProcessos(
        numero ? 'numero' : 'nome',
        (numero ?? nome)!,
        req.finalidade!,
        tribunal,
      );
      await auditar(req, resposta);
      return resposta;
    },
  );

  /** Quais fontes estão ligadas, quais faltam configurar e quanto custa cada uma. */
  app.get('/fontes', async () => ({ fontes: inventario() }));
}
