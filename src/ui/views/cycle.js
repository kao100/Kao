/**
 * Ciclo de treino: em que semana do bloco você está, e o que rodar no próximo.
 *
 * A tela existe para responder a uma pergunta legítima ("não é ruim fazer
 * sempre o mesmo treino?") sem cair no erro oposto, que é trocar tudo toda
 * semana e nunca saber se você ficou mais forte.
 */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, addDays } from '../../core/format.js';
import { page, topbar, sectionTitle, safetyNote, emptyState } from '../shell.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { toastOk } from '../components/toast.js';
import {
  cycleState, startBlock, rotationSuggestions, phaseForWeek,
  DEFAULT_BLOCK_WEEKS, MIN_BLOCK_WEEKS, MAX_BLOCK_WEEKS, PHASE,
} from '../../logic/cycle.js';

export async function cycleView() {
  const state = await cycleState();

  return page(
    topbar({ eyebrow: 'Como o programa evolui', title: 'Ciclo de treino', showBack: true, backTo: '/programa' }),

    state.block ? currentBlock(state) : noBlock(),

    state.block && (state.finished || state.daysLeft <= 7)
      ? await rotationSection(state)
      : null,

    h('div.card',
      h('div.card__title', 'Por que blocos, e não trocar toda semana'),
      h('div.stack.stack--sm', { style: { marginTop: '10px' } },
        h('p.muted', { style: { fontSize: '14px' } },
          'O que faz músculo crescer é aumentar carga e volume ao longo do tempo — não novidade. Se o exercício muda toda semana, não dá para saber se você ficou mais forte nele, e é exatamente essa comparação que guia a progressão.'),
        h('p.muted', { style: { fontSize: '14px' } },
          'Mas variar tem três motivos reais: poupar a articulação de receber sempre o mesmo estresse no mesmo ponto, atingir porções diferentes do músculo com variantes do mesmo movimento, e não enjoar do treino.'),
        h('p.muted', { style: { fontSize: '14px' } },
          'A conciliação: o padrão do movimento fica (empurrar, puxar, dobrar o joelho, estender o quadril) e a variante gira a cada bloco. Seis a oito semanas dão tempo de a carga subir de verdade antes de mexer em qualquer coisa.'),
      ),
    ),

    h('div.card',
      h('div.card__title', 'As fases dentro de um bloco'),
      h('div.stack.stack--sm', { style: { marginTop: '10px' } },
        ...Object.values(PHASE).map((p) => h('div',
          h('div.list-item__title', p.label),
          h('div.list-item__sub', p.text),
        )),
      ),
    ),

    safetyNote('Rotação e deload são organização de treino, não tratamento. Se houver dor articular, quem decide o que fazer é o seu fisioterapeuta ou médico — o app só mostra o que você registrou.'),
  );
}

function noBlock() {
  return h('div.card',
    h('div.card__title', 'Nenhum bloco começado'),
    h('p.muted', { style: { fontSize: '14px', marginTop: '6px' } },
      'Um bloco é um período em que você mantém os mesmos exercícios e sobe a carga neles. Ao final, o app sugere o que girar — mantendo o padrão do movimento e respeitando o joelho.'),
    h('button.btn.btn--primary.btn--block.mt', { onClick: () => openStartSheet() }, 'Começar bloco 1'),
  );
}

function currentBlock(state) {
  const pct = Math.round((state.week / state.totalWeeks) * 100);
  const phase = state.phase || phaseForWeek(state.totalWeeks, state.totalWeeks);

  return h('div.card',
    h('div.row.row--between',
      h('div',
        h('div.card__title', `Bloco ${state.number}`),
        h('div.list-item__sub', `Semana ${state.week} de ${state.totalWeeks} · termina em ${formatDate(state.endDate, 'full')}`),
      ),
      state.finished ? h('span.pill.pill--warn', 'bloco encerrado') : h('span.pill.pill--volt', phase.short),
    ),

    h('div.bar', { style: { marginTop: '12px' } }, h('div.bar__fill', { style: { width: `${pct}%` } })),

    h('div', { style: { display: 'flex', gap: '3px', marginTop: '8px' } },
      ...Array.from({ length: state.totalWeeks }, (_, i) => {
        const wk = i + 1;
        const p = phaseForWeek(wk, state.totalWeeks);
        const done = wk < state.week;
        const now = wk === state.week && !state.finished;
        return h('div', {
          title: `Semana ${wk} — ${p.label}`,
          style: {
            flex: '1', height: '6px', borderRadius: '99px',
            background: now ? 'var(--volt)' : done ? 'var(--text-3)' : 'var(--line-soft)',
            opacity: p.id === 'deload' && !now ? '0.45' : '1',
          },
        });
      }),
    ),

    h('div.card.card--tight', { style: { marginTop: '12px' } },
      h('div.list-item__title', state.finished ? 'Bloco encerrado' : `${phase.label} — ${phase.short}`),
      h('div.list-item__sub', state.finished
        ? 'Hora de rever os exercícios e começar o próximo bloco.'
        : phase.text),
    ),

    h('div.btn-row.mt',
      state.finished
        ? h('button.btn.btn--primary.btn--block', { onClick: () => openStartSheet(state) }, `Começar bloco ${state.number + 1}`)
        : h('button.btn.btn--ghost.btn--block', { onClick: () => openStartSheet(state) }, 'Reiniciar / ajustar bloco'),
    ),
  );
}

