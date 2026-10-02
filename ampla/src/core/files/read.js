/**
 * Porta de entrada de qualquer arquivo: descobre o formato e devolve sempre a
 * mesma estrutura, para que o resto do app não precise saber de onde veio o dado.
 *
 *  { formato, planilhas: [{ nome, linhas }], nfe, ofx, aviso }
 */

import { readText, hashFile } from '../util.js';
import { readXlsx } from './xlsx.js';
import { parseCsv, detectDelimiter } from './csv.js';
import { parseNfeXml } from './nfe.js';
import { parseOfx, looksLikeOfx } from './ofx.js';
import { unzip, textOf } from './zip.js';
import { readPdf } from './pdf.js';

export const FORMATOS = {
  xlsx: 'Planilha Excel',
  csv: 'Texto delimitado (CSV)',
  nfe: 'XML de NF-e',
  ofx: 'Extrato OFX',
  zip: 'Pacote de XMLs',
  pdf: 'Relatório em PDF',
};

/**
 * Extensões que readFile() realmente sabe abrir hoje. A tela de importação
 * anuncia só o que está aqui: prometer um formato que o leitor não lê seria
 * exatamente o tipo de surpresa que o item 20 manda evitar.
 */
export const EXTENSOES_SUPORTADAS = new Set([
  'xlsx', 'xlsm', 'csv', 'txt', 'xml', 'ofx', 'qfx', 'zip', 'pdf',
]);

/** Um formato anunciado por uma fonte é aceito? ('pdf' só quando o leitor souber.) */
export function formatoSuportado(f) {
  return EXTENSOES_SUPORTADAS.has(String(f).toLowerCase());
}

/** Lista de extensões para o accept do <input type=file>. */
export function acceptSuportado() {
  return [...EXTENSOES_SUPORTADAS].map((e) => `.${e}`).join(',');
}

/**
 * VÁRIOS ARQUIVOS DE UMA VEZ — o mês inteiro de notas.
 *
 * "Eu precisava ou enviar um arquivo zip com todos os XMLs, ou selecionar vários
 *  de uma vez. Enviar um por um é muita nota."
 *
 * Só XML junta: cada NF-e é um documento independente, então ler trezentos e
 * somar as notas num pacote só é a mesma coisa que ler um ZIP com trezentos
 * dentro. Planilha e PDF NÃO juntam — dois relatórios diferentes no mesmo lote
 * virariam uma tabela sem sentido, e isso seria perder dado calado.
 *
 * Arquivo que não abre não derruba o lote: ele é contado e dito no aviso, e os
 * outros entram.
 *
 * @param {File[]} arquivos
 * @param {(lidos: number, total: number) => void} [aoAndar] para a tela contar
 */
export async function readFiles(arquivos, aoAndar) {
  const lista = [...arquivos];
  if (lista.length === 0) throw new Error('Nenhum arquivo escolhido.');
  if (lista.length === 1) return readFile(lista[0]);

  const naoXml = lista.filter((f) => {
    const ext = (f.name || '').toLowerCase().split('.').pop();
    return ext !== 'xml' && ext !== 'zip';
  });
  if (naoXml.length) {
    throw new Error('Vários arquivos de uma vez só vale para XML de NF-e (ou ZIP). '
      + `Mande ${naoXml.length === lista.length ? 'o relatório' : 'os relatórios'} um de cada vez — `
      + 'dois relatórios diferentes no mesmo lote virariam uma tabela sem sentido.');
  }

  const notas = [];
  const eventos = [];
  const falharam = [];
  const hashes = [];
  let tamanho = 0;
  let lidos = 0;

  for (const file of lista) {
    try {
      const r = await readFile(file);
      if (!r.nfe) { falharam.push(file.name); continue; }
      notas.push(...r.nfe.notas);
      eventos.push(...r.nfe.eventos);
      hashes.push(r.hash);
      tamanho += r.tamanho || 0;
    } catch {
      falharam.push(file.name);
    }
    lidos += 1;
    if (aoAndar) aoAndar(lidos, lista.length);
  }

  if (!notas.length && !eventos.length) {
    throw new Error(`Nenhum dos ${lista.length} arquivos tinha NF-e dentro.`);
  }

  const avisos = [];
  if (falharam.length) {
    avisos.push(`${falharam.length} de ${lista.length} arquivo(s) não puderam ser lidos`
      + ` (${falharam.slice(0, 3).join(', ')}${falharam.length > 3 ? '…' : ''}).`);
  }
  // nota repetida entre arquivos é a mesma nota: o importador já casa pela chave,
  // então aqui não se tira nada — só se avisa quando aconteceu
  const chaves = new Set(notas.map((n) => n.chave).filter(Boolean));
  if (chaves.size && chaves.size < notas.length) {
    avisos.push(`${notas.length - chaves.size} nota(s) vieram repetidas entre os arquivos — `
      + 'cada uma entra uma vez só.');
  }

  return {
    arquivo: `${lista.length} arquivos (${notas.length} nota(s))`,
    // o lote é tratado igual a um XML só: mesmo formato, mesmo caminho adiante
    formato: 'nfe',
    hash: hashTexto(hashes.sort().join('|')),
    tamanho,
    planilhas: [],
    nfe: { notas, eventos },
    ofx: null,
    aviso: avisos.join(' ') || null,
  };
}

