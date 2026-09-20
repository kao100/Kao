/**
 * RELATÓRIO DO DIA — a tela de abertura.
 *
 * Quanto vendemos, quanto falta para a meta, se o ritmo chega lá e quem precisa
 * vender mais. Sai inteiro em PDF ou Excel, para mandar para quem precisa ver.
 *
 * Não tem nenhum botão de marcar: entra relatório, sai relatório.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as diario from '../../logic/diario.js';
import * as quotes from '../../logic/quotes.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, botao, aviso, vazio, progresso, chips } from '../components/ui.js';
import { grafLinha } from '../components/chart.js';
import { tabela } from '../components/table.js';
import { exportarExcel, imprimir, colunasExcel } from '../../logic/reports.js';
import { money, pct, formatDate, today, addDays, monthLabel } from '../../core/format.js';

export async function telaDiario({ query }) {
  const data = query.d || today();
  const r = await diario.relatorio(data);
  const recados = diario.recados(r);
  const orc = await quotes.resumo({ de: `${r.mes}-01`, ate: data }).catch(() => null);
  definirTitulo('Relatório do dia', formatDate(data));

  if (!r.mesAteHoje.notas && !r.dia.notas) {
    return h('div.empilha', { style: { gap: '14px' } },
      seletorDia(data),
      vazio('📊', 'Sem faturamento neste mês',
        'Mande o relatório fiscal do dia e o relatório de vendas — o resto o app monta.',
        botao('Importar', { tipo: 'primario', onClick: () => navigate('/arquivos') })));
  }

  const m = r.meta;
  const ritmo = r.ritmo;

  return h('div.empilha', { style: { gap: '14px' } },
    seletorDia(data),

    h('div.grade.grade--2',
      kpi({
        label: `Vendas de ${formatDate(data, 'short')}`,
        valor: money(r.dia.total),
        icone: '🧾',
        nota: `${r.dia.notas} NF(s)`,
        cor: r.dia.bateuMeta == null ? undefined : (r.dia.bateuMeta ? 'ok' : 'atencao'),
      }),
      kpi({
        label: 'No mês até hoje',
        valor: money(r.mesAteHoje.total),
        icone: '📈',
        nota: m.percentual == null ? `${r.mesAteHoje.notas} NFs` : `${pct(m.percentual, 0)} da meta`,
      })),

    m.diaria != null && card('A meta de hoje', null,
      progresso({
        valor: Math.min(r.dia.total, m.diaria),
        total: m.diaria,
        cor: r.dia.bateuMeta ? 'var(--verde)' : 'var(--amarelo)',
        esquerda: `${money(r.dia.total)} vendidos`,
        direita: `meta do dia ${money(m.diaria)}`,
      }),
      h('p.mini.muted', { style: { marginTop: '8px' } },
        r.dia.bateuMeta
          ? `Bateu, com ${money(r.dia.vsMeta)} a mais.`
          : `Faltaram ${money(Math.abs(r.dia.vsMeta))} para a meta do dia.`)),

    m.valor && card(`Meta de ${monthLabel(r.mes)}`,
      h('span.num.forte', pct(m.percentual, 0)),
      progresso({
        valor: r.mesAteHoje.total,
        total: m.valor,
        cor: m.percentual >= 100 ? 'var(--verde)' : 'var(--azul)',
        esquerda: `${money(r.mesAteHoje.total)} de ${money(m.valor)}`,
        direita: m.falta ? `faltam ${money(m.falta)}` : 'meta batida 🎉',
      }),
      h('div.grade.grade--3', { style: { marginTop: '12px' } },
        kpi({ label: 'Precisa por dia', valor: money(ritmo.precisaPorDia), tamanho: 'p', cor: ritmo.exigeMais ? 'atencao' : 'ok' }),
        kpi({ label: 'Ritmo atual', valor: money(ritmo.atual), tamanho: 'p' }),
        kpi({ label: 'Dias restantes', valor: String(ritmo.diasRestantes), tamanho: 'p', nota: 'de venda' }))),

    recados.length > 0 && card('O que precisa acontecer', null,
      h('div.empilha', { style: { gap: '8px' } }, ...recados.map(linhaRecado))),

    r.serie.length > 1 && card('Dia a dia do mês', null,
      grafLinha(r.serie.map((d) => ({ rotulo: formatDate(d.data, 'short'), valor: d.valor })), { altura: 140 }),
      m.diaria != null && h('p.mini.muted', `A meta de cada dia é ${money(m.diaria)}.`)),

    r.porVendedor.length > 0 && card('Impulso comercial',
      h('span.mini.muted', 'objetivo de cada um'),
      h('div.empilha', { style: { gap: '12px' } },
        ...r.porVendedor.map((v, i) => linhaVendedor(v, i))),
      r.porVendedor.some((v) => v.alvoEstimado) && h('p.mini.muted', { style: { marginTop: '10px' } },
        'Onde diz "estimado", o alvo é a fatia da meta da empresa que a pessoa já vem puxando — '
        + 'o app não inventa meta. Em Ajustes você define a meta de cada vendedor.')),

    orc && orc.quantidade > 0 && cardOrcamentos(orc),

    card('Mandar este relatório', null,
      h('p.pequeno.muted', { style: { marginBottom: '10px' } },
        'Sai do jeito que está na tela, com a data de hoje.'),
      h('div.btn-linha',
        botao('📄 PDF', { tipo: 'primario', onClick: () => imprimirRelatorio(r, recados, orc) }),
        botao('📊 Excel', { onClick: () => excelRelatorio(r, orc) }))));
}

/**
 * Uma linha por vendedor: quanto fez, onde deveria estar hoje, quanto precisa
 * por dia. É o que ela chama de traçar a linha de objetivo de cada um.
 */
