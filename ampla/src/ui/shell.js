/** Estrutura da tela: barra de cima, navegação e o selo de confiança dos dados. */

import { h } from '../core/dom.js';
import { divisa } from './components/marca.js';
import * as store from '../core/store.js';
import { navigate } from '../core/router.js';
import { formatDate, timestampLabel } from '../core/format.js';
import { detalhe, fechar as fecharFolha } from './components/sheet.js';

/**
 * CINCO LUGARES NA BARRA, E NENHUM MENU.
 *
 * "Ficou muito complexo, onde eu não conseguia mais entender e fazer nada.
 *  Vamos simplificar esse aplicativo."
 *
 * Eram oito abas na barra e mais oito num menu do topo. Um menu de abas é uma
 * lista de coisas para decidir, e ela não quer decidir — ela quer mandar os
 * relatórios e ler a resposta. Então a barra passou a ser o aplicativo inteiro:
 * se não está aqui, se entra por dentro de uma destas cinco.
 *
 * A ordem é a do dia dela: manda os arquivos, olha o caixa, cobra o comercial.
 * Comissão e fechamento são de fim de mês e ficam no fim.
 */
export const MODULOS = [
  { path: '/arquivos', icone: '📤', label: 'Enviar', titulo: 'Mandar os relatórios' },
  { path: '/fluxo', icone: '💧', label: 'Caixa', titulo: 'Fluxo de caixa' },
  { path: '/', icone: '📈', label: 'Hoje', titulo: 'Hoje' },
  { path: '/comissoes', icone: '🎯', label: 'Comissão', titulo: 'Comissão' },
  { path: '/fechamento', icone: '📁', label: 'Fechamento', titulo: 'Fechamento do mês' },
];

/**
 * Telas que existem, mas não disputam espaço: chega-se nelas pelo lugar onde a
 * pergunta nasce — o comercial leva ao vendedor, ao orçamento, à margem, à curva
 * ABC e ao cliente; a comissão leva ao RT. Ajustes mora no canto do topo.
 */
export const OUTRAS = [
  { path: '/comercial', icone: '📊', label: 'Comercial', titulo: 'Comercial' },
  { path: '/orcamentos', icone: '📝', label: 'Orçamentos', titulo: 'Orçamentos' },
  { path: '/margem', icone: '📐', label: 'Margem e frete', titulo: 'Margem e frete' },
  { path: '/produtos', icone: '📦', label: 'Produtos e curva ABC', titulo: 'Produtos e curva ABC' },
  { path: '/clientes', icone: '👥', label: 'Clientes', titulo: 'Clientes' },
  { path: '/rt', icone: '🤝', label: 'RT', titulo: 'RT (indicação)' },
  { path: '/ajustes', icone: '⚙️', label: 'Ajustes', titulo: 'Ajustes' },
];

const TODAS = [...MODULOS, ...OUTRAS];

let refs = {};

export function montarShell(raiz) {
  const outlet = h('main.conteudo');
  const titulo = h('h1', 'Hoje');
  const subtitulo = h('span');
  const voltar = h('button.topo__voltar', { onClick: () => history.back(), style: { display: 'none' } }, '‹');

  const marca = h('span.topo__marca', divisa(24, { cor: 'var(--marca)' }));

  // Mandar os relatórios virou a primeira aba da barra, então o atalho do topo
  // saiu: dois botões para o mesmo lugar é uma escolha a mais, não a menos.
  const menu = h('button.topo__acao', { onClick: abrirMenu, title: 'Ajustes e mais telas' }, '☰');

  const topo = h('header.topo',
    voltar,
    marca,
    h('div.topo__titulo', titulo, subtitulo),
    menu);

  const nav = h('nav.nav', ...MODULOS.map((m) => h('a.nav__item', {
    href: `#${m.path}`,
    dataset: { path: m.path },
  }, h('span', m.icone), h('span', m.label))));

  raiz.replaceChildren(h('div.app', topo, nav, outlet));
  refs = { outlet, titulo, subtitulo, nav, voltar, marca };
  return outlet;
}

function abrirMenu() {
  detalhe('Ajustes e mais telas',
    h('div.empilha', { style: { gap: '4px' } },
      ...OUTRAS
        .map((m) => h('button.item.card--clicavel', {
          onClick: () => { fecharFolha(); navigate(m.path); },
        },
        h('span.tarefa__icone', m.icone),
        h('div.item__corpo', h('div.item__titulo', m.label)),
        h('span', '›')))));
}

export function aoTrocarRota(route, params) {
  const modulo = TODAS.find((m) => m.path === route.path)
    || TODAS.find((m) => m.path !== '/' && route.path.startsWith(m.path));
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

/**
 * A pendência de vendedor não tem mais aba própria — ela aparece no Hoje, que é
 * onde a pergunta importa ("de quem foi esta venda?"). A bolinha vai para lá.
 */
export function marcarPendencias(quantidade) {
  const el = refs.nav?.querySelector('[data-path="/"]');
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
