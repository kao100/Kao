/**
 * Acompanhamento do joelho esquerdo (tendão patelar).
 *
 * IMPORTANTE: este módulo NÃO diagnostica, não prescreve tratamento e não
 * substitui o ortopedista ou o fisioterapeuta. Ele apenas:
 *   - organiza o que você registra (dor, inchaço, instabilidade);
 *   - compara com o seu próprio padrão das últimas semanas;
 *   - sinaliza cautela e evita incentivar aumento de carga em dias piores;
 *   - respeita as orientações médicas cadastradas, que têm prioridade sobre
 *     o plano padrão do app.
 */

import * as store from '../core/store.js';
import { avg } from '../core/util.js';
import { addDays, today, formatDate } from '../core/format.js';

export const PAIN_LABELS = {
  0: 'sem dor',
  1: 'mínima',
  2: 'leve',
  3: 'perceptível',
  4: 'moderada',
  5: 'importante',
  6: 'forte',
  7: 'forte',
  8: 'muito forte',
  9: 'muito forte',
  10: 'máxima',
};

export const PAIN_CONTEXTS = {
  'pre-lower': 'Antes do treino de pernas',
  'post-lower': 'Depois do treino de pernas',
  'pre-football': 'Antes do futebol',
  'post-football': 'Depois do futebol',
  'pre-workout': 'Antes do treino',
  'post-workout': 'Depois do treino',
  daily: 'Registro do dia',
  other: 'Outro momento',
};

/**
 * Situação atual do joelho comparada ao próprio padrão recente.
 * @returns {Promise<{
 *   level:'ok'|'attention'|'caution', latest:object|null, baseline:number|null,
 *   reason:string, avoidLoadIncrease:boolean, messages:string[]
 * }>}
 */
export async function kneeStatus(referenceDate = today()) {
  const logs = (await store.painLogs.all()).sort((a, b) => (a.date < b.date ? 1 : -1));
  const messages = [];

  if (!logs.length) {
    return {
      level: 'ok', latest: null, baseline: null, avoidLoadIncrease: false,
      reason: 'Ainda não há registros de dor no joelho.',
      messages: ['Registre a dor antes dos treinos de perna e do futebol para acompanhar a evolução.'],
    };
  }

  const latest = logs[0];
  const from = addDays(referenceDate, -28);
  const window = logs.filter((l) => l.date >= from && l.id !== latest.id);
  const baseline = window.length ? avg(window, (l) => l.score) : avg(logs, (l) => l.score);

  let level = 'ok';
  let avoidLoadIncrease = false;
  const reasons = [];

  if (latest.score >= 5) {
    level = 'caution';
    avoidLoadIncrease = true;
    reasons.push(`Você registrou dor ${latest.score}/10 (${PAIN_LABELS[latest.score]}) em ${formatDate(latest.date, 'full')}.`);
  } else if (baseline != null && latest.score >= baseline + 2 && latest.score >= 3) {
    level = 'caution';
    avoidLoadIncrease = true;
    reasons.push(`A dor de hoje (${latest.score}/10) está acima do seu padrão das últimas semanas (média ${baseline.toFixed(1)}/10).`);
  } else if (latest.score >= 3) {
    level = 'attention';
    avoidLoadIncrease = true;
    reasons.push(`Dor perceptível registrada (${latest.score}/10).`);
  }

  if (latest.swelling) {
    level = 'caution';
    avoidLoadIncrease = true;
    reasons.push('Inchaço registrado no último check.');
  }
  if (latest.instability) {
    level = 'caution';
    avoidLoadIncrease = true;
    reasons.push('Sensação de instabilidade registrada no último check.');
  }
  if (latest.painDuringMovement && latest.score >= 3) {
    avoidLoadIncrease = true;
    reasons.push('Dor durante o movimento no último check.');
  }

  if (level === 'caution') {
    messages.push('Hoje o app não vai sugerir aumento de carga.');
    messages.push('Prefira exercícios sem dor, amplitude confortável e menos carga. Se a dor for importante, piorar ou vier acompanhada de inchaço ou instabilidade, procure seu ortopedista/fisioterapeuta.');
  } else if (level === 'attention') {
    messages.push('Sinal de atenção: mantenha a carga e observe como o joelho responde durante e depois do treino.');
  } else {
    messages.push('Sem sinais de alerta nos seus registros recentes. Continue registrando antes e depois dos treinos de perna e do futebol.');
  }

  return {
    level,
    latest,
    baseline: baseline != null ? Number(baseline.toFixed(1)) : null,
    avoidLoadIncrease,
    reason: reasons.join(' ') || 'Sem sinais de alerta nos registros recentes.',
    messages,
  };
}

