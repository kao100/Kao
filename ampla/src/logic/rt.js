/**
 * RT — a comissão de quem traz a obra.
 *
 * "Alguns clientes meus recebem RT, que é como se fosse uma comissão. Eles
 *  passam a obra pra gente e eles recebem uma comissão por isso. Todos ganham
 *  10%. (...) Eles podem estar como vendedores, né? Mas eles nunca vão aparecer
 *  nas vendas como vendedores."
 *
 * POR QUE NÃO É UM VENDEDOR. Três diferenças que, juntas, estragariam os dois
 * números se fossem misturados:
 *
 *  1. O vendedor aparece NA VENDA; o RT não aparece em lugar nenhum da nota. Ele
 *     é reconhecido pelo CNPJ do cliente que ele trouxe.
 *  2. A comissão do vendedor é sobre o PRODUTO; o RT é sobre o TOTAL — "eles
 *     ganham em cima do valor total vendido, contando frete, tudo".
 *  3. Pôr o RT no ranking de vendedores faria a soma dos vendedores passar do
 *     faturamento, e a conferência que segura o app inteiro quebraria.
 *
 * CLIENTE NÃO É FATURAMENTO. "Um cliente pode ter vários faturamentos
 * diferentes, vários CNPJ, CPF diferentes." Então o vínculo é com uma LISTA de
 * documentos, não com um cadastro de cliente — e um documento só pode pertencer
 * a um RT, senão a mesma venda pagaria duas vezes.
 */

import * as store from '../core/store.js';
import { cents, sum, digits } from '../core/util.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

/** O percentual que ela disse valer para os três. Dá para mudar por pessoa. */
export const PERCENTUAL_PADRAO = 10;

/** Os documentos de um RT, só dígitos, sem repetir. */
export function documentosDe(rt) {
  return [...new Set((rt.documentos || []).map((d) => digits(d)).filter(Boolean))];
}

/**
 * Lê uma lista colada: um por linha, por vírgula ou por ponto e vírgula. O que
 * não tiver dígito nenhum fica de fora, em vez de virar um documento vazio que
 * casaria com qualquer nota sem CNPJ.
 */
export function lerDocumentos(texto) {
  return [...new Set(String(texto || '')
    .split(/[\n,;]+/)
    .map((x) => digits(x))
    .filter((x) => x.length >= 11))];
}

/**
 * O MESMO DOCUMENTO EM DOIS RTs pagaria a mesma venda duas vezes. O app não
 * escolhe qual vale: ele devolve o conflito para ser resolvido.
 */
export function documentosRepetidos(lista) {
  const dono = new Map();
  const conflitos = [];
  for (const rt of lista) {
    for (const doc of documentosDe(rt)) {
      if (dono.has(doc)) conflitos.push({ documento: doc, de: dono.get(doc), e: rt.nome });
      else dono.set(doc, rt.nome);
    }
  }
  return conflitos;
}

/** O RT do período: quanto cada um trouxe e quanto tem a receber. */
export async function rt({ de, ate }) {
  const [lista, nfs, clientes] = await Promise.all([
    store.rts.listar(), store.nfs.listar(), store.clientes.listar(),
  ]);
  const ativos = lista.filter((x) => x.ativo !== false);

  const doPeriodo = nfs.filter((nf) => valeParaFaturamento(nf)
    && nf.dataEmissao >= de && nf.dataEmissao <= ate);

  const nomeDoCliente = new Map(clientes.filter((c) => c.documento)
    .map((c) => [digits(c.documento), c.nome]));

  const porDocumento = new Map();
  for (const nf of doPeriodo) {
    const doc = digits(nf.clienteDoc);
    if (!doc) continue;
    const atual = porDocumento.get(doc) || { valor: 0, notas: 0, nome: nf.clienteNome || null };
    atual.valor += valorFaturado(nf);
    atual.notas += 1;
    if (!atual.nome && nf.clienteNome) atual.nome = nf.clienteNome;
    porDocumento.set(doc, atual);
  }

  const linhas = ativos.map((x) => {
    const docs = documentosDe(x);
    const faturamentos = docs.map((doc) => {
      const achado = porDocumento.get(doc);
      return {
        documento: doc,
        nome: achado?.nome || nomeDoCliente.get(doc) || null,
        faturamento: cents(achado?.valor || 0),
        notas: achado?.notas || 0,
      };
    }).sort((a, b) => b.faturamento - a.faturamento);

    const faturamento = cents(sum(faturamentos, (f) => f.faturamento));
    const percentual = x.percentual == null ? PERCENTUAL_PADRAO : x.percentual;
    return {
      id: x.id,
      nome: x.nome,
      percentual,
      documentos: docs.length,
      // sem documento vinculado não há o que calcular — e zero aqui seria mentira
      faturamento: docs.length ? faturamento : null,
      valor: docs.length ? cents(faturamento * (percentual / 100)) : null,
      notas: sum(faturamentos, (f) => f.notas),
      /* os faturamentos que não apareceram no período ficam à vista, com zero */
      faturamentos,
      semMovimento: faturamentos.filter((f) => f.notas === 0).length,
    };
  }).sort((a, b) => (b.valor || 0) - (a.valor || 0));

  const comDocumento = linhas.filter((l) => l.documentos > 0);
  return {
    periodo: { de, ate },
    linhas,
    total: cents(sum(comDocumento, (l) => l.valor || 0)),
    faturamentoCoberto: cents(sum(comDocumento, (l) => l.faturamento || 0)),
    faturamentoDoPeriodo: cents(sum(doPeriodo, (nf) => valorFaturado(nf))),
    semDocumento: linhas.filter((l) => !l.documentos).map((l) => l.nome),
    conflitos: documentosRepetidos(ativos),
    /**
     * O RT é sobre o TOTAL da nota, frete incluído — e a comissão do vendedor é
     * só sobre o produto. São bases diferentes de propósito, e a tela diz isso,
     * porque somar os dois percentuais daria um custo de venda que não existe.
     */
    base: 'valor total da nota, com frete',
  };
}
