/**
 * SINCRONIZAÇÃO — o mesmo app, a mesma base, em todos os aparelhos.
 *
 * "Enviamos os documentos pelo PC, mas não conseguimos ter a mesma visão
 *  quando entramos pelo celular. Quero a sincronização de verdade."
 *
 * COMO FUNCIONA, e por que assim:
 *
 * A base inteira vira UM arquivo comprimido (270 KB na base real dela) e esse
 * arquivo mora na conta Google dela. Quem importa envia; quem abre, busca. Não
 * há mescla de registro a registro — e isso é escolha, não preguiça:
 *
 *   • Só uma pessoa importa. "Só eu importo, os outros olham." Com um escritor
 *     só, mesclar não resolve nada que o retrato inteiro não resolva, e abre uma
 *     porta enorme para erro silencioso: uma nota que existe num aparelho e não
 *     no outro sumindo ou duplicando, sem ninguém saber qual lado está certo.
 *   • O retrato inteiro é conferível. Ou o aparelho tem a base de 5 de outubro
 *     às 14h32, ou não tem. Não existe meio-termo para investigar.
 *
 * QUEM GANHA QUANDO OS DOIS MUDARAM. O aparelho avisa e deixa ela escolher. O
 * app NÃO escolhe sozinho: jogar fora trabalho de alguém sem perguntar é o tipo
 * de coisa que só se descobre um mês depois, quando o número não fecha.
 *
 * O TRANSPORTE É TROCÁVEL. Esta camada não sabe o que é Google Drive — ela pede
 * "guarde este arquivo" e "me devolva o arquivo". É o que permite testar toda a
 * decisão de sincronia sem rede nenhuma, e trocar de serviço um dia sem mexer
 * aqui.
 */

import * as store from '../core/store.js';
import { montarSnapshot, comprimir, descomprimir, validarSnapshot, restaurarSnapshot, contarRegistros } from './backup.js';

let transporte = null;

/** @param {object} t  { nome, conectado, conectar, desconectar, metadados, enviar, baixar } */
export function definirTransporte(t) { transporte = t; }
export function transporteAtual() { return transporte; }

/** Um nome para este aparelho, para a tela poder dizer "enviado pelo computador". */
export async function nomeDoAparelho() {
  const cfg = await store.config();
  if (cfg.nuvem?.aparelho) return cfg.nuvem.aparelho;
  const ua = typeof navigator === 'undefined' ? '' : (navigator.userAgent || '');
  const palpite = /iPhone|iPad|Android|Mobile/i.test(ua) ? 'celular' : 'computador';
  await store.salvarConfig({ nuvem: { aparelho: palpite } });
  return palpite;
}

/**
 * O QUE ESTE APARELHO TEM, E O QUE A NUVEM TEM.
 *
 * Três datas respondem tudo:
 *   carimbo  — a data do retrato que este aparelho está usando
 *   mudanca  — a última vez que alguém mexeu na base DAQUI
 *   nuvem    — a data do retrato que está guardado lá
 */
export async function estado() {
  const [local, mudanca] = await Promise.all([store.estadoNuvem(), store.mudancaLocal()]);
  const base = {
    ligado: !!transporte,
    servico: transporte?.nome || null,
    conectado: false,
    carimbo: local.carimbo || 0,
    conta: local.conta || null,
    mudanca,
    // há coisa daqui que a nuvem ainda não viu?
    enviarPendente: !!mudanca && mudanca > (local.carimbo || 0),
    remoto: null,
    buscarPendente: false,
    conflito: false,
    erro: null,
  };
  if (!transporte) return base;

  try {
    base.conectado = await transporte.conectado();
    if (!base.conectado) return base;
    const remoto = await transporte.metadados();
    base.remoto = remoto;
    if (remoto?.atualizadoEm) {
      base.buscarPendente = remoto.atualizadoEm > (local.carimbo || 0);
      // os dois mexeram desde o último encontro: quem ganha é ela quem diz
      base.conflito = base.buscarPendente && base.enviarPendente;
    }
  } catch (e) {
    base.erro = e.message;
  }
  return base;
}

