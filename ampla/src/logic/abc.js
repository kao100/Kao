/**
 * PRODUTOS / CURVA ABC (item 6 do projeto)
 *
 * Quatro leituras do mesmo estoque de vendas: faturamento, quantidade,
 * nº de clientes e margem. Margem só aparece onde existe custo confiável —
 * produto sem custo fica marcado como "sem custo", nunca com margem estimada.
 */

import * as store from '../core/store.js';
import { addDays, eachDay, monthKey, addMonths } from '../core/format.js';
import { cents, sum, sortBy } from '../core/util.js';

export const CRITERIOS = {
  faturamento: { label: 'Faturamento', sufixo: 'R$', descricao: 'O que mais gera receita.' },
  quantidade: { label: 'Quantidade', sufixo: 'un', descricao: 'O que mais sai.' },
  clientes: { label: 'Clientes', sufixo: 'cli', descricao: 'O que mais gente compra.' },
  margem: { label: 'Margem', sufixo: 'R$', descricao: 'O que realmente dá resultado.' },
};

/** Fatia A = 80% do acumulado, B = até 95%, C = o resto. */
export function classe(acumuladoPercentual) {
  if (acumuladoPercentual <= 80) return 'A';
  if (acumuladoPercentual <= 95) return 'B';
  return 'C';
}

async function itensDoPeriodo(de, ate) {
  const [itens, nfs] = await Promise.all([store.nfItens.listar(), store.nfs.listar()]);
  const validas = new Map(nfs
    .filter((nf) => nf.status === 'autorizada' && nf.operacao !== 'entrada' && nf.dataEmissao >= de && nf.dataEmissao <= ate)
    .map((nf) => [nf.id, nf]));
  return itens
    .filter((i) => validas.has(i.nfId))
    .map((i) => ({ ...i, nf: validas.get(i.nfId), sinal: validas.get(i.nfId).devolucao ? -1 : 1 }));
}

/** Agrupa por produto (ou por categoria) somando tudo que importa. */
export async function agrupar({ de, ate, por = 'produto' }) {
  const [itens, produtos] = await Promise.all([itensDoPeriodo(de, ate), store.produtos.listar()]);
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const mapa = new Map();

  for (const item of itens) {
    const produto = produtoPorId.get(item.produtoId);
    const categoria = produto?.categoriaManual || produto?.categoria || 'Sem categoria';
    const chave = por === 'categoria' ? categoria : item.produtoId;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        produtoId: por === 'produto' ? item.produtoId : null,
        descricao: por === 'categoria' ? categoria : (item.descricao || produto?.descricao || item.produtoCodigo),
        codigo: por === 'produto' ? (item.produtoCodigo || produto?.codigo || null) : null,
        categoria,
        unidade: item.unidade || produto?.unidade || null,
        fornecedor: produto?.fornecedorNome || null,
        quantidade: 0,
        faturamento: 0,
        custo: 0,
        itensComCusto: 0,
        itens: 0,
        clientes: new Set(),
        vendedores: new Set(),
        notas: new Set(),
      });
    }
    const linha = mapa.get(chave);
    const sinal = item.sinal;
    linha.quantidade = cents(linha.quantidade + sinal * (item.quantidade || 0));
    linha.faturamento = cents(linha.faturamento + sinal * (item.valorTotal || 0));
    linha.itens += 1;
    const custo = item.custoTotal != null ? item.custoTotal
      : (produto?.custo != null && item.quantidade != null ? produto.custo * item.quantidade : null);
    if (custo != null) { linha.custo = cents(linha.custo + sinal * custo); linha.itensComCusto += 1; }
    if (item.clienteId) linha.clientes.add(item.clienteId);
    if (item.vendedorId) linha.vendedores.add(item.vendedorId);
    linha.notas.add(item.nfId);
  }

  return [...mapa.values()].map((l) => {
    const custoCompleto = l.itens > 0 && l.itensComCusto === l.itens;
    const margem = custoCompleto ? cents(l.faturamento - l.custo) : null;
    return {
      ...l,
      clientes: l.clientes.size,
      vendedores: l.vendedores.size,
      notas: l.notas.size,
      custo: custoCompleto ? l.custo : null,
      custoParcial: !custoCompleto && l.itensComCusto > 0,
      semCusto: l.itensComCusto === 0,
      margem,
      margemPercentual: margem != null && l.faturamento ? (margem / l.faturamento) * 100 : null,
      precoMedio: l.quantidade ? cents(l.faturamento / l.quantidade) : null,
    };
  });
}

/** Curva ABC por um critério, já com acumulado e classe. */
export async function curva({ de, ate, criterio = 'faturamento', por = 'produto' }) {
  const linhas = await agrupar({ de, ate, por });
  const valorDe = (l) => {
    if (criterio === 'quantidade') return l.quantidade;
    if (criterio === 'clientes') return l.clientes;
    if (criterio === 'margem') return l.margem ?? 0;
    return l.faturamento;
  };

  const elegiveis = criterio === 'margem' ? linhas.filter((l) => l.margem != null) : linhas;
  const ordenadas = sortBy(elegiveis, valorDe, 'desc');
  const total = sum(ordenadas, valorDe);
  let acumulado = 0;

  const resultado = ordenadas.map((linha, i) => {
    const valor = valorDe(linha);
    acumulado += valor;
    const acumuladoPercentual = total ? (acumulado / total) * 100 : 0;
    return {
      ...linha,
      posicao: i + 1,
      valorCriterio: valor,
      participacao: total ? (valor / total) * 100 : 0,
      acumuladoPercentual,
      classe: classe(acumuladoPercentual),
    };
  });

  const semCusto = criterio === 'margem' ? linhas.filter((l) => l.margem == null) : [];
  return {
    criterio,
    por,
    total: criterio === 'quantidade' || criterio === 'clientes' ? total : cents(total),
    linhas: resultado,
    classes: ['A', 'B', 'C'].map((c) => {
      const lista = resultado.filter((l) => l.classe === c);
      return {
        classe: c,
        quantidade: lista.length,
        valor: cents(sum(lista, (l) => l.valorCriterio)),
        participacao: total ? (sum(lista, (l) => l.valorCriterio) / total) * 100 : 0,
      };
    }),
    foraDaAnalise: semCusto.length
      ? { quantidade: semCusto.length, faturamento: cents(sum(semCusto, (l) => l.faturamento)), motivo: 'sem custo cadastrado' }
      : null,
  };
}

