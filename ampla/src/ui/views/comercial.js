/**
 * COMERCIAL (item 5)
 * Faturamento D-1, mês, meta, ranking e o detalhe de cada vendedor.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as revenue from '../../logic/revenue.js';
import * as commission from '../../logic/commission.js';
import { origemVendedor } from '../../logic/link.js';
import { definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, rankLinha, aviso, vazio, progresso } from '../components/ui.js';
import { grafLinha, grafBarras } from '../components/chart.js';
import { tabela, exportadores } from '../components/table.js';
import { money, pct, formatDate, monthLabelShort, monthKey, today } from '../../core/format.js';

export async function telaComercial({ query }) {
  const periodo = query.p || 'mes';
  const faixa = revenue.intervalo(periodo, query);
  const [resumo, evolucao, comparacao, mes, meses] = await Promise.all([
    revenue.resumo(faixa),
    revenue.porDia({ de: faixa.de, ate: faixa.ate }),
    revenue.comparar(faixa),
    revenue.mesAtual(),
    revenue.ultimosMeses(6),
  ]);
  definirTitulo('Comercial', faixa.label);

  if (!resumo.notas) {
    return h('div.empilha', { style: { gap: '14px' } },
      chipsPeriodo(periodo, query),
      vazio('📈', 'Sem faturamento no período',
        'Importe as NFs para acompanhar o comercial.',
        botao('Importar vendas', { tipo: 'primario', onClick: () => navigate('/arquivos/nfs') })));
  }

  return h('div.empilha', { style: { gap: '14px' } },
    chipsPeriodo(periodo, query),

    h('div.grade.grade--4',
      kpi({ label: 'Faturamento', valor: money(resumo.total), icone: '🧾', cor: 'info', nota: `${resumo.notas} NFs` }),
      kpi({ label: 'Ticket médio', valor: money(resumo.ticketMedio), icone: '🎫' }),
      kpi({ label: 'Clientes', valor: String(resumo.clientes), icone: '👥' }),
      kpi({
        label: 'Vs. período anterior',
        valor: comparacao.variacao == null ? '—' : pct(comparacao.variacao, 1),
        icone: comparacao.variacao >= 0 ? '▲' : '▼',
        cor: comparacao.variacao >= 0 ? 'ok' : 'ruim',
        nota: `${money(comparacao.anterior.total)} antes`,
      })),

    mes.meta && h('div.card',
      h('div.linha.linha--entre', { style: { marginBottom: '8px' } },
        h('h3', `Meta de ${monthLabelShort(mes.mes)}`),
        h('span.num.forte', pct(mes.percentualMeta, 0))),
      progresso({
        valor: mes.total,
        total: mes.meta,
        cor: mes.percentualMeta >= 100 ? 'var(--verde)' : 'var(--azul)',
        esquerda: `${money(mes.total)} faturados`,
        direita: mes.falta > 0 ? `faltam ${money(mes.falta)}` : 'meta batida 🎉',
      })),

    !resumo.conferencia.ok && h('button.aviso.aviso--ruim', { style: { width: '100%' }, onClick: () => navigate('/conciliacao') },
      h('div.crescer', { style: { textAlign: 'left' } },
        h('strong', 'Faturamento fiscal ≠ soma dos vendedores'),
        h('div.mini', `diferença de ${money(resumo.conferencia.diferenca)} · ${resumo.semVendedor.notas} NF(s) sem vendedor`)),
      h('span', '›')),

    card('Evolução diária', null,
      grafLinha(evolucao.map((d) => ({ rotulo: formatDate(d.data, 'short'), valor: d.valor })), { altura: 140 })),

    card('Últimos meses', null,
      grafBarras(meses.map((m) => ({
        rotulo: monthLabelShort(m.mes),
        valor: m.valor,
        meta: m.meta || null,
        cor: m.mes === monthKey(today()) ? 'var(--azul)' : 'var(--card-3)',
      })), { altura: 150 }),
      h('p.mini.muted', 'A linha tracejada é a meta de cada mês.')),

    secao('Ranking de vendedores',
      exportadores(() => montarExportacaoVendedores(resumo, faixa)),
      card(null, null,
        h('div.rank', ...resumo.ranking.map((v, i) => rankLinha({
          posicao: i + 1,
          nome: v.nome,
          valor: v.valor,
          percentual: v.participacao,
          sub: `${v.notas} NFs · ${v.clientes} clientes · ticket ${money(v.ticket)} · ${pct(v.participacao, 1)}`,
          onClick: () => navigate(`/comercial/${v.vendedorId}?p=${periodo}`),
        }))),
        resumo.semVendedor.notas > 0 && h('button.aviso.aviso--atencao', {
          style: { width: '100%', marginTop: '10px' }, onClick: () => navigate('/conciliacao'),
        },
        h('div.crescer', { style: { textAlign: 'left' } },
          h('strong', `${resumo.semVendedor.notas} NF(s) sem vendedor`),
          h('div.mini', `${money(resumo.semVendedor.valor)} não atribuídos a ninguém`)),
        h('span', '›')))),

    (resumo.canceladas.quantidade > 0 || resumo.devolucoes.quantidade > 0) && card('Fora do faturamento', null,
      h('div.grade',
        kpi({ label: 'NFs canceladas', valor: String(resumo.canceladas.quantidade), nota: money(resumo.canceladas.valor), tamanho: 'p' }),
        kpi({ label: 'Devoluções', valor: String(resumo.devolucoes.quantidade), nota: money(resumo.devolucoes.valor), tamanho: 'p', cor: 'atencao' })),
      h('p.mini.muted', { style: { marginTop: '8px' } },
        'Canceladas não entram. Devoluções entram como valor negativo no mês da emissão.')));
}

function chipsPeriodo(atual, query) {
  return chips(revenue.PERIODOS.filter((p) => p.id !== 'personalizado'), atual,
    (id) => navigate(href('/comercial', { ...query, p: id })));
}

function montarExportacaoVendedores(resumo, faixa) {
  return {
    titulo: 'Faturamento por vendedor',
    subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
    periodo: `Total ${money(resumo.total)} · ${resumo.notas} NFs`,
    nomeArquivo: `comercial_${faixa.de}_a_${faixa.ate}`,
    colunas: [
      { header: 'Vendedor', key: 'nome' },
      { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: 'Participação', key: 'participacao', tipo: 'pct', alinhar: 'direita' },
      { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
      { header: 'Clientes', key: 'clientes', tipo: 'int', alinhar: 'direita' },
      { header: 'Ticket médio', key: 'ticket', tipo: 'money', alinhar: 'direita' },
    ],
    linhas: resumo.ranking,
    total: { nome: 'TOTAL', valor: resumo.total, notas: resumo.notas, clientes: resumo.clientes },
    blocos: [
      {
        tipo: 'kpis',
        itens: [
          { label: 'Faturamento', valor: money(resumo.total) },
          { label: 'NFs', valor: String(resumo.notas) },
          { label: 'Ticket médio', valor: money(resumo.ticketMedio) },
          { label: 'Clientes', valor: String(resumo.clientes) },
        ],
      },
      { tipo: 'barras', titulo: 'Participação', itens: resumo.ranking.map((v) => ({ nome: v.nome, valor: v.valor, rotulo: `${money(v.valor)} (${pct(v.participacao, 0)})` })) },
      {
        tipo: 'tabela',
        titulo: 'Detalhe',
        colunas: [
          { header: 'Vendedor', key: 'nome' },
          { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
          { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
          { header: 'Ticket', key: 'ticket', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: resumo.ranking,
        total: { nome: 'TOTAL', valor: resumo.total, notas: resumo.notas },
      },
    ],
  };
}

/* ---------------------------------------------------------- detalhe do vendedor */