/** Manda a base deste aparelho para a nuvem. */
export async function enviar() {
  if (!transporte) throw new Error('Sincronização não está configurada.');
  const dispositivo = await nomeDoAparelho();
  const snapshot = await montarSnapshot({ dispositivo });
  const { blob } = await comprimir(snapshot);
  const resposta = await transporte.enviar(blob, {
    atualizadoEm: snapshot.em,
    dispositivo,
    registros: contarRegistros(snapshot),
  });
  const carimbo = resposta?.atualizadoEm || snapshot.em;
  await store.salvarEstadoNuvem({
    carimbo,
    em: Date.now(),
    arquivoId: resposta?.arquivoId || null,
    conta: resposta?.conta || null,
  });
  return { carimbo, registros: contarRegistros(snapshot), tamanho: blob.size };
}

/**
 * Traz a base da nuvem e põe no lugar da daqui.
 *
 * O retrato só entra depois de lido e validado por inteiro: se o download vier
 * truncado ou o arquivo não for nosso, nada é apagado. Apagar primeiro e
 * descobrir o problema depois deixaria o aparelho sem base nenhuma.
 */
/**
 * @param {object} [opcoes]
 * @param {Function} [opcoes.aoRestaurar]  refaz os vínculos antes de carimbar
 *
 * O REFAZER OS VÍNCULOS ACONTECE DENTRO DESTA FUNÇÃO, de propósito.
 *
 * Restaurar grava milhares de registros, e logo depois o app recalcula vínculos
 * e pendências — que também gravam. Se o carimbo fosse posto antes disso, o
 * aparelho terminaria a busca achando que tem novidade para devolver, e mandaria
 * de volta para a nuvem uma cópia do que acabou de receber. Dois aparelhos
 * fazendo isso ficam se empurrando para sempre.
 *
 * O recálculo é determinístico: a partir da mesma base ele chega no mesmo lugar.
 * Então ele faz parte de "receber o retrato", e o carimbo só vem depois dele.
 */
export async function buscar({ aoRestaurar } = {}) {
  if (!transporte) throw new Error('Sincronização não está configurada.');
  const { blob, atualizadoEm, arquivoId, conta } = await transporte.baixar();
  const conteudo = validarSnapshot(JSON.parse(await descomprimir(blob)));
  const r = await restaurarSnapshot(conteudo);
  if (aoRestaurar) await aoRestaurar();

  const carimbo = atualizadoEm || conteudo.em || Date.now();
  const mudanca = await store.mudancaLocal();
  await store.salvarEstadoNuvem({
    // o que o recálculo escreveu veio deste retrato, não é novidade a devolver
    carimbo: Math.max(carimbo, mudanca),
    em: Date.now(),
    arquivoId: arquivoId || null,
    conta: conta || null,
  });
  return { registros: r.registros, de: conteudo.dispositivo || null, em: conteudo.em || null };
}

/**
 * O passo automático: faz o que não tem dúvida e para quando tem.
 *
 * - nuvem mais nova e nada daqui para enviar  → busca
 * - coisa daqui para enviar e nuvem parada    → envia
 * - os dois mudaram                            → NÃO decide, devolve 'conflito'
 * - nada a fazer                               → 'nada'
 */
export async function sincronizar({ podeEnviar = true, podeBuscar = true, aoRestaurar } = {}) {
  const e = await estado();
  if (!e.ligado) return { acao: 'desligado', estado: e };
  if (!e.conectado) return { acao: 'desconectado', estado: e };
  if (e.erro) return { acao: 'erro', erro: e.erro, estado: e };
  if (e.conflito) return { acao: 'conflito', estado: e };

  if (e.buscarPendente && podeBuscar) {
    const r = await buscar({ aoRestaurar });
    return { acao: 'buscou', ...r, estado: e };
  }
  if (e.enviarPendente && podeEnviar) {
    const r = await enviar();
    return { acao: 'enviou', ...r, estado: e };
  }
  return { acao: 'nada', estado: e };
}

/** Desliga a sincronização neste aparelho. A base local fica onde está. */
export async function esquecer() {
  if (transporte?.desconectar) await transporte.desconectar();
  await store.salvarEstadoNuvem({ carimbo: 0, em: 0, arquivoId: null, conta: null });
}
