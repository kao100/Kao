/** Gráficos em SVG puro (linha e barras), leves e legíveis no celular. */

import { h, svgFromString } from '../../core/dom.js';
import { parseDate, formatDate } from '../../core/format.js';

const W = 320;
const PALETTE = {
  volt: '#C8FF4D',
  cardio: '#4CC8FF',
  flame: '#FF7A34',
  ball: '#48E28A',
  warn: '#FFC53D',
  danger: '#FF5C5C',
  recover: '#A88BFF',
};

export function chartColor(name) { return PALETTE[name] || name || PALETTE.volt; }

/**
 * Gráfico de linha por data.
 * @param {object} opts
 * @param {Array<{date:string, value:number, marker?:string}>} opts.points
 * @param {string} [opts.color]
 * @param {number} [opts.height]
 * @param {(v:number)=>string} [opts.formatValue]
 * @param {number} [opts.yMin] @param {number} [opts.yMax]
 * @param {string} [opts.emptyText]
 */
export function lineChart({
  points, color = 'volt', height = 150, formatValue = (v) => String(v),
  yMin = null, yMax = null, emptyText = 'Sem dados ainda', area = true, dots = true,
}) {
  const data = (points || []).filter((p) => p && p.value != null && !Number.isNaN(Number(p.value)));
  if (data.length === 0) return h('div.chart__empty', emptyText);
  if (data.length === 1) {
    return h('div.chart',
      h('div.center', { style: { padding: '18px 0' } },
        h('div', { style: { fontSize: '28px', fontWeight: '780', fontFamily: 'var(--num)' } }, formatValue(data[0].value)),
        h('div.muted', { style: { fontSize: '12px' } }, formatDate(data[0].date, 'full')),
        h('div.muted', { style: { fontSize: '12px', marginTop: '6px' } }, 'Registre mais vezes para ver a curva de evolução.'),
      ));
  }

  const stroke = chartColor(color);
  const padL = 34; const padR = 10; const padT = 12; const padB = 22;
  const times = data.map((p) => parseDate(p.date).getTime());
  const tMin = Math.min(...times); const tMax = Math.max(...times);
  const vals = data.map((p) => Number(p.value));
  const vMin = yMin != null ? yMin : Math.min(...vals);
  const vMaxRaw = yMax != null ? yMax : Math.max(...vals);
  const vMax = vMaxRaw === vMin ? vMin + 1 : vMaxRaw;

  const x = (t) => padL + ((t - tMin) / (tMax - tMin || 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * (height - padT - padB);

  const coords = data.map((p, i) => [x(times[i]), y(Number(p.value))]);
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  const areaPath = `${path} L${coords.at(-1)[0].toFixed(1)},${height - padB} L${coords[0][0].toFixed(1)},${height - padB} Z`;

  const gridVals = [vMin, (vMin + vMax) / 2, vMax];
  const grid = gridVals.map((v) => `
    <line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="#232830" stroke-width="1"/>
    <text x="${padL - 6}" y="${(y(v) + 3.5).toFixed(1)}" fill="#7C8695" font-size="9" text-anchor="end" font-family="monospace">${formatValue(v)}</text>`).join('');

  const marks = dots ? coords.map((c, i) => {
    const p = data[i];
    const isLast = i === coords.length - 1;
    const special = p.marker ? `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="6" fill="none" stroke="${PALETTE.danger}" stroke-width="1.5"/>` : '';
    return `${special}<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${isLast ? 4 : 2.6}" fill="${stroke}"/>`;
  }).join('') : '';

  const xLabels = `
    <text x="${padL}" y="${height - 6}" fill="#7C8695" font-size="9" font-family="monospace">${formatDate(data[0].date)}</text>
    <text x="${W - padR}" y="${height - 6}" fill="#7C8695" font-size="9" text-anchor="end" font-family="monospace">${formatDate(data.at(-1).date)}</text>`;

  const svg = `<svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g-${color}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${stroke}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    ${area ? `<path d="${areaPath}" fill="url(#g-${color})"/>` : ''}
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${marks}
    ${xLabels}
  </svg>`;

  return h('div.chart', svgFromString(svg));
}

/**
 * Gráfico de barras (volume por semana, minutos por dia…).
 * @param {Array<{label:string, value:number, color?:string, sub?:string}>} data
 */
export function barChart({ data, height = 150, formatValue = (v) => String(Math.round(v)), color = 'volt', emptyText = 'Sem dados ainda' }) {
  const rows = (data || []).filter((d) => d && d.value != null);
  if (!rows.length) return h('div.chart__empty', emptyText);

  const padT = 14; const padB = 22; const padL = 4; const padR = 4;
  const max = Math.max(...rows.map((r) => Number(r.value)), 1);
  const slot = (W - padL - padR) / rows.length;
  const barW = Math.max(6, Math.min(30, slot * 0.6));

  const bars = rows.map((r, i) => {
    const value = Number(r.value) || 0;
    const bh = Math.max(2, ((value / max) * (height - padT - padB)));
    const bx = padL + slot * i + (slot - barW) / 2;
    const by = height - padB - bh;
    const fill = chartColor(r.color || color);
    return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${fill}" opacity="${value ? 0.9 : 0.25}"/>
      <text x="${(bx + barW / 2).toFixed(1)}" y="${(by - 4).toFixed(1)}" fill="#B6BEC9" font-size="8.5" text-anchor="middle" font-family="monospace">${value ? formatValue(value) : ''}</text>
      <text x="${(bx + barW / 2).toFixed(1)}" y="${height - 6}" fill="#7C8695" font-size="9" text-anchor="middle">${r.label}</text>`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${W} ${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${padL}" y1="${height - padB}" x2="${W - padR}" y2="${height - padB}" stroke="#232830" stroke-width="1"/>
    ${bars}
  </svg>`;
  return h('div.chart', svgFromString(svg));
}

export function legend(items) {
  return h('div.chart-legend',
    ...items.map((it) => h('span', h('span.chart-legend__dot', { style: { background: chartColor(it.color) } }), it.label)));
}
