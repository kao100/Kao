import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, formatMinutes, weekDates, kg, dayLabel } from '../../core/format.js';
import { planForDate, planForWeek, answerFootball, blockSummary, setLocation } from '../../logic/planner.js';
import { kneeStatus } from '../../logic/knee.js';
import { targetsFor, dayTotals } from '../../logic/nutrition.js';
import { page, topbar, iconAction, sectionTitle, safetyNote } from '../shell.js';
import { startWorkoutFlow } from './workout.js';
import { openDayActivitySheet } from './promise.js';
import { openKneeCheckSheet } from './knee.js';
import { toastOk } from '../components/toast.js';

export async function dashboardView() {
  const date = today();
  const [plan, weekPlans, log, streak, profile, measurement, knee] = await Promise.all([
    planForDate(date),
    planForWeek(date),
    store.dailyLog.get(date),
    store.promiseStreak(date),
    store.profile.get(),
    store.latestMeasurement(),
    kneeStatus(date),
  ]);

  const [foodTargets, foodTotals] = await Promise.all([targetsFor(date), dayTotals(date)]);

  const minutes = log?.minutes || 0;
  const goal = profile?.promiseMinutes || 30;

  return page(
    topbar({
      eyebrow: formatDate(date, 'long'),
      title: 'Início',
      actions: [iconAction('⚙️', { to: '/ajustes', label: 'Ajustes' })],
    }),

    promiseHero({ streak, minutes, goal, log, date }),

    plan.question ? footballQuestion(plan.question) : null,

    todayCard(plan, date),

    knee.level !== 'ok' ? kneeAlert(knee) : null,

    await weekStats(weekPlans, date),

    foodCard(foodTotals, foodTargets),

    bodyCard(profile, measurement),

    h('div.card.clickable', {
      onClick: () => navigate('/semana'),
    },
    h('div.row.row--between',
      h('div',
        h('div.card__title', 'Resumo da semana'),
        h('div.card__sub', 'Treinos, minutos, progressão e joelho'),
      ),
      h('span.muted', '›'),
    )),
  );
}

/* ---------------------------- promessa ---------------------------- */

