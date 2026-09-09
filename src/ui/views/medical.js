/**
 * Orientações médicas.
 *
 * O que você registrar aqui tem PRIORIDADE sobre o plano padrão do app:
 * exercícios marcados como não liberados aparecem sinalizados no treino e na
 * ficha do exercício.
 *
 * O app não cria diagnóstico nem protocolo de reabilitação — ele só guarda e
 * aplica o que o seu ortopedista/fisioterapeuta orientou.
 */

import { h } from '../../core/dom.js';
import { refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate } from '../../core/format.js';
import { uid } from '../../core/util.js';
import { page, topbar, sectionTitle, emptyState, safetyNote } from '../shell.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { toastOk } from '../components/toast.js';

export async function medicalView() {
  const [records, exercises, settings] = await Promise.all([
    store.medical.all(),
    store.exercises.all(),
    store.settings.get(),
  ]);
  const sorted = records.sort((a, b) => (a.date < b.date ? 1 : -1));
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  return page(
    topbar({
      eyebrow: 'Prioridade sobre o plano padrão',
      title: 'Orientações médicas',
      showBack: true,
      backTo: '/mais',
      actions: [h('button.iconbtn', { onClick: () => openGuidanceSheet(null, exercises), 'aria-label': 'Nova orientação' }, '＋')],
    }),

    settings?.nextAppointment
      ? h('div.card.card--tight',
        h('div.card__title', '🩺 Próxima consulta'),
        h('p.muted', { style: { marginTop: '6px' } },
          `${formatDate(settings.nextAppointment, 'full')} — ${settings.appointmentNote || 'retorno'}`),
        h('button.btn.btn--sm.btn--ghost.mt', { onClick: () => editAppointment(settings) }, 'Alterar data'),
      )
      : null,

    safetyNote('Depois da consulta, registre aqui o que o profissional falou: diagnóstico, o que está liberado, o que evitar e por quanto tempo. O app passa a respeitar essas orientações no lugar do plano padrão.', 'info'),

    sorted.length
      ? h('div.stack.stack--sm',
        sectionTitle('Registros'),
        ...sorted.map((rec) => h('div.card',
          h('div.row.row--between',
            h('div',
              h('div.card__title', rec.professional || 'Profissional'),
              h('div.card__sub', formatDate(rec.date, 'full')),
            ),
            rec.active !== false ? h('span.pill.pill--ok', 'ativa') : h('span.pill', 'arquivada'),
          ),
          rec.diagnosis ? kv('Diagnóstico / avaliação', rec.diagnosis) : null,
          rec.allowedExerciseIds?.length
            ? kv('Liberado', rec.allowedExerciseIds.map((id) => exMap.get(id)?.namePt || id).join(', '))
            : null,
          rec.forbiddenExerciseIds?.length
            ? kv('Evitar / proibido', rec.forbiddenExerciseIds.map((id) => exMap.get(id)?.namePt || id).join(', '))
            : null,
          rec.limits ? kv('Limites', rec.limits) : null,
          rec.guidance ? kv('Orientações', rec.guidance) : null,
          rec.physioNotes ? kv('Fisioterapia', rec.physioNotes) : null,
          h('div.btn-row.mt',
            h('button.btn.btn--sm.btn--ghost', { onClick: () => openGuidanceSheet(rec, exercises) }, 'Editar'),
            h('button.btn.btn--sm.btn--quiet', {
              onClick: async () => { rec.active = rec.active === false; await store.medical.save(rec); refresh(); },
            }, rec.active === false ? 'Reativar' : 'Arquivar'),
            h('button.btn.btn--sm.btn--danger', {
              onClick: async () => {
                const ok = await confirmSheet({ title: 'Excluir orientação?', danger: true, confirmLabel: 'Excluir' });
                if (ok) { await store.medical.remove(rec.id); refresh(); }
              },
            }, 'Excluir'),
          ),
        )),
      )
      : emptyState('🩺', 'Nenhuma orientação registrada ainda.'),
  );
}

function kv(label, value) {
  return h('div', { style: { marginTop: '10px' } },
    h('div.field__label', label),
    h('p', { style: { margin: '2px 0 0' } }, value),
  );
}

