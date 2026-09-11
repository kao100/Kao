/** Painel de evolução e histórico por exercício. */

import { h } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, formatMinutes, num, kg } from '../../core/format.js';
import { evolutionPanel } from '../../logic/report.js';
import { page, topbar, sectionTitle, emptyState } from '../shell.js';
import { lineChart, barChart, legend } from '../components/chart.js';
import { segmented } from '../components/inputs.js';
import { recentAchievements, RECORD_TYPES } from '../../logic/records.js';

export async function progressView() {
  const [weeks, measurements, streak, exMap, allSets, achievements] = await Promise.all([
    evolutionPanel(8),
    store.measurements.all(),
    store.promiseStreak(),
    store.exercises.map(),
    store.db.getAll('sets'),
    recentAchievements(12),
  ]);

  const weightPoints = measurements
    .filter((m) => m.weightKg != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((m) => ({ date: m.date, value: m.weightKg }));
  const waistPoints = measurements
    .filter((m) => m.waistCm != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((m) => ({ date: m.date, value: m.waistCm }));

  const exerciseIds = [...new Set(allSets.map((s) => s.exerciseId))];

  return page(
    topbar({ eyebrow: 'Painel', title: 'Progresso' }),

    h('div.grid-2',
      stat('Sequência', `${streak.current}`, `recorde: ${streak.best} dias`),
      stat('Volume da semana', `${Math.round(weeks.at(-1)?.volume || 0)}`, 'kg (carga × reps)'),
      stat('Treinos na semana', String(weeks.at(-1)?.strengthCount || 0), 'musculação'),
      stat('Minutos na semana', formatMinutes(weeks.at(-1)?.totalMinutes || 0), 'todas as atividades'),
      stat('Cardio', formatMinutes(weeks.at(-1)?.cardioMinutes || 0), `${weeks.at(-1)?.cardioCount || 0} sessão(ões)`),
      stat('Futebol', formatMinutes(weeks.at(-1)?.footballMinutes || 0), `${weeks.at(-1)?.footballCount || 0} partida(s)`),
    ),

    achievements.length
      ? h('div.stack.stack--sm',
        sectionTitle('Conquistas'),
        h('div.list', ...achievements.map((a) => h('div.list-item.clickable', {
          onClick: () => navigate(`/progresso/${a.exerciseId}`),
        },
        h('div.list-item__thumb', { style: { fontSize: '20px' } }, RECORD_TYPES[a.type].icon),
        h('div.grow',
          h('div.list-item__title', a.exerciseName),
          h('div.list-item__sub', `${RECORD_TYPES[a.type].label} · ${a.text}`),
          h('div.list-item__sub', formatDate(a.date, 'full')),
        ),
        ))),
      )
      : null,

    h('div.card',
      h('div.card__title', 'Volume semanal de musculação'),
      barChart({
        data: weeks.map((w) => ({ label: formatDate(w.start).slice(0, 5), value: w.volume })),
        color: 'volt',
        formatValue: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))),
      }),
      legend([{ color: 'volt', label: 'carga × repetições (kg)' }]),
    ),

    h('div.card',
      h('div.card__title', 'Minutos por semana'),
      barChart({
        data: weeks.map((w) => ({ label: formatDate(w.start).slice(0, 5), value: w.totalMinutes })),
        color: 'flame',
        formatValue: (v) => String(Math.round(v)),
      }),
      legend([{ color: 'flame', label: 'musculação + cardio + futebol' }]),
    ),

    h('div.card',
      h('div.card__title', 'Peso'),
      lineChart({ points: weightPoints, color: 'cardio', formatValue: (v) => num(v, 1), emptyText: 'Registre seu peso em "Meu físico".' }),
    ),

    h('div.card',
      h('div.card__title', 'Cintura'),
      lineChart({ points: waistPoints, color: 'ball', formatValue: (v) => num(v, 1), emptyText: 'Registre sua cintura em "Meu físico".' }),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Progressão por exercício'),
      exerciseIds.length
        ? h('div.list', ...exerciseIds.map((id) => {
          const ex = exMap.get(id);
          const sets = allSets.filter((s) => s.exerciseId === id);
          const top = Math.max(...sets.map((s) => Number(s.weight) || 0));
          const lastDate = sets.map((s) => s.date).sort().at(-1);
          return h('div.list-item.clickable', { onClick: () => navigate(`/progresso/${id}`) },
            h('div.grow',
              h('div.list-item__title', ex?.namePt || id),
              h('div.list-item__sub', `maior carga ${kg(top)} · último registro ${formatDate(lastDate, 'full')}`),
            ),
            h('span.muted', '›'),
          );
        }))
        : emptyState('📈', 'Ainda não há séries registradas. Depois do primeiro treino, sua progressão aparece aqui.'),
    ),
  );
}

