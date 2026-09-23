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
 * Descobre as colunas pelos CORREDORES EM BRANCO da tabela.
 *
 * A primeira versão agrupava por sobreposição: duas células que se tocam viram
 * a mesma coluna. Funciona em tabela pequena e falha feio em tabela grande —
 * entre 3.600 produtos basta UM nome comprido encostar na coluna de custo para
 * as duas virarem uma só no documento inteiro, e a coluna do nome sumir.
 *
 * Aqui a conta é por cobertura: para cada faixa de x, quantas linhas têm texto
 * ali. Onde quase nenhuma tem, é corredor — o espaço branco entre colunas. As
 * colunas são o que sobra entre um corredor e o outro. Um nome comprido isolado
 * não apaga um corredor que 3.599 linhas mantêm aberto.
 */
function descobrirColunas(linhas) {
  const corpo = linhasDeTabela(linhas);
  const celulas = corpo.flatMap((l) => l.celulas);
  if (!celulas.length) return [];

  const inicio = Math.min(...celulas.map((c) => c.x));
  const fim = Math.max(...celulas.map((c) => c.x + c.largura));
  const largura = fim - inicio;
  if (!(largura > 0)) return [{ inicio, fim: fim + 1 }];

  const BINS = 2000;
  const passo = largura / BINS;
  const cobertura = new Float64Array(BINS + 1);
  for (const c of celulas) {
    const de = Math.max(0, Math.floor((c.x - inicio) / passo));
    const ate = Math.min(BINS, Math.ceil((c.x + c.largura - inicio) / passo));
    for (let k = de; k <= ate; k += 1) cobertura[k] += 1;
  }

  // um corredor de verdade é usado por pouquíssimas linhas; o limite sobe junto
  // com o tamanho da tabela para uma linha torta não fechar o corredor sozinha
  const limite = Math.max(1, corpo.length * 0.02);

  const faixas = [];
  let atual = null;
  for (let k = 0; k <= BINS; k += 1) {
    const temTexto = cobertura[k] > limite;
    if (temTexto && !atual) atual = { inicio: inicio + k * passo, fim: inicio + k * passo };
    else if (temTexto) atual.fim = inicio + k * passo;
    else if (atual) { faixas.push(atual); atual = null; }
  }
  if (atual) faixas.push(atual);
  if (!faixas.length) return [{ inicio, fim }];

  // o que ficou de fora do corredor (a linha torta) entra na coluna mais perto
  faixas[0].inicio = Math.min(faixas[0].inicio, inicio);
  faixas[faixas.length - 1].fim = Math.max(faixas[faixas.length - 1].fim, fim);
  return faixas;
}

/**
 * As linhas com cara de tabela. O título do relatório e a linha de período
 * atravessam a página inteira: contá-los taparia todos os corredores de uma vez.
 */
function linhasDeTabela(linhas) {
  const contagens = linhas.map((l) => l.celulas.length).sort((a, b) => a - b);
  const maxCelulas = contagens[contagens.length - 1] || 0;
  const corpo = linhas.filter((l) => l.celulas.length >= Math.max(2, Math.ceil(maxCelulas / 2)));
  return corpo.length ? corpo : linhas;
}

/**
 * Tira o enfeite de página ANTES de juntar pedaço. Enquanto ele ficava, o
 * cabeçalho repetido de cada página entrava como pedaço solto, achava uma linha
 * de dados com a coluna livre e era colado dentro dela — uma conta a pagar
 * ficou com "Relatório de contas a pagar" no lugar do documento.
 *
 * Repetir não basta: "LTDA" sobra dezenas de vezes como fim de nome de empresa,
 * e apagar isso truncaria o cliente. O que separa um do outro é a ALTURA NA
 * FOLHA — o carimbo sai sempre na mesma margem, o pedaço de nome cai onde a
 * venda dele estiver.
 */
function tirarEnfeitesDePagina(visuais) {
  const texto = (l) => l.celulas.map((c) => c.texto).join('\u0001');

  const posicoes = new Map();
  for (const l of visuais) {
    const k = texto(l);
    if (!posicoes.has(k)) posicoes.set(k, []);
    posicoes.get(k).push(l.yPagina ?? l.y);
  }

  const carimbo = new Set();
  for (const [k, ys] of posicoes) {
    if (ys.length < 2) continue;
    if (Math.max(...ys) - Math.min(...ys) <= 2) carimbo.add(k);
  }

  const marcaDePagina = /^(p[aá]g(ina)?\.?\s*)?\d+\s*(de|\/)\s*\d+$/i;
  return visuais.filter((l) => {
    const cheias = l.celulas.filter((c) => c.texto.trim());
    if (cheias.length === 1 && marcaDePagina.test(cheias[0].texto.trim())) return false;
    return !(carimbo.has(texto(l)) && l.celulas.length <= 3);
  });
}

