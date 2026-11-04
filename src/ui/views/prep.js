/**
 * ANTES DE COMEÇAR — a preparação dentro do modo treino.
 *
 * Três estados, guardados na própria sessão (dá para sair e voltar):
 *   pending  → resumo: "TREINO DE PERNAS — 60 MIN · PREPARAÇÃO — 10 MIN"
 *   running  → uma etapa por vez, com imagens, instruções e cronômetro
 *   complete → "PREPARAÇÃO CONCLUÍDA" + INICIAR MUSCULAÇÃO
 *
 * As séries preparatórias são marcadas aqui e ficam na sessão; não entram
 * como séries do treino, então não mexem em volume, recordes nem progressão.
 */

import { h, haptic, svgFromString } from '../../core/dom.js';
import * as store from '../../core/store.js';
import { mmss, num } from '../../core/format.js';
import { unlockAudio, beepDone, beepPhase } from '../../core/audio.js';
import { illustration } from '../../data/illustrations.js';
import { FOCUS_LABEL } from '../../logic/warmup.js';
import { safetyNote } from '../shell.js';
import { confirmSheet } from '../components/sheet.js';

const KIND_LABEL = {
  cardio: 'Aquecimento cardiovascular',
  mobility: 'Mobilidade dinâmica',
  activation: 'Ativação muscular',
  ramp: 'Séries preparatórias',
};

const KIND_ICON = { cardio: '🚴', mobility: '🔄', activation: '⚡', ramp: '📶' };

export function prepTitle(session) {
  const prep = session.prep;
  const budget = session.budgetMin ? ` — ${session.budgetMin} MIN` : '';
  if (prep?.focus?.region === 'lower') return `TREINO DE PERNAS${budget}`;
  const a = FOCUS_LABEL[prep?.focus?.emphasis];
  const b = FOCUS_LABEL[prep?.focus?.secondary];
  const label = [a, b].filter(Boolean).join(' e ').toUpperCase();
  return `${(session.name || 'TREINO').toUpperCase()}${label ? ` · ${label}` : ''}${budget}`;
}

/** A sessão ainda está na etapa de preparação? */
export function inPrep(session, setsCount = 0) {
  return Boolean(session.prep) && setsCount === 0
    && ['pending', 'running', 'complete'].includes(session.prep.status);
}

export function stopPrepTimer(state) {
  clearInterval(state.prepTimer);
  state.prepTimer = null;
}

export function renderPrep(state, ctx, { onExit } = {}) {
  const { session } = state;
  const prep = session.prep;
  if (prep.status === 'complete') return completeView(state, ctx);
  if (prep.status === 'running') return stepView(state, ctx, { onExit });
  return overviewView(state, ctx, { onExit });
}

/* ---------------------------- resumo ---------------------------- */

function overviewView(state, ctx, { onExit }) {
  const { session } = state;
  const prep = session.prep;
  const alloc = session.alloc;

  const start = async () => {
    unlockAudio();
    prep.status = 'running';
    prep.stepIndex = 0;
    prep.startedAt = Date.now();
    prep.stepEndsAt = Date.now() + prep.steps[0].seconds * 1000;
    prep.paused = false;
    await store.sessions.save(session);
    ctx.rerender();
  };

  const skip = async () => {
    const ok = await confirmSheet({
      title: 'Pular a preparação?',
      message: 'Se você já aqueceu (por exemplo, veio de outra atividade), tudo bem. Se não, entrar frio no primeiro exercício pesado é o que mais costuma dar errado — principalmente no joelho.',
      confirmLabel: 'Pular mesmo assim',
    });
    if (!ok) return;
    prep.status = 'skipped';
    prep.finishedAt = Date.now();
    await store.sessions.save(session);
    ctx.rerender();
  };

  return h('div.stack.prep',
    topRow(onExit),
    h('div.prep__kicker', 'ANTES DE COMEÇAR'),
    h('div.prep__title', prepTitle(session)),
    h('div.prep__sub', `PREPARAÇÃO — ${prep.minutes} MIN`),

    h('ol.prep__steps',
      ...prep.steps.map((st) => h('li',
        h('span.prep__stepicon', KIND_ICON[st.kind] || '•'),
        h('span.grow', `${st.short || st.title} — ${minutesText(st.minutes)}.`),
      )),
    ),

    alloc?.segments?.length ? allocationStrip(alloc) : null,

    ...(prep.notes || []).map((n) => safetyNote(capitalize(n), 'info')),

    h('p.muted', { style: { fontSize: '13px' } },
      'Tudo dinâmico: sem alongamento estático longo antes da musculação. Amplitude sempre confortável — o aquecimento prepara o joelho para a carga, não testa a dor.'),

    h('button.btn.btn--primary.btn--lg.btn--block', { onClick: start }, '▶  INICIAR PREPARAÇÃO'),
    h('button.btn.btn--quiet.btn--block', { onClick: skip }, 'Já estou aquecido — pular'),
  );
}