function linhaVendedor(v, i) {
  const atrasado = v.diferencaDoRitmo != null && v.diferencaDoRitmo < 0;
  return h('div',
    h('div.linha.linha--entre', { style: { alignItems: 'baseline' } },
      h('button.crescer', {
        style: {
          background: 'none', border: 0, padding: 0, textAlign: 'left',
          font: 'inherit', color: 'inherit', cursor: 'pointer',
        },
        onClick: () => navigate(`/comercial/${v.vendedorId}`),
      },
      h('strong', `${i + 1}. ${v.nome}`),
      v.alvoEstimado && h('span.mini.muted', ' · alvo estimado')),
      h('span.num.forte', money(v.mes))),

    v.alvo
      ? h('div',
        progresso({
          valor: v.mes,
          total: v.alvo,
          cor: v.percentualMeta >= 100 ? 'var(--verde)' : atrasado ? 'var(--amarelo)' : 'var(--azul)',
          esquerda: `${pct(v.percentualMeta, 0)} de ${money(v.alvo)}`,
          direita: v.falta ? `faltam ${money(v.falta)}` : 'fechou 🎉',
        }),
        h('div.mini.muted', { style: { marginTop: '4px' } },
          [
            v.dia ? `hoje ${money(v.dia)}` : 'sem venda hoje',
            v.precisaPorDia ? `precisa ${money(v.precisaPorDia)}/dia` : null,
            atrasado ? `${money(Math.abs(v.diferencaDoRitmo))} atrás do ritmo` : null,
          ].filter(Boolean).join(' · ')))
      : h('div.mini.muted',
        `${v.dia ? `hoje ${money(v.dia)}` : 'sem venda hoje'} · ${v.notas} NFs · ${pct(v.participacao, 0)} do total`));
}

/** Um recado. Se tiver rota, vira botão: o aviso e o lugar de resolver juntos. */
function linhaRecado(x) {
  const icone = x.nivel === 'ok' ? '✅' : x.nivel === 'ruim' ? '🔴' : x.nivel === 'info' ? 'ℹ️' : '⚠️';
  const conteudo = [
    h('span', icone),
    h('span.pequeno.crescer', x.texto),
    x.rota && h('span.muted', '›'),
  ].filter(Boolean);

  return x.rota
    ? h('button.linha', {
      style: {
        alignItems: 'flex-start', gap: '8px', width: '100%', textAlign: 'left',
        background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer',
      },
      onClick: () => navigate(x.rota),
    }, ...conteudo)
    : h('div.linha', { style: { alignItems: 'flex-start', gap: '8px' } }, ...conteudo);
}

function seletorDia(data) {
  const dias = [];
  for (let i = 0; i < 5; i += 1) dias.push(addDays(data, -i));
  return chips(
    dias.reverse().map((d) => ({ id: d, label: formatDate(d, 'short') })),
    data,
    (id) => navigate(href('/diario', { d: id })),
  );
}

/**
 * "Esse cliente orça muito e fecha pouco" — o que ela quer poder mandar.
 * Só entra cliente que já orçou o suficiente para a conta significar algo.
 */
function cardOrcamentos(orc) {
  const fracos = orc.porCliente
    .filter((c) => c.quantidade >= 2 && c.taxa != null && c.taxa < 50)
    .slice(0, 5);

  return card('Orçamentos do mês',
    h('span.mini.muted', orc.taxa == null ? 'nada decidido' : `${pct(orc.taxa, 0)} vira venda`),
    h('div.grade.grade--2',
      kpi({ label: 'Orçado', valor: money(orc.total), tamanho: 'p', nota: `${orc.quantidade} orçamento(s)` }),
      kpi({ label: 'Em aberto', valor: String(orc.abertos.length), tamanho: 'p', nota: 'esperando resposta' })),
    fracos.length > 0 && h('div', { style: { marginTop: '10px' } },
      h('p.pequeno.forte', 'Orçam muito e fecham pouco'),
      h('div.empilha', { style: { gap: '4px', marginTop: '6px' } },
        ...fracos.map((c) => h('div.linha.linha--entre',
          h('span.pequeno.crescer', c.nome),
          h('span.mini.muted', `${c.quantidade} orç.`),
          h('span.num', `${pct(c.taxa, 0)}`))))),
    h('div.btn-linha', { style: { marginTop: '10px' } },
      botao('Ver orçamentos', { pequeno: true, onClick: () => navigate('/orcamentos') })));
}

