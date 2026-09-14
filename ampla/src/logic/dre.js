/**
 * DRE — Demonstração do Resultado (item do fechamento mensal)
 *
 * Montado a partir do que a empresa realmente exporta:
 *   receita  ← NFs emitidas no mês (item 4: vale a data de emissão)
 *   CMV      ← "valor do custo" do pedido que gerou cada nota
 *   despesas ← contas a pagar, agrupadas pelo PLANO DE CONTAS
 *
 * Duas regras de honestidade valem aqui como em todo o resto:
 *
 *  1. Nada é estimado. Nota cujo pedido não tem custo não recebe um custo
 *     "médio": ela fica de fora do CMV e a cobertura aparece na tela. Um lucro
 *     bruto calculado sobre 60% do faturamento é dito como tal.
 *  2. Nada é contado duas vezes. Se o plano de contas tiver compras de
 *     mercadoria, esse dinheiro já está no CMV; as contas que você marcar como
 *     mercadoria saem das despesas operacionais e aparecem à parte.
 */

import * as store from '../core/store.js';
import { monthKey } from '../core/format.js';
import { cents, sum } from '../core/util.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

const SEM_CLASSIFICACAO = 'Sem plano de contas';

/** Palavras que costumam indicar compra de mercadoria, só para sugerir. */
const PISTAS_MERCADORIA = /mercadoria|revenda|compra de produto|estoque|fornecedor/i;

export async function dre(mes = monthKey(new Date().toISOString().slice(0, 10))) {
  const [nfs, pedidos, pagamentos, cfg] = await Promise.all([
    store.nfs.listar(), store.pedidos.listar(), store.pagar.listar(), store.config(),
  ]);
  const marcadas = new Set((cfg.dre?.contasDeMercadoria || []).map((c) => String(c)));

  const doMes = nfs.filter((nf) => nf.mes === mes && valeParaFaturamento(nf));
  const receitaBruta = cents(sum(doMes, (nf) => valorFaturado(nf)));
  const devolucoes = cents(sum(doMes.filter((nf) => nf.devolucao), (nf) => Math.abs(valorFaturado(nf))));

  const { cmv, cobertura, semCusto } = calcularCmv(doMes, pedidos);
  const lucroBruto = cobertura.completa ? receitaBruta - cmv : null;

  const { grupos, mercadoria, total: despesas } = agruparDespesas(pagamentos, mes, marcadas);

  const resultado = lucroBruto == null ? null : lucroBruto - despesas;

  return {
    mes,
    receita: {
      bruta: receitaBruta,
      devolucoes,
      notas: doMes.length,
    },
    cmv: { valor: cmv, cobertura, semCusto },
    lucroBruto,
    // percentuais em 0-100, como no resto do app (format.pct espera assim)
    margemBruta: lucroBruto != null && receitaBruta ? (lucroBruto / receitaBruta) * 100 : null,
    despesas: { total: despesas, grupos },
    mercadoria,
    resultado,
    margemLiquida: resultado != null && receitaBruta ? (resultado / receitaBruta) * 100 : null,
    avisos: montarAvisos({ cobertura, mercadoria, grupos, marcadas, receitaBruta }),
  };
}

/**
 * O custo de uma nota é o custo do pedido que a gerou. Quando um pedido rendeu
 * mais de uma nota, o custo é dividido na proporção do valor de cada uma — e só
 * quando o pedido informa o valor total, que é o que torna a proporção
 * verificável. Sem isso, a nota fica sem custo em vez de receber um rateio
 * inventado.
 */
