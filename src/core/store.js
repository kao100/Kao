/**
 * Repositórios de domínio.
 *
 * Toda tela lê e escreve dados por aqui. Assim, trocar a camada de persistência
 * (por exemplo, sincronizar com um servidor no futuro) não obriga a reescrever a UI.
 */

import * as db from './db.js';
import { uid, sum } from './util.js';
import { today, isoDate } from './format.js';

/* ------------------------------------------------------------------ */
/* Perfil e configurações (armazenados na store chave/valor)            */
/* ------------------------------------------------------------------ */

export const KV = {
  PROFILE: 'profile',
  SETTINGS: 'settings',
  SEED_VERSION: 'seedVersion',
  REMOVED_EQUIPMENT: 'removedBuiltinEquipment',
};

export async function getKV(key, fallback = null) {
  const row = await db.get('kv', key);
  return row ? row.value : fallback;
}

export async function setKV(key, value) {
  await db.put('kv', { key, value, updatedAt: Date.now() });
  return value;
}

export const profile = {
  get: () => getKV(KV.PROFILE),
  async save(patch) {
    const cur = (await getKV(KV.PROFILE)) || {};
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    await setKV(KV.PROFILE, next);
    return next;
  },
};

export const settings = {
  get: () => getKV(KV.SETTINGS),
  async save(patch) {
    const cur = (await getKV(KV.SETTINGS)) || {};
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    await setKV(KV.SETTINGS, next);
    return next;
  },
};

/* ------------------------------------------------------------------ */
/* Repositório genérico                                                 */
/* ------------------------------------------------------------------ */

function repo(storeName, prefix) {
  return {
    all: () => db.getAll(storeName),
    byId: (id) => db.get(storeName, id),
    async save(entity) {
      const row = { ...entity };
      if (!row.id) row.id = uid(prefix);
      if (!row.createdAt) row.createdAt = Date.now();
      row.updatedAt = Date.now();
      await db.put(storeName, row);
      return row;
    },
    saveMany: (rows) => db.putMany(storeName, rows),
    remove: (id) => db.remove(storeName, id),
    byIndex: (indexName, value) => db.getAllByIndex(storeName, indexName, value),
    async byDate(date) { return db.getAllByIndex(storeName, 'byDate', date); },
    clear: () => db.clearStore(storeName),
  };
}

export const exercises = {
  ...repo('exercises', 'ex'),
  async map() {
    const list = await db.getAll('exercises');
    return new Map(list.map((e) => [e.id, e]));
  },
  async search(term) {
    const list = await db.getAll('exercises');
    const q = String(term || '').toLowerCase().trim();
    if (!q) return list;
    return list.filter((e) => `${e.namePt} ${e.nameEn} ${e.muscleGroup} ${(e.aliases || []).join(' ')}`
      .toLowerCase().includes(q));
  },
};

export const templates = {
  ...repo('templates', 'tpl'),
  async byDay(dayKey) {
    const list = await db.getAllByIndex('templates', 'byDay', dayKey);
    return list.filter((t) => !t.archived);
  },
};

export const sessions = {
  ...repo('sessions', 'ses'),
  async byDate(date) { return db.getAllByIndex('sessions', 'byDate', date); },
  async recent(limit = 30) {
    const list = await db.getAll('sessions');
    return list.sort((a, b) => (b.date < a.date ? -1 : 1)).slice(0, limit);
  },
  async openSession() {
    const list = await db.getAll('sessions');
    return list.find((s) => s.status === 'active') || null;
  },
};

export const sets = {
  ...repo('sets', 'set'),
  bySession: (sessionId) => db.getAllByIndex('sets', 'bySession', sessionId),
  byExercise: (exerciseId) => db.getAllByIndex('sets', 'byExercise', exerciseId),
};

export const cardio = repo('cardio', 'cd');
export const football = repo('football', 'fb');
export const measurements = repo('measurements', 'ms');
export const photos = repo('photos', 'ph');
export const painLogs = repo('painLogs', 'pain');
export const recovery = repo('recovery', 'rec');
export const medical = repo('medical', 'med');
/**
 * Equipamentos ("Minha academia").
 *
 * As fotos que já vêm no app (`builtin`) são registros comuns depois de
 * instaladas: dá para editar, reassociar ou apagar. Apagar grava uma lápide —
 * assim a semente não traz a foto de volta na próxima atualização, que é
 * exatamente o que a tela promete ao confirmar a exclusão.
 */
