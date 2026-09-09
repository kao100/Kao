/** Calendário mensal com ícones do que foi feito em cada dia. */

import { h } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, isoDate, parseDate, MONTHS, formatMinutes } from '../../core/format.js';
import { page, topbar, sectionTitle } from '../shell.js';

const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export async function calendarView({ query }) {
  const ref = query.m ? parseDate(`${query.m}-01`) : parseDate(today());
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const first = new Date(year, month, 1, 12);
  const last = new Date(year, month + 1, 0, 12);
  const range = await store.activityRange(isoDate(first), isoDate(last));

  const byDate = new Map();
  const touch = (d) => {
    if (!byDate.has(d)) byDate.set(d, { icons: new Set(), minutes: 0, promise: false });
    return byDate.get(d);
  };
  for (const s of range.sessions.filter((x) => x.status === 'done')) touch(s.date).icons.add('🏋️');
  for (const c of range.cardio) touch(c.date).icons.add(c.kind === 'recovery' ? '🧘' : '❤️');
  for (const f of range.football) touch(f.date).icons.add('⚽');
  for (const d of range.days) {
    const cell = touch(d.date);
    cell.minutes = d.minutes;
    cell.promise = d.promiseMet;
    for (const m of d.manual || []) {
      cell.icons.add(m.kind === 'walk' ? '🚶' : m.kind === 'recovery' ? '🧘' : m.kind === 'run' ? '🏃' : '⭐');
    }
  }

  const startOffset = (first.getDay() + 6) % 7; // segunda = 0
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(h('div'));
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = isoDate(new Date(year, month, day, 12));
    const info = byDate.get(date);
    const isToday = date === today();
    const isFuture = date > today();
    cells.push(h(`div.cal__day${isToday ? '.cal__day--today' : ''}${isFuture ? '.cal__day--future' : ''}`, {
      onClick: () => navigate(`/dia/${date}`),
    },
    h('div.cal__daynum', String(day)),
    h('div.cal__icons', ...[...(info?.icons || [])].slice(0, 3).map((i) => h('span', i))),
    info?.promise ? h('div.cal__flame', '🔥') : null,
    ));
  }

  const monthMinutes = range.days.reduce((acc, d) => acc + (d.minutes || 0), 0);
  const promiseDays = range.days.filter((d) => d.promiseMet).length;

  const shift = (delta) => {
    const target = new Date(year, month + delta, 1, 12);
    navigate(`/calendario?m=${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`);
  };

  return page(
    topbar({
      eyebrow: String(year),
      title: MONTHS[month],
      actions: [
        h('button.iconbtn', { onClick: () => shift(-1), 'aria-label': 'Mês anterior' }, '‹'),
        h('button.iconbtn', { onClick: () => shift(1), 'aria-label': 'Próximo mês' }, '›'),
      ],
    }),

    h('div.grid-2',
      h('div.stat', h('div.stat__label', 'Dias na promessa'), h('div.stat__value', `${promiseDays}/${last.getDate()}`)),
      h('div.stat', h('div.stat__label', 'Tempo no mês'), h('div.stat__value', formatMinutes(monthMinutes))),
    ),

    h('div',
      h('div.cal', ...DOW.map((d) => h('div.cal__dow', d))),
      h('div.cal', { style: { marginTop: '2px' } }, ...cells),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Legenda'),
      h('div.row.row--wrap', { style: { gap: '6px' } },
        h('span.pill', '🏋️ musculação'),
        h('span.pill', '❤️ cardio'),
        h('span.pill', '🚶 caminhada'),
        h('span.pill', '⚽ futebol'),
        h('span.pill', '🧘 recuperação'),
        h('span.pill', '🔥 promessa cumprida'),
      ),
    ),
  );
}
