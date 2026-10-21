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
import { definirTitulo } from '../shell.js';
import { kpi, card, botao, aviso, chips, progresso } from '../components/ui.js';
import { tabela } from '../components/table.js';
import { exportarExcel, imprimir, colunasExcel } from '../../logic/reports.js';
import { ok } from '../components/toast.js';
import { money, pct, monthKey, monthLabel, monthLabelShort, addMonths, today } from '../../core/format.js';

export async function telaFechamento({ query }) {
  const mes = query.m || monthKey(today());
  const [p, planos] = await Promise.all([dossie.pasta(mes), planosDeContas()]);
  definirTitulo('Pasta do mês', p.label);

  const d = p.dre;

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

    /**
     * O DRE saiu daqui para uma tela própria, onde a conta desce degrau por
     * degrau e cada linha abre. Aqui ficou o resumo e o caminho: a pasta do mês
     * é para EXPORTAR, o DRE é para OLHAR.
     */
    botao('📋 Abrir o DRE gerencial do mês', {
      bloco: true,
      onClick: () => navigate(href('/dre', { m: mes })),
    }),

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

    /**
     * A marcação de "compra de mercadoria" era feita aqui, por caixinha. Virou
     * um degrau da classificação do DRE, onde ela já escolhe o destino de todas
     * as contas do plano. Dois lugares para a mesma decisão é como a caixinha
     * marcada aqui e o degrau escolhido lá acabariam discordando.
     */
    planos.length > 0 && card('Em que degrau entra cada conta', null,
      h('p.pequeno.muted', { style: { marginBottom: '10px' } },
        `Seu plano tem ${planos.length} conta(s). É a classificação delas que monta o DRE — `
        + 'inclusive quais são compra de mercadoria, que não descem pelas despesas porque já '
        + 'entram pelo CMV.'),
      botao('📋 Classificar no DRE gerencial', {
        tipo: 'primario', bloco: true, onClick: () => navigate(href('/dre', { m: mes })),
      })));
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
