/** Utilidades genéricas. */

export function uid(prefix = 'id') {
  const rnd = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
    .replace(/-/g, '').slice(0, 12);
  return `${prefix}_${rnd}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sum(list, pick = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
}

export function avg(list, pick = (x) => x) {
  const valid = list.map(pick).filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function maxBy(list, pick) {
  let best = null;
  let bestVal = -Infinity;
  for (const item of list) {
    const v = Number(pick(item));
    if (!Number.isNaN(v) && v > bestVal) { bestVal = v; best = item; }
  }
  return best;
}

export function groupBy(list, pick) {
  const map = new Map();
  for (const item of list) {
    const key = pick(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function sortBy(list, pick, dir = 'asc') {
  const copy = [...list];
  copy.sort((a, b) => {
    const va = pick(a); const vb = pick(b);
    if (va === vb) return 0;
    return (va > vb ? 1 : -1) * (dir === 'desc' ? -1 : 1);
  });
  return copy;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* blobs etc. */ }
  }
  return JSON.parse(JSON.stringify(value));
}

/** Lê um File/Blob como data URL (fotos das máquinas e do físico). */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Redimensiona uma imagem antes de salvar, para o banco local não crescer demais.
 * Devolve um data URL JPEG.
 */
export async function resizeImage(file, maxSide = 1280, quality = 0.82) {
  const dataUrl = await fileToDataURL(file);
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (scale >= 1 && dataUrl.length < 900_000) return dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function downloadFile(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const headers = [...rows.reduce((set, row) => {
    Object.keys(row).forEach((k) => set.add(k));
    return set;
  }, new Set())];
  const escapeCell = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(','))].join('\n');
}