export const equipment = {
  ...repo('equipment', 'eq'),
  async remove(id) {
    const row = await db.get('equipment', id);
    if (row?.builtin) {
      const removed = (await getKV(KV.REMOVED_EQUIPMENT)) || [];
      if (!removed.includes(id)) await setKV(KV.REMOVED_EQUIPMENT, [...removed, id]);
    }
    return db.remove('equipment', id);
  },
  /** Ids de fotos embutidas que você apagou — a semente pula esses. */
  removedBuiltinIds: async () => (await getKV(KV.REMOVED_EQUIPMENT)) || [],
};
export const supplements = repo('supplements', 'sup');
export const nutrition = repo('nutrition', 'nut');

/* ------------------------------------------------------------------ */
/* Registro diário (promessa dos 30 minutos)                            */
/* ------------------------------------------------------------------ */

export const dailyLog = {
  get: (date) => db.get('dailyLog', date),
  all: () => db.getAll('dailyLog'),
  async save(row) {
    await db.put('dailyLog', { ...row, updatedAt: Date.now() });
    return row;
  },
  /** Atividades avulsas (caminhada, mobilidade) registradas na mão. */
  async addManual(date, activity) {
    const row = (await db.get('dailyLog', date)) || emptyDay(date);
    row.manual = [...(row.manual || []), { id: uid('act'), ...activity }];
    await db.put('dailyLog', row);
    return recomputeDay(date);
  },
  async removeManual(date, actId) {
    const row = (await db.get('dailyLog', date)) || emptyDay(date);
    row.manual = (row.manual || []).filter((a) => a.id !== actId);
    await db.put('dailyLog', row);
    return recomputeDay(date);
  },
};

function emptyDay(date) {
  return { date, minutes: 0, sources: [], manual: [], promiseMet: false };
}

/**
 * Recalcula os minutos de um dia somando musculação + cardio + futebol + atividades manuais.
 * A promessa é cumprida com 30 minutos ou mais.
 */
export async function recomputeDay(date) {
  const [ses, cds, fbs, existing] = await Promise.all([
    db.getAllByIndex('sessions', 'byDate', date),
    db.getAllByIndex('cardio', 'byDate', date),
    db.getAllByIndex('football', 'byDate', date),
    db.get('dailyLog', date),
  ]);

  const row = existing || emptyDay(date);
  const sources = [];

  for (const s of ses.filter((s) => s.status === 'done')) {
    sources.push({ kind: 'strength', ref: s.id, label: s.name, minutes: s.durationMin || 0 });
  }
  for (const c of cds) {
    sources.push({ kind: c.kind === 'walk' ? 'walk' : 'cardio', ref: c.id, label: c.name || 'Cardio', minutes: c.durationMin || 0 });
  }
  for (const f of fbs) {
    sources.push({ kind: 'football', ref: f.id, label: 'Futebol society', minutes: f.durationMin || 0 });
  }
  for (const m of row.manual || []) {
    sources.push({ kind: m.kind || 'other', ref: m.id, label: m.label, minutes: m.minutes || 0 });
  }

  row.sources = sources;
  row.minutes = Math.round(sum(sources, (s) => s.minutes));
  row.promiseMet = row.minutes >= 30;
  row.updatedAt = Date.now();
  await db.put('dailyLog', row);
  return row;
}

/* ------------------------------------------------------------------ */
/* Plano do dia (decisão sobre futebol)                                 */
/* ------------------------------------------------------------------ */

export const dayPlan = {
  get: (date) => db.get('dayPlan', date),
  all: () => db.getAll('dayPlan'),
  async set(date, patch) {
    const cur = (await db.get('dayPlan', date)) || { date };
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    await db.put('dayPlan', next);
    return next;
  },
};

/* ------------------------------------------------------------------ */
/* Consultas usadas pelas telas                                         */
/* ------------------------------------------------------------------ */

/** Último desempenho registrado de um exercício (para “última vez: 45 kg × 10”). */
export async function lastPerformance(exerciseId, { beforeSessionId = null } = {}) {
  const list = await db.getAllByIndex('sets', 'byExercise', exerciseId);
  const valid = list.filter((s) => s.sessionId !== beforeSessionId && !s.warmup);
  if (!valid.length) return null;
  const bySession = new Map();
  for (const s of valid) {
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId).push(s);
  }
  const groups = [...bySession.values()].sort((a, b) => (a[0].date < b[0].date ? 1 : -1));
  const last = groups[0].sort((a, b) => (a.index || 0) - (b.index || 0));
  return {
    date: last[0].date,
    sessionId: last[0].sessionId,
    sets: last,
    topWeight: Math.max(...last.map((s) => Number(s.weight) || 0)),
    totalReps: sum(last, (s) => s.reps),
    volume: sum(last, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0)),
  };
}

