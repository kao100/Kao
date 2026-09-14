/** Estrutura da tela: barra de cima, navegação e o selo de confiança dos dados. */

import { h } from '../core/dom.js';
import { divisa } from './components/marca.js';
import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { formatDate, timestampLabel } from '../core/format.js';

export const MODULOS = [
  { path: '/', icone: '📊', label: 'Empresa', titulo: 'Visão da empresa' },
  { path: '/caixa', icone: '💧', label: 'Caixa', titulo: 'Fluxo de caixa' },
  { path: '/cobranca', icone: '📞', label: 'Cobrança', titulo: 'Inadimplência e cobrança' },
  { path: '/comercial', icone: '📈', label: 'Comercial', titulo: 'Comercial' },
  { path: '/orcamentos', icone: '📝', label: 'Orçamentos', titulo: 'Orçamentos' },
  { path: '/produtos', icone: '📦', label: 'Produtos', titulo: 'Produtos e curva ABC' },
  { path: '/comissoes', icone: '🎯', label: 'Comissões', titulo: 'Comissões' },
  { path: '/pagar', icone: '📤', label: 'A pagar', titulo: 'Contas a pagar' },
  { path: '/receber', icone: '📥', label: 'A receber', titulo: 'Contas a receber' },
  { path: '/bancos', icone: '🏦', label: 'Bancos', titulo: 'Bancos e extrato' },
  { path: '/conciliacao', icone: '⚠️', label: 'Conciliação', titulo: 'Conciliação' },
  { path: '/fechamento', icone: '📁', label: 'Pasta do mês', titulo: 'Pasta do mês' },
  { path: '/arquivos', icone: '🗂️', label: 'Arquivos', titulo: 'Central de arquivos' },
  { path: '/ajustes', icone: '⚙️', label: 'Ajustes', titulo: 'Ajustes' },
];

let refs = {};

export function montarShell(raiz) {
  const outlet = h('main.conteudo');
  const titulo = h('h1', 'Visão da empresa');
  const subtitulo = h('span');
  const voltar = h('button.topo__voltar', { onClick: () => history.back(), style: { display: 'none' } }, '‹');

  const marca = h('span.topo__marca', divisa(24, { cor: 'var(--marca)' }));

  // A Central de Arquivos mora na barra de baixo, e só lá. Ela também tinha um
  // atalho aqui em cima: o mesmo lugar aparecendo duas vezes na mesma tela.
  const topo = h('header.topo',
    voltar,
    marca,
    h('div.topo__titulo', titulo, subtitulo));

  const nav = h('nav.nav', ...MODULOS.map((m) => h('a.nav__item', {
    href: `#${m.path}`,
    dataset: { path: m.path },
  }, h('span', m.icone), h('span', m.label))));

  raiz.replaceChildren(h('div.app', topo, nav, outlet));
  refs = { outlet, titulo, subtitulo, nav, voltar, marca };
  return outlet;
}

export function aoTrocarRota(route, params) {
  const modulo = MODULOS.find((m) => m.path === route.path)
    || MODULOS.find((m) => m.path !== '/' && route.path.startsWith(m.path));
  refs.titulo.textContent = route.titulo || modulo?.titulo || 'AMPLA';
  const naRaiz = modulo && modulo.path === route.path;
  refs.voltar.style.display = naRaiz ? 'none' : 'grid';
  refs.marca.style.display = naRaiz ? 'flex' : 'none';
  for (const el of refs.nav.querySelectorAll('.nav__item')) {
    el.classList.toggle('nav__item--ativo', el.dataset.path === modulo?.path);
  }
}

export function definirTitulo(texto, sub) {
  if (refs.titulo) refs.titulo.textContent = texto;
  if (refs.subtitulo) refs.subtitulo.textContent = sub || '';
}

/** Marca o módulo de conciliação quando existe pendência aberta. */
export function marcarPendencias(quantidade) {
  const el = refs.nav?.querySelector('[data-path="/conciliacao"]');
  el?.classList.toggle('nav__item--alerta', quantidade > 0);
}

/** Relê as pendências e atualiza a bolinha da navegação. */
export async function atualizarAlertas() {
  const pendencias = await store.pendencias.listar();
  marcarPendencias(pendencias.filter((p) => p.status === 'aberta').length);
}

/**
 * "DADOS ATUALIZADOS ATÉ __/__/____" + semáforo de integridade.
 * Aparece no topo das telas que mostram número — item 3 do projeto.
 */
export function seloDados(selo, { compacto = false } = {}) {
  if (!selo) return null;
  const { integridade } = selo;
  return h(`button.selo-dados.selo-dados--${integridade.nivel}`,
    { onClick: () => navigate('/arquivos') },
    h('span.selo-dados__bola', integridade.emoji),
    h('span.selo-dados__texto',
      h('span.selo-dados__linha',
        selo.atualizadoAte
          ? h('span', 'Dados até ', h('strong', formatDate(selo.atualizadoAte)))
          : h('span', 'Nenhum dado importado ainda'),
        !compacto && selo.ultimaImportacao
          ? h('span.muted', ` · importado ${timestampLabel(selo.ultimaImportacao.momento)}`)
          : null),
      h('span.selo-dados__nota', integridade.texto)),
    h('span.muted', '\u203a'));
}
