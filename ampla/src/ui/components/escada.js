/**
 * ESCADA — a conta de cima para baixo, com as linhas que abrem.
 *
 * "Ele pega a receita bruta, aí você tá vendendo deduções de receita. E aí você
 *  consegue ver, ó, você abre as deduções de receita e vê aqui, ó. (…) Aí a
 *  gente fecha, consegue fechar isso."
 *
 * Um DRE não é uma tabela: é uma conta. Cada linha soma ou subtrai da anterior
 * e o total de uma linha é a soma das contas que estão dentro dela. Então a
 * forma certa é a escada — o valor à direita, o sinal à esquerda, e a linha que
 * tem detalhe abre no lugar, sem trocar de tela.
 *
 * O que está aberto fica guardado na memória do módulo, e não no nó: quando a
 * tela se redesenha (ela redesenha a cada importação, a cada filtro), a linha
 * que ela abriu continua aberta. Perder o lugar a cada clique é o tipo de coisa
 * que faz a pessoa desistir de procurar.
 */

import { h } from '../../core/dom.js';
import { money, pct } from '../../core/format.js';

const ABERTAS = new Set();

export function estaAberta(id) { return ABERTAS.has(id); }
export function esquecerAberturas() { ABERTAS.clear(); }

/**
 * @param {Array} linhas  cada uma:
 *   { id, rotulo, valor, tipo, sinal, nota, percentual, detalhe, colunas }
 *   tipo: 'linha' (padrão) | 'subtotal' | 'resultado'
 *   sinal: '+' | '−' | null  — só decoração, o valor já vem com o sinal certo
 *   detalhe: [{ nome, valor, nota }] ou função que devolve isso
 */
export function escada(linhas, { rotuloPercentual = '% da receita' } = {}) {
  return h('div.escada', ...linhas.filter(Boolean).map((l) => linha(l, rotuloPercentual)));
}

function linha(l, rotuloPercentual) {
  const detalhe = typeof l.detalhe === 'function' ? l.detalhe() : l.detalhe;
  const temDetalhe = Array.isArray(detalhe) && detalhe.length > 0;
  const id = l.id || l.rotulo;
  const aberta = temDetalhe && ABERTAS.has(id);

  const caixa = h(`div.escada__item.escada__item--${l.tipo || 'linha'}`);
  const filhos = h('div.escada__filhos', { style: { display: aberta ? '' : 'none' } },
    ...(temDetalhe ? detalhe.map((d) => filho(d, l.base)) : []));

  const seta = temDetalhe ? h('span.escada__seta', aberta ? '▾' : '▸') : null;

  const corpo = h('div.escada__linha',
    h('span.escada__sinal', l.sinal || ''),
    h('div.escada__nome',
      h('span.escada__rotulo', l.rotulo),
      l.nota && h('span.escada__nota', l.nota)),
    h('div.escada__valor',
      h('span.num', l.valor == null ? '—' : money(l.valor)),
      l.percentual != null && h('span.escada__pct', { title: rotuloPercentual }, pct(l.percentual, 1))),
    seta);

  if (temDetalhe) {
    const botao = h('button.escada__abrir', {
      type: 'button',
      'aria-expanded': aberta ? 'true' : 'false',
      onClick: () => {
        const agora = !ABERTAS.has(id);
        if (agora) ABERTAS.add(id); else ABERTAS.delete(id);
        filhos.style.display = agora ? '' : 'none';
        seta.textContent = agora ? '▾' : '▸';
        botao.setAttribute('aria-expanded', agora ? 'true' : 'false');
      },
    }, corpo);
    caixa.append(botao, filhos);
  } else {
    caixa.append(corpo);
  }
  return caixa;
}

function filho(d, base) {
  const parte = base && d.valor != null ? (Math.abs(d.valor) / Math.abs(base)) * 100 : null;
  const sub = [d.nota, d.itens ? `${d.itens} lançamento${d.itens === 1 ? '' : 's'}` : null]
    .filter(Boolean).join(' · ');
  return h('div.escada__filho',
    h('div.escada__nome',
      h('span.pequeno', d.nome),
      sub && h('span.escada__nota', sub)),
    h('div.escada__valor',
      h('span.num.pequeno', d.valor == null ? '—' : money(d.valor)),
      parte != null && h('span.escada__pct', pct(parte, 1))));
}

/**
 * ÁRVORE — 1, 1.1, 1.1.1, abrindo quantos níveis houver.
 *
 * "Você abre e vai abrindo e vai desmembrando as coisas."
 *
 * A escada acima abre um nível; esta abre todos. A numeração não é enfeite: é
 * como ela aponta para uma linha — "essa 2.3.1 aqui" — sem precisar do nome
 * inteiro, que no plano de contas costuma ter sete palavras.
 *
 * @param {Array<{numero, nome, valor, itens, filhos}>} nos
 */
export function arvore(nos, { prefixo = 'arv' } = {}) {
  /* a raiz não tem percentual: 100% de si mesma não diz nada. Cada filho mostra
     quanto ele é DO PAI, que é a pergunta de quem está abrindo a linha. */
  return h('div.escada', ...nos.map((n) => galho(n, 0, null, prefixo)));
}

function galho(no, nivel, base, prefixo) {
  const id = `${prefixo}-${no.numero}`;
  const temFilhos = (no.filhos || []).length > 0;
  const aberta = temFilhos && ABERTAS.has(id);
  const parte = base && no.valor != null ? (Math.abs(no.valor) / Math.abs(base)) * 100 : null;

  const filhos = h('div.escada__galhos', { style: { display: aberta ? '' : 'none' } },
    ...(temFilhos ? no.filhos.map((f) => galho(f, nivel + 1, no.valor, prefixo)) : []));

  const seta = temFilhos ? h('span.escada__seta', aberta ? '▾' : '▸') : null;
  const corpo = h('div.escada__linha', { style: { paddingLeft: `${13 + nivel * 16}px` } },
    h('span.escada__numero', no.numero),
    h('div.escada__nome',
      h('span.escada__rotulo', { style: nivel ? { fontWeight: '600', fontSize: '12.5px' } : {} }, no.nome),
      no.itens ? h('span.escada__nota', `${no.itens} lançamento${no.itens === 1 ? '' : 's'}`) : null),
    h('div.escada__valor',
      h('span.num', no.valor == null ? '—' : money(no.valor)),
      parte != null && h('span.escada__pct', pct(parte, 1))),
    seta);

  const caixa = h(`div.escada__item${nivel === 0 ? '.escada__item--subtotal' : ''}`);
  if (temFilhos) {
    const botao = h('button.escada__abrir', {
      type: 'button',
      'aria-expanded': aberta ? 'true' : 'false',
      onClick: () => {
        const agora = !ABERTAS.has(id);
        if (agora) ABERTAS.add(id); else ABERTAS.delete(id);
        filhos.style.display = agora ? '' : 'none';
        seta.textContent = agora ? '▾' : '▸';
        botao.setAttribute('aria-expanded', agora ? 'true' : 'false');
      },
    }, corpo);
    caixa.append(botao, filhos);
  } else {
    caixa.append(corpo);
  }
  return caixa;
}
