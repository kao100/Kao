/** Cardio guiado na esteira: timeline com alertas de troca de velocidade e inclinação. */

import { h, haptic } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, mmss, num, formatMinutes } from '../../core/format.js';
import { uid } from '../../core/util.js';
import { unlockAudio, beepPhase, beepFinish, keepAwake } from '../../core/audio.js';
import { page, topbar, safetyNote, emptyState, sectionTitle } from '../shell.js';
import { openSheet } from '../components/sheet.js';
import { scale, stepper, textInput } from '../components/inputs.js';
import { toastOk, toast } from '../components/toast.js';

export async function cardioView({ params, query }) {
  const date = query.date || today();
  const settings = (await store.settings.get()) || {};
  const plans = settings.cardioPlans || [];
  const plan = plans.find((p) => p.id === params.planId) || plans[0];

  if (!plan) {
    return page(topbar({ title: 'Cardio', showBack: true }), emptyState('❤️', 'Nenhum plano de cardio configurado.'));
  }

  const state = {
    plan,
    date,
    running: false,
    elapsed: 0,
    lastTick: null,
    phaseIndex: 0,
    timer: null,
    actuals: plan.phases.map((ph) => ({
      speed: ph.speedMax ?? ph.speedMin ?? null,
      incline: ph.incline ?? null,
    })),
  };

  const root = h('div.stack.stack--lg');

  const render = () => {
    root.replaceChildren(buildCardio(state, render));
  };
  render();
  return root;
}

