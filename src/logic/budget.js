/**
 * Tempo do dia — o seletor 30 MIN / 40 MIN / 1 HORA / 1H30 / 2 HORAS.
 *
 * Ao escolher a duração, o tempo é dividido em blocos, nesta ordem de
 * prioridade:
 *
 *   1. PREPARAÇÃO — reservada primeiro e nunca encolhida para caber o resto;
 *   2. MUSCULAÇÃO — o que sobra, cortando pelo acessório, nunca pelo essencial;
 *   3. CARDIO / FINALIZAÇÃO — no dia em que há cardio programado, ou quando
 *      sobra tempo de verdade.
 *
 * Como a musculação encolhe quando falta tempo:
 *   - o descanso entre séries NÃO é encurtado (é ele que sustenta a carga);
 *   - sai primeiro o acessório de menor prioridade (core, braço, isolador);
 *   - depois, as séries dos exercícios de menor prioridade caem de 3 para 2;
 *   - o primeiro exercício do dia é protegido;
 *   - peito, costas e ombros têm prioridade nos dias de superiores (Projeto
 *     Casamento); quadríceps, posteriores e glúteos nos dias de pernas.
 *
 * Quando sobra tempo, o app NÃO inventa volume: oferece cardio leve e
 * complementos, e diz quanto tempo ficou livre.
 */

import { estimateItemSeconds } from './duration.js';
import { kneeInfo } from '../data/exercises.js';

export const DURATION_OPTIONS = [
  { min: 30, label: '30 MIN' },
  { min: 40, label: '40 MIN' },
  { min: 60, label: '1 HORA' },
  { min: 90, label: '1H30' },
  { min: 120, label: '2 HORAS' },
];

export function durationLabel(min) {
  return DURATION_OPTIONS.find((o) => o.min === Number(min))?.label || `${min} MIN`;
}

/** Folga aceitável na estimativa: a conta é aproximada, não cronometrada. */
const TOLERANCE_MIN = 1;
/** Abaixo disso, cardio não vale a troca de aparelho — vira sugestão de complemento. */
const MIN_CARDIO = 10;

const UPPER_PRIORITY = {
  Peito: 10, Costas: 10, Ombros: 8, 'Bíceps': 5, 'Tríceps': 5, Core: 4,
  'Quadríceps': 5, 'Posterior de coxa': 5, 'Glúteos': 5, Panturrilha: 4,
};
const LOWER_PRIORITY = {
  'Quadríceps': 9, 'Posterior de coxa': 8, 'Glúteos': 8, Panturrilha: 7, Core: 4,
  'Bíceps': 3, 'Tríceps': 3, Peito: 5, Costas: 5, Ombros: 5,
};
/** Ajustes finos: largura de ombro e estabilidade do joelho pesam mais. */
const EXERCISE_PRIORITY = {
  'lateral-raise': 8.5,  // deltoide lateral = largura visual
  'reverse-fly': 7.5,    // posterior de ombro
  'hip-abduction': 7,    // glúteo médio: alinhamento do joelho
};

const ISOLATION_IDS = new Set([
  'lateral-raise', 'reverse-fly', 'biceps-curl', 'hammer-curl', 'triceps-pushdown',
  'pec-deck', 'cable-crossover', 'leg-extension', 'leg-curl', 'calf-raise', 'hip-abduction', 'cable-crunch',
]);

export function itemPriority(item, ex, region) {
  if (!ex) return 3;
  const table = region === 'lower' ? LOWER_PRIORITY : UPPER_PRIORITY;
  let p = EXERCISE_PRIORITY[ex.id] ?? table[ex.muscleGroup] ?? 4;
  const isolation = ISOLATION_IDS.has(ex.id) || ['Bíceps', 'Tríceps', 'Panturrilha', 'Core'].includes(ex.muscleGroup);
  if (!isolation) p += 1;
  // dia de pernas: o que faz parte do fortalecimento do joelho pesa um pouco mais
  if (region === 'lower' && kneeInfo(ex.id)) p += 0.5;
  return p;
}

export function estimateItemsMinutes(items) {
  return (items || []).reduce((s, it) => s + estimateItemSeconds(it), 0) / 60;
}

/**
 * Ajusta os exercícios ao tempo-alvo.
 * @returns {{items:Array, removed:Array, reduced:Array, minutes:number, full:number}}
 */
