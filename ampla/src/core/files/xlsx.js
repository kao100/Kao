/** Leitura de .xlsx — planilha -> matriz de valores (datas já viram 'YYYY-MM-DD'). */

import { unzip, textOf } from './zip.js';
import { excelSerialToIso } from '../format.js';

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

export async function readXlsx(arrayBuffer) {
  const files = await unzip(arrayBuffer);
  const shared = parseSharedStrings(textOf(files['xl/sharedStrings.xml']));
  const dateStyles = parseStyles(textOf(files['xl/styles.xml']));
  const sheets = listSheets(textOf(files['xl/workbook.xml']), textOf(files['xl/_rels/workbook.xml.rels']));

  const out = [];
  for (const sheet of sheets) {
    const bytes = files[sheet.path] || files[sheet.path.replace(/^xl\//, '')];
    if (!bytes) continue;
    out.push({ name: sheet.name, rows: parseSheet(textOf(bytes), shared, dateStyles) });
  }
  if (!out.length) throw new Error('Nenhuma planilha encontrada no arquivo.');
  return out;
}

function listSheets(workbookXml, relsXml) {
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheets = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = decodeXml(attr(m[0], 'name') || `Planilha ${sheets.length + 1}`);
    const rid = attr(m[0], 'r:id') || attr(m[0], 'id');
    const target = rels[rid] || `worksheets/sheet${sheets.length + 1}.xml`;
    sheets.push({ name, path: `xl/${target}` });
  }
  return sheets.length ? sheets : [{ name: 'Planilha1', path: 'xl/worksheets/sheet1.xml' }];
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = '';
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXml(t[1]);
    out.push(text);
  }
  return out;
}

/** Índices de estilo que representam data (para converter o serial). */
function parseStyles(xml) {
  const dateFormats = new Set(BUILTIN_DATE_FORMATS);
  if (!xml) return new Set();
  for (const m of xml.matchAll(/<numFmt\b[^>]*\/>/g)) {
    const id = Number(attr(m[0], 'numFmtId'));
    const code = decodeXml(attr(m[0], 'formatCode') || '');
    if (/[dmyhs]/i.test(code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''))) dateFormats.add(id);
  }
  const cellXfs = xml.match(/<cellXfs[\s\S]*?<\/cellXfs>/);
  const styles = new Set();
  if (!cellXfs) return styles;
  let index = 0;
  for (const m of cellXfs[0].matchAll(/<xf\b[^>]*\/?>/g)) {
    if (dateFormats.has(Number(attr(m[0], 'numFmtId')))) styles.add(index);
    index += 1;
  }
  return styles;
}

function parseSheet(xml, shared, dateStyles) {
  const rows = [];
  // atenção: os atributos precisam ser preguiçosos, senão uma célula vazia
  // (<c r="B5"/>) engole o valor da célula seguinte.
  for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = [];
    for (const cellMatch of (rowMatch[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] || '';
      const ref = attr(attrs, 'r');
      const col = ref ? colIndex(ref) : cells.length;
      const type = attr(attrs, 't');
      const style = Number(attr(attrs, 's') || -1);
      cells[col] = cellValue(type, style, body, shared, dateStyles);
    }
    for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  // remove linhas totalmente vazias no fim
  while (rows.length && rows[rows.length - 1].every((c) => c === '' || c == null)) rows.pop();
  return rows;
}

function cellValue(type, style, body, shared, dateStyles) {
  if (type === 'inlineStr') {
    let text = '';
    for (const t of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXml(t[1]);
    return text;
  }
  const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
  if (!vMatch) return '';
  const raw = decodeXml(vMatch[1]);
  if (type === 's') return shared[Number(raw)] ?? '';
  if (type === 'b') return raw === '1' ? 'SIM' : 'NÃO';
  if (type === 'str' || type === 'e') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (dateStyles.has(style)) return excelSerialToIso(n) || n;
  return n;
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name.replace(':', '\\:')}="([^"]*)"`));
  return m ? m[1] : '';
}

function decodeXml(str) {
  return String(str)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCharCode(parseInt(x, 16)))
    .replace(/&amp;/g, '&');
}
