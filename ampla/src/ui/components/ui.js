/** Blocos visuais reutilizados por todas as telas. */

import { h } from '../../core/dom.js';
import { money, moneyShort, pct, num, formatDate } from '../../core/format.js';

/** Número grande com rótulo. `cor` aceita 'ok' | 'atencao' | 'ruim' | 'info' | 'roxo'. */
export function kpi({ label, valor, nota, cor, icone, tamanho, destaque, onClick, href }) {
  const cores = {
    ok: 'var(--verde)', atencao: 'var(--amarelo)', ruim: 'var(--vermelho)',
    info: 'var(--azul)', roxo: 'var(--roxo)', laranja: 'var(--laranja)',
  };
  const fracas = {
    ok: 'var(--verde-fraco)', atencao: 'var(--amarelo-fraco)', ruim: 'var(--vermelho-fraco)',
    info: 'var(--azul-fraco)', roxo: 'var(--roxo-fraco)', laranja: 'var(--laranja-fraco)',
  };
  const props = {
    class: ['kpi', destaque && 'kpi--destaque', onClick && 'card--clicavel'].filter(Boolean).join(' '),
    style: { '--cor': cores[cor] || 'transparent', '--cor-fraca': fracas[cor] || 'transparent' },
    onClick,
  };
  // número comprido encolhe sozinho: preferimos o valor exato a um valor arredondado
  const comprimento = String(valor).length;
  const escala = tamanho || (comprimento >= 13 ? 'p' : '');
  const corpo = [
    h('span.kpi__label', icone && h('span', icone), label),
    h(`strong.kpi__valor${escala === 'g' ? '.kpi__valor--g' : escala === 'p' ? '.kpi__valor--p' : ''}`,
      { style: cor && escala === 'g' ? { color: cores[cor] } : undefined }, valor),
    nota && h('span.kpi__nota', nota),
  ];
  if (href) return h('a.kpi', { ...props, href }, ...corpo);
  return h(onClick ? 'button.kpi' : 'div.kpi', props, ...corpo);
}

export function progresso({ valor, total, cor = 'var(--azul)', esquerda, direita, fina }) {
  const percentual = total ? Math.min((valor / total) * 100, 100) : 0;
  return h(`div.progresso${fina ? '.progresso--fina' : ''}`,
    h('div.progresso__trilho', h('div.progresso__barra', { style: { width: `${percentual}%`, '--cor': cor } })),
    (esquerda || direita) && h('div.progresso__legenda',
      h('span', esquerda || ''),
      h('span', direita || '')));
}

export function chips(opcoes, atual, aoEscolher) {
  return h('div.chips', ...opcoes.map((o) => h(
    `button.chip${o.id === atual ? '.chip--ativo' : ''}${o.destaque ? '.chip--destaque' : ''}`,
    { onClick: () => aoEscolher(o.id) },
    o.label,
    o.contador != null && h('span.chip__contador', o.contador),
  )));
}

export function selo(texto, tipo) {
  return h(`span.selo${tipo ? `.selo--${tipo}` : ''}`, texto);
}

export function secao(titulo, acao, ...filhos) {
  return h('section.secao',
    (titulo || acao) && h('div.secao__topo', titulo && h('h2', titulo), acao),
    ...filhos);
}

export function card(titulo, acao, ...filhos) {
  return h('div.card',
    (titulo || acao) && h('div.card__titulo', titulo && h('h2', titulo), acao),
    ...filhos);
}

export function vazio(icone, titulo, texto, acao) {
  return h('div.vazio',
    h('div.vazio__icone', icone),
    h('h3', titulo),
    texto && h('p.pequeno', texto),
    acao);
}

export function aviso(texto, tipo = 'info', acao) {
  return h(`div.aviso.aviso--${tipo}`, h('div.crescer', texto), acao);
}

export function botao(texto, { tipo, onClick, icone, pequeno, grande, bloco, desabilitado, href } = {}) {
  const classe = ['btn',
    tipo && `btn--${tipo}`,
    pequeno && 'btn--pequeno',
    grande && 'btn--grande',
    bloco && 'btn--bloco'].filter(Boolean).join('.');
  if (href) return h(`a.${classe}`, { href }, icone && h('span', icone), texto);
  return h(`button.${classe}`, { onClick, disabled: desabilitado }, icone && h('span', icone), texto);
}

/** Linha de ranking com barra proporcional. */
export function rankLinha({ posicao, nome, valor, percentual, sub, cor = 'var(--azul)', onClick }) {
  return h(onClick ? 'button.rank__linha' : 'div.rank__linha', { onClick },
    h(`span.rank__pos${posicao <= 3 ? `.rank__pos--${posicao}` : ''}`, posicao),
    h('div.rank__meio',
      h('div.rank__nome',
        h('span', nome),
        h('span.rank__valor', money(valor))),
      h('div.progresso__trilho', { style: { height: '6px' } },
        h('div.progresso__barra', { style: { width: `${Math.max(percentual, 1)}%`, '--cor': cor } })),
      sub && h('span.mini.muted', sub)),
    onClick && h('span.muted', '›'));
}

/** Item de lista com cor de status à esquerda. */
export function item({ status, titulo, sub, valor, valorNota, acoes, onClick, extra, concluido }) {
  return h(`div.item${status ? `.item--st.st-${status}` : ''}${concluido ? '.item--concluido' : ''}`,
    { class: onClick ? 'card--clicavel' : '', onClick },
    status && h('span.ponto'),
    h('div.item__corpo',
      h('div.item__titulo', titulo),
      sub && h('div.item__sub', ...(Array.isArray(sub) ? sub : [sub])),
      extra),
    valor != null && h('div.empilha',
      h('div.item__valor', typeof valor === 'string' ? valor : money(valor)),
      valorNota && h('div.mini.muted.dir', valorNota)),
    acoes);
}

export const fmt = { money, moneyShort, pct, num, formatDate };

/** Variação percentual com seta e cor. */
export function variacao(valor, { invertido = false } = {}) {
  if (valor == null || !Number.isFinite(valor)) return h('span.mini.muted', '—');
  const positivo = valor >= 0;
  const bom = invertido ? !positivo : positivo;
  return h(`span.mini.${bom ? 'ok' : 'ruim'}`,
    `${positivo ? '▲' : '▼'} ${pct(Math.abs(valor), 1)}`);
}