export function trimToFit(items, targetMin, { region = 'upper', exMap = new Map() } = {}) {
  const full = estimateItemsMinutes(items);
  const list = (items || []).map((it, i) => ({
    ...it,
    _i: i,
    _p: itemPriority(it, exMap.get(it.exerciseId), region),
    _protected: i === 0,
    _origSets: it.sets,
  }));
  const removed = [];
  const dropped = [];
  const nameOf = (it) => exMap.get(it.exerciseId)?.namePt || it.exerciseName || it.exerciseId;

  const over = () => estimateItemsMinutes(list) > targetMin + TOLERANCE_MIN;
  let guard = 200;
  while (over() && guard-- > 0) {
    const candidates = list.filter((x) => !x._protected);
    if (!candidates.length) {
      const first = list[0];
      if (first && first.sets > 2) { first.sets -= 1; continue; }
      break;
    }
    // menor prioridade; empate → o que vem depois no treino sai primeiro
    const lowest = [...candidates].sort((a, b) => a._p - b._p || b._i - a._i)[0];
    if (lowest._p < 8) {
      list.splice(list.indexOf(lowest), 1);
      dropped.push(lowest);
      removed.push({ exerciseId: lowest.exerciseId, name: nameOf(lowest), sets: lowest._origSets, reason: 'acessório — fica para um dia com mais tempo' });
      continue;
    }
    const cut = candidates.filter((x) => x.sets > 2).sort((a, b) => a._p - b._p || b._i - a._i)[0];
    if (cut) { cut.sets -= 1; continue; }
    list.splice(list.indexOf(lowest), 1);
    dropped.push(lowest);
    removed.push({ exerciseId: lowest.exerciseId, name: nameOf(lowest), sets: lowest._origSets, reason: 'não coube sem cortar descanso' });
  }

  // Repõe o que cabe: um acessório tirado cedo demais pode voltar se, depois
  // dos cortes, sobrou espaço — sem passar do tempo e na ordem de prioridade.
  const fits = () => estimateItemsMinutes(list) <= targetMin + TOLERANCE_MIN;
  for (const back of [...dropped].sort((a, b) => b._p - a._p)) {
    const pos = list.findIndex((x) => x._i > back._i);
    const at = pos === -1 ? list.length : pos;
    list.splice(at, 0, back);
    if (fits()) {
      const k = removed.findIndex((r) => r.exerciseId === back.exerciseId);
      if (k >= 0) removed.splice(k, 1);
    } else {
      list.splice(at, 1);
    }
  }
  for (const it of [...list].sort((a, b) => b._p - a._p)) {
    while (it.sets < it._origSets) {
      it.sets += 1;
      if (!fits()) { it.sets -= 1; break; }
    }
  }

  const reduced = list
    .filter((x) => x.sets !== x._origSets)
    .map((x) => ({ exerciseId: x.exerciseId, name: nameOf(x), from: x._origSets, to: x.sets }));

  const clean = list.map(({ _i, _p, _protected, _origSets, ...rest }) => rest);
  return { items: clean, removed, reduced, minutes: estimateItemsMinutes(clean), full };
}

function isHard(plan) {
  const scale = String(plan?.rpe || '').split('/')[0];
  const nums = scale.match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) >= 6 : false;
}

/**
 * Divide o tempo do dia.
 * @param {object} o
 * @param {number} o.budget               minutos escolhidos
 * @param {'upper'|'lower'|'core'} o.region
 * @param {number} o.prepMin              minutos de preparação (já decididos)
 * @param {object} o.template             treino de musculação do dia
 * @param {object|null} o.cardioPlan      cardio programado junto, se houver
 * @param {boolean} [o.cardioFirst]       o cardio é o principal do dia (vem antes)
 * @param {Array} [o.cardioPlans]         todos os planos (para achar um mais curto)
 * @param {Map} o.exMap
 */
