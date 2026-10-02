/**
 * CARTEIRA DE CLIENTES.
 *
 * "Eu preciso saber por cliente. Quanto esse cliente comprou com a gente? Quanto
 *  esse cliente orçou? (…) Quais clientes pararam, quais estão orçando e não
 *  estão fechando, quanto X cliente compra com X vendedor."
 *
 * Três listas, porque são três perguntas diferentes e misturá-las esconde as
 * duas menores: quem comprou, quem PAROU de comprar, quem orça e não fecha.
 *
 * O app soma e compara. Não diz "este cliente está em risco" — diz há quantos
 * dias ele não compra e quanto ele já comprou, e quem decide é ela.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as carteira from '../../logic/carteira.js';
import { lerFiltro } from '../../logic/filtro.js';
import { filtroAvancado, nadaNoRecorte } from '../components/filtro.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, vazio, aviso, selo } from '../components/ui.js';
import { tabela, exportadores } from '../components/table.js';
import { exportarExcel, colunasExcel } from '../../logic/reports.js';
import { money, pct, formatDate, monthLabelShort } from '../../core/format.js';

export async function telaClientes({ query }) {
  const filtro = lerFiltro(query);
  const vendedores = await store.vendedores.listar();
  const r = await carteira.carteira({
    de: filtro.de, ate: filtro.ate, vendedorId: filtro.vendedorId, busca: filtro.busca,
  });
  definirTitulo('Clientes', filtro.label);

  const painel = filtroAvancado({
    rota: '/clientes',
    filtro,
    vendedores,
    rotuloData: 'Compra',
    rotuloBusca: 'Buscar cliente por nome ou documento',
    aoExportar: () => exportarCarteira(r, filtro),
  });

  const compraram = r.linhas.filter((l) => l.notasPeriodo > 0);
  const vazioNoRecorte = !compraram.length && !r.resumo.orcado;

  if (!r.linhas.length) {
    return h('div.empilha', { style: { gap: '14px' } },
      painel,
      vazio('👥', 'Nenhum cliente ainda',
        'Mande o relatório fiscal e o de orçamentos — a carteira se monta a partir deles.',
        botao('Mandar relatórios', { tipo: 'primario', onClick: () => navigate('/arquivos') })));
  }

  /**
   * Nada no recorte, mas base cheia. É o caso de abrir o app no dia 2 do mês: o
   * padrão é o mês corrente e tudo aparece zerado, o que parece app quebrado. A
   * tela diz onde o dado está e oferece o período — sem trocar o filtro dela por
   * baixo, porque quem escolhe é ela.
   */
  const datasDeVenda = r.linhas.map((l) => l.ultimaCompra).filter(Boolean).sort();

  return h('div.empilha', { style: { gap: '14px' } },
    painel,

    vazioNoRecorte && nadaNoRecorte({
      rota: '/clientes', rotulo: 'venda',
      primeiraData: r.linhas.map((l) => l.primeiraCompra).filter(Boolean).sort()[0],
      ultimaData: datasDeVenda[datasDeVenda.length - 1],
    }),

    h('div.grade.grade--2',
      kpi({ label: 'Clientes que compraram', valor: String(r.resumo.clientesComCompra), icone: '👥', cor: 'info' }),
      kpi({ label: 'Faturamento', valor: money(r.resumo.faturamento), icone: '🧾' }),
      kpi({ label: 'Média por cliente', valor: money(r.resumo.ticketPorCliente), icone: '🎫' }),
      kpi({ label: 'Orçado no período', valor: money(r.resumo.orcado), icone: '📝', cor: 'roxo' })),

    /**
     * O bloco que responde a pergunta que ela fez por último, e que é a mais
     * incômoda: a carteira repartida. Um cliente que compra de dois vendedores
     * não é erro do app — é a situação que ela descreveu, e aqui ela consegue ver.
     */
    r.resumo.comMaisDeUmVendedor > 0 && aviso(
      `${r.resumo.comMaisDeUmVendedor} cliente(s) compraram de mais de um vendedor neste período. `
      + 'Não é erro: é a carteira repartida aparecendo. Toque no cliente para ver quanto foi com cada um.',
      'atencao'),

    r.pararam.length > 0 && secao(`${r.pararam.length} cliente(s) pararam de comprar`,
      exportadores(() => planilhaPararam(r, filtro)),
      h('p.mini.muted', { style: { marginBottom: '8px' } },
        `Compraram antes e não compraram nada entre ${formatDate(filtro.de)} e ${formatDate(filtro.ate)}. `
        + `Somam ${money(r.resumo.valorDeQuemParou)} de histórico. O app não chama ninguém de perdido — `
        + 'mostra há quantos dias não compra e o quanto já comprou.'),
      h('div.lista', ...r.pararam.slice(0, 40).map((l) => linhaCliente(l, { modo: 'parou' }))),
      r.pararam.length > 40 && h('p.mini.muted.centro', `… e mais ${r.pararam.length - 40}.`)),

    r.orcamSemFechar.length > 0 && secao(`${r.orcamSemFechar.length} orçaram e não fecharam nada`,
      exportadores(() => planilhaOrcaENaoFecha(r, filtro)),
      h('p.mini.muted', { style: { marginBottom: '8px' } },
        `${money(r.resumo.valorOrcadoSemFechar)} orçados sem uma nota no período. `
        + 'É a lista de "orça muito e fecha pouco".'),
      h('div.lista', ...r.orcamSemFechar.slice(0, 40).map((l) => linhaCliente(l, { modo: 'orca' }))),
      r.orcamSemFechar.length > 40 && h('p.mini.muted.centro', `… e mais ${r.orcamSemFechar.length - 40}.`)),

    secao(`${compraram.length} cliente(s) com compra no período`,
      exportadores(() => planilhaCarteira(r, filtro)),
      h('div.lista', ...compraram.slice(0, 60).map((l) => linhaCliente(l, { modo: 'comprou' }))),
      compraram.length > 60 && h('p.mini.muted.centro',
        `Mostrando os 60 maiores de ${compraram.length}. Use a busca para achar um cliente específico.`)));
}