/** Ficha completa de um produto. */
export async function detalheProduto(produtoId, { de, ate }) {
  const [itens, produtos, vendedores, clientes] = await Promise.all([
    itensDoPeriodo(de, ate), store.produtos.listar(), store.vendedores.listar(), store.clientes.listar(),
  ]);
  const produto = produtos.find((p) => p.id === produtoId) || null;
  const meus = itens.filter((i) => i.produtoId === produtoId);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]));

  const porCliente = new Map();
  const porVendedor = new Map();
  const porMes = new Map();
  let quantidade = 0;
  let faturamento = 0;
  let custo = 0;
  let comCusto = 0;

  for (const item of meus) {
    const sinal = item.sinal;
    const q = sinal * (item.quantidade || 0);
    const v = sinal * (item.valorTotal || 0);
    quantidade += q;
    faturamento += v;
    const c = item.custoTotal != null ? item.custoTotal
      : (produto?.custo != null && item.quantidade != null ? produto.custo * item.quantidade : null);
    if (c != null) { custo += sinal * c; comCusto += 1; }

    acumular(porCliente, item.clienteId || 'sem', nomeCliente.get(item.clienteId) || item.nf.clienteNome || 'Cliente', q, v);
    if (item.vendedorId) acumular(porVendedor, item.vendedorId, nomeVendedor.get(item.vendedorId) || 'Vendedor', q, v);
    const mes = item.mes || monthKey(item.nf.dataEmissao);
    acumular(porMes, mes, mes, q, v);
  }

  const custoCompleto = meus.length > 0 && comCusto === meus.length;
  const margem = custoCompleto ? cents(faturamento - custo) : null;

  return {
    produto,
    descricao: produto?.descricao || meus[0]?.descricao || produtoId,
    quantidade: cents(quantidade),
    faturamento: cents(faturamento),
    custo: custoCompleto ? cents(custo) : null,
    custoParcial: !custoCompleto && comCusto > 0,
    margem,
    margemPercentual: margem != null && faturamento ? (margem / faturamento) * 100 : null,
    precoMedio: quantidade ? cents(faturamento / quantidade) : null,
    notas: new Set(meus.map((i) => i.nfId)).size,
    clientes: sortBy([...porCliente.values()], (c) => c.valor, 'desc'),
    vendedores: sortBy([...porVendedor.values()], (v) => v.valor, 'desc'),
    evolucao: sortBy([...porMes.values()], (m) => m.chave),
    itens: sortBy(meus.map((i) => ({
      nfId: i.nfId, nfNumero: i.nfNumero, data: i.data || i.nf.dataEmissao,
      cliente: nomeCliente.get(i.clienteId) || i.nf.clienteNome,
      vendedor: i.vendedorId ? nomeVendedor.get(i.vendedorId) : null,
      quantidade: i.quantidade, valorUnitario: i.valorUnitario, valorTotal: i.valorTotal,
    })), (i) => i.data, 'desc'),
  };
}

function acumular(mapa, chave, nome, quantidade, valor) {
  if (!mapa.has(chave)) mapa.set(chave, { chave, nome, quantidade: 0, valor: 0, vezes: 0 });
  const linha = mapa.get(chave);
  linha.quantidade = cents(linha.quantidade + quantidade);
  linha.valor = cents(linha.valor + valor);
  linha.vezes += 1;
}

/** Compara o mesmo produto entre dois períodos do mesmo tamanho. */
export async function compararProduto(produtoId, { de, ate }) {
  const dias = eachDay(de, ate).length;
  const anterior = { de: addDays(de, -dias), ate: addDays(ate, -dias) };
  const [atual, antes] = await Promise.all([
    detalheProduto(produtoId, { de, ate }),
    detalheProduto(produtoId, anterior),
  ]);
  const variacao = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
  return {
    atual,
    anterior: { ...antes, periodo: anterior },
    variacaoFaturamento: variacao(atual.faturamento, antes.faturamento),
    variacaoQuantidade: variacao(atual.quantidade, antes.quantidade),
    variacaoMargem: atual.margem != null && antes.margem != null ? variacao(atual.margem, antes.margem) : null,
  };
}

/** Últimos meses de um produto (gráfico da ficha). */
export async function evolucaoProduto(produtoId, meses = 6, referencia = new Date().toISOString().slice(0, 10)) {
  const de = `${monthKey(addMonths(referencia, -(meses - 1)))}-01`;
  const detalhe = await detalheProduto(produtoId, { de, ate: referencia });
  const mapa = new Map(detalhe.evolucao.map((e) => [e.chave, e]));
  const saida = [];
  for (let i = meses - 1; i >= 0; i -= 1) {
    const mes = monthKey(addMonths(referencia, -i));
    const linha = mapa.get(mes);
    saida.push({ mes, valor: linha?.valor || 0, quantidade: linha?.quantidade || 0 });
  }
  return saida;
}
