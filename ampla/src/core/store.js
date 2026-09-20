/**
 * Repositórios de domínio: as telas conversam com este arquivo, nunca com o
 * IndexedDB direto. Guarda um cache simples em memória — as listas são lidas
 * muitas vezes por tela e invalidadas a cada gravação.
 */

import * as db from './db.js';
import { uid, normalize, key as chaveTexto, digits } from './util.js';
import { today, monthKey } from './format.js';

const cache = new Map();

function invalidate(...stores) {
  if (!stores.length) cache.clear();
  for (const s of stores) cache.delete(s);
}

async function all(store) {
  if (!cache.has(store)) cache.set(store, await db.getAll(store));
  return cache.get(store);
}

export function limparCache() { cache.clear(); }

/* -------------------------------------------------------------- configuração */

export const CONFIG_PADRAO = {
  empresa: 'AMPLA',
  metaMensalPadrao: 0,
  metasPorMes: {},
  /**
   * Dias da semana em que a empresa vende (0 = domingo … 6 = sábado). É o que
   * transforma a meta do mês em meta por dia: dividir por 30 quando não se
   * vende domingo dá um alvo diário mais baixo do que o real.
   */
  diasDeVenda: [1, 2, 3, 4, 5, 6],
  caixa: { alertaAtencao: 20000, alertaCritico: 0 },
  faturamento: {
    // devoluções e cancelamentos sempre saem do faturamento; a data usada é a
    // da emissão da NF (regra do item 4 do projeto)
    descontarDevolucoes: true,
    somenteAutorizadas: true,
  },
  projecao: {
    // títulos vencidos NÃO entram na projeção automaticamente: entram só quando
    // há promessa de pagamento com data (o app não chuta recebimento)
    incluirVencidosSemPromessa: false,
    horizontePadrao: 30,
  },
  comissao: {
    percentualPadrao: 0,
    basePadrao: 'valorProdutos',
    pagarSobreFrete: false,
  },
  dre: {
    // contas do plano de contas que são COMPRA DE MERCADORIA. Elas saem das
    // despesas operacionais porque esse custo já entra pelo CMV — contar as
    // duas coisas derrubaria o resultado sem motivo. Quem marca é você: o app
    // não adivinha o que cada conta significa no seu plano.
    contasDeMercadoria: [],
  },
};

export async function config() {
  const salvo = await db.get('kv', 'config');
  return mergeDeep(structuredClone(CONFIG_PADRAO), salvo?.valor || {});
}

export async function salvarConfig(parcial) {
  const atual = await config();
  const novo = mergeDeep(atual, parcial);
  await db.put('kv', { key: 'config', valor: novo, atualizadoEm: Date.now() });
  return novo;
}

function mergeDeep(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      mergeDeep(base[k], v);
    } else base[k] = v;
  }
  return base;
}

export async function meta(mes = monthKey()) {
  const cfg = await config();
  const especifica = cfg.metasPorMes?.[mes];
  return Number(especifica ?? cfg.metaMensalPadrao) || 0;
}

/* ------------------------------------------------------------------ cadastros */

export const vendedores = repo('vendedores');
export const clientes = repo('clientes');
export const produtos = repo('produtos');
export const fornecedores = repo('fornecedores');
export const contas = repo('contas');

export const nfs = repo('nfs');
export const nfItens = repo('nfItens');
export const pedidos = repo('pedidos');
export const orcamentos = repo('orcamentos');
export const receber = repo('receber');
export const pagar = repo('pagar');
export const extrato = repo('extrato');
export const saldos = repo('saldos');
export const cobrancas = repo('cobrancas');
export const regrasComissao = repo('regrasComissao');
export const ajustesComissao = repo('ajustesComissao');
export const periodosComissao = repo('periodosComissao', 'mes');
export const importacoes = repo('importacoes');
export const perfisImport = repo('perfisImport');
export const pendencias = repo('pendencias');
export const cenarios = repo('cenarios');
export const auditoria = repo('auditoria');

