/**
 * PASTA DO MÊS — o dossiê de fechamento, num lugar só.
 *
 * Comissão, faturamento, clientes, a receber, a pagar, DRE e as divergências
 * do mês. Cada documento sai sozinho, e a pasta inteira sai de uma vez — em
 * Excel (uma aba por documento) ou em PDF.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import * as dossie from '../../logic/dossie.js';
import { planosDeContas } from '../../logic/dre.js';
import * as store from '../../core/store.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, botao, aviso, chips, progresso } from '../components/ui.js';
import { tabela } from '../components/table.js';
import { exportarExcel, imprimir, colunasExcel } from '../../logic/reports.js';
import { ok } from '../components/toast.js';
import { money, pct, monthKey, monthLabel, monthLabelShort, addMonths, today } from '../../core/format.js';
import { refresh } from '../../core/router.js';

export async function telaFechamento({ query }) {
  const mes = query.m || monthKey(today());
  const [p, planos, cfg] = await Promise.all([
    dossie.pasta(mes), planosDeContas(), store.config(),
  ]);
  definirTitulo('Pasta do mês', p.label);

  const d = p.dre;
  const marcadas = new Set(cfg.dre?.contasDeMercadoria || []);

  return h('div.empilha', { style: { gap: '14px' } },
    seletorDeMes(mes),

    h('div.grade.grade--2',
      kpi({ label: 'Faturamento', valor: money(d.receita.bruta), icone: '🧾', nota: `${d.receita.notas} NFs` }),
      kpi({
        label: 'Resultado do mês',
        valor: d.resultado == null ? '—' : money(d.resultado),
        icone: d.resultado == null ? '❓' : (d.resultado >= 0 ? '📈' : '📉'),
        cor: d.resultado == null ? undefined : (d.resultado >= 0 ? 'ok' : 'ruim'),
        nota: d.resultado == null ? 'falta custo' : pct(d.margemLiquida || 0, 1),
      })),

    ...d.avisos.map((a) => aviso(a.texto, a.nivel === 'info' ? 'info' : 'atencao')),

    !d.cmv.cobertura.completa && d.cmv.cobertura.faturadoTotal > 0 && card('Quanto do mês tem custo', null,
      progresso({
        valor: d.cmv.cobertura.faturadoComCusto,
        total: d.cmv.cobertura.faturadoTotal,
        cor: 'var(--amarelo)',
        esquerda: `${money(d.cmv.cobertura.faturadoComCusto)} com custo`,
        direita: `${money(d.cmv.cobertura.faturadoTotal - d.cmv.cobertura.faturadoComCusto)} sem`,
      }),
      d.cmv.semCusto.length > 0 && h('p.mini.muted', { style: { marginTop: '8px' } },
        `Sem custo: ${d.cmv.semCusto.slice(0, 6).map((x) => `NF ${x.numero}`).join(', ')}`
        + (d.cmv.semCusto.length > 6 ? ` e mais ${d.cmv.semCusto.length - 6}` : ''))),

    p.bloqueios.length > 0 && card('Antes de fechar o mês', null,
      h('div.empilha', { style: { gap: '6px' } },
        ...p.bloqueios.map((b) => h('div.linha',
          h('span', '•'), h('span.pequeno', b))))),

    card('A pasta inteira', null,
      h('p.pequeno.muted', { style: { marginBottom: '10px' } },
        `${p.documentos.length} documentos de ${p.label}. Saem juntos, na mesma ordem.`),
      h('div.btn-linha',
        botao('📊 Excel (uma aba por documento)', {
          tipo: 'primario',
          onClick: () => {
            exportarExcel(`pasta_${p.mes}`, dossie.planilhasDaPasta(p).map((x) => ({
              ...x, columns: colunasExcel(x.columns),
            })));
            ok('Pasta exportada.');
          },
        }),
        botao('📄 PDF', {
          onClick: () => imprimir({
            titulo: `Fechamento — ${p.label}`,
            subtitulo: 'AMPLA',
            blocos: dossie.blocosDaPasta(p),
          }),
        }))),

    ...p.documentos.map((doc) => cardDocumento(doc, p)),

    planos.length > 0 && cardMercadoria(planos, marcadas));
}

function seletorDeMes(mes) {
  const meses = [];
  for (let i = 0; i < 6; i += 1) {
    const m = monthKey(addMonths(`${mes}-01`, -i));
    meses.push({ id: m, label: monthLabelShort(m) });
  }
  return chips(meses.reverse(), mes, (id) => navigate(href('/fechamento', { m: id })));
}

function cardDocumento(doc, p) {
  return card(`${doc.icone} ${doc.nome}`,
    h('span.mini.muted', doc.resumo),
    doc.linhas.length
      ? tabela({ colunas: doc.colunas, linhas: doc.linhas, total: doc.total || undefined })
      : h('p.pequeno.muted', 'Nada neste mês.'),
    h('div.btn-linha', { style: { marginTop: '10px' } },
      botao('📄 PDF', {
        pequeno: true,
        onClick: () => imprimir({
          titulo: doc.nome,
          subtitulo: p.label,
          blocos: [{ tipo: 'tabela', colunas: doc.colunas, linhas: doc.linhas, total: doc.total || null }],
        }),
      }),
      botao('📊 Excel', {
        pequeno: true,
        onClick: () => exportarExcel(`${doc.id}_${p.mes}`, [{
          name: doc.nome.slice(0, 28),
          title: `${doc.nome} — ${p.label}`,
          columns: colunasExcel(doc.colunas),
          rows: doc.linhas,
          total: doc.total || null,
        }]),
      })));
}

/**
 * Marcar quais contas do plano são compra de mercadoria. O app não adivinha o
 * que cada conta significa: sem isso, o mesmo custo entraria pelo CMV e pelas
 * despesas, e o resultado do mês sairia menor do que é.
 */
function cardMercadoria(planos, marcadas) {
  const alternar = async (nome, ligado) => {
    const atual = new Set(marcadas);
    if (ligado) atual.add(nome); else atual.delete(nome);
    await store.salvarConfig({ dre: { contasDeMercadoria: [...atual] } });
    refresh();
  };

  return card('Compra de mercadoria', null,
    h('p.pequeno.muted', { style: { marginBottom: '10px' } },
      'Marque as contas do seu plano que são compra de mercadoria para revenda. '
      + 'Esse custo já entra no DRE pelo CMV, então elas saem das despesas — '
      + 'senão o mesmo dinheiro seria descontado duas vezes.'),
    h('div.empilha', { style: { gap: '4px' } },
      ...planos.map((g) => h('label.linha.linha--entre', { style: { padding: '6px 0', cursor: 'pointer' } },
        h('span.crescer',
          h('span.pequeno', g.nome),
          h('span.mini.muted', { style: { display: 'block' } }, money(g.valor))),
        h('input', {
          type: 'checkbox',
          checked: marcadas.has(g.nome),
          onChange: (e) => alternar(g.nome, e.target.checked),
        })))));
}
