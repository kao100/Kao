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
import { money, pct, num, formatDate, monthLabelShort } from '../core/format.js';
import * as revenue from './revenue.js';
import { margem } from './margem.js';
import { colunasExcel } from './reports.js';

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

/* ------------------------------------------------------- relatório comercial */

/**
 * O RELATÓRIO COMERCIAL INTEIRO, NUM DOCUMENTO SÓ.
 *
 * "Quero conseguir gerar um relatório em PDF, porque o relatório já existe
 *  dentro da aba comercial e dentro de cada vendedor, sobre os clientes e o
 *  faturamento de cada."
 *
 * Existia — espalhado. Cada seção da tela tinha o seu botão de PDF, então
 * montar o documento que ela leva para a reunião era exportar seis arquivos e
 * grampear. O que faltava não era dado: era reunir.
 *
 * A ordem é a da conversa: primeiro a empresa (faturamento, a conta até o lucro
 * bruto, os meses, o ranking), depois UMA PÁGINA POR VENDEDOR com o faturamento
 * dele e os clientes que o formaram. Quem só precisa da folha de um vendedor
 * arranca aquela página e entrega.
 *
 * Nada aqui é calculado de novo: sai das mesmas funções das telas. Um relatório
 * que discorda da tela de onde veio é pior do que não existir.
 */