function stat(label, value, sub) {
  return h('div.stat', h('div.stat__label', label), h('div.stat__value', value), sub ? h('div.stat__sub', sub) : null);
}

/* ------------------------------------------------------------------ */
/* /progresso/:exerciseId                                               */
/* ------------------------------------------------------------------ */

export async function exerciseProgressView({ params }) {
  const [exercise, history, prs] = await Promise.all([
    store.exercises.byId(params.exerciseId),
    store.exerciseHistory(params.exerciseId),
    store.personalRecords(params.exerciseId),
  ]);

  if (!exercise) return page(topbar({ title: 'Progresso', showBack: true }), emptyState('🤔', 'Exercício não encontrado.'));
  if (!history.length) {
    return page(
      topbar({ eyebrow: exercise.muscleGroup, title: exercise.namePt, showBack: true }),
      emptyState('📈', 'Nenhuma série registrada ainda para este exercício.'),
    );
  }

  const chartBox = h('div');
  const modes = {
    weight: { label: 'Carga', points: history.map((hh) => ({ date: hh.date, value: hh.topWeight })), color: 'volt', fmt: (v) => num(v, 1) },
    volume: { label: 'Volume', points: history.map((hh) => ({ date: hh.date, value: hh.volume })), color: 'cardio', fmt: (v) => String(Math.round(v)) },
    reps: { label: 'Repetições', points: history.map((hh) => ({ date: hh.date, value: hh.totalReps })), color: 'ball', fmt: (v) => String(Math.round(v)) },
  };
  const renderChart = (key) => {
    const m = modes[key];
    chartBox.replaceChildren(
      lineChart({ points: m.points, color: m.color, formatValue: m.fmt }),
      legend([{ color: m.color, label: key === 'weight' ? 'maior carga da sessão (kg)' : key === 'volume' ? 'volume da sessão (kg)' : 'repetições totais' }]),
    );
  };
  const tabs = segmented({
    options: Object.entries(modes).map(([value, m]) => ({ value, label: m.label })),
    value: 'weight',
    onChange: renderChart,
  });
  renderChart('weight');

  return page(
    topbar({ eyebrow: exercise.muscleGroup, title: exercise.namePt, showBack: true }),

    h('div.card',
      tabs,
      h('div.mt', chartBox),
    ),

    prs ? h('div.stack.stack--sm',
      sectionTitle('Recordes pessoais'),
      h('div.grid-2',
        prCard('🏆 Maior carga', `${num(prs.heaviest.weight, 1)} kg`, `${prs.heaviest.reps} reps · ${formatDate(prs.heaviest.date, 'full')}`),
        prCard('🏆 Mais repetições', `${prs.mostReps.reps}`, `${num(prs.mostReps.weight, 1)} kg · ${formatDate(prs.mostReps.date, 'full')}`),
        prCard('🏆 Maior volume (sessão)', `${Math.round(prs.bestVolume.volume)} kg`, formatDate(prs.bestVolume.date, 'full')),
        prCard('🏆 Melhor série', `${num(prs.bestSetVolume.weight, 1)}×${prs.bestSetVolume.reps}`, formatDate(prs.bestSetVolume.date, 'full')),
      ),
    ) : null,

    h('div.stack.stack--sm',
      sectionTitle('Histórico'),
      h('div.list', ...[...history].reverse().map((hh) => h('div.list-item',
        h('div.grow',
          h('div.list-item__title', formatDate(hh.date, 'full')),
          h('div.list-item__sub', hh.sets.map((s) => (s.durationSec ? `${s.durationSec}s` : `${num(s.weight, 1)}×${s.reps}${s.rir != null ? ` (RIR ${s.rir})` : ''}`)).join('  ·  ')),
        ),
        h('div', { style: { textAlign: 'right' } },
          h('div.num', { style: { fontWeight: '700' } }, `${Math.round(hh.volume)} kg`),
          h('div.list-item__sub', `${hh.totalReps} reps`),
        ),
      ))),
    ),

    h('button.btn.btn--ghost.btn--block', { onClick: () => navigate(`/exercicio/${exercise.id}`) }, 'Ver ficha do exercício'),
  );
}

function prCard(title, value, sub) {
  return h('div.stat', h('div.stat__label', title), h('div.stat__value', value), h('div.stat__sub', sub));
}
