/**
 * Persistência — IndexedDB puro, sem dependências.
 *
 * Os dados ficam no aparelho: nenhum número financeiro da empresa sai daqui.
 * As telas nunca falam com o IndexedDB direto — usam os repositórios de store.js.
 */

export const DB_NAME = 'ampla-admin';
export const DB_VERSION = 2;

export const STORES = {
  /** configurações, metas, preferências, marcos de atualização */
  kv: { keyPath: 'key', indexes: [] },

  /** documentos fiscais — a base oficial do faturamento */
  nfs: {
    keyPath: 'id',
    indexes: [['byEmissao', 'dataEmissao'], ['byMes', 'mes'], ['byVendedor', 'vendedorId'],
      ['byCliente', 'clienteId'], ['byPedido', 'pedidoNumero'], ['byStatus', 'status']],
  },
  nfItens: {
    keyPath: 'id',
    indexes: [['byNf', 'nfId'], ['byProduto', 'produtoId'], ['byMes', 'mes']],
  },

  /** pedidos de venda — é neles que você define o vendedor */
  pedidos: {
    keyPath: 'id',
    indexes: [['byData', 'data'], ['byVendedor', 'vendedorId'], ['byCliente', 'clienteId']],
  },

  /** orçamentos — para acompanhar conversão */
  orcamentos: {
    keyPath: 'id',
    indexes: [['byData', 'data'], ['byCliente', 'clienteId'], ['byMes', 'mes']],
  },

  vendedores: { keyPath: 'id', indexes: [] },
  clientes: { keyPath: 'id', indexes: [['byDoc', 'documento']] },
  produtos: { keyPath: 'id', indexes: [['byCategoria', 'categoria']] },
  fornecedores: { keyPath: 'id', indexes: [] },

  /** financeiro */
  receber: {
    keyPath: 'id',
    indexes: [['byVencimento', 'vencimento'], ['byCliente', 'clienteId'], ['byNf', 'nfId'], ['byStatus', 'status']],
  },
  pagar: {
    keyPath: 'id',
    indexes: [['byVencimento', 'vencimento'], ['byFornecedor', 'fornecedorId'], ['byStatus', 'status']],
  },
  contas: { keyPath: 'id', indexes: [] },
  extrato: {
    keyPath: 'id',
    indexes: [['byConta', 'contaId'], ['byData', 'data'], ['byConciliacao', 'conciliacaoStatus']],
  },
  saldos: { keyPath: 'id', indexes: [['byConta', 'contaId'], ['byData', 'data']] },

  /** cobrança: um evento por ação (cobrei, retorno, promessa) */
  cobrancas: { keyPath: 'id', indexes: [['byTitulo', 'tituloId'], ['byData', 'data']] },

  /** comissões */
  regrasComissao: { keyPath: 'id', indexes: [] },
  ajustesComissao: { keyPath: 'id', indexes: [['byMes', 'mes'], ['byAlvo', 'alvoId']] },
  periodosComissao: { keyPath: 'mes', indexes: [] },

  /** operação do próprio app */
  importacoes: { keyPath: 'id', indexes: [['byFonte', 'fonte'], ['byData', 'data']] },
  perfisImport: { keyPath: 'id', indexes: [['byFonte', 'fonte']] },
  pendencias: { keyPath: 'id', indexes: [['byTipo', 'tipo'], ['byStatus', 'status']] },
  cenarios: { keyPath: 'id', indexes: [] },
  auditoria: { keyPath: 'id', indexes: [['byData', 'data'], ['byAlvo', 'alvoId']] },
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
    req.onblocked = () => reject(new Error('Banco bloqueado por outra aba aberta do aplicativo.'));
  });
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação cancelada.'));
  });
}

async function tx(storeNames, mode) {
  const db = await openDB();
  return db.transaction(storeNames, mode);
}

export async function get(storeName, key) {
  const t = await tx(storeName, 'readonly');
  return wrap(t.objectStore(storeName).get(key));
}

export async function getAll(storeName) {
  const t = await tx(storeName, 'readonly');
  return wrap(t.objectStore(storeName).getAll());
}

/** Busca por índice: valor exato ou faixa IDBKeyRange. */
export async function getByIndex(storeName, indexName, value) {
  const t = await tx(storeName, 'readonly');
  return wrap(t.objectStore(storeName).index(indexName).getAll(value));
}

export async function getRange(storeName, indexName, from, to) {
  const t = await tx(storeName, 'readonly');
  const range = IDBKeyRange.bound(from, to);
  return wrap(t.objectStore(storeName).index(indexName).getAll(range));
}

export async function put(storeName, value) {
  const t = await tx(storeName, 'readwrite');
  const result = await wrap(t.objectStore(storeName).put(value));
  await done(t);
  return result;
}

export async function putMany(storeName, values) {
  if (!values.length) return 0;
  const t = await tx(storeName, 'readwrite');
  const store = t.objectStore(storeName);
  for (const value of values) store.put(value);
  await done(t);
  return values.length;
}

/** Grava em várias stores dentro de uma única transação (tudo ou nada). */
export async function putBatch(map) {
  const names = Object.keys(map).filter((n) => map[n]?.length);
  if (!names.length) return;
  const t = await tx(names, 'readwrite');
  for (const name of names) {
    const store = t.objectStore(name);
    for (const value of map[name]) store.put(value);
  }
  await done(t);
}

export async function remove(storeName, key) {
  const t = await tx(storeName, 'readwrite');
  await wrap(t.objectStore(storeName).delete(key));
  await done(t);
}

export async function removeMany(storeName, keys) {
  if (!keys.length) return;
  const t = await tx(storeName, 'readwrite');
  const store = t.objectStore(storeName);
  for (const key of keys) store.delete(key);
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

/** Pede ao navegador para não descartar os dados (Safari é agressivo). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* sem suporte */ }
  return false;
}
