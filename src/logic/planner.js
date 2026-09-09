/**
 * Planejamento do dia.
 *
 * Regras do programa:
 *  - quinta-feira: futebol por padrão (só não acontece se você marcar que não teve);
 *  - domingo: o app pergunta se vai ter futebol;
 *  - sábado: se houver futebol confirmado no domingo, o treino pesado de pernas
 *    é substituído por recuperação ativa/cardio leve;
 *  - nunca existe dia parado: se nada estiver programado, entra a atividade da
 *    promessa (30 minutos).
 */

import * as store from '../core/store.js';
import { dayKey, addDays, DAY_LABEL, today } from '../core/format.js';
import { EQUIP_LABEL } from '../data/exercises.js';
import { exercisePermission } from './knee.js';

export const BLOCK_KIND = {
  strength: { label: 'Musculação', icon: '🏋️', accent: 'volt' },
  cardio: { label: 'Cardio', icon: '❤️', accent: 'cardio' },
  football: { label: 'Futebol', icon: '⚽', accent: 'ball' },
  recovery: { label: 'Recuperação ativa', icon: '🧘', accent: 'recover' },
  walk: { label: 'Caminhada', icon: '🚶', accent: 'cardio' },
};

/**
 * Monta o plano de um dia.
 * @returns {Promise<{
 *   date: string, dayKey: string, dayLabel: string,
 *   blocks: Array, question: object|null, notes: string[],
 *   footballConfirmed: boolean|null, needsKneeCheck: boolean
 * }>}
 */
export async function planForDate(date) {
  const key = dayKey(date);
  const [templates, settings, plan, sundayPlan, thursdayPlan] = await Promise.all([
    store.templates.byDay(key),
    store.settings.get(),
    store.dayPlan.get(date),
    key === 'sat' ? store.dayPlan.get(addDays(date, 1)) : null,
    key === 'thu' ? store.dayPlan.get(date) : null,
  ]);

  const cardioPlans = settings?.cardioPlans || [];
  const notes = [];
  let question = null;
  let footballConfirmed = null;

  /* ---------- decisão sobre futebol ---------- */
  if (key === 'thu') {
    footballConfirmed = plan?.football ?? true; // padrão: tem futebol
    if (plan?.football === false) {
      notes.push('Futebol de quinta marcado como cancelado. O plano B mantém a promessa do dia.');
    }
  } else if (key === 'sun') {
    footballConfirmed = plan?.football ?? null;
    if (footballConfirmed === null) {
      question = {
        id: 'football-today',
        text: 'Vai ter futebol hoje?',
        target: date,
        field: 'football',
      };
    }
  } else if (key === 'sat') {
    const tomorrow = addDays(date, 1);
    const answer = sundayPlan?.football ?? null;
    if (answer === null) {
      question = {
        id: 'football-tomorrow',
        text: 'Você pretende jogar futebol amanhã?',
        target: tomorrow,
        field: 'football',
        hint: 'A resposta ajusta o treino de hoje para não chegar com as pernas cansadas no jogo.',
      };
    }
  }

  /* ---------- seleção dos templates do dia ---------- */
  let chosen = [];
  if (key === 'sat') {
    const footballTomorrow = sundayPlan?.football ?? null;
    if (footballTomorrow === true) {
      chosen = templates.filter((t) => t.condition === 'football-sunday');
      notes.push('Futebol confirmado para amanhã: o treino pesado de pernas foi substituído por recuperação ativa para preservar as pernas.');
    } else if (footballTomorrow === false) {
      chosen = templates.filter((t) => t.condition === 'no-football-sunday');
    } else {
      // sem resposta ainda: mostra o padrão (Lower B), mas avisa
      chosen = templates.filter((t) => t.condition === 'no-football-sunday');
      notes.push('Responda sobre o futebol de amanhã para o app ajustar o treino de hoje.');
    }
  } else if (key === 'sun') {
    if (footballConfirmed === true) chosen = templates.filter((t) => t.condition === 'football-sunday');
    else if (footballConfirmed === false) chosen = templates.filter((t) => t.condition === 'no-football-sunday');
    else chosen = [];
  } else if (key === 'thu') {
    chosen = footballConfirmed === false ? [] : templates.filter((t) => t.kind === 'football' || !t.condition);
  } else {
    chosen = templates.filter((t) => !t.condition);
  }

  if (!chosen.length) chosen = templates.filter((t) => !t.condition && t.kind !== 'football');

  /* ---------- blocos ---------- */
  const [exMap, guidance] = await Promise.all([store.exercises.map(), store.activeMedicalGuidance()]);
  const annotate = (tpl) => ({
    ...tpl,
    items: (tpl.items || []).map((it) => {
      const ex = exMap.get(it.exerciseId);
      return {
        ...it,
        exercise: ex || null,
        exerciseName: ex?.namePt || it.exerciseId,
        permission: exercisePermission(ex, guidance),
      };
    }),
  });

  const blocks = [];
  for (const raw of chosen.sort((a, b) => (a.order || 0) - (b.order || 0))) {
    const tpl = annotate(raw);
    if (tpl.kind === 'football') {
      blocks.push({ type: 'football', templateId: tpl.id, title: tpl.name, subtitle: tpl.subtitle, icon: '⚽', accent: 'ball', minMinutes: 30 });
      continue;
    }
    if (tpl.items?.length) {
      blocks.push({
        type: 'strength',
        templateId: tpl.id,
        template: tpl,
        title: tpl.name,
        subtitle: tpl.subtitle,
        icon: tpl.icon || '🏋️',
        accent: tpl.accent || 'volt',
        provisional: Boolean(tpl.provisional),
      });
    }
    if (tpl.cardioPlanId) {
      const cardioPlan = cardioPlans.find((p) => p.id === tpl.cardioPlanId);
      if (cardioPlan) {
        blocks.push({
          type: tpl.kind === 'recovery' ? 'recovery' : 'cardio',
          templateId: tpl.id,
          planId: cardioPlan.id,
          plan: cardioPlan,
          title: cardioPlan.name,
          subtitle: cardioPlan.context,
          icon: tpl.kind === 'recovery' ? '🧘' : '❤️',
          accent: tpl.kind === 'recovery' ? 'recover' : 'cardio',
        });
      }
    }
  }

  /* ---------- nenhum bloco: dia de promessa ---------- */
  if (!blocks.length) {
    const fallbackPlan = cardioPlans.find((p) => p.id === 'cardio-promessa-30') || cardioPlans[0];
    blocks.push({
      type: 'cardio',
      planId: fallbackPlan?.id,
      plan: fallbackPlan,
      title: fallbackPlan?.name || 'Atividade da promessa',
      subtitle: 'Nenhum treino programado — mantenha os 30 minutos do dia',
      icon: '🚶',
      accent: 'cardio',
      isPromiseFallback: true,
    });
    if (key === 'sun' && footballConfirmed === null) {
      blocks[0].subtitle = 'Enquanto você não responde sobre o futebol, esta é a opção do dia';
    }
    if (key === 'thu' && footballConfirmed === false) {
      blocks[0].subtitle = 'Plano B do dia de futebol';
    }
  }

  /* ---------- checagem do joelho ---------- */
  const needsKneeCheck = await requiresKneeCheck(blocks);

  /* ---------- avisos de planejamento ---------- */
  if (key === 'wed') {
    const hasHeavyLegs = await blockHasHeavyLegs(blocks);
    if (hasHeavyLegs) {
      notes.push('Atenção: há treino pesado de pernas na quarta, véspera do futebol de quinta. Considere mover para outro dia.');
    }
  }

  return {
    date,
    dayKey: key,
    dayLabel: DAY_LABEL[key],
    blocks,
    question,
    notes,
    footballConfirmed,
    needsKneeCheck,
  };
}

