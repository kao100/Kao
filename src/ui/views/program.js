/** Programa semanal e edição dos treinos (nada é fixo no código). */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, dayKey, DAY_LABEL, DAY_KEYS, formatMinutes } from '../../core/format.js';
import { uid } from '../../core/util.js';
import { planForWeek } from '../../logic/planner.js';
import { page, topbar, sectionTitle, emptyState, safetyNote, menuRow } from '../shell.js';
import { openSheet, confirmSheet, formSheet } from '../components/sheet.js';
import { stepper, segmented, textInput } from '../components/inputs.js';
import { toastOk, toast } from '../components/toast.js';

/* ------------------------------------------------------------------ */
/* /programa                                                            */
/* ------------------------------------------------------------------ */

export async function programView() {
  const [weekPlans, templates, guidance] = await Promise.all([
    planForWeek(today()),
    store.templates.all(),
    store.activeMedicalGuidance(),
  ]);
  const todayKey = dayKey(today());

  return page(
    topbar({
      eyebrow: 'Treinamento híbrido',
      title: 'Programa',
      actions: [h('button.iconbtn', { onClick: () => createTemplate(), 'aria-label': 'Novo treino' }, '＋')],
    }),

    h('div.card.card--tight',
      h('div.card__title', 'Como o programa está montado'),
      h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } },
        'Musculação é o estímulo principal de hipertrofia e força. O cardio entra para condicionamento e controle de gordura, sempre DEPOIS da musculação quando estiverem na mesma sessão. O futebol cobre a parte de alta intensidade da semana — por isso não há HIIT extra.'),
    ),

    guidance
      ? safetyNote(`Orientações médicas de ${guidance.date} estão ativas e têm prioridade sobre o plano padrão.`, 'info')
      : null,

    h('div.stack.stack--sm',
      sectionTitle('Semana'),
      ...weekPlans.map((plan) => h(`div.weekrow${plan.dayKey === todayKey ? '.weekrow--today' : ''}`,
        h('div.weekrow__day', DAY_LABEL[plan.dayKey].slice(0, 3)),
        h('div.grow',
          h('div.weekrow__name', plan.blocks.map((b) => `${b.icon} ${b.title}`).join(' + ')),
          h('div.weekrow__sub', plan.blocks.map((b) => b.subtitle).filter(Boolean).join(' · ')),
        ),
      )),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Treinos na academia (editáveis)'),
      ...templateRows(templates.filter((t) => t.mode !== 'home')),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Treinos em casa (sem equipamento)'),
      h('p.muted', { style: { fontSize: '13px' } },
        'Versão de cada dia para quando não der para ir à academia: calistenia e peso do corpo, mantendo a mesma lógica de progressão. Ative pelo botão "🏠 Em casa" no card do treino de hoje.'),
      ...templateRows(templates.filter((t) => t.mode === 'home')),
    ),

    menuRow({ icon: '❤️', title: 'Planos de cardio', sub: 'Fases da esteira, velocidade e inclinação', to: '/cardio-planos' }),

    safetyNote('Lower A e Lower B são estruturas provisórias enquanto houver acompanhamento do joelho. Depois da consulta, cadastre as orientações em "Orientações médicas" e ajuste os exercícios aqui.'),
  );
}

function templateRows(list) {
  return list
    .sort((a, b) => DAY_KEYS.indexOf(a.dayKey) - DAY_KEYS.indexOf(b.dayKey) || (a.order || 0) - (b.order || 0))
    .map((tpl) => h('div.list-item.clickable', { onClick: () => navigate(`/programa/${tpl.id}`) },
      h('div.list-item__thumb', { style: { fontSize: '20px' } }, tpl.icon || '🏋️'),
      h('div.grow',
        h('div.list-item__title', tpl.name),
        h('div.list-item__sub', `${DAY_LABEL[tpl.dayKey]} · ${tpl.items?.length || 0} exercícios${tpl.cardioPlanId ? ' + cardio' : ''}`),
      ),
      tpl.provisional ? h('span.pill.pill--warn', 'provisório') : null,
      h('span.muted', '›'),
    ));
}

