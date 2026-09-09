/** Controles grandes, pensados para usar com uma mão durante o treino. */

import { h, haptic } from '../../core/dom.js';
import { num } from '../../core/format.js';

/**
 * Campo numérico com botões – e +.
 * O nó devolvido expõe getValue() e setValue().
 */
export function stepper({ value = 0, step = 2.5, min = 0, max = 999, unit = '', decimals = 1, onChange } = {}) {
  let current = Number(value) || 0;
  const input = h('input.stepper__value.input--num', {
    type: 'text',
    inputmode: 'decimal',
    value: fmt(current, decimals),
    onFocus: (e) => e.target.select(),
    onChange: (e) => {
      const parsed = Number(String(e.target.value).replace(',', '.'));
      current = Number.isNaN(parsed) ? current : clamp(parsed);
      e.target.value = fmt(current, decimals);
      onChange?.(current);
    },
  });

  const apply = (delta) => {
    current = clamp(round(current + delta));
    input.value = fmt(current, decimals);
    haptic(8);
    onChange?.(current);
  };

  function clamp(v) { return Math.min(max, Math.max(min, v)); }
  function round(v) { return Math.round(v * 100) / 100; }

  const node = h('div.stepper',
    h('button.stepper__btn', { type: 'button', onClick: () => apply(-step), 'aria-label': 'Diminuir' }, '−'),
    input,
    h('button.stepper__btn', { type: 'button', onClick: () => apply(step), 'aria-label': 'Aumentar' }, '+'),
    unit ? h('span.stepper__unit', unit) : null,
  );

  node.getValue = () => current;
  node.setValue = (v) => { current = clamp(Number(v) || 0); input.value = fmt(current, decimals); };
  return node;
}

function fmt(v, decimals) {
  return decimals === 0 ? String(Math.round(v)) : num(v, decimals);
}

/** Escala de 0 a N (dor) ou 1 a N (sono, energia…). */
export function scale({ from = 0, to = 10, value = null, onChange, labels = null } = {}) {
  let current = value;
  const buttons = [];
  const wrap = h(`div.scale${to - from + 1 <= 5 ? '.scale--5' : ''}`);

  for (let i = from; i <= to; i += 1) {
    const btn = h('button.scale__opt', {
      type: 'button',
      onClick: () => {
        current = i;
        buttons.forEach((b, idx) => b.classList.toggle('scale__opt--active', idx + from === i));
        haptic(10);
        onChange?.(i);
      },
    }, String(i));
    if (value === i) btn.classList.add('scale__opt--active');
    buttons.push(btn);
    wrap.appendChild(btn);
  }

  const container = h('div',
    wrap,
    labels ? h('div.scale__labels', h('span', labels[0]), h('span', labels[1])) : null,
  );
  container.getValue = () => current;
  return container;
}

/** Sim / Não. */
export function yesNo({ value = null, onChange, yesLabel = 'Sim', noLabel = 'Não' } = {}) {
  let current = value;
  const yes = h('button.yesno__btn.yesno__btn--yes', { type: 'button' }, yesLabel);
  const no = h('button.yesno__btn.yesno__btn--no', { type: 'button' }, noLabel);
  const sync = () => {
    yes.classList.toggle('is-active', current === true);
    no.classList.toggle('is-active', current === false);
  };
  yes.addEventListener('click', () => { current = true; sync(); haptic(10); onChange?.(true); });
  no.addEventListener('click', () => { current = false; sync(); haptic(10); onChange?.(false); });
  sync();
  const node = h('div.yesno', yes, no);
  node.getValue = () => current;
  return node;
}

/** Segmentos (abas internas). */
export function segmented({ options, value, onChange } = {}) {
  let current = value ?? options[0]?.value;
  const buttons = options.map((opt) => h('button.segmented__opt', {
    type: 'button',
    onClick: () => {
      current = opt.value;
      buttons.forEach((b, i) => b.classList.toggle('segmented__opt--active', options[i].value === current));
      onChange?.(current);
    },
  }, opt.label));
  buttons.forEach((b, i) => b.classList.toggle('segmented__opt--active', options[i].value === current));
  const node = h('div.segmented', ...buttons);
  node.getValue = () => current;
  return node;
}

/** Campo rotulado genérico. */
export function field(label, control, hint) {
  return h('div.field',
    h('label.field__label', label),
    control,
    hint ? h('div.field__hint', hint) : null,
  );
}

export function textInput({ value = '', placeholder = '', type = 'text', inputmode } = {}) {
  const input = h('input.input', { type, placeholder, inputmode });
  input.value = value ?? '';
  return input;
}

export function textArea({ value = '', placeholder = '', rows = 3 } = {}) {
  const ta = h('textarea.textarea', { placeholder, rows });
  ta.value = value ?? '';
  return ta;
}

export function numberInput({ value = '', placeholder = '', step = '0.1' } = {}) {
  const input = h('input.input.input--num', { type: 'number', inputmode: 'decimal', step, placeholder });
  input.value = value ?? '';
  return input;
}
