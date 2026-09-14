/**
 * PRODUTOS / CURVA ABC (item 6)
 * Quatro leituras do mesmo estoque de vendas — e a ficha completa de cada produto.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as abc from '../../logic/abc.js';
import * as revenue from '../../logic/revenue.js';
import { definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, vazio, aviso } from '../components/ui.js';
import { grafBarras, barraHorizontal } from '../components/chart.js';
import { tabela, exportadores } from '../components/table.js';
import { money, moneyShort, pct, num, formatDate, monthLabelShort } from '../../core/format.js';

export async function telaProdutos({ query }) {
  const periodo = query.p || 'mes';
  const criterio = query.c || 'faturamento';
  const por = query.g === 'categoria' ? 'categoria' : 'produto';
  const faixa = revenue.intervalo(periodo, query);
  const resultado = await abc.curva({ de: faixa.de, ate: faixa.ate, criterio, por });
  definirTitulo('Produtos', `${faixa.label} · ${abc.CRITERIOS[criterio].label}`);

  if (!resultado.linhas.length && !resultado.foraDaAnalise) {
    return h('div.empilha', { style: { gap: '14px' } },
      chipsPeriodo(periodo, query),
      vazio('📦', 'Sem itens no período',
        'A curva ABC precisa dos itens das notas (XML das NF-e ou relatório de vendas por produto).',
        botao('Importar itens', { tipo: 'primario', onClick: () => navigate('/arquivos/nfItens') })));
  }

  const maiorValor = resultado.linhas[0]?.valorCriterio || 0;

  return h('div.empilha', { style: { gap: '14px' } },
    chipsPeriodo(periodo, query),

    chips(Object.entries(abc.CRITERIOS).map(([id, c]) => ({ id, label: c.label })), criterio,
      (id) => navigate(href('/produtos', { ...query, c: id }))),

    chips([{ id: 'produto', label: 'Por produto' }, { id: 'categoria', label: 'Por categoria' }], por,
      (id) => navigate(href('/produtos', { ...query, g: id }))),

    h('div.grade.grade--3',
      ...resultado.classes.map((c) => kpi({
        label: `Classe ${c.classe}`,
        valor: String(c.quantidade),
        nota: `${pct(c.participacao, 0)} · ${criterio === 'quantidade' ? num(c.valor, 0) : criterio === 'clientes' ? num(c.valor, 0) : money(c.valor)}`,
        cor: c.classe === 'A' ? 'ok' : c.classe === 'B' ? 'atencao' : undefined,
        tamanho: 'p',
      }))),

    resultado.foraDaAnalise && aviso(
      `${resultado.foraDaAnalise.quantidade} produto(s) ficaram fora desta análise por ${resultado.foraDaAnalise.motivo} `
      + `(${money(resultado.foraDaAnalise.faturamento)} de faturamento). O app não estima custo.`,
      'atencao',
      botao('Importar custos', { pequeno: true, onClick: () => navigate('/arquivos/produtos') })),

    card('Top 10', null,
      grafBarras(resultado.linhas.slice(0, 10).map((l) => ({
        rotulo: (l.codigo || l.descricao || '').slice(0, 6),
        valor: l.valorCriterio,
        cor: l.classe === 'A' ? 'var(--verde)' : l.classe === 'B' ? 'var(--amarelo)' : 'var(--card-3)',
      })), {
        altura: 160,
        formatar: criterio === 'faturamento' || criterio === 'margem' ? moneyShort : (v) => num(v, 0),
      })),

    secao('Curva ABC',
      exportadores(() => montarExportacao(resultado, faixa, criterio)),
      h('div.lista', ...resultado.linhas.slice(0, 60).map((linha) => h(
        por === 'produto' ? 'button.item.card--clicavel' : 'div.item',
        { onClick: por === 'produto' ? () => navigate(`/produtos/${encodeURIComponent(linha.produtoId)}?p=${periodo}`) : undefined },
        h('span.abc-classe', { class: `abc-${linha.classe}` }, linha.classe),
        h('div.item__corpo',
          h('div.item__titulo', linha.descricao || linha.codigo),
          h('div.item__sub',
            linha.codigo && h('span', linha.codigo),
            h('span', `${num(linha.quantidade, 0)} ${linha.unidade || 'un'}`),
            h('span', `${linha.clientes} cliente(s)`),
            linha.margemPercentual != null
              ? h('span', { class: linha.margemPercentual < 0 ? 'ruim' : '' }, `margem ${pct(linha.margemPercentual, 1)}`)
              : h('span.muted', 'sem custo')),
          // a barra compara com o primeiro colocado, para dar noção de tamanho
          h('div', { style: { marginTop: '6px' } }, barraHorizontal(
            maiorValor ? (linha.valorCriterio / maiorValor) * 100 : 0,
            linha.classe === 'A' ? 'var(--verde)' : linha.classe === 'B' ? 'var(--amarelo)' : 'var(--muted)',
          ))),
        h('div.empilha',
          h('div.item__valor', criterio === 'quantidade' || criterio === 'clientes'
            ? num(linha.valorCriterio, 0)
            : money(linha.valorCriterio)),
          h('div.mini.muted.dir', `${pct(linha.participacao, 1)} · acum. ${pct(linha.acumuladoPercentual, 0)}`)))))),

    aviso('Classe A = 80% do resultado · B = até 95% · C = a cauda. '
      + 'Troque o critério lá em cima para ver o que vende muito mas rende pouco.', 'info'));
}

function chipsPeriodo(atual, query) {
  return chips(revenue.PERIODOS.filter((p) => p.id !== 'personalizado'), atual,
    (id) => navigate(href('/produtos', { ...query, p: id })));
}

function montarExportacao(resultado, faixa, criterio) {
  return {
    titulo: `Curva ABC por ${abc.CRITERIOS[criterio].label.toLowerCase()}`,
    subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
    nomeArquivo: `curva_abc_${criterio}_${faixa.de}_a_${faixa.ate}`,
    colunas: [
      { header: '#', key: 'posicao', tipo: 'int', alinhar: 'direita' },
      { header: 'Classe', key: 'classe' },
      { header: 'Código', key: 'codigo' },
      { header: 'Descrição', key: 'descricao', largura: 40 },
      { header: 'Categoria', key: 'categoria' },
      { header: 'Quantidade', key: 'quantidade', tipo: 'num', alinhar: 'direita' },
      { header: 'Faturamento', key: 'faturamento', tipo: 'money', alinhar: 'direita' },
      { header: 'Custo', key: 'custo', tipo: 'money', alinhar: 'direita' },
      { header: 'Margem R$', key: 'margem', tipo: 'money', alinhar: 'direita' },
      { header: 'Margem %', key: 'margemPercentual', tipo: 'pct', alinhar: 'direita' },
      { header: 'Clientes', key: 'clientes', tipo: 'int', alinhar: 'direita' },
      { header: 'Participação %', key: 'participacao', tipo: 'pct', alinhar: 'direita' },
      { header: 'Acumulado %', key: 'acumuladoPercentual', tipo: 'pct', alinhar: 'direita' },
    ],
    linhas: resultado.linhas,
    total: { descricao: `${resultado.linhas.length} itens`, faturamento: resultado.linhas.reduce((a, l) => a + l.faturamento, 0) },
  };
}

/* ------------------------------------------------------------ ficha do produto */

