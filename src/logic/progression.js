/**
 * Progressão dupla (double progression).
 *
 * A lógica: mantenha a mesma carga até completar o topo da faixa de repetições
 * em TODAS as séries com técnica adequada e RIR apropriado. Só então o app
 * sugere o menor aumento de carga disponível — e a decisão final é sempre sua.
 * O app nunca aumenta carga sozinho.
 */

import { sum } from '../core/util.js';

export const PROGRESSION_STATUS = {
  first: 'first',
  ready: 'ready',
  building: 'building',
  rebuilding: 'rebuilding',
  caution: 'caution',
};

/**
 * @param {object} params
 * @param {object} params.item          item do template (sets, repMin, repMax, rir)
 * @param {object|null} params.last     última performance (store.lastPerformance)
 * @param {object} params.settings      configurações (incrementos)
 * @param {boolean} [params.isolation]  exercício isolador (incremento menor)
 * @param {object|null} [params.kneeFlag] alerta do joelho, se houver
 */
export function analyzeProgression({ item, last, settings, isolation = false, kneeFlag = null }) {
  const increment = isolation
    ? (settings?.smallIncrementKg ?? 1)
    : (settings?.weightIncrementKg ?? 2.5);

  if (item.timeBased) {
    return {
      status: PROGRESSION_STATUS.building,
      title: 'Exercício por tempo',
      message: last
        ? `Última vez: ${item.durationSec}s por série. Mantenha a qualidade da posição antes de aumentar o tempo.`
        : `Meta: ${item.durationSec}s por série com boa postura.`,
      suggestedWeight: null,
      increment: 0,
    };
  }

  if (!last || !last.sets?.length) {
    return {
      status: PROGRESSION_STATUS.first,
      title: 'Primeira vez neste exercício',
      message: `Escolha uma carga que permita ficar na faixa de ${item.repMin}–${item.repMax} repetições terminando com RIR ${item.rir ?? 2} (ou seja, ainda daria para fazer mais ${item.rir ?? 2}).`,
      suggestedWeight: null,
      increment,
    };
  }

  const working = last.sets.filter((s) => !s.warmup);
  const topWeight = Math.max(...working.map((s) => Number(s.weight) || 0));
  const setsAtTopWeight = working.filter((s) => (Number(s.weight) || 0) === topWeight);
  const allAtTop = setsAtTopWeight.length >= (item.sets || working.length)
    && setsAtTopWeight.every((s) => (Number(s.reps) || 0) >= item.repMax);
  const rirOk = setsAtTopWeight.every((s) => s.rir == null || Number(s.rir) >= 0);
  const totalReps = sum(working, (s) => s.reps);

  if (kneeFlag?.avoidLoadIncrease) {
    return {
      status: PROGRESSION_STATUS.caution,
      title: 'Cautela hoje',
      message: `${kneeFlag.reason} Mantenha a carga de ${fmt(topWeight)} kg (ou menos) e priorize execução sem dor.`,
      suggestedWeight: topWeight,
      increment: 0,
      lastTopWeight: topWeight,
      lastTotalReps: totalReps,
    };
  }

  if (allAtTop && rirOk) {
    return {
      status: PROGRESSION_STATUS.ready,
      title: '🎯 Possível progressão',
      message: `Você atingiu o topo da faixa (${item.repMax} repetições) em todas as séries. Considere o menor aumento disponível de carga no próximo treino — de ${fmt(topWeight)} kg para ${fmt(topWeight + increment)} kg. É normal voltar para o começo da faixa depois do aumento.`,
      suggestedWeight: topWeight + increment,
      increment,
      lastTopWeight: topWeight,
      lastTotalReps: totalReps,
    };
  }

  const reachedMin = setsAtTopWeight.every((s) => (Number(s.reps) || 0) >= item.repMin);
  return {
    status: reachedMin ? PROGRESSION_STATUS.building : PROGRESSION_STATUS.rebuilding,
    title: reachedMin ? 'Construindo repetições' : 'Reconstruindo a faixa',
    message: reachedMin
      ? `Mantenha ${fmt(topWeight)} kg e tente somar repetições até chegar a ${item.repMax} em todas as séries. Meta de hoje: superar ${totalReps} repetições totais com boa execução.`
      : `Mantenha ${fmt(topWeight)} kg até voltar a ${item.repMin} repetições em todas as séries. Depois do aumento de carga é normal cair para o começo da faixa.`,
    suggestedWeight: topWeight,
    increment,
    lastTopWeight: topWeight,
    lastTotalReps: totalReps,
  };
}

/** Texto curto "45 kg × 10 / 9 / 8". */
export function formatLastSets(last) {
  if (!last?.sets?.length) return 'Sem registro anterior';
  const working = last.sets.filter((s) => !s.warmup);
  const weights = [...new Set(working.map((s) => Number(s.weight) || 0))];
  const reps = working.map((s) => s.reps ?? '—').join(' / ');
  if (weights.length === 1) return `${fmt(weights[0])} kg × ${reps}`;
  return working.map((s) => `${fmt(s.weight)}×${s.reps}`).join('  ');
}

function fmt(v) {
  return String(parseFloat(Number(v || 0).toFixed(2))).replace('.', ',');
}

/** Detecta se o exercício é isolador (incremento menor de carga). */
export function isIsolation(exercise) {
  if (!exercise) return false;
  const isolationIds = new Set([
    'lateral-raise', 'reverse-fly', 'biceps-curl', 'hammer-curl', 'triceps-pushdown',
    'pec-deck', 'cable-crossover', 'leg-extension', 'leg-curl', 'calf-raise',
    'hip-abduction', 'cable-crunch',
  ]);
  return isolationIds.has(exercise.id) || ['Bíceps', 'Tríceps', 'Panturrilha', 'Core'].includes(exercise.muscleGroup);
}

/** Volume (carga × repetições) de uma lista de séries. */
export function setsVolume(sets) {
  return sum(sets.filter((s) => !s.warmup), (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0));
}
