/**
 * ORÇAMENTOS — quanto foi orçado e quanto virou venda.
 *
 * A conversão é a que o próprio relatório informa na coluna SITUAÇÃO. O app não
 * cruza orçamento com pedido por cliente e valor parecido: sem a coluna do
 * pedido no export, isso seria inventar vínculo.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as quotes from '../../logic/quotes.js';
import * as revenue from '../../logic/revenue.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, chips, secao, botao, aviso, vazio, progresso, rankLinha } from '../components/ui.js';
import { tabela, exportadores, exportarPlanilha } from '../components/table.js';
import { lerFiltro, descrever } from '../../logic/filtro.js';
import { filtroAvancado, nadaNoRecorte } from '../components/filtro.js';
import * as store from '../../core/store.js';
import { money, pct, formatDate, monthLabelShort } from '../../core/format.js';

export async function telaOrcamentos({ query }) {
  const busca = lerFiltro(query);
  const faixa = { de: busca.de, ate: busca.ate, label: busca.label };
  const [r, serie, vendedores] = await Promise.all([
    quotes.resumo(faixa),
    quotes.porMes(6, faixa.ate),
    store.vendedores.listar(),
  ]);
  definirTitulo('Orçamentos', descrever(busca, { vendedores }));

  const chipsPeriodo = filtroAvancado({
    rota: '/orcamentos',
    filtro: busca,
    rotuloData: 'Data do orçamento',
    rotuloBusca: 'Buscar cliente ou número do orçamento',
    aoExportar: () => exportarPlanilha({
      titulo: 'Orçamentos', subtitulo: busca.label,
      nomeArquivo: `orcamentos_${busca.de}_${busca.ate}`,
      colunas: COLUNAS_MESES_ORC, linhas: linhasDosMeses(serie),
    }),
  });

  if (!r.quantidade) {
    const todos = await store.orcamentos.listar();
    const datas = todos.map((o) => o.data).filter(Boolean).sort();
    return h('div.empilha', { style: { gap: '14px' } },
      chipsPeriodo,
      nadaNoRecorte({
        rota: '/orcamentos', rotulo: 'orçamento',
        primeiraData: datas[0], ultimaData: datas[datas.length - 1],
      }),
      !datas.length && vazio('📝', 'Sem orçamentos ainda',
        'Importe o relatório de orçamentos para acompanhar quanto vira venda.',
        botao('Importar orçamentos', { tipo: 'primario', onClick: () => navigate('/arquivos/orcamentos') })));
  }

  return h('div.empilha', { style: { gap: '14px' } },
    chipsPeriodo,

    h('div.grade.grade--3',
      kpi({ label: 'Orçado', valor: money(r.total), icone: '📝', nota: `${r.quantidade} orçamento(s)` }),
      kpi({
        label: 'Virou venda',
        valor: r.taxa == null ? '—' : pct(r.taxa, 0),
        icone: '✅',
        cor: r.taxa == null ? undefined : (r.taxa >= 50 ? 'ok' : 'atencao'),
        nota: r.taxa == null ? 'nada decidido ainda' : `${r.convertido.quantidade} de ${r.decididos} decididos`,
      }),
      kpi({ label: 'Ticket médio orçado', valor: money(r.ticketMedio), icone: '🎫' })),

    r.taxa != null && card('Do que já foi decidido', null,
      progresso({
        valor: r.convertido.valor,
        total: r.convertido.valor + r.perdido.valor,
        cor: 'var(--verde)',
        esquerda: `${money(r.convertido.valor)} virou venda`,
        direita: `${money(r.perdido.valor)} perdido`,
      }),
      h('p.mini.muted', { style: { marginTop: '8px' } },
        'Em valor, a conversão é de '
        + `${r.taxaValor == null ? '—' : pct(r.taxaValor, 0)}. `
        + 'Orçamento em aberto fica fora da conta: ainda pode virar venda.')),

    card('Situação dos orçamentos', null,
      h('div.empilha', { style: { gap: '8px' } },
        ...r.grupos.map((g) => {
          const s = quotes.SITUACOES[g.situacao];
          return h('div.linha.linha--entre',
            h('span.crescer', `${s.icone} ${s.label}`),
            h('span.mini.muted', `${g.quantidade}`),
            h('span.num.forte', money(g.valor)));
        })),
      r.semSituacao > 0 && h('p.mini.muted', { style: { marginTop: '8px' } },
        `${r.semSituacao} orçamento(s) vieram sem situação no arquivo. Eles entram no total orçado, `
        + 'mas ficam fora da taxa de conversão — o app não decide por eles.')),

    // o gráfico saiu: ela quer o número conferível, não o desenho
    secao('Orçado por mês',
      exportadores(() => ({
        titulo: 'Orçado por mês', nomeArquivo: `orcado_por_mes_${busca.de}`,
        colunas: COLUNAS_MESES_ORC, linhas: linhasDosMeses(serie),
      })),
      tabela({ colunas: COLUNAS_MESES_ORC, linhas: linhasDosMeses(serie) })),

    r.abertos.length > 0 && secao(`Em aberto — ${r.abertos.length}`,
      exportadores(() => ({
        titulo: 'Orçamentos em aberto',
        subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
        nomeArquivo: `orcamentos_abertos_${faixa.de}`,
        colunas: COLUNAS,
        linhas: r.abertos,
      })),
      card(null, null,
        tabela({ colunas: COLUNAS, linhas: r.abertos }),
        h('p.mini.muted', { style: { marginTop: '8px' } },
          'Do maior para o menor: é onde uma ligação rende mais.'))),

    secao('Por cliente',
      exportadores(() => ({
        titulo: 'Orçamentos por cliente',
        subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
        nomeArquivo: `orcamentos_clientes_${faixa.de}`,
        colunas: [
          { header: 'Cliente', key: 'nome' },
          { header: 'Orçado', key: 'valor', tipo: 'money', alinhar: 'direita' },
          { header: 'Orçamentos', key: 'quantidade', tipo: 'int', alinhar: 'direita' },
          { header: 'Virou venda', key: 'taxa', tipo: 'pct', alinhar: 'direita' },
        ],
        linhas: r.porCliente,
        total: { nome: 'TOTAL', valor: r.total, quantidade: r.quantidade },
      })),
      card(null, null,
        h('div.rank', ...r.porCliente.slice(0, 12).map((c, i) => rankLinha({
          posicao: i + 1,
          nome: c.nome,
          valor: c.valor,
          percentual: r.total ? (c.valor / r.total) * 100 : 0,
          sub: `${c.quantidade} orçamento(s) · ${c.taxa == null ? 'sem decisão' : `${pct(c.taxa, 0)} virou venda`}`,
        }))))),

    aviso('A conversão é a que o seu sistema informa na coluna SITUAÇÃO. O app não tenta '
      + 'casar orçamento com pedido por cliente e valor parecido — sem o número do pedido no '
      + 'export, isso seria adivinhar.', 'info'));
}

const COLUNAS = [
  { header: 'Nº', key: 'numero' },
  { header: 'Cliente', key: 'clienteNome' },
  { header: 'Data', key: 'data', tipo: 'date' },
  { header: 'Valor', key: 'valorTotal', tipo: 'money', alinhar: 'direita' },
];

const COLUNAS_MESES_ORC = [
  { header: 'Mês', key: 'mesLabel' },
  { header: 'Orçado', key: 'orcado', tipo: 'money', alinhar: 'direita' },
  { header: 'Virou venda', key: 'convertido', tipo: 'money', alinhar: 'direita' },
  { header: '% convertido', key: 'taxa', tipo: 'pct', alinhar: 'direita' },
];

function linhasDosMeses(serie) {
  return serie.map((m) => ({
    mesLabel: monthLabelShort(m.mes),
    orcado: m.orcado || 0,
    convertido: m.convertido || 0,
    taxa: m.orcado ? (m.convertido / m.orcado) * 100 : null,
  }));
}
