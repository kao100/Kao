/**
 * PROJETO CASAMENTO — 8 SEMANAS.
 *
 * O objetivo estético é o tronco: peito (parte superior e central), costas
 * (largura e espessura — o "V"), ombros (laterais e posteriores), braços
 * proporcionais e abdômen visível pela redução gradual de gordura. Pernas,
 * joelho, condicionamento e recuperação continuam no programa — o projeto
 * muda a prioridade, não abandona nada.
 *
 * Os números vêm só do que você registra. O projeto (data de início, data do
 * casamento) é configurado no app e fica no aparelho, nunca no código.
 */

import * as store from '../core/store.js';
import { addDays, daysBetween, today, weekDates } from '../core/format.js';
import { sum } from '../core/util.js';

export const PROJECT_WEEKS = 8;

/** Exercícios-chave do projeto (o primeiro id com dados é o usado). */
export const KEY_LIFTS = [
  { key: 'supino', label: 'Supino reto', ids: ['machine-chest-press'] },
  { key: 'inclinado', label: 'Supino inclinado', ids: ['incline-press'] },
  { key: 'puxada', label: 'Puxada alta', ids: ['lat-pulldown'] },
  { key: 'remada', label: 'Remada', ids: ['seated-cable-row', 'chest-supported-row'] },
  { key: 'desenvolvimento', label: 'Desenvolvimento', ids: ['shoulder-press'] },
];

/** Referência inicial de séries efetivas por semana (ajustável pelo desempenho). */
export const WEEKLY_TARGETS = [
  { group: 'Peito', min: 10, max: 14 },
  { group: 'Costas', min: 12, max: 16 },
  { group: 'Ombros', min: 9, max: 16 },
  { group: 'Bíceps', min: 8, max: 14 },
  { group: 'Tríceps', min: 8, max: 14 },
];

export const PRINCIPLES = [
  'Definição não é treinar com muitas repetições e pouca carga. Ela vem de músculo maior (carga progressiva, perto da falha) e de menos gordura (alimentação e gasto diário).',
  'Volume com critério: aumentar séries sem conseguir progredir não ajuda — o app só sugere mais quando as cargas sobem e a recuperação acompanha.',
  'Abdômen aparece com a redução gradual da gordura total. Treinar abdômen fortalece; não "queima" a barriga localmente.',
  'Pernas e joelho continuam no plano: o fortalecimento é saúde e também estética de proporção.',
];

export function projectStatus(project, date = today()) {
  if (!project?.startDate) return null;
  const weeks = Number(project.weeks) || PROJECT_WEEKS;
  const end = addDays(project.startDate, weeks * 7 - 1);
  const elapsed = daysBetween(project.startDate, date);
  const week = Math.max(1, Math.min(weeks, Math.floor(elapsed / 7) + 1));
  const daysLeft = project.eventDate
    ? daysBetween(date, project.eventDate)
    : daysBetween(date, end);
  return {
    weeks,
    week,
    started: elapsed >= 0,
    ended: date > end,
    end,
    daysLeft,
    pct: Math.max(0, Math.min(100, Math.round(((elapsed + 1) / (weeks * 7)) * 100))),
  };
}

function e1rm(w, r) {
  const weight = Number(w) || 0;
  const reps = Number(r) || 0;
  return weight && reps ? weight * (1 + Math.min(reps, 15) / 30) : 0;
}

/** Evolução de um exercício-chave desde o início do projeto. */
async function liftProgress(lift, startDate) {
  for (const id of lift.ids) {
    const sets = (await store.sets.byExercise(id)).filter((s) => !s.warmup && Number(s.weight) > 0);
    if (!sets.length) continue;
    const bySession = new Map();
    for (const s of sets) {
      if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
      bySession.get(s.sessionId).push(s);
    }
    const sessions = [...bySession.values()].map((list) => ({
      date: list[0].date,
      top: Math.max(...list.map((s) => Number(s.weight) || 0)),
      best: Math.max(...list.map((s) => e1rm(s.weight, s.reps))),
      topReps: list.reduce((a, s) => ((Number(s.weight) || 0) >= (Number(a.weight) || 0) ? s : a), list[0]).reps,
    })).sort((a, b) => (a.date < b.date ? -1 : 1));

    // linha de base: a última sessão antes do início, ou a primeira depois dele
    const before = sessions.filter((x) => x.date < startDate);
    const base = before.at(-1) || sessions[0];
    const latest = sessions.at(-1);
    return {
      ...lift,
      exerciseId: id,
      base,
      latest,
      series: sessions.filter((x) => x.date >= (before.at(-1)?.date || startDate)),
      delta: Math.round((latest.top - base.top) * 10) / 10,
      deltaE1rm: Math.round(latest.best - base.best),
    };
  }
  return { ...lift, exerciseId: lift.ids[0], base: null, latest: null, series: [], delta: null, deltaE1rm: null };
}

