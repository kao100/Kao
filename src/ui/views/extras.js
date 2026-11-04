/**
 * Complementos: o bloco opcional do dia em que sobra tempo.
 *
 * Aparece no fim do treino e no card de hoje. Cada sugestão traz o motivo de
 * estar ali, e os bloqueados aparecem também, com o motivo de NÃO estarem —
 * "hoje não" é uma informação tão útil quanto "hoje sim", e esconder a razão
 * transforma o app numa caixa-preta.
 */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { uid } from '../../core/util.js';
import { today } from '../../core/format.js';
import { page, topbar, sectionTitle, safetyNote, emptyState } from '../shell.js';
import { openSheet } from '../components/sheet.js';
import { toastOk } from '../components/toast.js';
import { extrasForToday, HABIT_THRESHOLD } from '../../logic/extras.js';
import { extraById } from '../../data/extras.js';

/* ------------------------------------------------------------------ */
/* Tela /complementos                                                   */
/* ------------------------------------------------------------------ */

export async function extrasView({ query }) {
  const date = query.data || today();
  const report = await extrasForToday(date);

  return page(
    topbar({ eyebrow: 'Opcional, só para hoje', title: 'Complementos', showBack: true }),

    h('p.muted',
      'O treino do dia é o que progride e sustenta o programa. Isto aqui é o que cabe quando sobra tempo — entra hoje, some amanhã, e não mexe no programa.'),

    report.minutesLeft
      ? h('div.card.card--tight',
        h('div.list-item__title', `Sobram ~${report.minutesLeft} min no seu tempo de hoje`),
        h('div.list-item__sub', 'As opções abaixo estão ordenadas pelo que rende mais hoje.'))
      : null,

    report.habit ? habitCard(report.habit) : null,

    report.suggestions.length
      ? h('div.stack.stack--sm',
        sectionTitle('Cabe hoje'),
        ...report.suggestions.map((e) => extraCard(e, date)),
      )
      : emptyState('😴', 'Nada recomendado hoje.', h('p.muted', 'Descanso também faz parte.')),

    report.blocked.length
      ? h('div.stack.stack--sm',
        sectionTitle('Hoje não'),
        ...report.blocked.map((e) => h('div.card.card--tight',
          h('div.row.row--between',
            h('div.grow',
              h('div.list-item__title', { style: { opacity: '0.7' } }, `${e.icon} ${e.name}`),
              h('div.list-item__sub', e.reason),
            ),
          ),
        )),
      )
      : null,

    safetyNote('Complemento é para o dia em que sobra tempo e disposição. Fazer todo dia deixa de ser complemento e vira volume — e volume que o programa não enxerga é volume que a progressão não consegue ajustar.'),
  );
}

function habitCard(habit) {
  return h('div.card.card--accent',
    h('div.card__title', `"${habit.name}" já apareceu ${habit.count}× em 7 dias`),
    h('p.muted', { style: { fontSize: '14px', marginTop: '6px' } },
      `Isso deixou de ser complemento: virou parte do seu treino. O problema é que, como complemento, ele fica fora do programa — a progressão de carga não o enxerga e o ciclo de blocos não conta com ele. Se você quer mesmo fazer ${habit.count > HABIT_THRESHOLD ? 'toda semana' : 'sempre'}, o certo é promovê-lo a exercício fixo no dia que fizer sentido.`),
    h('button.btn.btn--ghost.btn--block.mt', { onClick: () => navigate('/programa') }, 'Abrir o programa para incluir'),
  );
}

function extraCard(extra, date) {
  return h('div.card',
    h('div.row.row--between',
      h('div.grow',
        h('div.list-item__title', `${extra.icon} ${extra.name}`),
        h('div.list-item__sub', `~${extra.minutes} min · ${extra.needs}`),
      ),
      extra.fitsTime ? null : h('span.pill.pill--warn', 'passa do tempo'),
    ),
    h('p.muted', { style: { fontSize: '13.5px', marginTop: '8px' } }, extra.reason),
    h('button.btn.btn--primary.btn--block.mt', { onClick: () => startExtra(extra.id, date) },
      extra.kind === 'cardio' ? '❤️ Começar' : '▶ Começar'),
  );
}

/* ------------------------------------------------------------------ */
/* Iniciar um complemento                                               */
/* ------------------------------------------------------------------ */

export async function startExtra(extraId, date = today()) {
  const extra = extraById(extraId);
  if (!extra) return;

  if (extra.kind === 'cardio') {
    navigate(`/cardio/${extra.cardioPlanId}?date=${date}&extra=${extra.id}`);
    return;
  }

  // Sessão própria, marcada como complemento. As séries são gravadas como
  // quaisquer outras: contam para volume, recordes e relatório semanal — o que
  // muda é que ela não pertence a nenhum template, então não interfere na
  // progressão programada nem no ciclo de blocos.
  const exMap = await store.exercises.map();
  const session = await store.sessions.save({
    id: uid('ses'),
    date,
    templateId: null,
    extraId: extra.id,
    name: extra.name,
    subtitle: 'Complemento do dia',
    status: 'active',
    startedAt: Date.now(),
    finishedAt: null,
    durationMin: 0,
    items: extra.items.map((it, i) => ({
      ...it,
      order: i,
      exerciseName: exMap.get(it.exerciseId)?.namePt || it.exerciseId,
      completedSets: 0,
      skipped: false,
    })),
    cursor: { itemIndex: 0, setIndex: 0 },
    notes: '',
  });
  navigate(`/treinar/${session.id}`);
}

/* ------------------------------------------------------------------ */
/* Bloco reaproveitável: fim de treino e card de hoje                   */
/* ------------------------------------------------------------------ */

/** Cartão compacto com as duas melhores opções e o link para a lista. */
export async function extrasPrompt(date = today(), { title = 'Sobrou tempo hoje?' } = {}) {
  const report = await extrasForToday(date);
  const top = report.suggestions.slice(0, 2);
  if (!top.length) return null;

  return h('div.card',
    h('div.row.row--between',
      h('div.card__title', title),
      report.minutesLeft ? h('span.list-item__sub', `~${report.minutesLeft} min livres`) : null,
    ),
    h('p.muted', { style: { fontSize: '13px', marginTop: '4px' } },
      'Opcional, só para hoje. O treino de amanhã não muda por causa disto.'),
    h('div.stack.stack--sm', { style: { marginTop: '10px' } },
      ...top.map((e) => h('button.list-item', {
        style: { width: '100%', textAlign: 'left', background: 'none', border: 'none' },
        onClick: () => startExtra(e.id, date),
      },
      h('div.grow',
        h('div.list-item__title', `${e.icon} ${e.name}`),
        h('div.list-item__sub', `~${e.minutes} min · ${e.reason}`),
      ),
      h('span.list-item__sub', '›'),
      )),
    ),
    h('button.btn.btn--ghost.btn--block.mt', { onClick: () => navigate(`/complementos?data=${date}`) },
      'Ver todas as opções'),
  );
}
