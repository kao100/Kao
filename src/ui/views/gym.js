/**
 * "Minha academia": fotos reais das máquinas, associadas aos exercícios.
 * A foto cadastrada aqui substitui a ilustração genérica na ficha e no modo treino.
 */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { uid, resizeImage, pickFile } from '../../core/util.js';
import { page, topbar, sectionTitle, emptyState } from '../shell.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { toastOk } from '../components/toast.js';

export async function gymView({ query }) {
  const [equipment, exercises] = await Promise.all([store.equipment.all(), store.exercises.all()]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  if (query.exercicio) {
    // atalho vindo da ficha do exercício
    setTimeout(() => addEquipment(exercises, query.exercicio), 60);
  }

  return page(
    topbar({
      eyebrow: `${equipment.length} equipamento(s)`,
      title: 'Minha academia',
      showBack: true,
      backTo: '/mais',
      actions: [h('button.iconbtn', { onClick: () => addEquipment(exercises), 'aria-label': 'Adicionar' }, '＋')],
    }),

    h('p.muted',
      'Tire uma foto de cada aparelho da sua academia e associe ao exercício. Assim, durante o treino você vê a máquina de verdade, não um desenho genérico.'),

    equipment.length
      ? h('div.stack.stack--sm',
        sectionTitle('Equipamentos'),
        ...equipment.map((eq) => h('div.card.card--tight',
          h('img', { src: eq.photo, alt: eq.model || 'Máquina', style: { borderRadius: '12px', maxHeight: '220px', objectFit: 'cover', width: '100%' } }),
          h('div.row.row--between', { style: { marginTop: '10px' } },
            h('div.grow',
              h('div.list-item__title', exMap.get(eq.exerciseId)?.namePt || 'Sem exercício associado'),
              h('div.list-item__sub', [eq.brand, eq.model].filter(Boolean).join(' ') || 'marca/modelo não informados'),
              eq.note ? h('div.list-item__sub', eq.note) : null,
            ),
            eq.useAsPrimary ? h('span.pill.pill--volt', 'principal') : null,
          ),
          h('div.btn-row.mt',
            h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/exercicio/${eq.exerciseId}`) }, 'Ver exercício'),
            h('button.btn.btn--sm.btn--ghost', { onClick: () => editEquipment(eq, exercises) }, 'Editar'),
            h('button.btn.btn--sm.btn--danger', {
              onClick: async () => {
                const ok = await confirmSheet({ title: 'Excluir equipamento?', danger: true, confirmLabel: 'Excluir' });
                if (ok) { await store.equipment.remove(eq.id); refresh(); }
              },
            }, 'Excluir'),
          ),
        )),
      )
      : emptyState('📷', 'Nenhuma máquina cadastrada ainda.',
        h('button.btn.btn--primary', { onClick: () => addEquipment(exercises) }, 'Adicionar primeira máquina')),
  );
}

async function addEquipment(exercises, preselectedExerciseId = null) {
  const file = await pickFile('image/*');
  if (!file) return;
  const dataUrl = await resizeImage(file, 1400, 0.82);
  openEquipmentSheet({ photo: dataUrl, exerciseId: preselectedExerciseId }, exercises, false);
}

function editEquipment(eq, exercises) {
  openEquipmentSheet(eq, exercises, true);
}

function openEquipmentSheet(eq, exercises, isEdit) {
  openSheet({
    title: isEdit ? 'Editar equipamento' : 'Nova máquina',
    content: (close) => {
      const select = h('select.select', {},
        h('option', { value: '' }, 'Selecione o exercício…'),
        ...exercises.map((ex) => h('option', { value: ex.id, selected: ex.id === eq.exerciseId }, `${ex.namePt} (${ex.nameEn})`)),
      );
      const brand = h('input.input', { placeholder: 'Marca (ex.: Movement, Life Fitness)' });
      brand.value = eq.brand || '';
      const model = h('input.input', { placeholder: 'Modelo / identificação' });
      model.value = eq.model || '';
      const note = h('textarea.textarea', { rows: 2, placeholder: 'Onde fica na academia, ajustes que você usa…' });
      note.value = eq.note || '';
      const primary = h('input', { type: 'checkbox', checked: eq.useAsPrimary !== false, style: { width: '22px', height: '22px' } });

      return h('div.stack',
        eq.photo ? h('img', { src: eq.photo, style: { borderRadius: '14px', maxHeight: '40vh', objectFit: 'contain' } }) : null,
        h('div.field', h('label.field__label', 'Exercício'), select),
        h('div.field', h('label.field__label', 'Marca'), brand),
        h('div.field', h('label.field__label', 'Modelo'), model),
        h('div.field', h('label.field__label', 'Observações'), note),
        h('div.switch-row',
          h('div', h('div.list-item__title', 'Usar como imagem principal'),
            h('div.list-item__sub', 'Substitui a ilustração genérica deste exercício')),
          primary,
        ),
        isEdit
          ? h('button.btn.btn--ghost.btn--block', {
            onClick: async () => {
              const file = await pickFile('image/*');
              if (!file) return;
              eq.photo = await resizeImage(file, 1400, 0.82);
              await store.equipment.save(eq);
              close();
              toastOk('Foto atualizada');
              refresh();
            },
          }, '📷 Trocar foto')
          : null,
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            if (!select.value) { close(); return; }
            await store.equipment.save({
              id: eq.id || uid('eq'),
              exerciseId: select.value,
              photo: eq.photo,
              brand: brand.value,
              model: model.value,
              note: note.value,
              useAsPrimary: primary.checked,
            });
            close();
            toastOk('Máquina salva');
            refresh();
          },
        }, 'Salvar'),
      );
    },
  });
}
