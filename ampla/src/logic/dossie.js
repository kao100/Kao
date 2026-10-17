/**
 * PASTA DO MÊS — o dossiê de fechamento
 *
 * "Toda vez que fechar o mês eu quero uma pasta dentro do aplicativo com
 *  comissão, faturamento, clientes, contas a receber, contas a pagar, um DRE e
 *  os relatórios financeiros gerais."
 *
 * É isso: um lugar só, por mês, que junta o que já existe espalhado pelo app e
 * sai inteiro em um Excel (uma aba por documento) ou em PDF.
 *
 * A pasta não guarda cópia de nada. Ela é montada na hora, a partir do banco —
 * assim ela nunca fica contando uma história diferente da do resto do app.
 */

import * as store from '../core/store.js';
import { monthKey, monthLabel, formatDate, money, pct } from '../core/format.js';
import { cents, sum } from '../core/util.js';
import * as revenue from './revenue.js';
import * as commission from './commission.js';
import * as margemMod from './margem.js';
import * as quotes from './quotes.js';
import * as fluxo from './fluxo.js';
import { dre } from './dre.js';
import { statusTitulo } from './link.js';

const noMes = (data, mes) => !!data && monthKey(data) === mes;

export async function pasta(mes = monthKey()) {
  const faixa = faixaDoMes(mes);
  const [
    resumo, notasDoMes, comissao, contabil, titulos, pagamentos, clientes, pendencias,
    margem, frete, orcamentos, saldo,
  ] = await Promise.all([
    revenue.resumo(faixa),
    revenue.notasDoPeriodo(faixa.de, faixa.ate),
    commission.calcular(mes),
    dre(mes),
    store.receber.listar(),
    store.pagar.listar(),
    store.clientes.listar(),
    store.pendencias.listar(),
    margemMod.margem(faixa),
    margemMod.frete(faixa),
    quotes.resumo(faixa),
    fluxo.saldoInformado(),
  ]);

  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]));
  const receberMes = titulos.filter((t) => noMes(t.vencimento, mes));
  const pagarMes = pagamentos.filter((p) => noMes(p.vencimento, mes));

  /**
   * A ORDEM É A DA CONVERSA COM O PAI.
   *
   * "Relatório geral da empresa para passar para o meu pai, que é importante:
   *  fluxo de caixa ali, saldos, margem, quanto que você cobrou de frete,
   *  faturamento total, faturamento por vendedor, tudo isso eu vou precisar
   *  ter. Orçamentos não fechados, essa visibilidade, eu preciso enviar para o
   *  meu pai todo mês. Sala de comissão, e é isso."
   *
   * Então o dossiê começa pelo resultado, passa pelo faturamento e pela margem,
   * mostra o frete, mostra o caixa, mostra o que ficou orçado e termina na
   * comissão. Nenhum documento novo foi calculado aqui: cada um chama o mesmo
   * módulo que a tela correspondente usa, para a pasta nunca contar uma história
   * diferente da do app.
   */
  const documentos = [
    docDre(contabil),
    docFaturamento(resumo),
    docMargem(margem),
    docFrete(frete),
    docCaixa(saldo, receberMes, pagarMes),
    docOrcamentos(orcamentos),
    docComissao(comissao),
    docReceber(receberMes),
    docPagar(pagarMes),
    docClientes(notasDoMes.filter(revenue.valeParaFaturamento), nomeCliente),
    docPendencias(pendencias.filter((p) => p.status === 'aberta')),
  ];

  return {
    mes,
    label: monthLabel(mes),
    dre: contabil,
    resumo,
    comissao,
    documentos,
    // o fechamento não é "ok" só porque o mês acabou
    bloqueios: [
      ...comissao.bloqueios,
      ...(contabil.cmv.cobertura.completa ? [] : ['O custo não é conhecido em todo o faturamento: o DRE sai sem lucro bruto.']),
    ],
  };
}

function faixaDoMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/* ------------------------------------------------------------- documentos */

