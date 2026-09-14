/**
 * Marca AMPLA.
 *
 * A divisa foi vetorizada a partir do logotipo original (assets/marca.svg):
 * mesmos vértices, sem arredondamento, para continuar nítida em 24px.
 * Vai inline no DOM para herdar a cor do contexto (`currentColor`).
 */

import { h } from '../../core/dom.js';

const CAMINHO = 'M50 0 L100 34.91 L100 51.45 L50 21.64 L0 51.45 L0 34.91 Z';
const PROPORCAO = 51.45 / 100;

/** Só a divisa. `largura` em px. */
export function divisa(largura = 28, { cor } = {}) {
  return h('svg.divisa', {
    viewBox: '0 0 100 51.45',
    width: largura,
    height: Math.round(largura * PROPORCAO),
    'aria-hidden': 'true',
    focusable: 'false',
  }, h('path', { d: CAMINHO, fill: cor || 'currentColor' }));
}

/**
 * Divisa + palavra, do jeito que o logotipo se organiza.
 * @param {'topo'|'grande'} tamanho
 */
export function logotipo(tamanho = 'topo') {
  const grande = tamanho === 'grande';
  return h(`div.logo${grande ? '.logo--grande' : ''}`,
    divisa(grande ? 96 : 26, { cor: 'var(--marca)' }),
    h('div.logo__texto',
      h('span.logo__nome', 'AMPLA'),
      grande && h('span.logo__sub', 'materiais de construção')),
    grande && h('span.logo__barra'));
}