/** Histórico agrupado por sessão, do mais antigo para o mais recente. */
export async function exerciseHistory(exerciseId) {
  const list = await db.getAllByIndex('sets', 'byExercise', exerciseId);
  const bySession = new Map();
  for (const s of list.filter((x) => !x.warmup)) {
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId).push(s);
  }
  return [...bySession.values()]
    .map((group) => {
      const ordered = group.sort((a, b) => (a.index || 0) - (b.index || 0));
      return {
        sessionId: ordered[0].sessionId,
        date: ordered[0].date,
        sets: ordered,
        topWeight: Math.max(...ordered.map((s) => Number(s.weight) || 0)),
        totalReps: sum(ordered, (s) => s.reps),
        volume: sum(ordered, (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0)),
        bestSet: ordered.reduce((best, s) => {
          const v = (Number(s.weight) || 0) * (Number(s.reps) || 0);
          return v > ((Number(best?.weight) || 0) * (Number(best?.reps) || 0)) ? s : best;
        }, ordered[0]),
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Registros pessoais de um exercício. */
export async function personalRecords(exerciseId) {
  const history = await exerciseHistory(exerciseId);
  if (!history.length) return null;
  const allSets = history.flatMap((h) => h.sets);
  const heaviest = allSets.reduce((a, b) => ((Number(b.weight) || 0) > (Number(a.weight) || 0) ? b : a), allSets[0]);
  const mostReps = allSets.reduce((a, b) => ((Number(b.reps) || 0) > (Number(a.reps) || 0) ? b : a), allSets[0]);
  const bestVolume = history.reduce((a, b) => (b.volume > a.volume ? b : a), history[0]);
  const bestSetVolume = allSets.reduce((a, b) => {
    const va = (Number(a.weight) || 0) * (Number(a.reps) || 0);
    const vb = (Number(b.weight) || 0) * (Number(b.reps) || 0);
    return vb > va ? b : a;
  }, allSets[0]);
  return { heaviest, mostReps, bestVolume, bestSetVolume, sessions: history.length };
}

/** Todos os dados de um período — usado no relatório semanal e no calendário. */
export async function activityRange(fromISO, toISO) {
  const [ses, cds, fbs, days, pains, allSets] = await Promise.all([
    db.getAll('sessions'), db.getAll('cardio'), db.getAll('football'),
    db.getAll('dailyLog'), db.getAll('painLogs'), db.getAll('sets'),
  ]);
  const inRange = (d) => d >= fromISO && d <= toISO;
  return {
    sessions: ses.filter((s) => inRange(s.date)),
    cardio: cds.filter((c) => inRange(c.date)),
    football: fbs.filter((f) => inRange(f.date)),
    days: days.filter((d) => inRange(d.date)),
    pains: pains.filter((p) => inRange(p.date)),
    sets: allSets.filter((s) => inRange(s.date)),
  };
}

/** Sequência (streak) de dias consecutivos cumprindo a promessa. */
export async function promiseStreak(referenceDate = today()) {
  const rows = await db.getAll('dailyLog');
  const map = new Map(rows.map((r) => [r.date, r]));
  let streak = 0;
  let cursor = referenceDate;
  // O dia de hoje só quebra a sequência depois que ele termina.
  if (!map.get(cursor)?.promiseMet) cursor = shiftDay(cursor, -1);
  while (map.get(cursor)?.promiseMet) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  const best = longestStreak(rows);
  return { current: streak, best };
}

function shiftDay(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta, 12);
  return isoDate(date);
}

function longestStreak(rows) {
  const met = rows.filter((r) => r.promiseMet).map((r) => r.date).sort();
  let best = 0; let run = 0; let prev = null;
  for (const date of met) {
    run = prev && shiftDay(prev, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

/** Orientação médica ativa (tem prioridade sobre o plano padrão do app). */
export async function activeMedicalGuidance() {
  const list = await db.getAll('medical');
  const active = list.filter((m) => m.active !== false);
  if (!active.length) return null;
  return active.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

export async function latestMeasurement() {
  const list = await db.getAll('measurements');
  if (!list.length) return null;
  return list.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

export { db };
