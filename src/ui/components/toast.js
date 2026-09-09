import { h } from '../../core/dom.js';

const root = () => document.getElementById('toast-root');

export function toast(message, { type = 'default', ms = 2400 } = {}) {
  const el = h(`div.toast${type !== 'default' ? `.toast--${type}` : ''}`, message);
  const container = root();
  if (!container) return;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s ease';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

export const toastOk = (m) => toast(m, { type: 'ok' });
export const toastWarn = (m) => toast(m, { type: 'warn' });
export const toastError = (m) => toast(m, { type: 'danger', ms: 3600 });
