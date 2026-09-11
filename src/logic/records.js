/**
 * Recordes e reconhecimento.
 *
 * Sempre que você supera o que já tinha feito em um exercício, o app registra a
 * conquista e avisa na hora. O objetivo é ver o progresso acontecendo — ele é
 * lento demais para perceber sem registro.
 *
 * Só conta como recorde o que foi realmente superado: carga maior que a máxima
 * anterior, ou mais repetições com a mesma carga máxima. Nada de "recorde" por
 * mudar o número de séries ou por ser a primeira vez.
 */

import * as store from '../core/store.js';
import { uid } from '../core/util.js';
import { addDays, today } from '../core/format.js';

export const RECORD_TYPES = {
  weight: { icon: '🏆', label: 'Recorde de carga' },
  reps: { icon: '🔁', label: 'Recorde de repetições' },
  volume: { icon: '📦', label: 'Recorde de volume na sessão' },
  weekly: { icon: '📈', label: 'Carga acima da semana passada' },
};

/**
 * Verifica se a série recém-registrada bateu algum recorde.
 * @param {object} set        a série salva
 * @param {object} exercise   o exercício
 * @returns {Promise<Array>}  conquistas criadas (já salvas)
 */
export async function checkSetRecords(set, exercise) {
  if (!set || set.warmup || set.durationSec) return [];
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  if (!weight || !reps) return [];

  const previous = (await store.sets.byExercise(set.exerciseId))
    .filter((s) => s.id !== set.id && s.sessionId !== set.sessionId && !s.warmup && s.weight != null);

  // Sem histórico anterior não existe recorde — é o ponto de partida.
  if (!previous.length) return [];

  const created = [];
  const bestWeight = Math.max(...previous.map((s) => Number(s.weight) || 0));

  if (weight > bestWeight) {
    created.push(await save({
      type: 'weight',
      exerciseId: set.exerciseId,
      exerciseName: exercise?.namePt || set.exerciseId,
      date: set.date,
      sessionId: set.sessionId,
      from: bestWeight,
      to: weight,
      reps,
      text: `${fmt(bestWeight)} kg → ${fmt(weight)} kg`,
    }));
  } else if (weight === bestWeight) {
    const bestRepsAtWeight = Math.max(
      ...previous.filter((s) => (Number(s.weight) || 0) === weight).map((s) => Number(s.reps) || 0),
    );
    // só avisa uma vez por sessão, no melhor resultado do dia
    const sameSessionBetter = (await store.sets.bySession(set.sessionId))
      .some((s) => s.id !== set.id && s.exerciseId === set.exerciseId
        && (Number(s.weight) || 0) === weight && (Number(s.reps) || 0) >= reps);
    if (reps > bestRepsAtWeight && !sameSessionBetter) {
      created.push(await save({
        type: 'reps',
        exerciseId: set.exerciseId,
        exerciseName: exercise?.namePt || set.exerciseId,
        date: set.date,
        sessionId: set.sessionId,
        from: bestRepsAtWeight,
        to: reps,
        weight,
        text: `${fmt(weight)} kg: ${bestRepsAtWeight} → ${reps} repetições`,
      }));
    }
  }

  return created;
}

/**
 * Recordes de volume da sessão inteira (rodado ao finalizar o treino).
 */
export async function checkSessionRecords(session) {
  const created = [];
  const sessionSets = (await store.sets.bySession(session.id)).filter((s) => !s.warmup);
  const byExercise = new Map();
  for (const s of sessionSets) {
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
    byExercise.get(s.exerciseId).push(s);
  }

  const exMap = await store.exercises.map();

  for (const [exerciseId, list] of byExercise) {
    const volume = list.reduce((acc, s) => acc + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
    if (!volume) continue;

    const history = await store.exerciseHistory(exerciseId);
    const previousSessions = history.filter((hh) => hh.sessionId !== session.id);
    if (previousSessions.length < 2) continue; // precisa de histórico para fazer sentido

    const bestVolume = Math.max(...previousSessions.map((hh) => hh.volume));
    if (volume > bestVolume) {
      created.push(await save({
        type: 'volume',
        exerciseId,
        exerciseName: exMap.get(exerciseId)?.namePt || exerciseId,
        date: session.date,
        sessionId: session.id,
        from: Math.round(bestVolume),
        to: Math.round(volume),
        text: `${Math.round(bestVolume)} kg → ${Math.round(volume)} kg de volume`,
      }));
    }
  }

  return created;
}

async function save(data) {
  const row = { id: uid('ach'), ts: Date.now(), seen: false, ...data };
  await store.db.put('achievements', row);
  return row;
}

/** Conquistas de uma sessão (usado no resumo pós-treino). */
export async function sessionAchievements(sessionId) {
  const all = await store.db.getAll('achievements');
  return all.filter((a) => a.sessionId === sessionId).sort((a, b) => a.ts - b.ts);
}

/** Últimas conquistas, mais recentes primeiro. */
export async function recentAchievements(limit = 20) {
  const all = await store.db.getAll('achievements');
  return all.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

/** Quantas conquistas nos últimos N dias. */
export async function achievementsSince(days = 7) {
  const from = addDays(today(), -days + 1);
  const all = await store.db.getAll('achievements');
  return all.filter((a) => a.date >= from);
}

/** Texto curto para o aviso na hora. */
export function celebrationText(achievement) {
  const t = RECORD_TYPES[achievement.type];
  return `${t.icon} ${t.label}! ${achievement.exerciseName}: ${achievement.text}`;
}

function fmt(v) {
  return String(parseFloat(Number(v || 0).toFixed(2))).replace('.', ',');
}