function linhaCliente(l, { modo }) {
  const sub = [];
  if (modo === 'parou') {
    sub.push(l.diasSemComprar != null ? `${l.diasSemComprar} dias sem comprar` : 'sem data de compra');
    sub.push(`já comprou ${money(l.comprouSempre)}`);
    if (l.orcouPeriodo) sub.push(`orçou ${money(l.orcouPeriodo)} no período`);
  } else if (modo === 'orca') {
    sub.push(`${l.orcamentosPeriodo} orçamento(s)`);
    if (l.comprouSempre) sub.push(`já comprou ${money(l.comprouSempre)}`);
    else sub.push('nunca comprou');
  } else {
    sub.push(`${l.notasPeriodo} NF(s)`);
    if (l.vendedorPrincipal) {
      sub.push(l.multiVendedor
        ? `${l.vendedores.length} vendedores · maior: ${l.vendedorPrincipal.nome}`
        : l.vendedorPrincipal.nome);
    } else sub.push('sem vendedor');
    if (l.orcouPeriodo) sub.push(`orçou ${money(l.orcouPeriodo)}`);
  }

  return h('button.item', { onClick: () => navigate(href('/clientes/detalhe', { k: l.chave })) },
    h('div.item__corpo',
      h('div.item__titulo', l.nome),
      h('div.item__sub', sub.join(' · '))),
    h('div.empilha', { style: { alignItems: 'flex-end' } },
      h('span.num.forte', money(modo === 'orca' ? l.orcouPeriodo : l.comprouPeriodo || l.comprouSempre)),
      l.multiVendedor && h('span.mini.muted', 'carteira dividida')),
    h('span.item__seta', '›'));
}

/* ------------------------------------------------------- um cliente só */

