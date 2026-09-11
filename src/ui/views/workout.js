/**
 * MODO TREINO — a tela usada dentro da academia.
 * Um exercício por vez, botões grandes, cronômetro de descanso automático.
 */

import { h, haptic } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, mmss, formatMinutes, num } from '../../core/format.js';
import { uid, sum } from '../../core/util.js';
import { unlockAudio, beepDone, beepFinish, keepAwake } from '../../core/audio.js';
import { analyzeProgression, isIsolation, formatLastSets, setsVolume } from '../../logic/progression.js';
import { kneeStatus } from '../../logic/knee.js';
import { planForDate } from '../../logic/planner.js';
import { stepper } from '../components/inputs.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { exerciseFigure, resolveExerciseMedia } from '../components/figure.js';
import { toast, toastOk } from '../components/toast.js';
import { topbar, page, safetyNote, emptyState } from '../shell.js';
import { exerciseSheet } from './exercise.js';
import { openKneeCheckSheet } from './knee.js';
import { openReadinessSheet } from './readiness.js';
import { checkSetRecords, checkSessionRecords, celebrationText, sessionAchievements, RECORD_TYPES } from '../../logic/records.js';

/* ------------------------------------------------------------------ */
/* Início do treino                                                     */
/* ------------------------------------------------------------------ */

/** Ponto de entrada a partir do dashboard / tela do dia. */
export async function startWorkoutFlow(plan, date = today()) {
  unlockAudio();
  const settings = (await store.settings.get()) || {};

  const strength = plan.blocks.find((b) => b.type === 'strength');
  const footballBlock = plan.blocks.find((b) => b.type === 'football');
  const cardioBlock = plan.blocks.find((b) => b.type === 'cardio' || b.type === 'recovery');

  // 1) Check do joelho antes de pernas e futebol
  if (settings.askKneeBeforeLegsAndFootball !== false && plan.needsKneeCheck) {
    const context = footballBlock ? 'pre-football' : 'pre-lower';
    const answered = await openKneeCheckSheet({ context, date });
    if (answered === 'cancel') return;
  }

  // 2) Check rápido de recuperação (opcional).
  //    A pergunta do joelho só entra quando o dia exige das pernas.
  if (settings.askRecoveryBeforeWorkout !== false) {
    await openReadinessSheet({ date, optional: true, includeKnee: plan.needsKneeCheck });
  }

  if (strength) {
    const session = await createSession(strength.template, date);
    navigate(`/treinar/${session.id}`);
    return;
  }
  if (footballBlock) { navigate(`/futebol?date=${date}`); return; }
  if (cardioBlock) { navigate(`/cardio/${cardioBlock.planId}?date=${date}`); return; }
  toast('Nenhum treino programado para hoje.');
}

/** Cria a sessão a partir de um template (snapshot: editar o template depois não altera o histórico). */
export async function createSession(template, date = today()) {
  const existing = (await store.sessions.byDate(date)).find(
    (s) => s.templateId === template.id && s.status === 'active',
  );
  if (existing) return existing;

  const exMap = await store.exercises.map();
  const items = (template.items || []).map((it, i) => ({
    ...it,
    order: i,
    exerciseName: exMap.get(it.exerciseId)?.namePt || it.exerciseId,
    completedSets: 0,
    skipped: false,
  }));

  return store.sessions.save({
    id: uid('ses'),
    date,
    templateId: template.id,
    name: template.name,
    subtitle: template.subtitle || '',
    status: 'active',
    startedAt: Date.now(),
    finishedAt: null,
    durationMin: 0,
    items,
    cursor: { itemIndex: 0, setIndex: 0 },
    notes: '',
  });
}

/* ------------------------------------------------------------------ */
/* Tela                                                                 */
/* ------------------------------------------------------------------ */

export async function workoutView({ params }) {
  const session = await store.sessions.byId(params.sessionId);
  if (!session) {
    return page(topbar({ title: 'Treino', showBack: true, backTo: '/' }),
      emptyState('🤔', 'Sessão não encontrada.'));
  }
  if (session.status === 'done') return workoutSummaryView(session);

  const [exMap, gymEquipment, settings, knee, sessionSets] = await Promise.all([
    store.exercises.map(),
    store.equipment.all(),
    store.settings.get(),
    kneeStatus(session.date),
    store.sets.bySession(session.id),
  ]);

  if (settings?.keepScreenAwake !== false) keepAwake(true);

  const root = h('div.trainer');
  const state = {
    session,
    itemIndex: session.cursor?.itemIndex || 0,
    setIndex: session.cursor?.setIndex || 0,
    sets: sessionSets,
    rest: null,      // { endsAt, totalSec }
    restTimer: null,
  };

  const rerender = async () => {
    const node = await renderTrainer(state, { exMap, gymEquipment, settings, knee, rerender });
    root.replaceChildren(node);
  };

  await rerender();
  return root;
}

