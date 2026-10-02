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
  const [linhas, vendedores, nfs, itens, produtos] = await Promise.all([
    store.vendasProduto.listar(), store.vendedores.listar(), store.nfs.listar(),
    store.nfItens.listar(), store.produtos.listar(),
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
  /**
   * O CUSTO MÉDIO SÓ VALE SE A UNIDADE FOR A MESMA.
   *
   * O relatório de produtos vendidos conta em uma unidade e a nota pode contar em
   * outra: parafuso vendido a R$ 0,35 na nota aparecia com "custo médio" de
   * R$ 44,40 porque o relatório conta por caixa. Multiplicar um pelo outro dava
   * margem de −66% num vendedor — um número inventado por diferença de unidade.
   *
   * A verificação não é palpite sobre margem: é comparar o PREÇO MÉDIO DE VENDA
   * do mesmo produto nos dois arquivos. Os dois descrevem a mesma venda, então o
   * preço tem de ser o mesmo. Quando não é, a unidade (ou o período) é outra, e o
   * custo daquele produto não entra — ele é contado como "sem custo confiável".
   */
  const vendaPorProduto = new Map();
  for (const l of noPeriodo) {
    if (l.origemRelatorio !== 'produtosVendidos') continue;
    if (l.valorTotal == null || !l.quantidade) continue;
    const atual = vendaPorProduto.get(l.produtoId) || { valor: 0, quantidade: 0 };
    atual.valor += l.valorTotal;
    atual.quantidade += l.quantidade;
    vendaPorProduto.set(l.produtoId, atual);
  }
  const precoNasNotas = new Map();
  for (const i of itens) {
    if (!i.data || i.data < de || i.data > ate) continue;
    if (i.valorTotal == null || !i.quantidade) continue;
    const atual = precoNasNotas.get(i.produtoId) || { valor: 0, quantidade: 0 };
    atual.valor += Math.abs(i.valorTotal);
    atual.quantidade += Math.abs(i.quantidade);
    precoNasNotas.set(i.produtoId, atual);
  }

  /**
   * Quanto o preço pode variar entre o relatório e a nota antes de o app
   * desconfiar da UNIDADE. Preço varia de verdade — mix, desconto, período — mas
   * não por um fator. Trinta por cento separa variação de preço (que é normal) de
   * contagem em caixa contra contagem em unidade (que foi o que apareceu: fatores
   * de 4x, 7x, 23x).
   */
  const TOLERANCIA = 0.3;
  const unidadeConfere = (produtoId) => {
    const rel = vendaPorProduto.get(produtoId);
    const nota = precoNasNotas.get(produtoId);
    // sem um dos dois lados não há o que comparar: o custo passa como antes
    if (!rel?.quantidade || !nota?.quantidade) return true;
    const precoRel = rel.valor / rel.quantidade;
    const precoNf = nota.valor / nota.quantidade;
    if (!(precoNf > 0)) return true;
    return Math.abs(precoRel / precoNf - 1) <= TOLERANCIA;
  };

  const produtosComUnidadeDiferente = [];
  const custoMedio = (produtoId) => {
    const c = custoPorProduto.get(produtoId);
    if (!c || !c.quantidade) return null;
    if (!unidadeConfere(produtoId)) {
      if (!produtosComUnidadeDiferente.includes(produtoId)) produtosComUnidadeDiferente.push(produtoId);
      return null;
    }
    return c.custo / c.quantidade;
  };

  /**
   * A PROPORÇÃO DE CUSTO DO PRODUTO — imune a diferença de unidade.
   *
   * Custo por unidade quebra quando os dois arquivos contam em unidades
   * diferentes: TIJOLO COMUM vendido a R$ 7,20 na nota aparecia com custo médio
   * de R$ 87,38, porque o relatório conta o pacote. Multiplicar isso pela
   * quantidade da nota dava R$ 80 mil de prejuízo onde não havia nenhum.
   *
   * Mas o relatório traz VALOR e CUSTO do mesmo produto, na MESMA unidade, seja
   * ela qual for. A razão entre os dois é a proporção de custo daquele produto —
   * e uma razão não tem unidade. Aplicada ao valor vendido na nota, dá o custo
   * daquela venda sem precisar saber se o arquivo contou em peça, pacote ou
   * palete.
   *
   * É o custo que o sistema DELA calculou, em forma de proporção. Não é uma
   * estimativa minha: é o lucro que o relatório já declara, por produto.
   */
  const proporcaoDeCusto = (produtoId) => {
    const c = custoPorProduto.get(produtoId);
    const v = vendaPorProduto.get(produtoId);
    if (!c?.custo || !v?.valor) return null;
    const razao = c.custo / v.valor;
    // razão fora de qualquer realidade é dado estragado, não margem: fica de fora
    return razao > 0 && razao < 5 ? razao : null;
  };

  /**
   * DE ONDE SAI "QUANTO CADA VENDEDOR VENDEU DE CADA PRODUTO".
   *
   * O melhor caminho são os ITENS DAS NOTAS: a nota tem o vendedor, tem a data e
   * tem a devolução, então o recorte é exato e o período é o que ela escolheu.
   * Isso só existe com o XML das NF-e.
   *
   * Sem XML, vale o relatório de comissão por produto — que é um total do
   * período inteiro do relatório, não do recorte da tela. Os dois nunca somam
   * juntos: seria contar a mesma venda duas vezes.
   */
  // as notas do período, uma vez só: o frete por vendedor e a conferência leem daqui
  const doPeriodo = nfs.filter((n) => valeParaFaturamento(n) && n.dataEmissao >= de && n.dataEmissao <= ate);

  const itensDoPeriodo = itens.filter((i) => i.data && i.data >= de && i.data <= ate
    && (i.vendedorId || i.nfStatus === 'autorizada'));
  const temItensDeNota = itensDoPeriodo.length > 0;

  /**
   * A ORDEM DAS FONTES DE CUSTO, da mais confiável para a menos:
   *
   *  1. o custo da PRÓPRIA LINHA, quando o arquivo traz — mesma venda, mesma unidade;
   *  2. o custo do CADASTRO DE PRODUTOS, que vem do relatório de produtos: ele tem
   *     código interno (casa com o cProd do XML) e custo por unidade de venda;
   *  3. o custo médio do relatório de produtos vendidos — média de um período, em
   *     unidade que pode não ser a da venda, e por isso só com verificação.
   */
  const custoDoCadastro = new Map(produtos.map((p) => [p.id, p.custo]));
  const custoUnitario = (produtoId, doItem) => {
    if (doItem != null) return doItem;
    return null;
  };

  /**
   * A PROPORÇÃO DE CUSTO DO CADASTRO — a melhor que existe.
   *
   * O cadastro de produtos traz, do mesmo produto e na mesma linha, o VALOR DE
   * CUSTO e o VR. VAREJO. Os dois estão na mesma unidade, seja ela qual for: se o
   * cadastro conta a caixa, os dois contam a caixa.
   *
   * O custo absoluto, sozinho, não serve — é por unidade de COMPRA, e a venda
   * pode ser por peça. Usá-lo direto dava custo de R$ 423 mil sobre venda de
   * R$ 104 mil num vendedor. A razão entre custo e varejo atravessa isso.
   *
   * O preço de tabela não é o preço praticado: com desconto, a razão superestima
   * um pouco o custo. É o melhor disponível, e a conferência contra a margem que
   * o relatório declara é quem diz se fechou.
   */
  /**
   * E a razão é também um TESTE, não só uma conta.
   *
   * Custo maior que o preço de tabela quer dizer uma de duas coisas: o produto é
   * vendido com prejuízo (raro, e o app não deveria presumir) ou custo e varejo
   * estão em unidades diferentes (comum: TIJOLO COMUM com custo de R$ 280,00 e
   * varejo de R$ 7,20 — o custo é do pacote, o varejo é da peça).
   *
   * Nos dois casos o custo daquele produto não serve, e NENHUMA outra fonte
   * serve também, porque todas saem do mesmo cadastro. O produto fica sem custo
   * confiável e aparece na lista — que é melhor do que um prejuízo inventado.
   */
  const RAZAO_MAXIMA = 1.5;
  const razaoDoCadastro = new Map();
  const custoNaoConfiavel = new Set();
  for (const p of produtos) {
    if (p.custo == null || !p.precoVenda) continue;
    const razao = p.custo / p.precoVenda;
    if (razao > 0 && razao <= RAZAO_MAXIMA) razaoDoCadastro.set(p.id, razao);
    else custoNaoConfiavel.add(p.id);
  }

  /**
   * O custo de uma linha, pelo caminho mais confiável que existir para ela:
   *
   *  1. o custo que veio NA PRÓPRIA LINHA — mesma venda, mesma unidade;
   *  2. a razão custo/varejo do CADASTRO — os dois na mesma linha, sem unidade;
   *  3. a razão custo/venda do relatório de produtos vendidos — idem, mas é
   *     média de um período que pode não ser o da tela;
   *  4. o custo por unidade do cadastro, só quando não há preço de venda para
   *     formar razão, e com a verificação de unidade por cima.
   */
  const custoDaLinha = (produtoId, quantidade, valor, custoDoItem) => {
    const unit = custoUnitario(produtoId, custoDoItem);
    if (unit != null && quantidade != null) return unit * quantidade;
    // o cadastro já disse que o custo deste produto não fecha com o preço dele
    if (custoNaoConfiavel.has(produtoId)) {
      if (!produtosComUnidadeDiferente.includes(produtoId)) produtosComUnidadeDiferente.push(produtoId);
      return null;
    }
    /**
     * Quando a razão custo/varejo do cadastro é sã, ela provou que os dois estão
     * na MESMA unidade — e o varejo está na unidade de venda. Então o custo
     * absoluto vale, e é ele que se usa: custo não cai quando se dá desconto.
     *
     * Usar a razão aplicada ao preço VENDIDO fazia o custo encolher junto com o
     * desconto, e a margem saía sempre igual à de tabela: 41% calculados contra
     * 22,5% que o relatório declara. A diferença entre as duas é exatamente o
     * desconto praticado — que é informação, não erro, e o app não pode apagá-la.
     */
    const doCadastro = custoDoCadastro.get(produtoId);
    if (razaoDoCadastro.has(produtoId) && doCadastro != null && quantidade != null) {
      return doCadastro * quantidade;
    }
    const razao = proporcaoDeCusto(produtoId);
    if (razao != null && valor != null) return valor * razao;
    const medio = custoMedio(produtoId);
    if (medio != null && quantidade != null) return medio * quantidade;
    const soltoNoCadastro = custoDoCadastro.get(produtoId);
    if (soltoNoCadastro != null && quantidade != null && unidadeConfere(produtoId)) {
      return soltoNoCadastro * quantidade;
    }
    return null;
  };


  /* por vendedor, a partir do relatório de comissão por produto */
  const porVendedor = new Map();
  let semCusto = 0;

  if (temItensDeNota) {
    const nfPorId = new Map(nfs.map((n) => [n.id, n]));
    for (const item of itensDoPeriodo) {
      const nf = nfPorId.get(item.nfId);
      if (!nf || !valeParaFaturamento(nf)) continue;
      const vid = item.vendedorId || nf.vendedorId || null;
      const chave = vid || 'sem';
      if (!porVendedor.has(chave)) {
        porVendedor.set(chave, {
          vendedorId: vid,
          nome: vid ? (nomeVendedor.get(vid) || 'Vendedor') : 'sem vendedor',
          venda: 0, custo: 0, quantidade: 0, produtos: 0, produtosSemCusto: 0,
        });
      }
      const v = porVendedor.get(chave);
      const sinal = nf.devolucao ? -1 : 1;
      const quantidade = Math.abs(item.quantidade || 0) * sinal;
      v.venda += Math.abs(item.valorTotal || 0) * sinal;
      v.quantidade += quantidade;
      v.produtos += 1;
      const custoDaVenda = custoDaLinha(
        item.produtoId,
        quantidade,
        Math.abs(item.valorTotal || 0) * sinal,
        item.custoUnitario ?? (item.custoTotal != null && item.quantidade
          ? item.custoTotal / item.quantidade : null),
      );
      if (custoDaVenda == null) { v.produtosSemCusto += 1; semCusto += 1; } else v.custo += custoDaVenda;
    }
  }

  for (const l of temItensDeNota ? [] : noPeriodo) {
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
    const custoDaVenda = custoDaLinha(l.produtoId, l.quantidade, l.valorTotal, null);
    if (custoDaVenda == null) { v.produtosSemCusto += 1; semCusto += 1; } else v.custo += custoDaVenda;
  }

  /**
   * O FRETE DE CADA VENDEDOR, ao lado da margem dele.
   *
   * "O Guilherme vende perto do custo" só é metade da história se ele cobra
   * frete. Material pesado sai com margem apertada e o resultado está no frete —
   * então os dois números ficam na mesma linha, e existe a soma dos dois.
   */
  const fretePorVendedor = new Map();
  for (const nf of doPeriodo) {
    if (nf.valorFrete == null) continue;
    const chave = nf.vendedorId || 'sem';
    const sinal = nf.devolucao ? -1 : 1;
    fretePorVendedor.set(chave, cents((fretePorVendedor.get(chave) || 0) + (nf.valorFrete || 0) * sinal));
  }

  const lista = [...porVendedor.values()].map((v) => {
    const venda = cents(v.venda);
    const custo = cents(v.custo);
    const lucro = cents(venda - custo);
    const freteDele = fretePorVendedor.get(v.vendedorId || 'sem') || 0;
    return {
      ...v,
      venda,
      custo,
      lucro,
      // "de 100, quantos por cento" — margem sobre a VENDA, que é como se fala
      // de margem no balcão. A margem sobre o custo (markup) é outro número e
      // misturar os dois é a confusão mais comum deste assunto.
      margem: venda ? (lucro / venda) * 100 : null,
      frete: freteDele,
      // o que sobra quando o frete entra na conta: é por aqui que uma margem
      // apertada em material pesado pode virar resultado
      lucroComFrete: cents(lucro + freteDele),
      margemComFrete: venda + freteDele ? ((lucro + freteDele) / (venda + freteDele)) * 100 : null,
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
  const totalDasNotas = temItensDeNota ? {
    venda: cents(sum(lista, (v) => v.venda)),
    custo: cents(sum(lista, (v) => v.custo)),
    produtos: itensDoPeriodo.length,
  } : null;
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
  /**
   * Contra o que conferir depende de onde o número veio.
   *
   * Vindo dos ITENS DAS NOTAS, o par certo é o FATURAMENTO do período — é a
   * mesma base, e tem de bater. Vindo do relatório de comissão por produto, o
   * par é o relatório de produtos vendidos, que cobre o mesmo período dele.
   */
/**
   * O alvo é o valor dos PRODUTOS, não o total da nota.
   *
   * A soma dos itens é vProd; o total da nota é vProd + frete. Comparar os dois
   * daria uma diferença do tamanho do frete e pareceria erro — quando na verdade
   * é a resposta à pergunta dela: a margem é sobre a mercadoria, e o frete é
   * receita à parte.
   */
  const alvo = temItensDeNota
    ? {
      venda: cents(sum(doPeriodo, (n) => (n.devolucao ? -1 : 1)
        * Math.abs(n.valorProdutos ?? ((n.valorTotal || 0) - (n.valorFrete || 0))))),
      custo: null,
    }
    : { venda: totalRelatorio.venda, custo: totalRelatorio.custo };
  const conferencia = {
    base: temItensDeNota ? 'faturamento do período' : 'relatório de produtos vendidos',
    vendaSomada: venda,
    vendaRelatorio: alvo.venda,
    custoSomado: custo,
    custoRelatorio: alvo.custo,
    diferencaVenda: cents(venda - alvo.venda),
    diferencaCusto: alvo.custo == null ? null : cents(custo - alvo.custo),
  };
  conferencia.ok = Math.abs(conferencia.diferencaVenda) < 1
    && (conferencia.diferencaCusto == null || Math.abs(conferencia.diferencaCusto) < 1);

  /**
   * A SEGUNDA CONFERÊNCIA, que é a que decide se a MARGEM pode ser mostrada.
   *
   * A primeira confere a VENDA — e ela fecha fácil, porque venda é um número só
   * que sai das notas. O custo é que é cruzado de outro arquivo, e é nele que
   * mora o erro possível.
   *
   * Por sorte o relatório de produtos vendidos declara o próprio lucro. Se a
   * margem que o app calcula e a que o relatório declara não baterem, alguma
   * coisa no cruzamento está errada — provavelmente o relatório é de outro
   * período que não o da tela — e a margem por vendedor não pode ser levada a
   * sério, por mais bonita que esteja a tabela.
   *
   * Dois pontos percentuais de folga: mix de produtos muda a média, mas não a
   * dobra.
   */
  /**
   * QUANDO A VENDA DO RELATÓRIO É MAIOR QUE A DAS NOTAS, a pergunta é: que
   * vendas são essas que o relatório conta e as notas não?
   *
   * A resposta mais comum numa loja de material de construção é a venda de
   * BALCÃO, que sai em NFC-e (cupom fiscal eletrônico, modelo 65) e não em NF-e
   * (modelo 55). Se a base só tem modelo 55, é quase certamente isso — e a tela
   * diz, em vez de deixar um buraco sem explicação.
   */
  const modelos = new Map();
  for (const nf of doPeriodo) modelos.set(nf.modelo || '?', (modelos.get(nf.modelo || '?') || 0) + 1);
  const soTemNfe = modelos.size > 0 && [...modelos.keys()].every((m) => m === '55');

  const margemCalculada = venda ? ((venda - custo) / venda) * 100 : null;
  const margemDeclarada = totalRelatorio.margem;
  conferencia.margemCalculada = margemCalculada;
  conferencia.margemDeclarada = margemDeclarada;
  conferencia.margemConfere = margemCalculada == null || margemDeclarada == null
    ? null
    : Math.abs(margemCalculada - margemDeclarada) <= 2;
  conferencia.modelos = [...modelos.entries()].map(([modelo, quantas]) => ({ modelo, quantas }));
  conferencia.soTemNfe = soTemNfe;
  conferencia.vendaDoRelatorio = totalRelatorio.venda;
  conferencia.vendaDasNotas = temItensDeNota ? alvo.venda : null;
  conferencia.faltandoNasNotas = temItensDeNota && totalRelatorio.venda
    ? cents(totalRelatorio.venda - alvo.venda) : null;

  return {
    periodo: { de, ate },
    vendedores: lista,
    total: { venda, custo, lucro, margem: venda ? (lucro / venda) * 100 : null },
    totalRelatorio,
    // de onde vieram os números por vendedor, para a tela poder dizer
    fonte: temItensDeNota ? 'itens-da-nota' : 'relatorio-por-produto',
    // a margem só é confiável quando ela bate com a que o relatório declara
    margemConfiavel: conferencia.margemConfere !== false,
    /**
     * Os produtos cujo preço não bate entre o relatório e a nota. Não é erro do
     * app nem dela: é o mesmo produto contado em unidades diferentes nos dois
     * lugares. Fica à vista para poder ser corrigido na origem.
     */
    unidadeDiferente: produtosComUnidadeDiferente.map((id) => {
      const rel = vendaPorProduto.get(id);
      const nota = precoNasNotas.get(id);
      const cadastro = produtos.find((p) => p.id === id);
      const nome = cadastro?.descricao
        || (noPeriodo.find((l) => l.produtoId === id) || {}).descricao
        || (itens.find((i) => i.produtoId === id) || {}).descricao || id;
      const precoRel = rel?.quantidade ? cents(rel.valor / rel.quantidade) : null;
      const precoNf = nota?.quantidade ? cents(nota.valor / nota.quantidade) : null;
      return {
        produtoId: id,
        descricao: nome,
        custoCadastro: cadastro?.custo ?? null,
        varejoCadastro: cadastro?.precoVenda ?? null,
        precoNoRelatorio: precoRel,
        precoNaNota: precoNf,
        fator: cadastro?.custo != null && cadastro?.precoVenda
          ? Math.round((cadastro.custo / cadastro.precoVenda) * 100) / 100
          : (precoRel && precoNf ? Math.round((precoRel / precoNf) * 100) / 100 : null),
      };
    }).sort((a, b) => (b.fator || 0) - (a.fator || 0)),
    totalDasNotas,
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
  const [nfs, custos] = await Promise.all([
    recebidas ? Promise.resolve(recebidas) : store.nfs.listar(),
    store.fretes.listar(),
  ]);
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

  /**
   * O QUE O FRETE CUSTOU, da planilha dela.
   *
   * "O Guilherme tem um frete, mas aí o frete também a gente tem custo."
   *
   * O custo da frota é FIXO e mensal: salário de motorista não é de uma entrega,
   * é do mês. Por isso ele não é dividido por nota nem por vendedor — dividir
   * seria inventar um custo que ninguém sabe atribuir.
   *
   * O que o app faz é a conta que existe: frete cobrado no período menos frete
   * pago no período. Se sobrar, a entrega se paga; se faltar, parte do frete sai
   * do bolso da venda — e aí "fulano cobrou R$ 8 mil de frete" muda de sentido.
   */
  const doPeriodoCusto = custos.filter((c) => c.data && c.data >= de && c.data <= ate);
  const porTipo = { propria: 0, terceiro: 0, indefinido: 0 };
  for (const c of doPeriodoCusto) porTipo[c.tipo || 'indefinido'] = cents((porTipo[c.tipo || 'indefinido'] || 0) + (c.valor || 0));
  const custoTotal = cents(sum(doPeriodoCusto, (c) => c.valor || 0));
  const cobrado = cents(sum(comFrete, (nf) => nf.valorFrete || 0));

  const lista = [...porVendedor.values()].map((v) => ({
    ...v,
    frete: cents(v.frete),
    faturamento: cents(v.faturamento),
    peso: v.faturamento ? (v.frete / v.faturamento) * 100 : null,
    /**
     * Quanto do custo FIXO caberia a este vendedor se fosse rateado pelo frete
     * que ele cobrou. É um RATEIO, não o custo real da entrega dele — está dito
     * assim na tela. Serve para enxergar ordem de grandeza, não para cobrar
     * ninguém.
     */
    custoRateado: cobrado ? cents(custoTotal * (v.frete / cobrado)) : null,
  })).sort((a, b) => b.frete - a.frete);

  return {
    // sem a coluna no arquivo, o app não sabe — e dizer "R$ 0,00" seria mentira
    temDado: comFrete.length > 0,
    notasComFrete: comFrete.length,
    notasNoPeriodo: doPeriodo.length,
    total: cobrado,
    vendedores: lista,
    custo: {
      temDado: doPeriodoCusto.length > 0,
      lancamentos: doPeriodoCusto.length,
      total: custoTotal,
      frotaPropria: cents(porTipo.propria || 0),
      terceiros: cents(porTipo.terceiro || 0),
      naoClassificado: cents(porTipo.indefinido || 0),
      // a conta que importa: o frete cobrado paga o frete feito?
      resultado: cents(cobrado - custoTotal),
      cobertura: custoTotal ? (cobrado / custoTotal) * 100 : null,
      porResponsavel: [...doPeriodoCusto.reduce((mapa, c) => {
        const k = c.responsavel || 'sem identificação';
        mapa.set(k, cents((mapa.get(k) || 0) + (c.valor || 0)));
        return mapa;
      }, new Map())].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
    },
  };
}
