/** CSV / TXT delimitado — detecta o separador e respeita aspas. */

const CANDIDATES = [';', ',', '\t', '|'];

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  if (!lines.length) return ';';
  let best = ';';
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const first = counts[0];
    if (first < 2) continue;
    // bom separador: muitas colunas e contagem estável entre as linhas
    const stable = counts.filter((c) => c === first).length / counts.length;
    const score = first * stable;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function splitLine(line, delimiter) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Texto -> matriz de strings. Junta linhas quando há quebra dentro de aspas. */
export function parseCsv(text, delimiter) {
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let pending = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = pending ? `${pending}\n${rawLine}` : rawLine;
    const quotes = (line.match(/"/g) || []).length;
    if (quotes % 2 === 1) { pending = line; continue; }
    pending = '';
    if (!line.trim()) continue;
    rows.push(splitLine(line, d).map((v) => v.trim()));
  }
  if (pending.trim()) rows.push(splitLine(pending, d).map((v) => v.trim()));
  return rows;
}

export function toCsv(rows, delimiter = ';') {
  return rows.map((row) => row.map((cell) => {
    const s = cell == null ? '' : String(cell);
    return /["\n\r;,\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(delimiter)).join('\r\n');
}
