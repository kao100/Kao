/**
 * Mini camada de renderização (sem framework, sem build).
 * h() cria elementos; os componentes das telas são funções que devolvem nós.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'text',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'ellipse', 'tspan', 'clipPath',
]);

/**
 * @param {string} tag  ex.: 'div.card.card--tight' ou 'button#save.btn'
 * @param {object} [props] atributos, on* para eventos, style objeto, class/className
 * @param {...any} children  strings, números, nós, arrays, null
 */
export function h(tag, props, ...children) {
  const { name, id, classes } = parseTag(tag);
  const el = SVG_TAGS.has(name)
    ? document.createElementNS(SVG_NS, name)
    : document.createElement(name);

  if (id) el.id = id;
  if (classes.length) el.setAttribute('class', classes.join(' '));

  if (props && typeof props === 'object' && !isNode(props) && !Array.isArray(props)) {
    applyProps(el, props, classes);
  } else if (props != null) {
    children.unshift(props);
  }

  appendChildren(el, children);
  return el;
}

function parseTag(tag) {
  const m = String(tag).match(/^([a-zA-Z][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)$/);
  if (!m) return { name: 'div', id: '', classes: [] };
  return {
    name: m[1] || 'div',
    id: m[2] ? m[2].slice(1) : '',
    classes: m[3] ? m[3].split('.').filter(Boolean) : [],
  };
}

function applyProps(el, props, baseClasses) {
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;

    if (key === 'class' || key === 'className') {
      const extra = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      el.setAttribute('class', [...baseClasses, extra].filter(Boolean).join(' '));
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (key === 'ref' && typeof value === 'function') {
      value(el);
    } else if (key in el && !(el instanceof SVGElement) && typeof value !== 'object') {
      try { el[key] = value; } catch { el.setAttribute(key, String(value)); }
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

function appendChildren(el, children) {
  for (const child of children.flat(6)) {
    if (child == null || child === false || child === '') continue;
    el.appendChild(isNode(child) ? child : document.createTextNode(String(child)));
  }
}

function isNode(x) {
  return x && typeof x === 'object' && typeof x.nodeType === 'number';
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

/** Substitui todo o conteúdo de um container. */
export function mount(container, node) {
  container.replaceChildren(node);
  return container;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Texto seguro para uso em innerHTML. */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Insere um SVG a partir de string (usado nas ilustrações dos exercícios). */
export function svgFromString(markup, className) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = markup.trim();
  const node = wrapper.firstElementChild;
  if (node && className) node.setAttribute('class', className);
  return node || document.createTextNode('');
}

/** Vibração curta (iOS ignora; Android responde). */
export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* sem suporte */ }
}
