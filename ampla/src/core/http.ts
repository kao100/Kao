/**
 * Cliente HTTP das fontes externas: tempo limite, retentativa com espera
 * progressiva e user-agent identificando a Ampla — órgãos públicos pedem
 * identificação de quem consome a API.
 */
import { request } from 'undici';
import { log } from './logger.ts';

const USER_AGENT = 'Ampla-Dados/0.1 (plataforma interna de consulta)';

export interface OpcoesHttp {
  cabecalhos?: Record<string, string>;
  tempoLimiteMs?: number;
  tentativas?: number;
  metodo?: 'GET' | 'POST';
  corpo?: unknown;
}

export class ErroHttp extends Error {
  readonly status: number;
  readonly corpo: string;

  constructor(status: number, corpo: string, url: string) {
    super(`HTTP ${status} em ${url}`);
    this.name = 'ErroHttp';
    this.status = status;
    this.corpo = corpo;
  }
}

export async function buscarJson<T>(url: string, opcoes: OpcoesHttp = {}): Promise<T> {
  const {
    cabecalhos = {},
    tempoLimiteMs = 10_000,
    tentativas = 3,
    metodo = 'GET',
    corpo,
  } = opcoes;

  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resposta = await request(url, {
        method: metodo,
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...(corpo ? { 'content-type': 'application/json' } : {}),
          ...cabecalhos,
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        headersTimeout: tempoLimiteMs,
        bodyTimeout: tempoLimiteMs,
      });

      // 404 é resposta legítima de "não encontrei", não falha de rede:
      // devolvemos o erro sem retentar.
      if (resposta.statusCode === 404) {
        throw new ErroHttp(404, await resposta.body.text(), url);
      }
      // 4xx é problema nosso (credencial, formato) — retentar não resolve.
      if (resposta.statusCode >= 400 && resposta.statusCode < 500 && resposta.statusCode !== 429) {
        throw new ErroHttp(resposta.statusCode, await resposta.body.text(), url);
      }
      if (resposta.statusCode >= 400) {
        // 429 e 5xx valem retentativa.
        const texto = await resposta.body.text();
        ultimoErro = new ErroHttp(resposta.statusCode, texto, url);
        if (tentativa < tentativas) {
          await esperar(300 * 2 ** (tentativa - 1));
          continue;
        }
        throw ultimoErro;
      }

      return (await resposta.body.json()) as T;
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.status < 500 && erro.status !== 429) throw erro;
      ultimoErro = erro;
      if (tentativa < tentativas) {
        log.debug('retentando fonte externa', { url, tentativa });
        await esperar(300 * 2 ** (tentativa - 1));
      }
    }
  }
  throw ultimoErro;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