async function createTemplate() {
  const data = await formSheet({
    title: 'Novo treino',
    fields: [
      { key: 'name', label: 'Nome', value: '', placeholder: 'Ex.: Upper D' },
      { key: 'subtitle', label: 'Descrição', value: '', placeholder: 'Foco do treino' },
      {
        key: 'dayKey',
        label: 'Dia da semana',
        type: 'select',
        value: dayKey(today()),
        options: DAY_KEYS.map((k) => ({ value: k, label: DAY_LABEL[k] })),
      },
    ],
    submitLabel: 'Criar',
  });
  if (!data?.name) return;
  const tpl = await store.templates.save({
    id: uid('tpl'),
    name: data.name,
    subtitle: data.subtitle,
    dayKey: data.dayKey,
    kind: 'strength',
    accent: 'volt',
    icon: '🏋️',
    order: 3,
    items: [],
  });
  navigate(`/programa/${tpl.id}`);
}

/* ------------------------------------------------------------------ */
/* /programa/:templateId                                                */
/* ------------------------------------------------------------------ */

export async function templateEditView({ params }) {
  const tpl = await store.templates.byId(params.templateId);
  if (!tpl) return page(topbar({ title: 'Treino', showBack: true }), emptyState('🤔', 'Treino não encontrado.'));

  const [exMap, guidance, settings] = await Promise.all([
    store.exercises.map(),
    store.activeMedicalGuidance(),
    store.settings.get(),
  ]);

  const save = async () => { await store.templates.save(tpl); };

  const move = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= tpl.items.length) return;
    const [it] = tpl.items.splice(index, 1);
    tpl.items.splice(target, 0, it);
    await save();
    refresh();
  };

  const removeItem = async (index) => {
    const ok = await confirmSheet({ title: 'Remover exercício?', confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    tpl.items.splice(index, 1);
    await save();
    refresh();
  };

  return page(
    topbar({
      eyebrow: DAY_LABEL[tpl.dayKey],
      title: tpl.name,
      showBack: true,
      backTo: '/programa',
      actions: [h('button.iconbtn', { onClick: () => editTemplateMeta(tpl), 'aria-label': 'Editar' }, '✎')],
    }),

    tpl.subtitle ? h('p.muted', tpl.subtitle) : null,
    tpl.notes ? safetyNote(tpl.notes, 'info') : null,

    h('div.stack.stack--sm',
      sectionTitle('Exercícios', h('button.btn.btn--sm.btn--ghost', { onClick: () => addExercise(tpl) }, '＋ Adicionar')),
      tpl.items?.length
        ? h('div.list', ...tpl.items.map((it, i) => {
          const ex = exMap.get(it.exerciseId);
          const forbidden = (guidance?.forbiddenExerciseIds || []).includes(it.exerciseId);
          return h('div.card.card--tight',
            h('div.row.row--between',
              h('div.grow.clickable', { onClick: () => navigate(`/exercicio/${it.exerciseId}`) },
                h('div.list-item__title', `${i + 1}. ${ex?.namePt || it.exerciseId}`),
                h('div.list-item__sub', it.timeBased
                  ? `${it.sets} × ${it.durationSec}s · descanso ${it.restSec}s`
                  : `${it.sets} × ${it.repMin}–${it.repMax} · RIR ${it.rir ?? '—'} · descanso ${formatMinutes(it.restSec / 60)}`),
                forbidden ? h('span.pill.pill--danger', 'não liberado') : null,
                it.provisional ? h('span.pill.pill--warn', 'sujeito à avaliação') : null,
              ),
              h('div.row', { style: { gap: '4px' } },
                h('button.iconbtn', { onClick: () => move(i, -1), 'aria-label': 'Subir' }, '↑'),
                h('button.iconbtn', { onClick: () => move(i, 1), 'aria-label': 'Descer' }, '↓'),
              ),
            ),
            it.notes ? h('p.muted', { style: { fontSize: '12.5px', marginTop: '6px' } }, it.notes) : null,
            h('div.btn-row', { style: { marginTop: '10px' } },
              h('button.btn.btn--sm.btn--ghost', { onClick: () => editItem(tpl, i, exMap) }, 'Editar'),
              h('button.btn.btn--sm.btn--ghost', { onClick: () => swapItem(tpl, i) }, 'Trocar'),
              h('button.btn.btn--sm.btn--danger', { onClick: () => removeItem(i) }, 'Remover'),
            ),
          );
        }))
        : emptyState('➕', 'Nenhum exercício ainda.', h('button.btn.btn--primary', { onClick: () => addExercise(tpl) }, 'Adicionar exercício')),
    ),

    h('div.card.card--tight',
      h('div.card__title', 'Cardio ligado a este treino'),
      h('p.muted', { style: { fontSize: '13px', marginTop: '4px' } },
        tpl.cardioPlanId
          ? (settings?.cardioPlans || []).find((p) => p.id === tpl.cardioPlanId)?.name || tpl.cardioPlanId
          : 'Nenhum'),
      h('button.btn.btn--sm.btn--ghost.mt', { onClick: () => pickCardioPlan(tpl, settings) }, 'Alterar'),
    ),

    !tpl.builtin
      ? h('button.btn.btn--danger.btn--block', {
        onClick: async () => {
          const ok = await confirmSheet({ title: 'Excluir treino?', message: 'O histórico das sessões já realizadas é preservado.', confirmLabel: 'Excluir', danger: true });
          if (!ok) return;
          await store.templates.remove(tpl.id);
          navigate('/programa');
        },
      }, 'Excluir treino')
      : null,
  );
}

async function editTemplateMeta(tpl) {
  const data = await formSheet({
    title: 'Editar treino',
    fields: [
      { key: 'name', label: 'Nome', value: tpl.name },
      { key: 'subtitle', label: 'Descrição', value: tpl.subtitle || '' },
      { key: 'dayKey', label: 'Dia', type: 'select', value: tpl.dayKey, options: DAY_KEYS.map((k) => ({ value: k, label: DAY_LABEL[k] })) },
      { key: 'notes', label: 'Observações', type: 'textarea', value: tpl.notes || '' },
    ],
  });
  if (!data) return;
  Object.assign(tpl, data);
  await store.templates.save(tpl);
  toastOk('Treino atualizado');
  refresh();
}

async function addExercise(tpl) {
  const all = await store.exercises.all();
  openSheet({
    title: 'Adicionar exercício',
    content: (close) => {
      const search = h('input.input', { placeholder: 'Buscar…', type: 'search' });
      const list = h('div.list');
      const render = (term = '') => {
        const q = term.toLowerCase();
        list.replaceChildren(...all
          .filter((e) => `${e.namePt} ${e.nameEn} ${e.muscleGroup}`.toLowerCase().includes(q))
          .slice(0, 60)
          .map((ex) => h('button.list-item.clickable', {
            style: { width: '100%', textAlign: 'left' },
            onClick: async () => {
              tpl.items = tpl.items || [];
              tpl.items.push({
                exerciseId: ex.id,
                sets: 3,
                repMin: 8,
                repMax: 12,
                rir: 2,
                restSec: ex.defaultRest || 90,
                notes: '',
                timeBased: false,
                durationSec: null,
                provisional: Boolean(ex.needsMedicalReview),
              });
              await store.templates.save(tpl);
              close();
              toastOk(`${ex.namePt} adicionado`);
              refresh();
            },
          },
          h('div.grow',
            h('div.list-item__title', ex.namePt),
            h('div.list-item__sub', `${ex.muscleGroup} · ${ex.nameEn}`),
          ))));
      };
      search.addEventListener('input', (e) => render(e.target.value));
      render();
      return h('div.stack', search, list);
    },
  });
}

async function swapItem(tpl, index) {
  const all = await store.exercises.all();
  const map = new Map(all.map((e) => [e.id, e]));
  const current = tpl.items[index];
  const currentEx = map.get(current.exerciseId);
  const altIds = currentEx?.alternatives || [];
  const alternatives = altIds.map((id) => map.get(id)).filter(Boolean);

  openSheet({
    title: 'Trocar exercício',
    content: (close) => {
      const apply = async (ex) => {
        current.exerciseId = ex.id;
        current.provisional = Boolean(ex.needsMedicalReview);
        await store.templates.save(tpl);
        close();
        toastOk(`Trocado para ${ex.namePt}`);
        refresh();
      };
      const row = (ex, highlight = false) => h('button.list-item.clickable', {
        style: { width: '100%', textAlign: 'left', borderColor: highlight ? 'var(--volt-dim)' : undefined },
        onClick: () => apply(ex),
      },
      h('div.grow',
        h('div.list-item__title', ex.namePt),
        h('div.list-item__sub', `${ex.muscleGroup} · ${ex.atHome ? 'sem equipamento' : ex.nameEn}`),
      ),
      ex.kneeRisk === 'high' ? h('span.pill.pill--warn', 'joelho') : null);

      return h('div.stack.stack--sm',
        h('p.muted', 'A troca vale para todas as próximas sessões deste treino.'),
        alternatives.length ? h('div.field__label', 'Alternativas equivalentes') : null,
        ...alternatives.map((ex) => row(ex, true)),
        h('div.field__label', { style: { marginTop: '10px' } }, 'Todos os exercícios'),
        ...all.filter((e) => e.id !== current.exerciseId && !altIds.includes(e.id)).slice(0, 60).map((ex) => row(ex)),
      );
    },
  });
}

function editItem(tpl, index, exMap) {
  const it = tpl.items[index];
  const ex = exMap.get(it.exerciseId);
  openSheet({
    title: ex?.namePt || 'Exercício',
    content: (close) => {
      const sets = stepper({ value: it.sets, step: 1, min: 1, max: 10, unit: 'séries', decimals: 0 });
      const repMin = stepper({ value: it.repMin, step: 1, min: 1, max: 30, unit: 'min', decimals: 0 });
      const repMax = stepper({ value: it.repMax, step: 1, min: 1, max: 40, unit: 'max', decimals: 0 });
      const rir = stepper({ value: it.rir ?? 2, step: 1, min: 0, max: 5, unit: 'RIR', decimals: 0 });
      const rest = stepper({ value: it.restSec, step: 15, min: 0, max: 300, unit: 'seg', decimals: 0 });
      const dur = stepper({ value: it.durationSec ?? 40, step: 5, min: 5, max: 600, unit: 'seg', decimals: 0 });
      const mode = segmented({
        options: [{ value: 'reps', label: 'Repetições' }, { value: 'time', label: 'Tempo' }],
        value: it.timeBased ? 'time' : 'reps',
      });
      const notes = h('textarea.textarea', { rows: 2, placeholder: 'Observações (ajuste de banco, máquina preferida…)' });
      notes.value = it.notes || '';

      return h('div.stack',
        h('div.field', h('label.field__label', 'Tipo de série'), mode),
        h('div.field', h('label.field__label', 'Séries'), sets),
        h('div.grid-2',
          h('div.field', h('label.field__label', 'Rep. mínimas'), repMin),
          h('div.field', h('label.field__label', 'Rep. máximas'), repMax),
        ),
        h('div.field', h('label.field__label', 'Tempo por série (se por tempo)'), dur),
        h('div.grid-2',
          h('div.field', h('label.field__label', 'RIR alvo'), rir),
          h('div.field', h('label.field__label', 'Descanso'), rest),
        ),
        h('div.field', h('label.field__label', 'Observações'), notes),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            it.sets = sets.getValue();
            it.repMin = repMin.getValue();
            it.repMax = Math.max(repMax.getValue(), repMin.getValue());
            it.rir = rir.getValue();
            it.restSec = rest.getValue();
            it.timeBased = mode.getValue() === 'time';
            it.durationSec = dur.getValue();
            it.notes = notes.value;
            await store.templates.save(tpl);
            close();
            toastOk('Exercício atualizado');
            refresh();
          },
        }, 'Salvar'),
      );
    },
  });
}