async function blockHasHeavyLegs(blocks) {
  const exMap = await store.exercises.map();
  return blocks.some((b) => b.template?.items?.some((it) => {
    const ex = exMap.get(it.exerciseId);
    return ex && ['Quadríceps', 'Posterior de coxa', 'Glúteos'].includes(ex.muscleGroup) && (it.sets || 0) >= 3;
  }));
}

async function requiresKneeCheck(blocks) {
  if (blocks.some((b) => b.type === 'football')) return true;
  const exMap = await store.exercises.map();
  return blocks.some((b) => b.template?.items?.some((it) => {
    const ex = exMap.get(it.exerciseId);
    return ex && (ex.kneeRisk === 'moderate' || ex.kneeRisk === 'high');
  }));
}

/** Resumo curto do bloco para listas e calendário. */
export function blockSummary(block) {
  if (block.type === 'football') return 'Partida de society';
  if (block.type === 'strength') {
    const n = block.template?.items?.length || 0;
    return `${n} exercício${n === 1 ? '' : 's'}`;
  }
  if (block.plan) return `${block.plan.totalMin} min · RPE ${block.plan.rpe}`;
  return '';
}

/** Marca a resposta sobre futebol de uma data. */
export async function answerFootball(date, willPlay) {
  return store.dayPlan.set(date, { football: willPlay, answeredAt: Date.now() });
}

/** Texto de equipamento legível. */
export function equipmentLabel(type) {
  return EQUIP_LABEL[type] || type;
}

/** Plano da semana inteira (para a tela Programa e o calendário). */
export async function planForWeek(anyDateInWeek = today()) {
  const { weekDates } = await import('../core/format.js');
  const dates = weekDates(anyDateInWeek);
  return Promise.all(dates.map((d) => planForDate(d)));
}
