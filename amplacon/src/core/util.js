/** Utilidades sem domínio: ids, texto, comparação e download. */

export function uid(prefix = '') {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}${prefix ? '_' : ''}${Date.now().toString(36)}${rnd}`;
}

/** Hash estável (FNV-1a) — usado para detectar arquivo repetido e assinar cabeçalhos. */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export async function hashFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${bytes.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

/** 'Eduardo  SILVA ' -> 'eduardo silva' (para comparar nomes vindos de arquivos diferentes). */
export function normalize(str) {
  return String(str ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Chave de comparação sem pontuação: 'Cimento CP-II 50kg' -> 'cimentocpii50kg'. */
export function key(str) {
  return normalize(str).replace(/[^a-z0-9]/g, '');
}

/** Só os dígitos (CNPJ, CPF, telefone, número de NF). */
export function digits(str) {
  return String(str ?? '').replace(/\D/g, '');
}

/** Número de documento sem zeros à esquerda: '000123' -> '123'. */
export function docNumber(str) {
  const d = digits(str);
  return d ? String(Number(d)) : '';
}

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

export function groupBy(list, fn) {
  const map = new Map();
  for (const item of list) {
    const k = fn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

export function sortBy(list, fn, dir = 'asc') {
  const mul = dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const va = fn(a); const vb = fn(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va > vb ? mul : va < vb ? -mul : 0;
  });
}

/** Arredonda para centavos — evita 0,1 + 0,2 aparecendo como divergência. */
export function cents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Duas quantias são iguais para efeito de conciliação? (tolerância em centavos) */
export function sameMoney(a, b, toleranceCents = 0) {
  return Math.abs(Math.round((Number(a) || 0) * 100) - Math.round((Number(b) || 0) * 100)) <= toleranceCents;
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function debounce(fn, ms = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Lê um arquivo como texto detectando UTF-8 x Latin-1 (arquivos de ERP costumam ser Latin-1). */
export async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3));
  }
  const strict = new TextDecoder('utf-8', { fatal: true });
  try {
    return strict.decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
