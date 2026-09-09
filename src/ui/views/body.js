/** "Meu físico": medidas, fotos e comparação antes × agora. */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, num, kg } from '../../core/format.js';
import { uid, resizeImage, pickFile } from '../../core/util.js';
import { page, topbar, sectionTitle, emptyState, safetyNote } from '../shell.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { numberInput, segmented } from '../components/inputs.js';
import { lineChart } from '../components/chart.js';
import { toastOk } from '../components/toast.js';

const MEASURE_FIELDS = [
  ['weightKg', 'Peso (kg)', 'kg'],
  ['waistCm', 'Cintura (cm)', 'cm'],
  ['abdomenCm', 'Circunferência abdominal (cm)', 'cm'],
  ['chestCm', 'Peito (cm)', 'cm'],
  ['armRightCm', 'Braço direito (cm)', 'cm'],
  ['armLeftCm', 'Braço esquerdo (cm)', 'cm'],
  ['thighRightCm', 'Coxa direita (cm)', 'cm'],
  ['thighLeftCm', 'Coxa esquerda (cm)', 'cm'],
  ['calfRightCm', 'Panturrilha direita (cm)', 'cm'],
  ['calfLeftCm', 'Panturrilha esquerda (cm)', 'cm'],
  ['hipCm', 'Quadril (cm)', 'cm'],
  ['shoulderCm', 'Ombros (cm)', 'cm'],
];

const POSES = [
  { value: 'front', label: 'Frente' },
  { value: 'side', label: 'Lado' },
  { value: 'back', label: 'Costas' },
];

