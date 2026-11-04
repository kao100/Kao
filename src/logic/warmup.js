/**
 * PREPARAÇÃO PARA O TREINO — monta o aquecimento do dia.
 *
 * Funções puras (sem banco e sem DOM): recebem o treino, o tempo disponível e
 * a condição do dia, e devolvem as etapas com tempo, exercícios e as séries
 * preparatórias já calculadas a partir da sua última carga.
 *
 * Regras:
 *  - superiores: ~5–8 min; pernas: ~8–12 min (referências iniciais);
 *  - o tempo da preparação NÃO encolhe para caber o treino: com pouco tempo,
 *    quem perde espaço é o acessório, não o aquecimento;
 *  - joelho em atenção/cautela ou recuperação ruim → preparação mais longa e
 *    mais gradual, nunca mais curta;
 *  - sem alongamento estático longo antes de força: tudo é dinâmico.
 */

import {
  DRILLS, UPPER_ACTIVATION, UPPER_MOBILITY, LOWER_MOBILITY, LOWER_ACTIVATION,
  HOME_UPPER_ACTIVATION, GUIDED_ISOMETRIC_IDS,
} from '../data/warmup.js';

export const LOWER_GROUPS = ['Quadríceps', 'Posterior de coxa', 'Glúteos', 'Panturrilha'];

const UPPER_EMPHASIS = {
  Peito: 'chest',
  Costas: 'back',
  Ombros: 'shoulders',
  'Bíceps': 'arms',
  'Tríceps': 'arms',
};

export const FOCUS_LABEL = {
  chest: 'peito',
  back: 'costas',
  shoulders: 'ombros',
  arms: 'braços',
  legs: 'pernas',
  core: 'core',
};

/** Tempo de preparação de referência por duração escolhida. */
const UPPER_MINUTES = { 30: 5, 40: 6, 60: 7, 90: 8, 120: 8 };
const LOWER_MINUTES = { 30: 8, 40: 9, 60: 10, 90: 12, 120: 12 };

/** Encaixa qualquer duração numa das cinco faixas. */
export function budgetBand(budget) {
  const b = Number(budget) || 60;
  if (b < 35) return 30;
  if (b < 50) return 40;
  if (b < 75) return 60;
  if (b < 105) return 90;
  return 120;
}

/**
 * Do que é o treino: pernas ou superiores — e, nos superiores, qual a ênfase
 * (peito, costas, ombros ou braços), lida do primeiro exercício de tronco.
 */
export function templateFocus(items, exMap) {
  let lower = 0;
  let upper = 0;
  for (const it of items || []) {
    const ex = exMap.get(it.exerciseId);
    if (!ex) continue;
    const sets = Number(it.sets) || 0;
    if (LOWER_GROUPS.includes(ex.muscleGroup)) lower += sets;
    else if (UPPER_EMPHASIS[ex.muscleGroup]) upper += sets;
  }
  if (!lower && !upper) return { region: 'core', emphasis: 'core', secondary: null };
  if (lower >= upper) return { region: 'lower', emphasis: 'legs', secondary: null };

  const upperEx = (items || [])
    .map((it) => exMap.get(it.exerciseId))
    .filter((ex) => ex && UPPER_EMPHASIS[ex.muscleGroup]);
  const emphasis = UPPER_EMPHASIS[upperEx[0].muscleGroup];
  // segunda ênfase: o primeiro exercício de outro padrão entre os três primeiros
  const second = upperEx.slice(0, 3).find((ex) => UPPER_EMPHASIS[ex.muscleGroup] !== emphasis);
  return { region: 'upper', emphasis, secondary: second ? UPPER_EMPHASIS[second.muscleGroup] : null };
}

/**
 * Quantos minutos de preparação hoje.
 * Só aumenta com joelho sensível ou recuperação ruim — nunca diminui para
 * caber o treino.
 */
export function prepMinutes(region, budget, { kneeLevel = 'ok', readiness = null } = {}) {
  const band = budgetBand(budget);
  const reasons = [];
  if (region === 'core') return { minutes: 4, base: 4, reasons };

  const base = region === 'lower' ? LOWER_MINUTES[band] : UPPER_MINUTES[band];
  let extra = 0;
  if (region === 'lower' && kneeLevel === 'caution') {
    extra += 2;
    reasons.push('joelho em cautela: aquecimento mais longo e mais gradual');
  } else if (region === 'lower' && kneeLevel === 'attention') {
    extra += 1;
    reasons.push('joelho em atenção: uma série preparatória a mais');
  }
  if (readiness === 'red') {
    extra += 2;
    reasons.push('recuperação baixa hoje: corpo precisa de mais tempo para esquentar');
  } else if (readiness === 'yellow') {
    extra += 1;
    reasons.push('recuperação parcial hoje');
  }
  return { minutes: base + Math.min(3, extra), base, reasons };
}

const drill = (id) => ({ id, ...DRILLS[id] });

function roundTo(value, increment) {
  const inc = increment > 0 ? increment : 1;
  return Math.max(0, Math.round(value / inc) * inc);
}

