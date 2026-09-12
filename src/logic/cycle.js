/**
 * Ciclos de treino (blocos) e rotação de exercícios.
 *
 * Por que isto existe, já que "variar sempre" é meio mito e meio verdade:
 *
 * O que faz o músculo crescer é sobrecarga progressiva e volume — não novidade.
 * Trocar de exercício toda semana atrapalha, porque sem repetir o movimento não
 * dá para saber se você ficou mais forte nele. "Confundir o músculo" não é uma
 * coisa real.
 *
 * Mas variar tem motivos legítimos, e são três:
 *   1. articulação — repetir o mesmo padrão com carga alta por muitos meses
 *      concentra estresse sempre no mesmo ponto (relevante no seu caso);
 *   2. estímulo — variantes diferentes de um mesmo padrão atingem porções
 *      diferentes do músculo, e a literatura sugere alguma vantagem em alternar
 *      dentro do padrão;
 *   3. cabeça — treino que enjoou é treino que se abandona.
 *
 * A conciliação prática, e o que este módulo implementa: o **padrão** fica
 * (empurrar, puxar, dobrar o joelho, estender o quadril), a **variante** gira a
 * cada bloco. Blocos de 6 a 8 semanas dão tempo de progredir carga de verdade
 * antes de mexer em qualquer coisa.
 *
 * Nada aqui é aplicado sozinho. O app sugere ao fim do bloco; quem troca é você.
 */

import * as store from '../core/store.js';
import { today, addDays, daysBetween } from '../core/format.js';

export const DEFAULT_BLOCK_WEEKS = 6;
export const MIN_BLOCK_WEEKS = 4;
export const MAX_BLOCK_WEEKS = 12;

/** Fases dentro de um bloco. */
export const PHASE = {
  adaptation: {
    id: 'adaptation',
    label: 'Adaptação',
    short: 'aprender o movimento',
    text: 'Primeiras semanas do bloco: a prioridade é a técnica e repetir o mesmo exercício o suficiente para saber como ele responde. Suba carga só quando a execução estiver tranquila.',
  },
  accumulation: {
    id: 'accumulation',
    label: 'Acúmulo',
    short: 'subir carga',
    text: 'Miolo do bloco: é aqui que a progressão dupla trabalha. Fechou todas as séries no topo da faixa, sobe a carga na próxima.',
  },
  peak: {
    id: 'peak',
    label: 'Semana mais pesada',
    short: 'fechar o bloco',
    text: 'Última semana de carga do bloco. Mantenha o RIR entre 1 e 2 — chegar à falha aqui atrapalha mais do que ajuda.',
  },
  deload: {
    id: 'deload',
    label: 'Semana leve (deload)',
    short: 'aliviar',
    text: 'Semana de alívio: mesmos exercícios, cerca de metade das séries e carga uns 10% menor. Serve para a articulação e o tendão recuperarem antes do bloco novo — e costuma ser seguida de um salto de carga.',
  },
};

/** Estado do ciclo atual. Sem bloco iniciado, devolve `null` em `block`. */
export async function cycleState(date = today()) {
  const settings = await store.settings.get();
  const block = settings?.trainingBlock || null;
  if (!block?.startDate) {
    return { block: null, week: null, totalWeeks: DEFAULT_BLOCK_WEEKS, phase: null, finished: false, daysLeft: null };
  }

  const totalWeeks = Number(block.weeks) || DEFAULT_BLOCK_WEEKS;
  const elapsed = daysBetween(block.startDate, date);
  const week = Math.floor(elapsed / 7) + 1;
  const finished = week > totalWeeks;
  const endDate = addDays(block.startDate, totalWeeks * 7 - 1);

  return {
    block,
    number: Number(block.number) || 1,
    week: Math.min(week, totalWeeks),
    rawWeek: week,
    totalWeeks,
    phase: finished ? null : phaseForWeek(week, totalWeeks),
    finished,
    endDate,
    daysLeft: daysBetween(date, endDate),
  };
}

/**
 * Fase pela semana.
 * A última semana é sempre deload; a primeira é adaptação apenas no primeiro
 * bloco de uma variante nova, mas como o app não sabe disso sozinho, trata a
 * semana 1 como adaptação sempre — é o lado seguro do erro.
 */
export function phaseForWeek(week, totalWeeks) {
  if (week >= totalWeeks) return PHASE.deload;
  if (week === 1) return PHASE.adaptation;
  if (week === totalWeeks - 1) return PHASE.peak;
  return PHASE.accumulation;
}