function measureAt(list, field, startDate) {
  const withField = list.filter((m) => m[field] != null && m[field] !== '').sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!withField.length) return null;
  const before = withField.filter((m) => m.date <= startDate);
  const base = before.at(-1) || withField[0];
  const latest = withField.at(-1);
  return {
    base: Number(base[field]),
    baseDate: base.date,
    latest: Number(latest[field]),
    latestDate: latest.date,
    delta: Math.round((Number(latest[field]) - Number(base[field])) * 10) / 10,
    series: withField.filter((m) => m.date >= base.date).map((m) => ({ date: m.date, value: Number(m[field]) })),
  };
}

/** Séries efetivas da semana por grupo (sem aquecimento; RIR ≤ 3 quando registrado). */
export async function weeklyEffectiveSets(date = today()) {
  const dates = weekDates(date);
  const [range, exMap] = await Promise.all([store.activityRange(dates[0], dates[6]), store.exercises.map()]);
  const out = {};
  for (const s of range.sets) {
    if (s.warmup) continue;
    if (s.rir != null && Number(s.rir) > 3) continue;
    const g = exMap.get(s.exerciseId)?.muscleGroup;
    if (!g) continue;
    out[g] = (out[g] || 0) + 1;
  }
  return out;
}

/** Séries planejadas por semana no programa atual (academia). */
export async function plannedWeeklySets() {
  const [templates, exMap] = await Promise.all([store.templates.all(), store.exercises.map()]);
  const out = {};
  for (const t of templates) {
    if (t.archived || t.mode === 'home' || t.kind === 'football') continue;
    // sábado/domingo condicionais: conta a versão sem futebol (a mais comum)
    if (t.condition === 'football-sunday') continue;
    for (const it of t.items || []) {
      const g = exMap.get(it.exerciseId)?.muscleGroup;
      if (g) out[g] = (out[g] || 0) + (Number(it.sets) || 0);
    }
  }
  return out;
}

export async function projectOverview(date = today()) {
  const profile = await store.profile.get();
  const project = profile?.project || null;
  if (!project?.startDate || project.active === false) return { project, status: null };

  const status = projectStatus(project, date);
  const [lifts, measurements, photos, weekSets, planned] = await Promise.all([
    Promise.all(KEY_LIFTS.map((l) => liftProgress(l, project.startDate))),
    store.measurements.all(),
    store.photos.all(),
    weeklyEffectiveSets(date),
    plannedWeeklySets(),
  ]);

  // braço: média dos dois lados quando houver os dois
  const withArm = measurements.map((m) => {
    const sides = [m.armRightCm, m.armLeftCm].map(Number).filter((v) => v > 0);
    return { ...m, armAvgCm: sides.length ? sides.reduce((a, b) => a + b, 0) / sides.length : null };
  });

  const measures = {
    chest: measureAt(withArm, 'chestCm', project.startDate),
    arm: measureAt(withArm, 'armAvgCm', project.startDate),
    abdomen: measureAt(withArm, 'abdomenCm', project.startDate) || measureAt(withArm, 'waistCm', project.startDate),
    abdomenIsWaist: !measureAt(withArm, 'abdomenCm', project.startDate),
    weight: measureAt(withArm, 'weightKg', project.startDate),
  };

  const poses = ['front', 'back', 'side'].map((pose) => {
    const list = photos.filter((p) => p.pose === pose).sort((a, b) => (a.date < b.date ? -1 : 1));
    const before = list.filter((p) => p.date <= project.startDate).at(-1) || list[0] || null;
    const latest = list.at(-1) || null;
    return {
      pose,
      label: { front: 'Frente', back: 'Costas', side: 'Perfil' }[pose],
      count: list.length,
      base: before,
      latest,
      sinceStart: list.filter((p) => p.date >= project.startDate).length,
    };
  });

  // última foto há quanto tempo? o projeto pede uma a cada 2 semanas
  const lastPhoto = photos.map((p) => p.date).sort().at(-1) || null;
  const photoDue = !lastPhoto || daysBetween(lastPhoto, date) >= 14;

  return {
    project,
    status,
    lifts,
    measures,
    poses,
    photoDue,
    lastPhoto,
    weekSets,
    planned,
    targets: WEEKLY_TARGETS,
    totalUpperSets: sum(['Peito', 'Costas', 'Ombros'], (g) => weekSets[g] || 0),
  };
}

export async function saveProject(patch) {
  const profile = (await store.profile.get()) || {};
  const project = { name: 'Projeto Casamento', weeks: PROJECT_WEEKS, active: true, ...(profile.project || {}), ...patch };
  return store.profile.save({ project });
}