export async function telaVendedor({ params, query }) {
  const periodo = query.p || 'mes';
  const faixa = revenue.intervalo(periodo, query);
  const [detalhe, calculo] = await Promise.all([
    revenue.detalheVendedor(params.id, faixa),
    commission.calcular(monthKey(faixa.ate)),
  ]);
  const nome = detalhe.vendedor?.nome || 'Vendedor';
  definirTitulo(nome, faixa.label);

  const comissao = calculo.vendedores.find((v) => v.vendedorId === params.id);
  const meta = detalhe.vendedor?.meta || 0;

  return h('div.empilha', { style: { gap: '14px' } },
    chips(revenue.PERIODOS.filter((p) => p.id !== 'personalizado'), periodo,
      (id) => navigate(href(`/comercial/${params.id}`, { p: id }))),

    h('div.grade.grade--4',
      kpi({ label: 'Faturamento', valor: money(detalhe.total), icone: '🧾', cor: 'info' }),
      kpi({ label: 'NFs', valor: String(detalhe.notas.length), icone: '📄' }),
      kpi({ label: 'Ticket médio', valor: money(detalhe.ticket), icone: '🎫' }),
      kpi({
        label: 'Comissão do mês', valor: comissao ? money(comissao.comissao) : '—',
        icone: '🎯', cor: 'roxo', onClick: () => navigate('/comissoes'),
      })),

    meta > 0 && card(`Meta individual`, null, progresso({
      valor: detalhe.total, total: meta,
      esquerda: `${money(detalhe.total)}`, direita: `meta ${money(meta)}`,
      cor: detalhe.total >= meta ? 'var(--verde)' : 'var(--azul)',
    })),

    card('Evolução no período', null,
      grafLinha(detalhe.porDia.map((d) => ({ rotulo: formatDate(d.data, 'short'), valor: d.valor })), { altura: 130 })),

    secao('Produtos vendidos',
      exportadores(() => ({
        titulo: `Produtos — ${nome}`,
        subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
        nomeArquivo: `produtos_${nome}_${faixa.de}`,
        colunas: [
          { header: 'Produto', key: 'descricao' },
          { header: 'Quantidade', key: 'quantidade', tipo: 'num', alinhar: 'direita' },
          { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: detalhe.produtos,
        total: { descricao: 'TOTAL', valor: detalhe.total },
      })),
      card(null, null, tabela({
        colunas: [
          { header: 'Produto', key: 'descricao' },
          { header: 'Qtd', key: 'quantidade', tipo: 'num', alinhar: 'direita' },
          { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: detalhe.produtos.slice(0, 25),
        aoClicar: (linha) => navigate(`/produtos/${linha.produtoId}`),
      }))),

    secao('Clientes', null, card(null, null, tabela({
      colunas: [
        { header: 'Cliente', key: 'nome' },
        { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
        { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
      ],
      linhas: detalhe.clientes.slice(0, 25),
    }))),

    secao('Notas fiscais',
      exportadores(() => ({
        titulo: `Notas — ${nome}`,
        subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
        nomeArquivo: `nfs_${nome}_${faixa.de}`,
        colunas: [
          { header: 'NF', key: 'numero' },
          { header: 'Emissão', key: 'dataEmissao', tipo: 'date' },
          { header: 'Cliente', key: 'clienteNome' },
          { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
          { header: 'Vendedor via', key: 'vendedorOrigem', formatar: origemVendedor },
        ],
        linhas: detalhe.notas,
        total: { numero: `${detalhe.notas.length} NFs`, valor: detalhe.total },
      })),
      card(null, null, tabela({
        colunas: [
          { header: 'NF', key: 'numero' },
          { header: 'Emissão', key: 'dataEmissao', tipo: 'date' },
          { header: 'Cliente', key: 'clienteNome' },
          { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
          {
            header: 'Vendedor via',
            key: 'vendedorOrigem',
            formatar: origemVendedor,
          },
        ],
        linhas: detalhe.notas,
      }))),

    aviso('A coluna "Vendedor via" mostra como o app chegou até você: pelo relatório de NFs, '
      + 'pelo pedido, pela ponte do contas a receber, ou porque você definiu à mão. '
      + 'Nada é atribuído por semelhança.', 'info'));
}
