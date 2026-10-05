/**
 * O RETRATO DA BASE — um arquivo que é a empresa inteira.
 *
 * O mesmo retrato serve para três coisas: o backup que ela baixa, o arquivo que
 * ela manda para o outro aparelho, e o que sobe para a nuvem. Ter UMA definição
 * de "o que é a base" evita o pior erro possível aqui — dois caminhos salvando
 * coisas diferentes e cada aparelho ficando com um pedaço.
 */

import * as db from '../core/db.js';
import * as store from '../core/store.js';

export const FORMATO = 'ampla';
export const VERSAO_FORMATO = 1;

/** Tudo que está no banco, com um carimbo de quando foi tirado. */
export async function montarSnapshot({ dispositivo = null } = {}) {
  const dados = {};
  for (const nome of Object.keys(db.STORES)) dados[nome] = await db.getAll(nome);
  return {
    app: FORMATO,
    versao: VERSAO_FORMATO,
    em: Date.now(),
    dispositivo,
    dados,
  };
}

/** O snapshot vira texto, e o texto vira um arquivo pequeno. */
export async function comprimir(snapshot) {
  const texto = JSON.stringify(snapshot);
  if (typeof CompressionStream !== 'function') {
    return { blob: new Blob([texto], { type: 'application/json' }), comprimido: false };
  }
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(fluxo).blob();
  return { blob: new Blob([blob], { type: 'application/gzip' }), comprimido: true };
}

/**
 * Lê o arquivo venha ele comprimido ou não — e decide pelos BYTES, não pela
 * extensão. Arquivo que passeia por WhatsApp e pasta de downloads troca de nome
 * no caminho; os dois primeiros bytes de um .gz não mudam.
 */
export async function descomprimir(origem) {
  const buffer = origem instanceof ArrayBuffer ? origem : await origem.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const ehGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!ehGzip) return new TextDecoder().decode(buffer);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Este navegador não abre arquivo comprimido. Use um Chrome ou Safari recente.');
  }
  const fluxo = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(fluxo).text();
}

/** Confere que é um retrato desta aplicação antes de deixar entrar. */
export function validarSnapshot(conteudo) {
  if (!conteudo || conteudo.app !== FORMATO) {
    throw new Error('Este arquivo não é um backup do aplicativo.');
  }
  if (!conteudo.dados || typeof conteudo.dados !== 'object') {
    throw new Error('O backup está sem dados.');
  }
  return conteudo;
}

/**
 * RESTAURAR É SUBSTITUIR, NÃO MISTURAR.
 *
 * Misturar duas bases parciais daria o pior resultado possível: uma nota que
 * existe num aparelho e não no outro sumiria ou apareceria em dobro, e ninguém
 * saberia qual dos dois está certo. O retrato inteiro entra no lugar do que
 * estava — e é por isso que ele é tirado inteiro.
 *
 * Os stores que o arquivo NÃO traz ficam como estão: é o que permite um backup
 * antigo entrar num app que ganhou tabelas novas depois.
 */
export async function restaurarSnapshot(conteudo) {
  validarSnapshot(conteudo);
  let registros = 0;
  for (const [nome, linhas] of Object.entries(conteudo.dados)) {
    if (!db.STORES[nome] || !Array.isArray(linhas)) continue;
    await db.clearStore(nome);
    if (linhas.length) await db.putMany(nome, linhas);
    registros += linhas.length;
  }
  store.limparCache();
  return { registros, em: conteudo.em || null };
}

/** Quantos registros o retrato carrega, sem precisar restaurar. */
export function contarRegistros(conteudo) {
  return Object.values(conteudo?.dados || {})
    .reduce((total, linhas) => total + (Array.isArray(linhas) ? linhas.length : 0), 0);
}
