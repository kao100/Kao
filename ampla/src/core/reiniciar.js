/**
 * RECOMEÇAR DO ZERO — uma vez só, na próxima abertura.
 *
 * Os dados do app moram no aparelho, não num servidor: não há como apagá-los
 * de fora. Então quem apaga é o próprio app, na primeira vez que abrir depois
 * desta atualização.
 *
 * A empresa pediu para descartar tudo o que foi mandado nos primeiros testes e
 * começar limpo, com o aplicativo inteiro do jeito que ficou. É isso que este
 * arquivo faz, e só isso:
 *
 *  • apaga todas as tabelas, inclusive as configurações;
 *  • apaga também o banco antigo do AMPLACON, para ele não voltar pela
 *    migração no próximo recálculo;
 *  • deixa a marca do recomeço gravada, para não apagar nada de novo — o que
 *    ela importar a partir de agora fica.
 *
 * Depois disso, semear() recria o que é de fábrica: as contas bancárias e as
 * regras de comissão (2% padrão, 0,5% no cimento).
 */

import { openDB, STORES, clearStore, put } from './db.js';
import { NOME_ANTIGO, MARCA as MARCA_MIGRACAO } from './migrar.js';

/**
 * Trocar esta marca dispara UM novo recomeço em todos os aparelhos. Só mude
 * quando a intenção for mesmo apagar os dados de quem já está usando.
 */
export const MARCA = 'recomeco-2026-09-21';

/**
 * @returns {Promise<{reiniciou: boolean, erro?: string}>}
 */
export async function reiniciarSePreciso() {
  try {
    if (typeof indexedDB === 'undefined') return { reiniciou: false };

    const db = await openDB();
    if (await jaFeito(db)) return { reiniciou: false };

    for (const nome of Object.keys(STORES)) {
      await clearStore(nome);
    }

    // o banco antigo sairia da migração e traria tudo de volta
    await apagarBanco(NOME_ANTIGO);

    await put('kv', { key: MARCA_MIGRACAO, valor: { pulado: true, em: Date.now() }, atualizadoEm: Date.now() });
    await put('kv', { key: 'reinicio', valor: MARCA, em: Date.now() });

    return { reiniciou: true };
  } catch (err) {
    // um app que não abre é pior do que um app com dado velho
    return { reiniciou: false, erro: String(err?.message || err) };
  }
}

function jaFeito(db) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction('kv').objectStore('kv').get('reinicio');
      req.onsuccess = () => resolve(req.result?.valor === MARCA);
      req.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

function apagarBanco(nome) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(nome);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch { resolve(false); }
  });
}
