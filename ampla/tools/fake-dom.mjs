/**
 * Um DOMParser mínimo para o teste em Node.
 *
 * O leitor de NF-e usa DOMParser, que só existe no navegador. Puxar uma
 * biblioteca de XML só para o teste contraria a regra do projeto (zero
 * dependências), e deixar o XML sem teste contraria uma regra pior.
 *
 * Então aqui mora um analisador que faz exatamente o que `nfe.js` pede, e nada
 * além: elementos, atributos, texto, getElementsByTagName e o querySelector de
 * 'parsererror'. Não é um DOM de verdade — é o pedaço de DOM que o app usa.
 */

class No {
  constructor(tag) {
    this.tagName = tag;
    this.atributos = new Map();
    this.filhos = [];
    this.texto = '';
  }

  getAttribute(nome) {
    return this.atributos.has(nome) ? this.atributos.get(nome) : null;
  }

  get textContent() {
    if (this.filhos.length === 0) return this.texto;
    return this.filhos.map((f) => f.textContent).join('');
  }

  getElementsByTagName(tag) {
    const achados = [];
    const andar = (no) => {
      for (const f of no.filhos) {
        if (f.tagName === tag) achados.push(f);
        andar(f);
      }
    };
    andar(this);
    return achados;
  }

  querySelector(seletor) {
    return this.getElementsByTagName(seletor)[0] || null;
  }
}

/** Lê os atributos de uma tag de abertura: nome="valor" ou nome='valor'. */
function lerAtributos(texto, no) {
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m = re.exec(texto);
  while (m) {
    no.atributos.set(m[1], m[3] !== undefined ? m[3] : m[4]);
    m = re.exec(texto);
  }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function destrocarEntidades(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (todo, corpo) => {
    if (corpo[0] === '#') {
      const n = corpo[1] === 'x' || corpo[1] === 'X'
        ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[corpo] !== undefined ? ENTIDADES[corpo] : todo;
  });
}

export class DOMParser {
  // eslint-disable-next-line class-methods-use-this
  parseFromString(xml) {
    const raiz = new No('#document');
    const pilha = [raiz];
    // tira declaração, comentários e CDATA markers, que o app não lê
    const limpo = String(xml)
      .replace(/<\?[\s\S]*?\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

    const re = /<\/?([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
    let m = re.exec(limpo);
    while (m) {
      const [todo, tag, resto, texto] = m;
      if (texto !== undefined) {
        const no = new No('#text');
        no.texto = destrocarEntidades(texto);
        pilha[pilha.length - 1].filhos.push(no);
      } else if (todo.startsWith('</')) {
        if (pilha.length > 1) pilha.pop();
      } else {
        const no = new No(tag);
        lerAtributos(resto || '', no);
        pilha[pilha.length - 1].filhos.push(no);
        // tag que se fecha sozinha não empilha
        if (!/\/\s*$/.test(resto || '')) pilha.push(no);
      }
      m = re.exec(limpo);
    }
    return raiz;
  }
}

export function instalar() {
  if (typeof globalThis.DOMParser === 'undefined') globalThis.DOMParser = DOMParser;
}
