/**
 * Cache de respostas.
 *
 * Junto com a cascata, é o que mais corta custo quando existe fonte paga:
 * consulta repetida dentro do TTL não chega a tocar o fornecedor. O TTL é
 * por produto, porque a validade do dado varia muito — cadastro de empresa
 * muda devagar, restritivo de crédito muda todo dia.
 *
 * Se o Redis estiver fora do ar, a plataforma continua funcionando sem cache:
 * degrada o custo, nunca a disponibilidade.
 */
import { Redis } from 'ioredis';
import { config } from '../config.ts';
import { log } from '../core/logger.ts';
import type { Produto } from '../core/types.ts';

/** Validade por produto, em segundos. */
export const TTL_POR_PRODUTO: Record<Produto, number> = {
  cnpj: 60 * 60 * 24 * 7,      // 7 dias — cadastro de empresa muda devagar
  cpf: 60 * 60 * 24,           // 1 dia
  compliance: 60 * 60 * 12,    // 12 horas — sanções e PEP mudam por lote
  processos: 60 * 60 * 6,      // 6 horas
  cep: 60 * 60 * 24 * 30,      // 30 dias
  'divida-ativa': 60 * 60 * 24 * 7,
};

let cliente: Redis | null = null;
let indisponivelAte = 0;

function obterCliente(): Redis | null {
  if (Date.now() < indisponivelAte) return null;
  if (cliente) return cliente;

  cliente = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    // A fila offline fica ligada de propósito: sem ela, o primeiro comando
    // depois de abrir a conexão falha por chegar antes do handshake — e o
    // cache "não pegava" justamente na primeira consulta de cada processo.
    // Com o commandTimeout abaixo, Redis fora do ar custa 1 s, não um travo.
    enableOfflineQueue: true,
    commandTimeout: 1_000,
    connectTimeout: 2_000,
    retryStrategy: (tentativa) => Math.min(tentativa * 500, 5_000),
  });
  cliente.on('error', (erro) => {
    // Sem cache a plataforma segue de pé; só avisamos e esperamos um pouco
    // antes de tentar de novo, para não inundar o log.
    if (Date.now() >= indisponivelAte) {
      log.warn('redis indisponível, seguindo sem cache', { erro: erro.message });
    }
    indisponivelAte = Date.now() + 15_000;
  });
  return cliente;
}

function chave(produto: Produto, consulta: string): string {
  return `ampla:${produto}:${consulta}`;
}

export async function lerCache<T>(produto: Produto, consulta: string): Promise<T | null> {
  const redis = obterCliente();
  if (!redis) return null;
  try {
    const bruto = await redis.get(chave(produto, consulta));
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}

export async function gravarCache(
  produto: Produto,
  consulta: string,
  valor: unknown,
): Promise<void> {
  const redis = obterCliente();
  if (!redis) return;
  try {
    await redis.set(chave(produto, consulta), JSON.stringify(valor), 'EX', TTL_POR_PRODUTO[produto]);
  } catch {
    /* cache é best-effort */
  }
}

export async function invalidarCache(produto: Produto, consulta: string): Promise<void> {
  const redis = obterCliente();
  if (!redis) return;
  try {
    await redis.del(chave(produto, consulta));
  } catch {
    /* idem */
  }
}

/** Contador diário por chave de API, usado na quota. */
export async function incrementarContador(nome: string, ttlSegundos: number): Promise<number> {
  const redis = obterCliente();
  if (!redis) return 0; // sem redis não há quota; o limite volta a valer sozinho
  try {
    const valor = await redis.incr(`ampla:quota:${nome}`);
    if (valor === 1) await redis.expire(`ampla:quota:${nome}`, ttlSegundos);
    return valor;
  } catch {
    return 0;
  }
}

export async function fecharCache(): Promise<void> {
  if (cliente) {
    await cliente.quit().catch(() => {});
    cliente = null;
  }
}