function calcularCmv(notas, pedidos) {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const porNumero = new Map(pedidos.filter((p) => p.numero).map((p) => [String(p.numero), p]));

  const notasPorPedido = new Map();
  for (const nf of notas) {
    const pedido = porId.get(nf.pedidoId) || (nf.pedidoNumero ? porNumero.get(String(nf.pedidoNumero)) : null);
    if (!pedido) continue;
    if (!notasPorPedido.has(pedido.id)) notasPorPedido.set(pedido.id, { pedido, notas: [] });
    notasPorPedido.get(pedido.id).notas.push(nf);
  }

  let cmv = 0;
  let faturadoComCusto = 0;
  const semCusto = [];

  for (const nf of notas) {
    const pedido = porId.get(nf.pedidoId) || (nf.pedidoNumero ? porNumero.get(String(nf.pedidoNumero)) : null);
    const valor = valorFaturado(nf);
    if (!pedido || pedido.valorCusto == null) {
      semCusto.push({
        numero: nf.numero, valor, motivo: pedido ? 'o pedido não informa custo' : 'nota sem pedido',
      });
      continue;
    }
    const grupo = notasPorPedido.get(pedido.id);
    const varias = grupo && grupo.notas.length > 1;
    if (varias && !pedido.valorTotal) {
      semCusto.push({
        numero: nf.numero,
        valor,
        motivo: 'o pedido gerou mais de uma nota e não informa o valor total para dividir o custo',
      });
      continue;
    }
    const parte = varias ? valor / pedido.valorTotal : 1;
    cmv += pedido.valorCusto * parte;
    faturadoComCusto += valor;
  }

  const total = cents(sum(notas, (nf) => valorFaturado(nf)));
  return {
    cmv: cents(cmv),
    semCusto,
    cobertura: {
      faturadoComCusto: cents(faturadoComCusto),
      faturadoTotal: total,
      percentual: total ? (faturadoComCusto / total) * 100 : null,
      completa: semCusto.length === 0 && notas.length > 0,
    },
  };
}

/** Contas a pagar do mês (pela data de vencimento), por plano de contas. */
function agruparDespesas(pagamentos, mes, marcadas) {
  const doMes = pagamentos.filter((p) => p.vencimento && monthKey(p.vencimento) === mes);
  const mapa = new Map();
  for (const p of doMes) {
    const nome = (p.categoria || '').trim() || SEM_CLASSIFICACAO;
    if (!mapa.has(nome)) mapa.set(nome, { nome, valor: 0, itens: 0, mercadoria: marcadas.has(nome) });
    const g = mapa.get(nome);
    g.valor += p.valor || 0;
    g.itens += 1;
  }
  const todos = [...mapa.values()].map((g) => ({ ...g, valor: cents(g.valor) }));
  const grupos = todos.filter((g) => !g.mercadoria).sort((a, b) => b.valor - a.valor);
  const compras = todos.filter((g) => g.mercadoria).sort((a, b) => b.valor - a.valor);

  return {
    grupos,
    total: cents(sum(grupos, (g) => g.valor)),
    mercadoria: { grupos: compras, total: cents(sum(compras, (g) => g.valor)) },
  };
}

function montarAvisos({ cobertura, grupos, marcadas, receitaBruta }) {
  const avisos = [];
  if (!receitaBruta) avisos.push({ nivel: 'atencao', texto: 'Nenhuma nota fiscal neste mês. Importe o relatório fiscal.' });

  if (cobertura.faturadoTotal && !cobertura.completa) {
    const pct = Math.round(cobertura.percentual || 0);
    avisos.push({
      nivel: 'atencao',
      texto: `O custo é conhecido em ${pct}% do faturamento. O lucro bruto só aparece quando estiver em 100% — `
        + 'o app não completa custo por estimativa. Importe o relatório de vendas com a coluna VALOR DO CUSTO.',
    });
  }

  const suspeitas = grupos.filter((g) => PISTAS_MERCADORIA.test(g.nome) && !marcadas.has(g.nome));
  if (suspeitas.length) {
    avisos.push({
      nivel: 'atencao',
      texto: `${suspeitas.length === 1 ? 'A conta' : 'As contas'} `
        + `${suspeitas.map((g) => `"${g.nome}"`).join(', ')} `
        + `${suspeitas.length === 1 ? 'parece' : 'parecem'} compra de mercadoria. Se for, marque `
        + 'em "Compra de mercadoria", no fim desta tela: esse custo já entra pelo CMV, e contar '
        + 'duas vezes derruba o resultado do mês sem motivo.',
    });
  }

  const semPlano = grupos.find((g) => g.nome === SEM_CLASSIFICACAO);
  if (semPlano) {
    avisos.push({
      nivel: 'info',
      texto: `${semPlano.itens} conta(s) a pagar sem plano de contas. Elas entram no total, mas não dá para `
        + 'dizer para onde o dinheiro foi.',
    });
  }
  return avisos;
}

/** Os planos de contas já vistos, para você marcar quais são mercadoria. */
export async function planosDeContas() {
  const pagamentos = await store.pagar.listar();
  const mapa = new Map();
  for (const p of pagamentos) {
    const nome = (p.categoria || '').trim();
    if (!nome) continue;
    mapa.set(nome, (mapa.get(nome) || 0) + (p.valor || 0));
  }
  return [...mapa.entries()]
    .map(([nome, valor]) => ({ nome, valor: cents(valor) }))
    .sort((a, b) => b.valor - a.valor);
}

export { SEM_CLASSIFICACAO };
