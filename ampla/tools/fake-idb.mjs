/**
 * IndexedDB de mentira, só para rodar a lógica fora do navegador (tools/teste.mjs).
 * Implementa exatamente o pedaço da API que core/db.js usa.
 */

class Req {
  constructor(executar) {
    this.result = undefined;
    this.onsuccess = null;
    this.onerror = null;
    queueMicrotask(() => {
      try {
        this.result = executar();
        this.onsuccess?.();
      } catch (err) {
        this.error = err;
        this.onerror?.();
      }
    });
  }
}

class FakeIndex {
  constructor(store, keyPath) { this.store = store; this.keyPath = keyPath; }

  getAll(consulta) {
    return new Req(() => [...this.store.dados.values()].filter((registro) => {
      const valor = registro[this.keyPath];
      if (consulta == null) return true;
      if (consulta instanceof FakeRange) return valor >= consulta.lower && valor <= consulta.upper;
      return valor === consulta;
    }));
  }
}

class FakeRange {
  constructor(lower, upper) { this.lower = lower; this.upper = upper; }
}

class FakeStore {
  constructor(nome, keyPath) {
    this.name = nome;
    this.keyPath = keyPath;
    this.dados = new Map();
    this.indexes = new Map();
    this.indexNames = { contains: (n) => this.indexes.has(n) };
  }

  createIndex(nome, keyPath) { this.indexes.set(nome, keyPath); }
  index(nome) { return new FakeIndex(this, this.indexes.get(nome)); }

  put(valor) {
    return new Req(() => {
      const chave = valor[this.keyPath];
      this.dados.set(chave, structuredClone(valor));
      return chave;
    });
  }

  get(chave) { return new Req(() => structuredClone(this.dados.get(chave))); }
  getAll() { return new Req(() => [...this.dados.values()].map((v) => structuredClone(v))); }
  delete(chave) { return new Req(() => { this.dados.delete(chave); }); }
  clear() { return new Req(() => { this.dados.clear(); }); }
  count() { return new Req(() => this.dados.size); }
}

class FakeTransaction {
  constructor(db, nomes) {
    this.db = db;
    this.nomes = nomes;
    this.onerror = null;
    this.onabort = null;
    this._completo = false;
    this._aoCompletar = null;
    // conclui depois das operações já agendadas nos microtasks
    queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => {
      this._completo = true;
      this._aoCompletar?.();
    })));
  }

  // o código real assina oncomplete depois de await: se já concluiu, dispara na hora
  set oncomplete(fn) {
    this._aoCompletar = fn;
    if (this._completo && fn) queueMicrotask(fn);
  }

  get oncomplete() { return this._aoCompletar; }

  objectStore(nome) { return this.db.stores.get(nome); }
}

class FakeDB {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = { contains: (n) => this.stores.has(n) };
  }

  createObjectStore(nome, { keyPath }) {
    const store = new FakeStore(nome, keyPath);
    this.stores.set(nome, store);
    return store;
  }

  transaction(nomes) {
    return new FakeTransaction(this, Array.isArray(nomes) ? nomes : [nomes]);
  }
}

/** Instala o banco de mentira nos globais. */
export function instalar() {
  const db = new FakeDB();
  globalThis.indexedDB = {
    open() {
      const req = {
        result: db,
        transaction: { objectStore: (nome) => db.stores.get(nome) },
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  globalThis.IDBKeyRange = { bound: (a, b) => new FakeRange(a, b) };
  return db;
}
