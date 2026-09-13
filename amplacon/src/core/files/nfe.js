/**
 * XML de NF-e: extrai a nota, os itens e os eventos de cancelamento.
 *
 * Regra da casa: o que não existe no XML fica `null` e vira pendência —
 * nunca é preenchido por suposição. O XML traz faturamento e produtos com
 * exatidão; vendedor e pedido interno só vêm se o emissor tiver gravado.
 */

import { parseNumber } from '../format.js';

/** @returns {{ notas: object[], eventos: object[] }} */
export function parseNfeXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML inválido ou corrompido.');

  const notas = [];
  for (const inf of Array.from(doc.getElementsByTagName('infNFe'))) notas.push(readNota(inf));

  const eventos = [];
  for (const inf of Array.from(doc.getElementsByTagName('infEvento'))) {
    const tipo = txt(inf, 'tpEvento');
    if (!tipo) continue;
    eventos.push({
      chave: txt(inf, 'chNFe'),
      tipo,
      cancelamento: tipo === '110111',
      dataEvento: isoFrom(txt(inf, 'dhEvento')),
      justificativa: txt(inf, 'xJust') || null,
      protocolo: txt(inf, 'nProt') || null,
    });
  }
  return { notas, eventos };
}

function readNota(inf) {
  const ide = child(inf, 'ide');
  const emit = child(inf, 'emit');
  const dest = child(inf, 'dest');
  const total = child(inf, 'ICMSTot');
  const chave = (inf.getAttribute('Id') || '').replace(/^NFe/, '') || null;

  const itens = Array.from(inf.getElementsByTagName('det')).map((det) => {
    const prod = child(det, 'prod');
    return {
      seq: Number(det.getAttribute('nItem')) || null,
      produtoCodigo: txt(prod, 'cProd') || null,
      descricao: txt(prod, 'xProd') || null,
      ncm: txt(prod, 'NCM') || null,
      cfop: txt(prod, 'CFOP') || null,
      unidade: txt(prod, 'uCom') || null,
      quantidade: parseNumber(txt(prod, 'qCom')),
      valorUnitario: parseNumber(txt(prod, 'vUnCom')),
      valorTotal: parseNumber(txt(prod, 'vProd')),
      desconto: parseNumber(txt(prod, 'vDesc')) || 0,
      frete: parseNumber(txt(prod, 'vFrete')) || 0,
      // pedido de compra informado pelo cliente (quando o emissor preenche)
      pedidoXml: txt(prod, 'xPed') || null,
      itemPedidoXml: txt(prod, 'nItemPed') || null,
    };
  });

  const duplicatas = Array.from(inf.getElementsByTagName('dup')).map((dup) => ({
    numero: txt(dup, 'nDup') || null,
    vencimento: isoFrom(txt(dup, 'dVenc')),
    valor: parseNumber(txt(dup, 'vDup')),
  }));

  const tpNF = txt(ide, 'tpNF');
  return {
    chave,
    numero: txt(ide, 'nNF') || null,
    serie: txt(ide, 'serie') || null,
    modelo: txt(ide, 'mod') || null,
    dataEmissao: isoFrom(txt(ide, 'dhEmi') || txt(ide, 'dEmi')),
    dataSaida: isoFrom(txt(ide, 'dhSaiEnt') || txt(ide, 'dSaiEnt')),
    naturezaOperacao: txt(ide, 'natOp') || null,
    // 0 = entrada, 1 = saída. Faturamento usa saída.
    operacao: tpNF === '0' ? 'entrada' : tpNF === '1' ? 'saida' : null,
    finalidade: txt(ide, 'finNFe') || null, // 4 = devolução
    emitenteCnpj: txt(emit, 'CNPJ') || null,
    emitenteNome: txt(emit, 'xNome') || null,
    clienteDoc: txt(dest, 'CNPJ') || txt(dest, 'CPF') || null,
    clienteNome: txt(dest, 'xNome') || null,
    clienteMunicipio: txt(dest, 'xMun') || null,
    clienteUf: txt(dest, 'UF') || null,
    valorProdutos: parseNumber(txt(total, 'vProd')),
    valorFrete: parseNumber(txt(total, 'vFrete')),
    valorDesconto: parseNumber(txt(total, 'vDesc')),
    valorTotal: parseNumber(txt(total, 'vNF')),
    infoComplementar: txt(inf, 'infCpl') || null,
    itens,
    duplicatas,
  };
}

function child(node, tag) {
  if (!node) return null;
  return node.getElementsByTagName(tag)[0] || null;
}

function txt(node, tag) {
  if (!node) return '';
  const el = node.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : '';
}

function isoFrom(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
