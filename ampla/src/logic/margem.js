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
 *  • A VENDA vem da NOTA FISCAL, sempre. É a regra da casa: "o que vale de
 *    faturamento é a nota fiscal; comissão, tudo, tudo é a nota fiscal, porque
 *    ali a gente sabe que o cliente foi uma venda efetiva".
 *  • O CUSTO vem, na ordem, do PEDIDO que gerou a nota (coluna "Valor custo" do
 *    relatório de vendas — o CMV do sistema dela, na unidade da venda), depois do
 *    CADASTRO DE PRODUTOS, depois do RELATÓRIO DE PRODUTOS VENDIDOS.
 *  • Sem o XML, a ponte venda↔vendedor é o RELATÓRIO DE COMISSÃO POR PRODUTO.
 *
 * O QUE A MARGEM DO RELATÓRIO DE PRODUTOS VENDIDOS É: outra base. Ele conta as
 * VENDAS do mês, a tela conta as NOTAS do mês, e nem toda venda sai em nota no
 * mesmo mês. Comparar as duas margens é referência, não conferência — e por isso
 * a diferença entre elas não segura mais a tela.
 *
 * O QUE SEGURA A TELA é a COBERTURA DE CUSTO: quanto da venda faturada tem custo
 * de origem verificada. Abaixo de 98% a margem não aparece como número bom, e o
 * que falta aparece em reais.
 *
 * Quando nada disso chegou, a margem NÃO é estimada: ela aparece como "falta o
 * relatório X", e só.
 */

import * as store from '../core/store.js';
import { cents, sum, normalize } from '../core/util.js';
import { monthKey } from '../core/format.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

/**
 * A RÉGUA DO CUSTO, UMA SÓ PARA TODAS AS FONTES.
 *
 * Custo acima de 1,5× a venda não é margem apertada: é custo em outra unidade,
 * ou venda com prejuízo. Nos dois casos o número não serve para calcular margem.
 * Estava aplicada ao cadastro de produtos e faltava no custo do pedido, que vem
 * antes dele — e era por ali que o erro entrava.
 */
const RAZAO_MAXIMA = 1.5;

