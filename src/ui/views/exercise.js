/** Ficha completa do exercício — o "como faço isso?" do app. */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { num, formatDate, formatMinutes } from '../../core/format.js';
import { EQUIP_LABEL } from '../../data/exercises.js';
import { LICENSES, creditLine } from '../../data/media.js';
import { toastOk } from '../components/toast.js';
import { analyzeProgression, isIsolation, formatLastSets } from '../../logic/progression.js';
import { kneeStatus, exercisePermission } from '../../logic/knee.js';
import { openSheet } from '../components/sheet.js';
import { exerciseFigure, resolveExerciseMedia } from '../components/figure.js';
import { lineChart } from '../components/chart.js';
import { page, topbar, sectionTitle, safetyNote, emptyState } from '../shell.js';

/** Conteúdo da ficha (usado na folha e na página). */
export async function exerciseCardContent(exercise, { item = null, compact = false } = {}) {
  const [gymEquipment, settings, last, guidance, knee, history] = await Promise.all([
    store.equipment.byIndex('byExercise', exercise.id),
    store.settings.get(),
    store.lastPerformance(exercise.id),
    store.activeMedicalGuidance(),
    kneeStatus(),
    store.exerciseHistory(exercise.id),
  ]);

  const media = resolveExerciseMedia(exercise, gymEquipment);
  const permission = exercisePermission(exercise, guidance);
  const progression = item
    ? analyzeProgression({
      item, last, settings,
      isolation: isIsolation(exercise),
      kneeFlag: knee.avoidLoadIncrease ? { avoidLoadIncrease: true, reason: knee.reason } : null,
    })
    : null;

  return h('div.stack',
    h('div.exhead',
      h('div.exhead__names',
        h('div.exhead__pt', exercise.namePt),
        h('div.exhead__en', exercise.nameEn),
      ),
    ),

    h('div.row.row--wrap', { style: { gap: '6px' } },
      h('span.pill.pill--volt', exercise.muscleGroup),
      h('span.pill', EQUIP_LABEL[exercise.type] || exercise.type),
      ...(exercise.secondary || []).slice(0, 3).map((s) => h('span.pill', s)),
      exercise.kneeRisk === 'high' ? h('span.pill.pill--danger', 'exige do joelho') : null,
      exercise.kneeRisk === 'moderate' ? h('span.pill.pill--warn', 'atenção ao joelho') : null,
    ),

    permission.state === 'forbidden'
      ? safetyNote(`Não liberado nas suas orientações médicas. ${permission.note}`, 'danger')
      : permission.state === 'review'
        ? safetyNote(`Sujeito à avaliação do seu ortopedista/fisioterapeuta. ${permission.note}`, '')
        : permission.state === 'allowed'
          ? safetyNote(`Liberado pelo profissional. ${permission.note}`, 'info')
          : null,

    /* imagens */
    h('div.stack.stack--sm',
      exerciseFigure(exercise, media.equipment, { ratio: 'wide' }),
      exerciseFigure(exercise, media.execution, { ratio: 'wide' }),
      !compact ? h('div.btn-row',
        h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/academia?exercicio=${exercise.id}`) },
          media.myPhotos.length ? '📷 Minhas máquinas' : '📷 Foto da minha máquina'),
        h('button.btn.btn--sm.btn--ghost', { onClick: () => openMediaSheet(exercise) }, '🖼 Imagem externa'),
      ) : null,
      exercise.media?.length
        ? h('p.muted', { style: { fontSize: '11.5px' } },
          `Créditos: ${exercise.media.map((m) => creditLine(m)).join(' · ')}`)
        : null,
    ),

    /* como identificar */
    h('div.card.card--tight',
      h('div.card__title', 'Como identificar o equipamento'),
      h('p', { style: { marginTop: '6px' } }, exercise.identify),
      exercise.beginner ? h('p.dim', exercise.beginner) : null,
    ),

    /* carga atual (fora do treino) */
    !item && last ? h('div.card.card--tight',
      h('div.card__title', 'Sua carga atual'),
      h('div.kv', { style: { marginTop: '6px' } },
        kvRow('Última vez', `${formatDate(last.date, 'full')} — ${formatLastSets(last)}`),
        kvRow('Maior carga do dia', `${num(last.topWeight, 1)} kg`),
        kvRow('Repetições totais', String(last.totalReps)),
        kvRow('Volume da sessão', `${Math.round(last.volume)} kg`),
      ),
    ) : null,

    /* prescrição de hoje */
    item ? h('div.card.card--tight',
      h('div.card__title', 'Prescrição de hoje'),
      h('div.kv', { style: { marginTop: '6px' } },
        kvRow('Séries', String(item.sets)),
        kvRow('Repetições', item.timeBased ? `${item.durationSec}s por série` : `${item.repMin}–${item.repMax}`),
        kvRow('RIR alvo', item.rir == null ? '—' : String(item.rir)),
        kvRow('Descanso', item.restSec ? formatMinutes(item.restSec / 60) : '—'),
        kvRow('Última carga', last ? formatLastSets(last) : 'sem registro'),
        progression ? kvRow('Sugestão de hoje', progression.suggestedWeight != null ? `${num(progression.suggestedWeight, 1)} kg` : '—') : null,
      ),
      progression ? h('p.muted', { style: { fontSize: '13px' } }, progression.message) : null,
    ) : null,

    /* passo a passo */
    h('div.card.card--tight',
      h('div.card__title', 'Passo a passo'),
      h('ol.steps', { style: { marginTop: '10px' } }, ...exercise.steps.map((s) => h('li', s))),
    ),

    /* erros comuns */
    exercise.mistakes?.length ? h('div.card.card--tight',
      h('div.card__title', 'Erros comuns'),
      h('ul.mistakes', { style: { marginTop: '10px' } }, ...exercise.mistakes.map((m) => h('li', m))),
    ) : null,

    /* pegada e posicionamento */
    exercise.setup ? h('div.card.card--tight',
      h('div.card__title', 'Pegada e posicionamento'),
      h('p', { style: { marginTop: '6px' } }, exercise.setup.quick),
      h('div.kv', { style: { marginTop: '6px' } },
        kvRow('Qual barra / pegador', exercise.setup.bar),
        kvRow('Largura das mãos', exercise.setup.handWidth),
        kvRow('Cotovelos', exercise.setup.elbows),
        kvRow('Abdômen / tronco', exercise.setup.core),
      ),
      exercise.setup.variations?.length
        ? h('div', { style: { marginTop: '12px' } },
          h('div.field__label', 'O que muda em cada variação'),
          h('div.stack.stack--sm', { style: { marginTop: '8px' } },
            ...exercise.setup.variations.map((v) => h('div.list-item',
              h('div.grow',
                h('div.list-item__title', v.name),
                h('div.list-item__sub', v.changes),
                h('div.list-item__sub', { style: { color: 'var(--volt-dim)' } }, `Quando usar: ${v.when}`),
              ),
            )),
          ),
        )
        : null,
    ) : null,

    /* ajustes */
    h('div.card.card--tight',
      h('div.card__title', 'Ajustes e execução'),
      h('div.kv', { style: { marginTop: '4px' } },
        kvRow('Ajuste do banco', exercise.benchSetup),
        kvRow('Posição dos pés', exercise.feet),
        kvRow('Posição das mãos', exercise.hands),
        kvRow('Amplitude', exercise.rom),
        kvRow('Respiração', exercise.breathing),
      ),
    ),

    exercise.safety ? safetyNote(exercise.safety) : null,

    /* alternativas */
    await alternativesCard(exercise),

    exercise.variations?.length ? h('div.card.card--tight',
      h('div.card__title', 'Variações / máquinas equivalentes'),
      h('div.row.row--wrap', { style: { gap: '6px', marginTop: '8px' } },
        ...exercise.variations.map((v) => h('span.pill', v)),
      ),
    ) : null,

    /* histórico */
    !compact ? h('div.card.card--tight',
      h('div.card__title', 'Histórico de carga'),
      lineChart({
        points: history.map((hh) => ({ date: hh.date, value: hh.topWeight })),
        color: 'volt',
        formatValue: (v) => `${Math.round(v)}`,
        emptyText: 'Sem registros ainda — o gráfico aparece depois do primeiro treino.',
      }),
      history.length ? h('button.btn.btn--sm.btn--ghost.mt', {
        onClick: () => navigate(`/progresso/${exercise.id}`),
      }, 'Ver progressão completa') : null,
    ) : null,
  );
}

function kvRow(k, v) {
  if (!v) return null;
  return h('div.kv__row', h('div.kv__k', k), h('div.kv__v', v));
}

/**
 * Alternativas equivalentes — para quando o aparelho está ocupado, não existe
 * na sua academia, você está treinando em casa ou o exercício simplesmente não
 * é confortável para você (caso clássico do leg press).
 */
export async function alternativesCard(exercise) {
  const ids = exercise.alternatives || [];
  if (!ids.length) return null;

  const [exMap, guidance] = await Promise.all([store.exercises.map(), store.activeMedicalGuidance()]);
  const list = ids.map((id) => exMap.get(id)).filter(Boolean);
  if (!list.length) return null;

  const gym = list.filter((e) => !e.atHome);
  const home = list.filter((e) => e.atHome);

  const row = (ex) => {
    const permission = exercisePermission(ex, guidance);
    return h('div.list-item.clickable', { onClick: () => navigate(`/exercicio/${ex.id}`) },
      h('div.grow',
        h('div.list-item__title', ex.namePt),
        h('div.list-item__sub', `${ex.muscleGroup} · ${EQUIP_LABEL[ex.type] || ex.type}`),
      ),
      permission.state === 'forbidden' ? h('span.pill.pill--danger', 'não liberado') : null,
      ex.kneeRisk === 'high' ? h('span.pill.pill--warn', 'exige joelho') : null,
      h('span.muted', '›'),
    );
  };

  return h('div.card.card--tight',
    h('div.card__title', 'Alternativas para este exercício'),
    h('p.muted', { style: { fontSize: '13px', marginTop: '4px' } },
      'Use quando o aparelho estiver ocupado, não existir na sua academia ou este exercício não for confortável para você. Dá para trocar na hora, dentro do modo treino.'),
    gym.length ? h('div.stack.stack--sm', { style: { marginTop: '10px' } },
      h('div.field__label', 'Na academia'), ...gym.map(row)) : null,
    home.length ? h('div.stack.stack--sm', { style: { marginTop: '10px' } },
      h('div.field__label', 'Sem equipamento / em casa'), ...home.map(row)) : null,
    exercise.kneeRisk === 'moderate' || exercise.kneeRisk === 'high'
      ? h('p.muted', { style: { fontSize: '12.5px', marginTop: '10px' } },
        'As alternativas também exigem do joelho em graus diferentes — as marcadas como dominantes de quadril (ponte, stiff, elevação de quadril) costumam ser as mais leves para o tendão patelar. Confirme com seu ortopedista/fisioterapeuta.')
      : null,
  );
}

/**
 * Cadastro de imagem externa.
 * Só entra imagem que você tenha o direito de usar — por isso licença, crédito
 * e link da fonte são obrigatórios no formulário.
 */
function openMediaSheet(exercise) {
  openSheet({
    title: 'Imagem externa do exercício',
    content: (close) => {
      const url = h('input.input', { placeholder: 'URL da imagem (https://…)', type: 'url' });
      const sourceUrl = h('input.input', { placeholder: 'Página de origem', type: 'url' });
      const attribution = h('input.input', { placeholder: 'Crédito (autor / fabricante)' });
      const role = h('select.select', {},
        h('option', { value: 'execution' }, 'Execução do movimento'),
        h('option', { value: 'equipment' }, 'Equipamento'));
      const license = h('select.select', {},
        ...LICENSES.map((l) => h('option', { value: l.value }, l.label)));

      const existing = exercise.media?.length
        ? h('div.stack.stack--sm',
          h('div.field__label', 'Imagens cadastradas'),
          ...exercise.media.map((m, i) => h('div.list-item',
            h('div.grow',
              h('div.list-item__title', m.role === 'equipment' ? 'Equipamento' : 'Execução'),
              h('div.list-item__sub', creditLine(m)),
            ),
            h('button.iconbtn', {
              onClick: async () => {
                exercise.media.splice(i, 1);
                await store.exercises.save(exercise);
                close();
                refresh();
              },
            }, '🗑'),
          )),
        )
        : null;

      return h('div.stack',
        h('p.muted', { style: { fontSize: '13px' } },
          'Use apenas imagens que você pode usar legalmente: material do fabricante, banco licenciado, Wikimedia Commons ou foto própria. Se a imagem sair do ar, o app volta automaticamente para a ilustração do próprio app.'),
        existing,
        h('div.field', h('label.field__label', 'Tipo'), role),
        h('div.field', h('label.field__label', 'URL da imagem'), url),
        h('div.field', h('label.field__label', 'Fonte (página de origem)'), sourceUrl),
        h('div.field', h('label.field__label', 'Crédito / atribuição'), attribution),
        h('div.field', h('label.field__label', 'Licença'), license),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            if (!url.value) { close(); return; }
            exercise.media = [...(exercise.media || []).filter((m) => m.role !== role.value), {
              role: role.value,
              url: url.value,
              sourceUrl: sourceUrl.value,
              attribution: attribution.value,
              license: license.value,
              addedAt: Date.now(),
            }];
            await store.exercises.save(exercise);
            close();
            toastOk('Imagem cadastrada com licença e crédito');
            refresh();
          },
        }, 'Salvar imagem'),
      );
    },
  });
}

/** Abre a ficha em uma folha (usado dentro do modo treino). */
export async function exerciseSheet(exercise, { item = null } = {}) {
  if (!exercise) return;
  const content = await exerciseCardContent(exercise, { item, compact: true });
  openSheet({ title: exercise.namePt, content: () => content });
}

/** Rota /exercicio/:id */
export async function exerciseView({ params }) {
  const exercise = await store.exercises.byId(params.id);
  if (!exercise) {
    return page(topbar({ title: 'Exercício', showBack: true }), emptyState('🤔', 'Exercício não encontrado.'));
  }
  return page(
    topbar({ eyebrow: exercise.muscleGroup, title: exercise.namePt, showBack: true }),
    await exerciseCardContent(exercise),
  );
}

/** Rota /biblioteca */
export async function libraryView() {
  const [all, gymEquipment] = await Promise.all([store.exercises.all(), store.equipment.all()]);
  const { exerciseThumb } = await import('../components/figure.js');

  const search = h('input.input', { placeholder: 'Buscar exercício (português ou inglês)…', type: 'search' });
  const listWrap = h('div.list');

  const render = (term = '') => {
    const q = term.toLowerCase().trim();
    const filtered = all.filter((e) => `${e.namePt} ${e.nameEn} ${e.muscleGroup} ${(e.aliases || []).join(' ')}`.toLowerCase().includes(q));
    const byGroup = new Map();
    for (const ex of filtered) {
      if (!byGroup.has(ex.muscleGroup)) byGroup.set(ex.muscleGroup, []);
      byGroup.get(ex.muscleGroup).push(ex);
    }
    listWrap.replaceChildren(
      ...[...byGroup.entries()].flatMap(([group, list]) => [
        h('div.section-title', { style: { marginTop: '8px' } }, group),
        ...list.map((ex) => h('div.list-item.clickable', { onClick: () => navigate(`/exercicio/${ex.id}`) },
          exerciseThumb(ex, gymEquipment),
          h('div.grow',
            h('div.list-item__title', ex.namePt),
            h('div.list-item__sub', ex.nameEn),
          ),
          ex.needsMedicalReview ? h('span.pill.pill--warn', 'joelho') : null,
          h('span.muted', '›'),
        )),
      ]),
      filtered.length ? null : emptyState('🔍', 'Nenhum exercício encontrado.'),
    );
  };

  search.addEventListener('input', (e) => render(e.target.value));
  render();

  return page(
    topbar({ eyebrow: `${all.length} exercícios`, title: 'Biblioteca', showBack: true, backTo: '/mais' }),
    search,
    listWrap,
  );
}
