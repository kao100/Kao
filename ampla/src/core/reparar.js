/**
 * CONSERTO DE UM ERRO QUE JÁ ESTÁ GRAVADO NA BASE.
 *
 * "Eu acabei de mandar o contas a pagar só a partir do dia 17 e o que tá em
 *  aberto, ou seja, não tinha nenhum pago. E não tá calhando, tá aparecendo
 *  zero. E eu sei que não é zero. Tem alguma coisa errada e não é o relatório."
 *
 * Não era o relatório. A leitura da situação do título procurava "pago",
 * "recebid", "baixad" dentro do texto sem olhar a negação na frente — e
 * "NÃO PAGO" CONTÉM "PAGO". Todo título em aberto entrava no app como baixado,
 * com saldo zero, e o fluxo de caixa dava zero com a base cheia de títulos.
 *
 * Corrigir a leitura resolve as PRÓXIMAS importações. Não resolve o que já está
 * gravado — e mandar ela reimportar tudo seria cobrar dela o preço do meu erro,
 * justamente no app que existe para eliminar trabalho administrativo.
 *
 * Felizmente cada título guarda `statusArquivo`: o texto cru que veio na coluna
 * Situação. Então o conserto não precisa de arquivo nenhum — ele relê esse texto
 * com a regra certa.
 *
 * O QUE ELE NÃO TOCA, de propósito:
 *
 *  - título cujo texto de origem realmente diz pago, quitado, recebido;
 *  - título baixado por AUSÊNCIA no relatório (a fotografia funcionando: ele
 *    sumiu do export porque foi pago de verdade no sistema dela);
 *  - título baixado À MÃO por ela aqui dentro;
 *  - título sem `statusArquivo`, porque aí não há texto de origem para reler e
 *    reabri-lo seria adivinhação — exatamente o que o app não faz.
 */

import { openDB } from './db.js';
import { interpretarStatusDoArquivo } from '../logic/ingest.js';

/**
 * A MARCA TEM VERSÃO.
 *
 * O conserto roda uma vez por aparelho — mas quando a REGRA de leitura muda, ele
 * precisa passar outra vez, senão o aparelho que já rodou a versão anterior fica
 * com o erro antigo gravado para sempre. Subir o número é o que faz o conserto
 * alcançar quem já abriu o app.
 *
 * v2: o contas a pagar tinha uma segunda leitura, própria, com o mesmo defeito
 *     da negação ("NÃO PAGO" contém "PAGO"). As duas passaram a usar a mesma.
 */
const MARCA = 'reparo_situacao_negada_v2';
const LOJAS = ['receber', 'pagar'];

/**
 * Roda uma vez por aparelho. Nunca derruba a abertura do app: na dúvida, não
 * mexe em nada e deixa o app abrir.
 *
 * @returns {Promise<{reparou: boolean, reabertos?: number, valor?: number, erro?: string}>}
 */
export async function repararSituacaoNegada() {
  try {
    if (typeof indexedDB === 'undefined') return { reparou: false };
    const db = await openDB();
    if (await jaReparado(db)) return { reparou: false };

    let reabertos = 0;
    let valor = 0;
    for (const loja of LOJAS) {
      const r = await repararLoja(db, loja);
      reabertos += r.reabertos;
      valor += r.valor;
    }
    await marcar(db, { reabertos, valor });
    return { reparou: reabertos > 0, reabertos, valor };
  } catch (err) {
    return { reparou: false, erro: String(err?.message || err) };
  }
}

async function repararLoja(db, loja) {
  const titulos = await todos(db, loja);
  const consertados = [];

  for (const t of titulos) {
    if (t.status !== 'pago') continue;
    if (t.baixadoPorAusencia || t.baixaManual) continue;
    if (!t.statusArquivo) continue;

    /* o texto de origem é relido com a regra certa — sem data e sem saldo, para
       a decisão vir da palavra que o relatório escreveu, e só dela */
    if (interpretarStatusDoArquivo(t.statusArquivo) !== 'aberto') continue;

    consertados.push({
      ...t,
      status: 'aberto',
      saldo: t.valor ?? null,
      valorRecebido: null,
      valorPago: null,
      reabertoPorConserto: true,
    });
  }

  if (consertados.length) await salvarTodos(db, loja, consertados);
  return {
    reabertos: consertados.length,
    valor: consertados.reduce((a, t) => a + (t.valor || 0), 0),
  };
}

/* ------------------------------------------------------------ IndexedDB cru */

function todos(db, loja) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(loja).objectStore(loja).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

function salvarTodos(db, loja, registros) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(loja, 'readwrite');
    const os = tx.objectStore(loja);
    for (const r of registros) os.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