/** Margem do período, por vendedor e total. */
export async function margem({ de, ate }) {
  const [linhas, vendedores, nfs, itens, produtos, pedidos] = await Promise.all([
    store.vendasProduto.listar(), store.vendedores.listar(), store.nfs.listar(),
    store.nfItens.listar(), store.produtos.listar(), store.pedidos.listar(),
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

  /**
   * O CUSTO QUE O SISTEMA DELA JÁ CALCULOU — a fonte que vem antes de todas.
   *
   * O relatório de vendas traz, em cada pedido, a coluna "Valor custo": é o CMV
   * daquela venda do jeito que o sistema dela registrou, na unidade da venda,
   * sem média de período e sem conta minha por cima. Vale para a nota inteira,
   * então dispensa a cascata de produto — e com ela some o problema de unidade,
   * que é a fonte de quase todo erro de margem nesta base.
   */
  const custoPorNota = custoDasNotasPeloPedido(doPeriodo, pedidos);
  let vendaComCustoDoPedido = 0;

  /**
   * ============ O CAMINHO DE QUEM NÃO TEM XML DE NOTA ============
   *
   * "Eu tava colocando, ajustando, e eu via que o número de margem, da
   *  porcentagem, e o custo e o lucro não mudaram."
   *
   * E não mudavam. O custo do pedido — e junto com ele TODO custo que ela
   * digitasse — só entrava na conta pelo caminho dos ITENS DAS NOTAS, que existe
   * só com o XML das NF-e. Sem XML, a tela mostrava o custo, o lucro e a margem
   * copiados do relatório de produtos vendidos: as três colunas que o arquivo já
   * traz somadas. Números do arquivo não mudam porque ela corrigiu um pedido
   * aqui — por mais certo que seja o valor que ela digitou.
   *
   * Pior: a tela OFERECIA a correção, com botão e tudo, num caminho que não era
   * usado para nada. Pedir trabalho a alguém e jogar o resultado fora é a pior
   * coisa que este app pode fazer.
   *
   * O relatório de vendas dá a conta inteira sem XML nenhum: cada pedido traz
   * valor total e "Valor custo" — a mesma venda, a mesma unidade, o CMV do
   * sistema dela — e o relatório de comissão por venda diz de quem é o pedido.
   * Uma base só, dois números da mesma linha, e é nela que o custo informado por
   * ela entra.
   *
   * Pedido CANCELADO fica fora: venda cancelada não é venda. Fica contado à
   * parte, para a diferença contra o relatório não parecer erro.
   */
  const mesDe = monthKey(de);
  const mesAte = monthKey(ate);
  const noPeriodoOPedido = (ped) => {
    if (ped.data) return ped.data >= de && ped.data <= ate;
    // sem data na linha, o mês escolhido na importação já diz a que período ela pertence
    if (ped.mes) return ped.mes >= mesDe && ped.mes <= mesAte;
    return false;
  };
  const pedidosDoPeriodo = pedidos.filter(noPeriodoOPedido);
  const pedidosValidos = pedidosDoPeriodo.filter((p) => p.concretizado !== false && p.valorTotal);
  const pedidosCancelados = pedidosDoPeriodo.filter((p) => p.concretizado === false);
  const temCustoDePedido = pedidosValidos.some((p) => p.custoManual != null || p.valorCusto != null);

  /**
   * A ORDEM DAS FONTES, da melhor para a pior:
   *
   *  1. ITENS DAS NOTAS (XML): recorte exato do período, com devolução e produto;
   *  2. PEDIDOS do relatório de vendas: venda e custo da mesma linha, por
   *     vendedor, e é onde o custo informado por ela vale;
   *  3. relatório de comissão por produto, que é um total do período do arquivo.
   */
  const fonteDosNumeros = temItensDeNota ? 'itens-da-nota'
    : (temCustoDePedido ? 'pedidos-do-periodo' : 'relatorio-por-produto');

  if (fonteDosNumeros === 'pedidos-do-periodo') {
    for (const p of pedidosValidos) {
      const vid = p.vendedorId || null;
      const chave = vid || `nome:${normalize(p.vendedorNome) || 'sem'}`;
      if (!porVendedor.has(chave)) {
        porVendedor.set(chave, {
          vendedorId: vid,
          nome: vid ? (nomeVendedor.get(vid) || p.vendedorNome) : (p.vendedorNome || 'sem vendedor'),
          venda: 0, custo: 0, quantidade: 0, produtos: 0, produtosSemCusto: 0,
          vendaSemCusto: 0, custoDoPedido: 0,
        });
      }
      const v = porVendedor.get(chave);
      const vendaDele = Math.abs(cents(p.valorTotal));
      v.venda += vendaDele;
      v.produtos += 1;
      const regua = custoConfiavelDoPedido(p);
      if (regua.custo == null) {
        v.produtosSemCusto += 1;
        v.vendaSemCusto += vendaDele;
        semCusto += 1;
      } else {
        v.custo += regua.custo;
        v.custoDoPedido += regua.custo;
        vendaComCustoDoPedido += vendaDele;
      }
    }
  }

  if (temItensDeNota) {
    const nfPorId = new Map(nfs.map((n) => [n.id, n]));
    const itensPorNota = new Map();
    for (const item of itensDoPeriodo) {
      if (!itensPorNota.has(item.nfId)) itensPorNota.set(item.nfId, []);
      itensPorNota.get(item.nfId).push(item);
    }
    for (const [nfId, daNota] of itensPorNota) {
      const nf = nfPorId.get(nfId);
      if (!nf || !valeParaFaturamento(nf)) continue;
      const vid = (daNota.find((i) => i.vendedorId) || {}).vendedorId || nf.vendedorId || null;
      const chave = vid || 'sem';
      if (!porVendedor.has(chave)) {
        porVendedor.set(chave, {
          vendedorId: vid,
          nome: vid ? (nomeVendedor.get(vid) || 'Vendedor') : 'sem vendedor',
          venda: 0, custo: 0, quantidade: 0, produtos: 0, produtosSemCusto: 0,
          vendaSemCusto: 0, custoDoPedido: 0,
        });
      }
      const v = porVendedor.get(chave);
      const sinal = nf.devolucao ? -1 : 1;
      const custoDoPedido = custoPorNota.get(nfId);
      for (const item of daNota) {
        const quantidade = Math.abs(item.quantidade || 0) * sinal;
        const valor = Math.abs(item.valorTotal || 0) * sinal;
        v.venda += valor;
        v.quantidade += quantidade;
        v.produtos += 1;
        // o custo do pedido já cobre esta nota inteira: o item entra só com venda
        if (custoDoPedido != null) continue;
        const custoDaVenda = custoDaLinha(
          item.produtoId,
          quantidade,
          valor,
          item.custoUnitario ?? (item.custoTotal != null && item.quantidade
            ? item.custoTotal / item.quantidade : null),
        );
        if (custoDaVenda == null) {
          v.produtosSemCusto += 1;
          v.vendaSemCusto += Math.abs(valor);
          semCusto += 1;
        } else v.custo += custoDaVenda;
      }
      if (custoDoPedido != null) {
        v.custo += custoDoPedido * sinal;
        v.custoDoPedido += custoDoPedido * sinal;
        vendaComCustoDoPedido += sum(daNota, (i) => Math.abs(i.valorTotal || 0)) * sinal;
      }
    }
  }

  for (const l of fonteDosNumeros === 'relatorio-por-produto' ? noPeriodo : []) {
    if (l.origemRelatorio !== 'comissaoProduto') continue;
    const vid = vendedorDa(l);
    const chave = vid || `nome:${normalize(l.vendedorNome) || 'sem'}`;
    if (!porVendedor.has(chave)) {
      porVendedor.set(chave, {
        vendedorId: vid,
        nome: vid ? (nomeVendedor.get(vid) || l.vendedorNome) : (l.vendedorNome || 'sem vendedor'),
        venda: 0, custo: 0, quantidade: 0, produtos: 0, produtosSemCusto: 0,
        vendaSemCusto: 0, custoDoPedido: 0,
      });
    }
    const v = porVendedor.get(chave);
    v.venda += l.valorTotal || 0;
    v.quantidade += l.quantidade || 0;
    v.produtos += 1;
    const custoDaVenda = custoDaLinha(l.produtoId, l.quantidade, l.valorTotal, null);
    if (custoDaVenda == null) {
      v.produtosSemCusto += 1;
      v.vendaSemCusto += Math.abs(l.valorTotal || 0);
      semCusto += 1;
    } else v.custo += custoDaVenda;
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
      vendaSemCusto: cents(v.vendaSemCusto || 0),
      // quanto do custo dele veio do pedido, que é a fonte boa
      custoDoPedido: cents(v.custoDoPedido || 0),
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
  /**
   * Pelo caminho dos PEDIDOS não há contra o que conferir a venda: ela É a soma
   * dos pedidos, do mesmo arquivo de onde sai o custo. Comparar com o relatório
   * de produtos vendidos seria tentador, mas exigiria eu adivinhar se aquele
   * arquivo conta as vendas canceladas — e uma conferência que depende de um
   * palpite meu sobre o arquivo dela acusa divergência onde não há. A conferência
   * que vale aqui é a COBERTURA DE CUSTO, que vem logo abaixo.
   */
  const vendaCancelada = cents(sum(pedidosCancelados, (p) => Math.abs(p.valorTotal || 0)));
  const alvo = temItensDeNota
    ? {
      venda: cents(sum(doPeriodo, (n) => (n.devolucao ? -1 : 1)
        * Math.abs(n.valorProdutos ?? ((n.valorTotal || 0) - (n.valorFrete || 0))))),
      custo: null,
    }
    : (fonteDosNumeros === 'pedidos-do-periodo'
      ? { venda, custo: null }
      : { venda: totalRelatorio.venda, custo: totalRelatorio.custo });
  const BASE = {
    'itens-da-nota': 'faturamento do período',
    'pedidos-do-periodo': 'pedidos do relatório de vendas',
    'relatorio-por-produto': 'relatório de produtos vendidos',
  };
  const conferencia = {
    base: BASE[fonteDosNumeros],
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
   * A MARGEM QUE O RELATÓRIO DECLARA SÓ VALE DEPOIS DE LIMPA.
   *
   * O relatório de produtos vendidos declara o próprio lucro, e por isso serve de
   * referência. Mas ele carrega o mesmo erro de unidade que já apareceu no custo
   * médio: TIJOLO COMUM 9X19X5 (PACOTE C/10) sai com a quantidade em PEÇA e o
   * custo médio do PACOTE — 3.959 × R$ 87,38 = R$ 345.933,00 de custo sobre
   * R$ 29.767,75 de venda. Dezesseis linhas assim respondiam por R$ 372.615,50 de
   * custo sobre R$ 37.507,94 de venda e derrubavam a margem declarada do
   * relatório inteiro de 42,3% para 22,5%.
   *
   * Custo maior que a venda do produto no mês inteiro não é prejuízo: é unidade
   * trocada. Essas linhas saem da referência e aparecem na tela, para serem
   * corrigidas na origem — o único lugar onde isso se resolve de verdade.
   */
  const furadas = doRelatorio.filter((l) => l.custoTotal != null && l.valorTotal
    && l.custoTotal > l.valorTotal);
  const relatorioLimpo = {
    venda: cents(totalRelatorio.venda - sum(furadas, (l) => l.valorTotal || 0)),
    custo: cents(totalRelatorio.custo - sum(furadas, (l) => l.custoTotal || 0)),
  };
  relatorioLimpo.margem = relatorioLimpo.venda
    ? ((relatorioLimpo.venda - relatorioLimpo.custo) / relatorioLimpo.venda) * 100 : null;
  conferencia.relatorioFurado = {
    linhas: furadas.length,
    venda: cents(sum(furadas, (l) => l.valorTotal || 0)),
    custo: cents(sum(furadas, (l) => l.custoTotal || 0)),
    produtos: furadas.slice()
      .sort((x, y) => (y.custoTotal || 0) - (x.custoTotal || 0))
      .slice(0, 10)
      .map((l) => ({
        descricao: l.descricao, quantidade: l.quantidade,
        venda: l.valorTotal, custo: l.custoTotal,
      })),
  };

  const margemCalculada = venda ? ((venda - custo) / venda) * 100 : null;
  conferencia.margemCalculada = margemCalculada;
  // a margem do relatório, já sem as linhas de unidade trocada
  conferencia.margemDeclarada = relatorioLimpo.margem;
  // e a que ele declara de fato, com elas, para a diferença não ficar escondida
  conferencia.margemDeclaradaBruta = totalRelatorio.margem;

  /**
   * O QUE A MARGEM DO RELATÓRIO É E O QUE ELA NÃO É.
   *
   * Ela não é a mesma conta com outro resultado: é OUTRA BASE. O relatório conta
   * as VENDAS do mês; a margem da tela conta as NOTAS do mês. São conjuntos
   * diferentes de venda, porque nem toda venda do mês sai em nota no mesmo mês —
   * e nem toda nota do mês vem de venda deste mês.
   *
   * Por isso a diferença entre as duas é referência, não erro, e não segura mais
   * a tela. Quem decide se a margem pode ser levada a sério é a COBERTURA DE
   * CUSTO: quanto da venda faturada tem custo de origem verificada. É isso que
   * fica à vista, em reais.
   */
  conferencia.vendaDoRelatorio = totalRelatorio.venda;
  conferencia.vendaDasNotas = temItensDeNota ? alvo.venda : null;
  conferencia.diferencaDeBase = temItensDeNota && totalRelatorio.venda
    ? cents(totalRelatorio.venda - alvo.venda) : null;

  const vendaSemCusto = cents(sum(lista, (v) => v.vendaSemCusto || 0));
  conferencia.coberturaDeCusto = {
    venda,
    semCusto: vendaSemCusto,
    comCusto: cents(venda - vendaSemCusto),
    percentual: venda ? ((venda - vendaSemCusto) / venda) * 100 : null,
    doPedido: cents(vendaComCustoDoPedido),
    percentualDoPedido: venda ? (cents(vendaComCustoDoPedido) / venda) * 100 : null,
    notasComPedido: custoPorNota.size,
    /* quantos pedidos entraram com o custo do próprio sistema, pelo caminho dos pedidos */
    pedidosComCusto: fonteDosNumeros === 'pedidos-do-periodo'
      ? pedidosValidos.filter((x) => custoConfiavelDoPedido(x).custo != null).length : 0,
  };
  /**
   * NOVENTA E OITO POR CENTO.
   *
   * Abaixo disso a margem não é margem, é média de uma parte — e a tela diz isso
   * em vermelho em vez de mostrar o número. Acima, o número vale e o que falta
   * aparece em reais do lado, porque dois por cento de venda sem custo mudam a
   * margem na primeira casa, não na ordem de grandeza.
   */
  conferencia.coberturaDeCusto.suficiente = conferencia.coberturaDeCusto.percentual != null
    && conferencia.coberturaDeCusto.percentual >= 98;

  /**
   * A LISTA DO QUE FOI DESCARTADO SAI DA MESMA BASE QUE ESTÁ VALENDO.
   *
   * Era daí que vinha o estrago: a tela listava pedidos descartados pelo caminho
   * das NOTAS e oferecia o botão de corrigir, enquanto a margem vinha do
   * relatório de produtos vendidos. Ela corrigia, e nada mudava — porque a
   * correção caía num cálculo que a tela não estava usando.
   */
  let descartados = custoPorNota.descartados || [];
  let informados = custoPorNota.informados || [];
  if (fonteDosNumeros === 'pedidos-do-periodo') {
    descartados = [];
    informados = [];
    for (const p of pedidosValidos) {
      const regua = custoConfiavelDoPedido(p);
      if (regua.informado) { informados.push(linhaDeCustoInformado(p)); continue; }
      if (!regua.suspeito) continue;
      descartados.push({
        nfId: null,
        numero: p.nfNumero || null,
        pedido: p.numero || null,
        pedidoId: p.id,
        vendedorId: p.vendedorId || null,
        venda: cents(Math.abs(p.valorTotal)),
        custo: cents(p.valorCusto),
        pedidoValor: cents(p.valorTotal),
        pedidoCusto: cents(p.valorCusto),
        notasDoPedido: 1,
        razao: regua.razao,
      });
    }
  }

  return {
    periodo: { de, ate },
    vendedores: lista,
    total: { venda, custo, lucro, margem: venda ? (lucro / venda) * 100 : null },
    totalRelatorio,
    // de onde vieram os números por vendedor, para a tela poder dizer
    fonte: fonteDosNumeros,
    /* os pedidos do período, para a tela poder dizer quantos entraram e quantos não */
    pedidosDoPeriodo: {
      quantidade: pedidosValidos.length,
      cancelados: pedidosCancelados.length,
      vendaCancelada,
    },
    /**
     * POR QUE OS NÚMEROS VÊM DAQUI, EM CONTAGENS.
     *
     * "Eu já vi aqui e eu tô na versão certa, versão 59, mas não mudou nada no
     *  que eu preciso."
     *
     * Quando a fonte boa não está disponível, o app cai na pior sem dizer uma
     * palavra — e aí a tela fica idêntica à de antes do conserto, e nem ela nem
     * eu temos como saber por quê. Já me custou duas rodadas adivinhando por
     * print o que estava faltando na base dela.
     *
     * Estas contagens dizem exatamente qual campo faltou. Não é diagnóstico para
     * programador: é a diferença entre "reenvie o relatório com a coluna X" e
     * mais uma semana de palpite.
     */
    origemDosNumeros: {
      fonte: fonteDosNumeros,
      pedidosNaBase: pedidos.length,
      noPeriodo: pedidosDoPeriodo.length,
      semDataNenhuma: pedidos.filter((x) => !x.data && !x.mes).length,
      comValorTotal: pedidosDoPeriodo.filter((x) => x.valorTotal).length,
      comCusto: pedidosDoPeriodo.filter((x) => x.valorCusto != null || x.custoManual != null).length,
      concretizados: pedidosValidos.length,
      cancelados: pedidosCancelados.length,
      comVendedor: pedidosValidos.filter((x) => x.vendedorId).length,
      itensDeNota: itensDoPeriodo.length,
      linhasComissaoProduto: noPeriodo.filter((l) => l.origemRelatorio === 'comissaoProduto').length,
      linhasProdutosVendidos: doRelatorio.length,
    },
    // a margem é confiável quando quase toda a venda tem custo de origem verificada
    margemConfiavel: conferencia.coberturaDeCusto.suficiente,
    /**
     * OS PEDIDOS CUJO CUSTO FOI DESCARTADO POR SER MAIOR QUE A VENDA.
     *
     * Não somem: aparecem com número, cliente e os dois valores, porque é a
     * lista que ela leva para corrigir na origem. Enquanto não for corrigida, a
     * margem vale para o resto — e a cobertura diz de quanto é esse resto.
     */
    custoSuspeito: {
      quantidade: descartados.length,
      venda: cents(sum(descartados, (d) => d.venda)),
      custo: cents(sum(descartados, (d) => d.custo)),
      /* a tela precisa saber se cada linha é uma nota ou um pedido, para falar certo */
      unidade: fonteDosNumeros === 'pedidos-do-periodo' ? 'pedidos' : 'notas',
      linhas: descartados
        .map((d) => ({ ...d, vendedor: d.vendedorId ? (nomeVendedor.get(d.vendedorId) || null) : null }))
        .sort((a, b) => b.razao - a.razao),
    },
    /**
     * Os pedidos cujo custo ela mesma informou. Ficam à vista, com o valor que
     * o relatório trazia ao lado — porque número digitado por cima de número
     * importado, sem dizer onde, é como se perde a confiança numa base.
     */
    custoInformado: {
      quantidade: informados.length,
      custo: cents(sum(informados, (d) => d.custo)),
      custoRelatorio: cents(sum(informados, (d) => d.custoRelatorio || 0)),
      pedidos: informados.slice().sort((a, b) => (b.custo || 0) - (a.custo || 0)),
    },
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
 * O CUSTO DE CADA NOTA, VINDO DO PEDIDO QUE A GEROU.
 *
 * A coluna "Valor custo" do relatório de vendas é o CMV que o sistema dela
 * registrou para aquela venda — na unidade da venda, do mês da venda, sem média
 * e sem conta minha por cima. É a melhor fonte de custo que existe nesta base.
 *
 * A ligação é a mesma do DRE: a nota aponta para o pedido. Quando um pedido
 * rendeu mais de uma nota, o custo se divide na proporção do valor de cada uma —
 * e só quando o pedido informa o valor total, que é o que torna a proporção
 * verificável. Sem isso a nota não recebe custo por aqui e cai na cascata de
 * produto, em vez de levar um rateio inventado.
 *
 * O pedido pode ser de OUTRO MÊS: a nota de setembro que saiu de um pedido de
 * agosto só ganha custo se os pedidos de agosto estiverem na base. É por isso
 * que o relatório de vendas vale mandar com folga de um mês para trás.
 */
/**
 * O CUSTO DE UM PEDIDO, PELA RÉGUA, NUM LUGAR SÓ.
 *
 * Três telas precisam da mesma decisão: vale o custo que ela digitou, vale o que
 * o relatório trouxe, ou não vale nenhum. Tendo a decisão em duas cópias, uma
 * delas fica para trás — foi exatamente o que aconteceu: a régua entrou no
 * caminho das notas e o custo informado por ela só valia ali, num aparelho que
 * não tem XML de nota nenhum.
 */
function linhaDeCustoInformado(pedido) {
  return {
    pedidoId: pedido.id,
    pedido: pedido.numero || null,
    valor: pedido.valorTotal == null ? null : cents(pedido.valorTotal),
    custo: cents(pedido.custoManual),
    custoRelatorio: pedido.valorCusto == null ? null : cents(pedido.valorCusto),
    em: pedido.custoManualEm || null,
  };
}

function custoConfiavelDoPedido(pedido, vendaDeReferencia = null) {
  if (pedido.custoManual != null) {
    return { custo: cents(pedido.custoManual), informado: true };
  }
  if (pedido.valorCusto == null) return { custo: null, semCusto: true };
  /**
   * A régua mede contra a venda do PEDIDO. Quando o pedido não trouxe valor
   * total — coluna não mapeada na importação, e acontece — mede contra a venda
   * que o chamador conhece (a da nota), que é o que ela media antes.
   *
   * Sem essa volta, pedido sem valor total faz a régua parar de funcionar em
   * silêncio: o custo absurdo voltaria para dentro da margem sem ninguém ver.
   */
  const venda = Math.abs(pedido.valorTotal || 0) || Math.abs(vendaDeReferencia || 0);
  const razao = venda > 0 ? pedido.valorCusto / venda : null;
  if (razao != null && razao > RAZAO_MAXIMA) {
    return { custo: null, suspeito: true, razao };
  }
  return { custo: cents(pedido.valorCusto), razao };
}

function custoDasNotasPeloPedido(notas, pedidos) {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const porNumero = new Map(pedidos.filter((p) => p.numero).map((p) => [String(p.numero), p]));
  const pedidoDa = (nf) => porId.get(nf.pedidoId)
    || (nf.pedidoNumero ? porNumero.get(String(nf.pedidoNumero)) : null);
  const descartados = [];
  const informados = [];
  const jaListado = new Set();

  const quantasNotas = new Map();
  for (const nf of notas) {
    const pedido = pedidoDa(nf);
    if (pedido) quantasNotas.set(pedido.id, (quantasNotas.get(pedido.id) || 0) + 1);
  }

  const custo = new Map();
  for (const nf of notas) {
    const pedido = pedidoDa(nf);
    if (!pedido) continue;
    /**
     * O CUSTO QUE ELA DIGITOU VENCE O QUE O PEDIDO REGISTROU.
     *
     * "Não tem como eu ajustar ou te passar por aqui os custos desses pedidos
     *  em específico pra ficar certinho?"
     *
     * O custo fica congelado no pedido no momento da emissão: corrigir o
     * cadastro na origem não reescreve pedido já emitido, e ela não vai
     * reemitir 22 pedidos de outubro para acertar um número. Então ela informa
     * o custo real aqui, uma vez por pedido, e ele passa a valer.
     *
     * Vale INTEIRO, sem passar pela régua: a régua existe para desconfiar de
     * dado automático de origem desconhecida, não da dona da empresa olhando o
     * pedido. Se ela disser que aquele pedido custou mais do que vendeu, foi
     * isso mesmo que aconteceu — e o app não tem por que discordar.
     *
     * O que o app não faz é esconder: todo pedido com custo informado aparece
     * na tela, com o valor que o relatório trazia ao lado do que ela digitou.
     */
    const regua = custoConfiavelDoPedido(pedido, Math.abs(valorFaturado(nf)));
    const varias = (quantasNotas.get(pedido.id) || 1) > 1;
    if (varias && !pedido.valorTotal) continue;
    const parte = varias ? valorFaturado(nf) / pedido.valorTotal : 1;
    if (regua.informado) {
      custo.set(nf.id, cents(pedido.custoManual * parte));
      if (!jaListado.has(pedido.id)) {
        jaListado.add(pedido.id);
        informados.push(linhaDeCustoInformado(pedido));
      }
      continue;
    }
    if (regua.semCusto) continue;
    const doPedido = cents(pedido.valorCusto * parte);

    /**
     * A MESMA RÉGUA DAS OUTRAS DUAS FONTES, QUE AQUI FALTAVA.
     *
     * "Mandei os arquivos, tudo certinho, mas mantém o custo. Eu queria ter o
     *  valor real."
     *
     * O cadastro de produtos é descartado quando o custo passa de 1,5× o preço
     * de venda; o relatório de produtos vendidos, quando a razão passa de 5. Mas
     * o custo do PEDIDO — que vem antes dos dois — entrava sem conferência
     * nenhuma. Um pedido com custo 36 VEZES a venda passava direto, e sozinho
     * derrubava a margem do vendedor inteiro para o negativo.
     *
     * Foi o que aconteceu em outubro: 28 pedidos com custo acima da venda, por
     * um produto cadastrado em unidade errada (tijolo comum com custo de
     * milheiro e venda por pacote de 10). Corrigir o cadastro na origem não
     * reescreve pedido já emitido: o custo fica congelado no pedido para sempre.
     *
     * Custo acima da venda é uma de duas coisas: venda com prejuízo de verdade
     * (raro, e o app não deve presumir) ou custo registrado em outra unidade
     * (comum). Nos dois casos ele não serve para calcular margem — e inventar
     * um prejuízo é pior do que dizer "deste pedaço eu não sei".
     *
     * Então o custo suspeito sai da conta e a venda dele vai para "sem custo
     * confiável", em reais e à vista, que é como o app já trata as outras duas
     * fontes. A margem passa a valer para o pedaço que tem custo bom, e a
     * cobertura diz de quanto é esse pedaço.
     */
    const venda = Math.abs(valorFaturado(nf));
    if (regua.suspeito) {
      descartados.push({
        nfId: nf.id,
        numero: nf.numero || null,
        pedido: pedido.numero || null,
        pedidoId: pedido.id,
        vendedorId: nf.vendedorId || null,
        venda: cents(venda),
        custo: doPedido,
        /* o pedido inteiro, que é o que ela vai olhar para digitar o custo certo */
        pedidoValor: pedido.valorTotal == null ? null : cents(pedido.valorTotal),
        pedidoCusto: pedido.valorCusto == null ? null : cents(pedido.valorCusto),
        notasDoPedido: quantasNotas.get(pedido.id) || 1,
        razao: regua.razao,
      });
      continue;
    }
    custo.set(nf.id, doPedido);
  }
  /* a lista do que foi descartado volta junto: a tela tem de poder dizer */
  custo.descartados = descartados;
  custo.informados = informados;
  return custo;
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
  const [nfs, custos, vendedores, entregadores] = await Promise.all([
    recebidas ? Promise.resolve(recebidas) : store.nfs.listar(),
    store.fretes.listar(),
    store.vendedores.listar(),
    store.entregadores.listar(),
  ]);
  /**
   * CARRO NOSSO OU FRETEIRO — quem diz é ela, uma vez por nome.
   *
   * "Na planilha tem tanto nossos carros quanto os freteiros. Vincular qual que
   *  é qual: o VUC é nosso carro, o João é terceiro."
   *
   * O app não deduz isso do valor. R$ 0,00 numa entrega quer dizer que não houve
   * custo de terceiro NAQUELA entrega, não que o motorista seja da casa — e a
   * frota própria aparece com valor quando sai algum extra. A classificação é um
   * cadastro de nome, feito uma vez e válido para sempre.
   */
  const tipoDoEntregador = new Map(entregadores.map((e) => [normalize(e.nome), e.tipo]));
  const nomeVendedor = nomes || new Map(vendedores.map((v) => [v.id, v.nome]));
  const idPorNome = new Map();
  for (const v of vendedores) {
    idPorNome.set(normalize(v.nome), v.id);
    for (const a of v.apelidos || []) idPorNome.set(normalize(a), v.id);
  }
  /**
   * NA PLANILHA DE ENTREGAS O VENDEDOR VEM PELO PRIMEIRO NOME.
   *
   * Quem preenche o formulário escreve MARCELO; o cadastro diz MARCELO SANTANA.
   * Sem isto, as entregas dele caíam todas em "sem vendedor".
   *
   * Não é semelhança de texto: é primeiro nome que pertence a UM vendedor só.
   * Se dois vendedores começassem com o mesmo nome, nenhum dos dois seria
   * escolhido — é a mesma regra do par único que liga nota a pedido.
   */
  const porPrimeiroNome = new Map();
  for (const v of vendedores) {
    const primeiro = normalize(v.nome).split(' ')[0];
    if (!primeiro) continue;
    porPrimeiroNome.set(primeiro, porPrimeiroNome.has(primeiro) ? null : v.id);
  }
  const vendedorPeloNome = (texto) => {
    const t = normalize(texto || '');
    if (!t) return null;
    return idPorNome.get(t) || porPrimeiroNome.get(t.split(' ')[0]) || null;
  };
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
  const tipoDaLinha = (c) => tipoDoEntregador.get(normalize(c.responsavel || ''))
    || (c.tipo && c.tipo !== 'indefinido' ? c.tipo : null)
    || 'indefinido';
  const porTipo = { propria: 0, terceiro: 0, indefinido: 0 };
  for (const c of doPeriodoCusto) {
    const t = tipoDaLinha(c);
    porTipo[t] = cents((porTipo[t] || 0) + (c.valor || 0));
  }
  const custoTotal = cents(sum(doPeriodoCusto, (c) => c.valor || 0));
  const cobrado = cents(sum(comFrete, (nf) => nf.valorFrete || 0));

  /**
   * O CUSTO DE FRETE DE CADA VENDEDOR, quando a planilha diz de quem é a venda.
   *
   * "O Guilherme tem um frete, mas aí o frete também a gente tem custo."
   *
   * A planilha de entregas traz o vendedor em cada linha. Então este número não
   * é rateio nenhum: é a soma do que as entregas DELE custaram. O rateio só
   * continua existindo para quando a planilha não disser o vendedor — e os dois
   * ficam em colunas diferentes, porque um é medida e o outro é estimativa.
   */
  const custoPorVendedor = new Map();
  let custoSemVendedor = 0;
  for (const c of doPeriodoCusto) {
    const vid = c.vendedorId || vendedorPeloNome(c.vendedorNome);
    if (!vid) { custoSemVendedor += c.valor || 0; continue; }
    custoPorVendedor.set(vid, cents((custoPorVendedor.get(vid) || 0) + (c.valor || 0)));
  }
  const temCustoPorVendedor = custoPorVendedor.size > 0;

  /**
   * O VENDEDOR QUE TEM CUSTO DE ENTREGA MAS NÃO COBROU FRETE também entra na
   * tabela. Senão o custo dele sumia da vista: aparecia no total e em lugar
   * nenhum — que é exatamente o número que faz falta.
   */
  for (const [vid, valor] of custoPorVendedor) {
    if (porVendedor.has(vid)) continue;
    porVendedor.set(vid, {
      vendedorId: vid,
      nome: nomeVendedor.get(vid) || 'Vendedor',
      frete: 0, notas: 0, faturamento: 0, custoSemCobranca: valor,
    });
  }

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
    /* o que as entregas dele custaram de verdade, quando a planilha diz */
    custoReal: v.vendedorId && custoPorVendedor.has(v.vendedorId)
      ? custoPorVendedor.get(v.vendedorId) : null,
    /* e o que sobra da entrega dele: cobrado menos custo medido */
    resultado: v.vendedorId && custoPorVendedor.has(v.vendedorId)
      ? cents(v.frete - custoPorVendedor.get(v.vendedorId)) : null,
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
      // a planilha de entregas diz de quem é a venda? então o custo por vendedor
      // é medido, não rateado — e a tela pode parar de pedir desculpa pelo rateio
      porVendedor: temCustoPorVendedor,
      semVendedor: cents(custoSemVendedor),
      entregas: doPeriodoCusto.length,
      /* entrega registrada sem custo lançado não é entrega de graça: é campo em branco */
      semValor: doPeriodoCusto.filter((c) => c.valor == null).length,
      semCobranca: doPeriodoCusto.filter((c) => c.valor === 0).length,
      porResponsavel: [...doPeriodoCusto.reduce((mapa, c) => {
        const k = c.responsavel || 'sem identificação';
        const atual = mapa.get(k) || { valor: 0, entregas: 0 };
        atual.valor = cents(atual.valor + (c.valor || 0));
        atual.entregas += 1;
        mapa.set(k, atual);
        return mapa;
      }, new Map())].map(([nome, x]) => ({
        nome,
        valor: x.valor,
        entregas: x.entregas,
        tipo: tipoDoEntregador.get(normalize(nome)) || null,
      })).sort((a, b) => b.valor - a.valor),
      // quantos nomes ainda não foram classificados como frota ou terceiro
      semClassificacao: cents(sum(doPeriodoCusto.filter((c) => tipoDaLinha(c) === 'indefinido'),
        (c) => c.valor || 0)),
    },
  };
}