/* ------------------------------------------------------------- exportação */

function blocos(r, recados, orc) {
  const m = r.meta;
  const out = [{
    tipo: 'kpis',
    itens: [
      { label: `Vendas de ${formatDate(r.data)}`, valor: money(r.dia.total), nota: `${r.dia.notas} NFs` },
      { label: 'No mês até hoje', valor: money(r.mesAteHoje.total), nota: `${r.mesAteHoje.notas} NFs` },
      m.valor ? { label: 'Meta do mês', valor: money(m.valor), nota: pct(m.percentual, 0) } : null,
      m.falta != null ? { label: 'Falta', valor: money(m.falta), nota: `${r.ritmo.diasRestantes} dias de venda` } : null,
    ].filter(Boolean),
  }];

  if (recados.length) {
    out.push({
      tipo: 'texto',
      titulo: 'O que precisa acontecer',
      texto: recados.map((x) => `• ${x.texto}`).join('\n'),
    });
  }

  if (r.porVendedor.length) {
    out.push({
      tipo: 'tabela',
      titulo: 'Vendedores',
      colunas: COLUNAS_VENDEDOR,
      linhas: r.porVendedor,
      total: {
        nome: 'TOTAL',
        dia: r.dia.total,
        mes: r.mesAteHoje.total,
        notas: r.mesAteHoje.notas,
      },
    });
  }

  if (orc?.quantidade) {
    out.push({
      tipo: 'tabela',
      titulo: 'Orçamentos do mês por cliente',
      colunas: COLUNAS_ORCAMENTO,
      linhas: orc.porCliente,
      total: { nome: 'TOTAL', valor: orc.total, quantidade: orc.quantidade },
    });
  }
  return out;
}

const COLUNAS_VENDEDOR = [
  { header: 'Vendedor', key: 'nome' },
  { header: 'Hoje', key: 'dia', tipo: 'money', alinhar: 'direita' },
  { header: 'No mês', key: 'mes', tipo: 'money', alinhar: 'direita' },
  { header: 'Objetivo', key: 'alvo', tipo: 'money', alinhar: 'direita' },
  { header: '% do objetivo', key: 'percentualMeta', tipo: 'pct', alinhar: 'direita' },
  { header: 'Falta', key: 'falta', tipo: 'money', alinhar: 'direita' },
  { header: 'Precisa/dia', key: 'precisaPorDia', tipo: 'money', alinhar: 'direita' },
  { header: 'NFs', key: 'notas', tipo: 'int', alinhar: 'direita' },
  { header: 'Ticket', key: 'ticket', tipo: 'money', alinhar: 'direita' },
];

const COLUNAS_ORCAMENTO = [
  { header: 'Cliente', key: 'nome' },
  { header: 'Orçado', key: 'valor', tipo: 'money', alinhar: 'direita' },
  { header: 'Orçamentos', key: 'quantidade', tipo: 'int', alinhar: 'direita' },
  { header: 'Virou venda', key: 'taxa', tipo: 'pct', alinhar: 'direita' },
];

function imprimirRelatorio(r, recados, orc) {
  imprimir({
    titulo: `Relatório do dia — ${formatDate(r.data)}`,
    subtitulo: 'AMPLA',
    periodo: `Mês de ${monthLabel(r.mes)}`,
    blocos: blocos(r, recados, orc),
  });
}

function excelRelatorio(r, orc) {
  const abas = [{
    name: 'Vendedores',
    title: `Vendedores — ${formatDate(r.data)}`,
    columns: colunasExcel(COLUNAS_VENDEDOR),
    rows: r.porVendedor,
    total: { nome: 'TOTAL', dia: r.dia.total, mes: r.mesAteHoje.total, notas: r.mesAteHoje.notas },
  }, {
    name: 'Dia a dia',
    title: `Faturamento diário — ${monthLabel(r.mes)}`,
    columns: colunasExcel([
      { header: 'Data', key: 'data', tipo: 'date' },
      { header: 'Faturamento', key: 'valor', tipo: 'money', alinhar: 'direita' },
    ]),
    rows: r.serie,
    total: { data: 'TOTAL', valor: r.mesAteHoje.total },
  }];

  if (orc?.quantidade) {
    abas.push({
      name: 'Orçamentos',
      title: `Orçamentos — ${monthLabel(r.mes)}`,
      columns: colunasExcel(COLUNAS_ORCAMENTO),
      rows: orc.porCliente,
      total: { nome: 'TOTAL', valor: orc.total, quantidade: orc.quantidade },
    });
  }
  exportarExcel(`relatorio_do_dia_${r.data}`, abas);
}
