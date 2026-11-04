/**
 * O treino de hoje, já ajustado: tempo escolhido, preparação e divisão.
 *
 * Junta as peças puras (logic/warmup.js e logic/budget.js) com os dados do
 * aparelho — joelho, check-in de recuperação, orientações médicas e última
 * carga de cada exercício — para que o Início e o modo treino mostrem
 * exatamente a mesma coisa.
 */

import * as store from '../core/store.js';
import { kneeStatus } from './knee.js';
import { templateFocus, prepMinutes, buildPrep } from './warmup.js';
import { allocateDay } from './budget.js';

/**
 * @param {object} plan  resultado de planForDate
 * @param {string} date
 * @param {object} [opts]
 * @param {number} [opts.budget]  sobrescreve o tempo salvo do dia
 * @returns {Promise<null|{
 *   budget:number, focus:object, prep:object|null, alloc:object,
 *   strength:object, cardioBlock:object|null, cardioFirst:boolean
 * }>}
 */
export async function buildDayPlan(plan, date, opts = {}) {
  const strength = plan?.blocks?.find((b) => b.type === 'strength');
  if (!strength?.template?.items?.length) return null;

  const [budgetSaved, exMap, knee, guidance, settings, recoveries] = await Promise.all([
    store.dayBudget(date),
    store.exercises.map(),
    kneeStatus(date),
    store.activeMedicalGuidance(),
    store.settings.get(),
    store.recovery.byDate(date),
  ]);
  const budget = Number(opts.budget) || budgetSaved;

  const focus = templateFocus(strength.template.items, exMap);
  const cardioBlock = plan.blocks.find((b) => (b.type === 'cardio' || b.type === 'recovery') && b.templateId === strength.templateId)
    || null;
  const cardioFirst = Boolean(cardioBlock && plan.blocks.indexOf(cardioBlock) < plan.blocks.indexOf(strength));

  const readiness = (recoveries || []).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0]?.verdict || null;
  // no dia em que o cardio vem antes, o aquecimento já foi o próprio cardio
  const prepInfo = cardioFirst
    ? { minutes: 0, reasons: [] }
    : prepMinutes(focus.region, budget, { kneeLevel: knee.level, readiness });

  const alloc = allocateDay({
    budget,
    region: focus.region,
    prepMin: prepInfo.minutes,
    template: strength.template,
    cardioPlan: cardioBlock?.plan || null,
    cardioFirst,
    cardioPlans: settings?.cardioPlans || [],
    exMap,
  });

  let prep = null;
  if (prepInfo.minutes && alloc.items.length) {
    const lastByExercise = new Map();
    await Promise.all(alloc.items.slice(0, 4).map(async (it) => {
      lastByExercise.set(it.exerciseId, await store.lastPerformance(it.exerciseId));
    }));
    prep = buildPrep({
      focus,
      minutes: prepInfo.minutes,
      items: alloc.items,
      exMap,
      lastByExercise,
      knee,
      guidance,
      location: plan.location,
      increment: settings?.weightIncrementKg ?? 2.5,
      reasons: prepInfo.reasons,
    });
  }

  return { budget, focus, prep, alloc, strength, cardioBlock, cardioFirst, knee };
}

/** Grava o tempo escolhido para a data. */
export async function setDayBudget(date, minutes) {
  return store.dayPlan.set(date, { budgetMin: Number(minutes), budgetSetAt: Date.now() });
}