function repo(store, keyPath = 'id') {
  return {
    store,
    listar: () => all(store),
    obter: (id) => db.get(store, id),
    async salvar(item) {
      const value = { ...item };
      if (!value[keyPath]) value[keyPath] = uid();
      await db.put(store, value);
      invalidate(store);
      return value;
    },
    async salvarMuitos(itens) {
      if (!itens.length) return 0;
      await db.putMany(store, itens);
      invalidate(store);
      return itens.length;
    },
    async remover(id) {
      await db.remove(store, id);
      invalidate(store);
    },
    async removerMuitos(ids) {
      await db.removeMany(store, ids);
      invalidate(store);
    },
    async limpar() {
      await db.clearStore(store);
      invalidate(store);
    },
    contar: () => db.count(store),
  };
}

/** Gravação em várias stores numa transação só (usada pela importação). */
export async function salvarLote(map) {
  await db.putBatch(map);
  invalidate(...Object.keys(map));
}

/* --------------------------------------------------- identificação de pessoas */

/**
 * Encontra o vendedor por nome/apelido/código. Devolve null quando não tem
 * certeza — quem chama decide o que fazer (nunca chutar).
 */
export async function acharVendedor(texto) {
  if (!texto) return null;
  const alvo = normalize(texto);
  if (!alvo) return null;
  const lista = await all('vendedores');
  return lista.find((v) => normalize(v.nome) === alvo)
    || lista.find((v) => (v.apelidos || []).some((a) => normalize(a) === alvo))
    || lista.find((v) => v.codigo && normalize(v.codigo) === alvo)
    || null;
}

/** Cria o vendedor se ainda não existir (usado quando o arquivo traz o nome). */
export async function garantirVendedor(nome, extra = {}) {
  const achado = await acharVendedor(nome);
  if (achado) return achado;
  if (!nome || !normalize(nome)) return null;
  const novo = {
    id: `vend_${chaveTexto(nome).slice(0, 24) || uid()}`,
    nome: String(nome).trim(),
    apelidos: [],
    ativo: true,
    criadoEm: Date.now(),
    ...extra,
  };
  await db.put('vendedores', novo);
  invalidate('vendedores');
  return novo;
}

/** Id estável de cliente: CNPJ/CPF quando existir, senão o nome normalizado. */
export function idCliente({ documento, nome, codigo }) {
  const doc = digits(documento);
  if (doc.length >= 11) return `cli_${doc}`;
  if (codigo) return `cli_c${chaveTexto(codigo)}`;
  return `cli_n${chaveTexto(nome).slice(0, 28)}`;
}

export function idFornecedor({ documento, nome }) {
  const doc = digits(documento);
  if (doc.length >= 11) return `for_${doc}`;
  return `for_n${chaveTexto(nome).slice(0, 28) || 'sem'}`;
}

export function idProduto({ codigo, descricao }) {
  if (codigo) return `prod_${chaveTexto(codigo).slice(0, 28)}`;
  return `prod_d${chaveTexto(descricao).slice(0, 28)}`;
}

/* ------------------------------------------------------------------ auditoria */

/** Todo ajuste manual passa por aqui: quem, quando, o quê e por quê. */
export async function registrar(acao, { alvoId, alvo, de, para, motivo } = {}) {
  const evento = {
    id: uid('log'),
    data: today(),
    momento: Date.now(),
    acao,
    alvoId: alvoId || null,
    alvo: alvo || null,
    de: de ?? null,
    para: para ?? null,
    motivo: motivo || null,
    usuario: (await config()).usuario || 'administração',
  };
  await db.put('auditoria', evento);
  invalidate('auditoria');
  return evento;
}

/* -------------------------------------------------------------- marcos de uso */

/** Guarda "até quando" cada fonte está atualizada — usado no selo de integridade. */
export async function marcos() {
  const salvo = await db.get('kv', 'marcos');
  return salvo?.valor || {};
}

export async function marcarAtualizacao(fonteId, info) {
  const atual = await marcos();
  atual[fonteId] = { ...(atual[fonteId] || {}), ...info, em: Date.now() };
  await db.put('kv', { key: 'marcos', valor: atual, atualizadoEm: Date.now() });
  return atual;
}
