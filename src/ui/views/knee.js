/**
 * Joelho esquerdo — tendão patelar.
 * Registro, histórico e gráfico para levar à consulta.
 *
 * O app não diagnostica, não prescreve e não sugere ignorar dor.
 */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, addDays } from '../../core/format.js';
import { uid, toCSV, downloadFile } from '../../core/util.js';
import { kneeStatus, painSeries, painWithContext, PAIN_LABELS, PAIN_CONTEXTS } from '../../logic/knee.js';
import { page, topbar, sectionTitle, safetyNote, emptyState, menuRow } from '../shell.js';
import { openSheet } from '../components/sheet.js';
import { scale, yesNo } from '../components/inputs.js';
import { lineChart, legend } from '../components/chart.js';
import { toastOk, toast } from '../components/toast.js';

/* ------------------------------------------------------------------ */
/* Check rápido (usado antes de pernas, futebol e depois do treino)     */
/* ------------------------------------------------------------------ */

export function openKneeCheckSheet({ context = 'daily', date = today() } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openSheet({
      title: 'Como está seu joelho esquerdo hoje?',
      onClose: () => { if (!done) resolve('cancel'); },
      content: (close) => {
        const painCtl = scale({ from: 0, to: 10, value: null, labels: ['0 — sem dor', '10 — máxima'] });
        const duringCtl = yesNo({ value: null });
        const swellCtl = yesNo({ value: null });
        const instabCtl = yesNo({ value: null });
        const notes = h('textarea.textarea', { rows: 2, placeholder: 'Observação (opcional): em qual movimento doeu, quando começou…' });
        const legendEl = h('p.muted', { style: { fontSize: '12.5px' } },
          '0 sem dor · 1 mínima · 2 leve · 3 perceptível · 4 moderada · 5 importante · 6–10 progressivamente mais intensa');

        return h('div.stack',
          h('div.field', h('label.field__label', `Dor agora — ${PAIN_CONTEXTS[context] || 'registro'}`), painCtl, legendEl),
          h('div.field', h('label.field__label', 'Dor durante o movimento?'), duringCtl),
          h('div.field', h('label.field__label', 'Algum inchaço?'), swellCtl),
          h('div.field', h('label.field__label', 'Alguma sensação de instabilidade?'), instabCtl),
          notes,
          safetyNote('Este registro é só um diário para acompanhar a evolução e mostrar ao seu ortopedista/fisioterapeuta. Ele não substitui avaliação profissional.'),
          h('div.btn-row',
            h('button.btn.btn--ghost', { onClick: () => { done = true; resolve('skip'); close(); } }, 'Agora não'),
            h('button.btn.btn--primary', {
              onClick: async () => {
                const score = painCtl.getValue();
                if (score == null) { toast('Escolha um valor de 0 a 10.'); return; }
                await store.painLogs.save({
                  id: uid('pain'),
                  date,
                  context,
                  score,
                  painDuringMovement: duringCtl.getValue() === true,
                  swelling: swellCtl.getValue() === true,
                  instability: instabCtl.getValue() === true,
                  notes: notes.value,
                  ts: Date.now(),
                });
                done = true;
                close();
                const status = await kneeStatus(date);
                if (status.level === 'caution') {
                  toast('Registro salvo. Hoje o app não vai sugerir aumento de carga — priorize execução sem dor.', { type: 'warn', ms: 5200 });
                } else {
                  toastOk('Registro do joelho salvo');
                }
                resolve('ok');
              },
            }, 'Salvar'),
          ),
        );
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Tela /joelho                                                         */
/* ------------------------------------------------------------------ */

export async function kneeView() {
  const [status, series, contextRows, guidance, settings, profile] = await Promise.all([
    kneeStatus(),
    painSeries(120),
    painWithContext(120),
    store.activeMedicalGuidance(),
    store.settings.get(),
    store.profile.get(),
  ]);

  const condition = profile?.conditions?.[0];
  const levelPill = {
    ok: h('span.pill.pill--ok', '🟢 Sem sinais de alerta'),
    attention: h('span.pill.pill--warn', '🟡 Atenção'),
    caution: h('span.pill.pill--danger', '🔴 Cautela'),
  }[status.level];

  return page(
    topbar({
      eyebrow: 'Acompanhamento',
      title: 'Joelho esquerdo',
      showBack: true,
      backTo: '/mais',
      actions: [h('button.iconbtn', { onClick: exportKneeHistory, 'aria-label': 'Exportar' }, '⤓')],
    }),

    h('div.card',
      h('div.row.row--between',
        h('div.card__title', condition?.label || 'Joelho esquerdo — tendão patelar'),
        levelPill,
      ),
      h('p.muted', { style: { marginTop: '8px', fontSize: '13.5px' } }, status.reason),
      ...status.messages.map((m) => h('p.muted', { style: { fontSize: '13px' } }, m)),
      settings?.nextAppointment
        ? h('div.pill.pill--cardio', { style: { marginTop: '6px' } }, `🩺 Retorno: ${formatDate(settings.nextAppointment, 'full')}`)
        : null,
      h('button.btn.btn--primary.btn--block.mt', { onClick: async () => { await openKneeCheckSheet({ context: 'daily' }); refresh(); } },
        '＋ Registrar como está agora'),
    ),

    guidance
      ? h('div.card.card--tight',
        h('div.row.row--between',
          h('div.card__title', 'Orientações médicas ativas'),
          h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate('/medico') }, 'Ver'),
        ),
        h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } },
          `${formatDate(guidance.date, 'full')} · ${guidance.professional || 'profissional'} — ${guidance.diagnosis || 'sem diagnóstico registrado'}`),
      )
      : h('div.card.card--tight',
        h('div.card__title', 'Orientações médicas'),
        h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } },
          'Depois da consulta, cadastre aqui o que o profissional liberou e o que pediu para evitar. Essas orientações passam a ter prioridade sobre o plano padrão do app.'),
        h('button.btn.btn--sm.btn--ghost.mt', { onClick: () => navigate('/medico') }, 'Cadastrar orientações'),
      ),

    h('div.card',
      h('div.card__title', 'Dor × data'),
      h('p.muted', { style: { fontSize: '12.5px', marginTop: '4px' } }, 'Escala 0–10. Os círculos vermelhos marcam registros com inchaço ou instabilidade.'),
      lineChart({
        points: series.map((p) => ({
          date: p.date,
          value: p.value,
          marker: p.swelling || p.instability ? 'alert' : null,
        })),
        color: 'flame',
        yMin: 0,
        yMax: 10,
        formatValue: (v) => String(Math.round(v)),
        emptyText: 'Nenhum registro ainda.',
      }),
      legend([{ color: 'flame', label: 'Dor relatada (0–10)' }]),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Dor comparada com o treino'),
      contextRows.length
        ? h('div.list',
          ...contextRows.slice(-12).reverse().map((row) => h('div.list-item',
            h('div.list-item__thumb', { style: { fontSize: '18px' } }, painEmoji(row.score)),
            h('div.grow',
              h('div.list-item__title', `${row.score}/10 · ${PAIN_LABELS[row.score]}`),
              h('div.list-item__sub',
                `${formatDate(row.date, 'full')} · ${PAIN_CONTEXTS[row.context] || row.context}`),
              h('div.list-item__sub',
                [
                  row.football ? '⚽ jogou futebol' : null,
                  row.legVolume ? `🦵 volume de pernas ${Math.round(row.legVolume)} kg` : null,
                  row.swelling ? 'inchaço' : null,
                  row.instability ? 'instabilidade' : null,
                ].filter(Boolean).join(' · ') || 'sem treino de pernas registrado no dia'),
            ),
          )),
        )
        : emptyState('📉', 'Sem registros suficientes para comparar ainda.'),
    ),

    safetyNote('Se a dor for importante, piorar, vier com inchaço, travamento ou sensação de instabilidade, procure seu ortopedista/fisioterapeuta. Dor em tendão e articulação não é a mesma coisa que o desconforto muscular normal do treino.', 'danger'),
  );
}

function painEmoji(score) {
  if (score === 0) return '🟢';
  if (score <= 2) return '🟡';
  if (score <= 4) return '🟠';
  return '🔴';
}

async function exportKneeHistory() {
  const rows = await painWithContext(3650);
  if (!rows.length) { toast('Nenhum registro para exportar ainda.'); return; }
  const csv = toCSV(rows.map((r) => ({
    data: r.date,
    momento: PAIN_CONTEXTS[r.context] || r.context,
    dor_0a10: r.score,
    dor_durante_movimento: r.painDuringMovement ? 'sim' : 'não',
    inchaco: r.swelling ? 'sim' : 'não',
    instabilidade: r.instability ? 'sim' : 'não',
    futebol_no_dia: r.football ? 'sim' : 'não',
    volume_pernas_kg: r.legVolume,
    volume_total_kg: r.totalVolume,
    exercicios_do_dia: (r.exercisesThatDay || []).join(' | '),
    observacao: r.notes || '',
  })));
  downloadFile(`historico-joelho-${today()}.csv`, csv, 'text/csv');
  toastOk('Histórico exportado em CSV');
}
