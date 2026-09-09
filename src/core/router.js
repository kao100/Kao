/** Router por hash (#/rota/param) — funciona offline e em file:// quando necessário. */

const routes = [];
let outlet = null;
let onBefore = null;
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

export function initRouter(outletEl, { before } = {}) {
  outlet = outletEl;
  onBefore = before || null;
  window.addEventListener('hashchange', () => resolve());
  resolve();
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === target) { resolve(); return; }
  if (replace) location.replace(target);
  else location.hash = target;
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function currentRoute() { return current; }

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
  // rota desconhecida volta para o início
  navigate('/', { replace: true });
}

async function render(route, params, query) {
  if (!outlet) return;
  try {
    const node = await route.view({ params, query });
    outlet.replaceChildren(node);
    onBefore?.(route, params);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    console.error('Falha ao renderizar rota', route.path, err);
    outlet.replaceChildren(errorView(err));
  }
}

function errorView(err) {
  const div = document.createElement('div');
  div.className = 'card card--danger';
  div.innerHTML = `<h3>Algo deu errado nesta tela</h3>
    <p class="muted">${String(err?.message || err)}</p>
    <p class="muted">Seus dados continuam salvos. Tente voltar e abrir novamente.</p>`;
  return div;
}

/** Recarrega a tela atual (após salvar algo, por exemplo). */
export function refresh() { return resolve(); }
