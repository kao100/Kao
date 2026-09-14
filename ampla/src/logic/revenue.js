/**
 * FATURAMENTO (item 4 do projeto)
 *
 * A base oficial é a NOTA FISCAL EMITIDA, pela DATA DE EMISSÃO — nunca a data
 * do pedido. Pedido de agosto faturado em setembro é faturamento de setembro.
 *
 * Entram: notas de SAÍDA com situação autorizada.
 * Saem:   canceladas, notas de entrada.
 * Devolução entra como valor negativo no mês em que foi emitida.
 */

import * as store from '../core/store.js';
import { monthKey, monthStart, monthEnd, today, yesterday, addDays, addMonths, weekStart, eachDay, formatDate, monthLabel } from '../core/format.js';
import { sum, cents, sortBy } from '../core/util.js';

export function valeParaFaturamento(nf) {
  return nf.status === 'autorizada' && nf.operacao !== 'entrada';
}

/** Valor que a nota soma no faturamento (devolução entra negativa). */
export function valorFaturado(nf) {
  if (!valeParaFaturamento(nf)) return 0;
  return nf.devolucao ? -Math.abs(nf.valorTotal || 0) : (nf.valorTotal || 0);
}

/* --------------------------------------------------------------- períodos */

export const PERIODOS = [
  { id: 'ontem', label: 'Ontem' },
  { id: 'hoje', label: 'Hoje' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'mesAnterior', label: 'Mês anterior' },
  { id: 'ano', label: 'Ano' },
  { id: 'personalizado', label: 'Escolher…' },
];

export function intervalo(periodo, { de, ate } = {}) {
  const hoje = today();
  switch (periodo) {
    case 'hoje': return { de: hoje, ate: hoje, label: 'Hoje' };
    case 'ontem': return { de: yesterday(), ate: yesterday(), label: `Ontem (${formatDate(yesterday(), 'short')})` };
    case 'semana': return { de: weekStart(hoje), ate: hoje, label: 'Esta semana' };
    case 'mesAnterior': {
      const ref = addMonths(hoje, -1);
      return { de: monthStart(ref), ate: monthEnd(ref), label: monthLabel(monthKey(ref)) };
    }
    case 'ano': return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje, label: `Ano de ${hoje.slice(0, 4)}` };
    case 'personalizado': return { de: de || monthStart(), ate: ate || hoje, label: `${formatDate(de)} a ${formatDate(ate)}` };
    case 'mes':
    default: return { de: monthStart(hoje), ate: hoje, label: monthLabel(monthKey(hoje)) };
  }
}

/* ------------------------------------------------------------- consultas */

export async function notasDoPeriodo(de, ate) {
  const nfs = await store.nfs.listar();
  return nfs.filter((nf) => nf.dataEmissao >= de && nf.dataEmissao <= ate);
}

/**
 * Resumo de faturamento do período, já com a conferência exigida no item 4:
 * faturamento fiscal = soma do que foi atribuído aos vendedores.
 */
export async function resumo({ de, ate }) {
  const [todas, vendedores] = await Promise.all([notasDoPeriodo(de, ate), store.vendedores.listar()]);
  const validas = todas.filter(valeParaFaturamento);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));

  const total = cents(sum(validas, valorFaturado));
  const canceladas = todas.filter((nf) => nf.status === 'cancelada');
  const devolucoes = validas.filter((nf) => nf.devolucao);

  const porVendedor = new Map();
  let semVendedorValor = 0;
  let semVendedorNotas = 0;
  for (const nf of validas) {
    const valor = valorFaturado(nf);
    if (!nf.vendedorId) { semVendedorValor += valor; semVendedorNotas += 1; continue; }
    if (!porVendedor.has(nf.vendedorId)) {
      porVendedor.set(nf.vendedorId, { vendedorId: nf.vendedorId, nome: nomeVendedor.get(nf.vendedorId) || 'Vendedor', valor: 0, notas: 0, clientes: new Set() });
    }
    const linha = porVendedor.get(nf.vendedorId);
    linha.valor += valor;
    linha.notas += 1;
    if (nf.clienteId) linha.clientes.add(nf.clienteId);
  }

  const ranking = sortBy([...porVendedor.values()].map((v) => ({
    ...v,
    valor: cents(v.valor),
    clientes: v.clientes.size,
    ticket: v.notas ? cents(v.valor / v.notas) : 0,
    participacao: total ? (v.valor / total) * 100 : 0,
  })), (v) => v.valor, 'desc');

  const clientes = new Set(validas.map((nf) => nf.clienteId).filter(Boolean));
  const atribuido = cents(sum(ranking, (v) => v.valor));

  return {
    de,
    ate,
    total,
    notas: validas.length,
    ticketMedio: validas.length ? cents(total / validas.length) : 0,
    clientes: clientes.size,
    ranking,
    semVendedor: { valor: cents(semVendedorValor), notas: semVendedorNotas },
    canceladas: { quantidade: canceladas.length, valor: cents(sum(canceladas, (n) => n.valorTotal)) },
    devolucoes: { quantidade: devolucoes.length, valor: cents(sum(devolucoes, (n) => Math.abs(n.valorTotal))) },
    conferencia: {
      fiscal: total,
      atribuido,
      diferenca: cents(total - atribuido),
      ok: Math.abs(cents(total - atribuido)) < 0.01,
    },
  };
}

