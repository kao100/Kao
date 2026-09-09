/** Promessa diária: atividades avulsas e detalhe de um dia. */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, formatMinutes, relativeDay } from '../../core/format.js';
import { planForDate, answerFootball, blockSummary } from '../../logic/planner.js';
import { page, topbar, sectionTitle, emptyState, safetyNote } from '../shell.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { stepper, textInput, segmented } from '../components/inputs.js';
import { toastOk } from '../components/toast.js';
import { startWorkoutFlow } from './workout.js';
import { openManualCardioSheet } from './cardio.js';

const ACTIVITY_KINDS = [
  { value: 'walk', label: '🚶 Caminhada' },
  { value: 'cardio', label: '❤️ Cardio' },
  { value: 'recovery', label: '🧘 Mobilidade' },
  { value: 'other', label: '⭐ Outro' },
];

export function openDayActivitySheet(date = today()) {
  openSheet({
    title: 'Registrar atividade do dia',
    content: (close) => {
      const kind = segmented({ options: ACTIVITY_KINDS, value: 'walk' });
      const label = textInput({ placeholder: 'Ex.: caminhada no parque' });
      const minutes = stepper({ value: 30, step: 5, min: 5, max: 300, unit: 'min', decimals: 0 });
      return h('div.stack',
        h('div.field', h('label.field__label', 'Tipo'), kind),
        h('div.field', h('label.field__label', 'Descrição'), label),
        h('div.field', h('label.field__label', 'Duração'), minutes),
        h('p.muted', { style: { fontSize: '12.5px' } },
          'Toda atividade conta para os 30 minutos diários da promessa — inclusive caminhada, mobilidade e recuperação ativa.'),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            const day = await store.dailyLog.addManual(date, {
              kind: kind.getValue(),
              label: label.value || ACTIVITY_KINDS.find((k) => k.value === kind.getValue()).label,
              minutes: minutes.getValue(),
            });
            close();
            toastOk(day.promiseMet ? '🔥 Promessa do dia cumprida' : `Registrado · faltam ${30 - day.minutes} min`);
            refresh();
          },
        }, 'Salvar atividade'),
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/* Rota /dia/:date                                                      */
/* ------------------------------------------------------------------ */

export async function dayView({ params }) {
  const date = params.date;
  const [plan, log, sessions, cardios, footballs, pains, recoveries, exMap] = await Promise.all([
    planForDate(date),
    store.dailyLog.get(date),
    store.sessions.byDate(date),
    store.cardio.byDate(date),
    store.football.byDate(date),
    store.painLogs.byDate(date),
    store.recovery.byDate(date),
    store.exercises.map(),
  ]);

  const minutes = log?.minutes || 0;
  const isToday = date === today();

  return page(
    topbar({ eyebrow: relativeDay(date), title: formatDate(date, 'long'), showBack: true }),

    h('div.card',
      h('div.row.row--between',
        h('div',
          h('div.stat__label', 'Minutos do dia'),
          h('div.stat__value', formatMinutes(minutes)),
        ),
        log?.promiseMet
          ? h('span.pill.pill--flame', '🔥 Promessa cumprida')
          : h('span.pill.pill--warn', `Faltam ${Math.max(0, 30 - minutes)} min`),
      ),
      h('div.bar.mt', h('div.bar__fill.bar__fill--flame', { style: { width: `${Math.min(100, (minutes / 30) * 100)}%` } })),
      h('div.btn-row.mt',
        h('button.btn.btn--sm.btn--ghost', { onClick: () => openDayActivitySheet(date) }, '+ Atividade'),
        h('button.btn.btn--sm.btn--ghost', { onClick: () => openManualCardioSheet(date) }, '+ Cardio'),
        h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/futebol?date=${date}`) }, '+ Futebol'),
      ),
    ),

    /* programado */
    h('div.stack.stack--sm',
      sectionTitle('Programado para este dia'),
      ...plan.blocks.map((b) => h('div.list-item',
        h('div.list-item__thumb', { style: { fontSize: '20px' } }, b.icon),
        h('div.grow',
          h('div.list-item__title', b.title),
          h('div.list-item__sub', b.subtitle || blockSummary(b)),
        ),
        isToday
          ? h('button.btn.btn--sm.btn--primary', { onClick: () => startWorkoutFlow(plan, date) }, 'Iniciar')
          : null,
      )),
      plan.question && isToday
        ? h('div.card.card--accent',
          h('div.card__title', plan.question.text),
          h('div.btn-row.mt',
            h('button.btn.btn--ball', { onClick: async () => { await answerFootball(plan.question.target, true); refresh(); } }, 'SIM'),
            h('button.btn.btn--ghost', { onClick: async () => { await answerFootball(plan.question.target, false); refresh(); } }, 'NÃO'),
          ),
        )
        : null,
      ...plan.notes.map((n) => safetyNote(n, 'info')),
    ),

    /* realizado */
    h('div.stack.stack--sm',
      sectionTitle('Realizado'),
      (sessions.length + cardios.length + footballs.length + (log?.manual?.length || 0)) === 0
        ? emptyState('📭', 'Nada registrado neste dia ainda.')
        : h('div.list',
          ...sessions.map((s) => h('div.list-item.clickable', { onClick: () => navigate(`/treinar/${s.id}`) },
            h('div.list-item__thumb', { style: { fontSize: '20px' } }, '🏋️'),
            h('div.grow',
              h('div.list-item__title', s.name),
              h('div.list-item__sub', s.status === 'done' ? `${formatMinutes(s.durationMin)} · concluído` : 'em andamento'),
            ),
            h('span.muted', '›'),
          )),
          ...cardios.map((c) => h('div.list-item',
            h('div.list-item__thumb', { style: { fontSize: '20px' } }, '❤️'),
            h('div.grow',
              h('div.list-item__title', c.name || 'Cardio'),
              h('div.list-item__sub', `${formatMinutes(c.durationMin)}${c.rpe ? ` · RPE ${c.rpe}` : ''}`),
            ),
            deleteBtn(async () => { await store.cardio.remove(c.id); await store.recomputeDay(date); refresh(); }),
          )),
          ...footballs.map((f) => h('div.list-item.clickable', { onClick: () => navigate(`/futebol?date=${date}`) },
            h('div.list-item__thumb', { style: { fontSize: '20px' } }, '⚽'),
            h('div.grow',
              h('div.list-item__title', 'Futebol society'),
              h('div.list-item__sub', `${formatMinutes(f.durationMin)}${f.rpe ? ` · RPE ${f.rpe}` : ''}${f.goals != null ? ` · ${f.goals} gol(s)` : ''}`),
            ),
          )),
          ...(log?.manual || []).map((m) => h('div.list-item',
            h('div.list-item__thumb', { style: { fontSize: '20px' } }, m.kind === 'walk' ? '🚶' : m.kind === 'recovery' ? '🧘' : '⭐'),
            h('div.grow',
              h('div.list-item__title', m.label),
              h('div.list-item__sub', formatMinutes(m.minutes)),
            ),
            deleteBtn(async () => { await store.dailyLog.removeManual(date, m.id); refresh(); }),
          )),
        ),
    ),

    /* registros de saúde */
    (pains.length || recoveries.length)
      ? h('div.stack.stack--sm',
        sectionTitle('Registros do dia'),
        ...pains.map((p) => h('div.list-item',
          h('div.list-item__thumb', { style: { fontSize: '18px' } }, '🦵'),
          h('div.grow',
            h('div.list-item__title', `Joelho ${p.score}/10`),
            h('div.list-item__sub', [
              p.context,
              p.painDuringMovement ? 'dor no movimento' : null,
              p.swelling ? 'inchaço' : null,
              p.instability ? 'instabilidade' : null,
            ].filter(Boolean).join(' · ')),
          ),
        )),
        ...recoveries.map((r) => h('div.list-item',
          h('div.list-item__thumb', { style: { fontSize: '18px' } }, '🛌'),
          h('div.grow',
            h('div.list-item__title', 'Check-in de recuperação'),
            h('div.list-item__sub', `sono ${r.sleep}/5 · energia ${r.energy}/5 · dor muscular ${r.soreness}/5 · motivação ${r.motivation}/5`),
          ),
        )),
      )
      : null,
  );
}

function deleteBtn(onConfirm) {
  return h('button.iconbtn', {
    'aria-label': 'Remover',
    onClick: async (e) => {
      e.stopPropagation();
      const ok = await confirmSheet({ title: 'Remover registro?', message: 'Essa ação não pode ser desfeita.', confirmLabel: 'Remover', danger: true });
      if (ok) onConfirm();
    },
  }, '🗑');
}
