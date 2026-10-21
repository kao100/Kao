/**
 * COMPRAS — quanto da receita está virando estoque.
 *
 * "Essa aba é importante, esse acompanhamento, essa meta. (…) vendas líquidas,
 *  meta de compras, compras realizadas, abaixo da meta, tá ótimo, porque a
 *  gente já tá no negativo."
 *
 * A meta é o número DELA, e o app não chega com um pronto — ver o item no
 * módulo. Sem meta, a tela mostra o percentual realizado, que já responde
 * metade da pergunta, e abre espaço para ela escrever o resto.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as comprasMod from '../../logic/compras.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, chips, aviso, selo, progresso } from '../components/ui.js';
import { grafBarras, barraHorizontal } from '../components/chart.js';
import { tabela, exportadores } from '../components/table.js';
import { formulario } from '../components/sheet.js';
import { ok } from '../components/toast.js';
import {
  money, pct, num, formatDate, monthKey, monthLabel, monthLabelShort, addMonths, today,
} from '../../core/format.js';

export async function telaCompras({ query }) {
  const mes = query.m || monthKey(today());
  const r = await comprasMod.compras({ mes });
  definirTitulo('Compras', monthLabel(mes));
  const a = r.atual;

  return h('div.empilha', { style: { gap: '14px' } },
    seletorDeMes(mes),

    !r.sabeOQueECompra && aviso(
      'Nenhuma conta do seu plano está marcada como COMPRA DE MERCADORIA, então o app ainda não '
      + 'sabe quais lançamentos são compra — e o que você vê abaixo seria zero por falta de '
      + 'informação, não por falta de compra. Marque as contas no DRE gerencial.',
      'atencao',
      botao('Marcar no DRE', { pequeno: true, onClick: () => navigate(href('/dre', { m: mes })) })),

    h('div.grade.grade--4',
      kpi({
        label: 'Receita líquida', valor: money(a.receitaLiquida), icone: '🧾', tamanho: 'p',
        nota: `faturamento ${money(a.faturamento)} − impostos ${money(a.impostos)}`,
      }),
      kpi({
        label: 'Meta de compras',
        valor: a.meta == null ? '—' : money(a.meta),
        icone: '🎯', tamanho: 'p',
        nota: r.metaPercentual == null ? 'defina a sua' : `${pct(r.metaPercentual, 0)} da líquida`,
        onClick: () => pedirMeta(r),
      }),
      kpi({
        label: 'Compras realizadas', valor: money(a.comprado), icone: '📦', tamanho: 'p',
        nota: a.percentual == null ? null : `${pct(a.percentual, 1)} da líquida`,
      }),
      kpi({
        label: a.dentroDaMeta === null ? 'Sem meta definida'
          : (a.dentroDaMeta ? 'Abaixo da meta' : 'Acima da meta'),
        valor: a.diferenca == null ? '—' : money(Math.abs(a.diferenca)),
        icone: a.dentroDaMeta === null ? '❓' : (a.dentroDaMeta ? '✅' : '⚠️'),
        cor: a.dentroDaMeta === null ? undefined : (a.dentroDaMeta ? 'ok' : 'ruim'),
        tamanho: 'p',
        nota: a.dentroDaMeta === null ? 'toque na meta ao lado'
          : (a.dentroDaMeta ? 'sobrou de margem para comprar' : 'passou do que você definiu'),
      })),

    card('A meta é sua', botao(r.metaPercentual == null ? 'Definir' : 'Trocar',
      { pequeno: true, onClick: () => pedirMeta(r) }),
    r.metaPercentual == null
      ? h('p.pequeno.muted',
        'O app não chega com uma meta pronta de propósito. Os 70% do relatório que você recebeu '
        + 'são de outra empresa, e você já disse que acha muito — inventar outro número no lugar '
        + 'seria o mesmo erro com outra cara. Diga a sua e esta tela passa a cobrar ela.')
      : progresso({
        valor: a.comprado,
        total: a.meta || 1,
        cor: a.dentroDaMeta ? 'var(--verde)' : 'var(--vermelho)',
        esquerda: `${money(a.comprado)} comprados`,
        direita: `meta ${money(a.meta)} (${pct(r.metaPercentual, 0)} da líquida)`,
      })),

    secao('Acompanhamento mês a mês',
      exportadores(() => ({
        titulo: 'Compras × meta, mês a mês',
        nomeArquivo: `compras_meses_${mes}`,
        colunas: COLUNAS_MES,
        linhas: linhasDosMeses(r),
      })),
      card(null, null,
        grafBarras(r.porMes.map((l) => ({
          rotulo: monthLabelShort(l.mes).slice(0, 3),
          valor: l.comprado,
          meta: l.meta || null,
          cor: l.dentroDaMeta === false ? 'var(--vermelho)' : 'var(--azul)',
        })), { altura: 160 }),
        h('p.mini.muted', { style: { margin: '4px 0 10px' } },
          'A barra é o comprado; o traço, a meta daquele mês. Barra vermelha passou da meta.'),
        tabela({ colunas: COLUNAS_MES, linhas: linhasDosMeses(r) }))),

    secao('Semana a semana', null,
      card(null, null,
        grafBarras(r.semanas.map((s) => ({ rotulo: s.rotulo, valor: s.valor })), { altura: 140 }),
        tabela({
          colunas: [
            { header: 'Semana', key: 'semana' },
            { header: 'Comprado', key: 'valor', tipo: 'money', alinhar: 'direita' },
            { header: 'Lançamentos', key: 'itens', tipo: 'int', alinhar: 'direita' },
          ],
          linhas: r.semanas.map((s) => ({
            semana: `${formatDate(s.inicio, 'short')} a ${formatDate(s.fim, 'short')}`,
            valor: s.valor, itens: s.itens,
          })),
          total: { semana: 'TOTAL', valor: a.comprado },
        }))),

    secao('Ranking de fornecedores',
      exportadores(() => ({
        titulo: 'Compras por fornecedor',
        subtitulo: monthLabel(mes),
        nomeArquivo: `compras_fornecedores_${mes}`,
        colunas: COLUNAS_FORNECEDOR,
        linhas: r.fornecedores.linhas,
        total: { nome: 'TOTAL', valor: r.fornecedores.total },
      })),
      card(null, null,
        r.fornecedores.linhas.length
          ? h('div.empilha', { style: { gap: '8px' } },
            ...r.fornecedores.linhas.slice(0, 15).map((f) => h('div',
              h('div.linha.linha--entre', { style: { gap: '10px' } },
                h('span.pequeno.crescer', { style: { minWidth: 0 } }, f.nome),
                selo(f.classe, f.classe === 'A' ? 'info' : undefined),
                h('span.num.pequeno', money(f.valor)),
                h('span.mini.muted', pct(f.percentual, 1))),
              barraHorizontal(f.percentual, 'var(--azul)'),
              h('span.mini.muted', `${f.itens} lançamento(s)`))))
          : h('p.pequeno.muted', 'Nenhuma compra marcada neste mês.'),
        h('p.mini.muted', { style: { marginTop: '10px' } },
          'Quem está no topo é com quem você tem argumento: "eu compro isto de você, preciso de '
          + 'outra condição". A classe A é quem forma os primeiros 80% da compra do mês.'))),

    r.lancamentos.length > 0 && secao('Compras do mês, uma a uma',
      exportadores(() => ({
        titulo: 'Compras do mês',
        subtitulo: monthLabel(mes),
        nomeArquivo: `compras_${mes}`,
        colunas: COLUNAS_LANC,
        linhas: r.lancamentos,
        total: { fornecedor: 'TOTAL', valor: a.comprado },
      })),
      card(null, null, tabela({ colunas: COLUNAS_LANC, linhas: r.lancamentos }))));
}

const COLUNAS_MES = [
  { header: 'Mês', key: 'mesLabel' },
  { header: 'Receita líquida', key: 'receitaLiquida', tipo: 'money', alinhar: 'direita' },
  { header: 'Meta', key: 'meta', tipo: 'money', alinhar: 'direita' },
  { header: 'Comprado', key: 'comprado', tipo: 'money', alinhar: 'direita' },
  { header: '% da líquida', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
  { header: 'Diferença', key: 'diferenca', tipo: 'money', alinhar: 'direita' },
];

const COLUNAS_FORNECEDOR = [
  { header: 'Classe', key: 'classe' },
  { header: 'Fornecedor', key: 'nome' },
  { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
  { header: '%', key: 'percentual', tipo: 'pct', alinhar: 'direita' },
  { header: 'Lançamentos', key: 'itens', tipo: 'int', alinhar: 'direita' },
];

const COLUNAS_LANC = [
  { header: 'Fornecedor', key: 'fornecedor' },
  { header: 'Descrição', key: 'descricao' },
  { header: 'Vencimento', key: 'vencimento', tipo: 'date' },
  { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
];

function linhasDosMeses(r) {
  return r.porMes.map((l) => ({
    mesLabel: monthLabelShort(l.mes),
    receitaLiquida: l.receitaLiquida,
    meta: l.meta,
    comprado: l.comprado,
    percentual: l.percentual,
    diferenca: l.diferenca,
  }));
}

function seletorDeMes(mes) {
  const meses = [];
  for (let i = 0; i < 6; i += 1) meses.push(monthKey(addMonths(`${mes}-01`, -i)));
  return chips(meses.reverse().map((m) => ({ id: m, label: monthLabelShort(m) })), mes,
    (id) => navigate(href('/compras', { m: id })));
}

async function pedirMeta(r) {
  const resposta = await formulario({
    titulo: 'Meta de compras',
    descricao: 'Quanto da receita líquida você aceita que vire compra de mercadoria no mês.\n\n'
      + 'Deixe em branco para tirar a meta. Ela vale para todos os meses, e você troca quando '
      + 'quiser — a tela guarda o número, não o julga.',
    campos: [{
      chave: 'percentual',
      label: 'Meta (% da receita líquida)',
      tipo: 'numero',
      valor: r.metaPercentual ?? '',
      ajuda: 'Por exemplo: 55 para "não passar de 55% da receita líquida".',
    }],
    confirmar: 'Guardar meta',
  });
  if (!resposta) return;
  const valor = await comprasMod.definirMeta(resposta.percentual);
  ok(valor == null ? 'Meta removida.' : `Meta de ${valor}% guardada.`);
  refresh();
}
