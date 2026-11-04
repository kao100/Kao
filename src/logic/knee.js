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
  'pre-cardio': 'Antes do cardio',
  'post-cardio': 'Depois do cardio',
  'pre-workout': 'Antes do treino',
  'post-workout': 'Depois do treino',
  'next-day': 'Dia seguinte ao treino/jogo',
  daily: 'Registro do dia',
  other: 'Outro momento',
};

/** Onde dói — só para descrever ao profissional, não para diagnosticar. */
export const PAIN_LOCATIONS = [
  { value: 'below-patella', label: 'Abaixo da patela (tendão)' },
  { value: 'above-patella', label: 'Acima da patela' },
  { value: 'patella', label: 'Na patela / em volta' },
  { value: 'inner', label: 'Parte interna' },
  { value: 'outer', label: 'Parte externa' },
  { value: 'back', label: 'Atrás do joelho' },
  { value: 'diffuse', label: 'Difusa / não sei dizer' },
];

/** Respostas rápidas por exercício e no dia seguinte. */
export const KNEE_RESPONSES = {
  during: [
    { value: 'none', label: 'Exercício realizado sem dor', short: 'sem dor', tone: 'ok' },
    { value: 'mild', label: 'Desconforto leve', short: 'desconforto leve', tone: 'warn' },
    { value: 'worse', label: 'Dor aumentou', short: 'dor aumentou', tone: 'danger' },
  ],
  after: [
    { value: 'none', label: 'Sem dor depois', short: 'sem dor depois', tone: 'ok' },
    { value: 'mild', label: 'Desconforto leve depois', short: 'desconforto leve', tone: 'warn' },
    { value: 'worse', label: 'Dor aumentou após o treino', short: 'dor aumentou após', tone: 'danger' },
  ],
  'next-day': [
    { value: 'better', label: 'Joelho melhor no dia seguinte', short: 'melhor no dia seguinte', tone: 'ok' },
    { value: 'same', label: 'Igual ao normal', short: 'igual', tone: 'neutral' },
    { value: 'worse', label: 'Pior no dia seguinte', short: 'pior no dia seguinte', tone: 'danger' },
  ],
};

export function responseLabel(phase, value) {
  return KNEE_RESPONSES[phase]?.find((r) => r.value === value)?.short || value;
}

/**
 * Situação atual do joelho comparada ao próprio padrão recente.
 *
 * Duas regras de fundo:
 *  - nenhum número é "autorização". Dor baixa não libera aumento de carga
 *    por si só: a progressão também depende da resposta em 24 h, do que você
 *    mudou na última sessão e das orientações profissionais;
 *  - melhora nos registros não é recuperação completa. O app comemora a
 *    tendência, mas continua pedindo progressão de uma variável por vez.
 *
 * @returns {Promise<{
 *   level:'ok'|'attention'|'caution', latest:object|null, baseline:number|null,
 *   reason:string, avoidLoadIncrease:boolean, stopProgression:boolean,
 *   seekProfessional:boolean, trend:object, messages:string[]
 * }>}
 */
