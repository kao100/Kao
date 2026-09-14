/**
 * Leitor de PDF — só o texto, e só o suficiente para reconstruir a TABELA.
 *
 * Um dos sistemas da empresa não exporta planilha: o relatório sai em PDF e
 * pronto. Em vez de pedir que ela redigite, o app abre o PDF, descobre onde
 * cada pedaço de texto foi desenhado e remonta linhas e colunas a partir das
 * coordenadas. O resultado sai no mesmo formato de uma planilha, então todo o
 * resto do app (mapeamento coluna → campo, chaves naturais, conferências)
 * continua igual.
 *
 * O que este leitor NÃO faz, de propósito:
 *  - PDF escaneado (imagem) não vira texto. Não há OCR e não vai haver chute:
 *    o app avisa que o arquivo não tem texto.
 *  - Não tenta adivinhar qual coluna é qual. Quem liga coluna → campo é você,
 *    uma vez, igual a qualquer outro arquivo.
 */

/* ------------------------------------------------------------ utilidades */

/** Bytes → string de 1 caractere por byte (para varrer a estrutura do arquivo). */
function latin1(bytes) {
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return s;
}

async function inflar(bytes) {
  for (const formato of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(formato);
      const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
      if (buf.byteLength) return new Uint8Array(buf);
    } catch { /* tenta o próximo */ }
  }
  return null;
}

/** Acha o << >> que começa em `de`, respeitando aninhamento e strings. */
function fatiarDict(s, de) {
  let i = s.indexOf('<<', de);
  if (i < 0) return null;
  let nivel = 0;
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === '<' && s[j + 1] === '<') { nivel += 1; j += 1; } else if (s[j] === '>' && s[j + 1] === '>') {
      nivel -= 1; j += 1;
      if (nivel === 0) return s.slice(i, j + 1);
    } else if (s[j] === '(') {
      let n = 1;
      for (j += 1; j < s.length && n; j += 1) {
        if (s[j] === '\\') j += 1;
        else if (s[j] === '(') n += 1;
        else if (s[j] === ')') n -= 1;
      }
      j -= 1;
    }
  }
  return null;
}

const refDe = (dict, chave) => {
  const m = dict.match(new RegExp(`/${chave}\\s+(\\d+)\\s+\\d+\\s+R`));
  return m ? Number(m[1]) : null;
};
const numDe = (dict, chave) => {
  const m = dict.match(new RegExp(`/${chave}\\s+(-?[\\d.]+)`));
  return m ? Number(m[1]) : null;
};
const nomeDe = (dict, chave) => {
  const m = dict.match(new RegExp(`/${chave}\\s*/([A-Za-z0-9-]+)`));
  return m ? m[1] : null;
};

/* ------------------------------------------------- objetos do documento */

/**
 * Varre o arquivo inteiro atrás de "N 0 obj … endobj". É de propósito que não
 * usamos a tabela xref: relatório gerado por sistema vem com xref torto mais
 * vezes do que se imagina, e a varredura acha os objetos do mesmo jeito.
 */
async function lerObjetos(bytes) {
  const raw = latin1(bytes);
  const objetos = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const num = Number(m[1]);
    const inicio = m.index + m[0].length;
    const fim = raw.indexOf('endobj', inicio);
    if (fim < 0) continue;
    const corpo = raw.slice(inicio, fim);
    const dict = fatiarDict(corpo, 0) || '';

    let stream = null;
    const iS = corpo.indexOf('stream');
    if (iS >= 0 && (!dict || iS >= corpo.indexOf(dict) + dict.length - 2)) {
      let p = iS + 6;
      if (corpo[p] === '\r') p += 1;
      if (corpo[p] === '\n') p += 1;
      const declarado = numDe(dict, 'Length');
      let fimS = declarado != null && corpo.slice(p + declarado, p + declarado + 20).includes('endstream')
        ? p + declarado
        : corpo.indexOf('endstream', p);
      if (fimS < 0) fimS = corpo.length;
      const ini = inicio + p;
      stream = bytes.subarray(ini, inicio + fimS);
    }
    objetos.set(num, { dict, stream });
  }

  // objetos guardados dentro de outros objetos (/Type /ObjStm)
  for (const [, o] of [...objetos]) {
    if (!o.stream || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const dados = /\/FlateDecode/.test(o.dict) ? await inflar(o.stream) : o.stream;
    if (!dados) continue;
    const texto = latin1(dados);
    const n = numDe(o.dict, 'N');
    const first = numDe(o.dict, 'First');
    if (!n || first == null) continue;
    const cabeca = texto.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i += 1) {
      const num = cabeca[i * 2];
      const off = cabeca[i * 2 + 1];
      if (!Number.isFinite(num) || !Number.isFinite(off)) continue;
      const proximo = i + 1 < n ? first + cabeca[i * 2 + 3] : texto.length;
      const corpo = texto.slice(first + off, proximo);
      if (!objetos.has(num)) objetos.set(num, { dict: fatiarDict(corpo, 0) || corpo, stream: null });
    }
  }
  return objetos;
}

