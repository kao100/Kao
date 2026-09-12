/** Suplementação: registro simples do que você usa. */

import { h } from '../../core/dom.js';
import { refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { uid } from '../../core/util.js';
import { page, topbar, emptyState, safetyNote } from '../shell.js';
import { openSheet, confirmSheet, formSheet } from '../components/sheet.js';
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
