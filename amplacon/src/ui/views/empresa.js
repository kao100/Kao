/**
 * VISÃO DA EMPRESA (item 3)
 * A tela que responde "como a empresa está?" em um olhar.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as revenue from '../../logic/revenue.js';
import * as cashflow from '../../logic/cashflow.js';
import * as collection from '../../logic/collection.js';
import { selo as seloRotina } from '../../logic/routine.js';
import { imprimir } from '../../logic/reports.js';
import { seloDados, definirTitulo } from '../shell.js';
import { kpi, progresso, chips, secao, card, vazio, botao, rankLinha, variacao } from '../components/ui.js';
import { grafLinha } from '../components/chart.js';
import { money, pct, formatDate, monthLabel, today } from '../../core/format.js';
import { cents, sum } from '../../core/util.js';

export async function telaEmpresa({ query }) {
  const periodo = query.p || 'mes';
  const faixa = revenue.intervalo(periodo, query);

  const [selo, dia, mes, resumoPeriodo, evolucao, carteira, projecao, saldo, pendencias] = await Promise.all([
    seloRotina(),
    revenue.ontem(),
    revenue.mesAtual(),
    revenue.resumo(faixa),
    revenue.porDia({ de: faixa.de, ate: faixa.ate }),
    collection.carteira(),
    cashflow.projetar({ dias: 30 }),
    cashflow.saldoAtual(),
    store.pendencias.listar(),
  ]);

  definirTitulo('Visão da empresa', faixa.label);

  const totaisCobranca = collection.totais(carteira);
  const pagar = await store.pagar.listar();
  const aPagarAberto = cents(sum(pagar.filter((p) => p.status !== 'pago'), (p) => p.valor));
  const abertas = pendencias.filter((p) => p.status === 'aberta');
  const semDados = mes.notas === 0 && carteira.length === 0 && saldo.total === 0;

  if (semDados) return telaVazia(selo);

  return h('div.empilha', { style: { gap: '14px' } },
    seloDados(selo),

    /* faturamento de ontem — o acompanhamento comercial do dia */
    h('div.destaque-dia',
      h('div.destaque-dia__topo',
        h('div',
          h('span.kpi__label', '🧾 Faturamento de ontem'),
          h('div.destaque-dia__valor.num', money(dia.total))),
        h('div.dir',
          variacao(dia.variacao),
          h('div.mini.muted', `${formatDate(dia.data, 'day')} · ${dia.notas} NF${dia.notas === 1 ? '' : 's'}`))),
      dia.semVendedor.notas > 0 && h('button.aviso.aviso--atencao', { onClick: () => navigate('/conciliacao') },
        h('div.crescer', `⚠️ ${dia.semVendedor.notas} NF sem vendedor em ${formatDate(dia.data, 'short')} — ${money(dia.semVendedor.valor)}`),
        h('span', '›'))),

    /* mês x meta */
    card(`${monthLabel(mes.mes)}`, h('span.mini.muted', `${mes.diasDecorridos} de ${mes.diasNoMes} dias`),
      h('div.linha.linha--entre', { style: { marginBottom: '10px' } },
        h('div',
          h('div.kpi__valor.kpi__valor--g.num', money(mes.total)),
          h('div.mini.muted', `média diária ${money(mes.mediaDiaria)}`)),
        mes.meta
          ? h('div.dir',
            h('div.kpi__valor.kpi__valor--p.num', { style: { color: corMeta(mes.percentualMeta) } }, pct(mes.percentualMeta, 0)),
            h('div.mini.muted', `meta ${money(mes.meta)}`))
          : botao('Definir meta', { pequeno: true, onClick: () => navigate('/ajustes') })),
      mes.meta
        ? progresso({
          valor: mes.total, total: mes.meta, cor: corMeta(mes.percentualMeta),
          esquerda: mes.falta > 0 ? `faltam ${money(mes.falta)}` : 'meta atingida 🎉',
          direita: `meta ${money(mes.meta)}`,
        })
        : null),

    /* os números que respondem "como estamos" */
    h('div.grade.grade--4',
      kpi({
        label: 'A receber', valor: money(totaisCobranca.aberto), icone: '📥',
        nota: `${carteira.filter((c) => !c.pago).length} títulos em aberto`,
        cor: 'info', onClick: () => navigate('/receber'),
      }),
      kpi({
        label: 'Vencido', valor: money(totaisCobranca.vencido), icone: '🔴',
        nota: `${totaisCobranca.titulosVencidos} títulos`,
        cor: totaisCobranca.vencido > 0 ? 'ruim' : 'ok', onClick: () => navigate('/cobranca'),
      }),
      kpi({
        label: 'A pagar', valor: money(aPagarAberto), icone: '📤',
        nota: `${pagar.filter((p) => p.status !== 'pago').length} compromissos`,
        cor: 'laranja', onClick: () => navigate('/pagar'),
      }),
      kpi({
        label: 'Saldo em banco', valor: money(saldo.total), icone: '🏦',
        nota: saldo.porConta.map((c) => `${c.conta.nome} ${money(c.saldo)}`).join(' · ') || 'sem extrato',
        cor: saldo.total >= 0 ? 'ok' : 'ruim', onClick: () => navigate('/bancos'),
      })),

    /* caixa projetado */
    card('Caixa projetado — 30 dias',
      botao('Abrir', { pequeno: true, onClick: () => navigate('/caixa') }),
      h('div.fluxo-resumo',
        h('div',
          h('div.fluxo-resumo__label', 'Hoje'),
          h('div.fluxo-resumo__valor.num', money(projecao.saldoInicial))),
        h('div',
          h('div.fluxo-resumo__label', 'Menor saldo'),
          h('div.fluxo-resumo__valor.num', {
            style: { color: projecao.menorSaldo?.saldoFinal < 0 ? 'var(--vermelho)' : 'var(--txt)' },
          }, money(projecao.menorSaldo?.saldoFinal ?? 0)),
          projecao.menorSaldo && h('div.mini.muted', formatDate(projecao.menorSaldo.data, 'short'))),
        h('div',
          h('div.fluxo-resumo__label', 'Em 30 dias'),
          h('div.fluxo-resumo__valor.num', money(projecao.saldoFinal)))),
      projecao.primeiroDiaNegativo
        ? h('button.aviso.aviso--ruim', { style: { marginTop: '10px', width: '100%' }, onClick: () => navigate('/caixa') },
          h('div.crescer.dir', { style: { textAlign: 'left' } },
            h('strong', `Caixa negativo em ${formatDate(projecao.primeiroDiaNegativo.data)}`),
            h('div.mini', `saldo previsto ${money(projecao.primeiroDiaNegativo.saldoFinal)} · simule o que resolve`)),
          h('span', '›'))
        : h('div.aviso.aviso--ok', { style: { marginTop: '10px' } }, '✅ Nenhum dia negativo nos próximos 30 dias.'),
      grafLinha(projecao.linhas.map((l) => ({ rotulo: formatDate(l.data, 'short'), valor: l.saldoFinal })), {
        altura: 110,
        cor: projecao.primeiroDiaNegativo ? 'var(--vermelho)' : 'var(--verde)',
      })),

    /* faturamento por período + vendedores */
    secao('Faturamento', chipsPeriodo(periodo, query),
      card(null, null,
        h('div.linha.linha--entre', { style: { marginBottom: '8px' } },
          h('div',
            h('div.kpi__valor.num', money(resumoPeriodo.total)),
            h('div.mini.muted', `${resumoPeriodo.notas} NFs · ticket ${money(resumoPeriodo.ticketMedio)} · ${resumoPeriodo.clientes} clientes`)),
          botao('Comercial', { pequeno: true, onClick: () => navigate('/comercial') })),
        grafLinha(evolucao.map((d) => ({ rotulo: formatDate(d.data, 'short'), valor: d.valor })), { altura: 120 }))),

    resumoPeriodo.ranking.length > 0 && card('Vendedores no período',
      botao('Ver tudo', { pequeno: true, onClick: () => navigate('/comercial') }),
      h('div.rank', ...resumoPeriodo.ranking.slice(0, 5).map((v, i) => rankLinha({
        posicao: i + 1,
        nome: v.nome,
        valor: v.valor,
        percentual: v.participacao,
        sub: `${v.notas} NFs · ticket ${money(v.ticket)} · ${pct(v.participacao, 1)} do total`,
        onClick: () => navigate(`/comercial/${v.vendedorId}`),
      })))),

    /* o que precisa de atenção */
    secao('Precisa da sua atenção', null, painelAlertas({
      abertas, totaisCobranca, projecao, resumoPeriodo, selo,
    })),

    h('div.btn-linha',
      botao('📄 PDF para reunião', { bloco: true, onClick: () => pdfReuniao({ dia, mes, resumoPeriodo, totaisCobranca, aPagarAberto, saldo, projecao, abertas }) })));
}

