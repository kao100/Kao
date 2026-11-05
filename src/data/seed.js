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
import { BUILTIN_GYM_EQUIPMENT, REMOVED_DUPLICATE_EQUIPMENT } from './gym-equipment.js';
import { BUILTIN_FOODS } from './foods.js';

export const SEED_VERSION = 8;

export const DEFAULT_PROFILE = {
  name: '',
  weightKg: null,
  heightM: null,
  birthDate: null,
  experienceMonths: null,
  // iniciante | intermediario | avancado — muda o tom do app e o cardio padrão
  level: null,
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
  // quanto tempo você tem para treinar num dia normal (o mínimo é a promessa)
  sessionMinutes: 60,
  promiseText: 'Pelo menos 30 minutos de exercício todos os dias.',
  onboarded: false,
};

/**
 * Composição dos treinos em casa na versão 2 — usada para saber se você editou
 * o treino antes de a migração v3 (barra fixa) reescrever qualquer coisa.
 */
const V2_HOME_ITEMS = {
  'tpl-upper-a-casa': ['push-up', 'inverted-row', 'incline-push-up', 'backpack-row', 'pike-push-up', 'lateral-raise', 'biceps-curl', 'bench-dip'],
  'tpl-lower-a-casa': ['glute-bridge', 'single-leg-rdl', 'single-leg-glute-bridge', 'box-squat', 'calf-raise', 'plank'],
  'tpl-upper-b-casa': ['inverted-row', 'backpack-row', 'superman', 'pike-push-up', 'lateral-raise', 'hammer-curl'],
  'tpl-upper-c-casa': ['incline-push-up', 'inverted-row', 'push-up', 'backpack-row', 'lateral-raise', 'biceps-curl', 'bench-dip'],
  'tpl-lower-b-casa': ['single-leg-glute-bridge', 'single-leg-rdl', 'glute-bridge', 'calf-raise', 'dead-bug'],
};

/**
 * Composição dos treinos de academia na versão 4 — usada para saber se você
 * editou o treino antes de a migração v5 (core, tríceps e cardio forte)
 * reescrever qualquer coisa.
 */
const V5_WEEKEND_ITEMS = {
  'tpl-lower-b': ['hip-thrust', 'leg-press', 'leg-curl', 'hip-abduction', 'calf-raise', 'reverse-crunch', 'hollow-hold'],
};

const V4_GYM_ITEMS = {
  'tpl-upper-a': ['machine-chest-press', 'lat-pulldown', 'incline-press', 'seated-cable-row', 'shoulder-press', 'lateral-raise', 'biceps-curl', 'triceps-pushdown'],
  'tpl-lower-a': ['leg-press', 'romanian-deadlift', 'leg-curl', 'hip-thrust', 'leg-extension', 'calf-raise', 'plank'],
  'tpl-upper-b': ['lat-pulldown', 'chest-supported-row', 'unilateral-pulldown', 'reverse-fly', 'lateral-raise', 'hammer-curl'],
  'tpl-upper-c': ['incline-press', 'seated-cable-row', 'cable-crossover', 'lat-pulldown', 'lateral-raise', 'biceps-curl', 'triceps-pushdown'],
  'tpl-lower-b': ['hip-thrust', 'leg-press', 'leg-curl', 'hip-abduction', 'calf-raise', 'dead-bug'],
};

/**
 * Composição de fábrica de Upper B e Upper C na versão 6 — a migração v7
 * (prioridade do tronco no Projeto Casamento) só reescreve o que continua
 * igual a isto.
 */
