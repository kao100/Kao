/**
 * Roteador de consultas — a cascata.
 *
 * A regra é sempre a mesma: resolver a consulta com a fonte mais barata que
 * conseguir responder, e só escalar para a próxima quando a anterior não
 * respondeu. Fonte paga é o último degrau e só é tocada se sobrou pergunta.
 *
 * Dois modos:
 *  - 'primeira': para na primeira fonte que responde (CNPJ, CEP).
 *  - 'agregar':  consulta todas as fontes disponíveis e mescla (compliance,
 *                onde PEP, sanções e dívida ativa são respostas diferentes
 *                para perguntas diferentes).
 */
import { randomUUID } from 'node:crypto';
import { conectoresDe, type ContextoConsulta } from './registry.ts';
import type { Produto, RespostaConsulta, ResultadoFonte } from './types.ts';
import { lerCache, gravarCache } from '../cache/redis.ts';
import { log } from './logger.ts';

export interface OpcoesRoteamento<T> {
  produto: Produto;
  /** Chave de consulta já normalizada (só dígitos, por exemplo). */
  consulta: string;
  finalidade: string;
  modo: 'primeira' | 'agregar';
  /** No modo 'agregar', junta os resultados parciais num objeto só. */
  mesclar?: (parciais: Array<{ fonte: string; dados: T }>) => T | null;
  /** Considera a resposta completa e para a cascata antes das fontes pagas. */
  suficiente?: (dados: T) => boolean;
  usarCache?: boolean;
  camposDesejados?: string[];
  /** Ignora conectores específicos (usado para consulta sem fonte paga). */
  excluirFontes?: string[];
}

const TEMPO_LIMITE_FONTE_MS = 15_000;

async function comTempoLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error('tempo limite excedido')), ms);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

export async function rotear<T>(opcoes: OpcoesRoteamento<T>): Promise<RespostaConsulta<T>> {
  const {
    produto,
    consulta,
    finalidade,
    modo,
    mesclar,
    suficiente,
    usarCache = true,
    camposDesejados,
    excluirFontes = [],
  } = opcoes;

  const consultaId = randomUUID();
  const inicio = Date.now();

  if (usarCache) {
    const doCache = await lerCache<T>(produto, consulta);
    if (doCache !== null) {
      return {
        produto,
        consulta,
        encontrado: true,
        dados: doCache,
        origem: 'cache',
        fontes: [],
        custoTotalCentavos: 0,
        latenciaTotalMs: Date.now() - inicio,
        consultaId,
      };
    }
  }

  const contexto: ContextoConsulta = { consultaId, finalidade, camposDesejados };
  const relatorio: ResultadoFonte[] = [];
  const parciais: Array<{ fonte: string; dados: T }> = [];
  let custoTotal = 0;

  for (const conector of conectoresDe(produto)) {
    if (excluirFontes.includes(conector.id)) continue;

    const estado = conector.disponivel();
    if (!estado.ok) {
      relatorio.push({
        fonte: conector.id,
        ok: false,
        motivo: estado.motivo,
        detalhe: estado.detalhe,
        custoCentavos: 0,
        latenciaMs: 0,
      });
      continue;
    }

    const inicioFonte = Date.now();
    try {
      const dados = await comTempoLimite(
        conector.consultar(consulta, contexto) as Promise<T | null>,
        TEMPO_LIMITE_FONTE_MS,
      );
      const latenciaMs = Date.now() - inicioFonte;

      if (dados === null) {
        relatorio.push({
          fonte: conector.id,
          ok: false,
          motivo: 'nao_encontrado',
          // Fonte que não achou nada não costuma ser cobrada; quando o
          // fornecedor cobrar por "sem retorno", ajuste no próprio conector.
          custoCentavos: 0,
          latenciaMs,
        });
        continue;
      }

      custoTotal += conector.custoCentavos;
      relatorio.push({
        fonte: conector.id,
        ok: true,
        custoCentavos: conector.custoCentavos,
        latenciaMs,
      });
      parciais.push({ fonte: conector.id, dados });

      if (modo === 'primeira') break;
      if (suficiente && mesclar) {
        const ateAgora = mesclar(parciais);
        if (ateAgora && suficiente(ateAgora)) break;
      }
    } catch (erro) {
      relatorio.push({
        fonte: conector.id,
        ok: false,
        motivo: 'fonte_indisponivel',
        detalhe: erro instanceof Error ? erro.message : String(erro),
        custoCentavos: 0,
        latenciaMs: Date.now() - inicioFonte,
      });
      log.warn('fonte falhou', {
        conector: conector.id,
        consultaId,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  const dados =
    parciais.length === 0
      ? null
      : modo === 'primeira'
        ? parciais[0]!.dados
        : (mesclar?.(parciais) ?? parciais[0]!.dados);

  if (dados !== null && usarCache) {
    await gravarCache(produto, consulta, dados);
  }

  return {
    produto,
    consulta,
    encontrado: dados !== null,
    dados,
    origem: dados !== null ? 'fonte' : 'nenhuma',
    fontes: relatorio,
    custoTotalCentavos: custoTotal,
    latenciaTotalMs: Date.now() - inicio,
    consultaId,
  };
}
