/**
 * FAZER OS TÍTULOS GUARDADOS CONCORDAREM COM O QUE O ARQUIVO DIZIA.
 *
 * "Eu reenviei. Esse mesmo arquivo que eu passei para você, eu enviei aqui. Eu
 *  apaguei e reenviei. E não foi."
 *
 * O app mostrava 1232 títulos baixados, afirmando que a coluna Situação dizia
 * isso — sobre linhas em que o arquivo diz, em letras, "Em aberto". Nenhuma
 * versão do código faz isso na importação: aqueles registros foram gravados por
 * uma versão antiga, quando a leitura da situação ainda era a errada, e ficaram
 * ali. Cada conserto novo só alcança o que entra DEPOIS dele, e a base continua
 * contando a história velha.
 *
 * A saída é não depender de quando o registro entrou. Cada título guarda
 * `statusArquivo`: o texto cru que veio na coluna Situação. Relendo esse texto
 * com a regra de hoje, o estado guardado volta a concordar com o arquivo — sem
 * reimportar nada, e de novo a cada vez que a regra melhorar.
 *
 * NOS DOIS SENTIDOS, e isso é o que faz dele um conserto e não um remendo:
 * título que o arquivo diz EM ABERTO volta a abrir; título que o arquivo diz
 * RECEBIDO (no relatório dela, "Confirmado") é baixado. Um conserto que só abre
 * trocaria um erro por outro — inflaria o caixa.
 *
 * O QUE ELE NUNCA TOCA, de propósito:
 *
 *  - título baixado À MÃO por ela aqui dentro: é decisão dela, e o arquivo não
 *    sabe dela;
 *  - título baixado por AUSÊNCIA no relatório seguinte: é a fotografia
 *    funcionando — ele sumiu do export porque foi pago de verdade, e o texto
 *    guardado é de um arquivo mais velho que esse silêncio;
 *  - título sem `statusArquivo`, porque aí não há texto para reler e decidir
 *    qualquer coisa seria adivinhação.
 */

import { openDB } from './db.js';

/**
 * A marca tem versão: quando a REGRA de leitura muda, o conserto precisa passar
 * outra vez, senão o aparelho que já rodou a versão anterior fica com o erro
 * antigo gravado para sempre.
 *
 * v2: o contas a pagar tinha uma segunda leitura, própria, com o mesmo defeito
 *     da negação ("NÃO PAGO" contém "PAGO"). As duas passaram a usar a mesma.
 * v3: "Confirmado" passou a ser lido como recebido, e o conserto passou a
 *     fechar, e não só a reabrir.
 */
const MARCA = 'reparo_situacao_v3';
const LOJAS = ['receber', 'pagar'];

/**
 * Roda uma vez por aparelho, na abertura. Nunca derruba o app: na dúvida, não
 * mexe em nada.
 */
export async function repararSituacaoNegada() {
  try {
    if (typeof indexedDB === 'undefined') return { reparou: false };
    const db = await openDB();
    if (await jaReparado(db)) return { reparou: false };
    const r = await relerSituacoes();
    await marcar(db, r);
    return { ...r, reparou: r.mudados > 0 };
  } catch (err) {
    return { reparou: false, erro: String(err?.message || err) };
  }
}

/**
 * A mesma releitura, a pedido dela, quantas vezes quiser.
 *
 * O automático resolve quem abre o app e nem percebe. Este é para quando ela
 * está olhando um número errado AGORA e quer que ele se acerte na hora — sem
 * apagar nada, sem reimportar, sem depender de eu ter acertado a versão.
 */
export async function relerSituacoes() {
  const { relerSituacoesGravadas } = await import('../logic/ingest.js');
  return relerSituacoesGravadas();
}

/* ------------------------------------------------------------ IndexedDB cru */



function jaReparado(db) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction('kv').objectStore('kv').get(MARCA);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

function marcar(db, resumo) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ key: MARCA, ...resumo, em: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