/* ---------------------------- etapa ---------------------------- */

function stepView(state, ctx, { onExit }) {
  const { session } = state;
  const prep = session.prep;
  const i = Math.min(prep.stepIndex || 0, prep.steps.length - 1);
  const step = prep.steps[i];
  const isLast = i === prep.steps.length - 1;
  prep.rampDone ||= {};

  const remaining = () => (prep.paused ? prep.pausedRemaining : (prep.stepEndsAt - Date.now()) / 1000);

  stopPrepTimer(state);
  state.prepTimer = setInterval(() => {
    const left = remaining();
    const el = document.getElementById('prep-time');
    const bar = document.getElementById('prep-bar');
    if (!el) { stopPrepTimer(state); return; }
    el.textContent = mmss(Math.max(0, left));
    el.classList.toggle('rest__time--over', left <= 0);
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, (left / step.seconds) * 100))}%`;
    if (left <= 0 && !prep.beeped) {
      prep.beeped = true;
      beepDone();
      haptic([25, 60, 25]);
      const hint = document.getElementById('prep-done-hint');
      if (hint) hint.hidden = false;
    }
  }, 250);

  const goTo = async (index) => {
    stopPrepTimer(state);
    if (index >= prep.steps.length) {
      prep.status = 'complete';
      prep.finishedAt = Date.now();
    } else {
      prep.stepIndex = Math.max(0, index);
      prep.stepEndsAt = Date.now() + prep.steps[prep.stepIndex].seconds * 1000;
      prep.paused = false;
      prep.beeped = false;
      if (index > i) beepPhase();
    }
    await store.sessions.save(session);
    ctx.rerender();
  };

  const togglePause = async () => {
    if (prep.paused) {
      prep.stepEndsAt = Date.now() + (prep.pausedRemaining || 0) * 1000;
      prep.paused = false;
    } else {
      prep.pausedRemaining = Math.max(0, remaining());
      prep.paused = true;
    }
    await store.sessions.save(session);
    ctx.rerender();
  };

  const add30 = async () => {
    if (prep.paused) prep.pausedRemaining = (prep.pausedRemaining || 0) + 30;
    else prep.stepEndsAt = Math.max(Date.now(), prep.stepEndsAt) + 30000;
    prep.beeped = false;
    await store.sessions.save(session);
    ctx.rerender();
  };

  const left = Math.max(0, remaining());
  const overall = Math.round((i / prep.steps.length) * 100);

  return h('div.stack.prep',
    h('div.trainer__top',
      h('button.iconbtn', { onClick: onExit, 'aria-label': 'Sair' }, '✕'),
      h('div.trainer__progress',
        h('div.row.row--between', { style: { fontSize: '12px', color: 'var(--text-3)', marginBottom: '4px' } },
          h('span', 'Preparação'),
          h('span.num', `${i + 1}/${prep.steps.length}`),
        ),
        h('div.bar', h('div.bar__fill.bar__fill--flame', { style: { width: `${overall}%` } })),
      ),
      h('span', { style: { width: '44px' } }),
    ),

    h('div',
      h('div.prep__kicker', `ETAPA ${i + 1} — ${(KIND_LABEL[step.kind] || '').toUpperCase()}`),
      h('div.trainer__exname', step.title),
    ),

    h('div.prep-timer',
      h('div#prep-time.rest__time', mmss(left)),
      h('div.bar.rest__bar', h('div#prep-bar.bar__fill.bar__fill--flame', { style: { width: `${Math.max(0, Math.min(100, (left / step.seconds) * 100))}%` } })),
      h('div#prep-done-hint.prep-timer__hint', { hidden: left > 0 }, '⏱ Tempo da etapa concluído — siga quando estiver pronto.'),
      h('div.btn-row', { style: { marginTop: '10px' } },
        h('button.btn.btn--sm.btn--ghost', { onClick: togglePause }, prep.paused ? '▶ Continuar' : '⏸ Pausar'),
        h('button.btn.btn--sm.btn--ghost', { onClick: add30 }, '+30s'),
      ),
    ),

    step.goal ? h('p.muted', { style: { fontSize: '13.5px' } }, step.goal) : null,

    ...(step.drills || []).map(drillCard),

    ...(step.ramps || []).map((ramp, ri) => rampCard(ramp, ri, prep, session, ctx)),

    h('button.btn.btn--primary.btn--lg.btn--block', { onClick: () => goTo(i + 1) },
      isLast ? '✓  CONCLUIR PREPARAÇÃO' : `Próxima etapa ›  ${prep.steps[i + 1].short || prep.steps[i + 1].title}`),
    h('div.btn-row',
      h('button.btn.btn--sm.btn--quiet', { disabled: i === 0, onClick: () => goTo(i - 1) }, '‹ Etapa anterior'),
      h('button.btn.btn--sm.btn--quiet', {
        onClick: async () => { stopPrepTimer(state); prep.status = 'complete'; prep.finishedAt = Date.now(); await store.sessions.save(session); ctx.rerender(); },
      }, 'Encerrar preparação'),
    ),
  );
}

function drillCard(d) {
  return h('div.card.card--tight.drill',
    h('div.drill__fig', svgFromString(illustration(d.illustration))),
    h('div.drill__body',
      h('div.row.row--between',
        h('div.card__title', d.name),
      ),
      d.dose ? h('div.pill', { style: { marginTop: '4px' } }, d.dose) : null,
      h('ol.steps', { style: { marginTop: '8px' } }, ...(d.how || []).map((t) => h('li', t))),
      d.knee ? h('div.safety', { style: { marginTop: '6px' } }, `🦵 ${d.knee}`) : null,
    ),
  );
}

function rampCard(ramp, ri, prep, session, ctx) {
  return h('div.card.card--tight',
    h('div.card__title', ramp.exerciseName),
    h('p.muted', { style: { fontSize: '12.5px', margin: '4px 0 8px' } }, ramp.note),
    h('div.stack.stack--sm',
      ...ramp.sets.map((s, si) => {
        const key = `${ri}-${si}`;
        const done = Boolean(prep.rampDone[key]);
        const what = s.seconds ? `${s.seconds} s` : s.weight != null ? `${num(s.weight, 1)} kg × ${s.reps}` : `${s.label} × ${s.reps}`;
        return h(`button.ramp-row${done ? '.ramp-row--done' : ''}`, {
          onClick: async () => {
            prep.rampDone[key] = !done;
            haptic(10);
            await store.sessions.save(session);
            ctx.rerender();
          },
        },
        h('span.ramp-row__check', done ? '✓' : String(si + 1)),
        h('span.grow', what),
        s.weight != null && s.label ? h('span.muted', s.label) : null,
        );
      }),
    ),
  );
}

/* ---------------------------- concluída ---------------------------- */

function completeView(state, ctx) {
  const { session } = state;
  const prep = session.prep;
  const took = prep.startedAt && prep.finishedAt ? Math.max(1, Math.round((prep.finishedAt - prep.startedAt) / 60000)) : prep.minutes;
  const strength = session.alloc?.segments?.find((s) => s.key === 'strength');

  return h('div.stack.stack--lg.prep', { style: { paddingTop: '24px' } },
    h('div.done-hero',
      h('div.done-hero__check', '✅'),
      h('div.done-hero__title', 'PREPARAÇÃO CONCLUÍDA'),
      h('p.muted', `${took} min de preparação${strength ? ` · agora ~${strength.minutes} min de musculação` : ''}`),
    ),
    h('p.muted', { style: { fontSize: '13.5px', textAlign: 'center' } },
      'Primeira série com a carga de trabalho. Se algo doeu no aquecimento, registre na série e mantenha a carga conservadora hoje.'),
    h('button.btn.btn--primary.btn--lg.btn--block', {
      onClick: async () => {
        prep.status = 'done';
        await store.sessions.save(session);
        ctx.rerender();
      },
    }, '🏋️  INICIAR MUSCULAÇÃO'),
  );
}

/* ---------------------------- partes ---------------------------- */

function topRow(onExit) {
  return h('div.row.row--between',
    h('button.iconbtn', { onClick: onExit, 'aria-label': 'Sair' }, '✕'),
    h('span'),
  );
}

/** Faixa com a divisão do tempo do dia. */
export function allocationStrip(alloc) {
  const total = alloc.segments.reduce((s, x) => s + x.minutes, 0) || 1;
  const color = { prep: 'flame', strength: 'volt', cardio: 'cardio', 'cardio-optional': 'cardio', finish: 'recover', free: 'line' };
  return h('div.alloc',
    h('div.alloc__bar',
      ...alloc.segments.map((s) => h('div.alloc__seg', {
        style: {
          flex: `${s.minutes} 0 0`,
          background: `var(--${color[s.key] || 'line'})`,
          opacity: s.optional ? 0.45 : 1,
        },
        title: `${s.label} ${s.minutes} min`,
      })),
    ),
    h('div.alloc__legend',
      ...alloc.segments.map((s) => h('span',
        h('span.alloc__dot', { style: { background: `var(--${color[s.key] || 'line'})`, opacity: s.optional ? 0.45 : 1 } }),
        `${s.label} ${s.minutes} min`,
      )),
    ),
    total ? null : null,
  );
}

function minutesText(m) {
  return `${Number.isInteger(m) ? m : String(m).replace('.', ',')} min`;
}

function capitalize(t) {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
