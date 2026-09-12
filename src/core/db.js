/**
 * Persistência — IndexedDB puro (sem dependências).
 *
 * Todo o histórico do usuário vive aqui. As telas nunca falam com o IndexedDB
 * diretamente: usam os repositórios em core/store.js.
 */

export const DB_NAME = 'kao-training';
export const DB_VERSION = 3;

/** Definição das object stores e seus índices. */
export const STORES = {
  kv: { keyPath: 'key', indexes: [] },
  exercises: { keyPath: 'id', indexes: [['byGroup', 'muscleGroup']] },
  templates: { keyPath: 'id', indexes: [['byDay', 'dayKey']] },
  sessions: { keyPath: 'id', indexes: [['byDate', 'date'], ['byTemplate', 'templateId']] },
  sets: { keyPath: 'id', indexes: [['bySession', 'sessionId'], ['byExercise', 'exerciseId'], ['byDate', 'date']] },
  cardio: { keyPath: 'id', indexes: [['byDate', 'date']] },
  football: { keyPath: 'id', indexes: [['byDate', 'date']] },
  measurements: { keyPath: 'id', indexes: [['byDate', 'date']] },
  photos: { keyPath: 'id', indexes: [['byDate', 'date'], ['byPose', 'pose']] },
  painLogs: { keyPath: 'id', indexes: [['byDate', 'date']] },
  recovery: { keyPath: 'id', indexes: [['byDate', 'date']] },
  medical: { keyPath: 'id', indexes: [['byDate', 'date']] },
  equipment: { keyPath: 'id', indexes: [['byExercise', 'exerciseId']] },
  supplements: { keyPath: 'id', indexes: [] },
  nutrition: { keyPath: 'id', indexes: [['byDate', 'date']] },
  dailyLog: { keyPath: 'date', indexes: [] },
  achievements: { keyPath: 'id', indexes: [['byDate', 'date'], ['byExercise', 'exerciseId']] },
  dayPlan: { keyPath: 'date', indexes: [] },
  // alimentação: um registro por alimento consumido, e a tabela de alimentos
  meals: { keyPath: 'id', indexes: [['byDate', 'date'], ['byFood', 'foodId']] },
  foods: { keyPath: 'id', indexes: [['byGroup', 'group']] },
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        const store = db.objectStoreNames.contains(name)
          ? req.transaction.objectStore(name)
          : db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [idxName, idxKey] of def.indexes) {
          if (!store.indexNames.contains(idxName)) store.createIndex(idxName, idxKey, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba aberta.'));
  });
  return dbPromise;
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(storeName, value) {
  const t = await tx(storeName, 'readwrite');
  const result = await wrap(t.objectStore(storeName).put(value));
  await done(t);
  return result;
}

export async function putMany(storeName, values) {
  if (!values.length) return;
  const t = await tx(storeName, 'readwrite');
  const store = t.objectStore(storeName);
  for (const v of values) store.put(v);
  await done(t);
}

export async function get(storeName, key) {
  const t = await tx(storeName, 'readonly');
  return wrap(t.objectStore(storeName).get(key));
}

export async function getAll(storeName) {
  const t = await tx(storeName, 'readonly');
  return wrap(t.objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, query) {
  const t = await tx(storeName, 'readonly');
  return wrap(t.objectStore(storeName).index(indexName).getAll(query));
}

export async function remove(storeName, key) {
  const t = await tx(storeName, 'readwrite');
  await wrap(t.objectStore(storeName).delete(key));
  await done(t);
}

export async function clearStore(storeName) {
  const t = await tx(storeName, 'readwrite');
  await wrap(t.objectStore(storeName).clear());
  await done(t);
}

export async function count(storeName) {
  const t = await tx(storeName, 'readonly');
  return wrap(t.objectStore(storeName).count());
}

function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Solicita armazenamento persistente para o Safari/Chrome não descartarem os dados. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch { /* ignorado */ }
  return false;
}

export async function storageEstimate() {
  try {
    const est = await navigator.storage?.estimate?.();
    return est || null;
  } catch { return null; }
}

/** Apaga o banco inteiro (usado apenas na restauração de backup). */
export async function deleteDatabase() {
  const db = await openDB();
  db.close();
  dbPromise = null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
