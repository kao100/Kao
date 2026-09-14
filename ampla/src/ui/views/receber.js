/**
 * CONTAS A RECEBER (item 12)
 * A mesma base que alimenta a cobrança, o fluxo de caixa e a visão da empresa.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as store from '../../core/store.js';
import { definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, vazio, aviso } from '../components/ui.js';
import { tabela, exportadores } from '../components/table.js';
import { detalhe, linhas as linhasDetalhe } from '../components/sheet.js';
import { money, formatDate, today, addDays } from '../../core/format.js';
import { cents, sum, sortBy } from '../../core/util.js';

const FILTROS = [
  { id: 'aberto', label: 'Em aberto' },
  { id: 'vencidos', label: 'Vencidos', destaque: true },
  { id: '7', label: 'Vence em 7 dias' },
  { id: '30', label: 'Vence em 30 dias' },
  { id: 'recebidos', label: 'Recebidos' },
  { id: 'todos', label: 'Todos' },
];

export async function telaReceber({ query }) {
  const filtro = query.f || 'aberto';
  const [titulos, vendedores] = await Promise.all([store.receber.listar(), store.vendedores.listar()]);
  definirTitulo('Contas a receber');

  if (!titulos.length) {
    return vazio('📥', 'Nenhum título a receber',
      'Importe o relatório de contas a receber do sistema atual.',
      botao('Importar', { tipo: 'primario', onClick: () => navigate('/arquivos/receber') }));
  }

  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const abertos = titulos.filter((t) => t.status === 'aberto');
  const vencidos = abertos.filter((t) => t.vencimento < today());
  const lista = sortBy(aplicar(titulos, filtro), (t) => t.vencimento)
    .map((t) => ({
      ...t,
      saldoAberto: t.status === 'pago' ? 0 : cents(t.saldo ?? t.valor),
      vendedorNomeTexto: t.vendedorId ? nomeVendedor.get(t.vendedorId) : (t.vendedorNome || null),
      situacao: t.status === 'pago' ? 'Recebido' : t.vencimento < today() ? 'Vencido' : 'A vencer',
    }));
  const contadores = Object.fromEntries(FILTROS.map((f) => [f.id, aplicar(titulos, f.id).length]));
  const semNf = titulos.filter((t) => t.nfNumero && !t.nfId);

  return h('div.empilha', { style: { gap: '14px' } },
    h('div.grade.grade--4',
      kpi({ label: 'Total em aberto', valor: money(sum(abertos, (t) => t.saldo ?? t.valor)), icone: '📥', cor: 'info', nota: `${abertos.length} títulos` }),
      kpi({ label: 'Vencido', valor: money(sum(vencidos, (t) => t.saldo ?? t.valor)), icone: '🔴', cor: vencidos.length ? 'ruim' : 'ok', nota: `${vencidos.length} títulos` }),
      kpi({ label: 'A vencer em 7 dias', valor: money(sum(aplicar(titulos, '7'), (t) => t.saldo ?? t.valor)), icone: '📅' }),
      kpi({ label: 'A vencer em 30 dias', valor: money(sum(aplicar(titulos, '30'), (t) => t.saldo ?? t.valor)), icone: '🗓️' })),

    semNf.length > 0 && aviso(`${semNf.length} título(s) citam uma NF que não está na base — ficam sem vendedor até a NF ser importada.`,
      'atencao', botao('Ver na conciliação', { pequeno: true, onClick: () => navigate('/conciliacao') })),

    chips(FILTROS.map((f) => ({ ...f, contador: contadores[f.id] })), filtro,
      (id) => navigate(href('/receber', { f: id }))),

    secao(null, h('div.linha',
      exportadores(() => montarExportacao(lista, filtro)),
      botao('📞 Ir para cobrança', { tipo: 'primario', pequeno: true, onClick: () => navigate('/cobranca') })),
    card(null, null, tabela({
      colunas: [
        { header: 'Cliente', key: 'clienteNome' },
        { header: 'Título', key: 'documento' },
        { header: 'NF', key: 'nfNumero' },
        { header: 'Emissão', key: 'emissao', tipo: 'date' },
        { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
        { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
        { header: 'Recebido', key: 'valorRecebido', tipo: 'money', alinhar: 'direita' },
        { header: 'Saldo', key: 'saldoAberto', tipo: 'money', alinhar: 'direita' },
        { header: 'Situação', key: 'situacao' },
        { header: 'Vendedor', key: 'vendedorNomeTexto' },
      ],
      linhas: lista.slice(0, 300),
      total: {
        clienteNome: `${lista.length} títulos`,
        valor: cents(sum(lista, (t) => t.valor)),
        saldoAberto: cents(sum(lista, (t) => t.saldoAberto)),
      },
      aoClicar: (linha) => abrirDetalhe(linha),
    }))));
}

function aplicar(titulos, filtro) {
  const hoje = today();
  const abertos = titulos.filter((t) => t.status === 'aberto');
  if (filtro === 'todos') return titulos;
  if (filtro === 'recebidos') return titulos.filter((t) => t.status === 'pago');
  if (filtro === 'vencidos') return abertos.filter((t) => t.vencimento < hoje);
  if (filtro === 'aberto') return abertos;
  const dias = Number(filtro) || 7;
  return abertos.filter((t) => t.vencimento >= hoje && t.vencimento <= addDays(hoje, dias));
}

function abrirDetalhe(titulo) {
  detalhe(`${titulo.clienteNome} — ${titulo.documento}`,
    linhasDetalhe([
      ['Valor', money(titulo.valor)],
      ['Recebido', titulo.valorRecebido == null ? '—' : money(titulo.valorRecebido)],
      ['Saldo', money(titulo.saldoAberto)],
      ['Emissão', titulo.emissao ? formatDate(titulo.emissao) : '—'],
      ['Vencimento', formatDate(titulo.vencimento)],
      ['NF de origem', titulo.nfNumero || '—'],
      ['Vendedor', titulo.vendedorNomeTexto || '—'],
      ['Banco / carteira', titulo.banco || '—'],
      ['Forma de pagamento', titulo.formaPagamento || '—'],
      ['Situação no arquivo', titulo.statusArquivo || '—'],
      ['Recebido em', titulo.dataRecebimento ? formatDate(titulo.dataRecebimento) : '—'],
    ]),
    botao('Abrir na cobrança', { tipo: 'primario', bloco: true, onClick: () => navigate('/cobranca') }));
}

function montarExportacao(lista, filtro) {
  return {
    titulo: 'Contas a receber',
    subtitulo: `Filtro: ${FILTROS.find((f) => f.id === filtro)?.label || filtro}`,
    periodo: `Posição em ${formatDate(today())}`,
    nomeArquivo: `contas_a_receber_${today()}`,
    colunas: [
      { header: 'Cliente', key: 'clienteNome', largura: 34 },
      { header: 'Título', key: 'documento' },
      { header: 'NF', key: 'nfNumero' },
      { header: 'Emissão', key: 'emissao', tipo: 'date' },
      { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: 'Recebido', key: 'valorRecebido', tipo: 'money', alinhar: 'direita' },
      { header: 'Saldo', key: 'saldoAberto', tipo: 'money', alinhar: 'direita' },
      { header: 'Situação', key: 'situacao' },
      { header: 'Vendedor', key: 'vendedorNomeTexto' },
      { header: 'Banco', key: 'banco' },
    ],
    linhas: lista,
    total: { clienteNome: `${lista.length} títulos`, valor: cents(sum(lista, (t) => t.valor)), saldoAberto: cents(sum(lista, (t) => t.saldoAberto)) },
  };
}
