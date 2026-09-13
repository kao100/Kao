/** Aviso curto no rodapé — confirma a ação sem tirar o usuário da tela. */

import { h } from '../../core/dom.js';

export function toast(texto, tipo = '') {
  const raiz = document.getElementById('toast-root');
  if (!raiz) return;
  const el = h(`div.toast${tipo ? `.toast--${tipo}` : ''}`, texto);
  raiz.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

export const ok = (texto) => toast(texto, 'ok');
export const erro = (texto) => toast(texto, 'erro');
