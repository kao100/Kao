/** Suplementação (registro simples) e espaço de nutrição. */

import { h } from '../../core/dom.js';
import { refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, num } from '../../core/format.js';
import { uid } from '../../core/util.js';
import { page, topbar, sectionTitle, emptyState, safetyNote } from '../shell.js';
import { openSheet, confirmSheet, formSheet } from '../components/sheet.js';
import { lineChart } from '../components/chart.js';
import { toastOk } from '../components/toast.js';

export async function supplementsView() {
  const list = await store.supplements.all();

  return page(
    topbar({
      eyebrow: 'Apoio ao treino',
      title: 'Suplementação',
      showBack: true,
      backTo: '/mais',
      actions: [h('button.iconbtn', { onClick: () => editSupplement(null), 'aria-label': 'Adicionar' }, '＋')],
    }),

    list.length
      ? h('div.stack.stack--sm',
        ...list.map((s) => h('div.card.card--tight',
          h('div.row.row--between',
            h('div.grow',
              h('div.card__title', s.name),
              h('div.card__sub', [s.brand, s.dose].filter(Boolean).join(' · ')),
            ),
            s.active !== false ? h('span.pill.pill--ok', 'em uso') : h('span.pill', 'pausado'),
          ),
          s.schedule ? h('p.muted', { style: { marginTop: '8px', fontSize: '13.5px' } }, `⏰ ${s.schedule}`) : null,
          s.notes ? h('p.muted', { style: { fontSize: '13px' } }, s.notes) : null,
          h('div.btn-row.mt',
            h('button.btn.btn--sm.btn--ghost', { onClick: () => editSupplement(s) }, 'Editar'),
            h('button.btn.btn--sm.btn--quiet', {
              onClick: async () => { s.active = s.active === false; await store.supplements.save(s); refresh(); },
            }, s.active === false ? 'Retomar' : 'Pausar'),
            h('button.btn.btn--sm.btn--danger', {
              onClick: async () => {
                const ok = await confirmSheet({ title: 'Excluir suplemento?', danger: true, confirmLabel: 'Excluir' });
                if (ok) { await store.supplements.remove(s.id); refresh(); }
              },
            }, 'Excluir'),
          ),
        )),
      )
      : emptyState('💊', 'Nenhum suplemento cadastrado.'),

    safetyNote('O horário exato não é fator determinante: o que importa é a constância e o total diário de proteína. Este app é para treino natural e não recomenda esteroides, anabolizantes, SARMs, pró-hormonais nem "boosters" de testosterona.', 'info'),
  );
}

async function editSupplement(existing) {
  const data = await formSheet({
    title: existing ? 'Editar suplemento' : 'Novo suplemento',
    fields: [
      { key: 'name', label: 'Nome', value: existing?.name || '' },
      { key: 'brand', label: 'Marca', value: existing?.brand || '' },
      { key: 'dose', label: 'Dose', value: existing?.dose || '' },
      { key: 'schedule', label: 'Quando usar', value: existing?.schedule || '' },
      { key: 'notes', label: 'Observações', type: 'textarea', value: existing?.notes || '' },
    ],
  });
  if (!data?.name) return;
  await store.supplements.save({ id: existing?.id || uid('sup'), active: existing?.active !== false, ...data });
  toastOk('Suplemento salvo');
  refresh();
}

/* ------------------------------------------------------------------ */
/* Nutrição — estrutura pronta para registro futuro                     */
/* ------------------------------------------------------------------ */

export async function nutritionView() {
  const rows = (await store.nutrition.all()).sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = rows[0];

  return page(
    topbar({
      eyebrow: 'Apoio à recomposição',
      title: 'Nutrição',
      showBack: true,
      backTo: '/mais',
      actions: [h('button.iconbtn', { onClick: () => logNutrition(latest), 'aria-label': 'Registrar' }, '＋')],
    }),

    h('p.muted',
      'Este app não é um contador de dieta. O espaço abaixo existe para você registrar o essencial quando quiser: calorias, macros e água — o suficiente para acompanhar hipertrofia, força e recomposição.'),

    latest
      ? h('div.grid-2',
        stat('Calorias', latest.kcal != null ? String(latest.kcal) : '—', formatDate(latest.date, 'full')),
        stat('Proteína', latest.protein != null ? `${latest.protein} g` : '—', 'último registro'),
        stat('Carboidrato', latest.carbs != null ? `${latest.carbs} g` : '—', ''),
        stat('Gordura', latest.fat != null ? `${latest.fat} g` : '—', ''),
      )
      : emptyState('🍽️', 'Nenhum registro ainda.'),

    rows.length
      ? h('div.card',
        h('div.card__title', 'Proteína × data'),
        lineChart({
          points: rows.filter((r) => r.protein != null).map((r) => ({ date: r.date, value: r.protein })).reverse(),
          color: 'ball',
          formatValue: (v) => `${Math.round(v)}g`,
        }),
      )
      : null,

    rows.length
      ? h('div.stack.stack--sm',
        sectionTitle('Histórico'),
        h('div.list', ...rows.slice(0, 14).map((r) => h('div.list-item',
          h('div.grow',
            h('div.list-item__title', formatDate(r.date, 'full')),
            h('div.list-item__sub', [
              r.kcal != null ? `${r.kcal} kcal` : null,
              r.protein != null ? `P ${r.protein}g` : null,
              r.carbs != null ? `C ${r.carbs}g` : null,
              r.fat != null ? `G ${r.fat}g` : null,
              r.waterMl != null ? `💧 ${num(r.waterMl / 1000, 1)} L` : null,
            ].filter(Boolean).join(' · ')),
          ),
        ))),
      )
      : null,
  );
}

function stat(label, value, sub) {
  return h('div.stat', h('div.stat__label', label), h('div.stat__value', value), sub ? h('div.stat__sub', sub) : null);
}

async function logNutrition(latest) {
  const data = await formSheet({
    title: 'Registro do dia',
    intro: 'Preencha só o que quiser acompanhar.',
    fields: [
      { key: 'date', label: 'Data', type: 'date', value: today() },
      { key: 'kcal', label: 'Calorias', type: 'number', step: '1', value: '' },
      { key: 'protein', label: 'Proteína (g)', type: 'number', step: '1', value: '' },
      { key: 'carbs', label: 'Carboidrato (g)', type: 'number', step: '1', value: '' },
      { key: 'fat', label: 'Gordura (g)', type: 'number', step: '1', value: '' },
      { key: 'waterMl', label: 'Água (ml)', type: 'number', step: '50', value: '' },
      { key: 'notes', label: 'Observações', type: 'textarea', value: '' },
    ],
  });
  if (!data) return;
  await store.nutrition.save({ id: uid('nut'), ...data, date: data.date || today() });
  toastOk('Registro salvo');
  refresh();
}
