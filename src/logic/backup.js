/**
 * Backup e exportação.
 * Seu histórico não pode se perder: tudo pode sair em JSON (completo) ou CSV
 * (por tipo de dado) e voltar depois por importação.
 */

import * as db from '../core/db.js';
import { STORES } from '../core/db.js';
import { toCSV, downloadFile } from '../core/util.js';
import { today } from '../core/format.js';

export const BACKUP_FORMAT = 'kao-training-backup';
export const BACKUP_VERSION = 1;

export async function buildBackup() {
  const data = {};
  for (const name of Object.keys(STORES)) {
    // eslint-disable-next-line no-await-in-loop
    data[name] = await db.getAll(name);
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function exportJSON() {
  const backup = await buildBackup();
  downloadFile(`kao-training-backup-${today()}.json`, JSON.stringify(backup, null, 2));
  return backup;
}

/** Exportações em CSV, por tipo de dado. */
export const CSV_EXPORTS = [
  {
    id: 'sets',
    label: 'Séries de musculação',
    build: async () => {
      const [sets, exercises, sessions] = await Promise.all([
        db.getAll('sets'), db.getAll('exercises'), db.getAll('sessions'),
      ]);
      const exMap = new Map(exercises.map((e) => [e.id, e]));
      const sesMap = new Map(sessions.map((s) => [s.id, s]));
      return sets
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((s) => ({
          data: s.date,
          treino: sesMap.get(s.sessionId)?.name || '',
          exercicio: exMap.get(s.exerciseId)?.namePt || s.exerciseId,
          serie: (s.index ?? 0) + 1,
          carga_kg: s.weight,
          repeticoes: s.reps,
          tempo_seg: s.durationSec,
          rir: s.rir,
          dor_0a10: s.pain,
          volume_kg: (Number(s.weight) || 0) * (Number(s.reps) || 0),
        }));
    },
  },
  {
    id: 'sessions',
    label: 'Sessões de treino',
    build: async () => (await db.getAll('sessions')).map((s) => ({
      data: s.date, treino: s.name, status: s.status, duracao_min: s.durationMin, observacao: s.notes,
    })),
  },
  {
    id: 'cardio',
    label: 'Cardio',
    build: async () => (await db.getAll('cardio')).map((c) => ({
      data: c.date, sessao: c.name, duracao_min: c.durationMin, rpe: c.rpe, talk_test: c.talkTest, fc_media: c.avgHr, observacao: c.notes,
    })),
  },
  {
    id: 'football',
    label: 'Futebol',
    build: async () => (await db.getAll('football')).map((f) => ({
      data: f.date, duracao_min: f.durationMin, rpe: f.rpe, gols: f.goals, distancia_km: f.distanceKm,
      calorias: f.calories, joelho_antes: f.kneeBefore, joelho_depois: f.kneeAfter, observacao: f.notes,
    })),
  },
  {
    id: 'pain',
    label: 'Dor no joelho',
    build: async () => (await db.getAll('painLogs')).map((p) => ({
      data: p.date, momento: p.context, dor_0a10: p.score,
      dor_no_movimento: p.painDuringMovement ? 'sim' : 'não',
      inchaco: p.swelling ? 'sim' : 'não',
      instabilidade: p.instability ? 'sim' : 'não',
      observacao: p.notes,
    })),
  },
  {
    id: 'measurements',
    label: 'Medidas corporais',
    build: async () => (await db.getAll('measurements')).map((m) => ({ ...m, id: undefined })),
  },
  {
    id: 'daily',
    label: 'Promessa diária',
    build: async () => (await db.getAll('dailyLog')).map((d) => ({
      data: d.date, minutos: d.minutes, promessa_cumprida: d.promiseMet ? 'sim' : 'não',
      atividades: (d.sources || []).map((s) => `${s.label} (${s.minutes}min)`).join(' | '),
    })),
  },
  {
    id: 'nutrition',
    label: 'Nutrição',
    build: async () => (await db.getAll('nutrition')).map((n) => ({
      data: n.date, calorias: n.kcal, proteina_g: n.protein, carboidrato_g: n.carbs, gordura_g: n.fat, agua_ml: n.waterMl,
    })),
  },
];

export async function exportCSV(id) {
  const spec = CSV_EXPORTS.find((c) => c.id === id);
  if (!spec) return false;
  const rows = await spec.build();
  if (!rows.length) return false;
  downloadFile(`kao-${id}-${today()}.csv`, toCSV(rows), 'text/csv');
  return true;
}

/**
 * Importa um backup JSON.
 * @param {object} backup
 * @param {'merge'|'replace'} mode
 */
export async function importBackup(backup, mode = 'merge') {
  if (!backup || backup.format !== BACKUP_FORMAT) {
    throw new Error('Arquivo não parece ser um backup do Kao Training.');
  }
  const counts = {};
  for (const [name, rows] of Object.entries(backup.data || {})) {
    if (!STORES[name] || !Array.isArray(rows)) continue;
    // eslint-disable-next-line no-await-in-loop
    if (mode === 'replace') await db.clearStore(name);
    // eslint-disable-next-line no-await-in-loop
    await db.putMany(name, rows);
    counts[name] = rows.length;
  }
  return counts;
}
