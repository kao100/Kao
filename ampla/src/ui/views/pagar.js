/**
 * CONTAS A PAGAR (item 11)
 * Importado do BPO, com filtros rápidos e prorrogação que já reflete no caixa.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, vazio, selo } from '../components/ui.js';
import { tabela, exportadores } from '../components/table.js';
import { formulario, detalhe, linhas as linhasDetalhe } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import { money, formatDate, today, addDays, relativeDay } from '../../core/format.js';
import { cents, sum, sortBy } from '../../core/util.js';

const FILTROS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'amanha', label: 'Amanhã' },
  { id: '7', label: '7 dias' },
  { id: '15', label: '15 dias' },
  { id: '30', label: '30 dias' },
  { id: 'atrasados', label: 'Atrasados', destaque: true },
  { id: 'pagos', label: 'Pagos' },
  { id: 'todos', label: 'Todos' },
];

export async function telaPagar({ query }) {
  const filtro = query.f || '7';
  const contas = await store.pagar.listar();
  definirTitulo('Contas a pagar');

  if (!contas.length) {
    return vazio('📤', 'Nenhuma conta a pagar importada',
      'Importe a planilha preparada pelo BPO — ela alimenta o fluxo de caixa automaticamente.',
      botao('Importar contas a pagar', { tipo: 'primario', onClick: () => navigate('/arquivos/pagar') }));
  }

  const abertas = contas.filter((c) => c.status !== 'pago');
  const atrasadas = abertas.filter((c) => vencimentoEfetivo(c) < today());
  const lista = sortBy(aplicar(contas, filtro), (c) => vencimentoEfetivo(c));
  const contadores = Object.fromEntries(FILTROS.map((f) => [f.id, aplicar(contas, f.id).length]));

  const porCategoria = new Map();
  for (const c of abertas) {
    const k = c.categoria || 'Sem categoria';
    porCategoria.set(k, cents((porCategoria.get(k) || 0) + c.valor));
  }

  return h('div.empilha', { style: { gap: '14px' } },
    h('div.grade.grade--4',
      kpi({ label: 'Em aberto', valor: money(sum(abertas, (c) => c.valor)), icone: '📤', nota: `${abertas.length} compromissos`, cor: 'laranja' }),
      kpi({ label: 'Atrasados', valor: money(sum(atrasadas, (c) => c.valor)), icone: '🔴', nota: `${atrasadas.length} títulos`, cor: atrasadas.length ? 'ruim' : 'ok' }),
      kpi({ label: 'Vence em 7 dias', valor: money(sum(aplicar(contas, '7'), (c) => c.valor)), icone: '📅' }),
      kpi({ label: 'Vence em 30 dias', valor: money(sum(aplicar(contas, '30'), (c) => c.valor)), icone: '🗓️' })),

    chips(FILTROS.map((f) => ({ ...f, contador: contadores[f.id] })), filtro,
      (id) => navigate(href('/pagar', { f: id }))),

    h('div.lista', ...lista.slice(0, 200).map((c) => itemPagar(c))),
    lista.length === 0 && h('p.pequeno.muted.centro', { style: { padding: '18px' } }, 'Nada neste filtro.'),

    porCategoria.size > 0 && secao('Para onde vai o dinheiro (em aberto)',
      exportadores(() => montarExportacao(lista, filtro)),
      card(null, null, tabela({
        colunas: [
          { header: 'Categoria', key: 'categoria' },
          { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: sortBy([...porCategoria.entries()].map(([categoria, valor]) => ({ categoria, valor })), (x) => x.valor, 'desc'),
        total: { categoria: 'TOTAL', valor: cents(sum(abertas, (c) => c.valor)) },
      }))));
}

function vencimentoEfetivo(conta) {
  return conta.prorrogadoPara || conta.vencimento;
}

function aplicar(contas, filtro) {
  const hoje = today();
  const abertas = contas.filter((c) => c.status !== 'pago');
  if (filtro === 'pagos') return contas.filter((c) => c.status === 'pago');
  if (filtro === 'todos') return contas;
  if (filtro === 'atrasados') return abertas.filter((c) => vencimentoEfetivo(c) < hoje);
  if (filtro === 'hoje') return abertas.filter((c) => vencimentoEfetivo(c) === hoje);
  if (filtro === 'amanha') return abertas.filter((c) => vencimentoEfetivo(c) === addDays(hoje, 1));
  const dias = Number(filtro) || 7;
  const limite = addDays(hoje, dias);
  return abertas.filter((c) => vencimentoEfetivo(c) <= limite);
}

function itemPagar(conta) {
  const venc = vencimentoEfetivo(conta);
  const atrasada = conta.status !== 'pago' && venc < today();
  const status = conta.status === 'pago' ? 'pago' : atrasada ? 'aberto' : 'cobrado';
  return h(`div.item.item--st.st-${status}`, { class: conta.status === 'pago' ? 'item--concluido' : '' },
    h('span.ponto'),
    h('div.item__corpo',
      h('div.item__titulo', conta.fornecedorNome),
      h('div.item__sub',
        h('span', `vence ${formatDate(venc)}`),
        h('span.muted', relativeDay(venc)),
        conta.categoria ? h('span', conta.categoria) : h('span.atencao', 'sem categoria'),
        conta.documento && h('span', `doc ${conta.documento}`),
        conta.prorrogadoPara && selo(`prorrogado de ${formatDate(conta.vencimento, 'short')}`, 'info'),
        conta.status === 'pago' && selo(`pago ${formatDate(conta.dataPagamento, 'short')}`, 'ok'))),
    h('div.empilha',
      h('div.item__valor', money(conta.valor)),
      conta.status !== 'pago' && h('div.linha', { style: { marginTop: '6px', justifyContent: 'flex-end' } },
        botao('📅', { pequeno: true, onClick: () => prorrogar(conta) }),
        botao('✓ Pago', { pequeno: true, onClick: () => marcarPago(conta) }),
        botao('⋯', { pequeno: true, onClick: () => abrirDetalhe(conta) }))));
}

async function prorrogar(conta) {
  const r = await formulario({
    titulo: `Prorrogar ${conta.fornecedorNome}`,
    descricao: `Vence em ${formatDate(vencimentoEfetivo(conta))} · ${money(conta.valor)}. `
      + 'A nova data entra no fluxo de caixa imediatamente.',
    campos: [
      { chave: 'novaData', label: 'Nova data', tipo: 'data', obrigatorio: true, valor: addDays(vencimentoEfetivo(conta), 7) },
      { chave: 'motivo', label: 'Motivo', tipo: 'texto', obrigatorio: true, placeholder: 'combinado com o fornecedor' },
    ],
    confirmar: 'Prorrogar',
  });
  if (!r) return;
  await store.pagar.salvar({ ...conta, prorrogadoPara: r.novaData, prorrogacaoMotivo: r.motivo });
  await store.registrar('prorrogacao', {
    alvoId: conta.id, alvo: conta.fornecedorNome, de: conta.vencimento, para: r.novaData, motivo: r.motivo,
  });
  ok('Prorrogado — fluxo de caixa atualizado.');
  refresh();
}

async function marcarPago(conta) {
  const contas = await store.contas.listar();
  const r = await formulario({
    titulo: `Pagamento — ${conta.fornecedorNome}`,
    campos: [
      { chave: 'valorPago', label: 'Valor pago', tipo: 'dinheiro', obrigatorio: true, valor: conta.valor },
      { chave: 'dataPagamento', label: 'Data', tipo: 'data', obrigatorio: true, valor: today() },
      {
        chave: 'contaId',
        label: 'Saiu de qual banco?',
        tipo: 'select',
        opcoes: [{ valor: '', label: 'Não informar' }, ...contas.map((c) => ({ valor: c.id, label: c.nome }))],
      },
    ],
    confirmar: 'Registrar pagamento',
  });
  if (!r) return;
  await store.pagar.salvar({
    ...conta,
    status: 'pago',
    dataPagamento: r.dataPagamento,
    valorPago: Number(r.valorPago),
    contaPagamentoId: r.contaId || null,
    baixaManual: true,
  });
  await store.registrar('baixa_pagamento', {
    alvoId: conta.id, alvo: conta.fornecedorNome, de: conta.valor, para: Number(r.valorPago), motivo: 'pagamento registrado à mão',
  });
  ok('Pagamento registrado.');
  refresh();
}

function abrirDetalhe(conta) {
  detalhe(conta.fornecedorNome,
    linhasDetalhe([
      ['Documento', conta.documento || '—'],
      ['Parcela', conta.parcela || '—'],
      ['Emissão', conta.emissao ? formatDate(conta.emissao) : '—'],
      ['Vencimento original', formatDate(conta.vencimento)],
      ['Vencimento atual', formatDate(vencimentoEfetivo(conta))],
      ['Valor', money(conta.valor)],
      ['Categoria', conta.categoria || '—'],
      ['Banco', conta.banco || '—'],
      ['Situação no arquivo', conta.statusArquivo || '—'],
      ['Observação', conta.observacao || '—'],
      conta.prorrogacaoMotivo && ['Motivo da prorrogação', conta.prorrogacaoMotivo],
    ]));
}

function montarExportacao(lista, filtro) {
  return {
    titulo: 'Contas a pagar',
    subtitulo: `Filtro: ${FILTROS.find((f) => f.id === filtro)?.label || filtro}`,
    periodo: `Posição em ${formatDate(today())}`,
    nomeArquivo: `contas_a_pagar_${today()}`,
    colunas: [
      { header: 'Fornecedor', key: 'fornecedorNome', largura: 34 },
      { header: 'Documento', key: 'documento' },
      { header: 'Vencimento', key: 'vencimentoEfetivo', tipo: 'date' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: 'Categoria', key: 'categoria' },
      { header: 'Banco', key: 'banco' },
      { header: 'Situação', key: 'status' },
      { header: 'Pago em', key: 'dataPagamento', tipo: 'date' },
    ],
    linhas: lista.map((c) => ({ ...c, vencimentoEfetivo: vencimentoEfetivo(c) })),
    total: { fornecedorNome: `${lista.length} títulos`, valor: cents(sum(lista, (c) => c.valor)) },
  };
}
