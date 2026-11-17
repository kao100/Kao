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
  if (nf.status !== 'autorizada') return false;

  // devolução de COMPRA é nota emitida, mas não é venda nem anti-venda: a AMPLA
  // devolveu mercadoria ao fornecedor. Somá-la como receita (ou como receita
  // negativa) seria inventar um movimento de venda que não houve.
  if (nf.devolucaoDeCompra) return false;

  /**
   * DEVOLUÇÃO DE VENDA ENTRA, MESMO SENDO NOTA DE ENTRADA.
   *
   * Quando o cliente devolve, a empresa emite uma nota de ENTRADA (tpNF=0) para
   * receber a mercadoria de volta — é o certo fiscalmente. Só que a regra "nota
   * de entrada não é faturamento" então engolia a devolução inteira: ela não
   * saía do faturamento e não abatia comissão de ninguém.
   *
   * Nos XMLs de um mês real eram 9 devoluções que não abatiam nada.
   *
   * A exclusão de entrada existe para compra de fornecedor não virar receita, e
   * isso continua: compra tem devolucao=false e segue de fora. Devolução de
   * venda é o ESTORNO de uma receita, e estorno entra negativo.
   */
  if (nf.devolucao) return true;

  if (nf.operacao === 'entrada') return false;
  return true;
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

/**
 * DE QUAL EMPRESA É ESTA NOTA.
 *
 * "Eu tenho mais um CNPJ que acaba entrando na parte de vendas."
 *
 * Nota sem `empresaId` é do CNPJ principal — é o que faz as 1.223 notas que já
 * estão na base continuarem valendo sem migração nenhuma. As digitadas à mão
 * carregam o id da empresa a que pertencem.
 *
 * A regra mora num lugar só porque cinco telas precisam dela e discordar aqui
 * seria o faturamento dando dois números outra vez.
 */
export const EMPRESA_PRINCIPAL = 'principal';

export function empresaDaNota(nf) {
  return nf.empresaId || EMPRESA_PRINCIPAL;
}

/**
 * @param {string} [empresa] id da empresa, 'principal', ou nada/'todas' para
 *   não filtrar. O DRE, o caixa e as compras passam 'principal' de propósito:
 *   os custos, impostos e contas a pagar que chegam por arquivo são só dele, e
 *   somar o faturamento do outro CNPJ ali inflaria margem e EBITDA.
 */
export function daEmpresa(nf, empresa) {
  if (!empresa || empresa === 'todas') return true;
  return empresaDaNota(nf) === empresa;
}

export async function notasDoPeriodo(de, ate, { empresa } = {}) {
  const nfs = await store.nfs.listar();
  return nfs.filter((nf) => nf.dataEmissao >= de && nf.dataEmissao <= ate && daEmpresa(nf, empresa));
}

/**
 * Resumo de faturamento do período, já com a conferência exigida no item 4:
 * faturamento fiscal = soma do que foi atribuído aos vendedores.
 */
export async function resumo({ de, ate, empresa }) {
  const [todas, vendedores] = await Promise.all([
    notasDoPeriodo(de, ate, { empresa }), store.vendedores.listar(),
  ]);
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
    /**
     * QUAIS SÃO ESSAS NOTAS, e não só quantas.
     *
     * "Tem aqui uma aba sem vendedor que vendeu 40. Queria poder ver que notas
     *  são essas, sabe, daí eu consigo ajustar."
     *
     * O cartão dizia o total e parava aí: para chegar às notas ela tinha de ir
     * à conciliação, que recorta por outro critério e não pelo período que ela
     * está olhando. A lista vem junto do número, do mesmo recorte, porque é
     * dali que ela vai agir.
     */
    semVendedor: {
      valor: cents(semVendedorValor),
      notas: semVendedorNotas,
      lista: sortBy(validas.filter((nf) => !nf.vendedorId).map((nf) => ({
        id: nf.id,
        numero: nf.numero,
        dataEmissao: nf.dataEmissao,
        clienteNome: nf.clienteNome || 'cliente não identificado',
        valor: valorFaturado(nf),
        pedidoNumero: nf.pedidoNumero || null,
      })), (nf) => Math.abs(nf.valor), 'desc'),
    },
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
export async function comparar({ de, ate, empresa }) {
  const dias = eachDay(de, ate).length;
  const deAnterior = addDays(de, -dias);
  const ateAnterior = addDays(ate, -dias);
  const [atual, anterior] = await Promise.all([
    resumo({ de, ate, empresa }), resumo({ de: deAnterior, ate: ateAnterior, empresa }),
  ]);
  return {
    atual,
    anterior,
    variacao: anterior.total ? ((atual.total - anterior.total) / anterior.total) * 100 : null,
    periodoAnterior: { de: deAnterior, ate: ateAnterior },
  };
}

/** Detalhe de um vendedor: notas, clientes, produtos. */
/**
 * OS CLIENTES DE CADA VENDEDOR, NUMA PASSADA SÓ.
 *
 * "O relatório já existe dentro da aba comercial e dentro de cada vendedor,
 *  sobre os clientes e o faturamento de cada."
 *
 * Existia — uma tela de cada vez. Para reunir tudo num PDF seria chamar
 * detalheVendedor() uma vez por pessoa, e cada chamada relê todas as notas e
 * todos os itens da base. Sete vendedores, sete leituras da base inteira, no
 * telefone dela. Aqui as notas são lidas uma vez e distribuídas.
 */
export async function clientesPorVendedor({ de, ate, empresa }) {
  const [notas, vendedores] = await Promise.all([
    notasDoPeriodo(de, ate, { empresa }), store.vendedores.listar(),
  ]);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const validas = notas.filter(valeParaFaturamento);

  const porVendedor = new Map();
  for (const nf of validas) {
    const vid = nf.vendedorId || 'sem';
    if (!porVendedor.has(vid)) {
      porVendedor.set(vid, {
        vendedorId: nf.vendedorId || null,
        nome: nf.vendedorId ? (nomeVendedor.get(nf.vendedorId) || 'Vendedor') : 'Sem vendedor',
        total: 0,
        notas: 0,
        clientes: new Map(),
      });
    }
    const v = porVendedor.get(vid);
    const valor = valorFaturado(nf);
    v.total += valor;
    v.notas += 1;

    const k = nf.clienteId || nf.clienteNome || 'sem';
    if (!v.clientes.has(k)) {
      v.clientes.set(k, {
        clienteId: nf.clienteId || null,
        nome: nf.clienteNome || 'Cliente não identificado',
        valor: 0,
        notas: 0,
      });
    }
    const c = v.clientes.get(k);
    c.valor += valor;
    c.notas += 1;
  }

  const totalGeral = cents(sum(validas, valorFaturado));
  return sortBy([...porVendedor.values()].map((v) => ({
    vendedorId: v.vendedorId,
    nome: v.nome,
    total: cents(v.total),
    notas: v.notas,
    ticket: v.notas ? cents(v.total / v.notas) : 0,
    participacao: totalGeral ? (v.total / totalGeral) * 100 : 0,
    clientes: sortBy([...v.clientes.values()].map((c) => ({
      ...c,
      valor: cents(c.valor),
      /* quanto este cliente pesa DENTRO da carteira do vendedor */
      participacao: v.total ? (c.valor / v.total) * 100 : 0,
    })), (c) => c.valor, 'desc'),
  })), (v) => v.total, 'desc');
}

export async function detalheVendedor(vendedorId, { de, ate, empresa }) {
  const [notas, itens, vendedores] = await Promise.all([
    notasDoPeriodo(de, ate, { empresa }), store.nfItens.listar(), store.vendedores.listar(),
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
