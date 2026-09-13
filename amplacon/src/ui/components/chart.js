/** Gráficos em SVG puro — simples de ler, sem biblioteca. */

import { h } from '../../core/dom.js';
import { moneyShort } from '../../core/format.js';

const L = { esq: 6, dir: 6, topo: 10, base: 20 };

/**
 * Linha/área com linha do zero e, opcionalmente, linha de meta.
 * @param {Array<{rotulo:string, valor:number}>} pontos
 */
export function grafLinha(pontos, { altura = 130, cor = 'var(--azul)', meta = null, rotulos = 4 } = {}) {
  if (!pontos.length) return h('div.vazio.pequeno', 'Sem dados no período.');
  const larg = 320;
  const valores = pontos.map((p) => p.valor);
  const candidatos = [...valores, 0, ...(meta ? [meta] : [])];
  const max = Math.max(...candidatos);
  const min = Math.min(...candidatos);
  const faixa = (max - min) || 1;
  const y = (v) => L.topo + (altura - L.topo - L.base) * (1 - (v - min) / faixa);
  const x = (i) => L.esq + (larg - L.esq - L.dir) * (pontos.length === 1 ? 0.5 : i / (pontos.length - 1));

  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ');
  const area = `${caminho} L${x(pontos.length - 1).toFixed(1)} ${y(Math.max(min, 0)).toFixed(1)} L${x(0).toFixed(1)} ${y(Math.max(min, 0)).toFixed(1)} Z`;
  const passo = Math.max(1, Math.ceil(pontos.length / rotulos));

  return h('svg.gr', { viewBox: `0 0 ${larg} ${altura}`, preserveAspectRatio: 'none', style: { height: `${altura}px` } },
    min < 0 && h('line.gr__zero', { x1: L.esq, x2: larg - L.dir, y1: y(0), y2: y(0) }),
    meta != null && h('line.gr__meta', { x1: L.esq, x2: larg - L.dir, y1: y(meta), y2: y(meta) }),
    h('path.gr__area', { d: area, style: { fill: `color-mix(in srgb, ${cor} 16%, transparent)` } }),
    h('path.gr__linha', { d: caminho, style: { stroke: cor } }),
    ...pontos.map((p, i) => (i === pontos.length - 1
      ? h('circle.gr__ponto', { cx: x(i), cy: y(p.valor), r: 3.2, style: { fill: cor } })
      : null)),
    ...pontos.map((p, i) => (i % passo === 0 || i === pontos.length - 1
      ? h('text.gr__rotulo', {
        x: x(i), y: altura - 5,
        'text-anchor': i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle',
      }, p.rotulo)
      : null)));
}

/** Barras verticais. Valores negativos descem abaixo da linha do zero. */
export function grafBarras(itens, { altura = 150, cor = 'var(--azul)', formatar = moneyShort, mostrarValor = true } = {}) {
  if (!itens.length) return h('div.vazio.pequeno', 'Sem dados no período.');
  const larg = 320;
  const topo = mostrarValor ? 18 : 8;
  const base = 20;
  const valores = itens.map((i) => i.valor);
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const faixa = (max - min) || 1;
  const alturaUtil = altura - topo - base;
  const y = (v) => topo + alturaUtil * (1 - (v - min) / faixa);
  const larguraBarra = Math.min(34, ((larg - 12) / itens.length) * 0.62);
  const passoX = (larg - 12) / itens.length;

  return h('svg.gr', { viewBox: `0 0 ${larg} ${altura}`, style: { height: `${altura}px` } },
    min < 0 && h('line.gr__zero', { x1: 6, x2: larg - 6, y1: y(0), y2: y(0) }),
    ...itens.flatMap((item, i) => {
      const cx = 6 + passoX * i + passoX / 2;
      const yTopo = y(Math.max(item.valor, 0));
      const yBase = y(Math.min(item.valor, 0));
      const alt = Math.max(Math.abs(yBase - yTopo), 2);
      return [
        h('rect.gr__barra', {
          x: cx - larguraBarra / 2, y: yTopo, width: larguraBarra, height: alt, rx: 3,
          style: { fill: item.cor || cor },
        }),
        item.meta != null && item.meta > 0 && h('line.gr__meta', {
          x1: cx - larguraBarra / 2 - 2, x2: cx + larguraBarra / 2 + 2, y1: y(item.meta), y2: y(item.meta),
        }),
        mostrarValor && h('text.gr__rotulo', {
          x: cx, y: yTopo - 5, 'text-anchor': 'middle', style: { fill: 'var(--txt-2)', fontWeight: 700 },
        }, formatar(item.valor)),
        h('text.gr__rotulo', { x: cx, y: altura - 5, 'text-anchor': 'middle' }, item.rotulo),
      ];
    }));
}

/** Mini gráfico sem eixos, para caber dentro de um card. */
export function sparkline(valores, { altura = 34, cor = 'var(--azul)' } = {}) {
  if (!valores.length) return h('div');
  const larg = 100;
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const faixa = (max - min) || 1;
  const pontos = valores.map((v, i) => `${(larg * (valores.length === 1 ? 0.5 : i / (valores.length - 1))).toFixed(1)},${(altura - (altura - 4) * ((v - min) / faixa) - 2).toFixed(1)}`);
  return h('svg.gr', { viewBox: `0 0 ${larg} ${altura}`, preserveAspectRatio: 'none', style: { height: `${altura}px` } },
    h('polyline.gr__linha', { points: pontos.join(' '), style: { stroke: cor, strokeWidth: 2 } }));
}

/** Barra horizontal comparativa (usada em ABC e nas faixas de atraso). */
export function barraHorizontal(percentual, cor = 'var(--azul)') {
  return h('div.barra-linha__trilho',
    h('div.barra-linha__barra', { style: { width: `${Math.max(Math.min(percentual, 100), 1)}%`, '--cor': cor } }));
}
