/**
 * Semente da primeira execução: perfil, configurações, biblioteca de exercícios,
 * programa semanal e suplementos.
 *
 * Roda apenas uma vez (controlado por `seedVersion`). Reexecutar não apaga
 * nenhum histórico: exercícios e templates novos são adicionados, os já
 * existentes ficam como você editou.
 */

import * as store from '../core/store.js';
import { EXERCISES } from './exercises.js';
import { TEMPLATES, CARDIO_PLANS } from './program.js';
import { isoDate } from '../core/format.js';

export const SEED_VERSION = 1;

export const DEFAULT_PROFILE = {
  name: 'Atleta',
  weightKg: 79,
  heightM: 1.77,
  birthDate: null,
  experienceMonths: 3,
  approach: 'natural',
  goals: [
    'Hipertrofia natural',
    'Aumentar força',
    'Boa massa muscular sem exagero',
    'Reduzir gordura gradualmente',
    'Mais definição e vascularização natural',
    'Melhorar condicionamento cardiovascular',
    'Físico de atleta híbrido, funcional e saudável',
  ],
  football: {
    thursdayFixed: true,
    sundayOptional: true,
    note: 'Quinta é praticamente fixo; domingo depende.',
  },
  conditions: [
    {
      id: 'knee-left-patellar',
      label: 'Joelho esquerdo — tendão patelar',
      status: 'em acompanhamento médico',
      note: 'Inflamação/tendinopatia identificada pelo ortopedista. Uso de medicação conforme prescrição já encerrado. Melhora durante o tratamento e retorno de dor leve em alguns exercícios e ocasionalmente após o futebol.',
      followUp: 'Retorno com o ortopedista marcado.',
    },
  ],
  promiseMinutes: 30,
  promiseText: 'Pelo menos 30 minutos de exercício todos os dias.',
};

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  restCompoundSec: 150,
  restIsolationSec: 75,
  restAutoStart: true,
  soundEnabled: true,
  vibrationEnabled: true,
  keepScreenAwake: true,
  askRecoveryBeforeWorkout: true,
  askKneeBeforeLegsAndFootball: true,
  weightIncrementKg: 2.5,
  smallIncrementKg: 1,
  cardioPlans: CARDIO_PLANS,
  nextAppointment: nextSixteenth(),
  appointmentNote: 'Retorno com o ortopedista (joelho esquerdo).',
};

function nextSixteenth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 16, 12);
  if (now.getDate() > 16) d.setMonth(d.getMonth() + 1);
  return isoDate(d);
}

export const DEFAULT_SUPPLEMENTS = [
  {
    id: 'sup-creatina',
    name: 'Creatina monohidratada',
    brand: 'Vitafor',
    dose: '5 g',
    schedule: 'Diariamente pela manhã',
    notes: 'Uso contínuo. O horário exato não é determinante — o que importa é a constância diária.',
    active: true,
  },
  {
    id: 'sup-whey',
    name: 'Whey protein',
    brand: 'DUX',
    dose: '1 dose',
    schedule: 'Normalmente após o treino',
    notes: 'Usado para ajudar a atingir a meta diária de proteína. Não é obrigatório tomar imediatamente após o treino.',
    active: true,
  },
];

/** Executa a semente se ainda não foi executada. */
export async function seedIfNeeded() {
  const current = await store.getKV(store.KV.SEED_VERSION, 0);
  const profile = await store.profile.get();

  if (!profile) await store.setKV(store.KV.PROFILE, DEFAULT_PROFILE);
  const settings = await store.settings.get();
  if (!settings) await store.setKV(store.KV.SETTINGS, DEFAULT_SETTINGS);
  else if (!settings.cardioPlans?.length) await store.settings.save({ cardioPlans: CARDIO_PLANS });

  // Exercícios: adiciona os que faltam, preserva edições dos existentes.
  const existingEx = await store.exercises.all();
  const exIds = new Set(existingEx.map((e) => e.id));
  const newEx = EXERCISES.filter((e) => !exIds.has(e.id))
    .map((e) => ({ ...e, createdAt: Date.now(), updatedAt: Date.now(), builtin: true }));
  if (newEx.length) await store.exercises.saveMany(newEx);

  // Templates: mesma regra.
  const existingTpl = await store.templates.all();
  const tplIds = new Set(existingTpl.map((t) => t.id));
  const newTpl = TEMPLATES.filter((t) => !tplIds.has(t.id))
    .map((t) => ({ ...t, createdAt: Date.now(), updatedAt: Date.now(), builtin: true }));
  if (newTpl.length) await store.templates.saveMany(newTpl);

  // Suplementos.
  const existingSup = await store.supplements.all();
  if (!existingSup.length) await store.supplements.saveMany(DEFAULT_SUPPLEMENTS.map((s) => ({ ...s, createdAt: Date.now() })));

  if (current < SEED_VERSION) await store.setKV(store.KV.SEED_VERSION, SEED_VERSION);

  return { seeded: !profile, addedExercises: newEx.length, addedTemplates: newTpl.length };
}
