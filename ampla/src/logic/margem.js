/**
 * MARGEM E FRETE — por vendedor, e no total.
 *
 * "Conseguir ver a margem que está sendo utilizada por vendedor, a margem total.
 *  De 100, quantos por cento? Qual o custo final? Qual o lucro final? E frete:
 *  quanto está sendo cobrado, quanto cada vendedor está cobrando, qual o valor
 *  total de frete cobrado."
 *
 * DE ONDE VEM CADA NÚMERO, porque isso é o que decide se dá para confiar:
 *
 *  • O faturamento por vendedor vem da NOTA FISCAL, como em todo o resto do app.
 *  • O custo vem do RELATÓRIO DE PRODUTOS VENDIDOS, que traz custo médio e custo
 *    total por produto — número do sistema dela, não conta minha.
 *  • A ponte entre os dois é o RELATÓRIO DE COMISSÃO POR PRODUTO, que diz quanto
 *    cada vendedor vendeu de cada produto. Custo do vendedor = quantidade que ele
 *    vendeu × custo médio daquele produto no mês.
 *
 * O custo médio é uma MÉDIA do mês: se o produto foi comprado por preços
 * diferentes, o custo de uma venda específica pode ter sido outro. Isso não é
 * defeito do app, é o que o relatório traz — e está escrito na tela, porque uma
 * margem que parece exata e não é vale menos que uma margem honesta.
 *
 * Quando os dois relatórios não chegaram, a margem NÃO é estimada: ela aparece
 * como "falta o relatório X", e só.
 */

import * as store from '../core/store.js';
import { cents, sum, normalize } from '../core/util.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

/** Margem do período, por vendedor e total. */
export async function margem({ de, ate }) {
  const [linhas, vendedores, nfs] = await Promise.all([
    store.vendasProduto.listar(), store.vendedores.listar(), store.nfs.listar(),
  ]);
  const noPeriodo = linhas.filter((l) => l.data && l.data >= de && l.data <= ate);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  /**
   * O mesmo vendedor em duas linhas da tabela era o erro mais fácil de cometer
   * aqui: a linha que já passou pelo recálculo tem vendedorId, a que acabou de
   * ser importada só tem o nome. Agrupar por um ou por outro partia o vendedor
   * em dois. O nome (e os apelidos) resolvem os dois casos.
   */
  const idPorNome = new Map();
  for (const v of vendedores) {
    idPorNome.set(normalize(v.nome), v.id);
    for (const a of v.apelidos || []) idPorNome.set(normalize(a), v.id);
  }
  const vendedorDa = (l) => l.vendedorId || idPorNome.get(normalize(l.vendedorNome)) || null;

  /**
   * O custo médio de cada produto no período, tirado do relatório de produtos
   * vendidos. Quando o mesmo produto aparece em mais de um mês, vale o custo
   * ponderado pela quantidade — média de médias enviesaria para o mês pequeno.
   */
  const custoPorProduto = new Map();
  for (const l of noPeriodo) {
    if (l.origemRelatorio !== 'produtosVendidos') continue;
    if (l.custoTotal == null || !l.quantidade) continue;
    const atual = custoPorProduto.get(l.produtoId) || { custo: 0, quantidade: 0 };
    atual.custo += l.custoTotal;
    atual.quantidade += l.quantidade;
    custoPorProduto.set(l.produtoId, atual);
  }
  const custoMedio = (produtoId) => {
    const c = custoPorProduto.get(produtoId);
    return c && c.quantidade ? c.custo / c.quantidade : null;
  };

  /* por vendedor, a partir do relatório de comissão por produto */
  const porVendedor = new Map();
  let semCusto = 0;
  for (const l of noPeriodo) {
    if (l.origemRelatorio !== 'comissaoProduto') continue;
    const vid = vendedorDa(l);
    const chave = vid || `nome:${normalize(l.vendedorNome) || 'sem'}`;
    if (!porVendedor.has(chave)) {
      porVendedor.set(chave, {
        vendedorId: vid,
        nome: vid ? (nomeVendedor.get(vid) || l.vendedorNome) : (l.vendedorNome || 'sem vendedor'),
        venda: 0, custo: 0, quantidade: 0, produtos: 0, produtosSemCusto: 0,
      });
    }
    const v = porVendedor.get(chave);
    v.venda += l.valorTotal || 0;
    v.quantidade += l.quantidade || 0;
    v.produtos += 1;
    const unit = custoMedio(l.produtoId);
    if (unit == null || l.quantidade == null) { v.produtosSemCusto += 1; semCusto += 1; } else v.custo += unit * l.quantidade;
  }

  const lista = [...porVendedor.values()].map((v) => {
    const venda = cents(v.venda);
    const custo = cents(v.custo);
    const lucro = cents(venda - custo);
    return {
      ...v,
      venda,
      custo,
      lucro,
      // "de 100, quantos por cento" — margem sobre a VENDA, que é como se fala
      // de margem no balcão. A margem sobre o custo (markup) é outro número e
      // misturar os dois é a confusão mais comum deste assunto.
      margem: venda ? (lucro / venda) * 100 : null,
      markup: custo ? (lucro / custo) * 100 : null,
      // margem só é confiável quando todo produto do vendedor tinha custo
      completa: v.produtosSemCusto === 0,
    };
  }).sort((a, b) => b.venda - a.venda);

  const venda = cents(sum(lista, (v) => v.venda));
  const custo = cents(sum(lista, (v) => v.custo));
  const lucro = cents(venda - custo);

  /* o total do relatório de produtos vendidos, que não depende do vendedor */
  const doRelatorio = noPeriodo.filter((l) => l.origemRelatorio === 'produtosVendidos');
  const totalRelatorio = {
    venda: cents(sum(doRelatorio, (l) => l.valorTotal || 0)),
    custo: cents(sum(doRelatorio, (l) => l.custoTotal || 0)),
    lucro: cents(sum(doRelatorio, (l) => l.lucro || 0)),
    produtos: doRelatorio.length,
  };
  totalRelatorio.margem = totalRelatorio.venda
    ? (totalRelatorio.lucro / totalRelatorio.venda) * 100 : null;

  /**
   * A CONFERÊNCIA QUE DECIDE SE DÁ PARA ACREDITAR NA MARGEM POR VENDEDOR.
   *
   * Se a soma dos vendedores bate com o total do relatório de produtos vendidos,
   * o cruzamento fechou: cada produto foi inteiramente atribuído a alguém, e uma
   * margem baixa num vendedor é informação de verdade, não erro de conta.
   *
   * Se NÃO bate, a diferença aparece — porque uma margem negativa que na verdade
   * é buraco de atribuição mandaria ela cobrar a pessoa errada.
   */
  const conferencia = {
    vendaSomada: venda,
    vendaRelatorio: totalRelatorio.venda,
    custoSomado: custo,
    custoRelatorio: totalRelatorio.custo,
    diferencaVenda: cents(venda - totalRelatorio.venda),
    diferencaCusto: cents(custo - totalRelatorio.custo),
  };
  conferencia.ok = Math.abs(conferencia.diferencaVenda) < 1 && Math.abs(conferencia.diferencaCusto) < 1;

  return {
    periodo: { de, ate },
    vendedores: lista,
    total: { venda, custo, lucro, margem: venda ? (lucro / venda) * 100 : null },
    totalRelatorio,
    conferencia,
    produtosSemCusto: semCusto,
    temComissaoPorProduto: noPeriodo.some((l) => l.origemRelatorio === 'comissaoProduto'),
    temProdutosVendidos: doRelatorio.length > 0,
    frete: await frete({ de, ate, nfs, nomeVendedor }),
  };
}

