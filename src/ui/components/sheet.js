import { h } from '../../core/dom.js';

const root = () => document.getElementById('sheet-root');

/**
 * Abre uma folha inferior (bottom sheet).
 * @param {object} opts
 * @param {string} opts.title
 * @param {(close:Function)=>Node} opts.content  função que recebe `close`
 * @returns {{close:Function}}
 */
export function openSheet({ title, content, onClose }) {
  const container = root();
  const backdrop = h('div.sheet-backdrop');
  let closed = false;

  const close = (result) => {
    if (closed) return;
    closed = true;
    backdrop.style.opacity = '0';
    backdrop.style.transition = 'opacity .16s ease';
    setTimeout(() => backdrop.remove(), 170);
    onClose?.(result);
  };

  const body = content(close);
  const sheet = h('div.sheet', { onClick: (e) => e.stopPropagation() },
    h('div.sheet__grab'),
    title ? h('div.sheet__head',
      h('div.sheet__title', title),
      h('button.iconbtn', { onClick: () => close(), 'aria-label': 'Fechar' }, '✕'),
    ) : null,
    body,
  );

  backdrop.addEventListener('click', () => close());
  backdrop.appendChild(sheet);
  container.appendChild(backdrop);
  return { close };
}

/** Confirmação simples. Resolve para true/false. */
export function confirmSheet({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      onClose: () => { if (!answered) resolve(false); },
      content: (close) => h('div.stack',
        message ? h('p', message) : null,
        h('div.btn-row',
          h('button.btn.btn--ghost', { onClick: () => { answered = true; resolve(false); close(); } }, 'Cancelar'),
          h(`button.btn.${danger ? 'btn--danger' : 'btn--primary'}`, {
            onClick: () => { answered = true; resolve(true); close(); },
          }, confirmLabel),
        ),
      ),
    });
  });
}

/**
 * Formulário genérico em folha.
 * fields: [{key, label, type:'number'|'text'|'textarea'|'date'|'select', value, options, hint, step, placeholder}]
 * Resolve com um objeto {key: value} ou null se cancelado.
 */
export function formSheet({ title, fields, submitLabel = 'Salvar', intro = null }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      onClose: () => { if (!answered) resolve(null); },
      content: (close) => {
        const inputs = {};
        const nodes = fields.map((f) => {
          let input;
          if (f.type === 'textarea') {
            input = h('textarea.textarea', { placeholder: f.placeholder || '', rows: f.rows || 3 });
            input.value = f.value ?? '';
          } else if (f.type === 'select') {
            input = h('select.select', {},
              ...(f.options || []).map((o) => h('option', { value: o.value, selected: String(o.value) === String(f.value) }, o.label)));
          } else {
            input = h('input.input', {
              type: f.type || 'text',
              inputmode: f.type === 'number' ? 'decimal' : undefined,
              step: f.step || (f.type === 'number' ? '0.1' : undefined),
              placeholder: f.placeholder || '',
              class: f.type === 'number' ? 'input--num' : '',
            });
            input.value = f.value ?? '';
          }
          inputs[f.key] = { input, type: f.type };
          return h('div.field',
            h('label.field__label', f.label),
            input,
            f.hint ? h('div.field__hint', f.hint) : null,
          );
        });

        const submit = () => {
          const out = {};
          for (const [key, { input, type }] of Object.entries(inputs)) {
            const raw = input.value;
            out[key] = type === 'number' ? (raw === '' ? null : Number(String(raw).replace(',', '.'))) : raw;
          }
          answered = true;
          resolve(out);
          close();
        };

        return h('div.stack',
          intro ? h('p.muted', intro) : null,
          ...nodes,
          h('button.btn.btn--primary.btn--block', { onClick: submit }, submitLabel),
        );
      },
    });
  });
}
