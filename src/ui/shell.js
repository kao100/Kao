import { h } from '../core/dom.js';
import { navigate, back, currentRoute } from '../core/router.js';

export const TABS = [
  { id: 'home', label: 'Início', icon: '🏠', path: '/' },
  { id: 'program', label: 'Programa', icon: '📋', path: '/programa' },
  { id: 'calendar', label: 'Calendário', icon: '🗓️', path: '/calendario' },
  { id: 'progress', label: 'Progresso', icon: '📈', path: '/progresso' },
  { id: 'more', label: 'Mais', icon: '⋯', path: '/mais' },
];

/** Cabeçalho padrão das telas internas. */
export function topbar({ eyebrow, title, actions = [], showBack = false, backTo = null }) {
  return h('header.topbar',
    showBack
      ? h('button.iconbtn', { onClick: () => (backTo ? navigate(backTo) : back('/')), 'aria-label': 'Voltar' }, '‹')
      : null,
    h('div.topbar__title',
      eyebrow ? h('div.topbar__eyebrow', eyebrow) : null,
      h('h1.topbar__h1', title),
    ),
    actions.length ? h('div.topbar__actions', ...actions) : null,
  );
}

export function iconAction(icon, { onClick, label, to }) {
  return h('button.iconbtn', {
    onClick: onClick || (() => navigate(to)),
    'aria-label': label || icon,
    title: label || '',
  }, icon);
}

/** Estrutura de uma página. */
export function page(header, ...content) {
  return h('div.stack.stack--lg', header, ...content);
}

export function buildTabBar() {
  const bar = h('nav.tabbar');
  const buttons = TABS.map((tab) => h('button.tabbar__item', {
    onClick: () => navigate(tab.path),
  }, h('span.tabbar__icon', tab.icon), h('span', tab.label)));
  buttons.forEach((b) => bar.appendChild(b));

  bar.sync = () => {
    const path = currentRoute().path || '/';
    TABS.forEach((tab, i) => {
      const active = tab.path === '/'
        ? path === '/'
        : path.startsWith(tab.path);
      buttons[i].classList.toggle('tabbar__item--active', active);
    });
  };
  return bar;
}

/** Linha de menu usada na aba "Mais". */
export function menuRow({ icon, title, sub, to, onClick, accent }) {
  return h('button.list-item.clickable', {
    style: { width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line-soft)' },
    onClick: onClick || (() => navigate(to)),
  },
  h('div.list-item__thumb', { style: { fontSize: '22px', background: 'var(--surface-2)', color: accent ? `var(--${accent})` : 'var(--text)' } }, icon),
  h('div.grow',
    h('div.list-item__title', title),
    sub ? h('div.list-item__sub', sub) : null,
  ),
  h('span.muted', '›'),
  );
}

export function emptyState(icon, text, action = null) {
  return h('div.empty', h('div.empty__icon', icon), h('div', text), action ? h('div.mt', action) : null);
}

export function sectionTitle(text, action = null) {
  return h('div.row.row--between', h('div.section-title', text), action);
}

export function safetyNote(text, variant = '') {
  return h(`div.safety${variant ? `.safety--${variant}` : ''}`, text);
}