/**
 * FRETE COBRADO, por vendedor e no total.
 *
 * Vem do valor de frete da nota. Hoje o relatório fiscal dela não traz essa
 * coluna (o XML da NF-e traz), então o app diz isso em vez de mostrar zero —
 * zero e "não sei" são coisas diferentes, e confundir as duas aqui faria ela
 * achar que não cobra frete.
 */
export async function frete({ de, ate, nfs: recebidas, nomeVendedor: nomes }) {
  const nfs = recebidas || await store.nfs.listar();
  const nomeVendedor = nomes || new Map((await store.vendedores.listar()).map((v) => [v.id, v.nome]));
  const doPeriodo = nfs.filter((nf) => valeParaFaturamento(nf) && nf.dataEmissao >= de && nf.dataEmissao <= ate);
  const comFrete = doPeriodo.filter((nf) => nf.valorFrete != null);

  const porVendedor = new Map();
  for (const nf of comFrete) {
    const chave = nf.vendedorId || 'sem';
    if (!porVendedor.has(chave)) {
      porVendedor.set(chave, {
        vendedorId: nf.vendedorId || null,
        nome: nf.vendedorId ? (nomeVendedor.get(nf.vendedorId) || 'Vendedor') : 'sem vendedor',
        frete: 0, notas: 0, faturamento: 0,
      });
    }
    const v = porVendedor.get(chave);
    v.frete += nf.valorFrete || 0;
    v.faturamento += valorFaturado(nf);
    v.notas += 1;
  }

  return {
    // sem a coluna no arquivo, o app não sabe — e dizer "R$ 0,00" seria mentira
    temDado: comFrete.length > 0,
    notasComFrete: comFrete.length,
    notasNoPeriodo: doPeriodo.length,
    total: cents(sum(comFrete, (nf) => nf.valorFrete || 0)),
    vendedores: [...porVendedor.values()].map((v) => ({
      ...v,
      frete: cents(v.frete),
      faturamento: cents(v.faturamento),
      peso: v.faturamento ? (v.frete / v.faturamento) * 100 : null,
    })).sort((a, b) => b.frete - a.frete),
  };
}