function openGuidanceSheet(existing, exercises) {
  openSheet({
    title: existing ? 'Editar orientação' : 'Nova orientação médica',
    content: (close) => {
      const date = h('input.input', { type: 'date', value: existing?.date || today() });
      const professional = h('input.input', { placeholder: 'Ex.: Dr(a). — ortopedista' });
      professional.value = existing?.professional || '';
      const diagnosis = h('textarea.textarea', { rows: 2, placeholder: 'O que foi identificado na avaliação' });
      diagnosis.value = existing?.diagnosis || '';
      const limits = h('textarea.textarea', { rows: 2, placeholder: 'Ex.: amplitude, carga máxima, frequência, tempo de retorno ao futebol' });
      limits.value = existing?.limits || '';
      const guidance = h('textarea.textarea', { rows: 3, placeholder: 'Orientações do ortopedista' });
      guidance.value = existing?.guidance || '';
      const physio = h('textarea.textarea', { rows: 3, placeholder: 'Orientações do fisioterapeuta' });
      physio.value = existing?.physioNotes || '';

      const allowed = new Set(existing?.allowedExerciseIds || []);
      const forbidden = new Set(existing?.forbiddenExerciseIds || []);

      const exerciseList = h('div.stack.stack--sm',
        ...exercises
          .filter((e) => ['Quadríceps', 'Posterior de coxa', 'Glúteos', 'Panturrilha', 'Corpo inteiro'].includes(e.muscleGroup) || e.needsMedicalReview)
          .map((ex) => {
            const row = h('div.list-item');
            const btnAllow = h('button.btn.btn--sm', { class: allowed.has(ex.id) ? 'btn--primary' : 'btn--ghost' }, '✓');
            const btnForbid = h('button.btn.btn--sm', { class: forbidden.has(ex.id) ? 'btn--danger' : 'btn--ghost' }, '✕');
            btnAllow.addEventListener('click', () => {
              forbidden.delete(ex.id);
              if (allowed.has(ex.id)) allowed.delete(ex.id); else allowed.add(ex.id);
              btnAllow.className = `btn btn--sm ${allowed.has(ex.id) ? 'btn--primary' : 'btn--ghost'}`;
              btnForbid.className = `btn btn--sm ${forbidden.has(ex.id) ? 'btn--danger' : 'btn--ghost'}`;
            });
            btnForbid.addEventListener('click', () => {
              allowed.delete(ex.id);
              if (forbidden.has(ex.id)) forbidden.delete(ex.id); else forbidden.add(ex.id);
              btnAllow.className = `btn btn--sm ${allowed.has(ex.id) ? 'btn--primary' : 'btn--ghost'}`;
              btnForbid.className = `btn btn--sm ${forbidden.has(ex.id) ? 'btn--danger' : 'btn--ghost'}`;
            });
            row.append(
              h('div.grow', h('div.list-item__title', ex.namePt), h('div.list-item__sub', ex.muscleGroup)),
              h('div.row', { style: { gap: '6px' } }, btnAllow, btnForbid),
            );
            return row;
          }),
      );

      return h('div.stack',
        h('div.field', h('label.field__label', 'Data da consulta'), date),
        h('div.field', h('label.field__label', 'Profissional'), professional),
        h('div.field', h('label.field__label', 'Diagnóstico / avaliação'), diagnosis),
        h('div.field', h('label.field__label', 'Exercícios: ✓ liberado · ✕ evitar'), exerciseList),
        h('div.field', h('label.field__label', 'Limites'), limits),
        h('div.field', h('label.field__label', 'Orientações do ortopedista'), guidance),
        h('div.field', h('label.field__label', 'Orientações do fisioterapeuta'), physio),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            await store.medical.save({
              id: existing?.id || uid('med'),
              date: date.value || today(),
              professional: professional.value,
              diagnosis: diagnosis.value,
              limits: limits.value,
              guidance: guidance.value,
              physioNotes: physio.value,
              allowedExerciseIds: [...allowed],
              forbiddenExerciseIds: [...forbidden],
              active: existing?.active !== false,
            });
            close();
            toastOk('Orientação salva — o plano passa a respeitá-la');
            refresh();
          },
        }, 'Salvar orientação'),
      );
    },
  });
}

function editAppointment(settings) {
  openSheet({
    title: 'Próxima consulta',
    content: (close) => {
      const date = h('input.input', { type: 'date', value: settings?.nextAppointment || today() });
      const note = h('input.input', { placeholder: 'Observação' });
      note.value = settings?.appointmentNote || '';
      return h('div.stack',
        h('div.field', h('label.field__label', 'Data'), date),
        h('div.field', h('label.field__label', 'Observação'), note),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            await store.settings.save({ nextAppointment: date.value, appointmentNote: note.value });
            close();
            toastOk('Consulta atualizada');
            refresh();
          },
        }, 'Salvar'),
      );
    },
  });
}