/**
 * UMA LINHA VISUAL É UM REGISTRO.
 *
 * Existe a tentação de juntar linhas pelo espaçamento quando uma célula
 * comprida quebra em duas. Já tentei, e num relatório de verdade o resultado
 * foi desastroso: o vão grande entre o cabeçalho da página e a tabela servia de
 * referência, e as 334 vendas de um mês viravam 16 linhas — uma por página.
 *
 * O que junta pedaço agora é juntarQuebras(), que não olha espaçamento: olha
 * coluna livre. Errar para mais deixa linha a mais, que ela vê na prévia.
 * Errar para menos apaga venda em silêncio.
 */

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
  const linhas = linhasVisuais.map((l) => {
    const celulas = Array.from({ length: colunas.length }, () => []);
    for (const c of l.celulas) celulas[indice(c)].push({ y: l.y, texto: c.texto });
    return { y: l.y, celulas, preenchidas: celulas.filter((a) => a.length).length };
  });

  return juntarQuebras(linhas, colunas.length).map((l) => l.celulas.map(montarTexto));
}

/** Os pedaços de uma célula, de cima para baixo, colados na ordem certa. */
function montarTexto(pedacos) {
  return [...pedacos]
    .sort((a, b) => b.y - a.y)
    .reduce((acc, p) => (acc ? acc + emenda(acc, p.texto) + p.texto : p.texto), '')
    .trim();
}

/**
 * Nome de cliente comprido quebra em duas ou três linhas, e o relatório desenha
 * o registro no meio delas:
 *
 *     ""    | SANTA AGDA IMOB. ADM. DE BENS E |          |     …
 *     1147  |                                | 22/09/26 | Concretizada …
 *     ""    | PART. LTDA                     |          |     …
 *
 * O sinal é seguro e específico: o pedaço solto ocupa SÓ colunas que estão
 * vazias no registro. Quando há colisão — duas linhas disputando a mesma
 * coluna — são dois registros, e nada é juntado.
 *
 * Juntar por espaçamento, que era o jeito anterior, transformou as 334 vendas
 * de um mês em 16 linhas, uma por página. Esta regra não corre esse risco: sem
 * a coluna vazia do outro lado, ela não junta nada.
 */
function juntarQuebras(linhas, quantasColunas) {
  // A referência é o NÚMERO DE COLUNAS da tabela, não a contagem mais comum.
  // Num relatório em que quase todo nome quebra, os pedaços são mais numerosos
  // que os registros, e a moda elegia o pedaço como tamanho normal da linha —
  // aí nada era reconhecido como quebra e nada era juntado.
  if (quantasColunas < 3) return linhas.filter((l) => l.preenchidas > 0);

  const limite = Math.max(2, Math.ceil(quantasColunas / 2));
  const fragmento = (l) => l.preenchidas > 0 && l.preenchidas < limite;
  const registros = linhas.filter((l) => l.preenchidas > 0 && !fragmento(l));
  if (!registros.length) return linhas.filter((l) => l.preenchidas > 0);

  // as colunas de cada registro ANTES de receber pedaço: é contra elas que a
  // colisão é medida, senão o primeiro pedaço bloquearia o segundo
  const originais = new Map(registros.map((r) => [r, r.celulas.map((a) => a.length > 0)]));

  const livre = (r, l) => {
    const ocupadas = originais.get(r);
    return !l.celulas.some((a, i) => a.length && ocupadas[i]);
  };

  const emOrdem = [...linhas].filter((l) => l.preenchidas > 0).sort((a, b) => b.y - a.y);
  const absorvidos = new Set();

  /**
   * Entre dois registros há uma fila de pedaços: o fim do nome de cima e o
   * começo do nome de baixo. O corte é no MAIOR vão da fila — dentro de um
   * nome as linhas são coladas, e entre um produto e o outro entra a folga da
   * linha da tabela. Era isso que faltava: pela distância pura, um nome de
   * cinco linhas gruda a ponta no produto vizinho.
   */
  const repartir = (fila, acima, abaixo) => {
    if (!fila.length) return;
    if (!acima) { fila.forEach((l) => colar(l, abaixo)); return; }
    if (!abaixo) { fila.forEach((l) => colar(l, acima)); return; }

    const alturas = [acima.y, ...fila.map((l) => l.y), abaixo.y];
    let corte = 0;
    let maior = -Infinity;
    for (let k = 1; k < alturas.length; k += 1) {
      const vao = alturas[k - 1] - alturas[k];
      if (vao > maior) { maior = vao; corte = k; }
    }
    fila.forEach((l, k) => {
      const preferido = k < corte - 1 ? acima : abaixo;
      // se o preferido já tem aquela coluna ocupada, o pedaço é do outro lado:
      // ele só pode pertencer a um dos dois registros que o cercam
      if (!colar(l, preferido)) colar(l, preferido === acima ? abaixo : acima);
    });
  };

  const colar = (l, alvo) => {
    if (!alvo || !livre(alvo, l)) return false;
    l.celulas.forEach((a, i) => { if (a.length) alvo.celulas[i].push(...a); });
    absorvidos.add(l);
    return true;
  };

  let fila = [];
  let anterior = null;
  for (const l of emOrdem) {
    if (fragmento(l)) { fila.push(l); continue; }
    repartir(fila, anterior, l);
    fila = [];
    anterior = l;
  }
  repartir(fila, anterior, null);

  return linhas.filter((l) => l.preenchidas > 0 && !absorvidos.has(l));
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
  const cheias = (l) => l.filter((v) => v !== '').length;

  // Uma linha que se repete IGUALZINHA e não tem data nem valor é enfeite de
  // página: o cabeçalho da tabela, o título, o "gerado em". Duas vendas de
  // verdade não se repetem dez vezes sem nenhum número junto.
  const quantas = new Map();
  for (const l of todas) {
    const k = JSON.stringify(l);
    quantas.set(k, (quantas.get(k) || 0) + 1);
  }
  const candidatos = new Set();
  for (const [k, n] of quantas) {
    if (n < 2) continue;
    const linha = JSON.parse(k);
    if (!linha.some(pareceDado) || cheias(linha) <= 2) candidatos.add(k);
  }

  const vistos = new Set();
  let repetidos = 0;
  const linhas = todas.filter((l) => {
    // "Página 3 de 16" muda a cada página, então a repetição nunca a pegaria
    if (ehMarcaDePagina(l)) { repetidos += 1; return false; }
    const k = JSON.stringify(l);
    if (!candidatos.has(k)) return true;
    if (vistos.has(k)) { repetidos += 1; return false; }
    vistos.add(k);
    return true;
  });
  return { linhas, repetidos };
}