async function conteudoDe(objetos, num) {
  const o = objetos.get(num);
  if (!o?.stream) return '';
  const dados = /\/FlateDecode/.test(o.dict) ? await inflar(o.stream) : o.stream;
  return dados ? latin1(dados) : '';
}

/* -------------------------------------------------------------- fontes */

/** Lê o /ToUnicode: é ele que devolve o texto de verdade em fonte embutida. */
function lerToUnicode(cmap) {
  const mapa = new Map();
  const hexParaTexto = (h) => {
    let out = '';
    for (let i = 0; i + 3 < h.length + 1; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return out;
  };

  for (const bloco of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) || []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
    let m;
    while ((m = re.exec(bloco)) !== null) mapa.set(parseInt(m[1], 16), hexParaTexto(m[2]));
  }

  for (const bloco of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) || []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([\s\S]*?)\])/g;
    let m;
    while ((m = re.exec(bloco)) !== null) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (m[3] != null) {
        const base = parseInt(m[3].slice(-4) || '0', 16);
        const prefixo = m[3].length > 4 ? hexParaTexto(m[3].slice(0, -4)) : '';
        for (let c = lo; c <= hi && c - lo < 65536; c += 1) {
          mapa.set(c, prefixo + String.fromCharCode(base + (c - lo)));
        }
      } else {
        const itens = m[4].match(/<([0-9A-Fa-f]*)>/g) || [];
        itens.forEach((it, i) => mapa.set(lo + i, hexParaTexto(it.slice(1, -1))));
      }
    }
  }
  return mapa;
}

/** Larguras de fonte simples (/FirstChar + /Widths) ou CID (/W + /DW). */
function lerLarguras(dict, objetos, larguras) {
  const w = { padrao: 500, mapa: new Map() };
  const primeiro = numDe(dict, 'FirstChar');
  const refW = refDe(dict, 'Widths');
  const listaW = refW != null ? objetos.get(refW)?.dict : null;
  const inline = dict.match(/\/Widths\s*\[([\s\S]*?)\]/);
  const arr = inline ? inline[1] : (listaW && !listaW.startsWith('<<') ? listaW : null);
  if (arr && primeiro != null) {
    arr.trim().split(/\s+/).map(Number).forEach((v, i) => {
      if (Number.isFinite(v)) w.mapa.set(primeiro + i, v);
    });
  }
  if (larguras) {
    w.padrao = larguras.dw ?? 1000;
    for (const [c, v] of larguras.mapa) w.mapa.set(c, v);
  }
  return w;
}

/** /W do CIDFont: [ c [w…]  cIni cFim w ] */
function lerW(dict) {
  const m = dict.match(/\/W\s*\[([\s\S]*?)\]\s*(?:\/|>>)/);
  const mapa = new Map();
  const dw = numDe(dict, 'DW');
  if (!m) return { mapa, dw };
  const toks = m[1].replace(/\[/g, ' [ ').replace(/\]/g, ' ] ').trim().split(/\s+/);
  let i = 0;
  while (i < toks.length) {
    const a = Number(toks[i]);
    if (!Number.isFinite(a)) { i += 1; continue; }
    if (toks[i + 1] === '[') {
      let j = i + 2;
      let c = a;
      while (j < toks.length && toks[j] !== ']') { mapa.set(c, Number(toks[j])); c += 1; j += 1; }
      i = j + 1;
    } else {
      const b = Number(toks[i + 1]);
      const v = Number(toks[i + 2]);
      if (Number.isFinite(b) && Number.isFinite(v)) {
        for (let c = a; c <= b && c - a < 65536; c += 1) mapa.set(c, v);
      }
      i += 3;
    }
  }
  return { mapa, dw };
}