async function rotationSection(state) {
  const rows = await rotationSuggestions();
  if (!rows.length) return null;

  const toChange = rows.filter((r) => !r.keep);
  const toKeep = rows.filter((r) => r.keep);

  return h('div.stack.stack--sm',
    sectionTitle(state.finished ? 'O que girar no próximo bloco' : 'Preparando o próximo bloco'),
    h('p.muted', { style: { fontSize: '13px', marginTop: '-4px' } },
      'Sugestões, não mudanças. Nada é trocado sem você mandar, e cada alternativa mantém o mesmo padrão de movimento — nenhuma sobe o risco para o joelho.'),

    ...toChange.slice(0, 8).map((row) => h('div.card.card--tight',
      h('div.row.row--between',
        h('div.grow',
          h('div.list-item__title', row.name),
          h('div.list-item__sub', row.templateName),
        ),
        row.priority === 0 ? h('span.pill.pill--warn', 'vale girar') : null,
      ),
      h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } }, row.reason),
      h('div.btn-row.mt', { style: { flexWrap: 'wrap' } },
        ...row.alternatives.map((alt) => h('button.btn.btn--sm.btn--ghost', {
          onClick: () => applySwap(row, alt),
        }, `→ ${alt.name}`)),
      ),
    )),

    toKeep.length
      ? h('div.card.card--tight',
        h('div.card__title', 'Estes eu não mexeria'),
        h('div.stack.stack--sm', { style: { marginTop: '8px' } },
          ...toKeep.map((r) => h('div',
            h('div.list-item__title', r.name),
            h('div.list-item__sub', r.reason),
          )),
        ),
      )
      : null,
  );
}

async function applySwap(row, alt) {
  const ok = await confirmSheet({
    title: `Trocar por ${alt.name}?`,
    message: `${row.name} sai do programa e ${alt.name} entra no lugar, com as mesmas séries e repetições. O histórico de ${row.name} continua salvo — se voltar a ele depois, as cargas antigas continuam lá.`,
    confirmLabel: 'Trocar',
  });
  if (!ok) return;

  const templates = await store.templates.all();
  let changed = 0;
  for (const tpl of templates) {
    if (tpl.archived || tpl.mode === 'home') continue;
    if (!(tpl.items || []).some((it) => it.exerciseId === row.exerciseId)) continue;
    const items = tpl.items.map((it) => (it.exerciseId === row.exerciseId ? { ...it, exerciseId: alt.id } : it));
    await store.templates.save({ ...tpl, items });
    changed += 1;
  }
  toastOk(changed ? `Trocado em ${changed} treino${changed === 1 ? '' : 's'}` : 'Nada para trocar');
  refresh();
}

function openStartSheet(state = null) {
  openSheet({
    title: state?.block ? 'Ajustar bloco' : 'Começar um bloco',
    content: (close) => {
      let weeks = state?.totalWeeks || DEFAULT_BLOCK_WEEKS;
      const value = h('div.stat__value', { style: { fontSize: '28px' } }, String(weeks));
      const hint = h('div.list-item__sub');
      const paint = () => {
        value.textContent = String(weeks);
        hint.textContent = weeks <= 5
          ? 'Curto: menos tempo para a carga subir antes de girar.'
          : weeks >= 9
            ? 'Longo: dá muita margem de progressão, mas cansa a mesma articulação por mais tempo.'
            : 'Faixa habitual: dá tempo de progredir carga e ainda gira antes de enjoar.';
      };
      paint();

      return h('div.stack',
        h('p.muted', { style: { fontSize: '14px' } },
          'A última semana do bloco é sempre leve (deload): mesmos exercícios, cerca de metade das séries e carga uns 10% menor.'),
        h('div.field',
          h('label.field__label', 'Semanas por bloco'),
          h('div.row', { style: { gap: '14px', alignItems: 'center' } },
            h('button.btn.btn--ghost', { onClick: () => { weeks = Math.max(MIN_BLOCK_WEEKS, weeks - 1); paint(); } }, '−'),
            value,
            h('button.btn.btn--ghost', { onClick: () => { weeks = Math.min(MAX_BLOCK_WEEKS, weeks + 1); paint(); } }, '＋'),
          ),
          hint,
        ),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            await startBlock({ weeks, date: today() });
            close();
            toastOk('Bloco iniciado');
            refresh();
          },
        }, state?.block && !state.finished ? 'Reiniciar a partir de hoje' : 'Começar'),
      );
    },
  });
}