function promiseHero({ streak, minutes, goal, date }) {
  const pctDone = Math.min(100, Math.round((minutes / goal) * 100));
  const met = minutes >= goal;

  return h('section.promise',
    h('div.row.row--between',
      h('div',
        h('div.promise__streak',
          h('span', { style: { fontSize: '30px' } }, '🔥'),
          h('span.promise__num', String(streak.current)),
          h('span.promise__unit', streak.current === 1 ? 'dia consecutivo' : 'dias consecutivos'),
        ),
        h('div.promise__label', `Promessa: ${goal} minutos de exercício todos os dias${streak.best > streak.current ? ` · recorde: ${streak.best} dias` : ''}`),
      ),
    ),
    h('div.promise__meter',
      h('div.promise__meter-top',
        h('span', met ? '✅ Promessa de hoje cumprida' : `Hoje: ${formatMinutes(minutes)} de ${goal} min`),
        h('span.num', `${pctDone}%`),
      ),
      h('div.bar', h('div.bar__fill.bar__fill--flame', { style: { width: `${pctDone}%` } })),
    ),
    h('div.btn-row.mt',
      h('button.btn.btn--sm.btn--ghost', { onClick: () => openDayActivitySheet(date) }, '+ Atividade avulsa'),
      h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/dia/${date}`) }, 'Ver o dia'),
    ),
  );
}

/* ---------------------------- futebol ---------------------------- */

function footballQuestion(question) {
  const answer = async (value) => {
    await answerFootball(question.target, value);
    toastOk(value ? 'Futebol confirmado ⚽' : 'Sem futebol — plano ajustado');
    refresh();
  };

  return h('section.card.card--accent',
    h('div.card__title', question.text),
    question.hint ? h('p.muted', { style: { marginTop: '6px' } }, question.hint) : null,
    h('div.btn-row.mt',
      h('button.btn.btn--ball', { onClick: () => answer(true) }, 'SIM'),
      h('button.btn.btn--ghost', { onClick: () => answer(false) }, 'NÃO'),
    ),
  );
}

/* ---------------------------- treino de hoje ---------------------------- */

export function todayCard(plan, date) {
  const main = plan.blocks[0];
  const accent = main?.accent || 'volt';

  return h('section.today-card', { style: { '--accent-color': `var(--${accent})` } },
    h('div.today-card__kicker', `${plan.dayLabel} · treino de hoje`),
    h('div.today-card__title', main?.title || 'Dia livre'),
    h('div.today-card__meta',
      ...plan.blocks.map((b, i) => h(`span.pill.pill--${b.accent}`,
        i === 0 ? `${b.icon} ${blockSummary(b) || b.title}` : `${b.icon} ${b.title}`)),
      plan.blocks.some((b) => b.provisional) ? h('span.pill.pill--warn', 'provisório') : null,
    ),
    main?.template?.items?.length
      ? h('ul.today-card__list',
        ...main.template.items.slice(0, 5).map((it, i) => h('li',
          h('span.today-card__idx', String(i + 1)),
          h('span.grow', it.exerciseName || itemName(main.template, i)),
          h('span.muted.num', it.timeBased ? `${it.sets}×${it.durationSec}s` : `${it.sets}×${it.repMin}–${it.repMax}`),
        )),
        main.template.items.length > 5
          ? h('li', h('span.muted', `+ ${main.template.items.length - 5} exercícios`))
          : null,
      )
      : null,
    plan.notes.length ? safetyNote(plan.notes[0], 'info') : null,
    locationSwitch(plan, date),
    h('div.btn-row', { style: { marginTop: '14px' } },
      h('button.btn.btn--primary.btn--lg.grow', {
        onClick: () => startWorkoutFlow(plan, date),
      }, '▶  Começar'),
      h('button.btn.btn--ghost', { onClick: () => navigate(`/dia/${date}`), style: { flex: '0 0 auto', minWidth: '58px' } }, 'ⓘ'),
    ),
  );
}

function itemName(template, index) {
  return template.items[index]?.exerciseName || template.items[index]?.exerciseId || '';
}

/** Alternador academia × casa — para o dia em que não dá para ir treinar fora. */
export function locationSwitch(plan, date) {
  if (!plan.hasHomeVersion) return null;
  const set = async (location) => {
    await setLocation(date, location);
    refresh();
  };
  return h('div.segmented', { style: { marginTop: '12px' } },
    h(`button.segmented__opt${plan.location === 'gym' ? '.segmented__opt--active' : ''}`,
      { onClick: () => set('gym') }, '🏋️ Na academia'),
    h(`button.segmented__opt${plan.location === 'home' ? '.segmented__opt--active' : ''}`,
      { onClick: () => set('home') }, '🏠 Em casa'),
  );
}

/* ---------------------------- joelho ---------------------------- */

function kneeAlert(knee) {
  const variant = knee.level === 'caution' ? 'danger' : 'warn';
  return h(`section.card.card--${variant === 'danger' ? 'danger' : 'warn'}`,
    h('div.row.row--between',
      h('div.card__title', knee.level === 'caution' ? '⚠️ Cautela com o joelho hoje' : '🟡 Atenção ao joelho'),
      h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate('/joelho') }, 'Ver'),
    ),
    h('p.muted', { style: { marginTop: '8px' } }, knee.reason),
    ...knee.messages.map((m) => h('p.muted', { style: { fontSize: '13px' } }, m)),
    h('button.btn.btn--sm.btn--ghost.mt', { onClick: () => openKneeCheckSheet({ context: 'daily' }) }, 'Registrar como está agora'),
  );
}

/* ---------------------------- semana ---------------------------- */

async function weekStats(weekPlans, date) {
  const dates = weekDates(date);
  const range = await store.activityRange(dates[0], dates[6]);
  const doneStrength = range.sessions.filter((s) => s.status === 'done').length;
  const plannedStrength = weekPlans.filter((p) => p.blocks.some((b) => b.type === 'strength')).length;
  const totalMinutes = range.days.reduce((acc, d) => acc + (d.minutes || 0), 0);
  const promiseDays = range.days.filter((d) => d.promiseMet).length;

  return h('section.stack.stack--sm',
    sectionTitle('Esta semana'),
    h('div.grid-2',
      stat('Musculação', `${doneStrength}/${plannedStrength}`, 'sessões concluídas'),
      stat('Cardio', String(range.cardio.length), 'sessões'),
      stat('Futebol', String(range.football.length), 'partidas'),
      stat('Tempo total', formatMinutes(totalMinutes), `${promiseDays}/7 dias na promessa`),
    ),
    h('div.row', { style: { gap: '6px', marginTop: '2px' } },
      ...dates.map((d) => {
        const day = range.days.find((x) => x.date === d);
        const met = day?.promiseMet;
        const isToday = d === date;
        return h('div', {
          style: {
            flex: '1', textAlign: 'center', fontSize: '10.5px',
            color: isToday ? 'var(--text)' : 'var(--text-3)',
          },
        },
        h('div', { style: { fontSize: '15px' } }, met ? '🔥' : '·'),
        h('div', dayLabel(d).slice(0, 3)),
        );
      }),
    ),
  );
}

function stat(label, value, sub) {
  return h('div.stat',
    h('div.stat__label', label),
    h('div.stat__value', value),
    sub ? h('div.stat__sub', sub) : null,
  );
}

/* ---------------------------- corpo ---------------------------- */

function bodyCard(profile, measurement) {
  const weight = measurement?.weightKg ?? profile?.weightKg;
  const when = measurement?.date ? formatDate(measurement.date, 'full') : 'valor inicial do perfil';
  return h('section.card.clickable', { onClick: () => navigate('/fisico') },
    h('div.row.row--between',
      h('div',
        h('div.stat__label', 'Peso'),
        h('div.stat__value', kg(weight)),
        h('div.stat__sub', `Última atualização: ${when}`),
      ),
      h('div', { style: { textAlign: 'right' } },
        measurement?.waistCm ? h('div.stat__sub', `Cintura ${measurement.waistCm} cm`) : null,
        h('span.muted', 'Meu físico ›'),
      ),
    ),
  );
}

/**
 * Proteína e água do dia no Início.
 *
 * Só o essencial: os dois números que sustentam o treino. Caloria e macros
 * ficam na aba Comida — mostrar tudo aqui vira painel de dieta, que não é o
 * que este app é.
 */
function foodCard(totals, targets) {
  const pGoal = targets.protein.value;
  const wGoal = targets.water.value || 2500;
  const pPct = pGoal ? Math.min(100, Math.round((totals.protein / pGoal) * 100)) : 0;
  const wPct = Math.min(100, Math.round((totals.waterMl / wGoal) * 100));

  return h('div.card.clickable', { onClick: () => navigate('/alimentacao') },
    h('div.row.row--between',
      h('div.card__title', 'Alimentação de hoje'),
      h('span.list-item__sub', '›'),
    ),
    h('div.stack.stack--sm', { style: { marginTop: '10px' } },
      h('div',
        h('div.row.row--between',
          h('span.list-item__sub', '🥩 Proteína'),
          h('span.list-item__sub', pGoal ? `${totals.protein} / ${pGoal} g` : `${totals.protein} g`),
        ),
        h('div.bar', { style: { marginTop: '4px' } }, h('div.bar__fill', { style: { width: `${pPct}%` } })),
      ),
      h('div',
        h('div.row.row--between',
          h('span.list-item__sub', '💧 Água'),
          h('span.list-item__sub', `${(totals.waterMl / 1000).toFixed(1)} / ${(wGoal / 1000).toFixed(1)} L`),
        ),
        h('div.bar', { style: { marginTop: '4px' } },
          h('div.bar__fill.bar__fill--cardio', { style: { width: `${wPct}%` } })),
      ),
    ),
    !totals.itemCount && !totals.waterMl
      ? h('div.list-item__sub', { style: { marginTop: '8px' } }, 'Nada registrado ainda hoje — toque para começar.')
      : null,
  );
}