/**
 * Verifica se um exercício está liberado, considerando as orientações médicas
 * cadastradas (que têm prioridade sobre o plano padrão).
 */
export function exercisePermission(exercise, guidance) {
  if (!exercise) return { state: 'unknown', note: '' };
  if (!guidance) {
    if (exercise.needsMedicalReview) {
      return {
        state: 'review',
        note: 'Sujeito à avaliação: confirme com seu ortopedista/fisioterapeuta antes de usar cargas altas.',
      };
    }
    return { state: 'default', note: '' };
  }
  if ((guidance.forbiddenExerciseIds || []).includes(exercise.id)) {
    return { state: 'forbidden', note: `Marcado como não liberado na orientação de ${formatDate(guidance.date, 'full')}.` };
  }
  if ((guidance.allowedExerciseIds || []).includes(exercise.id)) {
    return { state: 'allowed', note: `Liberado na orientação de ${formatDate(guidance.date, 'full')}.` };
  }
  if (exercise.needsMedicalReview) {
    return { state: 'review', note: 'Ainda não classificado nas orientações médicas cadastradas.' };
  }
  return { state: 'default', note: '' };
}

/** Aplica as orientações médicas a um template, marcando itens não liberados. */
export async function annotateTemplate(template) {
  const [exMap, guidance] = await Promise.all([store.exercises.map(), store.activeMedicalGuidance()]);
  const items = (template.items || []).map((it) => {
    const ex = exMap.get(it.exerciseId);
    const permission = exercisePermission(ex, guidance);
    return { ...it, exercise: ex, permission };
  });
  return { ...template, items, guidance };
}

/** Série histórica para o gráfico DOR × DATA. */
export async function painSeries(days = 90) {
  const from = addDays(today(), -days);
  const logs = (await store.painLogs.all())
    .filter((l) => l.date >= from)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return logs.map((l) => ({
    date: l.date,
    value: l.score,
    context: l.context,
    swelling: l.swelling,
    instability: l.instability,
  }));
}

/** Cruza dor com o que foi feito no mesmo dia (pernas, futebol, volume). */
export async function painWithContext(days = 90) {
  const from = addDays(today(), -days);
  const range = await store.activityRange(from, today());
  const exMap = await store.exercises.map();

  const legVolumeByDate = new Map();
  for (const s of range.sets) {
    const ex = exMap.get(s.exerciseId);
    if (!ex) continue;
    const isLeg = ['Quadríceps', 'Posterior de coxa', 'Glúteos', 'Panturrilha'].includes(ex.muscleGroup);
    if (!isLeg) continue;
    const vol = (Number(s.weight) || 0) * (Number(s.reps) || 0);
    legVolumeByDate.set(s.date, (legVolumeByDate.get(s.date) || 0) + vol);
  }

  const footballDates = new Set(range.football.map((f) => f.date));
  const totalVolumeByDate = new Map();
  for (const s of range.sets) {
    const vol = (Number(s.weight) || 0) * (Number(s.reps) || 0);
    totalVolumeByDate.set(s.date, (totalVolumeByDate.get(s.date) || 0) + vol);
  }

  return range.pains
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((p) => ({
      ...p,
      legVolume: Math.round(legVolumeByDate.get(p.date) || 0),
      totalVolume: Math.round(totalVolumeByDate.get(p.date) || 0),
      football: footballDates.has(p.date),
      exercisesThatDay: range.sets.filter((s) => s.date === p.date)
        .map((s) => exMap.get(s.exerciseId)?.namePt)
        .filter((v, i, arr) => v && arr.indexOf(v) === i),
    }));
}