async function lerFonte(objetos, num) {
  const o = objetos.get(num);
  if (!o) return null;
  const d = o.dict;
  const tipo0 = /\/Subtype\s*\/Type0/.test(d);
  const codigoDuplo = tipo0 && /\/Encoding\s*\/Identity-[HV]/.test(d);

  let toUnicode = new Map();
  const refU = refDe(d, 'ToUnicode');
  if (refU != null) toUnicode = lerToUnicode(await conteudoDe(objetos, refU));

  let larguras = null;
  const mDesc = d.match(/\/DescendantFonts\s*\[?\s*(\d+)\s+\d+\s+R/);
  if (mDesc) {
    const desc = objetos.get(Number(mDesc[1]));
    if (desc) larguras = lerW(desc.dict);
  }

  return { codigoDuplo, toUnicode, larguras: lerLarguras(d, objetos, larguras) };
}

/* ------------------------------------------------- texto de uma página */

const mult = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

/** Separa a string PDF em códigos + devolve o texto e a largura em milésimos. */
function decodificar(bruto, fonte) {
  let texto = '';
  let largura = 0;
  const codigos = [];
  if (fonte?.codigoDuplo) {
    for (let i = 0; i + 1 < bruto.length; i += 2) codigos.push((bruto.charCodeAt(i) << 8) | bruto.charCodeAt(i + 1));
  } else {
    for (let i = 0; i < bruto.length; i += 1) codigos.push(bruto.charCodeAt(i));
  }
  for (const c of codigos) {
    const u = fonte?.toUnicode.get(c);
    texto += u != null ? u : (fonte?.codigoDuplo ? '' : String.fromCharCode(c));
    largura += fonte?.larguras.mapa.get(c) ?? fonte?.larguras.padrao ?? 500;
  }
  return { texto, largura };
}

/** Lê uma string literal ( … ) a partir de `i`, já com os escapes resolvidos. */
function lerLiteral(s, i) {
  let out = '';
  let nivel = 1;
  let j = i;
  const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
  while (j < s.length && nivel > 0) {
    const c = s[j];
    if (c === '\\') {
      const d = s[j + 1];
      if (d >= '0' && d <= '7') {
        let oct = '';
        let k = j + 1;
        while (k < s.length && oct.length < 3 && s[k] >= '0' && s[k] <= '7') { oct += s[k]; k += 1; }
        out += String.fromCharCode(parseInt(oct, 8));
        j = k;
        continue;
      }
      out += escapes[d] ?? (d === '\n' ? '' : d);
      j += 2;
      continue;
    }
    if (c === '(') nivel += 1;
    if (c === ')') { nivel -= 1; if (!nivel) { j += 1; break; } }
    out += c;
    j += 1;
  }
  return { texto: out, fim: j };
}

const hexParaBruto = (h) => {
  const limpo = h.replace(/[^0-9A-Fa-f]/g, '');
  let out = '';
  for (let i = 0; i < limpo.length; i += 2) out += String.fromCharCode(parseInt((limpo.slice(i, i + 2) + '0').slice(0, 2), 16));
  return out;
};

/**
 * Percorre o content stream e devolve cada pedaço de texto com a posição em
 * que foi desenhado. É a posição — não a ordem no arquivo — que reconstrói a
 * tabela: sistema nenhum garante que desenha da esquerda para a direita.
 */
function extrairItens(conteudo, fontes) {
  const itens = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = tm;
  let fonte = null;
  let tamanho = 0;
  let tc = 0;
  let tw = 0;
  let th = 1;
  let leading = 0;

  const operandos = [];
  let i = 0;

  const desenhar = (bruto) => {
    const { texto, largura } = decodificar(bruto, fonte);
    const m = mult(tm, ctm);
    const escala = Math.hypot(m[0], m[1]) || 1;
    const avanco = (largura / 1000) * tamanho * th
      + texto.length * tc * th
      + (bruto.split(' ').length - 1) * tw * th;
    if (texto.trim()) {
      itens.push({
        texto, x: m[4], y: m[5], largura: avanco * escala / (Math.hypot(tm[0], tm[1]) || 1), tamanho: tamanho * escala,
      });
    }
    tm = mult([1, 0, 0, 1, avanco, 0], tm);
  };

  while (i < conteudo.length) {
    const c = conteudo[i];

    if (c === '(') {
      const r = lerLiteral(conteudo, i + 1);
      operandos.push({ tipo: 'str', v: r.texto });
      i = r.fim;
      continue;
    }
    if (c === '<' && conteudo[i + 1] !== '<') {
      const fim = conteudo.indexOf('>', i);
      operandos.push({ tipo: 'str', v: hexParaBruto(conteudo.slice(i + 1, fim < 0 ? conteudo.length : fim)) });
      i = (fim < 0 ? conteudo.length : fim) + 1;
      continue;
    }
    if (c === '[' || c === ']' || c === '{' || c === '}') {
      operandos.push({ tipo: 'marca', v: c });
      i += 1;
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      while (j < conteudo.length && !/[\s/[\]<>(){}]/.test(conteudo[j])) j += 1;
      operandos.push({ tipo: 'nome', v: conteudo.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (/\s/.test(c)) { i += 1; continue; }

    let j = i;
    while (j < conteudo.length && !/[\s/[\]<>(){}]/.test(conteudo[j])) j += 1;
    const tok = conteudo.slice(i, j);
    i = j === i ? i + 1 : j;

    if (/^[-+.\d]/.test(tok) && Number.isFinite(Number(tok))) {
      operandos.push({ tipo: 'num', v: Number(tok) });
      continue;
    }

    const nums = operandos.filter((o) => o.tipo === 'num').map((o) => o.v);
    const ultimaStr = [...operandos].reverse().find((o) => o.tipo === 'str')?.v;
    const ultimoNome = [...operandos].reverse().find((o) => o.tipo === 'nome')?.v;

    switch (tok) {
      case 'q': pilha.push(ctm); break;
      case 'Q': ctm = pilha.pop() || ctm; break;
      case 'cm': if (nums.length >= 6) ctm = mult(nums.slice(-6), ctm); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case 'ET': break;
      case 'Tf':
        fonte = fontes.get(ultimoNome) || null;
        tamanho = nums.length ? nums[nums.length - 1] : tamanho;
        break;
      case 'TL': if (nums.length) leading = nums[nums.length - 1]; break;
      case 'Tc': if (nums.length) tc = nums[nums.length - 1]; break;
      case 'Tw': if (nums.length) tw = nums[nums.length - 1]; break;
      case 'Tz': if (nums.length) th = nums[nums.length - 1] / 100; break;
      case 'Tm': if (nums.length >= 6) { tm = nums.slice(-6); tlm = tm; } break;
      case 'Td': if (nums.length >= 2) { tlm = mult([1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]], tlm); tm = tlm; } break;
      case 'TD':
        if (nums.length >= 2) {
          leading = -nums[nums.length - 1];
          tlm = mult([1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]], tlm);
          tm = tlm;
        }
        break;
      case 'T*': tlm = mult([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case 'Tj': if (ultimaStr != null) desenhar(ultimaStr); break;
      case "'":
        tlm = mult([1, 0, 0, 1, 0, -leading], tlm); tm = tlm;
        if (ultimaStr != null) desenhar(ultimaStr);
        break;
      case '"':
        if (nums.length >= 2) { tw = nums[nums.length - 2]; tc = nums[nums.length - 1]; }
        tlm = mult([1, 0, 0, 1, 0, -leading], tlm); tm = tlm;
        if (ultimaStr != null) desenhar(ultimaStr);
        break;
      case 'TJ':
        for (const o of operandos) {
          if (o.tipo === 'str') desenhar(o.v);
          else if (o.tipo === 'num') tm = mult([1, 0, 0, 1, (-o.v / 1000) * tamanho * th, 0], tm);
        }
        break;
      default: break;
    }
    operandos.length = 0;
  }
  return itens;
}

/* ------------------------------------------ de posições para linha/coluna */

/** Junta os pedaços que estão na mesma altura e vizinhos em uma célula só. */
function montarCelulas(itens) {
  const linhas = [];
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of ordenados) {
    const tol = Math.max(2, (it.tamanho || 8) * 0.5);
    const linha = linhas.find((l) => Math.abs(l.y - it.y) <= tol);
    if (linha) { linha.itens.push(it); linha.y = (linha.y * (linha.itens.length - 1) + it.y) / linha.itens.length; } else linhas.push({ y: it.y, itens: [it] });
  }

  return linhas.map((l) => {
    const seq = l.itens.sort((a, b) => a.x - b.x);
    const celulas = [];
    for (const it of seq) {
      const ultima = celulas[celulas.length - 1];
      const espaco = ultima ? it.x - (ultima.x + ultima.largura) : Infinity;
      const limite = (it.tamanho || 8) * 0.4;
      if (ultima && espaco < limite) {
        ultima.texto += (espaco > (it.tamanho || 8) * 0.12 ? ' ' : '') + it.texto;
        ultima.largura = it.x + it.largura - ultima.x;
      } else {
        celulas.push({ x: it.x, largura: Math.max(it.largura, 1), texto: it.texto });
      }
    }
    return { y: l.y, celulas };
  }).filter((l) => l.celulas.length);
}

/**
 * Descobre as colunas pelo espaço que cada célula ocupa. Agrupar por
 * sobreposição (e não pela borda esquerda) é o que faz a coluna de valor,
 * alinhada à direita, continuar sendo uma coluna só.
 *
 * Só as linhas com cara de tabela entram nessa conta. O título do relatório e
 * a linha de período atravessam a página inteira: se contassem, sobreporiam
 * todas as colunas de uma vez e o relatório viraria uma coluna só.
 */
function descobrirColunas(linhas) {
  const contagens = linhas.map((l) => l.celulas.length).sort((a, b) => a - b);
  const maxCelulas = contagens[contagens.length - 1] || 0;
  const corpo = linhas.filter((l) => l.celulas.length >= Math.max(2, Math.ceil(maxCelulas / 2)));
  const base = corpo.length ? corpo : linhas;

  const faixas = [];
  for (const c of base.flatMap((l) => l.celulas).sort((a, b) => a.x - b.x)) {
    const fim = c.x + c.largura;
    const faixa = faixas.find((f) => c.x < f.fim && fim > f.inicio);
    if (faixa) { faixa.inicio = Math.min(faixa.inicio, c.x); faixa.fim = Math.max(faixa.fim, fim); } else faixas.push({ inicio: c.x, fim });
  }
  return faixas.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Uma célula comprida quebra em várias linhas visuais, e o registro fica
 * espalhado por 2 ou 3 delas. Elas são reunidas só quando o espaçamento é
 * claramente de dois tipos: pequeno dentro do registro, grande entre um
 * registro e o próximo.
 *
 * Sem essa separação nítida, cada linha visual continua sendo um registro —
 * juntar por suposição criaria dados que o relatório não tem.
 */
function agruparRegistros(linhas) {
  if (linhas.length < 4) return linhas.map((l) => [l]);
  const vaos = [];
  for (let i = 1; i < linhas.length; i += 1) vaos.push(linhas[i - 1].y - linhas[i].y);
  const ordenados = [...vaos].sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)];
  const maior = ordenados[ordenados.length - 1];
  if (!(mediana > 0) || maior < mediana * 1.6) return linhas.map((l) => [l]);

  const corte = (mediana + maior) / 2;
  const grupos = [[linhas[0]]];
  for (let i = 1; i < linhas.length; i += 1) {
    if (vaos[i - 1] >= corte) grupos.push([linhas[i]]);
    else grupos[grupos.length - 1].push(linhas[i]);
  }
  return grupos;
}

function montarMatriz(linhasVisuais) {
  const colunas = descobrirColunas(linhasVisuais);
  if (!colunas.length) return [];
  const indice = (c) => {
    const meio = c.x + c.largura / 2;
    let melhor = 0;
    let dist = Infinity;
    colunas.forEach((f, i) => {
      const d = meio < f.inicio ? f.inicio - meio : meio > f.fim ? meio - f.fim : 0;
      if (d < dist) { dist = d; melhor = i; }
    });
    return melhor;
  };
  return agruparRegistros(linhasVisuais).map((grupo) => {
    const saida = new Array(colunas.length).fill('');
    for (const l of grupo) {
      for (const c of l.celulas) {
        const i = indice(c);
        saida[i] = saida[i] ? saida[i] + emenda(saida[i], c.texto) + c.texto : c.texto;
      }
    }
    return saida.map((v) => v.trim());
  });
}

/**
 * Cola ou separa dois pedaços da mesma coluna. A quebra de linha costuma cair
 * logo depois do "-" ou da "/" de um documento — "12.345.678/0001-" e "90" são
 * o mesmo CNPJ, e um espaço no meio estragaria a identificação do cliente.
 */
function emenda(antes, depois) {
  return /[-/]$/.test(antes) && /^[\dA-Za-zÀ-ÿ]/.test(depois) ? '' : ' ';
}

/* ------------------------------------------------------------- entrada */

/** A célula parece dado (data ou valor) em vez de rótulo de coluna? */
function pareceDado(v) {
  const t = String(v).trim();
  return /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(t) || /\d+[.,]\d{2}$/.test(t);
}

/**
 * O título e o cabeçalho da tabela se repetem a cada página, e sem isso
 * entrariam como registros. Só linhas do começo do documento e sem nenhuma
 * data nem valor entram na lista do que pode ser descartado: assim duas linhas
 * de dados iguais continuam sendo dois compromissos, como manda o item 20.
 */
function tirarCabecalhosRepetidos(todas) {
  const candidatos = new Set(
    todas.slice(0, 8).filter((l) => !l.some(pareceDado)).map((l) => JSON.stringify(l)),
  );
  const vistos = new Set();
  let repetidos = 0;
  const linhas = todas.filter((l) => {
    const k = JSON.stringify(l);
    if (!candidatos.has(k)) return true;
    if (vistos.has(k)) { repetidos += 1; return false; }
    vistos.add(k);
    return true;
  });
  return { linhas, repetidos };
}

/**
 * Lê o PDF e devolve `{ planilhas: [{ nome, linhas }], aviso }` — a mesma
 * forma de uma planilha, para o importador não precisar saber a diferença.
 */
export async function readPdf(buffer, nomeArquivo = 'PDF') {
  const bytes = new Uint8Array(buffer);
  const objetos = await lerObjetos(bytes);

  const paginas = [...objetos.entries()].filter(([, o]) => /\/Type\s*\/Page[^s]/.test(`${o.dict} `));
  if (!paginas.length) throw new Error('PDF sem páginas reconhecíveis.');

  const cacheFonte = new Map();
  const todas = [];

  for (const [, pag] of paginas) {
    let recursos = pag.dict.match(/\/Resources\s*(<<[\s\S]*)/)?.[1];
    recursos = recursos ? fatiarDict(recursos, 0) : null;
    if (!recursos) {
      const r = refDe(pag.dict, 'Resources');
      if (r != null) recursos = objetos.get(r)?.dict || '';
    }

    const fontes = new Map();
    const blocoFonte = recursos && fatiarDict(recursos.slice(recursos.indexOf('/Font')), 0);
    if (blocoFonte) {
      const re = /\/([A-Za-z0-9-]+)\s+(\d+)\s+\d+\s+R/g;
      let m;
      while ((m = re.exec(blocoFonte)) !== null) {
        const num = Number(m[2]);
        if (!cacheFonte.has(num)) cacheFonte.set(num, await lerFonte(objetos, num));
        fontes.set(m[1], cacheFonte.get(num));
      }
    }

    const refs = [];
    const um = pag.dict.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    const lista = pag.dict.match(/\/Contents\s*\[([\s\S]*?)\]/);
    if (um) refs.push(Number(um[1]));
    if (lista) for (const r of lista[1].match(/(\d+)\s+\d+\s+R/g) || []) refs.push(Number(r.split(/\s+/)[0]));

    let conteudo = '';
    for (const r of refs) conteudo += `${await conteudoDe(objetos, r)}\n`;
    if (!conteudo.trim()) continue;

    todas.push(...montarMatriz(montarCelulas(extrairItens(conteudo, fontes))));
  }

  if (!todas.length) {
    throw new Error('Este PDF não tem texto — parece ser digitalizado (imagem). '
      + 'O app não tenta adivinhar o conteúdo de uma imagem: exporte o relatório em XLSX, CSV, '
      + 'ou gere o PDF direto do sistema em vez de escanear.');
  }

  const { linhas, repetidos } = tirarCabecalhosRepetidos(todas);

  return {
    planilhas: [{ nome: nomeArquivo.replace(/\.[^.]+$/, ''), linhas }],
    aviso: repetidos
      ? `${repetidos} repetição(ões) do cabeçalho foram descartadas (uma por página).`
      : null,
  };
}