function docDre(d) {
  const linhas = [
    { conta: 'RECEITA BRUTA', valor: d.receita.bruta, nota: `${d.receita.notas} NF(s)` },
    d.receita.devolucoes ? { conta: '(–) Devoluções', valor: -d.receita.devolucoes, nota: 'já descontadas da receita' } : null,
    {
      conta: '(–) CMV — custo das mercadorias vendidas',
      valor: -d.cmv.valor,
      nota: d.cmv.cobertura.completa ? 'custo de todos os pedidos' : `custo conhecido em ${pct(d.cmv.cobertura.percentual || 0, 0)} do faturamento`,
    },
    {
      conta: '= LUCRO BRUTO',
      valor: d.lucroBruto,
      nota: d.lucroBruto == null ? 'em branco: falta custo' : pct(d.margemBruta || 0, 1),
    },
    ...d.despesas.grupos.map((g) => ({ conta: `(–) ${g.nome}`, valor: -g.valor, nota: `${g.itens} lançamento(s)` })),
    { conta: '(–) TOTAL DE DESPESAS', valor: -d.despesas.total, nota: `${d.despesas.grupos.length} conta(s) do plano` },
    {
      conta: '= RESULTADO DO MÊS',
      valor: d.resultado,
      nota: d.resultado == null ? 'em branco: falta custo' : pct(d.margemLiquida || 0, 1),
    },
    d.mercadoria.total
      ? { conta: 'Compras de mercadoria (não somadas)', valor: d.mercadoria.total, nota: 'esse custo já entra pelo CMV' }
      : null,
  ].filter(Boolean);

  return {
    id: 'dre',
    icone: '📋',
    nome: 'DRE — resultado do mês',
    resumo: d.resultado == null ? 'sem lucro bruto: falta custo' : money(d.resultado),
    colunas: [
      { header: 'Conta', key: 'conta' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: 'Observação', key: 'nota' },
    ],
    linhas,
  };
}