function pickCardioPlan(tpl, settings) {
  const plans = settings?.cardioPlans || [];
  openSheet({
    title: 'Cardio do treino',
    content: (close) => h('div.stack.stack--sm',
      h('button.list-item.clickable', {
        style: { width: '100%', textAlign: 'left' },
        onClick: async () => { tpl.cardioPlanId = null; await store.templates.save(tpl); close(); refresh(); },
      }, h('div.grow', h('div.list-item__title', 'Nenhum'))),
      ...plans.map((p) => h('button.list-item.clickable', {
        style: { width: '100%', textAlign: 'left' },
        onClick: async () => { tpl.cardioPlanId = p.id; await store.templates.save(tpl); close(); toastOk('Cardio vinculado'); refresh(); },
      },
      h('div.grow',
        h('div.list-item__title', p.name),
        h('div.list-item__sub', `${p.totalMin} min · ${p.context || ''}`),
      ))),
    ),
  });
}

/* ------------------------------------------------------------------ */
/* /cardio-planos                                                       */
/* ------------------------------------------------------------------ */

export async function cardioPlansView() {
  const settings = (await store.settings.get()) || {};
  const plans = settings.cardioPlans || [];

  return page(
    topbar({ eyebrow: 'Esteira', title: 'Planos de cardio', showBack: true, backTo: '/programa' }),
    ...plans.map((plan) => h('div.card',
      h('div.row.row--between',
        h('div',
          h('div.card__title', plan.name),
          h('div.card__sub', `${plan.totalMin} min · RPE ${plan.rpe}`),
        ),
        h('button.btn.btn--sm.btn--cardio', { onClick: () => navigate(`/cardio/${plan.id}`) }, '▶'),
      ),
      h('div.phases', { style: { marginTop: '12px' } },
        ...plan.phases.map((ph, i) => h('div.phase',
          h('div.phase__win', `${String(ph.fromMin).padStart(2, '0')}:00–${String(ph.toMin).padStart(2, '0')}:00`),
          h('div.grow',
            h('div.phase__spec', ph.speedMin != null
              ? `${ph.speedMin}${ph.speedMax && ph.speedMax !== ph.speedMin ? `–${ph.speedMax}` : ''} km/h · ${ph.incline}%`
              : ph.label),
            h('div.phase__desc', ph.note || ''),
          ),
          h('button.iconbtn', { onClick: () => editPhase(settings, plan, i), 'aria-label': 'Editar fase' }, '✎'),
        )),
      ),
      h('p.muted', { style: { fontSize: '12.5px', marginTop: '10px' } }, plan.talkTest),
    )),
    safetyNote('Os números são ponto de partida. Ajuste pelo RPE e pelo talk test, não pela teimosia com o painel da esteira.', 'info'),
  );
}

async function editPhase(settings, plan, index) {
  const ph = plan.phases[index];
  const data = await formSheet({
    title: `${plan.name} — ${ph.label}`,
    fields: [
      { key: 'label', label: 'Nome da fase', value: ph.label },
      { key: 'fromMin', label: 'Início (min)', type: 'number', value: ph.fromMin, step: '1' },
      { key: 'toMin', label: 'Fim (min)', type: 'number', value: ph.toMin, step: '1' },
      { key: 'speedMin', label: 'Velocidade mínima (km/h)', type: 'number', value: ph.speedMin ?? '', step: '0.1' },
      { key: 'speedMax', label: 'Velocidade máxima (km/h)', type: 'number', value: ph.speedMax ?? '', step: '0.1' },
      { key: 'incline', label: 'Inclinação (%)', type: 'number', value: ph.incline ?? '', step: '0.5' },
      { key: 'note', label: 'Instrução', type: 'textarea', value: ph.note || '' },
    ],
  });
  if (!data) return;
  Object.assign(ph, data);
  plan.totalMin = Math.max(...plan.phases.map((p) => p.toMin));
  await store.settings.save({ cardioPlans: settings.cardioPlans });
  toastOk('Fase atualizada');
  refresh();
}
