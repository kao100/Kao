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
import { grafBarras } from '../components/chart.js';
import { tabela, exportadores } from '../components/table.js';
import { money, pct, formatDate, monthLabelShort } from '../../core/format.js';

export async function telaOrcamentos({ query }) {
  const periodo = query.p || 'mes';
  const faixa = revenue.intervalo(periodo, query);
  const [r, serie] = await Promise.all([
    quotes.resumo(faixa),
    quotes.porMes(6, faixa.ate),
  ]);
  definirTitulo('Orçamentos', faixa.label);

  const chipsPeriodo = chips(revenue.PERIODOS.filter((p) => p.id !== 'personalizado'), periodo,
    (id) => navigate(href('/orcamentos', { ...query, p: id })));

  if (!r.quantidade) {
    return h('div.empilha', { style: { gap: '14px' } },
      chipsPeriodo,
      vazio('📝', 'Sem orçamentos no período',
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

    card('Orçado por mês', null,
      grafBarras(serie.map((m) => ({
        rotulo: monthLabelShort(m.mes),
        valor: m.orcado,
        meta: m.convertido || null,
        cor: 'var(--card-3)',
      })), { altura: 150 }),
      h('p.mini.muted', 'A barra é o total orçado; a linha tracejada é o que virou venda.')),

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
