/**
 * Gerador de PDF mínimo, sem dependências.
 *
 * Suficiente para um relatório de texto com títulos, tabelas simples e
 * barras: Helvetica (fonte padrão do PDF, não precisa embutir), codificação
 * WinAnsi (acentos do português funcionam) e páginas A4.
 *
 * Tudo é escrito em ASCII puro (os acentos viram escapes octais), então o
 * tamanho em caracteres é o tamanho em bytes — e a tabela xref fica correta
 * sem precisar de TextEncoder.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;

/** Caracteres fora do Latin-1 que o WinAnsi tem em outra posição. */
const WIN_ANSI = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99,
};
const FALLBACK = { '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '✓': 'v', '✕': 'x', '−': '-' };

function encode(text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    const code = WIN_ANSI[ch] ?? ch.codePointAt(0);
    if (code > 255 && FALLBACK[ch]) { out += FALLBACK[ch]; continue; }
    if (code > 255) {
      // emoji e afins: fora da fonte padrão, ficam de fora
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '\\') { out += `\\${ch}`; continue; }
    if (code < 32) { out += ' '; continue; }
    if (code > 126) { out += `\\${code.toString(8).padStart(3, '0')}`; continue; }
    out += ch;
  }
  return out;
}

/** Largura aproximada do texto (Helvetica ~0,5 em; negrito um pouco mais). */
function textWidth(text, size, bold) {
  let w = 0;
  for (const ch of String(text)) {
    if ('il.,:;|!\'`'.includes(ch)) w += 0.28;
    else if ('mwMW@'.includes(ch)) w += 0.83;
    else if (ch === ' ') w += 0.28;
    else if (ch >= 'A' && ch <= 'Z') w += 0.66;
    else w += 0.53;
  }
  return w * size * (bold ? 1.06 : 1);
}

function hex(color) {
  const c = color.replace('#', '');
  const n = (i) => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3);
  return `${n(0)} ${n(2)} ${n(4)}`;
}

export class PdfDoc {
  constructor({ title = 'Relatório', footer = '' } = {}) {
    this.title = title;
    this.footer = footer;
    this.pages = [];
    this.newPage();
  }

  newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = PAGE_H - MARGIN;
  }

  ensure(height) {
    if (this.y - height < MARGIN + 18) this.newPage();
  }

  get width() { return PAGE_W - MARGIN * 2; }

  rawText(x, y, text, { size = 10, bold = false, color = '#111111' } = {}) {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${hex(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${encode(text)}) Tj ET`);
  }

  /** Parágrafo com quebra de linha automática. */
  text(text, { size = 10, bold = false, color = '#111111', indent = 0, gap = 4 } = {}) {
    const lines = this.wrap(text, this.width - indent, size, bold);
    const lh = size * 1.32;
    for (const line of lines) {
      this.ensure(lh);
      this.y -= lh;
      this.rawText(MARGIN + indent, this.y, line, { size, bold, color });
    }
    this.y -= gap;
  }

  heading(text, { size = 14 } = {}) {
    this.ensure(size * 2.4);
    this.y -= size * 0.8;
    this.text(text, { size, bold: true, gap: 2 });
    this.line();
  }

  line(color = '#CCCCCC') {
    this.ops.push(`${hex(color)} RG 0.6 w ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`);
    this.y -= 6;
  }

  spacer(h = 8) { this.y -= h; }

  /** Tabela simples: a primeira linha é o cabeçalho. `widths` em frações. */
  table(rows, widths, { size = 9 } = {}) {
    if (!rows.length) return;
    const cols = widths.map((f) => f * this.width);
    const lh = size * 1.3;
    rows.forEach((row, ri) => {
      const cells = row.map((cell, ci) => this.wrap(String(cell ?? ''), cols[ci] - 6, size, ri === 0));
      const height = Math.max(...cells.map((c) => c.length)) * lh + 4;
      this.ensure(height);
      if (ri === 0) {
        this.ops.push(`${hex('#EEF1F5')} rg ${MARGIN} ${(this.y - height).toFixed(2)} ${this.width.toFixed(2)} ${height.toFixed(2)} re f`);
      }
      let x = MARGIN;
      cells.forEach((lines, ci) => {
        lines.forEach((ln, li) => {
          this.rawText(x + 3, this.y - lh * (li + 1) + 1, ln, { size, bold: ri === 0 });
        });
        x += cols[ci];
      });
      this.y -= height;
      this.ops.push(`${hex('#DDDDDD')} RG 0.4 w ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`);
    });
    this.y -= 6;
  }

  /** Barras verticais simples (ex.: dor por dia). */
  bars(data, { height = 90, max = 10, color = '#FF7A34', emptyColor = '#DDDDDD' } = {}) {
    this.ensure(height + 26);
    const top = this.y;
    const base = top - height;
    const slot = this.width / Math.max(1, data.length);
    const bw = Math.min(36, slot * 0.6);
    this.ops.push(`${hex('#BBBBBB')} RG 0.5 w ${MARGIN} ${base.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${base.toFixed(2)} l S`);
    data.forEach((d, i) => {
      const x = MARGIN + slot * i + (slot - bw) / 2;
      const has = d.value != null;
      const bh = has ? Math.max(2, (Math.min(d.value, max) / max) * (height - 14)) : 2;
      this.ops.push(`${hex(has ? (d.color || color) : emptyColor)} rg ${x.toFixed(2)} ${base.toFixed(2)} ${bw.toFixed(2)} ${bh.toFixed(2)} re f`);
      if (has) this.rawText(x + bw / 2 - 3, base + bh + 3, String(d.value), { size: 8 });
      this.rawText(x + bw / 2 - textWidth(d.label, 8) / 2, base - 11, d.label, { size: 8, color: '#555555' });
    });
    this.y = base - 20;
  }

  wrap(text, maxWidth, size, bold) {
    const out = [];
    for (const para of String(text ?? '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (textWidth(test, size, bold) <= maxWidth || !line) line = test;
        else { out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  }

  /** Monta o arquivo. */
  toBlob() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };

    const catalogId = add(null);
    const pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const total = this.pages.length;
    const pageIds = this.pages.map((ops, i) => {
      const footer = [
        `BT /F1 8 Tf ${hex('#777777')} rg ${MARGIN} 24 Td (${encode(this.footer)}) Tj ET`,
        `BT /F1 8 Tf ${hex('#777777')} rg ${(PAGE_W - MARGIN - 40).toFixed(2)} 24 Td (${encode(`${i + 1} / ${total}`)}) Tj ET`,
      ];
      const stream = [...ops, ...footer].join('\n');
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`);
    });

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    const infoId = add(`<< /Title (${encode(this.title)}) /Producer (Kao Training) >>`);

    // cabeçalho + comentário com bytes > 127 (marca o arquivo como binário),
    // gravado como bytes brutos para não bagunçar os offsets
    const header = '%PDF-1.4\n';
    const binaryComment = [0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A];
    const offsets = [];
    let body = '';
    let pos = header.length + binaryComment.length;
    objects.forEach((obj, i) => {
      offsets.push(pos);
      const chunk = `${i + 1} 0 obj\n${obj}\nendobj\n`;
      body += chunk;
      pos += chunk.length;
    });
    const xrefStart = pos;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    const ascii = (str) => Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xFF);
    return new Blob([ascii(header), new Uint8Array(binaryComment), ascii(body + xref + trailer)], { type: 'application/pdf' });
  }
}

/**
 * Entrega o PDF: compartilhar (iPhone → Salvar em Arquivos, WhatsApp, e-mail)
 * quando o navegador permite, senão baixar.
 */
export async function deliverPdf(blob, filename) {
  try {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
