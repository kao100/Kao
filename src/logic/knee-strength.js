/**
 * FORTALECIMENTO DO JOELHO — acompanhamento, progressão e relatório.
 *
 * O que este módulo faz:
 *  - reconhece, nos treinos que você já faz, o trabalho de fortalecimento
 *    (quadríceps, posteriores, glúteos, panturrilhas, estabilizadores do
 *    quadril, isométricos) — sem criar um treino paralelo que duplique o
 *    volume dos dias de pernas;
 *  - decide se dá para progredir um exercício olhando execução, carga,
 *    repetições, amplitude, dor durante, resposta em 24 h e as orientações
 *    profissionais — e progride UMA variável por vez;
 *  - monta o relatório semanal para levar ao ortopedista/fisioterapeuta.
 *
 * O que ele NÃO faz: diagnóstico, protocolo de reabilitação ou liberação.
 */

import * as store from '../core/store.js';
import { addDays, today, weekDates, formatDate } from '../core/format.js';
import { avg, sum } from '../core/util.js';
import { KNEE_ROLES, kneeInfo, romRank, ROM_OPTIONS } from '../data/exercises.js';
import { kneeStatus, computeTrend, responseLabel } from './knee.js';

const LOWER = ['Quadríceps', 'Posterior de coxa', 'Glúteos', 'Panturrilha'];

/** O exercício conta para o acompanhamento do joelho? */
export function isKneeTracked(exercise) {
  if (!exercise) return false;
  return Boolean(kneeInfo(exercise.id))
    || LOWER.includes(exercise.muscleGroup)
    || exercise.kneeRisk === 'moderate' || exercise.kneeRisk === 'high';
}

function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (!w || !r) return 0;
  return w * (1 + Math.min(r, 15) / 30);
}

