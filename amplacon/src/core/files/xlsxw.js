/**
 * Escrita de .xlsx (sem dependências): cabeçalho formatado, filtro, painel
 * congelado, moeda/data/percentual com o tipo certo — para analisar no Excel.
 */

import { zipSync } from './zip.js';

const STYLE = { text: 0, header: 1, money: 2, date: 3, pct: 4, num: 5, title: 6, totalMoney: 7, totalText: 8, int: 9 };

/**
 * @param {Array<{name:string, columns:Array, rows:Array<object>, title?:string, total?:object}>} sheets
 *  columns: { header, key, type: 'text'|'money'|'date'|'pct'|'num'|'int', width }
 */
export function buildXlsx(sheets) {
  const list = sheets.filter(Boolean);
  const files = {
    '[Content_Types].xml': contentTypes(list.length),
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': workbook(list),
    'xl/_rels/workbook.xml.rels': workbookRels(list.length),
    'xl/styles.xml': styles(),
  };
  list.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = worksheet(sheet); });
  return zipSync(files);
}

function contentTypes(count) {
  const sheets = Array.from({ length: count }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

function workbook(sheets) {
  const tabs = sheets.map((s, i) =>
    `<sheet name="${escapeXml(sheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tabs}</sheets></workbook>`;
}

function workbookRels(count) {
  const rels = Array.from({ length: count }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function styles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>
<numFmt numFmtId="165" formatCode="0.0%"/>
<numFmt numFmtId="166" formatCode="dd/mm/yyyy"/>
<numFmt numFmtId="167" formatCode="#,##0.00"/>
</numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF0044B9"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0044B9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDF1F7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF9AA6B8"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheet(sheet) {
  const cols = sheet.columns || [];
  const rows = [];
  let r = 1;

  if (sheet.title) {
    rows.push(`<row r="${r}" ht="21" customHeight="1">${cell(`A${r}`, sheet.title, STYLE.title)}</row>`);
    r += 2;
  }
  const headerRow = r;
  rows.push(`<row r="${r}" ht="22" customHeight="1">${cols.map((c, i) => cell(colLetter(i) + r, c.header, STYLE.header)).join('')}</row>`);
  r += 1;

  for (const item of sheet.rows || []) {
    const cells = cols.map((c, i) => cell(colLetter(i) + r, item[c.key], styleFor(c.type), c.type));
    rows.push(`<row r="${r}">${cells.join('')}</row>`);
    r += 1;
  }

  if (sheet.total) {
    const cells = cols.map((c, i) => {
      const value = sheet.total[c.key];
      const style = c.type === 'money' && value != null ? STYLE.totalMoney : STYLE.totalText;
      return cell(colLetter(i) + r, value == null ? '' : value, style, c.type);
    });
    rows.push(`<row r="${r}">${cells.join('')}</row>`);
    r += 1;
  }

  const colsXml = cols.length
    ? `<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || defaultWidth(c.type)}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const lastCol = colLetter(Math.max(0, cols.length - 1));
  const filter = cols.length ? `<autoFilter ref="A${headerRow}:${lastCol}${Math.max(headerRow, r - 1)}"/>` : '';
  const freeze = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${colsXml}<sheetData>${rows.join('')}</sheetData>${filter}</worksheet>`;
}

function styleFor(type) {
  if (type === 'money') return STYLE.money;
  if (type === 'date') return STYLE.date;
  if (type === 'pct') return STYLE.pct;
  if (type === 'num') return STYLE.num;
  if (type === 'int') return STYLE.int;
  return STYLE.text;
}

function defaultWidth(type) {
  if (type === 'money') return 16;
  if (type === 'date') return 12;
  if (type === 'pct') return 10;
  return 22;
}

function cell(ref, value, styleId, type) {
  if (value == null || value === '') return `<c r="${ref}" s="${styleId}"/>`;
  if (type === 'date') {
    const serial = isoToSerial(value);
    if (serial == null) return textCell(ref, value, STYLE.text);
    return `<c r="${ref}" s="${styleId}"><v>${serial}</v></c>`;
  }
  if (type === 'pct') {
    const n = Number(value);
    return Number.isFinite(n) ? `<c r="${ref}" s="${styleId}"><v>${n / 100}</v></c>` : textCell(ref, value, STYLE.text);
  }
  if (type === 'money' || type === 'num' || type === 'int') {
    const n = Number(value);
    return Number.isFinite(n) ? `<c r="${ref}" s="${styleId}"><v>${n}</v></c>` : textCell(ref, value, STYLE.text);
  }
  return textCell(ref, value, styleId);
}

function textCell(ref, value, styleId) {
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function isoToSerial(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.round((utc - Date.UTC(1899, 11, 31)) / 86400000);
  return days + (days >= 60 ? 1 : 0);
}

function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetName(name, i) {
  const clean = String(name || `Planilha${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  return clean || `Planilha${i + 1}`;
}

const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(CONTROL_CHARS, '');
}