export function allocateDay({
  budget, region, prepMin = 0, template, cardioPlan = null, cardioFirst = false, cardioPlans = [], exMap = new Map(),
}) {
  const items = template?.items || [];
  const notes = [];
  const segments = [];
  let chosenCardio = cardioPlan;
  let cardioMin = 0;
  let finishMin = 0;
  let strengthTarget;

  if (cardioFirst && cardioPlan) {
    // dia em que o cardio é o treino principal: ele entra inteiro primeiro
    if (cardioPlan.totalMin > budget) {
      const shorter = cardioPlans
        .filter((p) => p.totalMin <= budget && isHard(p) === isHard(cardioPlan) && !p.home)
        .sort((a, b) => b.totalMin - a.totalMin)[0];
      if (shorter) {
        chosenCardio = shorter;
        notes.push(`"${cardioPlan.name}" pede ${cardioPlan.totalMin} min. Com ${budget}, a troca equivalente é "${shorter.name}".`);
      } else {
        notes.push(`"${cardioPlan.name}" pede ${cardioPlan.totalMin} min — com ${budget}, faça só o tempo que couber, sem pular o aquecimento do plano.`);
      }
    }
    cardioMin = Math.min(chosenCardio.totalMin, budget);
    strengthTarget = budget - cardioMin - prepMin;
    if (strengthTarget < 8) {
      notes.push('Os acessórios ficam para outro dia: hoje o tempo é do cardio.');
      strengthTarget = 0;
    }
  } else if (region === 'lower') {
    const available = budget - prepMin;
    finishMin = budget >= 60 ? 5 : 0;
    strengthTarget = available - finishMin;
  } else {
    const available = budget - prepMin;
    strengthTarget = available;
    if (cardioPlan) {
      // superiores + cardio no mesmo dia: ~3/4 musculação, ~1/4 cardio
      const share = Math.round(available * 0.75);
      if (available - share >= MIN_CARDIO) strengthTarget = share;
    }
  }

  const trimmed = strengthTarget > 0
    ? trimToFit(items, strengthTarget, { region, exMap })
    : { items: [], removed: items.map((it) => ({ exerciseId: it.exerciseId, name: exMap.get(it.exerciseId)?.namePt || it.exerciseId, sets: it.sets, reason: 'sem tempo hoje' })), reduced: [], minutes: 0, full: estimateItemsMinutes(items) };
  const strengthMin = Math.round(trimmed.minutes);

  let free = 0;
  if (cardioFirst && cardioPlan) {
    free = Math.max(0, budget - cardioMin - prepMin - strengthMin);
  } else if (region === 'lower') {
    let left = Math.max(0, budget - prepMin - strengthMin - finishMin);
    if (cardioPlan && left + finishMin >= 15) {
      cardioMin = Math.min(cardioPlan.totalMin, left + finishMin);
      left = left + finishMin - cardioMin;
      finishMin = 0;
    } else if (cardioPlan) {
      notes.push(`Sem tempo para "${cardioPlan.name}" hoje — a volta à calma de 5 min já fecha o treino.`);
    }
    free = left;
  } else {
    const left = Math.max(0, budget - prepMin - strengthMin);
    if (cardioPlan) {
      cardioMin = Math.min(cardioPlan.totalMin, left);
      if (cardioMin < MIN_CARDIO) {
        notes.push(`Cardio de hoje não coube em ${budget} min. Se puder, faça em outro momento do dia — ou escolha mais tempo.`);
        cardioMin = 0;
      }
      free = left - cardioMin;
    } else {
      free = left;
    }
  }

  if (prepMin) segments.push({ key: 'prep', label: 'Preparação', icon: '🔥', minutes: prepMin });
  if (cardioFirst && cardioMin) segments.push({ key: 'cardio', label: 'Cardio', icon: '❤️', minutes: cardioMin, plan: chosenCardio });
  if (strengthMin) segments.push({ key: 'strength', label: 'Musculação', icon: '🏋️', minutes: strengthMin });
  if (!cardioFirst && cardioMin) segments.push({ key: 'cardio', label: region === 'lower' ? 'Cardio leve' : 'Cardio', icon: '❤️', minutes: cardioMin, plan: chosenCardio });
  if (finishMin) segments.push({ key: 'finish', label: 'Volta à calma', icon: '🚶', minutes: finishMin });

  // tempo que sobrou: cardio opcional nos dias de superiores, depois complementos
  let optionalCardio = 0;
  if (!cardioPlan && region !== 'lower' && free >= 15) {
    optionalCardio = Math.min(30, free);
    free -= optionalCardio;
    segments.push({ key: 'cardio-optional', label: 'Cardio opcional', icon: '❤️', minutes: optionalCardio, optional: true });
  }
  if (free >= 5) segments.push({ key: 'free', label: 'Livre', icon: '➕', minutes: Math.round(free), optional: true });

  if (trimmed.removed.length || trimmed.reduced.length) {
    notes.push('Para caber no tempo, o app tirou primeiro os acessórios e só depois reduziu séries. Descanso e técnica ficam como estão.');
  }
  if (strengthMin && trimmed.full > strengthMin + TOLERANCE_MIN && !trimmed.removed.length && !trimmed.reduced.length) {
    // nada foi cortado, mas a estimativa passou: só avisa
    notes.push('O treino completo passa um pouco do tempo escolhido.');
  }

  return {
    budget,
    prepMin,
    strengthMin,
    cardioMin,
    finishMin,
    optionalCardio,
    freeMin: Math.max(0, Math.round(free)),
    cardioPlan: cardioMin ? chosenCardio : null,
    items: trimmed.items,
    removed: trimmed.removed,
    reduced: trimmed.reduced,
    fullStrengthMin: Math.round(trimmed.full),
    segments,
    notes,
  };
}