const V6_UPPER_ITEMS = {
  'tpl-upper-b': ['lat-pulldown', 'chest-supported-row', 'unilateral-pulldown', 'reverse-fly', 'lateral-raise', 'hammer-curl', 'triceps-pushdown', 'pallof-press'],
  'tpl-upper-c': ['incline-press', 'seated-cable-row', 'cable-crossover', 'lat-pulldown', 'lateral-raise', 'biceps-curl', 'triceps-pushdown', 'hanging-leg-raise'],
};

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  restCompoundSec: 150,
  restIsolationSec: 75,
  // troca de exercício não é descanso de série: é caminhar até o aparelho e
  // regular o banco. O tempo longo aqui só atrasa o treino.
  restBetweenExercisesSec: 60,
  // multiplicador do descanso ENTRE SÉRIES (1 = como programado)
  restPace: 1,
  restAutoStart: true,
  soundEnabled: true,
  vibrationEnabled: true,
  keepScreenAwake: true,
  askRecoveryBeforeWorkout: true,
  askKneeBeforeLegsAndFootball: true,
  // PREPARAÇÃO PARA O TREINO antes da primeira série
  prepEnabled: true,
  // teto de inclinação da esteira (null = usa o do plano, nunca a máxima)
  treadmillInclineMax: null,
  weightIncrementKg: 2.5,
  smallIncrementKg: 1,
  cardioPlans: CARDIO_PLANS,
  nextAppointment: null,
  appointmentNote: '',
  // O que existe para treinar em casa. Os treinos caseiros assumem barra fixa;
  // desmarcando aqui, o app avisa e sugere as alternativas sem barra.
  homeEquipment: {
    pullUpBar: true,
    bench: true,
    backpack: true,
    mat: true,
    dumbbells: false,
    bands: false,
  },
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

  // Fotos das máquinas da academia (idempotente: só adiciona o que falta).
  const addedEquipment = await seedGymEquipment();

  // Tabela de alimentos (mesma regra: só adiciona o que falta).
  const addedFoods = await seedFoods();

  if (current < SEED_VERSION) await store.setKV(store.KV.SEED_VERSION, SEED_VERSION);

  return { seeded: !profile, addedExercises: newEx.length, addedTemplates: newTpl.length, addedEquipment, addedFoods };
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

  if (fromVersion < 3) {
    // v3: barra fixa nos treinos em casa.
    // Só reescreve o treino que continua exatamente como veio de fábrica —
    // se você mexeu em algum, ele fica como está e os exercícios novos ficam
    // disponíveis para você adicionar quando quiser.
    const tplCatalog = new Map(ALL_TEMPLATES.map((t) => [t.id, t]));
    const updates = [];
    const skipped = [];
    for (const tpl of existingTpl) {
      const original = V2_HOME_ITEMS[tpl.id];
      if (!original) continue;
      const current = (tpl.items || []).map((it) => it.exerciseId);
      const untouched = current.length === original.length && current.every((id, i) => id === original[i]);
      if (untouched) updates.push({ ...tpl, items: tplCatalog.get(tpl.id).items, notes: tplCatalog.get(tpl.id).notes });
      else skipped.push(tpl.name);
    }
    if (updates.length) await store.templates.saveMany(updates);

    const settings = await store.settings.get();
    if (!settings?.homeEquipment) await store.settings.save({ homeEquipment: DEFAULT_SETTINGS.homeEquipment });
    if (skipped.length) {
      console.info('Treinos em casa preservados porque foram editados:', skipped.join(', '));
    }
  }

  if (fromVersion < 5) {
    // v5: core em todo treino, tríceps na dose certa e cardio com intensidade.
    // Mesma regra de sempre: só reescreve o treino que ainda está idêntico ao
    // de fábrica. Editou, fica como está — e os exercícios novos ficam na
    // biblioteca para você adicionar quando quiser.
    const tplCatalog = new Map(ALL_TEMPLATES.map((t) => [t.id, t]));
    const updates = [];
    const skipped = [];
    for (const tpl of existingTpl) {
      const original = V4_GYM_ITEMS[tpl.id];
      const fresh = tplCatalog.get(tpl.id);
      if (!original || !fresh) continue;
      const current = (tpl.items || []).map((it) => it.exerciseId);
      const untouched = current.length === original.length && current.every((id, i) => id === original[i]);
      if (untouched) updates.push({ ...tpl, items: fresh.items });
      else skipped.push(tpl.name);
    }

    // domingo sem futebol passa de Zona 2 a intervalados
    const sunday = existingTpl.find((t) => t.id === 'tpl-domingo-cardio');
    const freshSunday = tplCatalog.get('tpl-domingo-cardio');
    if (sunday && freshSunday && sunday.cardioPlanId === 'cardio-zona2-40') {
      updates.push({ ...sunday, name: freshSunday.name, subtitle: freshSunday.subtitle, cardioPlanId: freshSunday.cardioPlanId, notes: freshSunday.notes });
    }

    if (updates.length) await store.templates.saveMany(updates);

    // planos de cardio novos entram na lista; os seus ajustes ficam intactos
    const settings = await store.settings.get();
    const plans = settings?.cardioPlans || [];
    const merged = plans.map((p) => {
      const fresh = CARDIO_PLANS.find((c) => c.id === p.id);
      // a Zona 2 de quarta era RPE 3–4, leve demais para quem já tem base;
      // só corrige quem não mexeu no plano
      if (fresh && p.id === 'cardio-zona2-30' && p.rpe === '3–4 / 10') return fresh;
      return p;
    });
    const missing = CARDIO_PLANS.filter((c) => !merged.some((p) => p.id === c.id));
    if (missing.length || merged.some((p, i) => p !== plans[i])) {
      await store.settings.save({ cardioPlans: [...merged, ...missing] });
    }

    if (skipped.length) {
      console.info('Treinos de academia preservados porque foram editados:', skipped.join(', '));
    }
  }

  if (fromVersion < 6) {
    // v6: sábado e domingo mais pesados (você não tem hora nesses dias) e
    // descanso de troca de exercício separado do descanso entre séries.
    const tplCatalog = new Map(ALL_TEMPLATES.map((t) => [t.id, t]));
    const updates = [];
    const skipped = [];

    for (const tpl of existingTpl) {
      const original = V5_WEEKEND_ITEMS[tpl.id];
      const fresh = tplCatalog.get(tpl.id);
      if (!original || !fresh) continue;
      const current = (tpl.items || []).map((it) => it.exerciseId);
      const untouched = current.length === original.length && current.every((id, i) => id === original[i]);
      if (untouched) updates.push({ ...tpl, items: fresh.items, notes: fresh.notes });
      else skipped.push(tpl.name);
    }

    // domingo ganha os acessórios só se ainda estiver vazio (de fábrica)
    const sunday = existingTpl.find((t) => t.id === 'tpl-domingo-cardio');
    const freshSunday = tplCatalog.get('tpl-domingo-cardio');
    if (sunday && freshSunday && !(sunday.items || []).length) {
      updates.push({
        ...sunday,
        items: freshSunday.items,
        name: freshSunday.name,
        subtitle: freshSunday.subtitle,
        notes: freshSunday.notes,
        cardioFirst: true,
      });
    }

    if (updates.length) await store.templates.saveMany(updates);

    const settings = await store.settings.get();
    const patch = {};
    if (settings?.restBetweenExercisesSec == null) patch.restBetweenExercisesSec = DEFAULT_SETTINGS.restBetweenExercisesSec;
    if (settings?.restPace == null) patch.restPace = DEFAULT_SETTINGS.restPace;
    if (Object.keys(patch).length) await store.settings.save(patch);

    if (skipped.length) {
      console.info('Treinos de fim de semana preservados porque foram editados:', skipped.join(', '));
    }
  }

  if (fromVersion < 7) {
    // v7: prioridade do tronco (Projeto Casamento) e fortalecimento do joelho.
    //  - Upper B ganha peito (3 estímulos de peitoral na semana) e perde a
    //    puxada unilateral (costas passa de 19 para 16 séries);
    //  - Upper C ganha posterior de ombro e a remada vai de 3 para 2 séries.
    // Mesma regra de sempre: só mexe no treino que você não editou.
    const tplCatalog = new Map(ALL_TEMPLATES.map((t) => [t.id, t]));
    const updates = [];
    const skipped = [];
    for (const tpl of existingTpl) {
      const original = V6_UPPER_ITEMS[tpl.id];
      const fresh = tplCatalog.get(tpl.id);
      if (!original || !fresh) continue;
      const current = (tpl.items || []).map((it) => it.exerciseId);
      const untouched = current.length === original.length && current.every((id, i) => id === original[i]);
      if (untouched) updates.push({ ...tpl, items: fresh.items, notes: fresh.notes });
      else skipped.push(tpl.name);
    }
    if (updates.length) await store.templates.saveMany(updates);

    // alternativas novas (biblioteca de fortalecimento) somadas às existentes
    const catalog = new Map(EXERCISES.map((e) => [e.id, e]));
    const exPatch = existingEx
      .filter((ex) => catalog.has(ex.id))
      .map((ex) => {
        const merged = [...new Set([...(ex.alternatives || []), ...catalog.get(ex.id).alternatives])];
        return merged.length !== (ex.alternatives || []).length ? { ...ex, alternatives: merged } : null;
      })
      .filter(Boolean);
    if (exPatch.length) await store.exercises.saveMany(exPatch);

    const settings = await store.settings.get();
    const patch = {};
    if (settings?.prepEnabled == null) patch.prepEnabled = true;
    if (!('treadmillInclineMax' in (settings || {}))) patch.treadmillInclineMax = null;
    if (Object.keys(patch).length) await store.settings.save(patch);

    if (skipped.length) {
      console.info('Treinos de superiores preservados porque foram editados:', skipped.join(', '));
    }
  }

  if (fromVersion < 8) {
    // v8: fotos da academia corrigidas. Apaga os registros que eram a mesma
    // foto de outro com nome diferente e move três fotos para o exercício
    // certo. Só mexe no que ainda está como veio de fábrica: foto trocada ou
    // reassociada por você fica como está.
    const all = await store.equipment.all();
    const fresh = new Map(BUILTIN_GYM_EQUIPMENT.map((e) => [e.id, e]));
    const OLD_EXERCISE = {
      'eq-voador-vermelho': 'reverse-fly',
      'eq-panturrilha-sentada': 'calf-raise',
      'eq-gluteo-maquina': 'hip-thrust',
    };
    for (const row of all) {
      if (!row.builtin) continue;
      if (REMOVED_DUPLICATE_EQUIPMENT.includes(row.id)) {
        const file = `./assets/gym/${row.id.replace(/^eq-/, '')}.jpg`;
        if (row.photo === file || row.photo?.startsWith('./assets/gym/')) await store.db.remove('equipment', row.id);
        continue;
      }
      const f = fresh.get(row.id);
      if (!f) continue;
      const untouched = row.exerciseId === f.exerciseId || row.exerciseId === OLD_EXERCISE[row.id];
      if (untouched && row.photo === f.photo) {
        await store.db.put('equipment', { ...row, exerciseId: f.exerciseId, model: f.model, note: f.note, useAsPrimary: f.useAsPrimary, confirm: f.confirm, updatedAt: Date.now() });
      }
    }
  }

}

