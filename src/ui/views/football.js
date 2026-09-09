/** Registro do futebol society. */

import { h } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, formatMinutes } from '../../core/format.js';
import { uid } from '../../core/util.js';
import { page, topbar, safetyNote, sectionTitle } from '../shell.js';
import { stepper, scale, textInput, numberInput } from '../components/inputs.js';
import { toastOk } from '../components/toast.js';
import { openKneeCheckSheet } from './knee.js';
import { exerciseFigure } from '../components/figure.js';
import { illustration } from '../../data/illustrations.js';

export async function footballView({ query }) {
  const date = query.date || today();
  const [existing, pains, exercise] = await Promise.all([
    store.football.byDate(date),
    store.painLogs.byDate(date),
    store.exercises.byId('football-society'),
  ]);

  const kneeBefore = pains.find((p) => p.context === 'pre-football');
  const kneeAfter = pains.find((p) => p.context === 'post-football');

  const durationInput = stepper({ value: existing[0]?.durationMin ?? 60, step: 5, min: 10, max: 240, unit: 'min', decimals: 0 });
  const rpeCtl = scale({ from: 1, to: 10, value: existing[0]?.rpe ?? 7, labels: ['leve', 'máximo'] });
  const goalsInput = numberInput({ value: existing[0]?.goals ?? '', placeholder: 'opcional', step: '1' });
  const distanceInput = numberInput({ value: existing[0]?.distanceKm ?? '', placeholder: 'opcional (km)', step: '0.1' });
  const caloriesInput = numberInput({ value: existing[0]?.calories ?? '', placeholder: 'opcional (kcal)', step: '1' });
  const notes = h('textarea.textarea', { rows: 2, placeholder: 'Como foi o jogo? (opcional)' });
  if (existing[0]?.notes) notes.value = existing[0].notes;

  const save = async () => {
    const durationMin = durationInput.getValue();
    await store.football.save({
      id: existing[0]?.id || uid('fb'),
      date,
      durationMin,
      rpe: rpeCtl.getValue(),
      goals: goalsInput.value ? Number(goalsInput.value) : null,
      distanceKm: distanceInput.value ? Number(distanceInput.value) : null,
      calories: caloriesInput.value ? Number(caloriesInput.value) : null,
      kneeBefore: kneeBefore?.score ?? null,
      kneeAfter: kneeAfter?.score ?? null,
      notes: notes.value,
    });
    await store.dayPlan.set(date, { football: true });
    const day = await store.recomputeDay(date);
    toastOk(day.promiseMet
      ? `Futebol salvo · ${formatMinutes(day.minutes)} hoje · 🔥 promessa cumprida`
      : 'Futebol salvo');
    navigate('/');
  };

  return page(
    topbar({ eyebrow: formatDate(date, 'long'), title: '⚽ Futebol society', showBack: true }),

    exercise ? exerciseFigure(exercise, { kind: 'svg', svg: illustration('football', { athlete: true }), caption: 'Sessão de futebol' }, { ratio: 'wide' }) : null,

    h('div.card.card--tight',
      h('div.card__title', 'Antes de entrar em campo'),
      h('div.stack.stack--sm', { style: { marginTop: '10px' } },
        h('div.report-line',
          h('span', 'Dor no joelho esquerdo (antes)'),
          h('span.report-line__v', kneeBefore ? `${kneeBefore.score}/10` : '—'),
        ),
        h('button.btn.btn--sm.btn--ghost.btn--block', {
          onClick: () => openKneeCheckSheet({ context: 'pre-football', date }),
        }, kneeBefore ? 'Atualizar check do joelho' : 'Registrar como o joelho está'),
      ),
      safetyNote('Faça alguns minutos de aquecimento antes do jogo: caminhada, trote leve e mobilidade sem dor.'),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Dados da partida'),
      h('div.field', h('label.field__label', 'Duração'), durationInput),
      h('div.field', h('label.field__label', 'Intensidade percebida (RPE)'), rpeCtl),
      h('div.grid-2',
        h('div.field', h('label.field__label', 'Gols'), goalsInput),
        h('div.field', h('label.field__label', 'Distância'), distanceInput),
      ),
      h('div.field', h('label.field__label', 'Calorias'), caloriesInput),
      notes,
    ),

    h('div.card.card--tight',
      h('div.card__title', 'Depois do jogo'),
      h('div.report-line',
        h('span', 'Dor no joelho esquerdo (depois)'),
        h('span.report-line__v', kneeAfter ? `${kneeAfter.score}/10` : '—'),
      ),
      h('button.btn.btn--sm.btn--ghost.btn--block', {
        onClick: () => openKneeCheckSheet({ context: 'post-football', date }),
      }, kneeAfter ? 'Atualizar check pós-jogo' : 'Registrar como o joelho ficou'),
    ),

    h('button.btn.btn--ball.btn--lg.btn--block', { onClick: save }, '✓ Salvar futebol'),

    h('p.muted', { style: { fontSize: '12.5px' } },
      'O futebol conta automaticamente para a promessa do dia quando durar 30 minutos ou mais.'),
  );
}
