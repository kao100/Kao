/**
 * COMERCIAL (item 5)
 * Faturamento D-1, mês, meta, ranking e o detalhe de cada vendedor.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as revenue from '../../logic/revenue.js';
import * as commission from '../../logic/commission.js';
import { origemVendedor } from '../../logic/link.js';
import { definirTitulo } from '../shell.js';
import { kpi, chips, card, secao, botao, rankLinha, aviso, vazio, progresso } from '../components/ui.js';
import { tabela, exportadores, exportarPlanilha } from '../components/table.js';
import { lerFiltro, descrever, listaDePessoas } from '../../logic/filtro.js';
import { dreComercial, linhasDoDre } from '../../logic/comercial.js';
import { escada } from '../components/escada.js';
import { filtroAvancado, nadaNoRecorte } from '../components/filtro.js';
import { money, pct, num, formatDate, monthLabelShort, monthKey, today } from '../../core/format.js';

export async function telaComercial({ query }) {
  const busca = lerFiltro(query);
  const faixa = { de: busca.de, ate: busca.ate, label: busca.label };
  const [resumo, comparacao, mes, meses, vendedores, cadastroClientes, fornecedores] = await Promise.all([
    revenue.resumo(faixa),
    revenue.comparar(faixa),
    revenue.mesAtual(),
    revenue.ultimosMeses(6),
    store.vendedores.listar(),
    store.clientes.listar(),
    store.fornecedores.listar(),
  ]);
  definirTitulo('Comercial', descrever(busca, { vendedores }));

  const painel = filtroAvancado({
    rota: '/comercial',
    filtro: busca,
    vendedores,
    pessoas: listaDePessoas({ clientes: cadastroClientes, fornecedores, vendedores }),
    rotuloData: 'Emissão da nota',
    rotuloBusca: 'Buscar cliente, NF ou documento',
    aoExportar: () => exportarPlanilha(montarExportacaoVendedores(resumo, faixa)),
  });

  if (!resumo.notas) {
    const notas = await store.nfs.listar();
    const datas = notas.map((n) => n.dataEmissao).filter(Boolean).sort();
    return h('div.empilha', { style: { gap: '14px' } },
      painel,
      nadaNoRecorte({
        rota: '/comercial', rotulo: 'nota',
        primeiraData: datas[0], ultimaData: datas[datas.length - 1],
      }),
      !datas.length && vazio('📈', 'Sem faturamento ainda',
        'Importe as NFs para acompanhar o comercial.',
        botao('Importar vendas', { tipo: 'primario', onClick: () => navigate('/arquivos/nfs') })));
  }

  /**
   * O DRE comercial sai da MESMA conta da tela Margem, e não de uma cópia dela.
   * Duas contas separadas para o mesmo número foi exatamente o erro que ela
   * apontou — e que custou duas telas discordando do faturamento.
   */
  const d = await dreComercial(faixa);

  return h('div.empilha', { style: { gap: '14px' } },
    painel,

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

    secao('DRE comercial',
      exportadores(() => montarExportacaoDre(d, faixa)),
      h('div.empilha', { style: { gap: '10px' } },
        h('div.grade.grade--4',
          kpi({
            label: 'Vendas líquidas', valor: money(d.vendasLiquidas), icone: '📦',
            nota: 'base da margem', tamanho: 'p',
          }),
          kpi({
            label: 'CMV (custo)', valor: money(d.cmv), icone: '🏷️', cor: 'laranja',
            nota: d.percentualCmv == null ? null : `${pct(d.percentualCmv, 1)} da líquida`,
            tamanho: 'p',
          }),
          kpi({
            label: 'Lucro bruto', valor: money(d.lucroBruto), icone: '📈', cor: 'ok',
            nota: 'líquida − CMV', tamanho: 'p',
          }),
          kpi({
            label: '% Lucro bruto',
            valor: d.percentualLucroBruto == null ? '—' : pct(d.percentualLucroBruto, 1),
            icone: '🎯', cor: 'info', nota: 'sobre a líquida', tamanho: 'p',
          })),

        escada(linhasDoDre(d), { rotuloPercentual: '% das vendas líquidas' }),

        h('p.mini.muted', 'Os percentuais à direita são sobre as VENDAS LÍQUIDAS, '
          + 'que é a base da margem. Clique numa linha com seta para abrir o que está dentro dela.'),

        ...d.avisos.map((a) => aviso(a.texto, a.nivel === 'info' ? 'info' : 'atencao')),

        !d.conferencia.ok && aviso(`O faturamento pelas notas (${money(d.conferencia.pelasNotas)}) `
          + `e pela margem (${money(d.conferencia.pelaMargem)}) estão diferentes em `
          + `${money(Math.abs(d.conferencia.diferenca))}. Abra "Margem e frete": é lá que a `
          + 'diferença tem nome.', 'atencao',
        botao('Ver a margem', { pequeno: true, onClick: () => navigate(href('/margem', query)) })),

        h('p.mini.muted',
          `${num(d.itensVendidos.linhas, 0)} linha(s) de produto nas notas · `
          + `${num(d.itensVendidos.produtos, 0)} produto(s) diferentes · `
          + `ticket médio ${money(d.ticketMedio)}. `
          + 'A margem é medida só sobre a mercadoria: o frete cobrado fica fora da base, '
          + 'porque o custo dele não é todo conhecido. O resultado do frete está em '
          + '"Margem e frete", em cobrado × pago.'))),

    /**
     * O GRÁFICO SAIU. "Eu não preciso dele. Ele está mais atrapalhando do que
     * ajudando. É bom ter as informações 100% ali, bem perfeitinhas."
     *
     * No lugar, os mesmos meses em NÚMERO, que é o que ela confere: faturado,
     * meta, e quanto faltou ou passou. Uma barra desenhada não some conferir.
     */
    secao('Últimos meses',
      exportadores(() => ({
        titulo: 'Faturamento mês a mês',
        nomeArquivo: `meses_${faixa.de}`,
        colunas: COLUNAS_MESES,
        linhas: linhasDosMeses(meses),
      })),
      tabela({
        colunas: COLUNAS_MESES,
        linhas: linhasDosMeses(meses),
        total: {
          mesLabel: 'TOTAL',
          valor: meses.reduce((a, m) => a + (m.valor || 0), 0),
          meta: meses.reduce((a, m) => a + (m.meta || 0), 0),
        },
      })),

    secao('Ranking de vendedores',
      exportadores(() => montarExportacaoVendedores(resumo, faixa)),
      card(null, null,
        h('div.rank', ...resumo.ranking.map((v, i) => rankLinha({
          posicao: i + 1,
          nome: v.nome,
          valor: v.valor,
          percentual: v.participacao,
          sub: `${v.notas} NFs · ${v.clientes} clientes · ticket ${money(v.ticket)} · ${pct(v.participacao, 1)}`,
          onClick: () => navigate(href(`/comercial/${v.vendedorId}`, query)),
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

const COLUNAS_MESES = [
  { header: 'Mês', key: 'mesLabel' },
  { header: 'Faturado', key: 'valor', tipo: 'money', alinhar: 'direita' },
  { header: 'Meta', key: 'meta', tipo: 'money', alinhar: 'direita' },
  { header: 'Diferença', key: 'diferenca', tipo: 'money', alinhar: 'direita' },
  { header: 'NFs', key: 'notas', tipo: 'numero', alinhar: 'direita' },
];

function linhasDosMeses(meses) {
  return meses.map((m) => ({
    mesLabel: monthLabelShort(m.mes),
    valor: m.valor || 0,
    meta: m.meta || null,
    diferenca: m.meta ? (m.valor || 0) - m.meta : null,
    notas: m.notas ?? null,
  }));
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

function montarExportacaoDre(d, faixa) {
  const linhas = linhasDoDre(d).map((l) => ({
    conta: `${l.sinal === '−' ? '(−) ' : ''}${l.rotulo}`,
    valor: l.valor,
    percentual: l.percentual,
  }));
  return {
    titulo: 'DRE comercial',
    subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
    periodo: `Vendas líquidas ${money(d.vendasLiquidas)} · lucro bruto ${money(d.lucroBruto)}`,
    nomeArquivo: `dre_comercial_${faixa.de}_a_${faixa.ate}`,
    colunas: [
      { header: 'Conta', key: 'conta' },
      { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
      { header: '% da líquida', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
    ],
    linhas,
    blocos: [
      {
        tipo: 'kpis',
        itens: [
          { label: 'Faturamento', valor: money(d.faturamento) },
          { label: 'Vendas líquidas', valor: money(d.vendasLiquidas) },
          { label: 'CMV', valor: money(d.cmv) },
          { label: 'Lucro bruto', valor: money(d.lucroBruto) },
          { label: '% CMV', valor: d.percentualCmv == null ? '—' : pct(d.percentualCmv, 1) },
          { label: '% Lucro bruto', valor: d.percentualLucroBruto == null ? '—' : pct(d.percentualLucroBruto, 1) },
        ],
      },
      {
        tipo: 'tabela',
        titulo: 'A conta, de cima para baixo',
        colunas: [
          { header: 'Conta', key: 'conta' },
          { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
          { header: '% da líquida', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
        ],
        linhas,
      },
    ],
  };
}

/* ---------------------------------------------------------- detalhe do vendedor */

export async function telaVendedor({ params, query }) {
  const busca = lerFiltro(query);
  const faixa = { de: busca.de, ate: busca.ate, label: busca.label };
  const [detalhe, calculo] = await Promise.all([
    revenue.detalheVendedor(params.id, faixa),
    commission.calcular(monthKey(faixa.ate)),
  ]);
  const nome = detalhe.vendedor?.nome || 'Vendedor';
  definirTitulo(nome, busca.label);

  const comissao = calculo.vendedores.find((v) => v.vendedorId === params.id);
  const meta = detalhe.vendedor?.meta || 0;

  return h('div.empilha', { style: { gap: '14px' } },
    filtroAvancado({
      rota: `/comercial/${params.id}`,
      filtro: busca,
      rotuloData: 'Emissão da nota',
      rotuloBusca: 'Buscar cliente ou NF',
    }),

    botao('‹ Voltar para o comercial', { onClick: () => navigate(href('/comercial', query)) }),

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