/** Começa (ou recomeça) um bloco. */
export async function startBlock({ weeks = DEFAULT_BLOCK_WEEKS, date = today(), number = null } = {}) {
  const settings = await store.settings.get();
  const prev = settings?.trainingBlock;
  const next = {
    startDate: date,
    weeks: Math.min(MAX_BLOCK_WEEKS, Math.max(MIN_BLOCK_WEEKS, Number(weeks) || DEFAULT_BLOCK_WEEKS)),
    number: number ?? ((Number(prev?.number) || 0) + 1),
    startedAt: Date.now(),
  };
  await store.settings.save({ trainingBlock: next });
  return next;
}

/**
 * Sugestões de rotação para o fim do bloco.
 *
 * Regras, nesta ordem:
 *   - só sugere troca dentro das alternativas já cadastradas do exercício,
 *     porque elas respeitam o mesmo padrão de movimento;
 *   - nunca sugere subir o risco para o joelho: uma alternativa com `kneeRisk`
 *     maior que a do exercício atual é descartada;
 *   - exercício que você registrou com dor acima do seu normal entra na lista
 *     com o motivo explícito, no topo;
 *   - exercício em que você está progredindo bem é marcado como "não mexeria",
 *     porque trocar o que está funcionando custa progresso.
 */
export async function rotationSuggestions() {
  const [templates, exMap, painReport] = await Promise.all([
    store.templates.all(),
    store.exercises.map(),
    (async () => {
      const { painByExercise } = await import('./knee.js');
      return painByExercise({ days: 120 });
    })(),
  ]);

  const painByEx = new Map(painReport.rows.map((r) => [r.exerciseId, r]));
  const RISK = { low: 0, moderate: 1, high: 2 };

  const seen = new Set();
  const out = [];

  for (const tpl of templates) {
    if (tpl.archived || tpl.mode === 'home') continue;
    for (const item of tpl.items || []) {
      if (seen.has(item.exerciseId)) continue;
      seen.add(item.exerciseId);

      const ex = exMap.get(item.exerciseId);
      if (!ex) continue;

      const alternatives = (ex.alternatives || [])
        .map((id) => exMap.get(id))
        .filter(Boolean)
        // não sobe o risco para o joelho
        .filter((alt) => (RISK[alt.kneeRisk || 'low'] ?? 0) <= (RISK[ex.kneeRisk || 'low'] ?? 0))
        // e não manda você para um exercício que já está doendo mais que o seu normal
        .filter((alt) => {
          const p = painByEx.get(alt.id);
          return !(p && (p.flag === 'above' || p.flag === 'high'));
        });

      const pain = painByEx.get(item.exerciseId);
      const progress = await progressOf(item.exerciseId);

      let reason = 'Girar a variante mantém o mesmo padrão de movimento e muda o estímulo.';
      let priority = 1;
      let keep = false;

      if (pain?.flag === 'above' || pain?.flag === 'high') {
        reason = `Você registrou dor média de ${pain.avgPain} nas séries deste exercício${pain.reference != null ? `, contra ${pain.reference} nos outros de perna` : ''}. Vale testar uma alternativa e comparar.`;
        priority = 0;
      } else if (progress.stalled) {
        reason = `A carga não sobe há ${progress.weeksStalled} semanas. Uma variante diferente costuma destravar.`;
        priority = 0;
      } else if (progress.improving) {
        reason = 'Você está progredindo bem neste exercício. Eu não mexeria neste bloco — trocar o que funciona custa progresso.';
        priority = 2;
        keep = true;
      }

      // sem alternativa cadastrada não há o que sugerir — mas "não mexeria"
      // continua valendo, e é a parte da resposta que mais importa
      if (!alternatives.length && !keep) continue;

      out.push({
        exerciseId: ex.id,
        name: ex.namePt,
        templateName: tpl.name,
        kneeRisk: ex.kneeRisk || 'low',
        alternatives: alternatives.slice(0, 4).map((a) => ({ id: a.id, name: a.namePt, kneeRisk: a.kneeRisk || 'low' })),
        pain: pain || null,
        progress,
        reason,
        keep,
        priority,
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'pt'));
}

/** Como a carga vem se comportando neste exercício nas últimas semanas. */
async function progressOf(exerciseId) {
  const sets = (await store.sets.byExercise(exerciseId))
    .filter((s) => s.weight != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sets.length < 4) return { stalled: false, improving: false, weeksStalled: 0, topWeight: null };

  const topWeight = Math.max(...sets.map((s) => Number(s.weight) || 0));
  const firstTopAt = sets.find((s) => Number(s.weight) === topWeight)?.date;
  const last = sets[sets.length - 1].date;
  const weeksStalled = firstTopAt ? Math.floor(daysBetween(firstTopAt, last) / 7) : 0;

  const half = Math.floor(sets.length / 2);
  const early = Math.max(...sets.slice(0, half).map((s) => Number(s.weight) || 0));
  const recent = Math.max(...sets.slice(half).map((s) => Number(s.weight) || 0));

  return {
    topWeight,
    weeksStalled,
    stalled: weeksStalled >= 3,
    improving: recent > early,
  };
}