export async function kneeStatus(referenceDate = today()) {
  const [allLogs, responses, guidance] = await Promise.all([
    store.painLogs.all(),
    store.kneeResponses.all(),
    store.activeMedicalGuidance(),
  ]);
  const logs = allLogs.filter((l) => l.date <= referenceDate).sort(byNewest);
  const messages = [];
  const trend = computeTrend(logs, referenceDate);
  const progressionBlockedByGuidance = guidance?.strengthening?.allowProgression === 'no';

  if (!logs.length) {
    return {
      level: 'ok', latest: null, baseline: null, avoidLoadIncrease: progressionBlockedByGuidance,
      stopProgression: false, seekProfessional: false, trend,
      reason: 'Ainda não há registros de dor no joelho.',
      messages: ['Registre a dor antes dos treinos de perna, do cardio e do futebol para acompanhar a evolução.'],
    };
  }

  const latest = logs[0];
  const from = addDays(referenceDate, -28);
  const window = logs.filter((l) => l.date >= from && l.id !== latest.id);
  const baseline = window.length ? avg(window, (l) => l.score) : avg(logs, (l) => l.score);

  let level = 'ok';
  let avoidLoadIncrease = false;
  let stopProgression = false;
  let seekProfessional = false;
  const reasons = [];
  const raise = (to) => { if (rank(to) > rank(level)) level = to; };

  if (latest.score >= 5) {
    raise('caution');
    avoidLoadIncrease = true;
    reasons.push(`Você registrou dor ${latest.score}/10 (${PAIN_LABELS[latest.score]}) em ${formatDate(latest.date, 'full')}.`);
  } else if (baseline != null && latest.score >= baseline + 2 && latest.score >= 3) {
    raise('caution');
    avoidLoadIncrease = true;
    reasons.push(`A dor de hoje (${latest.score}/10) está acima do seu padrão das últimas semanas (média ${baseline.toFixed(1)}/10).`);
  } else if (latest.score >= 3) {
    raise('attention');
    avoidLoadIncrease = true;
    reasons.push(`Dor perceptível registrada (${latest.score}/10).`);
  }

  if (latest.swelling) {
    raise('caution');
    avoidLoadIncrease = true;
    stopProgression = true;
    reasons.push('Inchaço registrado no último check.');
  }
  if (latest.instability) {
    raise('caution');
    avoidLoadIncrease = true;
    stopProgression = true;
    reasons.push('Sensação de instabilidade registrada no último check.');
  }
  if (latest.stiffness) {
    raise('attention');
    avoidLoadIncrease = true;
    reasons.push('Rigidez registrada no último check.');
  }
  if (latest.stairsDifficulty) {
    raise('attention');
    avoidLoadIncrease = true;
    reasons.push('Dificuldade para caminhar ou subir escadas registrada.');
  }
  if (latest.painDuringMovement && latest.score >= 3) {
    avoidLoadIncrease = true;
    reasons.push('Dor durante o movimento no último check.');
  }

  // aumento persistente: os três últimos registros acima do seu padrão
  const last3 = logs.slice(0, 3);
  if (last3.length === 3 && baseline != null && window.length >= 3
    && last3.every((l) => l.score >= 3 && l.score >= baseline + 1)) {
    raise('caution');
    avoidLoadIncrease = true;
    stopProgression = true;
    reasons.push('Os três últimos registros ficaram acima do seu padrão — a dor está persistindo.');
  }

  // resposta no dia seguinte (os últimos 7 dias)
  const weekAgo = addDays(referenceDate, -7);
  const worseNextDay = responses.filter((r) => r.phase === 'next-day' && r.value === 'worse' && r.date >= weekAgo && r.date <= referenceDate);
  const worseDuring = responses.filter((r) => (r.phase === 'during' || r.phase === 'after') && r.value === 'worse' && r.date >= weekAgo && r.date <= referenceDate);
  if (worseNextDay.length >= 2) {
    raise('caution');
    avoidLoadIncrease = true;
    stopProgression = true;
    reasons.push(`O joelho acordou pior ${worseNextDay.length} vezes nesta semana depois de treino ou jogo.`);
  } else if (worseNextDay.length === 1) {
    raise('attention');
    avoidLoadIncrease = true;
    reasons.push('O joelho acordou pior no dia seguinte a um treino ou jogo recente.');
  }
  if (worseDuring.length >= 2) {
    raise('attention');
    avoidLoadIncrease = true;
    reasons.push('Você marcou "dor aumentou" em exercícios mais de uma vez nesta semana.');
  }

  if (trend.direction === 'worse') {
    raise('attention');
    avoidLoadIncrease = true;
    reasons.push(`A média das duas últimas semanas subiu (${trend.recent} contra ${trend.previous}/10).`);
  }

  if (stopProgression || (level === 'caution' && (latest.swelling || latest.instability || trend.direction === 'worse'))) {
    seekProfessional = true;
  }
  if (progressionBlockedByGuidance) avoidLoadIncrease = true;

  if (stopProgression) {
    messages.push('Interrompa a progressão do fortalecimento por enquanto e procure seu ortopedista/fisioterapeuta: aumento persistente da dor, inchaço ou instabilidade pedem avaliação.');
  }
  if (level === 'caution') {
    messages.push('Hoje o app não vai sugerir aumento de carga.');
    messages.push('Prefira exercícios sem dor, amplitude confortável e menos carga. Se a dor for importante, piorar ou vier acompanhada de inchaço ou instabilidade, procure seu ortopedista/fisioterapeuta.');
  } else if (level === 'attention') {
    messages.push('Sinal de atenção: mantenha a carga e observe como o joelho responde durante, depois e no dia seguinte.');
  } else {
    messages.push('Sem sinais de alerta nos seus registros recentes. Isso não é alta nem autorização para aumentar a intensidade: siga progredindo uma variável por vez e continue registrando.');
  }
  if (trend.direction === 'better' && level !== 'caution') {
    messages.push('Seus registros mostram melhora — ótimo sinal. Melhora de sintoma ainda não é recuperação completa: a tolerância do tendão cresce mais devagar que a dor diminui.');
  }
  if (progressionBlockedByGuidance) {
    messages.push('Sua orientação profissional ativa pede para não progredir as cargas do fortalecimento agora.');
  }

  return {
    level,
    latest,
    baseline: baseline != null ? Number(baseline.toFixed(1)) : null,
    avoidLoadIncrease,
    stopProgression,
    seekProfessional,
    trend,
    reason: reasons.join(' ') || 'Sem sinais de alerta nos registros recentes.',
    messages,
  };
}

function byNewest(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.ts || 0) - (a.ts || 0);
}

function rank(level) {
  return { ok: 0, attention: 1, caution: 2 }[level] ?? 0;
}