function buildCardio(state, render) {
  const { plan } = state;
  const totalSec = plan.totalMin * 60;
  const phase = plan.phases[state.phaseIndex] || plan.phases.at(-1);
  const actual = state.actuals[state.phaseIndex] || {};

  const tick = () => {
    const now = Date.now();
    const delta = (now - state.lastTick) / 1000;
    state.lastTick = now;
    state.elapsed += delta;

    const idx = phaseIndexFor(plan, state.elapsed);
    if (idx !== state.phaseIndex) {
      state.phaseIndex = idx;
      const next = plan.phases[idx];
      if (next) {
        beepPhase();
        haptic([30, 60, 30]);
        toast(`🔔 PRÓXIMA ETAPA — ${phaseInstruction(next)}`, { type: 'warn', ms: 6000 });
      }
      render();
      return;
    }

    const el = document.getElementById('cardio-time');
    if (el) el.textContent = mmss(state.elapsed);
    const bar = document.getElementById('cardio-bar');
    if (bar) bar.style.width = `${Math.min(100, (state.elapsed / totalSec) * 100)}%`;

    if (state.elapsed >= totalSec && state.running) {
      state.running = false;
      clearInterval(state.timer);
      beepFinish();
      haptic([40, 80, 40]);
      finishCardio(state);
    }
  };

  const start = () => {
    unlockAudio();
    keepAwake(true);
    state.running = true;
    state.lastTick = Date.now();
    clearInterval(state.timer);
    state.timer = setInterval(tick, 500);
    render();
  };
  const pause = () => {
    state.running = false;
    clearInterval(state.timer);
    keepAwake(false);
    render();
  };

  return h('div.stack.stack--lg',
    topbar({ eyebrow: plan.context || 'Cardio guiado', title: plan.name, showBack: true }),

    h('section.cardio-hero',
      h('div.cardio-hero__phase', phase?.label || 'Pronto'),
      h('div#cardio-time.cardio-hero__time', mmss(state.elapsed)),
      h('div.muted', { style: { fontSize: '12px' } }, `Meta: ${plan.totalMin} min · RPE ${plan.rpe}`),
      h('div.cardio-hero__targets',
        h('div',
          h('div.cardio-hero__target-v', phase?.speedMin ? speedLabel(phase) : '—'),
          h('div.cardio-hero__target-l', 'km/h'),
        ),
        h('div',
          h('div.cardio-hero__target-v', phase?.incline != null ? `${num(phase.incline, 1)}%` : '—'),
          h('div.cardio-hero__target-l', 'inclinação'),
        ),
      ),
      h('div.bar', { style: { marginTop: '16px' } }, h('div#cardio-bar.bar__fill.bar__fill--cardio', { style: { width: `${Math.min(100, (state.elapsed / totalSec) * 100)}%` } })),
      phase?.note ? h('p.muted', { style: { marginTop: '10px', fontSize: '13px' } }, phase.note) : null,
    ),

    h('div.btn-row',
      state.running
        ? h('button.btn.btn--ghost.btn--lg.grow', { onClick: pause }, '⏸ Pausar')
        : h('button.btn.btn--cardio.btn--lg.grow', { onClick: start }, state.elapsed > 0 ? '▶ Continuar' : '▶ Iniciar'),
      h('button.btn.btn--primary.btn--lg', { onClick: () => finishCardio(state) }, '🏁'),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Programação da sessão'),
      h('div.phases',
        ...plan.phases.map((ph, i) => h(`div.phase${i === state.phaseIndex ? '.phase--active' : ''}${state.elapsed / 60 > ph.toMin ? '.phase--done' : ''}`,
          h('div.phase__win', `${pad(ph.fromMin)}:00–${pad(ph.toMin)}:00`),
          h('div.grow',
            h('div.phase__spec', ph.speedMin ? `${speedLabel(ph)} km/h · ${num(ph.incline, 1)}%` : ph.label),
            h('div.phase__desc', ph.note || ph.label),
          ),
        )),
      ),
    ),

    h('div.card.card--tight',
      h('div.card__title', 'Ajustes durante a sessão'),
      h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } },
        'Os números são um ponto de partida, não uma regra. Use o RPE e o talk test: você deve conseguir conversar em frases completas, mas não cantar confortavelmente.'),
      h('div.setgrid', { style: { marginTop: '10px' } },
        h('div',
          h('div.field__label', 'Velocidade real'),
          stepper({
            value: actual.speed ?? 5, step: 0.1, min: 0, max: 25, unit: 'km/h', decimals: 1,
            onChange: (v) => { state.actuals[state.phaseIndex].speed = v; },
          }),
        ),
        h('div',
          h('div.field__label', 'Inclinação real'),
          stepper({
            value: actual.incline ?? 0, step: 0.5, min: 0, max: 20, unit: '%', decimals: 1,
            onChange: (v) => { state.actuals[state.phaseIndex].incline = v; },
          }),
        ),
      ),
    ),

    safetyNote(`${plan.talkTest} Se a intensidade estiver alta demais, reduza velocidade ou inclinação — o futebol já cobre a parte intensa da semana.`, 'info'),
  );
}

function speedLabel(phase) {
  if (phase.speedMin == null) return '—';
  return phase.speedMax && phase.speedMax !== phase.speedMin
    ? `${num(phase.speedMin, 1)}–${num(phase.speedMax, 1)}`
    : num(phase.speedMin, 1);
}

function phaseInstruction(phase) {
  const parts = [];
  if (phase.incline != null) parts.push(`inclinação ${num(phase.incline, 1)}%`);
  if (phase.speedMin != null) parts.push(`velocidade ${speedLabel(phase)} km/h`);
  return parts.length ? `${phase.label}: ${parts.join(', ')}.` : `${phase.label}. ${phase.note || ''}`;
}

function phaseIndexFor(plan, elapsedSec) {
  const min = elapsedSec / 60;
  const idx = plan.phases.findIndex((p) => min >= p.fromMin && min < p.toMin);
  return idx === -1 ? plan.phases.length - 1 : idx;
}

function pad(v) { return String(Math.floor(v)).padStart(2, '0'); }

/* ------------------------------------------------------------------ */
/* Encerramento e registro                                              */
/* ------------------------------------------------------------------ */

