/**
 * Cardio guiado: timeline com alertas de troca de fase.
 *
 * Os números de velocidade e inclinação são da esteira, porque é o aparelho que
 * dá valores objetivos. Mas quem comanda a sessão é o RPE: no elíptico ou na
 * escada, o mesmo plano vale ajustando resistência ou ritmo de degraus até o
 * esforço bater. O seletor de aparelho no topo mostra como fazer em cada um.
 */

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
import { CARDIO_MACHINES } from '../../data/program.js';
import { kneeStatus } from '../../logic/knee.js';
import { openKneeCheckSheet } from './knee.js';

export async function cardioView({ params, query }) {
  const date = query.date || today();
  const settings = (await store.settings.get()) || {};
  const plans = settings.cardioPlans || [];
  const plan = plans.find((p) => p.id === params.planId) || plans[0];

  if (!plan) {
    return page(topbar({ title: 'Cardio', showBack: true }), emptyState('❤️', 'Nenhum plano de cardio configurado.'));
  }

  const [knee, painLogs, recentCardio] = await Promise.all([
    kneeStatus(date),
    store.painLogs.all(),
    store.cardio.all(),
  ]);

  const state = {
    knee,
    history: cardioKneeHistory(recentCardio, painLogs),
    kneeAsked: painLogs.some((l) => l.date === date),
    askKnee: settings.askKneeBeforeLegsAndFootball !== false,
    inclineCap: settings.treadmillInclineMax ?? null,
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
    // com o joelho em cautela, o app abre na bicicleta (sem impacto)
    machine: knee.level === 'caution' && ['esteira', 'escada'].includes(settings.cardioMachine || 'esteira')
      ? 'bicicleta'
      : (settings.cardioMachine || 'esteira'),
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
        toast(`🔔 PRÓXIMA ETAPA — ${phaseInstruction(next, state.inclineCap)}`, { type: 'warn', ms: 6000 });
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

  const start = async () => {
    unlockAudio();
    // COMO ESTÁ SEU JOELHO HOJE? — antes do cardio, se ainda não respondeu hoje
    if (state.askKnee && !state.kneeAsked && state.elapsed === 0) {
      state.kneeAsked = true;
      const answered = await openKneeCheckSheet({ context: 'pre-cardio', date: state.date });
      if (answered === 'cancel') { state.kneeAsked = false; return; }
      state.knee = await kneeStatus(state.date);
    }
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
          h('div.cardio-hero__target-v', phase?.incline != null ? `${num(cappedIncline(phase.incline, state.inclineCap), 1)}%` : '—'),
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
            h('div.phase__spec', ph.speedMin ? `${speedLabel(ph)} km/h · ${num(cappedIncline(ph.incline, state.inclineCap), 1)}%` : ph.label),
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

    state.knee.level !== 'ok'
      ? safetyNote(`🦵 ${state.knee.level === 'caution' ? 'Joelho em cautela' : 'Atenção ao joelho'}: prefira bicicleta ou elíptico (sem impacto), mantenha o RPE no limite de baixo e pare se a dor aumentar.`, state.knee.level === 'caution' ? 'danger' : '')
      : null,

    machineCard(state),

    inclineCard(state, render),

    historyCard(state),

    safetyNote(`${plan.talkTest} Se a intensidade estiver alta demais, reduza o ritmo — o esforço percebido manda mais que o número do painel.`, 'info'),
  );
}

function speedLabel(phase) {
  if (phase.speedMin == null) return '—';
  return phase.speedMax && phase.speedMax !== phase.speedMin
    ? `${num(phase.speedMin, 1)}–${num(phase.speedMax, 1)}`
    : num(phase.speedMin, 1);
}

function cappedIncline(incline, cap) {
  if (incline == null) return incline;
  return cap != null ? Math.min(incline, cap) : incline;
}

function phaseInstruction(phase, cap = null) {
  const parts = [];
  if (phase.incline != null) parts.push(`inclinação ${num(cappedIncline(phase.incline, cap), 1)}%`);
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
      const kneeAfter = scale({ from: 0, to: 10, value: null, labels: ['0 — sem dor', '10'] });

      return h('div.stack',
        h('div.field', h('label.field__label', 'Duração'), durationInput),
        h('div.field', h('label.field__label', 'RPE (esforço percebido)'), rpeCtl),
        h('div.field', h('label.field__label', 'Talk test'), talkCtl),
        h('div.field', h('label.field__label', 'Frequência cardíaca média'), hrInput),
        h('div.field', h('label.field__label', 'Joelho depois do cardio (opcional)'), kneeAfter),
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
              machine: state.machine || null,
              inclineCap: state.inclineCap,
              kneeAfter: kneeAfter.getValue(),
              notes: notes.value,
            });
            if (kneeAfter.getValue() != null) {
              await store.painLogs.save({
                id: uid('pain'), date: state.date, context: 'post-cardio', score: kneeAfter.getValue(),
                painDuringMovement: false, swelling: false, instability: false,
                notes: `Depois de ${state.plan.name}${state.machine ? ` (${state.machine})` : ''}`, ts: Date.now(),
              });
            }
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

/**
 * Em que aparelho fazer.
 * A escolha fica salva em Ajustes e vale para os próximos cardios, porque
 * ninguém quer escolher o aparelho toda vez.
 */
function machineCard(state) {
  const { plan } = state;
  const chosen = state.machine || 'esteira';
  const box = h('div.stack.stack--sm');

  const paint = (id) => {
    const m = CARDIO_MACHINES.find((x) => x.id === id) || CARDIO_MACHINES[0];
    const specific = plan.machineNotes?.[m.id];
    box.textContent = '';
    box.appendChild(h('div.list-item__sub', `Impacto: ${m.impact}`));
    box.appendChild(h('p.muted', { style: { fontSize: '14px' } }, specific || m.howTo));
    if (m.knee) box.appendChild(h('div.safety', `🦵 ${m.knee}`));
    if (m.tip) box.appendChild(h('p.muted', { style: { fontSize: '13px' } }, m.tip));
  };

  const buttons = CARDIO_MACHINES.map((m) => {
    const btn = h('button.btn.btn--sm', { class: m.id === chosen ? 'btn--primary' : 'btn--ghost' }, `${m.icon} ${m.name}`);
    btn.addEventListener('click', async () => {
      buttons.forEach((b) => { b.className = 'btn btn--sm btn--ghost'; });
      btn.className = 'btn btn--sm btn--primary';
      paint(m.id);
      state.machine = m.id;
      await store.settings.save({ cardioMachine: m.id });
    });
    return btn;
  });

  paint(chosen);

  return h('div.card',
    h('div.card__title', 'Em qual aparelho'),
    h('p.muted', { style: { fontSize: '13px', marginTop: '4px' } },
      'Os números das fases são da esteira. Em outro aparelho, ignore-os e ajuste até o RPE bater — o estímulo é o mesmo.'),
    h('div.btn-row', { style: { flexWrap: 'wrap', marginTop: '10px' } }, ...buttons),
    h('div', { style: { marginTop: '10px' } }, box),
  );
}

/**
 * Inclinação individual da esteira.
 * A progressão é sua: o app não usa a inclinação máxima por padrão, e com um
 * teto definido, nenhuma fase passa dele.
 */
function inclineCard(state, render) {
  if (state.machine !== 'esteira' && state.machine !== 'caminhada') return null;
  const ctl = stepper({
    value: state.inclineCap ?? 7, step: 0.5, min: 0, max: 15, unit: '%', decimals: 1,
    onChange: async (v) => {
      state.inclineCap = v;
      await store.settings.save({ treadmillInclineMax: v });
      render();
    },
  });
  return h('div.card',
    h('div.card__title', 'Sua inclinação confortável'),
    h('p.muted', { style: { fontSize: '13px', margin: '4px 0 10px' } },
      'Nenhuma fase passa deste valor. Inclinação não é automaticamente melhor para o joelho — suba de 0,5 em 0,5 % por semana só se o joelho responder bem, sem pular para a máxima.'),
    ctl,
    state.inclineCap == null
      ? h('div.list-item__sub', { style: { marginTop: '6px' } }, 'Ainda sem teto definido: as fases usam a inclinação do plano (até 7 %).')
      : h('button.btn.btn--sm.btn--quiet.mt', {
        onClick: async () => { state.inclineCap = null; await store.settings.save({ treadmillInclineMax: null }); render(); },
      }, 'Remover o teto'),
  );
}

function cardioKneeHistory(cardioRows, painLogs) {
  return cardioRows
    .filter((c) => !c.manual)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6)
    .map((c) => {
      const pre = painLogs.find((l) => l.date === c.date && l.context === 'pre-cardio');
      const post = c.kneeAfter ?? painLogs.find((l) => l.date === c.date && l.context === 'post-cardio')?.score ?? null;
      const maxIncline = Math.max(0, ...(c.phases || []).map((p) => Number(p.actualIncline ?? p.targetIncline) || 0));
      return { date: c.date, name: c.name, machine: c.machine, rpe: c.rpe, pre: pre?.score ?? null, post, maxIncline, minutes: c.durationMin };
    });
}

function historyCard(state) {
  const rows = state.history;
  if (!rows.length) return null;
  const machineName = (id) => CARDIO_MACHINES.find((m) => m.id === id)?.name || '';
  return h('div.card',
    h('div.card__title', 'Histórico de sintomas no cardio'),
    h('div.stack.stack--sm', { style: { marginTop: '10px' } },
      ...rows.map((r) => h('div',
        h('div.report-line',
          h('span', `${r.date.slice(8, 10)}/${r.date.slice(5, 7)} · ${r.name}`),
          h('span.report-line__v', `joelho ${r.pre ?? '–'} → ${r.post ?? '–'}`),
        ),
        h('div.list-item__sub', [machineName(r.machine), r.minutes ? `${r.minutes} min` : null, r.rpe ? `RPE ${r.rpe}` : null, r.maxIncline && (!r.machine || r.machine === 'esteira') ? `até ${num(r.maxIncline, 1)}%` : null].filter(Boolean).join(' · ')),
      )),
    ),
  );
}