function docFaturamento(r) {
  return {
    id: 'faturamento',
    icone: '📈',
    nome: 'Faturamento por vendedor',
    resumo: `${money(r.total)} · ${r.notas} NFs`,
    colunas: [
      { header: 'Vendedor', key: 'nome' },
      { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: 'Participação', key: 'participacao', tipo: 'pct', alinhar: 'direita' },
      { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
      { header: 'Ticket médio', key: 'ticket', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: r.ranking,
    total: { nome: 'TOTAL', valor: r.total, notas: r.notas },
  };
}

/**
 * MARGEM — "margem, quanto que você cobrou de frete".
 *
 * Vem do mesmo módulo da tela de Margem e frete, com o recorte do mês. A coluna
 * de cobertura existe porque margem sem custo conhecido não é margem: é uma
 * conta feita com metade dos dados, e o pai tem direito de ver qual metade.
 */
function docMargem(m) {
  return {
    id: 'margem',
    icone: '📐',
    nome: 'Margem por vendedor',
    resumo: m.total.margem == null ? 'falta custo' : `${pct(m.total.margem, 1)} de margem`,
    colunas: [
      { header: 'Vendedor', key: 'nome' },
      { header: 'Venda', key: 'venda', tipo: 'money', alinhar: 'direita' },
      { header: 'Custo', key: 'custo', tipo: 'money', alinhar: 'direita' },
      { header: 'Lucro', key: 'lucro', tipo: 'money', alinhar: 'direita' },
      { header: 'Margem', key: 'margem', tipo: 'pct', alinhar: 'direita' },
      { header: 'Frete cobrado', key: 'frete', tipo: 'money', alinhar: 'direita' },
      { header: 'Custo conhecido?', key: 'cobertura' },
    ],
    linhas: m.vendedores.map((v) => ({
      ...v,
      cobertura: v.completa ? 'sim, em tudo' : `falta custo em ${money(v.vendaSemCusto)} de venda`,
    })),
    total: {
      nome: 'TOTAL',
      venda: m.total.venda,
      custo: m.total.custo,
      lucro: m.total.lucro,
      margem: m.total.margem,
    },
  };
}

/**
 * FRETE — o cobrado e o que custou, lado a lado.
 *
 * "O Guilherme tem um frete, mas aí o frete também a gente tem custo."
 *
 * Os dois números vêm de lugares diferentes de propósito: o cobrado é da nota,
 * o custo é da planilha de entregas. Por isso a última linha é a conta que
 * importa — se o frete cobrado paga o frete feito.
 */
function docFrete(f) {
  /**
   * O CAMPO TEM DE EXISTIR PARA O NÚMERO APARECER.
   *
   * Aqui lia `v.custo`, que o módulo de frete nunca devolveu: o custo medido por
   * vendedor chama-se `custoReal`, e a sobra dele, `resultado`. Resultado: no
   * relatório que vai para o pai dela, as colunas "Custo das entregas" e
   * "Sobra / falta" vinham vazias em TODAS as linhas, com o TOTAL preenchido
   * embaixo — a tabela parecendo quebrada justamente no documento que ela não
   * revisa linha a linha antes de mandar.
   *
   * Continua nulo quando a planilha de entregas não diz de quem é a entrega:
   * nesse caso o custo existe só no total, e inventar um rateio numa coluna
   * chamada "custo" seria pior que a célula vazia.
   */
  const linhas = f.vendedores.map((v) => ({
    nome: v.nome,
    cobrado: v.frete,
    custo: v.custoReal ?? null,
    resultado: v.resultado ?? null,
    notas: v.notas,
  }));
  return {
    id: 'frete',
    icone: '🚚',
    nome: 'Frete cobrado e frete pago',
    resumo: f.temDado
      ? `${money(f.total)} cobrado · ${money(f.custo.total)} de custo`
      : 'a nota do período não traz valor de frete',
    colunas: [
      { header: 'Vendedor', key: 'nome' },
      { header: 'Frete cobrado', key: 'cobrado', tipo: 'money', alinhar: 'direita' },
      { header: 'Custo das entregas', key: 'custo', tipo: 'money', alinhar: 'direita' },
      { header: 'Sobra / falta', key: 'resultado', tipo: 'money', alinhar: 'direita' },
      { header: 'NFs com frete', key: 'notas', tipo: 'int', alinhar: 'direita' },
    ],
    linhas,
    total: {
      nome: 'TOTAL',
      cobrado: f.total,
      custo: f.custo.total,
      resultado: f.custo.resultado,
    },
  };
}

/**
 * CAIXA — o saldo informado e o que o mês ainda tem para entrar e sair.
 *
 * Não é a projeção dia a dia (essa é a tela do Caixa, e não cabe numa aba de
 * Excel sem virar ruído). É a posição: de onde o caixa parte e o que o mês do
 * fechamento movimenta — que é a pergunta que ela diz que vai receber.
 */
function docCaixa(saldo, receberMes, pagarMes) {
  const aReceber = receberMes.filter((t) => statusTitulo(t) !== 'pago');
  const aPagar = pagarMes.filter((t) => statusTitulo(t) !== 'pago');
  const entra = cents(sum(aReceber, (t) => t.valor || 0));
  const sai = cents(sum(aPagar, (t) => t.valor || 0));

  const linhas = [
    {
      conta: 'Saldo em banco informado',
      valor: saldo?.valor ?? null,
      nota: saldo?.data ? `posição de ${formatDate(saldo.data)}` : 'nenhum saldo informado',
    },
    ...(saldo?.contas || []).filter((c) => c.valor != null).map((c) => ({
      conta: `  ${c.nome}`,
      valor: c.valor,
      nota: c.data ? `informado em ${formatDate(c.data)}` : '',
    })),
    { conta: '(+) A receber do mês, em aberto', valor: entra, nota: `${aReceber.length} título(s)` },
    { conta: '(–) A pagar do mês, em aberto', valor: -sai, nota: `${aPagar.length} título(s)` },
    {
      conta: '= Posição com o mês liquidado',
      valor: saldo?.valor == null ? null : cents(saldo.valor + entra - sai),
      nota: saldo?.valor == null ? 'em branco: falta informar o saldo' : 'se tudo entrar e sair no prazo',
    },
  ];

  return {
    id: 'caixa',
    icone: '💧',
    nome: 'Caixa e saldos',
    resumo: saldo?.valor == null ? 'saldo não informado' : money(saldo.valor),
    colunas: [
      { header: 'Posição', key: 'conta' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: 'Observação', key: 'nota' },
    ],
    linhas,
  };
}

/**
 * ORÇAMENTOS NÃO FECHADOS — a visibilidade que ela pediu nominalmente.
 *
 * "Orçamentos não fechados, essa visibilidade, eu preciso enviar para o meu pai
 *  todo mês. É um relatório que tem que ter."
 *
 * Então a aba é dos EM ABERTO, maior primeiro, com o cliente e o vendedor. A
 * taxa de conversão do mês fica no resumo, porque ela é o contexto do número,
 * não o número.
 */
function docOrcamentos(o) {
  return {
    id: 'orcamentos',
    icone: '📝',
    nome: 'Orçamentos não fechados',
    resumo: o.abertos.length
      ? `${o.abertos.length} em aberto · ${money(cents(sum(o.abertos, (x) => x.valorTotal || 0)))}`
      : 'nenhum orçamento em aberto',
    colunas: [
      { header: 'Orçamento', key: 'numero' },
      { header: 'Data', key: 'data', tipo: 'data' },
      { header: 'Cliente', key: 'clienteNome' },
      /* a coluna só entra quando o relatório traz vendedor: coluna vazia num
         relatório que vai para outra pessoa parece defeito, e aqui era */
      ...(o.abertos.some((x) => x.vendedorNome)
        ? [{ header: 'Vendedor', key: 'vendedorNome' }] : []),
      { header: 'Valor', key: 'valorTotal', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: o.abertos,
    total: { numero: 'TOTAL', valorTotal: cents(sum(o.abertos, (x) => x.valorTotal || 0)) },
    nota: o.taxa == null
      ? 'Nenhum orçamento decidido no mês, então não há taxa de conversão para mostrar.'
      : `No mês, ${pct(o.taxa, 0)} dos orçamentos decididos viraram venda `
        + `(${o.convertido.quantidade} de ${o.decididos}).`,
  };
}

function docComissao(c) {
  return {
    id: 'comissao',
    icone: '🎯',
    nome: 'Comissões',
    resumo: `${money(c.total)} · ${c.status}`,
    colunas: [
      { header: 'Vendedor', key: 'nome' },
      { header: 'Base', key: 'base', tipo: 'money', alinhar: 'direita' },
      { header: 'Comissão', key: 'comissao', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: c.vendedores,
    total: { nome: 'TOTAL', comissao: c.total },
  };
}

function docReceber(titulos) {
  return {
    id: 'receber',
    icone: '📥',
    nome: 'Contas a receber do mês',
    resumo: `${money(cents(sum(titulos, (t) => t.valor || 0)))} · ${titulos.length} título(s)`,
    colunas: [
      { header: 'Cliente', key: 'clienteNome' },
      { header: 'NF', key: 'nfNumero' },
      { header: 'Pedido', key: 'pedidoNumero' },
      { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
      { header: 'Situação', key: 'situacao' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: titulos.map((t) => ({ ...t, situacao: statusTitulo(t) })),
    total: { clienteNome: 'TOTAL', valor: cents(sum(titulos, (t) => t.valor || 0)) },
  };
}

function docPagar(pagamentos) {
  return {
    id: 'pagar',
    icone: '📤',
    nome: 'Contas a pagar do mês',
    resumo: `${money(cents(sum(pagamentos, (p) => p.valor || 0)))} · ${pagamentos.length} conta(s)`,
    colunas: [
      { header: 'Destinado a', key: 'fornecedorNome' },
      { header: 'Plano de contas', key: 'categoria' },
      { header: 'Descrição', key: 'descricao' },
      { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
      { header: 'Situação', key: 'status' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: pagamentos,
    total: { fornecedorNome: 'TOTAL', valor: cents(sum(pagamentos, (p) => p.valor || 0)) },
  };
}

/** Quem comprou no mês, somando as notas de cada um. */
function docClientes(notas, nomeCliente) {
  const mapa = new Map();
  for (const nf of notas) {
    const chave = nf.clienteId || nf.clienteNome || 'sem';
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        nome: nf.clienteNome || nomeCliente.get(nf.clienteId) || 'não identificado',
        valor: 0,
        notas: 0,
      });
    }
    const c = mapa.get(chave);
    c.valor += revenue.valorFaturado(nf);
    c.notas += 1;
  }
  const linhas = [...mapa.values()]
    .map((c) => ({ ...c, valor: cents(c.valor) }))
    .sort((a, b) => b.valor - a.valor);

  return {
    id: 'clientes',
    icone: '👥',
    nome: 'Clientes que compraram no mês',
    resumo: `${linhas.length} cliente(s)`,
    colunas: [
      { header: 'Cliente', key: 'nome' },
      { header: 'Comprou', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
    ],
    linhas,
    total: linhas.length ? { nome: 'TOTAL', valor: cents(sum(linhas, (c) => c.valor || 0)) } : null,
  };
}

function docPendencias(abertas) {
  return {
    id: 'pendencias',
    icone: '⚠️',
    nome: 'Divergências em aberto',
    resumo: abertas.length ? `${abertas.length} para resolver` : 'nenhuma',
    colunas: [
      { header: 'O quê', key: 'titulo' },
      { header: 'Detalhe', key: 'detalhe' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: abertas,
  };
}

/* ------------------------------------------------- a pasta inteira, de uma vez */

/** Uma aba de Excel por documento. */
export function planilhasDaPasta(p) {
  return p.documentos.map((d) => ({
    name: d.nome.slice(0, 28),
    title: `${d.nome} — ${p.label}`,
    columns: d.colunas.map((c) => ({ header: c.header, key: c.key, tipo: c.tipo, width: c.width })),
    rows: d.linhas,
    total: d.total || null,
  }));
}

/** Um PDF com todos os documentos, na ordem do fechamento. */
export function blocosDaPasta(p) {
  return p.documentos.map((d) => ({
    tipo: 'tabela',
    titulo: `${d.icone} ${d.nome}`,
    colunas: d.colunas,
    linhas: d.linhas,
    total: d.total || null,
  }));
}

export { faixaDoMes };
