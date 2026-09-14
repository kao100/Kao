/**
 * Extrato bancário OFX (Itaú, Bradesco e afins).
 *
 * O OFX costuma ser SGML (tags sem fechamento), então a leitura é tolerante:
 * cada <STMTTRN> vira um movimento com FITID — o identificador que o próprio
 * banco garante único, e que usamos para não importar a mesma movimentação duas vezes.
 */

import { parseAnyDate, parseNumber } from '../format.js';

export function parseOfx(text) {
  const body = text.replace(/\r/g, '');
  const conta = {
    banco: tag(body, 'BANKID') || tag(body, 'ORG') || null,
    agencia: tag(body, 'BRANCHID') || null,
    numero: tag(body, 'ACCTID') || null,
    moeda: tag(body, 'CURDEF') || 'BRL',
  };

  const saldo = {
    valor: parseNumber(section(body, 'LEDGERBAL') ? tag(section(body, 'LEDGERBAL'), 'BALAMT') : null),
    data: ofxDate(section(body, 'LEDGERBAL') ? tag(section(body, 'LEDGERBAL'), 'DTASOF') : null),
  };

  const movimentos = [];
  for (const bloco of body.split(/<STMTTRN>/i).slice(1)) {
    const trn = bloco.split(/<\/STMTTRN>/i)[0];
    const valor = parseNumber(tag(trn, 'TRNAMT'));
    const data = ofxDate(tag(trn, 'DTPOSTED'));
    if (valor == null || !data) continue;
    movimentos.push({
      fitid: tag(trn, 'FITID') || null,
      data,
      tipo: tag(trn, 'TRNTYPE') || null,
      valor,
      documento: tag(trn, 'CHECKNUM') || tag(trn, 'REFNUM') || null,
      descricao: [tag(trn, 'MEMO'), tag(trn, 'NAME')].filter(Boolean).join(' — ') || null,
    });
  }

  const periodo = {
    de: ofxDate(tag(body, 'DTSTART')),
    ate: ofxDate(tag(body, 'DTEND')),
  };

  return { conta, saldo, periodo, movimentos };
}

/** Valor de uma tag SGML/XML: <MEMO>PAGTO FORNECEDOR  ou <MEMO>x</MEMO> */
function tag(text, name) {
  if (!text) return '';
  const re = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function section(text, name) {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i');
  const m = text.match(re);
  if (m) return m[1];
  // SGML sem fechamento: pega um pedaço curto depois da tag
  const open = text.search(new RegExp(`<${name}>`, 'i'));
  return open < 0 ? '' : text.slice(open, open + 400);
}

/** 20260912103000[-3:BRT] -> '2026-09-12' */
function ofxDate(raw) {
  if (!raw) return null;
  const clean = String(raw).replace(/\[.*$/, '').trim();
  return parseAnyDate(clean.slice(0, 8));
}

export function looksLikeOfx(text) {
  return /<OFX>|OFXHEADER|<STMTTRN>/i.test(text.slice(0, 4000));
}
