/**
 * A COLA ENTRE A SINCRONIZAÇÃO E O APP.
 *
 * Mora fora das telas porque duas coisas diferentes precisam dela: Ajustes, onde
 * ela liga e confere, e a abertura do app, que busca sozinha quando a nuvem tem
 * coisa mais nova.
 */

import * as store from '../core/store.js';
import * as nuvem from '../logic/nuvem.js';
import { transporteDrive } from '../core/nuvem/drive.js';
import { recalcular } from '../logic/link.js';
import { formatDate, timestampLabel } from '../core/format.js';

let ligado = false;

/**
 * Liga o transporte com o Client ID que ela guardou. Não faz login nenhum: só
 * deixa o app pronto para, quando ela mandar, falar com o Drive.
 */
export async function ligarNuvem() {
  const cfg = await store.config();
  const clientId = cfg.nuvem?.clientId;
  if (!clientId) { nuvem.definirTransporte(null); ligado = false; return false; }
  if (!ligado) {
    nuvem.definirTransporte(transporteDrive(clientId));
    ligado = true;
  }
  return true;
}

/** Desliga e esquece — a base local continua inteira. */
export async function desligarNuvem() {
  await nuvem.esquecer();
  await store.salvarConfig({ nuvem: { clientId: null } });
  nuvem.definirTransporte(null);
  ligado = false;
}

/**
 * O passo automático da abertura do app.
 *
 * SÓ BUSCA, NUNCA ENVIA. Abrir o app não é motivo para publicar nada: se este
 * aparelho tem alguma coisa a mais, quem decide mandar é ela, no botão. Assim
 * abrir o app no celular nunca sobrescreve o trabalho do computador.
 */
export async function sincronizarAoAbrir() {
  if (!(await ligarNuvem())) return { acao: 'desligado' };
  try {
    return await nuvem.sincronizar({
      podeEnviar: false,
      aoRestaurar: () => recalcular(),
    });
  } catch (e) {
    return { acao: 'erro', erro: e.message };
  }
}

/** O estado em uma frase, que é o que a tela mostra. */
export function descreverEstadoNuvem(e) {
  if (!e.ligado) return 'Desligada — este aparelho não conversa com a nuvem.';
  if (e.erro) return `Erro ao falar com o ${e.servico}: ${e.erro}`;
  if (!e.conectado) return `Pronta, mas sem login no ${e.servico} nesta sessão.`;
  if (e.conflito) {
    return 'Os dois lados mudaram desde o último encontro. Escolha qual vale: '
      + 'enviar o deste aparelho, ou buscar o da nuvem.';
  }
  if (e.buscarPendente) {
    return `A nuvem tem uma versão mais nova${e.remoto?.dispositivo ? ` (enviada pelo ${e.remoto.dispositivo})` : ''}.`;
  }
  if (e.enviarPendente) return 'Este aparelho tem mudanças que a nuvem ainda não recebeu.';
  if (e.carimbo) return `Em dia — última sincronização em ${timestampLabel(e.carimbo)}.`;
  return 'Ligada, e ainda sem nenhum envio.';
}

/** Para o rótulo curto do cartão. */
export function corDoEstado(e) {
  if (!e.ligado || e.erro) return 'atencao';
  if (e.conflito) return 'ruim';
  if (e.buscarPendente || e.enviarPendente) return 'info';
  return 'ok';
}

export { formatDate };