/**
 * Séries preparatórias de um exercício, calculadas da carga de trabalho.
 * Sem histórico, o app mostra a porcentagem — não inventa número.
 */
export function rampSets(item, exercise, last, { kneeDemanding = false, increment = 2.5, feeler = false } = {}) {
  const name = exercise?.namePt || item.exerciseName || item.exerciseId;
  const bodyweight = item.timeBased || exercise?.type === 'bodyweight';
  if (bodyweight) {
    const reps = Math.max(3, Math.ceil((item.repMin || item.repMax || 8) / 2));
    return {
      exerciseId: item.exerciseId,
      exerciseName: name,
      workWeight: null,
      sets: [{ label: 'Série fácil', reps: item.timeBased ? null : reps, seconds: item.timeBased ? Math.round((item.durationSec || 30) / 2) : null, weight: null, pct: null }],
      note: 'Uma série fácil, bem longe da falha, só para ensaiar o movimento.',
    };
  }

  const heavy = (item.repMax || 12) <= 8 || (item.restSec || 0) >= 150;
  let scheme;
  if (feeler) scheme = [[0.6, 6]];
  else if (kneeDemanding) scheme = [[0.4, 10], [0.6, 6], [0.8, 3]];
  else if (heavy) scheme = [[0.4, 8], [0.6, 5], [0.8, 3]];
  else scheme = [[0.5, 8], [0.75, 4]];

  const work = Number(last?.topWeight) || null;
  const sets = scheme.map(([pct, reps]) => ({
    label: `${Math.round(pct * 100)}%`,
    pct,
    reps,
    weight: work ? roundTo(work * pct, increment) : null,
    seconds: null,
  }));

  let note = work
    ? `Calculado sobre a sua última carga de trabalho (${work} kg). Descanse só o necessário para trocar a carga.`
    : 'Ainda não há carga registrada neste exercício: use as porcentagens sobre a carga que você pretende usar hoje.';
  if (kneeDemanding) {
    note += ' Comece com amplitude menor e aumente série a série até a amplitude de trabalho — nunca além dela.';
  }
  if (feeler) note = 'Uma série leve para o segundo padrão do dia chegar preparado.';

  return { exerciseId: item.exerciseId, exerciseName: name, workWeight: work, sets, note };
}

/**
 * Monta a preparação completa.
 * @param {object} o
 * @param {{region:string, emphasis:string, secondary:string|null}} o.focus
 * @param {number} o.minutes                minutos de preparação
 * @param {Array} o.items                   itens do treino (já ajustados ao tempo)
 * @param {Map} o.exMap                     exercícios por id
 * @param {Map} [o.lastByExercise]          última performance por exercício
 * @param {{level:string}} [o.knee]
 * @param {object|null} [o.guidance]        orientação médica ativa
 * @param {'gym'|'home'} [o.location]
 * @param {number} [o.increment]            incremento de carga (kg)
 */
export function buildPrep({
  focus, minutes, items, exMap, lastByExercise = new Map(), knee = { level: 'ok' },
  guidance = null, location = 'gym', increment = 2.5, reasons = [],
}) {
  if (!minutes || !items?.length) return null;
  const home = location === 'home';
  const notes = [...reasons];
  const steps = focus.region === 'lower'
    ? lowerSteps({ minutes, items, exMap, lastByExercise, knee, guidance, home, increment, notes })
    : upperSteps({ focus, minutes, items, exMap, lastByExercise, home, increment });

  return {
    minutes: steps.reduce((s, st) => s + st.minutes, 0),
    focus,
    steps: steps.map((st, i) => ({ ...st, index: i, seconds: Math.round(st.minutes * 60) })),
    notes,
  };
}

function upperSteps({ focus, minutes, items, exMap, lastByExercise, home, increment }) {
  const mobility = 2;
  const activation = minutes >= 6 ? 2 : 1;
  const ramp = Math.max(2, minutes - mobility - activation);
  const first = items[0];
  const firstEx = exMap.get(first.exerciseId);
  const label = FOCUS_LABEL[focus.emphasis] || 'tronco';

  const mobilityDrills = home
    ? ['arm-circles', 'scap-pushup']
    : UPPER_MOBILITY.slice(0, minutes >= 8 ? 3 : 2);

  const actIds = home
    ? HOME_UPPER_ACTIVATION
    : [...(UPPER_ACTIVATION[focus.emphasis] || UPPER_ACTIVATION.chest).slice(0, 2)];
  if (!home && focus.secondary && minutes >= 7) {
    const extra = (UPPER_ACTIVATION[focus.secondary] || []).find((id) => !actIds.includes(id));
    if (extra) actIds.push(extra);
  }

  const ramps = [rampSets(first, firstEx, lastByExercise.get(first.exerciseId), { increment })];
  if (focus.secondary && !home) {
    const secondItem = items.slice(1, 4).find((it) => {
      const ex = exMap.get(it.exerciseId);
      return ex && ex.muscleGroup !== firstEx?.muscleGroup && ['Peito', 'Costas', 'Ombros'].includes(ex.muscleGroup);
    });
    if (secondItem) {
      ramps.push(rampSets(secondItem, exMap.get(secondItem.exerciseId), lastByExercise.get(secondItem.exerciseId), { increment, feeler: true }));
    }
  }

  return [
    {
      kind: 'mobility',
      title: 'Mobilidade de ombros, cotovelos e escápulas',
      short: 'Mobilidade dinâmica',
      minutes: mobility,
      goal: 'Soltar as articulações que o treino vai usar, com movimentos leves e amplitude crescente.',
      drills: mobilityDrills.map(drill),
    },
    {
      kind: 'activation',
      title: `Ativação para ${firstEx?.namePt || 'o primeiro exercício'}`,
      short: `Ativação (${label})`,
      minutes: activation,
      goal: `Acordar os músculos que estabilizam o treino de ${label} — carga quase nenhuma, sem cansar.`,
      drills: actIds.map(drill),
    },
    {
      kind: 'ramp',
      title: 'Séries preparatórias',
      short: 'Séries preparatórias',
      minutes: ramp,
      goal: 'Ensaiar o primeiro exercício com carga menor que a de trabalho. Não contam como série do treino.',
      drills: [],
      ramps,
    },
  ];
}