function chipsPeriodo(atual, query) {
  return chips(revenue.PERIODOS.filter((p) => p.id !== 'personalizado'), atual, (id) => {
    navigate(href('/', { ...query, p: id }));
  });
}

function corMeta(percentual) {
  if (percentual == null) return 'var(--azul)';
  if (percentual >= 100) return 'var(--verde)';
  if (percentual >= 70) return 'var(--amarelo)';
  return 'var(--laranja)';
}

function painelAlertas({ abertas, totaisCobranca, projecao, resumoPeriodo, selo }) {
  const alertas = [];

  if (totaisCobranca.cobrarHoje > 0) {
    alertas.push({
      icone: '📞', cor: 'var(--vermelho)',
      titulo: `${totaisCobranca.cobrarHoje} cliente(s) para cobrar hoje`,
      sub: `${money(totaisCobranca.valorCobrarHoje)} em títulos que precisam de contato`,
      rota: '/cobranca',
    });
  }
  if (projecao.primeiroDiaNegativo) {
    alertas.push({
      icone: '💧', cor: 'var(--vermelho)',
      titulo: `Caixa negativo em ${formatDate(projecao.primeiroDiaNegativo.data)}`,
      sub: `saldo previsto ${money(projecao.primeiroDiaNegativo.saldoFinal)}`,
      rota: '/caixa/simulacao',
    });
  }
  if (!resumoPeriodo.conferencia.ok) {
    alertas.push({
      icone: '⚖️', cor: 'var(--vermelho)',
      titulo: 'Faturamento fiscal ≠ soma dos vendedores',
      sub: `diferença de ${money(resumoPeriodo.conferencia.diferenca)} no período`,
      rota: '/conciliacao',
    });
  }
  if (projecao.valorForaDaProjecao > 0) {
    alertas.push({
      icone: '🕒', cor: 'var(--amarelo)',
      titulo: `${money(projecao.valorForaDaProjecao)} vencidos fora da projeção`,
      sub: 'entram no caixa quando houver promessa de pagamento',
      rota: '/cobranca',
    });
  }
  for (const p of abertas.slice(0, 4)) {
    alertas.push({
      icone: '⚠️', cor: 'var(--amarelo)',
      titulo: p.titulo,
      sub: p.detalhe,
      rota: '/conciliacao',
    });
  }
  if (selo.pendentes > 0) {
    alertas.push({
      icone: '🗂️', cor: 'var(--azul)',
      titulo: `${selo.pendentes} atualização(ões) de arquivo pendentes`,
      sub: 'os números só ficam completos depois de importar',
      rota: '/arquivos',
    });
  }

  if (!alertas.length) {
    return h('div.tudo-ok',
      h('div.tudo-ok__icone', '✅'),
      h('h3', 'Nada pendente'),
      h('p.pequeno.muted', 'Dados atualizados, conciliação em dia e caixa positivo.'));
  }

  return h('div.alertas', ...alertas.slice(0, 8).map((a) => h('button.alerta', {
    style: { '--cor': a.cor }, onClick: () => navigate(a.rota),
  },
  h('span.alerta__icone', a.icone),
  h('div.alerta__corpo',
    h('div.alerta__titulo', a.titulo),
    a.sub && h('div.alerta__sub', a.sub)),
  h('span.alerta__seta', '›'))));
}