function groupBySession(sets) {
  const map = new Map();
  for (const s of sets) {
    if (s.warmup) continue;
    if (!map.has(s.sessionId)) map.set(s.sessionId, []);
    map.get(s.sessionId).push(s);
  }
  return [...map.values()]
    .map((list) => {
      const ordered = list.sort((a, b) => (a.index || 0) - (b.index || 0));
      const ranks = ordered.map((s) => romRank(s.rom)).filter((v) => v != null);
      return {
        sessionId: ordered[0].sessionId,
        date: ordered[0].date,
        sets: ordered,
        setCount: ordered.length,
        topWeight: Math.max(0, ...ordered.map((s) => Number(s.weight) || 0)),
        maxReps: Math.max(0, ...ordered.map((s) => Number(s.reps) || 0)),
        totalReps: sum(ordered, (s) => Number(s.reps) || 0),
        maxPain: Math.max(0, ...ordered.map((s) => Number(s.pain) || 0)),
        avgPain: avg(ordered, (s) => Number(s.pain) || 0),
        romRank: ranks.length ? Math.max(...ranks) : null,
        position: ordered.find((s) => s.position)?.position || null,
        volume: sum(ordered, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0)),
        best: Math.max(0, ...ordered.map((s) => e1rm(s.weight, s.reps))),
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Pode progredir este exercício na próxima sessão? E o quê?
 *
 * Ordem das perguntas (a primeira que trava, trava):
 *   1. orientação profissional bloqueia o exercício ou a progressão?
 *   2. o joelho está em cautela / houve inchaço, instabilidade, piora persistente?
 *   3. a última sessão teve dor ≥ 4, "dor aumentou" ou piora no dia seguinte?
 *   4. a última sessão teve desconforto (dor 2–3 ou "desconforto leve")?
 *   5. você mudou carga, amplitude ou séries na última sessão? → segure uma
 *      sessão para ver a resposta em 24 h;
 *   6. sem registro do dia seguinte → registre antes de progredir;
 *   7. tudo limpo → progrida UMA variável: repetições, depois amplitude,
 *      depois carga.
 *
 * @returns {Promise<{status:'blocked'|'reduce'|'hold'|'info'|'progress'|'new',
 *   title:string, message:string, variable:null|'reps'|'rom'|'load',
 *   allowLoadIncrease:boolean, last:object|null}>}
 */
export async function evaluateKneeExercise(exerciseId, { item = null, knee = null, guidance = null, beforeSessionId = null } = {}) {
  const info = kneeInfo(exerciseId);
  const [sets, responses, kneeNow, guide] = await Promise.all([
    store.sets.byExercise(exerciseId),
    store.kneeResponses.byExercise(exerciseId),
    knee ? Promise.resolve(knee) : kneeStatus(),
    guidance !== null ? Promise.resolve(guidance) : store.activeMedicalGuidance(),
  ]);
  const sessions = groupBySession(sets.filter((s) => s.sessionId !== beforeSessionId));
  const last = sessions.at(-1) || null;
  const prev = sessions.at(-2) || null;

  const result = (status, title, message, variable = null) => ({
    status, title, message, variable,
    allowLoadIncrease: status === 'progress' && variable === 'load',
    last, prev, info,
  });

  if ((guide?.forbiddenExerciseIds || []).includes(exerciseId)) {
    return result('blocked', 'Não liberado nas suas orientações', 'Este exercício está marcado para evitar. Use uma alternativa liberada.');
  }
  if (guide?.strengthening?.allowProgression === 'no') {
    return result('hold', 'Manter — orientação profissional', 'Sua orientação ativa pede para não progredir agora. Repita carga, amplitude e séries.');
  }
  if (kneeNow.stopProgression) {
    return result('reduce', 'Interromper a progressão', 'Seus registros mostram aumento persistente da dor, inchaço ou instabilidade. Mantenha ou reduza carga e amplitude e procure orientação profissional.');
  }
  if (kneeNow.level === 'caution') {
    return result('reduce', 'Hoje: manter ou reduzir', 'Joelho em cautela. Fortalecimento sem dor vale mais que carga: use a carga e a amplitude que não aumentam a dor.');
  }
  if (!last) {
    return result('new', 'Primeira vez registrada', info?.load === 'isometric'
      ? 'Comece com o ângulo, a carga e o tempo da sua orientação. Registre a dor de cada série.'
      : 'Comece conservador: carga que deixa 2–3 repetições sobrando e amplitude confortável. Registre a dor e a amplitude de cada série.');
  }

  const lastResponses = responses.filter((r) => r.sessionId === last.sessionId || r.date === last.date);
  const during = lastResponses.find((r) => r.phase === 'during') || null;
  const nextDay = responses.find((r) => r.phase === 'next-day' && r.date > last.date && r.date <= addDays(last.date, 2))
    || (await nextDayGeneral(last.date));

  if (last.maxPain >= 4 || during?.value === 'worse' || nextDay?.value === 'worse') {
    const why = last.maxPain >= 4 ? `dor ${last.maxPain}/10 numa série`
      : during?.value === 'worse' ? '"dor aumentou" no exercício' : 'joelho pior no dia seguinte';
    return result('reduce', 'Voltar um passo', `Na última sessão (${formatDate(last.date, 'full')}) houve ${why}. Volte à carga ou à amplitude anterior e, se repetir, leve isso ao profissional.`);
  }
  if (last.maxPain >= 2 || during?.value === 'mild') {
    return result('hold', 'Manter igual', 'Houve desconforto leve na última sessão. Repita tudo igual até fazer duas sessões sem desconforto.');
  }

  if (prev) {
    const changed = [];
    if (last.topWeight > prev.topWeight) changed.push('carga');
    if (last.romRank != null && prev.romRank != null && last.romRank > prev.romRank) changed.push('amplitude');
    if (last.setCount > prev.setCount) changed.push('séries');
    if (changed.length) {
      return result('hold', 'Segurar uma sessão', `Você aumentou ${changed.join(' e ')} na última sessão. Repita igual para confirmar que o joelho tolerou nas 24 h seguintes.`);
    }
  }

  if (!nextDay) {
    return result('info', 'Falta o dia seguinte', 'Antes de progredir, registre como o joelho acordou no dia seguinte à última sessão — é a informação que mais importa para o tendão.');
  }

  // tudo limpo: UMA variável
  const repTop = item?.repMax || null;
  const atTop = repTop ? last.sets.every((s) => (Number(s.reps) || 0) >= repTop) : true;
  if (!atTop && info?.load !== 'isometric') {
    return result('progress', 'Progredir: repetições', 'Sem dor e joelho bem no dia seguinte. Busque 1 repetição a mais por série, mantendo carga e amplitude.', 'reps');
  }
  if (info?.trackRom && last.romRank != null && last.romRank < 3) {
    const next = ROM_OPTIONS.find((r) => r.rank === last.romRank + 1);
    return result('progress', 'Progredir: amplitude', `Sem dor e joelho bem no dia seguinte. Aumente a amplitude para "${next.label.toLowerCase()}", mantendo a mesma carga — só amplitude desta vez.`, 'rom');
  }
  return result('progress', 'Progredir: carga', 'Sem dor, joelho bem no dia seguinte e repetições no topo. Suba a carga no menor incremento, mantendo amplitude e séries.', 'load');
}

async function nextDayGeneral(date) {
  const list = await store.kneeResponses.byDate(addDays(date, 1));
  return list.find((r) => r.phase === 'next-day') || null;
}

/**
 * Séries da semana por papel no fortalecimento (quadríceps, posteriores…),
 * contando só o que você fez — é isso que evita duplicar volume.
 */
export async function roleSets(fromISO, toISO) {
  const [range, exMap] = await Promise.all([store.activityRange(fromISO, toISO), store.exercises.map()]);
  const out = Object.fromEntries(Object.keys(KNEE_ROLES).map((k) => [k, 0]));
  for (const s of range.sets) {
    if (s.warmup) continue;
    const info = kneeInfo(s.exerciseId);
    if (info) out[info.role] += 1;
    else {
      const ex = exMap.get(s.exerciseId);
      if (ex?.muscleGroup === 'Quadríceps') out.quad += 1;
    }
  }
  return out;
}

/** Dor × carga de um exercício, sessão a sessão. */
export async function painVsLoad(exerciseId, days = 120) {
  const since = addDays(today(), -days);
  const sets = (await store.sets.byExercise(exerciseId)).filter((s) => s.date >= since);
  return groupBySession(sets).map((g) => ({
    date: g.date,
    topWeight: g.topWeight,
    avgPain: Math.round(g.avgPain * 10) / 10,
    maxPain: g.maxPain,
    romRank: g.romRank,
  }));
}

/** Exercícios de joelho com dados, para o seletor de Dor × carga. */
export async function kneeExercisesWithData(days = 120) {
  const since = addDays(today(), -days);
  const [sets, exMap] = await Promise.all([store.sets.all(), store.exercises.map()]);
  const counts = new Map();
  for (const s of sets) {
    if (s.date < since || s.warmup || !(Number(s.weight) > 0)) continue;
    const ex = exMap.get(s.exerciseId);
    if (!isKneeTracked(ex)) continue;
    counts.set(s.exerciseId, (counts.get(s.exerciseId) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, name: exMap.get(id)?.namePt || id, sets: n }));
}

/** Resposta do joelho a cada partida: antes, depois e no dia seguinte. */
export async function footballResponse(days = 120) {
  const since = addDays(today(), -days);
  const [games, logs, responses] = await Promise.all([
    store.football.all(), store.painLogs.all(), store.kneeResponses.all(),
  ]);
  return games
    .filter((g) => g.date >= since)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((g) => {
      const pre = logs.find((l) => l.date === g.date && l.context === 'pre-football');
      const post = logs.find((l) => l.date === g.date && l.context === 'post-football');
      const nextLog = logs.find((l) => l.date === addDays(g.date, 1));
      const nextResp = responses.find((r) => r.phase === 'next-day' && r.date === addDays(g.date, 1));
      return {
        date: g.date,
        minutes: g.durationMin || 0,
        rpe: g.rpe ?? g.intensity ?? null,
        pre: g.kneeBefore ?? pre?.score ?? null,
        post: g.kneeAfter ?? post?.score ?? null,
        nextDayScore: nextLog?.score ?? null,
        nextDay: nextResp?.value || null,
      };
    });
}

/**
 * Dor × volume semanal: séries de pernas por semana e a média de dor da semana.
 */
export async function weeklyVolumeVsPain(weeks = 8) {
  const out = [];
  const end = today();
  const exMap = await store.exercises.map();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const ref = addDays(end, -7 * i);
    const dates = weekDates(ref);
    const range = await store.activityRange(dates[0], dates[6]);
    const legSets = range.sets.filter((s) => !s.warmup && isKneeTracked(exMap.get(s.exerciseId))).length;
    const pains = range.pains.map((p) => p.score);
    out.push({
      weekStart: dates[0],
      label: `${dates[0].slice(8, 10)}/${dates[0].slice(5, 7)}`,
      legSets,
      football: range.football.length,
      avgPain: pains.length ? Math.round(avg(pains) * 10) / 10 : null,
    });
  }
  return out;
}

/**
 * Relatório semanal do joelho.
 * Tudo aqui é registro e comparação com o seu próprio histórico — nunca
 * diagnóstico. O texto final diz isso.
 */
export async function weeklyKneeReport(anyDateInWeek = today()) {
  const dates = weekDates(anyDateInWeek);
  const from = dates[0];
  const to = dates[6];
  const [range, exMap, allLogs, responses, guidance, knee] = await Promise.all([
    store.activityRange(from, to),
    store.exercises.map(),
    store.painLogs.all(),
    store.kneeResponses.all(),
    store.activeMedicalGuidance(),
    kneeStatus(to < today() ? to : today()),
  ]);

  /* ---------- exercícios, cargas e volume ---------- */
  const byExercise = new Map();
  for (const s of range.sets) {
    if (s.warmup) continue;
    const ex = exMap.get(s.exerciseId);
    if (!isKneeTracked(ex)) continue;
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
    byExercise.get(s.exerciseId).push(s);
  }

  const exercises = [];
  for (const [id, list] of byExercise) {
    const ex = exMap.get(id);
    const info = kneeInfo(id);
    const weights = list.map((s) => Number(s.weight) || 0);
    const roms = list.map((s) => s.rom).filter(Boolean);
    const weekResponses = responses.filter((r) => r.exerciseId === id && r.date >= from && r.date <= to);
    exercises.push({
      exerciseId: id,
      name: ex?.namePt || id,
      role: info ? KNEE_ROLES[info.role].label : ex?.muscleGroup || '',
      sessions: new Set(list.map((s) => s.date)).size,
      sets: list.length,
      topWeight: Math.max(0, ...weights),
      minWeight: Math.min(...weights.filter(Boolean), Infinity) === Infinity ? 0 : Math.min(...weights.filter(Boolean)),
      reps: list.map((s) => s.reps).filter((r) => r != null),
      volume: Math.round(sum(list, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0))),
      avgPain: Math.round(avg(list, (s) => Number(s.pain) || 0) * 10) / 10,
      maxPain: Math.max(0, ...list.map((s) => Number(s.pain) || 0)),
      rom: roms.length ? ROM_OPTIONS.find((r) => r.value === mode(roms))?.label : null,
      responses: weekResponses.map((r) => responseLabel(r.phase, r.value)),
    });
  }
  exercises.sort((a, b) => b.sets - a.sets);
  const totalVolume = sum(exercises, (e) => e.volume);
  const totalSets = sum(exercises, (e) => e.sets);

  /* ---------- evolução de força (6 semanas) ---------- */
  const strength = [];
  for (const e of exercises) {
    const all = (await store.sets.byExercise(e.exerciseId)).filter((s) => s.date <= to && s.date >= addDays(to, -42));
    const sessions = groupBySession(all);
    if (sessions.length < 2) continue;
    const first = sessions[0];
    const lastS = sessions.at(-1);
    strength.push({
      name: e.name,
      from: first.topWeight,
      to: lastS.topWeight,
      fromDate: first.date,
      toDate: lastS.date,
      delta: Math.round((lastS.topWeight - first.topWeight) * 10) / 10,
      e1rmFrom: Math.round(first.best),
      e1rmTo: Math.round(lastS.best),
    });
  }

  /* ---------- sintomas ---------- */
  const logs = range.pains.sort((a, b) => (a.date < b.date ? -1 : 1));
  const days = new Set(logs.map((l) => l.date));
  const symptoms = {
    records: logs.length,
    daysRecorded: days.size,
    avgScore: logs.length ? Math.round(avg(logs, (l) => l.score) * 10) / 10 : null,
    maxScore: logs.length ? Math.max(...logs.map((l) => l.score)) : null,
    daysWithPain3: new Set(logs.filter((l) => l.score >= 3).map((l) => l.date)).size,
    swelling: logs.filter((l) => l.swelling).length,
    instability: logs.filter((l) => l.instability).length,
    stiffness: logs.filter((l) => l.stiffness).length,
    stairs: logs.filter((l) => l.stairsDifficulty).length,
    locations: countBy(logs.flatMap((l) => l.locations || [])),
    nextDayWorse: responses.filter((r) => r.phase === 'next-day' && r.value === 'worse' && r.date >= from && r.date <= addDays(to, 1)).length,
    nextDayBetter: responses.filter((r) => r.phase === 'next-day' && r.value === 'better' && r.date >= from && r.date <= addDays(to, 1)).length,
    duringWorse: responses.filter((r) => r.phase === 'during' && r.value === 'worse' && r.date >= from && r.date <= to).length,
    duringNone: responses.filter((r) => r.phase === 'during' && r.value === 'none' && r.date >= from && r.date <= to).length,
    daily: dates.map((d) => {
      const dayLogs = logs.filter((l) => l.date === d);
      return { date: d, max: dayLogs.length ? Math.max(...dayLogs.map((l) => l.score)) : null };
    }),
  };

  /* ---------- futebol ---------- */
  const football = (await footballResponse(400)).filter((f) => f.date >= from && f.date <= to);

  /* ---------- tendência ---------- */
  const trend = computeTrend(allLogs.filter((l) => l.date <= to), to);

  /* ---------- leitura (não diagnóstica) ---------- */
  const reading = [];
  if (!logs.length) reading.push('Nenhum registro de dor nesta semana — sem dados, não há leitura.');
  if (trend.direction === 'better') reading.push(`Média de dor das duas últimas semanas menor que a das duas anteriores (${trend.recent} contra ${trend.previous}).`);
  if (trend.direction === 'worse') reading.push(`Média de dor das duas últimas semanas maior que a das duas anteriores (${trend.recent} contra ${trend.previous}).`);
  if (trend.direction === 'stable') reading.push(`Dor estável nas últimas quatro semanas (média ${trend.recent}).`);
  if (symptoms.swelling || symptoms.instability) reading.push('Houve registro de inchaço ou instabilidade nesta semana.');
  if (symptoms.nextDayWorse) reading.push(`O joelho acordou pior ${symptoms.nextDayWorse}× depois de treino ou jogo.`);
  if (football.some((f) => f.post != null && f.pre != null && f.post - f.pre >= 2)) reading.push('Em pelo menos uma partida a dor subiu 2 pontos ou mais do antes para o depois.');
  if (knee.stopProgression) reading.push('O app interrompeu a sugestão de progressão por causa do padrão dos registros.');

  return {
    from, to, dates, exercises, totalVolume, totalSets, strength, symptoms, football, trend, knee,
    guidance: guidance ? {
      date: guidance.date,
      professional: guidance.professional,
      diagnosis: guidance.diagnosis,
      limits: guidance.limits,
      strengthening: guidance.strengthening || null,
    } : null,
    reading,
    footballMinutes: sum(range.football, (f) => f.durationMin || 0),
    legDays: new Set(range.sets.filter((s) => isKneeTracked(exMap.get(s.exerciseId))).map((s) => s.date)).size,
  };
}

function mode(list) {
  const counts = countBy(list);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function countBy(list) {
  const out = {};
  for (const v of list) out[v] = (out[v] || 0) + 1;
  return out;
}

/**
 * O dia anterior pede o registro "como o joelho acordou"?
 * Sim quando ontem houve treino de pernas ou futebol e hoje ainda não há
 * resposta de dia seguinte.
 */
export async function pendingNextDayCheck(date = today()) {
  const yesterday = addDays(date, -1);
  const [sets, games, responses, exMap] = await Promise.all([
    store.sets.all(),
    store.football.byDate(yesterday),
    store.kneeResponses.byDate(date),
    store.exercises.map(),
  ]);
  if (responses.some((r) => r.phase === 'next-day')) return null;
  const legSets = sets.filter((s) => s.date === yesterday && !s.warmup && isKneeTracked(exMap.get(s.exerciseId)));
  if (games.length) return { refDate: yesterday, source: 'football', label: 'o futebol de ontem' };
  if (legSets.length >= 3) return { refDate: yesterday, source: 'legs', label: 'o treino de pernas de ontem' };
  return null;
}
