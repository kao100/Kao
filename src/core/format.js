/** Datas, números e formatações — sempre em horário local (nunca UTC). */

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_LABEL = {
  sun: 'Domingo', mon: 'Segunda', tue: 'Terça', wed: 'Quarta',
  thu: 'Quinta', fri: 'Sexta', sat: 'Sábado',
};
export const DAY_SHORT = { sun: 'Dom', mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb' };
export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** 'YYYY-MM-DD' a partir de um Date local. */
export function isoDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date local (meio-dia, para evitar problemas de fuso) a partir de 'YYYY-MM-DD'. */
export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function today() { return isoDate(new Date()); }

export function addDays(iso, delta) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function dayKey(iso) {
  return DAY_KEYS[parseDate(iso).getDay()];
}

export function dayLabel(iso) { return DAY_LABEL[dayKey(iso)]; }

export function daysBetween(isoA, isoB) {
  return Math.round((parseDate(isoB) - parseDate(isoA)) / 86400000);
}

/** Segunda-feira da semana de uma data (semana começa na segunda). */
export function weekStart(iso) {
  const d = parseDate(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

export function weekDates(iso) {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatDate(iso, style = 'short') {
  const d = parseDate(iso);
  if (style === 'long') return `${DAY_LABEL[DAY_KEYS[d.getDay()]]}, ${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()}`;
  if (style === 'medium') return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}`;
  if (style === 'full') return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function relativeDay(iso) {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  if (diff === 1) return 'Amanhã';
  if (diff < 0 && diff > -7) return `${-diff} dias atrás`;
  return formatDate(iso, 'medium');
}

/** 125 -> '2h 05' ; 47 -> '47 min' */
export function formatMinutes(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`;
}

/** segundos -> 'MM:SS' (ou '-MM:SS' quando negativo) */
export function mmss(totalSeconds) {
  const neg = totalSeconds < 0;
  const s = Math.abs(Math.round(totalSeconds));
  return `${neg ? '+' : ''}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Número com no máximo `d` casas, sem zeros à direita. 42.50 -> '42,5' */
export function num(value, d = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  const n = Number(value);
  const fixed = n.toFixed(d);
  return String(parseFloat(fixed)).replace('.', ',');
}

export function kg(value, d = 1) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  return `${num(value, d)} kg`;
}

export function signed(value, d = 1, unit = '') {
  if (value == null || Number.isNaN(value)) return '—';
  const s = value > 0 ? '+' : '';
  return `${s}${num(value, d)}${unit}`;
}

export function pct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeOfDay(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
