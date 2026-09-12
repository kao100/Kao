/**
 * Alimentação: metas de referência e totais do dia.
 *
 * Limite deste módulo, que é o mesmo do resto do app: ele **acompanha**, não
 * prescreve. As metas abaixo são faixas gerais de referência para quem treina
 * força, calculadas a partir do peso que você mesmo registrou. Não são uma
 * dieta, não substituem nutricionista e não levam em conta exame, condição de
 * saúde ou medicação. Todas são editáveis em Ajustes — o número que você
 * escrever sempre ganha do calculado.
 */

import * as store from '../core/store.js';
import { today, addDays, dayKey } from '../core/format.js';

/** Faixa de proteína (g por kg de peso) para hipertrofia em treino de força. */
export const PROTEIN_RANGE = [1.6, 2.2];
/** Referência de água (ml por kg), antes do acréscimo dos dias de treino. */
export const WATER_ML_PER_KG = 35;
/** Água extra estimada por hora de treino ou jogo. */
export const WATER_PER_TRAINING_HOUR = 500;

/**
 * Metas do dia.
 *
 * Cada campo diz de onde veio (`source`), para a tela poder mostrar "definido
 * por você" ou "estimado a partir do seu peso" em vez de um número sem origem.
 */
export async function targetsFor(date = today()) {
  const [profile, settings] = await Promise.all([store.profile.get(), store.settings.get()]);
  const custom = settings?.nutritionTargets || {};
  const weight = Number(profile?.weightKg) || null;

  const protein = custom.protein != null
    ? { value: Number(custom.protein), source: 'custom' }
    : weight
      ? { value: Math.round(weight * PROTEIN_RANGE[0]), source: 'weight',
        range: [Math.round(weight * PROTEIN_RANGE[0]), Math.round(weight * PROTEIN_RANGE[1])] }
      : { value: null, source: 'unknown' };

  // dia de treino pesa na água: o plano do dia diz se há treino, cardio ou jogo
  let trainingHours = 0;
  try {
    const { planForDate } = await import('./planner.js');
    const plan = await planForDate(date);
    if (plan.blocks.some((b) => b.type === 'football')) trainingHours += 1.5;
    if (plan.blocks.some((b) => b.type === 'strength')) trainingHours += 1;
    if (plan.blocks.some((b) => b.type === 'cardio' || b.type === 'recovery')) trainingHours += 0.5;
  } catch { /* sem plano: fica só a base */ }

  const water = custom.waterMl != null
    ? { value: Number(custom.waterMl), source: 'custom' }
    : weight
      ? {
        value: Math.round((weight * WATER_ML_PER_KG + trainingHours * WATER_PER_TRAINING_HOUR) / 100) * 100,
        source: 'weight',
        trainingHours,
      }
      : { value: 2500, source: 'default' };

  const kcal = custom.kcal != null
    ? { value: Number(custom.kcal), source: 'custom' }
    : { value: null, source: 'unset' };

  return { protein, water, kcal, weight };
}

/** Soma tudo que foi registrado num dia. */
export async function dayTotals(date = today()) {
  const [meals, dayRow] = await Promise.all([
    store.meals.byDate(date),
    store.nutritionDay.get(date),
  ]);
  const totals = meals.reduce((acc, m) => ({
    kcal: acc.kcal + (Number(m.kcal) || 0),
    protein: acc.protein + (Number(m.protein) || 0),
    carbs: acc.carbs + (Number(m.carbs) || 0),
    fat: acc.fat + (Number(m.fat) || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

  return {
    ...totals,
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
    kcal: Math.round(totals.kcal),
    waterMl: Number(dayRow?.waterMl) || 0,
    itemCount: meals.length,
    meals,
  };
}

/** Refeições do dia, agrupadas e na ordem em que se come. */
export const MEAL_SLOTS = [
  { id: 'cafe', label: 'Café da manhã', icon: '☕' },
  { id: 'lanche-manha', label: 'Lanche da manhã', icon: '🍎' },
  { id: 'almoco', label: 'Almoço', icon: '🍽️' },
  { id: 'lanche-tarde', label: 'Lanche da tarde', icon: '🥪' },
  { id: 'pos-treino', label: 'Pós-treino', icon: '🥤' },
  { id: 'jantar', label: 'Jantar', icon: '🌙' },
  { id: 'ceia', label: 'Ceia', icon: '🌛' },
];

export function mealLabel(id) {
  return MEAL_SLOTS.find((m) => m.id === id)?.label || 'Refeição';
}

/** Slot provável pelo horário, para o registro já abrir no lugar certo. */
export function slotForNow(d = new Date()) {
  const hour = d.getHours();
  if (hour < 10) return 'cafe';
  if (hour < 11.5) return 'lanche-manha';
  if (hour < 15) return 'almoco';
  if (hour < 18) return 'lanche-tarde';
  if (hour < 21) return 'jantar';
  return 'ceia';
}

/** Série dos últimos N dias, para os gráficos e a média. */
export async function recentDays(days = 14, endDate = today()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    // eslint-disable-next-line no-await-in-loop
    const t = await dayTotals(date);
    out.push({ date, dayKey: dayKey(date), ...t });
  }
  return out;
}

/**
 * Média dos dias em que houve registro.
 * Dias em branco não entram: a média de proteína de quem esqueceu de anotar
 * não é zero, é desconhecida — e tratá-la como zero desanima sem motivo.
 */
export function averageOfLogged(series, field) {
  const logged = series.filter((d) => d.itemCount > 0);
  if (!logged.length) return null;
  return Math.round(logged.reduce((s, d) => s + (d[field] || 0), 0) / logged.length);
}
