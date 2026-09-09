/**
 * Service worker do Kao Training.
 *
 * Estratégia:
 *  - app shell (HTML, CSS, JS, ícones) em cache, servido offline;
 *  - navegações: rede primeiro, cache como reserva (para ver atualizações rápido);
 *  - demais arquivos do app: cache primeiro, atualizando em segundo plano.
 *
 * Os dados do usuário NÃO passam por aqui: ficam no IndexedDB.
 */

const VERSION = 'kao-v1';
const SHELL_CACHE = `${VERSION}-shell`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './src/main.js',
  './src/styles/theme.css',
  './src/styles/base.css',
  './src/styles/components.css',
  './src/styles/views.css',
  './src/core/dom.js',
  './src/core/db.js',
  './src/core/store.js',
  './src/core/router.js',
  './src/core/format.js',
  './src/core/util.js',
  './src/core/audio.js',
  './src/data/exercises.js',
  './src/data/program.js',
  './src/data/seed.js',
  './src/data/illustrations.js',
  './src/data/media.js',
  './src/logic/planner.js',
  './src/logic/progression.js',
  './src/logic/knee.js',
  './src/logic/readiness.js',
  './src/logic/report.js',
  './src/logic/backup.js',
  './src/ui/shell.js',
  './src/ui/components/toast.js',
  './src/ui/components/sheet.js',
  './src/ui/components/chart.js',
  './src/ui/components/inputs.js',
  './src/ui/components/figure.js',
  './src/ui/views/dashboard.js',
  './src/ui/views/workout.js',
  './src/ui/views/cardio.js',
  './src/ui/views/football.js',
  './src/ui/views/exercise.js',
  './src/ui/views/program.js',
  './src/ui/views/calendar.js',
  './src/ui/views/promise.js',
  './src/ui/views/progress.js',
  './src/ui/views/body.js',
  './src/ui/views/knee.js',
  './src/ui/views/medical.js',
  './src/ui/views/gym.js',
  './src/ui/views/supplements.js',
  './src/ui/views/weekly.js',
  './src/ui/views/settings.js',
  './src/ui/views/more.js',
  './src/ui/views/readiness.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
