/**
 * Quais complementos fazem sentido hoje.
 *
 * Uma lista fixa de "extras" seria fácil e seria ruim: o complemento certo
 * depende do que você acabou de treinar, do joelho, do jogo de amanhã e do
 * tempo que sobrou. Este módulo aplica essas regras e devolve os blocos na
 * ordem em que valem a pena, com o motivo escrito.
 *
 * Regra que atravessa tudo: complemento é do dia. Ele não entra no programa,
 * não mexe no ciclo de blocos e não vira compromisso. Se virar hábito, o app
 * avisa — porque aí deixou de ser complemento e deveria estar no programa,
 * onde a progressão consegue enxergar.
 */

import * as store from '../core/store.js';
import { today, addDays, dayKey } from '../core/format.js';
import { EXTRAS } from '../data/extras.js';
import { kneeStatus } from './knee.js';
import { estimateTemplateMinutes } from './duration.js';

/** A partir de quantas vezes por semana um complemento deixa de ser complemento. */
export const HABIT_THRESHOLD = 3;

/**
 * @returns {Promise<{
 *   suggestions: Array, blocked: Array, minutesDone: number,
 *   habit: {id:string,name:string,count:number}|null
 * }>}
 */
export async function extrasForToday(date = today(), { plan = null } = {}) {
  const [sessions, knee, settings, profile] = await Promise.all([
    store.sessions.byDate(date),
    kneeStatus(date),
    store.settings.get(),
    store.profile.get(),
  ]);

  const dayPlan = plan || await (await import('./planner.js')).planForDate(date);

  /* ---------- o que já foi feito hoje ---------- */
  const done = sessions.filter((s) => s.status === 'done');
  // o que já foi feito MAIS o que ainda está programado para hoje: sugerir
  // panturrilha na terça, quando a terça já tem panturrilha, é sugerir repetir
  const trainedToday = await muscleGroupsTrained(done);
  for (const g of await plannedGroups(dayPlan)) trainedToday.add(g);
  const cardioToday = (await store.cardio.byDate(date)).length > 0
    || dayPlan.blocks.some((b) => b.type === 'cardio');
  const footballToday = dayPlan.blocks.some((b) => b.type === 'football');

  const minutesDone = done.reduce((s, x) => s + (x.durationMin || 0), 0);
  const budget = profile?.sessionMinutes || 60;
  const plannedMin = dayPlan.blocks
    .filter((b) => b.template)
    .reduce((s, b) => s + estimateTemplateMinutes(b.template), 0);
  const minutesLeft = Math.max(0, budget - Math.max(minutesDone, plannedMin));

  /* ---------- amanhã tem jogo? ---------- */
  const tomorrow = addDays(date, 1);
  const tk = dayKey(tomorrow);
  const tomorrowPlan = await store.dayPlan.get(tomorrow);
  const footballTomorrow = tk === 'thu'
    ? (tomorrowPlan?.football ?? true)
    : tk === 'sun'
      ? (tomorrowPlan?.football ?? null) === true
      : false;

  /* ---------- volume da semana, para achar o ponto fraco ---------- */
  const weakest = await weakestGroup();

  const suggestions = [];
  const blocked = [];

  for (const extra of EXTRAS) {
    const verdict = judge(extra, {
      trainedToday, cardioToday, footballToday, footballTomorrow, knee, weakest,
    });
    if (verdict.blocked) {
      blocked.push({ ...extra, reason: verdict.reason });
    } else {
      suggestions.push({
        ...extra,
        reason: verdict.reason,
        score: verdict.score,
        fitsTime: !minutesLeft || extra.minutes <= minutesLeft + 15,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score || a.minutes - b.minutes);

  return {
    suggestions,
    blocked,
    minutesDone,
    minutesLeft,
    habit: await habitWarning(date),
    weakest,
  };
}

/**
 * Decide se o complemento entra, e por quê.
 * `score` maior = mais vale a pena hoje.
 */
function judge(extra, ctx) {
  const { trainedToday, cardioToday, footballToday, footballTomorrow, knee, weakest } = ctx;

  // 1) joelho: nada que carregue o joelho em dia de sinal amarelo ou vermelho
  const loadsKnee = extra.targets.some((t) => ['Quadríceps', 'Panturrilha', 'Glúteos'].includes(t))
    || (extra.kind === 'cardio' && extra.fatigue >= 3);
  if (knee.level !== 'ok' && loadsKnee) {
    return { blocked: true, reason: `O joelho está fora do seu padrão hoje (${knee.level === 'caution' ? 'atenção redobrada' : 'sinal amarelo'}). Este complemento carrega o joelho — fica de fora.` };
  }

  // 2) véspera de jogo: nada de fadiga alta
  if (footballTomorrow && extra.fatigue >= 2) {
    return { blocked: true, reason: 'Amanhã tem jogo. Este complemento cansa o suficiente para você chegar pior no jogo.' };
  }

  // 3) jogou hoje: o jogo já foi a sessão intensa
  if (footballToday && extra.fatigue >= 2) {
    return { blocked: true, reason: 'Você já jogou hoje. Somar fadiga em cima não acrescenta condicionamento.' };
  }

  // 4) cardio duplicado
  if (extra.kind === 'cardio' && cardioToday && extra.fatigue >= 1) {
    return { blocked: true, reason: 'Você já fez cardio hoje. Se ainda quiser mexer o corpo, vá de mobilidade.' };
  }

  /* ---------- pontuação ---------- */
  let score = 10;
  let reason = extra.summary;

  // Músculo que o dia já cobre desce para o fim, e essa regra ganha das
  // outras: um grupo pode ser o mais fraco da semana e ainda assim ser o
  // pior lugar para pôr volume HOJE, se hoje já é o dia dele. O volume que
  // falta rende no dia em que ele não aparece.
  const overlap = extra.targets.filter((t) => trainedToday.has(t));
  if (overlap.length) {
    score -= 10;
    reason = `O treino de hoje já cobre ${overlap.join(' e ')}. Dá para fazer, mas rende mais deixar para um dia que não trabalhe esse grupo.`;
  } else if (weakest && extra.targets.includes(weakest.group)) {
    // ponto fraco da semana sobe na lista — só quando hoje não o treina
    score += 8;
    reason = `${weakest.group} está com ${weakest.sets} séries na sua semana, o menor volume do programa, e hoje não é dia dele. É onde o complemento rende mais.`;
  }

  // abdômen: você pediu ênfase, e ele recupera rápido
  if (extra.targets.includes('Core')) score += 3;

  // mobilidade sempre cabe
  if (extra.fatigue === 0) score += 2;

  return { blocked: false, reason, score };
}

/** Grupos que o treino programado de hoje já cobre. */
async function plannedGroups(dayPlan) {
  const groups = new Set();
  const templates = dayPlan.blocks.map((b) => b.template).filter(Boolean);
  if (!templates.length) return groups;
  const exMap = await store.exercises.map();
  for (const t of templates) {
    for (const it of t.items || []) {
      const e = exMap.get(it.exerciseId);
      if (e) groups.add(e.muscleGroup);
    }
  }
  return groups;
}

/**
 * Grupos musculares treinados nas sessões concluídas de hoje.
 *
 * Lê as duas fontes de propósito: as séries registradas (o que você de fato
 * fez) e os itens da sessão (o que ela tinha). Séries só, e um exercício
 * pulado contaria como treinado; itens só, e uma sessão abandonada no segundo
 * exercício contaria inteira. A união erra para o lado seguro — no máximo
 * sugere um complemento a menos.
 */
async function muscleGroupsTrained(sessions) {
  const groups = new Set();
  if (!sessions.length) return groups;
  const exMap = await store.exercises.map();
  for (const s of sessions) {
    for (const it of s.items || []) {
      const e = exMap.get(it.exerciseId);
      if (e) groups.add(e.muscleGroup);
    }
    // eslint-disable-next-line no-await-in-loop
    const sets = await store.sets.bySession(s.id);
    for (const set of sets) {
      const e = exMap.get(set.exerciseId);
      if (e) groups.add(e.muscleGroup);
    }
  }
  return groups;
}

/**
 * O grupo com menos séries programadas na semana.
 * Ignora core (já tem ênfase) e grupos que não aparecem em complemento nenhum.
 */
async function weakestGroup() {
  const [templates, exMap] = await Promise.all([store.templates.all(), store.exercises.map()]);
  const eligible = new Set(EXTRAS.flatMap((e) => e.targets));
  const volume = {};
  for (const t of templates) {
    if (t.archived || t.mode === 'home') continue;
    for (const it of t.items || []) {
      const e = exMap.get(it.exerciseId);
      if (!e || !eligible.has(e.muscleGroup) || e.muscleGroup === 'Core') continue;
      volume[e.muscleGroup] = (volume[e.muscleGroup] || 0) + (it.sets || 0);
    }
  }
  const entries = Object.entries(volume);
  if (!entries.length) return null;
  const [group, sets] = entries.sort((a, b) => a[1] - b[1])[0];
  return { group, sets };
}

/**
 * Complemento virou rotina?
 *
 * Se o mesmo bloco aparece três ou mais vezes em sete dias, ele não é mais um
 * extra: é volume fixo que o programa não enxerga, e portanto fora do alcance
 * da progressão e do ciclo de blocos. O certo aí é promovê-lo ao programa.
 */
async function habitWarning(date) {
  const since = addDays(date, -7);
  const sessions = (await store.sessions.all())
    .filter((s) => s.extraId && s.date >= since && s.date <= date && s.status === 'done');
  if (!sessions.length) return null;

  const counts = new Map();
  for (const s of sessions) counts.set(s.extraId, (counts.get(s.extraId) || 0) + 1);
  const [id, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (count < HABIT_THRESHOLD) return null;

  const extra = EXTRAS.find((e) => e.id === id);
  return { id, name: extra?.name || 'Complemento', count };
}
