/**
 * DRE COMERCIAL — o que sobra da venda, antes de qualquer despesa.
 *
 * "Da aba comercial, o que eu acrescentaria que você não tem é as vendas
 *  líquidas, ou seja, base para margem, CMV sobre líquida, porcentagem de lucro
 *  bruto você já tem, e CMV custo. É tipo um DRE. Comercial."
 *
 * A conta é a da tela Margem, escrita de cima para baixo. E é de propósito que
 * ela saia da MESMA função: faturamento aqui e faturamento lá têm de ser o
 * mesmo número, senão volta o problema que ela apontou — "o faturamento num
 * jeito tá num lugar e no outro tá em outro".
 *
 *   vendas brutas            NFs emitidas, sem as devoluções
 *   − devoluções             estorno de venda, pela data da nota de entrada
 *   = faturamento            o número da tela Hoje
 *   − frete cobrado          sai da base: a margem é só da mercadoria
 *   − notas sem item         o app não sabe o que foi vendido nelas
 *   = vendas líquidas        A BASE DA MARGEM
 *   − CMV                    custo da mercadoria vendida
 *   = lucro bruto
 *
 * O frete sai da base porque ela decidiu assim, e com razão: "o frete, ao mesmo
 * tempo que a gente tem cobrado ele, a gente tem o custo dele também, e você
 * não sabe o custo total do frete". O que o frete rende fica na tela Margem, em
 * cobrado × pago, que é a pergunta que tem resposta.
 */

import * as store from '../core/store.js';
import { cents, sum } from '../core/util.js';
import * as revenue from './revenue.js';
import { margem } from './margem.js';

export async function dreComercial({ de, ate }) {
  const [r, m, itens] = await Promise.all([
    revenue.resumo({ de, ate }), margem({ de, ate }), store.nfItens.listar(),
  ]);

  const devolucoes = r.devolucoes.valor;
  const faturamento = r.total;
  const brutas = cents(faturamento + devolucoes);

  const freteCobrado = m.frete?.total || 0;
  const semItens = m.faturamento.semItens;
  const liquidas = m.faturamento.mercadoria;
  /**
   * O que a decomposição não explica. Não é zero por construção — nota pode ter
   * desconto no total que não está nos itens, IPI, ST. Fica à vista em vez de
   * virar diferença silenciosa entre duas telas.
   */
  const naoExplicado = cents(faturamento - liquidas - freteCobrado - semItens.valor);

  const cmv = m.total.custo;
  const lucroBruto = m.total.lucro;

  const doPeriodo = itens.filter((i) => i.data && i.data >= de && i.data <= ate);
  const produtos = new Set(doPeriodo.map((i) => i.produtoId).filter(Boolean));

  const sobre = (v) => (liquidas ? (Math.abs(v) / liquidas) * 100 : null);

  return {
    periodo: { de, ate },
    vendasBrutas: brutas,
    devolucoes: { valor: devolucoes, quantidade: r.devolucoes.quantidade },
    faturamento,
    freteCobrado,
    semItens,
    naoExplicado,
    vendasLiquidas: liquidas,
    cmv,
    lucroBruto,
    percentualCmv: sobre(cmv),
    percentualLucroBruto: m.total.margem,
    notas: r.notas,
    clientes: r.clientes,
    ticketMedio: r.ticketMedio,
    itensVendidos: { linhas: doPeriodo.length, produtos: produtos.size },
    canceladas: r.canceladas,
    cobertura: m.conferencia?.coberturaDeCusto || null,
    fonte: m.fonte,
    confiavel: m.margemConfiavel,
    /**
     * A conferência que impede o erro de antes: os dois caminhos até o
     * faturamento têm de dar o mesmo número. Se um dia não derem, a tela diz.
     */
    conferencia: {
      pelasNotas: faturamento,
      pelaMargem: m.faturamento.total,
      diferenca: cents(faturamento - m.faturamento.total),
      ok: Math.abs(cents(faturamento - m.faturamento.total)) < 0.01,
    },
    avisos: montarAvisos({ liquidas, cmv, cobertura: m.conferencia?.coberturaDeCusto, fonte: m.fonte }),
  };
}