export async function telaCliente({ query }) {
  const chave = query.k;
  if (!chave) { navigate('/clientes'); return h('div'); }
  const c = await carteira.cliente(chave);
  definirTitulo(c.nome, c.documento || 'sem documento no cadastro');

  return h('div.empilha', { style: { gap: '14px' } },
    botao('‹ Voltar para a carteira', { onClick: () => navigate('/clientes') }),

    h('div.grade.grade--2',
      kpi({ label: 'Comprou (sempre)', valor: money(c.comprouSempre), icone: '🧾', cor: 'info' }),
      kpi({ label: 'Orçou (sempre)', valor: money(c.orcouSempre), icone: '📝', cor: 'roxo' }),
      kpi({ label: 'Em aberto', valor: money(c.aberto), icone: '⏳' }),
      kpi({
        label: 'Vencido', valor: money(c.vencido), icone: '🔴',
        cor: c.vencido > 0 ? 'ruim' : undefined,
      })),

    c.ultimaCompra && card('Última compra', null,
      h('p', `${formatDate(c.ultimaCompra)} — ${c.diasSemComprar} dia(s) atrás.`),
      c.orcouSempre > 0 && h('p.mini.muted',
        `Conversão de sempre: ${c.orcouSempre ? pct((c.comprouSempre / c.orcouSempre) * 100, 0) : '—'} `
        + 'do que orçou virou nota. É uma razão entre dois totais, não uma taxa por orçamento — '
        + 'o relatório não liga orçamento a pedido.')),

    c.porVendedor.length > 0 && card('Comprou com quem', null,
      h('p.mini.muted', c.porVendedor.length > 1
        ? 'Este cliente comprou de mais de um vendedor. É o que explica carteira repartida.'
        : 'Sempre com o mesmo vendedor.'),
      h('div.empilha', { style: { gap: '4px', marginTop: '8px' } },
        ...c.porVendedor.map((v) => h('div.linha.linha--entre',
          h('span.crescer', v.nome),
          h('span.num', money(v.valor)),
          h('span.mini.muted', { style: { minWidth: '52px', textAlign: 'right' } },
            pct((v.valor / (c.comprouSempre || 1)) * 100, 0)))))),

    c.porMes.length > 0 && secao('Mês a mês', exportadores(() => ({
      titulo: `${c.nome} — mês a mês`,
      nomeArquivo: `cliente_${c.chave}`,
      colunas: [{ header: 'Mês', key: 'mes' }, { header: 'Faturado', key: 'valor', tipo: 'money', alinhar: 'direita' }],
      linhas: c.porMes,
    })),
    tabela({
      colunas: [
        { header: 'Mês', key: 'mes', formatar: (v) => monthLabelShort(v) },
        { header: 'Faturado', key: 'valor', tipo: 'money', alinhar: 'direita' },
      ],
      linhas: c.porMes,
      total: { mes: 'TOTAL', valor: c.comprouSempre },
    })),

    secao(`${c.notas.length} nota(s)`, null, tabela({
      colunas: [
        { header: 'NF', key: 'numero' },
        { header: 'Data', key: 'dataEmissao', tipo: 'data' },
        { header: 'Valor', key: 'valorTotal', tipo: 'money', alinhar: 'direita' },
      ],
      linhas: c.notas.slice(0, 80),
      vazio: 'Nenhuma nota para este cliente.',
    })),

    c.orcamentos.length > 0 && secao(`${c.orcamentos.length} orçamento(s)`, null, tabela({
      colunas: [
        { header: 'Nº', key: 'numero' },
        { header: 'Data', key: 'data', tipo: 'data' },
        { header: 'Situação', key: 'situacao' },
        { header: 'Valor', key: 'valorTotal', tipo: 'money', alinhar: 'direita' },
      ],
      linhas: c.orcamentos.slice(0, 80),
    })));
}

/* ------------------------------------------------------------ exportação */

const COLUNAS_CARTEIRA = [
  { header: 'Cliente', key: 'nome' },
  { header: 'Documento', key: 'documento' },
  { header: 'Comprou no período', key: 'comprouPeriodo', tipo: 'money', alinhar: 'direita' },
  { header: 'NFs', key: 'notasPeriodo', tipo: 'numero', alinhar: 'direita' },
  { header: 'Orçou no período', key: 'orcouPeriodo', tipo: 'money', alinhar: 'direita' },
  { header: 'Comprou sempre', key: 'comprouSempre', tipo: 'money', alinhar: 'direita' },
  { header: 'Última compra', key: 'ultimaCompra', tipo: 'data' },
  { header: 'Dias sem comprar', key: 'diasSemComprar', tipo: 'numero', alinhar: 'direita' },
  { header: 'Vendedor', key: 'vendedorPrincipalNome' },
];

function paraPlanilha(linhas) {
  return linhas.map((l) => ({ ...l, vendedorPrincipalNome: l.vendedores.map((v) => v.nome).join(' / ') || '—' }));
}

function planilha(titulo, arquivo, linhas, filtro, subtitulo) {
  return {
    titulo,
    subtitulo: subtitulo || `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
    nomeArquivo: `${arquivo}_${filtro.de}_${filtro.ate}`,
    colunas: COLUNAS_CARTEIRA,
    linhas: paraPlanilha(linhas),
  };
}

const planilhaCarteira = (r, f) => planilha('Carteira de clientes', 'clientes', r.linhas, f);
const planilhaPararam = (r, f) => planilha('Clientes que pararam de comprar', 'clientes_pararam',
  r.pararam, f, `nada entre ${formatDate(f.de)} e ${formatDate(f.ate)}`);
const planilhaOrcaENaoFecha = (r, f) => planilha('Orçaram e não fecharam', 'clientes_orcaram_sem_fechar',
  r.orcamSemFechar, f);

/**
 * O "Exportar isto" do painel de busca leva exatamente o que está filtrado — as
 * três listas em três abas, para ela mandar inteiro para o pai sem recortar nada.
 */
function exportarCarteira(r, filtro) {
  const aba = (name, linhas) => ({
    name,
    title: `${name} — ${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
    columns: colunasExcel(COLUNAS_CARTEIRA),
    rows: paraPlanilha(linhas),
  });
  exportarExcel(`clientes_${filtro.de}_${filtro.ate}`, [
    aba('Carteira', r.linhas),
    aba('Pararam', r.pararam),
    aba('Orcaram sem fechar', r.orcamSemFechar),
  ]);
}
