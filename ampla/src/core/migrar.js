/**
 * Mudança de nome: AMPLACON → AMPLA.
 *
 * O aplicativo antigo guardava tudo num banco chamado "amplacon-admin". O nome
 * do banco faz parte do endereço do dado: abrir "ampla-admin" não enxerga nada
 * do que estava lá. Quem já tinha importado relatórios veria a tela vazia, como
 * se o trabalho tivesse sumido.
 *
 * Então, na primeira abertura, o que existir no banco antigo é copiado para o
 * novo. O banco antigo NÃO é apagado: se alguma coisa der errado na cópia, o
 * original continua inteiro para tentar de novo.
 */

import { openDB, DB_NAME, STORES } from './db.js';

const NOME_ANTIGO = 'amplacon-admin';
const MARCA = 'migracao_amplacon';

/**
 * Copia o banco antigo para o novo, uma vez só.
 * Nunca derruba a abertura do app: se falhar, o app abre vazio e o dado antigo
 * continua onde estava.
 *
 * @returns {Promise<{migrou: boolean, registros?: number, erro?: string}>}
 */
export async function migrarDoNomeAntigo() {
  try {
    if (typeof indexedDB === 'undefined') return { migrou: false };

    const db = await openDB();
    if (await jaMigrado(db)) return { migrou: false };

    if (!(await bancoAntigoExiste())) return { migrou: false };

    const antigo = await abrirSoSeExistir(NOME_ANTIGO);
    if (!antigo) return { migrou: false };

    try {
      const registros = await copiar(antigo, db);
      await marcar(db, registros);
      return { migrou: registros > 0, registros };
    } finally {
      antigo.close();
    }
  } catch (err) {
    // um app que não abre é pior do que um app sem o histórico antigo
    return { migrou: false, erro: String(err?.message || err) };
  }
}

function jaMigrado(db) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction('kv').objectStore('kv').get(MARCA);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

/**
 * Só vale copiar se o banco antigo realmente existir. Abrir um banco que não
 * existe o CRIA — e aí a migração acharia um banco vazio todo santo dia.
 */
async function bancoAntigoExiste() {
  if (typeof indexedDB.databases !== 'function') return true; // sem a lista, o próprio abrir confere
  const lista = await indexedDB.databases();
  return lista.some((b) => b.name === NOME_ANTIGO);
}

/** Abre sem forçar versão; se vier sem nenhuma store, era um banco novo em folha. */
function abrirSoSeExistir(nome) {
  return new Promise((resolve) => {
    let criado = false;
    const req = indexedDB.open(nome);
    req.onupgradeneeded = () => { criado = true; };
    req.onsuccess = () => {
      const db = req.result;
      if (criado || db.objectStoreNames.length === 0) {
        db.close();
        if (criado) indexedDB.deleteDatabase(nome);
        resolve(null);
        return;
      }
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function copiar(antigo, novo) {
  let total = 0;
  for (const nome of Object.keys(STORES)) {
    if (!antigo.objectStoreNames.contains(nome)) continue;
    const linhas = await lerTudo(antigo, nome);
    if (!linhas.length) continue;
    // o que já está no banco novo manda: nunca sobrescrever trabalho recente
    const existentes = await contar(novo, nome);
    if (existentes > 0) continue;
    await gravar(novo, nome, linhas);
    total += linhas.length;
  }
  return total;
}

const lerTudo = (db, nome) => new Promise((resolve, reject) => {
  const req = db.transaction(nome).objectStore(nome).getAll();
  req.onsuccess = () => resolve(req.result || []);
  req.onerror = () => reject(req.error);
});

const contar = (db, nome) => new Promise((resolve) => {
  try {
    const req = db.transaction(nome).objectStore(nome).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
  } catch { resolve(0); }
});

const gravar = (db, nome, linhas) => new Promise((resolve, reject) => {
  const t = db.transaction(nome, 'readwrite');
  const store = t.objectStore(nome);
  for (const linha of linhas) store.put(linha);
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
});

const marcar = (db, registros) => new Promise((resolve, reject) => {
  const t = db.transaction('kv', 'readwrite');
  t.objectStore('kv').put({
    key: MARCA,
    valor: { de: NOME_ANTIGO, para: DB_NAME, registros, em: Date.now() },
    atualizadoEm: Date.now(),
  });
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
});

export { NOME_ANTIGO, MARCA };
