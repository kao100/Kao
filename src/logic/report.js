/**
 * Resumo da semana e indicadores do painel de evolução.
 * Só métricas diretas do que foi registrado — nada de índice inventado.
 */

import * as store from '../core/store.js';
import { weekStart, addDays, today, formatDate } from '../core/format.js';
import { sum, avg, groupBy } from '../core/util.js';

export async function weeklySummary(anyDateInWeek = today()) {
  const start = weekStart(anyDateInWeek);
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(start, -1);

  const [range, prevRange, exMap, measurements] = await Promise.all([
    store.activityRange(start, end),
    store.activityRange(prevStart, prevEnd),
    store.exercises.map(),
    store.measurements.all(),
  ]);

  const strengthSessions = range.sessions.filter((s) => s.status === 'done');
  const totalMinutes = Math.round(
    sum(strengthSessions, (s) => s.durationMin)
    + sum(range.cardio, (c) => c.durationMin)
    + sum(range.football, (f) => f.durationMin)
    + sum(range.days, (d) => sum(d.manual || [], (m) => m.minutes)),
  );

  const promiseDays = range.days.filter((d) => d.promiseMet).length;
  const volume = Math.round(sum(range.sets, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0)));
  const prevVolume = Math.round(sum(prevRange.sets, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0)));

  const exerciseProgress = compareExercises(range.sets, prevRange.sets, exMap);

  const painScores = range.pains.map((p) => p.score);
  const worstPain = range.pains.reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);

  const weightRows = measurements
    .filter((m) => m.weightKg != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const weekWeights = weightRows.filter((m) => m.date >= start && m.date <= end);
  const beforeWeight = weightRows.filter((m) => m.date < start).slice(-1)[0] || weekWeights[0] || null;
  const lastWeight = weekWeights.slice(-1)[0] || null;

  const waistRows = measurements.filter((m) => m.waistCm != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const weekWaist = waistRows.filter((m) => m.date >= start && m.date <= end);
  const beforeWaist = waistRows.filter((m) => m.date < start).slice(-1)[0] || weekWaist[0] || null;
  const lastWaist = weekWaist.slice(-1)[0] || null;

  const notes = buildNotes({
    promiseDays, strengthCount: strengthSessions.length, footballCount: range.football.length,
    cardioCount: range.cardio.length, painScores, volume, prevVolume,
  });

  return {
    start,
    end,
    label: `${formatDate(start, 'medium')} – ${formatDate(end, 'medium')}`,
    strengthCount: strengthSessions.length,
    footballCount: range.football.length,
    cardioCount: range.cardio.length,
    cardioMinutes: Math.round(sum(range.cardio, (c) => c.durationMin)),
    footballMinutes: Math.round(sum(range.football, (f) => f.durationMin)),
    strengthMinutes: Math.round(sum(strengthSessions, (s) => s.durationMin)),
    totalMinutes,
    promiseDays,
    volume,
    prevVolume,
    volumeDelta: volume - prevVolume,
    exerciseProgress,
    pain: {
      count: painScores.length,
      avg: painScores.length ? Number(avg(painScores).toFixed(1)) : null,
      max: worstPain ? worstPain.score : null,
      maxContext: worstPain?.context || null,
      maxDate: worstPain?.date || null,
    },
    weight: {
      from: beforeWeight?.weightKg ?? null,
      to: lastWeight?.weightKg ?? null,
      delta: beforeWeight && lastWeight ? Number((lastWeight.weightKg - beforeWeight.weightKg).toFixed(1)) : null,
    },
    waist: {
      from: beforeWaist?.waistCm ?? null,
      to: lastWaist?.waistCm ?? null,
      delta: beforeWaist && lastWaist ? Number((lastWaist.waistCm - beforeWaist.waistCm).toFixed(1)) : null,
    },
    notes,
  };
}

function compareExercises(currentSets, prevSets, exMap) {
  const cur = groupBy(currentSets.filter((s) => !s.warmup), (s) => s.exerciseId);
  const prev = groupBy(prevSets.filter((s) => !s.warmup), (s) => s.exerciseId);
  const rows = [];

  for (const [exerciseId, sets] of cur) {
    const ex = exMap.get(exerciseId);
    if (!ex) continue;
    const topWeight = Math.max(...sets.map((s) => Number(s.weight) || 0));
    const reps = sum(sets, (s) => s.reps);
    const volume = sum(sets, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0));

    const before = prev.get(exerciseId);
    if (!before?.length) {
      rows.push({ exerciseId, name: ex.namePt, topWeight, reps, volume, kind: 'new', text: 'primeira semana com registro' });
      continue;
    }
    const prevTop = Math.max(...before.map((s) => Number(s.weight) || 0));
    const prevReps = sum(before, (s) => s.reps);
    const prevVol = sum(before, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0));

    let kind = 'flat';
    let text = 'mesma carga e mesmas repetições';
    if (topWeight > prevTop) { kind = 'up'; text = `+${fmt(topWeight - prevTop)} kg na maior carga`; }
    else if (topWeight < prevTop) { kind = 'down'; text = `${fmt(topWeight - prevTop)} kg na maior carga`; }
    else if (reps > prevReps) { kind = 'up'; text = `mesma carga, +${reps - prevReps} repetições totais`; }
    else if (reps < prevReps) { kind = 'down'; text = `mesma carga, ${reps - prevReps} repetições totais`; }
    else if (volume > prevVol) { kind = 'up'; text = `+${fmt(volume - prevVol)} kg de volume`; }

    rows.push({ exerciseId, name: ex.namePt, topWeight, reps, volume, prevTop, prevReps, kind, text });
  }

  const order = { up: 0, new: 1, flat: 2, down: 3 };
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || b.volume - a.volume);
}