/**
 * Cadastra as fotos das máquinas da academia em "Minha academia".
 * Só adiciona o que ainda não existe — foto apagada ou reassociada por você
 * não volta e não é sobrescrita.
 */
async function seedFoods() {
  const [existing, removed] = await Promise.all([
    store.foods.all(),
    store.foods.removedBuiltinIds(),
  ]);
  const ids = new Set(existing.map((f) => f.id));
  // alimento que você apagou não volta na atualização seguinte
  for (const id of removed) ids.add(id);
  const rows = BUILTIN_FOODS
    .filter((f) => !ids.has(f.id))
    .map((f) => ({ ...f, createdAt: Date.now(), updatedAt: Date.now() }));
  if (rows.length) await store.foods.saveMany(rows);
  return rows.length;
}

async function seedGymEquipment() {
  const [existing, removed] = await Promise.all([
    store.equipment.all(),
    store.equipment.removedBuiltinIds(),
  ]);
  const ids = new Set(existing.map((e) => e.id));
  // foto que você apagou não volta na atualização seguinte
  for (const id of removed) ids.add(id);
  const rows = BUILTIN_GYM_EQUIPMENT
    .filter((e) => !ids.has(e.id))
    .map((e) => ({ ...e, createdAt: Date.now(), updatedAt: Date.now() }));
  if (rows.length) await store.equipment.saveMany(rows);
  return rows.length;
}