/**
 * Tendência: média dos últimos 14 dias contra os 14 anteriores.
 * Precisa de pelo menos 3 registros em cada janela — menos que isso é ruído.
 * Diferença de 1 ponto ou mais conta como mudança.
 */
export function computeTrend(logs, referenceDate = today()) {
  const recentFrom = addDays(referenceDate, -13);
  const prevFrom = addDays(referenceDate, -27);
  const recent = logs.filter((l) => l.date >= recentFrom && l.date <= referenceDate);
  const previous = logs.filter((l) => l.date >= prevFrom && l.date < recentFrom);
  if (recent.length < 3 || previous.length < 3) {
    return { direction: 'insufficient', label: 'registros insuficientes para tendência', recent: null, previous: null };
  }
  const r = Math.round(avg(recent, (l) => l.score) * 10) / 10;
  const p = Math.round(avg(previous, (l) => l.score) * 10) / 10;
  const diff = r - p;
  if (diff <= -1) return { direction: 'better', label: 'tendência de melhora', recent: r, previous: p };
  if (diff >= 1) return { direction: 'worse', label: 'tendência de piora', recent: r, previous: p };
  return { direction: 'stable', label: 'estável', recent: r, previous: p };
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

/**
 * Dor registrada por exercício — a resposta para "este exercício me faz mal?".
 *
 * Não é diagnóstico nem veredito: é o que VOCÊ anotou, série a série, somado.
 * Um exercício só aparece com leitura depois de um número mínimo de séries,
 * porque duas séries num dia ruim não dizem nada sobre o exercício.
 *
 * A comparação é contra a sua própria média nos exercícios de perna, não
 * contra uma tabela: o que interessa é se um movimento específico destoa do
 * resto do seu treino.
 */
export const MIN_SETS_FOR_READING = 6;

export async function painByExercise({ days = 120, minSets = MIN_SETS_FOR_READING } = {}) {
  const since = addDays(today(), -days);
  const [sets, exMap] = await Promise.all([store.sets.all(), store.exercises.map()]);

  const groups = new Map();
  for (const s of sets) {
    if (s.date < since || s.pain == null) continue;
    const ex = exMap.get(s.exerciseId);
    if (!ex) continue;
    if (!groups.has(s.exerciseId)) {
      groups.set(s.exerciseId, { exerciseId: s.exerciseId, name: ex.namePt, kneeRisk: ex.kneeRisk || 'low', lower: isLowerBody(ex), pains: [], dates: new Set() });
    }
    const g = groups.get(s.exerciseId);
    g.pains.push(Number(s.pain) || 0);
    g.dates.add(s.date);
  }

  const rows = [...groups.values()].map((g) => ({
    ...g,
    sets: g.pains.length,
    sessions: g.dates.size,
    avgPain: Math.round(avg(g.pains) * 10) / 10,
    maxPain: Math.max(...g.pains),
    enough: g.pains.length >= minSets,
  }));

  const lowerRows = rows.filter((r) => r.lower && r.enough);
  const reference = lowerRows.length
    ? Math.round(avg(lowerRows.map((r) => r.avgPain)) * 10) / 10
    : null;

  for (const r of rows) {
    r.reference = reference;
    r.delta = reference != null && r.enough ? Math.round((r.avgPain - reference) * 10) / 10 : null;
    r.flag = classify(r, reference);
  }

  return {
    rows: rows.sort((a, b) => b.avgPain - a.avgPain || b.sets - a.sets),
    reference,
    minSets,
    hasEnough: rows.some((r) => r.enough),
  };
}

function isLowerBody(ex) {
  return ['Quadríceps', 'Posterior de coxa', 'Glúteos', 'Panturrilha', 'Adutores', 'Abdutores'].includes(ex.muscleGroup)
    || ex.kneeRisk === 'moderate' || ex.kneeRisk === 'high';
}

/**
 * Rótulo do exercício.
 * Deliberadamente conservador: "acima do seu normal" é um convite a levar a
 * informação ao fisioterapeuta, nunca uma instrução para parar ou continuar.
 */
function classify(row, reference) {
  if (!row.enough) return 'insufficient';
  if (row.avgPain === 0) return 'clean';
  if (reference != null && row.delta >= 1.5) return 'above';
  if (row.avgPain >= 4) return 'high';
  if (reference != null && row.delta <= -1) return 'below';
  return 'typical';
}

export const PAIN_FLAG_TEXT = {
  clean: { label: 'sem dor registrada', tone: 'ok' },
  below: { label: 'abaixo do seu normal', tone: 'ok' },
  typical: { label: 'dentro do seu normal', tone: 'neutral' },
  above: { label: 'acima do seu normal', tone: 'warn' },
  high: { label: 'dor alta registrada', tone: 'warn' },
  insufficient: { label: 'poucos registros', tone: 'neutral' },
};