export async function relatorioComercial({ de, ate, label }) {
  const [resumo, dreC, meses, porVendedor] = await Promise.all([
    revenue.resumo({ de, ate }),
    dreComercial({ de, ate }),
    revenue.ultimosMeses(6, ate),
    revenue.clientesPorVendedor({ de, ate }),
  ]);

  const periodo = label || `${formatDate(de)} a ${formatDate(ate)}`;
  const linhasDre = linhasDoDre(dreC).map((l) => ({
    conta: `${l.sinal === '−' ? '(−) ' : ''}${l.rotulo}`,
    valor: l.valor,
    percentual: l.percentual,
  }));

  const COL_DRE = [
    { header: 'Conta', key: 'conta' },
    { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
    { header: '% da líquida', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
  ];
  const COL_VEND = [
    { header: 'Vendedor', key: 'nome' },
    { header: 'Faturamento', key: 'total', tipo: 'money', alinhar: 'direita' },
    { header: 'Participação', key: 'participacao', tipo: 'pct', alinhar: 'direita' },
    { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
    { header: 'Clientes', key: 'quantosClientes', tipo: 'int', alinhar: 'direita' },
    { header: 'Ticket médio', key: 'ticket', tipo: 'money', alinhar: 'direita' },
  ];
  const COL_CLI = [
    { header: 'Cliente', key: 'nome' },
    { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
    { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
    { header: '% do vendedor', key: 'participacao', tipo: 'pct', alinhar: 'direita' },
  ];
  const COL_MES = [
    { header: 'Mês', key: 'mesLabel' },
    { header: 'Faturado', key: 'valor', tipo: 'money', alinhar: 'direita' },
    { header: 'Meta', key: 'meta', tipo: 'money', alinhar: 'direita' },
    { header: 'Diferença', key: 'diferenca', tipo: 'money', alinhar: 'direita' },
    { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
  ];

  const linhasVendedores = porVendedor.map((v) => ({
    ...v, quantosClientes: v.clientes.length,
  }));
  const linhasMeses = meses.map((m) => ({
    mesLabel: monthLabelShort(m.mes),
    valor: m.valor || 0,
    meta: m.meta || null,
    diferenca: m.meta ? (m.valor || 0) - m.meta : null,
    notas: m.notas ?? null,
  }));

  const blocos = [
    {
      tipo: 'kpis',
      itens: [
        { label: 'Faturamento', valor: money(resumo.total), nota: `${resumo.notas} NFs` },
        { label: 'Vendas líquidas', valor: money(dreC.vendasLiquidas), nota: 'base da margem' },
        { label: 'CMV', valor: money(dreC.cmv), nota: dreC.percentualCmv == null ? null : `${pct(dreC.percentualCmv, 1)} da líquida` },
        { label: 'Lucro bruto', valor: money(dreC.lucroBruto), nota: dreC.percentualLucroBruto == null ? null : pct(dreC.percentualLucroBruto, 1) },
        { label: 'Clientes', valor: num(resumo.clientes, 0) },
        { label: 'Ticket médio', valor: money(resumo.ticketMedio) },
        { label: 'Vendedores', valor: num(porVendedor.filter((v) => v.vendedorId).length, 0) },
        { label: 'Frete cobrado', valor: money(dreC.freteCobrado), nota: 'fora da margem' },
      ],
    },
    { tipo: 'tabela', titulo: 'DRE comercial', colunas: COL_DRE, linhas: linhasDre },
    {
      tipo: 'barras',
      titulo: 'Participação por vendedor',
      itens: porVendedor.map((v) => ({
        nome: v.nome, valor: v.total, rotulo: `${money(v.total)} (${pct(v.participacao, 0)})`,
      })),
    },
    {
      tipo: 'tabela',
      titulo: 'Faturamento por vendedor',
      colunas: COL_VEND,
      linhas: linhasVendedores,
      total: { nome: 'TOTAL', total: resumo.total, notas: resumo.notas, quantosClientes: resumo.clientes },
    },
    { tipo: 'tabela', titulo: 'Últimos meses', colunas: COL_MES, linhas: linhasMeses },
  ];

  /* uma página por vendedor: faturamento dele e os clientes que o formaram */
  for (const v of porVendedor) {
    /* "Clientes de Sem vendedor" não é frase: a folha do que ficou sem dono
       tem nome próprio, e serve de lembrete do que falta resolver */
    const semDono = !v.vendedorId;
    blocos.push({
      tipo: 'kpis',
      titulo: semDono ? 'Notas ainda sem vendedor' : v.nome,
      novaPagina: true,
      itens: [
        { label: 'Faturamento', valor: money(v.total), nota: `${pct(v.participacao, 1)} do total` },
        { label: 'NFs', valor: num(v.notas, 0) },
        { label: 'Clientes', valor: num(v.clientes.length, 0) },
        { label: 'Ticket médio', valor: money(v.ticket) },
      ],
    });
    blocos.push({
      tipo: 'tabela',
      titulo: semDono ? 'Clientes destas notas' : `Clientes de ${v.nome}`,
      colunas: COL_CLI,
      linhas: v.clientes,
      total: { nome: `${v.clientes.length} cliente(s)`, notas: v.notas, valor: v.total },
    });
  }

  return {
    titulo: 'Relatório comercial',
    subtitulo: 'AMPLA',
    periodo,
    nomeArquivo: `relatorio_comercial_${de}_a_${ate}`,
    blocos,
    /* o mesmo conteúdo em Excel: uma aba geral e uma por vendedor. As colunas
       vão convertidas aqui para quem exporta não precisar lembrar de converter */
    planilhas: ([
      {
        name: 'Vendedores',
        title: `Faturamento por vendedor — ${periodo}`,
        columns: COL_VEND,
        rows: linhasVendedores,
        total: { nome: 'TOTAL', total: resumo.total, notas: resumo.notas },
      },
      {
        name: 'DRE comercial',
        title: `DRE comercial — ${periodo}`,
        columns: COL_DRE,
        rows: linhasDre,
      },
      {
        name: 'Meses',
        title: `Últimos meses — ${periodo}`,
        columns: COL_MES,
        rows: linhasMeses,
      },
      ...porVendedor.map((v) => ({
        name: nomeDeAba(v.vendedorId ? v.nome : 'Sem vendedor'),
        title: `${v.vendedorId ? `Clientes de ${v.nome}` : 'Clientes das notas sem vendedor'} — ${periodo}`,
        columns: COL_CLI,
        rows: v.clientes,
        total: { nome: 'TOTAL', notas: v.notas, valor: v.total },
      })),
    ]).map((aba) => ({ ...aba, columns: colunasExcel(aba.columns) })),
    resumo,
    dre: dreC,
    porVendedor,
  };
}

/** O Excel recusa aba com mais de 31 caracteres ou com : \\ / ? * [ ] no nome. */
function nomeDeAba(nome) {
  return String(nome).replace(/[\\/:*?[\]]/g, '-').slice(0, 28) || 'Vendedor';
}
