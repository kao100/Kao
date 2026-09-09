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
import { ALL_TEMPLATES, CARDIO_PLANS } from './program.js';

export const SEED_VERSION = 2;

export const DEFAULT_PROFILE = {
  name: '',
  weightKg: null,
  heightM: null,
  birthDate: null,
  experienceMonths: null,
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
    note: '',
  },
  conditions: [],
  promiseMinutes: 30,
  promiseText: 'Pelo menos 30 minutos de exercício todos os dias.',
  onboarded: false,
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
  nextAppointment: null,
  appointmentNote: '',
};

/**
 * Sugestões de suplementos oferecidas no cadastro inicial (nada é gravado
 * automaticamente — você escolhe o que usa e a marca).
 */
export const SUPPLEMENT_SUGGESTIONS = [
  {
    id: 'sup-creatina',
    name: 'Creatina monohidratada',
    dose: '5 g',
    schedule: 'Diariamente, no horário que for mais fácil de manter',
    notes: 'Uso contínuo. O horário exato não é determinante — o que importa é a constância diária.',
  },
  {
    id: 'sup-whey',
    name: 'Whey protein',
    dose: '1 dose',
    schedule: 'Quando ajudar a fechar a meta diária de proteína',
    notes: 'Serve para atingir a proteína do dia. Não é obrigatório tomar logo após o treino.',
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
  const newTpl = ALL_TEMPLATES.filter((t) => !tplIds.has(t.id))
    .map((t) => ({ ...t, createdAt: Date.now(), updatedAt: Date.now(), builtin: true }));
  if (newTpl.length) await store.templates.saveMany(newTpl);

  // Migrações de campos novos em itens já existentes (sem apagar suas edições).
  if (current > 0 && current < SEED_VERSION) await migrate(current, existingEx, existingTpl);

  if (current < SEED_VERSION) await store.setKV(store.KV.SEED_VERSION, SEED_VERSION);

  return { seeded: !profile, addedExercises: newEx.length, addedTemplates: newTpl.length };
}

/**
 * Atualiza apenas campos estruturais novos nos registros que já existiam.
 * Nunca sobrescreve séries, repetições, descanso ou observações editados por você.
 */
async function migrate(fromVersion, existingEx, existingTpl) {
  if (fromVersion < 2) {
    // v2: alternativas de exercício + modo academia/casa nos treinos
    const catalog = new Map(EXERCISES.map((e) => [e.id, e]));
    const exPatch = existingEx
      .filter((ex) => catalog.has(ex.id))
      .map((ex) => ({
        ...ex,
        alternatives: ex.alternatives?.length ? ex.alternatives : catalog.get(ex.id).alternatives,
        atHome: ex.atHome ?? catalog.get(ex.id).atHome,
      }));
    if (exPatch.length) await store.exercises.saveMany(exPatch);

    const tplCatalog = new Map(ALL_TEMPLATES.map((t) => [t.id, t]));
    const tplPatch = existingTpl
      .filter((t) => tplCatalog.has(t.id))
      .map((t) => ({
        ...t,
        mode: t.mode || tplCatalog.get(t.id).mode,
        homeTemplateId: t.homeTemplateId || tplCatalog.get(t.id).homeTemplateId,
        homeCardioPlanId: t.homeCardioPlanId || tplCatalog.get(t.id).homeCardioPlanId,
      }));
    if (tplPatch.length) await store.templates.saveMany(tplPatch);

    // planos de cardio caseiros para quem já tinha as configurações salvas
    const settings = await store.settings.get();
    const plans = settings?.cardioPlans || [];
    const missing = CARDIO_PLANS.filter((p) => !plans.some((x) => x.id === p.id));
    if (missing.length) await store.settings.save({ cardioPlans: [...plans, ...missing] });
  }
}