/**
 * Identidade do lote, no mesmo formato de hashFile: é por ela que o app sabe
 * dizer "este lote já foi importado" e atualizar em vez de duplicar.
 */
function hashTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${texto.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

export async function readFile(file) {
  const nome = file.name || 'arquivo';
  const ext = nome.toLowerCase().split('.').pop();
  const hash = await hashFile(file);
  const base = { arquivo: nome, hash, tamanho: file.size, planilhas: [], nfe: null, ofx: null, aviso: null };

  if (ext === 'xlsx' || ext === 'xlsm') {
    const planilhas = await readXlsx(await file.arrayBuffer());
    return { ...base, formato: 'xlsx', planilhas: planilhas.map((s) => ({ nome: s.name, linhas: s.rows })) };
  }

  if (ext === 'xls') {
    throw new Error('Formato .xls antigo não é lido diretamente. Abra no Excel e salve como .xlsx ou .csv.');
  }

  if (ext === 'pdf') {
    const r = await readPdf(await file.arrayBuffer(), nome);
    return { ...base, formato: 'pdf', planilhas: r.planilhas, aviso: r.aviso };
  }

  if (ext === 'ofx' || ext === 'qfx') {
    const text = await readText(file);
    return { ...base, formato: 'ofx', ofx: parseOfx(text) };
  }

  if (ext === 'zip') {
    const arquivos = await unzip(await file.arrayBuffer());
    const xmls = Object.entries(arquivos).filter(([n]) => n.toLowerCase().endsWith('.xml'));
    if (!xmls.length) throw new Error('O ZIP não contém XMLs.');
    const notas = [];
    const eventos = [];
    const erros = [];
    for (const [n, bytes] of xmls) {
      try {
        const r = parseNfeXml(textOf(bytes));
        notas.push(...r.notas);
        eventos.push(...r.eventos);
      } catch {
        erros.push(n);
      }
    }
    return {
      ...base,
      formato: 'zip',
      nfe: { notas, eventos },
      aviso: erros.length ? `${erros.length} arquivo(s) do ZIP não puderam ser lidos.` : null,
    };
  }

  const text = await readText(file);

  if (ext === 'xml' || /^\s*<\?xml|<nfeProc|<NFe/i.test(text.slice(0, 500))) {
    const nfe = parseNfeXml(text);
    if (nfe.notas.length || nfe.eventos.length) return { ...base, formato: 'nfe', nfe };
    throw new Error('XML lido, mas sem NF-e nem evento reconhecido.');
  }

  if (looksLikeOfx(text)) return { ...base, formato: 'ofx', ofx: parseOfx(text) };

  const linhas = parseCsv(text);
  if (!linhas.length) throw new Error('Arquivo vazio.');
  return {
    ...base,
    formato: 'csv',
    delimitador: detectDelimiter(text),
    planilhas: [{ nome: nome.replace(/\.[^.]+$/, ''), linhas }],
  };
}

/**
 * Acha a linha de cabeçalho: a primeira linha com pelo menos 2 células
 * preenchidas e sem parecer um título solto. Relatórios de ERP costumam ter
 * 1 a 5 linhas de logotipo/período antes da tabela.
 */
export function detectHeaderRow(linhas) {
  const limite = Math.min(linhas.length, 15);
  let melhor = 0;
  let melhorScore = -1;
  for (let i = 0; i < limite; i += 1) {
    const preenchidas = linhas[i].filter((c) => String(c ?? '').trim() !== '').length;
    const seguintes = linhas.slice(i + 1, i + 4);
    const media = seguintes.length
      ? seguintes.reduce((acc, l) => acc + l.filter((c) => String(c ?? '').trim() !== '').length, 0) / seguintes.length
      : 0;
    // cabeçalho bom: muitas colunas e as linhas seguintes com quantidade parecida
    const score = preenchidas >= 2 ? preenchidas + Math.min(media, preenchidas) : -1;
    if (score > melhorScore) { melhorScore = score; melhor = i; }
  }
  return melhor;
}

/** Converte a matriz em objetos { cabeçalho: valor }, já sem as linhas vazias. */
export function rowsToObjects(linhas, headerRow = 0) {
  const cabecalho = (linhas[headerRow] || []).map((c, i) => String(c ?? '').trim() || `Coluna ${i + 1}`);
  const out = [];
  for (let i = headerRow + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (!linha || linha.every((c) => String(c ?? '').trim() === '')) continue;
    const obj = {};
    cabecalho.forEach((nome, col) => { obj[nome] = linha[col] ?? ''; });
    obj.__linha = i + 1;
    out.push(obj);
  }
  return { cabecalho, registros: out };
}