function telaVazia(selo) {
  return h('div.empilha', { style: { gap: '14px' } },
    seloDados(selo),
    vazio('📊', 'Ainda não há dados',
      'O aplicativo não inventa número: ele mostra o que foi importado. Comece pela Central de Arquivos — ela conduz a rotina passo a passo.',
      botao('Começar a importar', { tipo: 'primario', grande: true, onClick: () => navigate('/arquivos') })),
    h('div.card',
      h('h3', { style: { marginBottom: '8px' } }, 'Ordem sugerida'),
      h('ol.pequeno.dim', { style: { margin: 0, paddingLeft: '18px', lineHeight: '1.9' } },
        h('li', 'Vendas/NFs do dia (XML das notas ou relatório)'),
        h('li', 'Pedidos de venda — é deles que vem o vendedor'),
        h('li', 'Contas a receber'),
        h('li', 'Contas a pagar (BPO)'),
        h('li', 'Extratos do Itaú e do Bradesco'))));
}

function pdfReuniao({ dia, mes, resumoPeriodo, totaisCobranca, aPagarAberto, saldo, projecao, abertas }) {
  imprimir({
    titulo: 'Panorama administrativo',
    subtitulo: monthLabel(mes.mes),
    periodo: `Posição em ${formatDate(today())}`,
    blocos: [
      {
        tipo: 'kpis',
        itens: [
          { label: 'Faturamento do mês', valor: money(mes.total), nota: mes.meta ? `${pct(mes.percentualMeta, 0)} da meta` : null },
          { label: 'Faturamento de ontem', valor: money(dia.total), nota: formatDate(dia.data) },
          { label: 'A receber', valor: money(totaisCobranca.aberto), nota: `${money(totaisCobranca.vencido)} vencidos` },
          { label: 'A pagar', valor: money(aPagarAberto) },
          { label: 'Saldo em banco', valor: money(saldo.total) },
          { label: 'Caixa em 30 dias', valor: money(projecao.saldoFinal) },
          { label: 'Menor saldo previsto', valor: money(projecao.menorSaldo?.saldoFinal ?? 0), nota: projecao.menorSaldo ? formatDate(projecao.menorSaldo.data) : null },
          { label: 'Pendências de conciliação', valor: String(abertas.length) },
        ],
      },
      resumoPeriodo.ranking.length && {
        tipo: 'barras',
        titulo: 'Faturamento por vendedor',
        itens: resumoPeriodo.ranking.map((v) => ({ nome: v.nome, valor: v.valor, rotulo: `${money(v.valor)} (${pct(v.participacao, 0)})` })),
      },
      {
        tipo: 'tabela',
        titulo: 'Contas a receber por faixa de atraso',
        colunas: [
          { header: 'Faixa', key: 'label' },
          { header: 'Títulos', key: 'quantidade', tipo: 'int', alinhar: 'direita' },
          { header: 'Valor', key: 'valor', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: totaisCobranca.faixas,
        total: { label: 'Total vencido', quantidade: totaisCobranca.titulosVencidos, valor: totaisCobranca.vencido },
      },
      {
        tipo: 'tabela',
        titulo: 'Próximos dias de caixa',
        colunas: [
          { header: 'Data', key: 'data', tipo: 'date' },
          { header: 'Entradas', key: 'entradas', tipo: 'money', alinhar: 'direita' },
          { header: 'Saídas', key: 'saidas', tipo: 'money', alinhar: 'direita' },
          { header: 'Saldo projetado', key: 'saldoFinal', tipo: 'money', alinhar: 'direita' },
        ],
        linhas: projecao.linhas.slice(0, 15),
      },
    ],
  });
}