/** Série diária para o gráfico de evolução. */
export async function porDia({ de, ate }) {
  const notas = (await notasDoPeriodo(de, ate)).filter(valeParaFaturamento);
  const mapa = new Map();
  for (const nf of notas) {
    mapa.set(nf.dataEmissao, cents((mapa.get(nf.dataEmissao) || 0) + valorFaturado(nf)));
  }
  return eachDay(de, ate).map((data) => ({ data, valor: mapa.get(data) || 0 }));
}

/** Faturamento acumulado do mês + projeção simples por dias úteis decorridos. */
export async function mesAtual(referencia = today()) {
  const mes = monthKey(referencia);
  const de = monthStart(referencia);
  const r = await resumo({ de, ate: referencia });
  const metaMes = await store.meta(mes);
  const diasDecorridos = Number(referencia.slice(8, 10));
  const diasNoMes = Number(monthEnd(referencia).slice(8, 10));
  return {
    ...r,
    mes,
    meta: metaMes,
    percentualMeta: metaMes ? (r.total / metaMes) * 100 : null,
    falta: metaMes ? cents(metaMes - r.total) : null,
    mediaDiaria: diasDecorridos ? cents(r.total / diasDecorridos) : 0,
    diasDecorridos,
    diasNoMes,
  };
}

/** Faturamento de D-1 — o acompanhamento comercial do dia a dia. */
export async function ontem() {
  const dia = yesterday();
  const r = await resumo({ de: dia, ate: dia });
  const anterior = addDays(dia, -1);
  const rAnterior = await resumo({ de: anterior, ate: anterior });
  return {
    ...r,
    data: dia,
    diaAnterior: rAnterior.total,
    variacao: rAnterior.total ? ((r.total - rAnterior.total) / rAnterior.total) * 100 : null,
  };
}

/** Comparação entre dois períodos do mesmo tamanho (mês x mês anterior). */
export async function comparar({ de, ate }) {
  const dias = eachDay(de, ate).length;
  const deAnterior = addDays(de, -dias);
  const ateAnterior = addDays(ate, -dias);
  const [atual, anterior] = await Promise.all([resumo({ de, ate }), resumo({ de: deAnterior, ate: ateAnterior })]);
  return {
    atual,
    anterior,
    variacao: anterior.total ? ((atual.total - anterior.total) / anterior.total) * 100 : null,
    periodoAnterior: { de: deAnterior, ate: ateAnterior },
  };
}

/** Detalhe de um vendedor: notas, clientes, produtos. */
export async function detalheVendedor(vendedorId, { de, ate }) {
  const [notas, itens, vendedores] = await Promise.all([
    notasDoPeriodo(de, ate), store.nfItens.listar(), store.vendedores.listar(),
  ]);
  const vendedor = vendedores.find((v) => v.id === vendedorId) || null;
  const minhas = notas.filter((nf) => valeParaFaturamento(nf) && nf.vendedorId === vendedorId);
  const ids = new Set(minhas.map((n) => n.id));
  const meusItens = itens.filter((i) => ids.has(i.nfId));

  const porCliente = new Map();
  for (const nf of minhas) {
    const k = nf.clienteId || 'sem';
    if (!porCliente.has(k)) porCliente.set(k, { clienteId: k, nome: nf.clienteNome || 'Cliente não identificado', valor: 0, notas: 0 });
    porCliente.get(k).valor = cents(porCliente.get(k).valor + valorFaturado(nf));
    porCliente.get(k).notas += 1;
  }

  const porProduto = new Map();
  for (const item of meusItens) {
    const k = item.produtoId;
    if (!porProduto.has(k)) porProduto.set(k, { produtoId: k, descricao: item.descricao || item.produtoCodigo, quantidade: 0, valor: 0 });
    const linha = porProduto.get(k);
    linha.quantidade += item.quantidade || 0;
    linha.valor = cents(linha.valor + (item.valorTotal || 0));
  }

  const total = cents(sum(minhas, valorFaturado));
  return {
    vendedor,
    total,
    notas: minhas.map((nf) => ({ ...nf, valor: valorFaturado(nf) })),
    ticket: minhas.length ? cents(total / minhas.length) : 0,
    clientes: sortBy([...porCliente.values()], (c) => c.valor, 'desc'),
    produtos: sortBy([...porProduto.values()], (p) => p.valor, 'desc'),
    porDia: agruparPorDia(minhas),
  };
}

function agruparPorDia(notas) {
  const mapa = new Map();
  for (const nf of notas) mapa.set(nf.dataEmissao, cents((mapa.get(nf.dataEmissao) || 0) + valorFaturado(nf)));
  return sortBy([...mapa.entries()].map(([data, valor]) => ({ data, valor })), (x) => x.data);
}

/** Evolução mês a mês dos últimos N meses (para o gráfico da Visão da Empresa). */
export async function ultimosMeses(quantidade = 6, referencia = today()) {
  const nfs = (await store.nfs.listar()).filter(valeParaFaturamento);
  const mapa = new Map();
  for (const nf of nfs) mapa.set(nf.mes, cents((mapa.get(nf.mes) || 0) + valorFaturado(nf)));
  const saida = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const mes = monthKey(addMonths(referencia, -i));
    saida.push({ mes, valor: mapa.get(mes) || 0, meta: await store.meta(mes) });
  }
  return saida;
}