/**
 * O que sobrou de pedaço solto depois de juntar o que dava. É quase sempre o
 * fim de um nome comprido que o relatório quebrou num lugar em que não deu para
 * religar. Entra como linha, viraria um registro fantasma — então sai, e o
 * aviso diz quantos foram: esconder seria pior do que contar.
 */
function tirarPedacosSoltos(linhas) {
  const cheias = (l) => l.filter((v) => v !== '').length;
  const frequencia = new Map();
  for (const l of linhas) {
    const n = cheias(l);
    if (n >= 3) frequencia.set(n, (frequencia.get(n) || 0) + 1);
  }
  const comum = [...frequencia.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 0;
  if (comum < 3) return { linhas, soltos: 0 };

  const minimo = Math.max(2, Math.ceil(comum / 3));
  const ficam = linhas.filter((l) => cheias(l) >= minimo);
  return { linhas: ficam, soltos: linhas.length - ficam.length };
}

/** Numeração de página sozinha numa linha: enfeite, não registro. */
function ehMarcaDePagina(linha) {
  const cheias = linha.filter((v) => v !== '');
  if (cheias.length !== 1) return false;
  return /^(p[aá]g(ina)?\.?\s*)?\d+\s*(de|\/)\s*\d+$/i.test(cheias[0].trim());
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
  let pagina = 0;

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

    const visuais = montarCelulas(extrairItens(conteudo, fontes));
    // As páginas de um relatório são a MESMA tabela. Descobrir as colunas página
    // a página dava grades diferentes (9 colunas numa, 7 na outra) e as linhas
    // deixavam de se alinhar: a coluna de valor de uma página caía na de custo
    // da seguinte. Por isso as linhas de todas as páginas são juntadas antes.
    // O deslocamento em y mantém cada página no seu bloco, já que o y recomeça
    // do topo a cada página.
    const desvio = pagina * 100000;
    // yPagina guarda a altura ORIGINAL na folha: é ela que denuncia o enfeite,
    // que sai sempre no mesmo lugar da margem em todas as páginas
    for (const l of visuais) todas.push({ ...l, y: l.y - desvio, yPagina: l.y });
    pagina += 1;
  }

  const matriz = montarMatriz(tirarEnfeitesDePagina(todas));

  if (!matriz.length) {
    throw new Error('Este PDF não tem texto — parece ser digitalizado (imagem). '
      + 'O app não tenta adivinhar o conteúdo de uma imagem: exporte o relatório em XLSX, CSV, '
      + 'ou gere o PDF direto do sistema em vez de escanear.');
  }

  const { linhas: semRepetidos, repetidos } = tirarCabecalhosRepetidos(matriz);
  const { linhas, soltos } = tirarPedacosSoltos(semRepetidos);

  const avisos = [];
  if (repetidos) avisos.push(`${repetidos} linha(s) de título, cabeçalho repetido e numeração de página ficaram de fora.`);
  if (soltos) {
    avisos.push(`${soltos} pedaço(s) de texto não coube(ram) em nenhuma linha da tabela — normalmente o `
      + 'fim de um nome de cliente muito comprido. O valor e a data das vendas não são afetados; '
      + 'se o nome completo importar, exporte o relatório em modo paisagem ou em XLSX.');
  }

  return {
    planilhas: [{ nome: nomeArquivo.replace(/\.[^.]+$/, ''), linhas }],
    aviso: avisos.length ? avisos.join(' ') : null,
  };
}
