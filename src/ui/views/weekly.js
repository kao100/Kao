/** Resumo da semana. */

import { h } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import { today, addDays, weekStart, formatDate, formatMinutes, num, signed, kg } from '../../core/format.js';
import { weeklySummary } from '../../logic/report.js';
import { recentDays, averageOfLogged, targetsFor } from '../../logic/nutrition.js';
import { PAIN_CONTEXTS } from '../../logic/knee.js';
import { page, topbar, sectionTitle, safetyNote, emptyState } from '../shell.js';

export async function weeklyView({ query }) {
  const ref = query.w || today();
  const summary = await weeklySummary(ref);
  const start = weekStart(ref);
  const [foodWeek, foodTargets] = await Promise.all([recentDays(7, addDays(start, 6)), targetsFor(ref)]);

  return page(
    topbar({
      eyebrow: summary.label,
      title: 'Resumo da semana',
      showBack: true,
      actions: [
        h('button.iconbtn', { onClick: () => navigate(`/semana?w=${addDays(start, -7)}`), 'aria-label': 'Semana anterior' }, '‹'),
        addDays(start, 7) <= today()
          ? h('button.iconbtn', { onClick: () => navigate(`/semana?w=${addDays(start, 7)}`), 'aria-label': 'Próxima semana' }, '›')
          : null,
      ].filter(Boolean),
    }),

    h('div.card',
      h('div.stack.stack--sm',
        line('Treinos de musculação', String(summary.strengthCount)),
        line('Futebol', `${summary.footballCount} (${formatMinutes(summary.footballMinutes)})`),
        line('Cardio', `${summary.cardioCount} (${formatMinutes(summary.cardioMinutes)})`),
        line('Minutos de atividade', formatMinutes(summary.totalMinutes)),
        line('Promessa dos 30 min', `${summary.promiseDays}/7 dias`),
        line('Volume de musculação', `${Math.round(summary.volume)} kg`,
          summary.prevVolume ? deltaLabel(summary.volumeDelta, ' kg') : null),
      ),
    ),

    foodSection(foodWeek, foodTargets),

    h('div.stack.stack--sm',
      sectionTitle('Progressos'),
      summary.exerciseProgress.length
        ? h('div.list', ...summary.exerciseProgress.map((row) => h('div.list-item',
          h('div.grow',
            h('div.list-item__title', row.name),
            h('div.list-item__sub', row.text),
          ),
          h('span', { class: row.kind === 'up' ? 'delta-up' : row.kind === 'down' ? 'delta-down' : 'delta-flat' },
            row.kind === 'up' ? (row.topWeight > (row.prevTop ?? 0) ? '🏆' : '▲') : row.kind === 'down' ? '▼' : row.kind === 'new' ? '✦' : '='),
        )))
        : emptyState('📈', 'Nenhuma série registrada nesta semana.'),
    ),

    h('div.card',
      h('div.card__title', 'Joelho esquerdo'),
      h('div.stack.stack--sm', { style: { marginTop: '8px' } },
        line('Registros', String(summary.pain.count)),
        line('Média da dor', summary.pain.avg != null ? `${num(summary.pain.avg, 1)}/10` : '—'),
        line('Maior dor', summary.pain.max != null
          ? `${summary.pain.max}/10${summary.pain.maxContext ? ` · ${PAIN_CONTEXTS[summary.pain.maxContext] || summary.pain.maxContext}` : ''}`
          : '—'),
      ),
      h('button.btn.btn--sm.btn--ghost.mt', { onClick: () => navigate('/joelho') }, 'Ver histórico completo'),
    ),

    h('div.card',
      h('div.card__title', 'Corpo'),
      h('div.stack.stack--sm', { style: { marginTop: '8px' } },
        line('Peso', summary.weight.to != null
          ? `${kg(summary.weight.from)} → ${kg(summary.weight.to)}`
          : '—', summary.weight.delta != null ? deltaLabel(summary.weight.delta, ' kg', true) : null),
        line('Cintura', summary.waist.to != null
          ? `${num(summary.waist.from, 1)} → ${num(summary.waist.to, 1)} cm`
          : '—', summary.waist.delta != null ? deltaLabel(summary.waist.delta, ' cm', true) : null),
      ),
    ),

    h('div.card.card--tight',
      h('div.card__title', 'Observações'),
      ...summary.notes.map((n) => h('p.muted', { style: { fontSize: '13.5px', marginTop: '6px' } }, `• ${n}`)),
    ),

    safetyNote('Resumo gerado só a partir do que você registrou. Não substitui avaliação médica ou de fisioterapia.'),
  );
}

function line(label, value, extra = null) {
  return h('div.report-line',
    h('span', label),
    h('span.report-line__v', value, extra ? h('span', { style: { marginLeft: '8px' } }, extra) : null),
  );
}

function deltaLabel(delta, unit, invertColors = false) {
  if (delta == null || delta === 0) return h('span.delta-flat', '=');
  const positive = delta > 0;
  const good = invertColors ? !positive : positive;
  return h('span', { class: good ? 'delta-up' : 'delta-down' }, signed(delta, 1, unit));
}

/**
 * Alimentação da semana.
 *
 * Só aparece se houve registro: quem não anotou não precisa de um cartão
 * dizendo que não anotou. A média ignora dias em branco, porque "não registrei"
 * não é "comi zero grama de proteína".
 */
function foodSection(days, targets) {
  const logged = days.filter((d) => d.itemCount > 0 || d.waterMl > 0);
  if (!logged.length) return null;

  const avgProtein = averageOfLogged(days, 'protein');
  const goal = targets.protein.value;
  const hitDays = goal ? days.filter((d) => d.itemCount > 0 && d.protein >= goal).length : 0;
  const avgWater = Math.round(logged.reduce((s, d) => s + d.waterMl, 0) / logged.length);

  return h('div.stack.stack--sm',
    sectionTitle('Alimentação'),
    h('div.card',
      h('div.stack.stack--sm',
        line('Dias com registro', `${logged.length}/7`),
        avgProtein != null
          ? line('Média de proteína', `${avgProtein} g${goal ? ` (meta ${goal} g)` : ''}`)
          : null,
        goal ? line('Dias que bateram a meta', `${hitDays}/${logged.length} registrados`) : null,
        line('Média de água', `${(avgWater / 1000).toFixed(1)} L`),
      ),
    ),
  );
}
