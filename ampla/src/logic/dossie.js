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
import { dre } from './dre.js';
import { statusTitulo } from './link.js';

const noMes = (data, mes) => !!data && monthKey(data) === mes;

export async function pasta(mes = monthKey()) {
  const faixa = faixaDoMes(mes);
  const [resumo, notasDoMes, comissao, contabil, titulos, pagamentos, clientes, pendencias] = await Promise.all([
    revenue.resumo(faixa),
    revenue.notasDoPeriodo(faixa.de, faixa.ate),
    commission.calcular(mes),
    dre(mes),
    store.receber.listar(),
    store.pagar.listar(),
    store.clientes.listar(),
    store.pendencias.listar(),
  ]);

  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]));
  const receberMes = titulos.filter((t) => noMes(t.vencimento, mes));
  const pagarMes = pagamentos.filter((p) => noMes(p.vencimento, mes));

  const documentos = [
    docDre(contabil),
    docFaturamento(resumo),
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
