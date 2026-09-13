/**
 * Service worker: guarda o app (não os dados) para abrir offline.
 * Os dados vivem no IndexedDB do aparelho e nunca passam por aqui.
 */

const CACHE = 'amplacon-v1';
const BASE = new URL('./', self.registration.scope).pathname;

const APP_SHELL = [
  '', 'index.html', 'manifest.webmanifest',
  'src/main.js',
  'src/core/dom.js', 'src/core/router.js', 'src/core/format.js', 'src/core/util.js',
  'src/core/db.js', 'src/core/store.js',
  'src/core/files/zip.js', 'src/core/files/xlsx.js', 'src/core/files/xlsxw.js',
  'src/core/files/csv.js', 'src/core/files/nfe.js', 'src/core/files/ofx.js', 'src/core/files/read.js',
  'src/data/sources.js', 'src/data/seed.js',
  'src/logic/ingest.js', 'src/logic/link.js', 'src/logic/revenue.js', 'src/logic/commission.js',
  'src/logic/collection.js', 'src/logic/cashflow.js', 'src/logic/abc.js', 'src/logic/routine.js',
  'src/logic/reports.js',
  'src/ui/shell.js',
  'src/ui/components/ui.js', 'src/ui/components/sheet.js', 'src/ui/components/toast.js',
  'src/ui/components/chart.js', 'src/ui/components/table.js',
  'src/ui/views/empresa.js', 'src/ui/views/caixa.js', 'src/ui/views/cobranca.js',
  'src/ui/views/comercial.js', 'src/ui/views/produtos.js', 'src/ui/views/comissoes.js',
  'src/ui/views/pagar.js', 'src/ui/views/receber.js', 'src/ui/views/bancos.js',
  'src/ui/views/conciliacao.js', 'src/ui/views/arquivos.js', 'src/ui/views/ajustes.js',
  'src/styles/theme.css', 'src/styles/base.css', 'src/styles/components.css',
  'src/styles/views.css', 'src/styles/print.css',
].map((caminho) => BASE + caminho);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // rede primeiro para o código do app ficar sempre atualizado; cache é o plano B
  event.respondWith((async () => {
    try {
      const resposta = await fetch(request);
      if (resposta.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, resposta.clone());
      }
      return resposta;
    } catch {
      const guardado = await caches.match(request);
      if (guardado) return guardado;
      if (request.mode === 'navigate') {
        const inicio = await caches.match(`${BASE}index.html`);
        if (inicio) return inicio;
      }
      throw new Error('sem rede e sem cache');
    }
  })());
});