function montarAvisos({ liquidas, cmv, cobertura }) {
  const avisos = [];
  if (liquidas > 0 && !cmv) {
    avisos.push({
      nivel: 'atencao',
      texto: 'O CMV está em zero: nenhuma venda do período tem custo de origem. '
        + 'Mande o relatório de vendas com a coluna VALOR DO CUSTO — sem ele o lucro bruto '
        + 'é o próprio faturamento, que não é verdade.',
    });
  }
  const pct = cobertura?.percentual;
  if (cmv > 0 && pct != null && pct < 99.5) {
    avisos.push({
      nivel: 'atencao',
      texto: `O custo é conhecido em ${Math.round(pct)}% da venda. O CMV e o lucro bruto `
        + 'valem para essa parte — o app não completa custo por estimativa.',
    });
  }
  return avisos;
}

/** As linhas da escada, na ordem em que a conta é feita. */
export function linhasDoDre(d) {
  const sobre = (v) => (d.vendasLiquidas ? (Math.abs(v) / d.vendasLiquidas) * 100 : null);
  const abates = [
    d.freteCobrado > 0 && {
      nome: 'Frete cobrado nas notas',
      valor: d.freteCobrado,
      nota: 'fora da base: o custo do frete não é todo conhecido',
    },
    d.semItens.quantidade > 0 && {
      nome: `${d.semItens.quantidade} nota(s) sem item detalhado`,
      valor: d.semItens.valor,
      nota: 'o app não sabe o que foi vendido nelas',
    },
    Math.abs(d.naoExplicado) >= 1 && {
      nome: 'Diferença entre o total da nota e a soma dos itens',
      valor: d.naoExplicado,
      nota: 'desconto no total, IPI ou ST — o app mostra em vez de esconder',
    },
  ].filter(Boolean);

  return [
    {
      id: 'dre-brutas',
      rotulo: 'Vendas brutas',
      valor: d.vendasBrutas,
      nota: `${d.notas} nota(s) emitida(s)`,
    },
    d.devolucoes.valor > 0 && {
      id: 'dre-devolucoes',
      rotulo: 'Devoluções de venda',
      sinal: '−',
      valor: -d.devolucoes.valor,
      nota: `${d.devolucoes.quantidade} devolução(ões), pela data da nota`
        + (d.faturamento ? ` · ${(d.devolucoes.valor / d.faturamento * 100).toFixed(1).replace('.', ',')}% do faturamento` : ''),
    },
    {
      id: 'dre-faturamento',
      rotulo: 'Faturamento',
      tipo: 'subtotal',
      valor: d.faturamento,
      nota: 'o mesmo número da tela Hoje',
    },
    abates.length > 0 && {
      id: 'dre-fora-da-base',
      rotulo: 'Fora da base da margem',
      sinal: '−',
      valor: -cents(sum(abates, (a) => a.valor)),
      nota: 'clique para ver o que é',
      percentual: sobre(cents(sum(abates, (a) => a.valor))),
      detalhe: abates,
      base: d.faturamento,
    },
    {
      id: 'dre-liquidas',
      rotulo: 'Vendas líquidas',
      tipo: 'subtotal',
      valor: d.vendasLiquidas,
      nota: 'a base da margem: só mercadoria',
      percentual: 100,
    },
    {
      id: 'dre-cmv',
      rotulo: 'CMV — custo da mercadoria vendida',
      sinal: '−',
      valor: -d.cmv,
      nota: d.cobertura?.percentual != null
        ? `custo conhecido em ${Math.round(d.cobertura.percentual)}% da venda`
        : null,
      percentual: d.percentualCmv,
    },
    {
      id: 'dre-lucro-bruto',
      rotulo: 'Lucro bruto',
      tipo: 'resultado',
      valor: d.lucroBruto,
      nota: 'o que sobra da venda antes de qualquer despesa',
      percentual: d.percentualLucroBruto,
    },
  ].filter(Boolean);
}
