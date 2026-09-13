/** Router por hash (#/rota/param). */

const routes = [];
let outlet = null;
let onAfter = null;
let current = { path: '', params: {}, query: {} };

export function defineRoutes(list) {
  routes.length = 0;
  for (const route of list) routes.push(compile(route));
}

function compile(route) {
  const keys = [];
  const pattern = route.path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { ...route, keys, regex: new RegExp(`^${pattern}$`) };
}

export function initRouter(outletEl, { after } = {}) {
  outlet = outletEl;
  onAfter = after || null;
  window.addEventListener('hashchange', () => resolve());
  return resolve();
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === target) { resolve(); return; }
  if (replace) location.replace(target);
  else location.hash = target;
}

export function currentRoute() { return current; }

/** Monta '#/rota?a=1&b=2' preservando o que importa. */
export function href(path, query) {
  const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v != null && v !== ''));
  const s = qs.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  const path = pathPart.replace(/\/+$/, '') || '/';
  return { path, query };
}

export async function resolve() {
  const { path, query } = parseHash();
  for (const route of routes) {
    const m = route.regex.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    current = { path, params, query, name: route.name };
    await render(route, params, query);
    return;
  }
  navigate('/', { replace: true });
}

async function render(route, params, query) {
  if (!outlet) return;
  try {
    const node = await route.view({ params, query });
    outlet.replaceChildren(node);
    onAfter?.(route, params);
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error('Falha ao renderizar', route.path, err);
    outlet.replaceChildren(errorView(err));
  }
}

function errorView(err) {
  const div = document.createElement('div');
  div.className = 'card card--danger';
  div.innerHTML = `<h3>Algo deu errado nesta tela</h3>
    <p class="muted">${String(err?.message || err)}</p>
    <p class="muted">Seus dados continuam salvos.</p>`;
  return div;
}

/** Recarrega a tela atual (depois de salvar algo). */
export function refresh() { return resolve(); }