export async function bodyView() {
  const [measurements, photos, profile] = await Promise.all([
    store.measurements.all(),
    store.photos.all(),
    store.profile.get(),
  ]);

  const sorted = measurements.sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sorted[0];
  const first = sorted.at(-1);

  const series = (key) => sorted
    .filter((m) => m[key] != null)
    .map((m) => ({ date: m.date, value: m[key] }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return page(
    topbar({
      eyebrow: 'Recomposição corporal',
      title: 'Meu físico',
      showBack: true,
      backTo: '/mais',
      actions: [h('button.iconbtn', { onClick: () => openMeasurementSheet(latest), 'aria-label': 'Nova medida' }, '＋')],
    }),

    h('div.card',
      h('div.row.row--between',
        h('div',
          h('div.stat__label', 'Peso atual'),
          h('div.stat__value', kg(latest?.weightKg ?? profile?.weightKg)),
          h('div.stat__sub', latest ? formatDate(latest.date, 'full') : 'valor inicial do perfil'),
        ),
        h('div', { style: { textAlign: 'right' } },
          h('div.stat__label', 'Cintura'),
          h('div.stat__value', latest?.waistCm ? `${num(latest.waistCm, 1)} cm` : '—'),
          first && latest && first.waistCm && latest.waistCm
            ? h('div.stat__sub', `${num(latest.waistCm - first.waistCm, 1)} cm desde o início`)
            : null,
        ),
      ),
      h('button.btn.btn--primary.btn--block.mt', { onClick: () => openMeasurementSheet(latest) }, '＋ Registrar medidas de hoje'),
    ),

    h('div.card',
      h('div.card__title', 'Peso × data'),
      lineChart({ points: series('weightKg'), color: 'cardio', formatValue: (v) => num(v, 1), emptyText: 'Sem registros de peso ainda.' }),
    ),
    h('div.card',
      h('div.card__title', 'Cintura × data'),
      lineChart({ points: series('waistCm'), color: 'ball', formatValue: (v) => num(v, 1), emptyText: 'Sem registros de cintura ainda.' }),
    ),

    safetyNote('Recomposição corporal não se mede só pela balança: acompanhe junto força, volume de treino, medidas, fotos e condicionamento. Peso estável com cintura caindo e cargas subindo é um ótimo sinal.', 'info'),

    /* medidas */
    h('div.stack.stack--sm',
      sectionTitle('Histórico de medidas'),
      sorted.length
        ? h('div.list', ...sorted.slice(0, 12).map((m) => h('div.list-item',
          h('div.grow',
            h('div.list-item__title', formatDate(m.date, 'full')),
            h('div.list-item__sub', MEASURE_FIELDS
              .filter(([key]) => m[key] != null)
              .map(([key, label, unit]) => `${label.split(' (')[0]} ${num(m[key], 1)}${unit === 'kg' ? ' kg' : ' cm'}`)
              .join(' · ') || 'sem valores'),
          ),
          h('button.iconbtn', {
            'aria-label': 'Remover',
            onClick: async () => {
              const ok = await confirmSheet({ title: 'Remover medida?', danger: true, confirmLabel: 'Remover' });
              if (ok) { await store.measurements.remove(m.id); refresh(); }
            },
          }, '🗑'),
        )))
        : emptyState('📏', 'Nenhuma medida registrada ainda.'),
    ),

    /* fotos */
    h('div.stack.stack--sm',
      sectionTitle('Fotos de progresso', h('button.btn.btn--sm.btn--ghost', { onClick: addPhoto }, '＋ Foto')),
      photos.length
        ? photoSection(photos)
        : emptyState('📸', 'Sem fotos ainda. Frente, lado e costas, sempre na mesma luz e distância, ajudam muito a enxergar a evolução.'),
    ),

    h('p.muted', { style: { fontSize: '12.5px' } },
      'O app não tenta estimar percentual de gordura por foto: isso não é confiável. As fotos servem para comparação visual ao longo do tempo.'),
  );
}

function photoSection(photos) {
  const sorted = photos.sort((a, b) => (a.date < b.date ? 1 : -1));
  const byPose = new Map(POSES.map((p) => [p.value, sorted.filter((x) => x.pose === p.value)]));

  return h('div.stack',
    ...POSES.map((pose) => {
      const list = byPose.get(pose.value) || [];
      if (!list.length) return null;
      const newest = list[0];
      const oldest = list.at(-1);
      return h('div.card.card--tight',
        h('div.card__title', pose.label),
        list.length > 1
          ? h('div.photo-compare', { style: { marginTop: '10px' } },
            h('figure', { style: { margin: 0 } },
              h('img', { src: oldest.photo, alt: `${pose.label} antes` , style: { borderRadius: '12px' } }),
              h('figcaption', `Antes · ${formatDate(oldest.date, 'full')}`),
            ),
            h('figure', { style: { margin: 0 } },
              h('img', { src: newest.photo, alt: `${pose.label} agora`, style: { borderRadius: '12px' } }),
              h('figcaption', `Agora · ${formatDate(newest.date, 'full')}`),
            ),
          )
          : h('img', { src: newest.photo, alt: pose.label, style: { borderRadius: '12px', marginTop: '10px' } }),
        h('div.photogrid', { style: { marginTop: '10px' } },
          ...list.slice(0, 9).map((p) => h('img', {
            src: p.photo,
            alt: formatDate(p.date, 'full'),
            onClick: () => openPhotoSheet(p),
          })),
        ),
      );
    }),
  );
}

function openPhotoSheet(photo) {
  openSheet({
    title: formatDate(photo.date, 'full'),
    content: (close) => h('div.stack',
      h('img', { src: photo.photo, style: { borderRadius: '14px' } }),
      photo.note ? h('p.muted', photo.note) : null,
      h('button.btn.btn--danger.btn--block', {
        onClick: async () => {
          const ok = await confirmSheet({ title: 'Excluir foto?', danger: true, confirmLabel: 'Excluir' });
          if (!ok) return;
          await store.photos.remove(photo.id);
          close();
          refresh();
        },
      }, 'Excluir foto'),
    ),
  });
}

async function addPhoto() {
  const file = await pickFile('image/*');
  if (!file) return;
  const dataUrl = await resizeImage(file, 1400, 0.82);
  openSheet({
    title: 'Nova foto de progresso',
    content: (close) => {
      const pose = segmented({ options: POSES, value: 'front' });
      const note = h('textarea.textarea', { rows: 2, placeholder: 'Observação (opcional)' });
      return h('div.stack',
        h('img', { src: dataUrl, style: { borderRadius: '14px', maxHeight: '46vh', objectFit: 'contain' } }),
        h('div.field', h('label.field__label', 'Pose'), pose),
        note,
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            await store.photos.save({
              id: uid('ph'),
              date: today(),
              pose: pose.getValue(),
              photo: dataUrl,
              note: note.value,
            });
            close();
            toastOk('Foto salva');
            refresh();
          },
        }, 'Salvar foto'),
      );
    },
  });
}

function openMeasurementSheet(latest) {
  openSheet({
    title: 'Medidas de hoje',
    content: (close) => {
      const inputs = {};
      const fields = MEASURE_FIELDS.map(([key, label]) => {
        const input = numberInput({ value: '', placeholder: latest?.[key] != null ? `anterior: ${num(latest[key], 1)}` : '', step: '0.1' });
        inputs[key] = input;
        return h('div.field', h('label.field__label', label), input);
      });
      const dateInput = h('input.input', { type: 'date', value: today() });
      const note = h('textarea.textarea', { rows: 2, placeholder: 'Observações (opcional)' });

      return h('div.stack',
        h('div.field', h('label.field__label', 'Data'), dateInput),
        h('p.muted', { style: { fontSize: '12.5px' } }, 'Preencha só o que quiser medir hoje — campos em branco são ignorados.'),
        ...fields,
        note,
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            const row = { id: uid('ms'), date: dateInput.value || today(), notes: note.value };
            let any = false;
            for (const [key, input] of Object.entries(inputs)) {
              if (input.value !== '') { row[key] = Number(input.value); any = true; }
            }
            if (!any) { close(); return; }
            await store.measurements.save(row);
            if (row.weightKg) await store.profile.save({ weightKg: row.weightKg });
            close();
            toastOk('Medidas salvas');
            refresh();
          },
        }, 'Salvar medidas'),
      );
    },
  });
}
