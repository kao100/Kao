/**
 * Kao Training — bootstrap do aplicativo.
 *
 * PWA sem build: só módulos ES nativos, IndexedDB e service worker.
 */

import { h } from './core/dom.js';
import { defineRoutes, initRouter, navigate } from './core/router.js';
import { openDB, requestPersistence } from './core/db.js';
import * as store from './core/store.js';
import { today } from './core/format.js';
import { unlockAudio } from './core/audio.js';
import { seedIfNeeded } from './data/seed.js';
import { buildTabBar } from './ui/shell.js';
import { toastError } from './ui/components/toast.js';

import { dashboardView } from './ui/views/dashboard.js';
import { workoutView } from './ui/views/workout.js';
import { cardioView } from './ui/views/cardio.js';
import { footballView } from './ui/views/football.js';
import { exerciseView, libraryView } from './ui/views/exercise.js';
import { programView, templateEditView, cardioPlansView } from './ui/views/program.js';
import { calendarView } from './ui/views/calendar.js';
import { dayView } from './ui/views/promise.js';
import { progressView, exerciseProgressView } from './ui/views/progress.js';
import { bodyView } from './ui/views/body.js';
import { kneeView } from './ui/views/knee.js';
import { medicalView } from './ui/views/medical.js';
import { gymView } from './ui/views/gym.js';
import { supplementsView, nutritionView } from './ui/views/supplements.js';
import { weeklyView } from './ui/views/weekly.js';
import { settingsView } from './ui/views/settings.js';
import { moreView } from './ui/views/more.js';

const ROUTES = [
  { name: 'home', path: '/', view: dashboardView },
  { name: 'today', path: '/hoje', view: dashboardView },
  { name: 'train', path: '/treinar/:sessionId', view: workoutView },
  { name: 'cardio', path: '/cardio/:planId', view: cardioView },
  { name: 'cardioPlans', path: '/cardio-planos', view: cardioPlansView },
  { name: 'football', path: '/futebol', view: footballView },
  { name: 'exercise', path: '/exercicio/:id', view: exerciseView },
  { name: 'library', path: '/biblioteca', view: libraryView },
  { name: 'program', path: '/programa', view: programView },
  { name: 'template', path: '/programa/:templateId', view: templateEditView },
  { name: 'calendar', path: '/calendario', view: calendarView },
  { name: 'day', path: '/dia/:date', view: dayView },
  { name: 'progress', path: '/progresso', view: progressView },
  { name: 'exerciseProgress', path: '/progresso/:exerciseId', view: exerciseProgressView },
  { name: 'body', path: '/fisico', view: bodyView },
  { name: 'knee', path: '/joelho', view: kneeView },
  { name: 'medical', path: '/medico', view: medicalView },
  { name: 'gym', path: '/academia', view: gymView },
  { name: 'supplements', path: '/suplementos', view: supplementsView },
  { name: 'nutrition', path: '/nutricao', view: nutritionView },
  { name: 'weekly', path: '/semana', view: weeklyView },
  { name: 'settings', path: '/ajustes', view: settingsView },
  { name: 'more', path: '/mais', view: moreView },
];

async function boot() {
  const root = document.getElementById('app-root');

  // Registrado antes de tudo: o cadastro inicial espera por você, e o evento
  // `load` já pode ter passado quando o banco terminar de abrir.
  registerServiceWorker();

  try {
    await openDB();
    await seedIfNeeded();
    requestPersistence();
    await store.recomputeDay(today());
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('div.card.card--danger', { style: { margin: '24px' } },
      h('h3', 'Não foi possível abrir o banco de dados local'),
      h('p.muted', String(err?.message || err)),
      h('p.muted', 'No Safari, verifique se a navegação privada está desativada — ela bloqueia o armazenamento local.'),
    ));
    return;
  }

  // Primeiro uso: os dados pessoais são digitados aqui, nunca ficam no código.
  const profile = await store.profile.get();
  if (!profile?.onboarded) {
    const { runOnboarding } = await import('./ui/views/onboarding.js');
    await runOnboarding(root);
  }

  const main = h('main.app__main');
  const tabbar = buildTabBar();
  const app = h('div.app', main, tabbar);
  root.replaceChildren(app);

  defineRoutes(ROUTES);
  initRouter(main, {
    before: () => {
      tabbar.sync();
      // esconde a barra de abas no modo treino e no cardio guiado
      const focusMode = /^#\/(treinar|cardio)\//.test(location.hash);
      tabbar.classList.toggle('hide', focusMode);
      app.classList.toggle('app--focus', focusMode);
    },
  });

  wireGlobalEvents();
}

function wireGlobalEvents() {
  // libera o áudio no primeiro toque (exigência do iOS)
  const unlock = () => { unlockAudio(); document.removeEventListener('touchstart', unlock); document.removeEventListener('click', unlock); };
  document.addEventListener('touchstart', unlock, { passive: true });
  document.addEventListener('click', unlock);

  // ao voltar para o app, recalcula o dia (a promessa depende da data atual)
  let lastDay = today();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    await store.recomputeDay(today());
    if (today() !== lastDay) {
      lastDay = today();
      navigate('/', { replace: true });
      location.reload();
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('Erro não tratado:', e.reason);
    toastError('Algo falhou nesta ação. Seus dados continuam salvos.');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  // Se a página já estava sendo controlada por um service worker, uma troca de
  // controlador significa versão nova publicada: recarrega uma vez para o app
  // abrir atualizado, sem precisar fechar e abrir duas vezes.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      // procura atualização ao abrir e sempre que o app volta para a frente
      registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    } catch (err) {
      // Sem service worker o app continua funcionando — só perde o modo offline.
      console.warn('Service worker não registrado:', err);
    }
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

boot();