async function renderTrainer(state, ctx) {
  const { session } = state;
  const items = session.items || [];
  const item = items[state.itemIndex];

  if (!item) return finishPrompt(state, ctx);

  const exercise = ctx.exMap.get(item.exerciseId);
  const doneSets = state.sets.filter((s) => s.itemIndex === state.itemIndex).sort((a, b) => a.index - b.index);
  const totalSets = item.sets || 1;
  const setNumber = Math.min(doneSets.length + 1, totalSets + 3);

  const last = await store.lastPerformance(item.exerciseId, { beforeSessionId: session.id });
  const progression = analyzeProgression({
    item,
    last,
    settings: ctx.settings,
    isolation: isIsolation(exercise),
    kneeFlag: ctx.knee.avoidLoadIncrease
      ? { avoidLoadIncrease: true, reason: ctx.knee.reason }
      : null,
  });

  const media = exercise ? resolveExerciseMedia(exercise, ctx.gymEquipment) : null;

  /* ---- controles ---- */
  const lastSetHere = doneSets.at(-1);
  const startWeight = lastSetHere?.weight ?? progression.suggestedWeight ?? last?.topWeight ?? 0;
  const startReps = lastSetHere?.reps ?? item.repMax ?? 10;
  const startRir = lastSetHere?.rir ?? item.rir ?? 2;

  const weightInput = stepper({ value: startWeight, step: ctx.settings?.weightIncrementKg ?? 2.5, min: 0, max: 500, unit: 'kg', decimals: 1 });
  const repsInput = stepper({ value: startReps, step: 1, min: 0, max: 60, unit: 'reps', decimals: 0 });
  const rirInput = stepper({ value: startRir ?? 2, step: 1, min: 0, max: 5, unit: 'RIR', decimals: 0 });
  const painInput = stepper({ value: lastSetHere?.pain ?? 0, step: 1, min: 0, max: 10, unit: 'dor', decimals: 0 });
  const timeInput = item.timeBased ? stepper({ value: lastSetHere?.durationSec ?? item.durationSec ?? 40, step: 5, min: 5, max: 600, unit: 'seg', decimals: 0 }) : null;

  const finishSet = async () => {
    unlockAudio();
    const row = {
      id: uid('set'),
      sessionId: session.id,
      exerciseId: item.exerciseId,
      date: session.date,
      itemIndex: state.itemIndex,
      index: doneSets.length,
      weight: item.timeBased ? null : weightInput.getValue(),
      reps: item.timeBased ? null : repsInput.getValue(),
      durationSec: item.timeBased ? timeInput.getValue() : null,
      rir: item.timeBased ? null : rirInput.getValue(),
      pain: painInput.getValue(),
      warmup: false,
      ts: Date.now(),
    };
    await store.sets.save(row);
    state.sets.push(row);
    haptic([12, 40, 12]);

    const records = await checkSetRecords(row, exercise);
    for (const record of records) celebrate(record);

    if (row.pain >= 4) {
      toast('Dor registrada. Se ela for importante ou piorar, reduza a carga e converse com seu ortopedista/fisioterapeuta.', { type: 'warn', ms: 5000 });
    }

    const nowDone = state.sets.filter((s) => s.itemIndex === state.itemIndex).length;
    if (nowDone >= totalSets) {
      // avança para o próximo exercício
      state.itemIndex += 1;
      state.setIndex = 0;
    } else {
      state.setIndex = nowDone;
    }
    session.cursor = { itemIndex: state.itemIndex, setIndex: state.setIndex };
    session.items[state.itemIndex - (nowDone >= totalSets ? 1 : 0)].completedSets = nowDone;
    await store.sessions.save(session);

    if (ctx.settings?.restAutoStart !== false && (item.restSec || 0) > 0 && state.itemIndex < session.items.length) {
      startRest(state, item.restSec, ctx);
    }
    ctx.rerender();
  };

  const progressPct = Math.round((state.itemIndex / Math.max(1, items.length)) * 100);

  return h('div.stack',
    /* topo */
    h('div.trainer__top',
      h('button.iconbtn', { onClick: () => confirmExit(state, ctx) }, '✕'),
      h('div.trainer__progress',
        h('div.row.row--between', { style: { fontSize: '12px', color: 'var(--text-3)', marginBottom: '4px' } },
          h('span', session.name),
          h('span.num', `${state.itemIndex + 1}/${items.length}`),
        ),
        h('div.bar', h('div.bar__fill', { style: { width: `${progressPct}%` } })),
      ),
      h('button.iconbtn', { onClick: () => openSessionMenu(state, ctx) }, '⋯'),
    ),

    /* exercício */
    h('div',
      h('div.trainer__exname', item.exerciseName || exercise?.namePt || item.exerciseId),
      h('div.trainer__exsub', [exercise?.nameEn, exercise?.muscleGroup].filter(Boolean).join(' · ')),
    ),

    /* como pegar / como posicionar — a consulta rápida no meio do treino */
    exercise?.setup?.quick
      ? h('div.setup-quick.clickable', { onClick: () => exerciseSheet(exercise, { item, focus: 'setup' }) },
        h('span.setup-quick__icon', '🤲'),
        h('span.grow', exercise.setup.quick),
        h('span.muted', 'ver +'),
      )
      : null,

    item.permission?.state === 'forbidden'
      ? safetyNote(`Este exercício está marcado como NÃO liberado nas suas orientações médicas. ${item.permission.note}`, 'danger')
      : item.provisional || exercise?.needsMedicalReview
        ? safetyNote('Exercício provisório: confirme carga e amplitude com seu ortopedista/fisioterapeuta. Nada de treinar com dor no tendão patelar.', '')
        : null,

    /* imagem */
    media ? h('div.clickable', { onClick: () => exerciseSheet(exercise, { item }) },
      exerciseFigure(exercise, media.equipment, { ratio: 'wide' }),
    ) : null,

    h('div.btn-row',
      h('button.btn.btn--sm.btn--ghost', { onClick: () => exerciseSheet(exercise, { item }) }, '❔ Como fazer?'),
      h('button.btn.btn--sm.btn--ghost', { onClick: () => openSwapSheet(state, ctx) }, '🔁 Trocar máquina'),
    ),
    h('div.btn-row',
      h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/progresso/${item.exerciseId}`) }, '📈 Histórico'),
      h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/academia?exercicio=${item.exerciseId}`) }, '📷 Foto da máquina'),
    ),

    /* série atual */
    h('div.card.card--tight',
      h('div.row.row--between',
        h('div.trainer__setline',
          h('span.trainer__setnum', `Série ${Math.min(doneSets.length + 1, totalSets)}`),
          h('span', `de ${totalSets}`),
        ),
        h('span.pill', item.timeBased ? `${item.durationSec}s` : `${item.repMin}–${item.repMax} reps · RIR ${item.rir ?? 2}`),
      ),
      h('div.setdots', { style: { marginTop: '10px' } },
        ...Array.from({ length: Math.max(totalSets, doneSets.length) }, (_, i) => {
          const d = doneSets[i];
          const cls = d ? 'setdot setdot--done' : (i === doneSets.length ? 'setdot setdot--current' : 'setdot');
          if (!d) return h('div', { class: cls }, `${i + 1}`);
          return h('button', {
            class: `${cls} setdot--editable`,
            title: 'Tocar para corrigir',
            onClick: () => openEditSetSheet(d, item, state, ctx),
          }, item.timeBased ? `${d.durationSec}s` : `${num(d.weight, 1)}×${d.reps}`);
        }),
      ),
      doneSets.length
        ? h('div.muted', { style: { fontSize: '11.5px', marginTop: '6px' } }, 'Toque em uma série registrada para corrigir carga ou repetições.')
        : null,
      h('div.trainer__prev', { style: { marginTop: '10px' } },
        h('div.muted', { style: { fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.08em' } }, 'Último treino'),
        h('div', formatLastSets(last)),
      ),
    ),

    /* progressão */
    h(`div.card.card--tight${progression.status === 'ready' ? '.card--accent' : ''}`,
      h('div.card__title', progression.title),
      h('p.muted', { style: { margin: '6px 0 0', fontSize: '13.5px' } }, progression.message),
      progression.status === 'ready'
        ? h('button.btn.btn--sm.btn--primary.mt', {
          onClick: () => { weightInput.setValue(progression.suggestedWeight); toastOk(`Carga sugerida: ${num(progression.suggestedWeight, 1)} kg`); },
        }, `Usar ${num(progression.suggestedWeight, 1)} kg hoje`)
        : null,
    ),

    /* entradas */
    item.timeBased
      ? h('div.stack.stack--sm', h('div.field__label', 'Tempo da série'), timeInput)
      : h('div.stack.stack--sm',
        h('div.field__label', 'Carga'), weightInput,
        h('div.field__label', 'Repetições'), repsInput,
        h('div.setgrid',
          h('div', h('div.field__label', 'RIR'), rirInput),
          h('div', h('div.field__label', 'Dor (0–10)'), painInput),
        ),
      ),
    item.timeBased ? h('div', h('div.field__label', 'Dor (0–10)'), painInput) : null,

    item.notes ? h('div.safety.safety--info', item.notes) : null,

    h('button.btn.btn--primary.btn--lg.btn--block', { onClick: finishSet }, '✓  FINALIZAR SÉRIE'),

    h('div.btn-row',
      h('button.btn.btn--sm.btn--ghost', {
        onClick: async () => {
          item.sets = (item.sets || 0) + 1;
          await store.sessions.save(session);
          toastOk('Série extra adicionada');
          ctx.rerender();
        },
      }, '＋ Série extra'),
      h('button.btn.btn--sm.btn--ghost', {
        onClick: () => {
          state.itemIndex += 1;
          state.setIndex = 0;
          session.cursor = { itemIndex: state.itemIndex, setIndex: 0 };
          store.sessions.save(session);
          ctx.rerender();
        },
      }, doneSets.length >= totalSets ? 'Próximo exercício ›' : 'Encerrar exercício ›'),
    ),

    h('div.btn-row',
      h('button.btn.btn--sm.btn--quiet', {
        disabled: state.itemIndex === 0,
        onClick: () => { state.itemIndex = Math.max(0, state.itemIndex - 1); ctx.rerender(); },
      }, '‹ Anterior'),
      h('button.btn.btn--sm.btn--quiet', {
        onClick: () => confirmExit(state, ctx),
      }, 'Pausar treino'),
    ),

    state.rest ? restBar(state, ctx) : null,
    h('div', { style: { height: state.rest ? '150px' : '0' } }),
  );
}

/* ------------------------------------------------------------------ */
/* Reconhecimento de recorde                                            */
/* ------------------------------------------------------------------ */

/**
 * Aviso na hora em que o recorde acontece. Aparece por alguns segundos e some
 * sozinho: nada de travar o treino com uma janela para fechar.
 */
function celebrate(record) {
  beepFinish();
  haptic([25, 60, 25, 60, 40]);
  toast(celebrationText(record), { type: 'record', ms: 6000 });
}

/* ------------------------------------------------------------------ */
/* Correção de uma série já registrada                                  */
/* ------------------------------------------------------------------ */

function openEditSetSheet(row, item, state, ctx) {
  openSheet({
    title: `Série ${(row.index ?? 0) + 1} — corrigir`,
    content: (close) => {
      const weight = item.timeBased ? null : stepper({
        value: row.weight ?? 0, step: ctx.settings?.weightIncrementKg ?? 2.5, min: 0, max: 500, unit: 'kg', decimals: 1,
      });
      const reps = item.timeBased ? null : stepper({ value: row.reps ?? 0, step: 1, min: 0, max: 60, unit: 'reps', decimals: 0 });
      const duration = item.timeBased ? stepper({ value: row.durationSec ?? 40, step: 5, min: 5, max: 600, unit: 'seg', decimals: 0 }) : null;
      const rir = item.timeBased ? null : stepper({ value: row.rir ?? 2, step: 1, min: 0, max: 5, unit: 'RIR', decimals: 0 });
      const pain = stepper({ value: row.pain ?? 0, step: 1, min: 0, max: 10, unit: 'dor', decimals: 0 });

      return h('div.stack',
        item.timeBased
          ? h('div.field', h('label.field__label', 'Tempo'), duration)
          : h('div.stack.stack--sm',
            h('div.field', h('label.field__label', 'Carga'), weight),
            h('div.field', h('label.field__label', 'Repetições'), reps),
            h('div.field', h('label.field__label', 'RIR'), rir),
          ),
        h('div.field', h('label.field__label', 'Dor (0–10)'), pain),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            const updated = {
              ...row,
              weight: item.timeBased ? null : weight.getValue(),
              reps: item.timeBased ? null : reps.getValue(),
              durationSec: item.timeBased ? duration.getValue() : null,
              rir: item.timeBased ? null : rir.getValue(),
              pain: pain.getValue(),
            };
            await store.sets.save(updated);
            const i = state.sets.findIndex((s) => s.id === row.id);
            if (i >= 0) state.sets[i] = updated;
            close();
            toastOk('Série corrigida');
            ctx.rerender();
          },
        }, 'Salvar correção'),
        h('button.btn.btn--danger.btn--block', {
          onClick: async () => {
            const ok = await confirmSheet({
              title: 'Excluir esta série?',
              message: 'Ela sai do histórico e do cálculo de volume.',
              confirmLabel: 'Excluir',
              danger: true,
            });
            if (!ok) return;
            await store.sets.remove(row.id);
            state.sets = state.sets.filter((s) => s.id !== row.id);
            // reordena os índices das séries restantes deste exercício
            const remaining = state.sets
              .filter((s) => s.itemIndex === row.itemIndex)
              .sort((a, b) => a.ts - b.ts);
            for (let i = 0; i < remaining.length; i += 1) {
              if (remaining[i].index !== i) {
                remaining[i].index = i;
                await store.sets.save(remaining[i]);
              }
            }
            close();
            toastOk('Série excluída');
            ctx.rerender();
          },
        }, 'Excluir série'),
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/* Cronômetro de descanso                                               */
/* ------------------------------------------------------------------ */

function startRest(state, seconds, ctx) {
  clearInterval(state.restTimer);
  state.rest = { endsAt: Date.now() + seconds * 1000, totalSec: seconds, beeped: false };
  state.restTimer = setInterval(() => {
    const left = (state.rest.endsAt - Date.now()) / 1000;
    const el = document.getElementById('rest-time');
    const bar = document.getElementById('rest-bar');
    if (!el) return;
    el.textContent = mmss(left);
    el.classList.toggle('rest__time--over', left <= 0);
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, (left / state.rest.totalSec) * 100))}%`;
    if (left <= 0 && !state.rest.beeped) {
      state.rest.beeped = true;
      beepDone();
      haptic([25, 60, 25]);
    }
  }, 250);
}

function restBar(state, ctx) {
  const left = (state.rest.endsAt - Date.now()) / 1000;
  return h('div.rest',
    h('div.row.row--between',
      h('div',
        h('div.rest__label', 'Descanso'),
        h('div#rest-time.rest__time', mmss(left)),
      ),
      h('button.btn.btn--sm.btn--ghost', {
        onClick: () => { state.rest.endsAt += 30000; state.rest.beeped = false; },
      }, '+30s'),
    ),
    h('div.bar.rest__bar', h('div#rest-bar.bar__fill', { style: { width: '100%' } })),
    h('button.btn.btn--block.btn--quiet', {
      onClick: () => { clearInterval(state.restTimer); state.rest = null; ctx.rerender(); },
    }, 'Pular descanso'),
  );
}

/* ------------------------------------------------------------------ */
/* Menu da sessão / encerramento                                        */
/* ------------------------------------------------------------------ */

function openSessionMenu(state, ctx) {
  openSheet({
    title: 'Sessão',
    content: (close) => h('div.stack',
      h('button.btn.btn--ghost.btn--block', {
        onClick: () => { close(); openSwapSheet(state, ctx); },
      }, '🔄 Trocar exercício atual'),
      h('button.btn.btn--ghost.btn--block', {
        onClick: async () => {
          close();
          const item = state.session.items[state.itemIndex];
          item.sets = (item.sets || 0) + 1;
          await store.sessions.save(state.session);
          toastOk('Série extra adicionada');
          ctx.rerender();
        },
      }, '➕ Adicionar uma série neste exercício'),
      h('button.btn.btn--ghost.btn--block', {
        onClick: () => {
          close();
          state.session.items[state.itemIndex].skipped = true;
          state.itemIndex += 1;
          ctx.rerender();
        },
      }, '⏭ Pular este exercício'),
      h('button.btn.btn--ghost.btn--block', {
        onClick: () => { close(); openNotesSheet(state); },
      }, '📝 Observação da sessão'),
      h('button.btn.btn--primary.btn--block', {
        onClick: async () => { close(); await finishSession(state, ctx); },
      }, '🏁 Finalizar treino agora'),
    ),
  });
}

function openNotesSheet(state) {
  openSheet({
    title: 'Observação da sessão',
    content: (close) => {
      const ta = h('textarea.textarea', { rows: 4, placeholder: 'Como foi o treino, sensações, ajustes de máquina…' });
      ta.value = state.session.notes || '';
      return h('div.stack', ta, h('button.btn.btn--primary.btn--block', {
        onClick: async () => { state.session.notes = ta.value; await store.sessions.save(state.session); close(); toastOk('Observação salva'); },
      }, 'Salvar'));
    },
  });
}

async function openSwapSheet(state, ctx) {
  const all = await store.exercises.all();
  const current = state.session.items[state.itemIndex];
  const currentEx = ctx.exMap.get(current.exerciseId);
  const group = currentEx?.muscleGroup;

  const altIds = currentEx?.alternatives || [];
  const alternatives = altIds.map((id) => ctx.exMap.get(id)).filter(Boolean);
  const others = all
    .filter((e) => e.id !== current.exerciseId && !altIds.includes(e.id))
    .sort((a, b) => (a.muscleGroup === group ? -1 : 1) - (b.muscleGroup === group ? -1 : 1));

  const swapTo = async (ex, close) => {
    current.exerciseId = ex.id;
    current.exerciseName = ex.namePt;
    current.provisional = Boolean(ex.needsMedicalReview);
    if (ex.atHome && !current.timeBased) {
      // exercícios de peso corporal costumam pedir faixa de repetições mais alta
      current.repMax = Math.max(current.repMax, 12);
    }
    await store.sessions.save(state.session);
    close();
    toastOk(`Trocado para ${ex.namePt}`);
    ctx.rerender();
  };

  const row = (ex, close, highlight = false) => h('button.list-item.clickable', {
    style: { width: '100%', textAlign: 'left', borderColor: highlight ? 'var(--volt-dim)' : undefined },
    onClick: () => swapTo(ex, close),
  },
  h('div.grow',
    h('div.list-item__title', ex.namePt),
    h('div.list-item__sub', `${ex.muscleGroup} · ${ex.atHome ? 'sem equipamento' : ex.nameEn}`),
  ),
  ex.kneeRisk === 'high' ? h('span.pill.pill--warn', 'joelho') : null);

  openSheet({
    title: 'Trocar exercício',
    content: (close) => h('div.stack.stack--sm',
      h('p.muted', 'A troca vale só para esta sessão. Para mudar o programa, edite o treino na aba Programa.'),
      alternatives.length ? h('div.field__label', 'Alternativas equivalentes') : null,
      ...alternatives.map((ex) => row(ex, close, true)),
      h('div.field__label', { style: { marginTop: '10px' } }, 'Todos os exercícios'),
      ...others.slice(0, 40).map((ex) => row(ex, close)),
    ),
  });
}

async function confirmExit(state, ctx) {
  const ok = await confirmSheet({
    title: 'Sair do treino?',
    message: 'As séries já registradas ficam salvas. Você pode voltar e continuar depois.',
    confirmLabel: 'Sair e continuar depois',
  });
  if (ok) {
    clearInterval(state.restTimer);
    keepAwake(false);
    await store.sessions.save(state.session);
    navigate('/');
  }
}

async function finishSession(state, ctx) {
  clearInterval(state.restTimer);
  keepAwake(false);
  const session = state.session;
  session.status = 'done';
  session.finishedAt = Date.now();
  session.durationMin = Math.max(1, Math.round((session.finishedAt - session.startedAt) / 60000));
  await store.sessions.save(session);
  await store.recomputeDay(session.date);
  await checkSessionRecords(session);
  beepFinish();
  navigate(`/treinar/${session.id}`);
  refresh();
}

function finishPrompt(state, ctx) {
  return h('div.stack.stack--lg', { style: { paddingTop: '24px' } },
    h('div.done-hero',
      h('div.done-hero__check', '🎉'),
      h('div.done-hero__title', 'Todos os exercícios concluídos'),
      h('p.muted', 'Finalize para salvar a duração e contabilizar a promessa do dia.'),
    ),
    h('button.btn.btn--primary.btn--lg.btn--block', { onClick: () => finishSession(state, ctx) }, '🏁 FINALIZAR TREINO'),
    h('button.btn.btn--ghost.btn--block', {
      onClick: () => { state.itemIndex = Math.max(0, state.session.items.length - 1); ctx.rerender(); },
    }, 'Voltar ao último exercício'),
  );
}

/* ------------------------------------------------------------------ */
/* Resumo pós-treino                                                    */
/* ------------------------------------------------------------------ */

export async function workoutSummaryView(session) {
  const [sessionSets, log, plan, exMap, achievements] = await Promise.all([
    store.sets.bySession(session.id),
    store.dailyLog.get(session.date),
    planForDate(session.date),
    store.exercises.map(),
    sessionAchievements(session.id),
  ]);

  const volume = setsVolume(sessionSets);
  const cardioBlock = plan.blocks.find((b) => b.type === 'cardio' || b.type === 'recovery');
  const footballBlock = plan.blocks.find((b) => b.type === 'football');
  const doneCardio = (await store.cardio.byDate(session.date)).length > 0;
  const promiseMet = log?.promiseMet;

  return page(
    topbar({ title: 'Treino concluído', showBack: true, backTo: '/' }),
    h('div.done-hero',
      h('div.done-hero__check', '✅'),
      h('div.done-hero__title', session.name),
      h('p.muted', `⏱ ${formatMinutes(session.durationMin)} · ${sessionSets.length} séries · ${Math.round(volume)} kg de volume`),
      promiseMet
        ? h('div.pill.pill--flame', { style: { marginTop: '8px' } }, '🔥 Promessa do dia cumprida')
        : h('div.pill.pill--warn', { style: { marginTop: '8px' } }, `Faltam ${Math.max(0, 30 - (log?.minutes || 0))} min para a promessa do dia`),
    ),

    achievements.length
      ? h('div.card.card--record',
        h('div.card__title', achievements.length === 1 ? 'Você bateu um recorde hoje' : `Você bateu ${achievements.length} recordes hoje`),
        h('div.stack.stack--sm', { style: { marginTop: '10px' } },
          ...achievements.map((a) => h('div.report-line',
            h('span', `${RECORD_TYPES[a.type].icon} ${a.exerciseName}`),
            h('span.report-line__v', a.text),
          )),
        ),
        h('p.muted', { style: { fontSize: '12.5px', marginTop: '8px' } },
          'Progresso de verdade é isso: pouca coisa por semana, sempre com a mesma técnica.'),
      )
      : null,

    cardioBlock && !doneCardio
      ? h('div.card.card--accent',
        h('div.card__title', `Falta o cardio: ${cardioBlock.title}`),
        h('p.muted', cardioBlock.subtitle || ''),
        h('button.btn.btn--cardio.btn--block.mt', {
          onClick: () => navigate(`/cardio/${cardioBlock.planId}?date=${session.date}`),
        }, '❤️ Iniciar cardio guiado'),
      )
      : null,

    footballBlock
      ? h('button.btn.btn--ball.btn--block', { onClick: () => navigate(`/futebol?date=${session.date}`) }, '⚽ Registrar futebol')
      : null,

    h('div.card',
      h('div.card__title', 'Séries registradas'),
      h('div.stack.stack--sm', { style: { marginTop: '10px' } },
        ...groupSets(sessionSets).map(([exerciseId, list]) => h('div.report-line',
          h('span', exMap.get(exerciseId)?.namePt || exerciseId),
          h('span.report-line__v', list.map((s) => (s.durationSec ? `${s.durationSec}s` : `${num(s.weight, 1)}×${s.reps}`)).join('  ')),
        )),
      ),
    ),

    h('button.btn.btn--ghost.btn--block', { onClick: () => openKneeCheckSheet({ context: 'post-workout', date: session.date }) },
      '🦵 Registrar como o joelho ficou'),

    h('button.btn.btn--quiet.btn--block', { onClick: () => navigate('/') }, 'Voltar ao início'),
  );
}

function groupSets(sets) {
  const map = new Map();
  for (const s of sets.sort((a, b) => a.ts - b.ts)) {
    if (!map.has(s.exerciseId)) map.set(s.exerciseId, []);
    map.get(s.exerciseId).push(s);
  }
  return [...map.entries()];
}