function buildNotes({ promiseDays, strengthCount, footballCount, cardioCount, painScores, volume, prevVolume }) {
  const notes = [];
  if (promiseDays === 7) notes.push('Promessa dos 30 minutos cumprida nos 7 dias. 🔥');
  else if (promiseDays >= 5) notes.push(`Promessa cumprida em ${promiseDays} de 7 dias.`);
  else notes.push(`Promessa cumprida em ${promiseDays} de 7 dias — vale revisar o que atrapalhou.`);

  if (strengthCount >= 4) notes.push('Boa frequência de musculação nesta semana.');
  else if (strengthCount > 0) notes.push('Frequência de musculação abaixo do programa — sem problema se foi recuperação planejada.');

  if (footballCount === 0) notes.push('Nenhum futebol registrado nesta semana.');
  if (cardioCount === 0 && footballCount === 0) notes.push('Semana sem estímulo cardiovascular registrado.');

  if (prevVolume > 0) {
    const change = ((volume - prevVolume) / prevVolume) * 100;
    if (change > 25) notes.push('O volume de musculação subiu bastante em relação à semana anterior. Fique atento à recuperação e ao joelho.');
    else if (change < -25) notes.push('O volume caiu bastante em relação à semana anterior.');
  }

  if (painScores.length) {
    const mean = avg(painScores);
    if (mean >= 3) notes.push('A média de dor no joelho ficou em nível perceptível. Leve esse histórico para a sua consulta.');
    else notes.push('Registros de dor no joelho dentro de níveis baixos nesta semana.');
  } else {
    notes.push('Nenhum registro de dor no joelho nesta semana.');
  }

  notes.push('Observações automáticas e conservadoras, geradas só a partir do que você registrou. Não substituem avaliação médica.');
  return notes;
}

function fmt(v) {
  return String(parseFloat(Number(v || 0).toFixed(1))).replace('.', ',');
}

/** Indicadores do painel de evolução (últimas N semanas). */
export async function evolutionPanel(weeks = 8) {
  const rows = [];
  let cursor = weekStart(today());
  for (let i = 0; i < weeks; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const summary = await weeklySummary(cursor);
    rows.push(summary);
    cursor = addDays(cursor, -7);
  }
  return rows.reverse();
}