function finishCardio(state) {
  clearInterval(state.timer);
  state.running = false;
  keepAwake(false);
  const minutes = Math.max(1, Math.round(state.elapsed / 60));

  openSheet({
    title: 'Registrar sessão de cardio',
    content: (close) => {
      const durationInput = stepper({ value: minutes, step: 1, min: 1, max: 240, unit: 'min', decimals: 0 });
      const rpeCtl = scale({ from: 1, to: 10, value: 4, labels: ['muito leve', 'máximo'] });
      const hrInput = textInput({ placeholder: 'opcional — bpm médio', type: 'number', inputmode: 'numeric' });
      let talk = null;
      const talkCtl = h('div.segmented',
        ...[['easy', 'Conversei fácil'], ['ok', 'Frases completas'], ['hard', 'Difícil falar']].map(([v, label]) => {
          const b = h('button.segmented__opt', { onClick: () => { talk = v; [...talkCtl.children].forEach((c) => c.classList.remove('segmented__opt--active')); b.classList.add('segmented__opt--active'); } }, label);
          return b;
        }),
      );
      const notes = h('textarea.textarea', { rows: 2, placeholder: 'Observações (opcional)' });

      return h('div.stack',
        h('div.field', h('label.field__label', 'Duração'), durationInput),
        h('div.field', h('label.field__label', 'RPE (esforço percebido)'), rpeCtl),
        h('div.field', h('label.field__label', 'Talk test'), talkCtl),
        h('div.field', h('label.field__label', 'Frequência cardíaca média'), hrInput),
        notes,
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            const rpe = rpeCtl.getValue();
            const durationMin = durationInput.getValue();
            await store.cardio.save({
              id: uid('cd'),
              date: state.date,
              planId: state.plan.id,
              name: state.plan.name,
              kind: state.plan.id.includes('recuperacao') ? 'recovery' : 'cardio',
              durationMin,
              phases: state.plan.phases.map((ph, i) => ({
                label: ph.label,
                fromMin: ph.fromMin,
                toMin: ph.toMin,
                targetSpeed: ph.speedMax ?? ph.speedMin,
                targetIncline: ph.incline,
                actualSpeed: state.actuals[i]?.speed ?? null,
                actualIncline: state.actuals[i]?.incline ?? null,
              })),
              rpe,
              talkTest: talk,
              avgHr: hrInput.value ? Number(hrInput.value) : null,
              notes: notes.value,
            });
            const day = await store.recomputeDay(state.date);
            close();
            toastOk(day.promiseMet
              ? `Cardio salvo · ${formatMinutes(day.minutes)} hoje · 🔥 promessa cumprida`
              : `Cardio salvo · faltam ${30 - day.minutes} min para a promessa`);
            if (rpe >= 7) {
              toast('RPE alto para uma sessão Zona 2. Na próxima, reduza velocidade ou inclinação.', { type: 'warn', ms: 5000 });
            }
            navigate('/');
          },
        }, 'Salvar sessão'),
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/* Registro manual (sem sessão guiada)                                  */
/* ------------------------------------------------------------------ */

export function openManualCardioSheet(date = today()) {
  openSheet({
    title: 'Registrar cardio',
    content: (close) => {
      const name = textInput({ placeholder: 'Ex.: caminhada inclinada' });
      const duration = stepper({ value: 30, step: 5, min: 5, max: 240, unit: 'min', decimals: 0 });
      const rpeCtl = scale({ from: 1, to: 10, value: 3 });
      return h('div.stack',
        h('div.field', h('label.field__label', 'Atividade'), name),
        h('div.field', h('label.field__label', 'Duração'), duration),
        h('div.field', h('label.field__label', 'RPE'), rpeCtl),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            await store.cardio.save({
              id: uid('cd'),
              date,
              name: name.value || 'Cardio',
              kind: 'cardio',
              durationMin: duration.getValue(),
              rpe: rpeCtl.getValue(),
              phases: [],
              manual: true,
            });
            const day = await store.recomputeDay(date);
            close();
            toastOk(day.promiseMet ? '🔥 Promessa do dia cumprida' : 'Cardio registrado');
            refresh();
          },
        }, 'Salvar'),
      );
    },
  });
}
