/**
 * Datas, dinheiro e números — sempre em horário local e padrão brasileiro.
 * Regra da casa: data interna é sempre a string 'YYYY-MM-DD' (nunca Date com fuso).
 */

export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function isoDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date local ao meio-dia (evita virada de fuso). */
export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function today() { return isoDate(new Date()); }
export function yesterday() { return addDays(today(), -1); }

export function addDays(iso, delta) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function addMonths(iso, delta) {
  const d = parseDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  d.setDate(Math.min(day, daysInMonth(isoDate(d))));
  return isoDate(d);
}

export function daysInMonth(iso) {
  const d = parseDate(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function monthStart(iso = today()) { return `${String(iso).slice(0, 7)}-01`; }
export function monthEnd(iso = today()) { return `${String(iso).slice(0, 7)}-${String(daysInMonth(iso)).padStart(2, '0')}`; }
export function monthKey(iso = today()) { return String(iso).slice(0, 7); }

export function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} de ${y}`;
}
export function monthLabelShort(key) {
  const [y, m] = String(key).split('-').map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]}/${String(y).slice(2)}`;
}

export function daysBetween(isoA, isoB) {
  return Math.round((parseDate(isoB) - parseDate(isoA)) / 86400000);
}

export function weekStart(iso = today()) {
  const d = parseDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

export function eachDay(fromIso, toIso) {
  const out = [];
  for (let d = fromIso; daysBetween(d, toIso) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 'YYYY-MM-DD' -> '12/09/2026' | 'curto' -> '12/09' | 'dia' -> 'sex 12/09' */
export function formatDate(iso, style = 'full') {
  if (!iso) return '—';
  const d = parseDate(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (style === 'short') return `${dd}/${mm}`;
  if (style === 'day') return `${DAY_SHORT[d.getDay()]} ${dd}/${mm}`;
  if (style === 'medium') return `${dd} ${MONTHS_SHORT[d.getMonth()]}`;
  if (style === 'long') return `${dd} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function relativeDay(iso) {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return 'hoje';
  if (diff === -1) return 'ontem';
  if (diff === 1) return 'amanhã';
  if (diff < 0) return `há ${-diff} dias`;
  return `em ${diff} dias`;
}

export function timestampLabel(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${formatDate(isoDate(d))} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ dinheiro */

/** 1234.5 -> 'R$ 1.234,50' */
export function money(value, { sign = false, cents = true } = {}) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n).toLocaleString('pt-BR', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const prefix = n < 0 ? '-' : (sign && n > 0 ? '+' : '');
  return `${prefix}R$ ${abs}`;
}

/** Versão curta para cards grandes: 1.234.567 -> 'R$ 1,23 mi' */
export function moneyShort(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}R$ ${(abs / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (abs >= 1e3) return `${sign}R$ ${(abs / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return money(n);
}

export function num(value, d = 0) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function pct(value, d = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
}

/* --------------------------------------------------- leitura de dados brutos */

/**
 * Converte texto de arquivo em número. Aceita '1.234,56', '1,234.56', '1234.56',
 * 'R$ 1.234,56', '(1.234,56)' (negativo contábil) e '1.234,56-'.
 * Devolve null quando não é número — nunca 0 por suposição.
 */
export function parseNumber(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { negative = true; s = s.replace(/-\s*$/, ''); }
  s = s.replace(/[R$\s ]/gi, '');
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (!/[\d]/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // o separador decimal é o que aparece por último
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // vírgula sozinha: decimal, a não ser que esteja separando milhares (1,234)
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot > -1) {
    // ponto sozinho: no Brasil quase sempre é milhar (1.500); só é decimal se
    // não estiver agrupado de 3 em 3 (1.5 / 1234.56)
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Converte texto/serial de arquivo em 'YYYY-MM-DD'.
 * Aceita dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, aaaammdd, ISO com hora e serial do Excel.
 * Devolve null quando não reconhece — nunca chuta a data.
 */
export function parseAnyDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return isoDate(raw);
  if (typeof raw === 'number') return excelSerialToIso(raw);
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);           // ISO / ISO com hora
  if (m) return validIso(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); // dd/mm/aaaa
  if (m) {
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    return validIso(y, +m[2], +m[1]);
  }

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);                // aaaammdd (OFX)
  if (m) return validIso(+m[1], +m[2], +m[3]);

  if (/^\d+([.,]\d+)?$/.test(s)) return excelSerialToIso(parseNumber(s));
  return null;
}

function validIso(y, m, d) {
  if (!y || !m || !d || m > 12 || d > 31 || y < 1900 || y > 2199) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Serial do Excel (1900) -> ISO. 45000 -> 2023-03-15 */
export function excelSerialToIso(serial) {
  if (serial == null || !Number.isFinite(serial) || serial < 1 || serial > 80000) return null;
  const days = Math.floor(serial);
  // O Excel considera 1900 bissexto (bug histórico): dias >= 60 pedem -1.
  const base = Date.UTC(1899, 11, 31);
  const ms = base + (days - (days >= 60 ? 1 : 0)) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