function lowerSteps({ minutes, items, exMap, lastByExercise, knee, guidance, home, increment, notes }) {
  const cardio = minutes >= 12 ? 5 : minutes >= 10 ? 4 : 3;
  const activation = minutes >= 11 ? 2 : 0;
  const mobility = minutes >= 14 ? 3 : 2;
  const ramp = Math.max(3, minutes - cardio - activation - mobility);
  const caution = knee?.level === 'caution';

  const cardioDrills = home
    ? ['march-home']
    : caution ? ['bike-gentle', 'walk-easy'] : ['bike-easy', 'walk-easy'];

  const mobIds = ['leg-swing-front', 'ankle-rock'];
  if (mobility >= 3) mobIds.push('hip-openers');
  if (!caution) mobIds.push('partial-squat');
  if (!activation) mobIds.push('glute-bridge-act');

  const actIds = [...LOWER_ACTIVATION.slice(0, 2)];
  const allowedIso = (guidance?.allowedExerciseIds || []).some((id) => GUIDED_ISOMETRIC_IDS.includes(id));
  if (allowedIso) actIds.push('iso-guided');

  if (caution) {
    notes.push('Joelho em cautela: o fortalecimento continua, mas sem progressão hoje. Amplitude confortável e cargas que não aumentem a dor.');
  }

  // séries preparatórias: o primeiro exercício e o primeiro que exige do joelho
  const first = items[0];
  const firstEx = exMap.get(first.exerciseId);
  const isKneeDemanding = (ex) => ex && (ex.kneeRisk === 'moderate' || ex.kneeRisk === 'high');
  const ramps = [rampSets(first, firstEx, lastByExercise.get(first.exerciseId), {
    increment, kneeDemanding: isKneeDemanding(firstEx),
  })];
  const kneeItem = items.slice(1).find((it) => isKneeDemanding(exMap.get(it.exerciseId)));
  if (kneeItem && !isKneeDemanding(firstEx)) {
    ramps.push(rampSets(kneeItem, exMap.get(kneeItem.exerciseId), lastByExercise.get(kneeItem.exerciseId), {
      increment, kneeDemanding: true,
    }));
  }

  const steps = [
    {
      kind: 'cardio',
      title: home ? 'Aquecimento leve' : caution ? 'Bicicleta bem leve' : 'Bicicleta leve',
      short: home ? 'Marcha leve' : 'Bicicleta leve',
      minutes: cardio,
      goal: 'Subir a temperatura do corpo e do tendão antes da carga. Se a bicicleta não for confortável para o joelho, troque pela caminhada.',
      drills: cardioDrills.map(drill),
    },
    {
      kind: 'mobility',
      title: activation ? 'Mobilidade de quadril, tornozelo e joelho' : 'Mobilidade dinâmica + ativação de glúteo',
      short: 'Mobilidade dinâmica',
      minutes: mobility,
      goal: 'Movimentos dinâmicos dentro de amplitudes confortáveis. Nada de forçar o fim do movimento.',
      drills: mobIds.map(drill),
    },
  ];
  if (activation) {
    steps.push({
      kind: 'activation',
      title: 'Ativação de glúteos e quadril',
      short: 'Ativação',
      minutes: activation,
      goal: 'Glúteo médio ativo ajuda a manter o joelho alinhado durante o treino.',
      drills: actIds.map(drill),
    });
  }
  steps.push({
    kind: 'ramp',
    title: 'Séries preparatórias',
    short: 'Séries preparatórias',
    minutes: ramp,
    goal: 'Carga e amplitude crescentes até a de trabalho. Não contam como série do treino.',
    drills: [],
    ramps,
  });
  return steps;
}

/** Texto curto de uma etapa: "Bicicleta leve — 4 min". */
export function stepLine(step) {
  return `${step.short || step.title} — ${formatStepMinutes(step.minutes)}`;
}

function formatStepMinutes(m) {
  return `${Number.isInteger(m) ? m : m.toFixed(1).replace('.', ',')} min`;
}