export async function telaProduto({ params, query }) {
  const periodo = query.p || 'mes';
  const faixa = revenue.intervalo(periodo, query);
  const id = decodeURIComponent(params.id);
  const [comparacao, evolucao] = await Promise.all([
    abc.compararProduto(id, faixa),
    abc.evolucaoProduto(id, 6, faixa.ate),
  ]);
  const d = comparacao.atual;
  definirTitulo(d.descricao, faixa.label);

  return h('div.empilha', { style: { gap: '14px' } },
    chips(revenue.PERIODOS.filter((p) => p.id !== 'personalizado'), periodo,
      (id2) => navigate(href(`/produtos/${encodeURIComponent(id)}`, { p: id2 }))),

    h('div.grade.grade--4',
      kpi({ label: 'Faturamento', valor: money(d.faturamento), icone: '💰', cor: 'info', nota: variacaoTexto(comparacao.variacaoFaturamento) }),
      kpi({ label: 'Quantidade', valor: num(d.quantidade, 0), icone: '📦', nota: `${d.produto?.unidade || 'un'} · ${variacaoTexto(comparacao.variacaoQuantidade)}` }),
      kpi({
        label: 'Margem', valor: d.margem == null ? '—' : money(d.margem), icone: '📊',
        cor: d.margem == null ? undefined : d.margem >= 0 ? 'ok' : 'ruim',
        nota: d.margemPercentual == null ? 'sem custo cadastrado' : pct(d.margemPercentual, 1),
      }),
      kpi({ label: 'Clientes', valor: String(d.clientes.length), icone: '👥', nota: `${d.notas} NFs` })),

    d.margem == null && aviso('Este produto não tem custo confiável no período — por isso a margem aparece em branco. '
      + 'Importe a planilha de produtos/custos para habilitar a análise de margem.', 'atencao',
    botao('Importar custos', { pequeno: true, onClick: () => navigate('/arquivos/produtos') })),

    card('Ficha', null, h('div.grade',
      linha('Código', d.produto?.codigo || '—'),
      linha('Categoria', d.produto?.categoriaManual || d.produto?.categoria || 'Sem categoria'),
      linha('Unidade', d.produto?.unidade || '—'),
      linha('Fornecedor', d.produto?.fornecedorNome || '—'),
      linha('Preço médio de venda', d.precoMedio == null ? '—' : money(d.precoMedio)),
      linha('Custo no período', d.custo == null ? '—' : money(d.custo)))),

    card('Evolução (6 meses)', null,
      grafBarras(evolucao.map((e) => ({ rotulo: monthLabelShort(e.mes), valor: e.valor })), { altura: 140 })),

    card('Comparação com o período anterior', null, h('div.comparativo',
      h('div',
        h('div.comparativo__tag', 'Agora'),
        h('div.kpi__valor.kpi__valor--p.num', money(d.faturamento)),
        h('div.mini.muted', `${num(d.quantidade, 0)} ${d.produto?.unidade || 'un'}`)),
      h('div',
        h('div.comparativo__tag', `Anterior (${formatDate(comparacao.anterior.periodo.de, 'short')}–${formatDate(comparacao.anterior.periodo.ate, 'short')})`),
        h('div.kpi__valor.kpi__valor--p.num', money(comparacao.anterior.faturamento)),
        h('div.mini.muted', `${num(comparacao.anterior.quantidade, 0)} ${d.produto?.unidade || 'un'}`)))),

    secao('Clientes que compram', null, card(null, null, tabela({
      colunas: [
        { header: 'Cliente', key: 'nome' },
        { header: 'Qtd', key: 'quantidade', tipo: 'num', alinhar: 'direita' },
        { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
      ],
      linhas: d.clientes.slice(0, 20),
    }))),

    d.vendedores.length > 0 && secao('Vendedores', null, card(null, null, tabela({
      colunas: [
        { header: 'Vendedor', key: 'nome' },
        { header: 'Qtd', key: 'quantidade', tipo: 'num', alinhar: 'direita' },
        { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
      ],
      linhas: d.vendedores,
    }))),

    secao('Vendas no período',
      exportadores(() => ({
        titulo: `Produto — ${d.descricao}`,
        subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
        nomeArquivo: `produto_${(d.produto?.codigo || id).slice(0, 20)}_${faixa.de}`,
        colunas: [
          { header: 'NF', key: 'nfNumero' },
          { header: 'Data', key: 'data', tipo: 'date' },
          { header: 'Cliente', key: 'cliente' },
          { header: 'Vendedor', key: 'vendedor' },
          { header: 'Qtd', key: 'quantidade', tipo: 'num', alinhar: 'direita' },
          { header: 'Unitário', key: 'valorUnitario', tipo: 'money', alinhar: 'direita' },
          { header: 'Total', key: 'valorTotal', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: d.itens,
        total: { nfNumero: `${d.itens.length} vendas`, quantidade: d.quantidade, valorTotal: d.faturamento },
      })),
      card(null, null, tabela({
        colunas: [
          { header: 'NF', key: 'nfNumero' },
          { header: 'Data', key: 'data', tipo: 'date' },
          { header: 'Cliente', key: 'cliente' },
          { header: 'Qtd', key: 'quantidade', tipo: 'num', alinhar: 'direita' },
          { header: 'Total', key: 'valorTotal', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: d.itens.slice(0, 50),
      }))));
}

function linha(rotulo, valor) {
  return h('div.empilha', h('span.mini.muted', rotulo), h('span.forte', valor));
}

function variacaoTexto(v) {
  if (v == null || !Number.isFinite(v)) return 'sem base anterior';
  return `${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v), 1)} vs. anterior`;
}
