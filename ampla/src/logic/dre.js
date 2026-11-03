/**
 * DRE — Demonstração do Resultado (item do fechamento mensal)
 *
 * Montado a partir do que a empresa realmente exporta:
 *   receita  ← NFs emitidas no mês (item 4: vale a data de emissão)
 *   CMV      ← "valor do custo" do pedido que gerou cada nota
 *   despesas ← contas a pagar, agrupadas pelo PLANO DE CONTAS
 *
 * Duas regras de honestidade valem aqui como em todo o resto:
 *
 *  1. Nada é estimado. Nota cujo pedido não tem custo não recebe um custo
 *     "médio": ela fica de fora do CMV e a cobertura aparece na tela. Um lucro
 *     bruto calculado sobre 60% do faturamento é dito como tal.
 *  2. Nada é contado duas vezes. Se o plano de contas tiver compras de
 *     mercadoria, esse dinheiro já está no CMV; as contas que você marcar como
 *     mercadoria saem das despesas operacionais e aparecem à parte.
 */

import * as store from '../core/store.js';
import { monthKey, money } from '../core/format.js';
import { cents, sum } from '../core/util.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

const SEM_CLASSIFICACAO = 'Sem plano de contas';
const SEM_GRUPO = 'Sem grupo';

/**
 * OS DEGRAUS DO DRE GERENCIAL, e a que degrau cada conta do plano pertence.
 *
 * "Tem que ter mais escolhas de em que degrau. Eu preciso entender quais são
 *  esses degraus que ele mesmo criou, ou a oportunidade de criar novos. Sei lá,
 *  eu não entendi muito bem não."
 *
 * Resposta honesta: o app NÃO inventou degrau nenhum. Os seis abaixo são as
 * linhas do próprio DRE — as mesmas do relatório do BPO — e elas são fixas
 * porque cada uma é uma POSIÇÃO NA CONTA: dedução entra antes da receita
 * líquida, despesa direta entra antes da margem de contribuição, empréstimo
 * entra depois do EBITDA. Criar um degrau novo seria criar uma linha nova no
 * meio da conta, e aí EBITDA e margem de contribuição passariam a significar
 * outra coisa — e deixariam de ser comparáveis com o relatório dela.
 *
 * O que ela cria são os GRUPOS dentro de cada degrau: "Pessoal e encargos",
 * "Ocupação", "Veículos". Esses são dela, ela inventa quantos quiser, e o DRE
 * abre neles sem que a conta mude de forma.
 *
 * O app não adivinha o degrau de nenhuma conta. As pistas servem só para
 * SUGERIR na tela, onde ela confirma — e conta não confirmada não é empurrada
 * para um degrau qualquer: aparece numa linha própria, "sem classificação",
 * que desconta do lucro líquido e pede o clique.
 */
export const DEGRAUS = [
  {
    id: 'deducao',
    numero: 1,
    nome: 'Deduções da receita',
    ajuda: 'imposto que incide sobre a venda',
    onde: 'Sai da receita bruta, antes da receita líquida.',
    exemplos: ['Simples Nacional / DAS', 'PIS', 'COFINS', 'ICMS', 'ISS', 'Substituição tributária'],
    gruposSugeridos: ['Impostos federais', 'Impostos estaduais', 'Impostos municipais'],
    pistas: /simples|\bdas\b|\bpis\b|cofins|icms|\biss\b|irpj|csll|imposto|tribut|federa|difal|\bst\b|substitui/i,
  },
  {
    id: 'mercadoria',
    numero: 2,
    nome: 'Compra de mercadoria',
    ajuda: 'o que você comprou para revender',
    onde: 'NÃO desce pelas despesas: esse custo já entra no DRE pelo CMV. '
      + 'Contar nos dois lugares derrubaria o resultado do mês sem motivo.',
    exemplos: ['Compra de mercadoria para revenda', 'Fornecedor de material', 'Frete sobre a compra'],
    gruposSugeridos: ['Fornecedores de revenda', 'Frete sobre compras'],
    pistas: /mercadoria|revenda|compra de produto|estoque|fornecedor/i,
  },
  {
    id: 'direta',
    numero: 3,
    nome: 'Despesas diretas',
    ajuda: 'o que só existe porque houve venda',
    onde: 'Sai do lucro bruto, antes da margem de contribuição.',
    exemplos: ['Frete de entrega', 'Comissão de vendedores', 'RT (indicação)', 'Embalagem'],
    gruposSugeridos: ['Frete e entrega', 'Comissões e RT', 'Embalagem'],
    pistas: /frete|entrega|transport|comiss|\brt\b|indica/i,
  },
  {
    id: 'indireta',
    numero: 4,
    nome: 'Despesas indiretas',
    ajuda: 'a estrutura, que existe vendendo ou não',
    onde: 'Sai da margem de contribuição, antes do EBITDA.',
    exemplos: ['Salários e encargos', 'Aluguel', 'Energia', 'Contador', 'Manutenção', 'Combustível'],
    gruposSugeridos: [
      'Pessoal e encargos', 'Ocupação (aluguel, energia, água)', 'Administrativas',
      'Comerciais e marketing', 'Manutenção e reformas', 'Veículos e combustível',
      'Tecnologia e sistemas', 'Serviços de terceiros', 'Pró-labore',
    ],
    pistas: null,
  },
  {
    id: 'emprestimo',
    numero: 5,
    nome: 'Empréstimos e financiamentos',
    ajuda: 'dívida: parcela, juros e tarifa de banco',
    onde: 'Sai depois do EBITDA. É por isso que o EBITDA mostra como a operação '
      + 'vai indo mesmo quando a dívida está pesada.',
    exemplos: ['Capital de giro', 'Financiamento de veículo', 'Antecipação de recebíveis', 'Juros e tarifas'],
    gruposSugeridos: ['Juros e tarifas', 'Amortização de empréstimo', 'Antecipação de recebíveis'],
    pistas: /emprestim|empréstim|financiam|capital de giro|juros|antecipa|desconto de duplicata/i,
  },
  {
    id: 'naoOperacional',
    numero: 6,
    nome: 'Itens não operacionais',
    ajuda: 'dinheiro que saiu, mas não é a operação',
    onde: 'Sai depois do EBITDA, junto com a dívida, antes do lucro líquido.',
    exemplos: ['Caução de aluguel', 'Compra de veículo', 'Obra ou imobilizado', 'Distribuição de lucro'],
    gruposSugeridos: ['Investimentos e imobilizado', 'Caução e depósitos', 'Sócios'],
    pistas: /cau[çc][aã]o|ve[íi]culo|imobiliz|investiment|distribui[çc][aã]o de lucro|dividendo/i,
  },
];

/* o nome antigo continua valendo: outros módulos já importam GRUPOS */
export const GRUPOS = DEGRAUS;

const PORID = new Map(DEGRAUS.map((g) => [g.id, g]));

export function degrauPorId(id) { return PORID.get(id) || null; }

/** O grupo que as pistas SUGEREM para uma conta — sugestão, nunca decisão. */
export function sugerirGrupo(nome) {
  const g = DEGRAUS.find((x) => x.pistas && x.pistas.test(nome || ''));
  return g ? g.id : null;
}

/**
 * O GRUPO DA CONTA — o nome que ELA deu, dentro do degrau.
 *
 * O degrau diz onde o número entra na conta; o grupo diz como ela chama aquilo.
 * Conta sem grupo não ganha um inventado: ela aparece solta dentro do degrau,
 * que é a verdade — ninguém agrupou ainda.
 */
export function lerGrupos(cfg) {
  const mapa = new Map();
  for (const [nome, grupo] of Object.entries(cfg?.dre?.grupos || {})) {
    const limpo = String(grupo || '').trim();
    if (limpo) mapa.set(String(nome), limpo);
  }
  return mapa;
}

/** Todos os grupos que já existem, por degrau, para a tela oferecer. */
export function gruposExistentes(cfg) {
  const classificacao = lerClassificacao(cfg);
  const grupos = lerGrupos(cfg);
  const porDegrau = new Map(DEGRAUS.map((d) => [d.id, new Set(d.gruposSugeridos || [])]));
  for (const [conta, grupo] of grupos) {
    const degrau = classificacao.get(conta);
    if (degrau && porDegrau.has(degrau)) porDegrau.get(degrau).add(grupo);
  }
  return new Map([...porDegrau].map(([id, set]) => [id, [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))]));
}

/**
 * A classificação que ela confirmou. A marcação antiga de "compra de
 * mercadoria" continua valendo: quem já marcou não precisa marcar de novo.
 */
export function lerClassificacao(cfg) {
  const mapa = new Map();
  for (const nome of cfg?.dre?.contasDeMercadoria || []) mapa.set(String(nome), 'mercadoria');
  for (const [nome, grupo] of Object.entries(cfg?.dre?.classificacao || {})) {
    if (PORID.has(grupo)) mapa.set(String(nome), grupo);
  }
  return mapa;
}

/** Palavras que costumam indicar compra de mercadoria, só para sugerir. */
const PISTAS_MERCADORIA = /mercadoria|revenda|compra de produto|estoque|fornecedor/i;

export async function dre(mes = monthKey(new Date().toISOString().slice(0, 10))) {
  const [nfs, pedidos, pagamentos, cfg] = await Promise.all([
    store.nfs.listar(), store.pedidos.listar(), store.pagar.listar(), store.config(),
  ]);
  const classificacao = lerClassificacao(cfg);
  /* "compra de mercadoria" é um degrau da classificação como qualquer outro */
  const marcadas = new Set([...classificacao]
    .filter(([, grupo]) => grupo === 'mercadoria').map(([nome]) => nome));

  const doMes = nfs.filter((nf) => nf.mes === mes && valeParaFaturamento(nf));
  const receitaBruta = cents(sum(doMes, (nf) => valorFaturado(nf)));
  const devolucoes = cents(sum(doMes.filter((nf) => nf.devolucao), (nf) => Math.abs(valorFaturado(nf))));

  const { cmv, cobertura, semCusto } = calcularCmv(doMes, pedidos);
  const lucroBruto = cobertura.completa ? receitaBruta - cmv : null;

  const { grupos, mercadoria, total: despesas } = agruparDespesas(pagamentos, mes, marcadas);

  const resultado = lucroBruto == null ? null : lucroBruto - despesas;

  const gerencial = montarGerencial({
    pagamentos, mes, classificacao, grupos: lerGrupos(cfg),
    /* a bruta do gerencial é ANTES da devolução: ela volta abaixo, como dedução */
    receitaBruta: cents(receitaBruta + devolucoes), devolucoes, cmv, cobertura,
  });

  return {
    gerencial,
    mes,
    receita: {
      bruta: receitaBruta,
      devolucoes,
      notas: doMes.length,
    },
    cmv: { valor: cmv, cobertura, semCusto },
    lucroBruto,
    // percentuais em 0-100, como no resto do app (format.pct espera assim)
    margemBruta: lucroBruto != null && receitaBruta ? (lucroBruto / receitaBruta) * 100 : null,
    despesas: { total: despesas, grupos },
    mercadoria,
    resultado,
    margemLiquida: resultado != null && receitaBruta ? (resultado / receitaBruta) * 100 : null,
    avisos: montarAvisos({
      cobertura: { ...cobertura, semCusto: semCusto.length },
      mercadoria, grupos, marcadas, receitaBruta,
    }),
  };
}

/**
 * O custo de uma nota é o custo do pedido que a gerou. Quando um pedido rendeu
 * mais de uma nota, o custo é dividido na proporção do valor de cada uma — e só
 * quando o pedido informa o valor total, que é o que torna a proporção
 * verificável. Sem isso, a nota fica sem custo em vez de receber um rateio
 * inventado.
 */
function calcularCmv(notas, pedidos) {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const porNumero = new Map(pedidos.filter((p) => p.numero).map((p) => [String(p.numero), p]));

  const notasPorPedido = new Map();
  for (const nf of notas) {
    const pedido = porId.get(nf.pedidoId) || (nf.pedidoNumero ? porNumero.get(String(nf.pedidoNumero)) : null);
    if (!pedido) continue;
    if (!notasPorPedido.has(pedido.id)) notasPorPedido.set(pedido.id, { pedido, notas: [] });
    notasPorPedido.get(pedido.id).notas.push(nf);
  }

  let cmv = 0;
  let faturadoComCusto = 0;
  const semCusto = [];

  for (const nf of notas) {
    const pedido = porId.get(nf.pedidoId) || (nf.pedidoNumero ? porNumero.get(String(nf.pedidoNumero)) : null);
    const valor = valorFaturado(nf);
    /**
     * O custo que ELA informou vale mais que o do arquivo. São os 22 pedidos que
     * ela corrigiu a mão depois de o app descartar o custo do relatório por ser
     * maior que a venda — e eles têm de valer aqui também, senão o DRE mostra um
     * CMV que a tela de Margem já não mostra mais.
     */
    const custoDoPedido = pedido ? (pedido.custoManual ?? pedido.valorCusto) : null;
    if (!pedido || custoDoPedido == null) {
      semCusto.push({
        numero: nf.numero, valor, motivo: pedido ? 'o pedido não informa custo' : 'nota sem pedido',
      });
      continue;
    }
    const grupo = notasPorPedido.get(pedido.id);
    const varias = grupo && grupo.notas.length > 1;
    if (varias && !pedido.valorTotal) {
      semCusto.push({
        numero: nf.numero,
        valor,
        motivo: 'o pedido gerou mais de uma nota e não informa o valor total para dividir o custo',
      });
      continue;
    }
    const parte = varias ? valor / pedido.valorTotal : 1;
    cmv += custoDoPedido * parte;
    faturadoComCusto += valor;
  }

  const total = cents(sum(notas, (nf) => valorFaturado(nf)));
  return {
    cmv: cents(cmv),
    semCusto,
    cobertura: {
      faturadoComCusto: cents(faturadoComCusto),
      faturadoTotal: total,
      percentual: total ? (faturadoComCusto / total) * 100 : null,
      completa: semCusto.length === 0 && notas.length > 0,
    },
  };
}

/**
 * O DRE GERENCIAL — os degraus que ela pediu, na ordem em que a conta é feita.
 *
 * "Ele pega a receita bruta, aí você abre as deduções de receita. Aí a gente
 *  vai e consegue abrir as despesas diretas, que é frete, comissão de
 *  vendedores. Aí, margem de contribuição. (…) Aí tem o EBITDA, que é os
 *  empréstimos de financiamentos. Aí, itens não operacionais."
 *
 * Tudo abaixo do CMV só aparece quando o CMV é confiável: com custo faltando, o
 * lucro bruto fica em branco e os degraus seguintes também. Mostrar um EBITDA
 * calculado sobre custo incompleto é dar um número errado com cara de certo —
 * que é a única coisa que este app não pode fazer.
 */
function montarGerencial({
  pagamentos, mes, classificacao, grupos, receitaBruta, devolucoes, cmv, cobertura,
}) {
  const doMes = pagamentos.filter((p) => p.vencimento && monthKey(p.vencimento) === mes);

  /* cada conta do plano, com o degrau em que ela cai e o grupo que ela deu */
  const contas = new Map();
  for (const p of doMes) {
    const nome = (p.categoria || '').trim() || SEM_CLASSIFICACAO;
    if (!contas.has(nome)) {
      contas.set(nome, {
        nome, valor: 0, itens: 0,
        degrau: classificacao.get(nome) || null,
        grupo: grupos.get(nome) || null,
      });
    }
    const c = contas.get(nome);
    c.valor += p.valor || 0;
    c.itens += 1;
  }
  const todas = [...contas.values()].map((c) => ({ ...c, valor: cents(c.valor) }));

  /**
   * O degrau abre nos GRUPOS dela quando ela nomeou algum; quando não nomeou
   * nenhum, abre direto nas contas. Um nível de pasta vazio só atrapalha.
   */
  const agrupar = (lista) => {
    const mapa = new Map();
    for (const c of lista) {
      const nome = c.grupo || SEM_GRUPO;
      if (!mapa.has(nome)) mapa.set(nome, { nome, valor: 0, itens: 0, contas: [] });
      const g = mapa.get(nome);
      g.valor += c.valor;
      g.itens += c.itens;
      g.contas.push(c);
    }
    return [...mapa.values()]
      .map((g) => ({
        ...g,
        valor: cents(g.valor),
        contas: g.contas.sort((a, b) => b.valor - a.valor),
      }))
      .sort((a, b) => b.valor - a.valor);
  };

  const bloco = (lista) => {
    const ordenada = lista.sort((a, b) => b.valor - a.valor);
    const temGrupo = ordenada.some((c) => c.grupo);
    return {
      total: cents(sum(ordenada, (c) => c.valor)),
      contas: ordenada,
      grupos: temGrupo ? agrupar(ordenada) : [],
    };
  };

  const doGrupo = (id) => bloco(todas.filter((c) => c.degrau === id));
  const semGrupo = bloco(todas.filter((c) => !c.degrau));

  const deducoesDePlano = doGrupo('deducao');
  const diretas = doGrupo('direta');
  const indiretas = doGrupo('indireta');
  const emprestimos = doGrupo('emprestimo');
  const naoOperacionais = doGrupo('naoOperacional');
  const compras = doGrupo('mercadoria');

  /* a devolução de venda é dedução de receita, e vem das notas, não do plano */
  const deducoes = {
    total: cents(deducoesDePlano.total + devolucoes),
    contas: [
      ...(devolucoes ? [{
        nome: 'Devoluções de venda', valor: devolucoes, itens: 0, degrau: 'deducao',
        grupo: null, origem: 'notas fiscais',
      }] : []),
      ...deducoesDePlano.contas,
    ],
    grupos: deducoesDePlano.grupos,
  };

  const receitaLiquida = cents(receitaBruta - deducoes.total);
  /**
   * O lucro bruto do gerencial desconta os impostos ANTES do CMV; o da tela
   * Comercial não — lá a conta é a da margem, sobre a mercadoria. São dois
   * números com motivos diferentes, e por isso têm nomes diferentes nas duas
   * telas, em vez de um deles aparecer no lugar do outro.
   */
  /**
   * O DRE MOSTRA O NÚMERO E DIZ O QUE FALTA — não deixa a tela em branco.
   *
   * Antes, uma única nota sem custo de pedido apagava lucro bruto, margem de
   * contribuição, EBITDA e lucro líquido de uma vez: quatro travessões no meio
   * da tela que ela abriu justamente para ver esses quatro números. O cuidado
   * era certo (CMV incompleto deixa o lucro MAIOR do que ele é), mas a resposta
   * estava errada — esconder não é a única forma de não mentir.
   *
   * Agora a conta sai inteira e a cobertura viaja com ela: cada linha abaixo do
   * CMV carrega, escrito do lado, em quanto da venda o custo é conhecido. Quem
   * lê vê o número E vê o tamanho da ressalva.
   */
  const lucro = cents(receitaLiquida - cmv);
  const margemContribuicao = cents(lucro - diretas.total);
  const ebitda = cents(margemContribuicao - indiretas.total);
  const lucroLiquido = cents(ebitda - emprestimos.total - naoOperacionais.total - semGrupo.total);

  const sobre = (v) => (receitaLiquida && v != null ? (v / receitaLiquida) * 100 : null);

  return {
    mes,
    cobertura,
    confiavel: !!cobertura?.completa,
    receitaBruta,
    devolucoes,
    deducoes,
    receitaLiquida,
    cmv,
    lucroBruto: lucro,
    despesasDiretas: diretas,
    margemContribuicao,
    despesasIndiretas: indiretas,
    ebitda,
    emprestimos,
    naoOperacionais,
    semClassificacao: semGrupo,
    compras,
    lucroLiquido,
    percentuais: {
      deducoes: receitaBruta ? (deducoes.total / receitaBruta) * 100 : null,
      cmv: sobre(cmv),
      lucroBruto: sobre(lucro),
      margemContribuicao: sobre(margemContribuicao),
      ebitda: sobre(ebitda),
      lucroLiquido: sobre(lucroLiquido),
    },
    contas: todas,
  };
}

/** As linhas da escada do DRE gerencial, na ordem da conta. */
export function linhasDoDreGerencial(g) {
  const p = g.percentuais;
  /**
   * A ressalva anda junto do número, em vez de virar um travessão. E ela fala
   * em REAIS: "custo conhecido em 100% da venda" arredondado, junto de "o lucro
   * real é menor", era a tela se contradizendo na mesma linha. O que falta tem
   * tamanho, e é o tamanho que diz se a ressalva importa.
   */
  const c = g.cobertura;
  const falta = c && c.faturadoTotal != null
    ? Math.round((c.faturadoTotal - c.faturadoComCusto) * 100) / 100 : null;
  const ressalva = g.confiavel || !falta || falta <= 0
    ? null
    : `${money(falta)} de venda ainda sem custo conhecido — o lucro real é um pouco menor`;
  /**
   * O degrau abre nos grupos dela, e cada grupo abre nas contas do plano. Sem
   * grupo nomeado, abre direto nas contas: um nível de pasta vazio só atrapalha
   * quem está procurando de onde saiu um número.
   */
  const conta = (c) => ({
    nome: c.nome, valor: c.valor, itens: c.itens, nota: c.origem || null,
  });
  const detalhe = (bloco) => ((bloco.grupos || []).length
    ? bloco.grupos.map((g) => ({
      nome: g.nome, valor: g.valor, itens: g.itens, filhos: g.contas.map(conta),
    }))
    : bloco.contas.map(conta));
  const degrau = (id, rotulo, bloco, nota) => (bloco.total
    ? {
      id,
      rotulo,
      sinal: '−',
      valor: -bloco.total,
      nota,
      percentual: g.receitaLiquida ? (bloco.total / g.receitaLiquida) * 100 : null,
      detalhe: detalhe(bloco),
      base: g.receitaLiquida,
    }
    : { id, rotulo, sinal: '−', valor: 0, nota: 'nada classificado aqui neste mês' });

  return [
    {
      id: 'g-receita-bruta',
      rotulo: 'Receita bruta',
      valor: g.receitaBruta,
      nota: 'notas emitidas no mês, antes das devoluções',
    },
    degrau('g-deducoes', 'Deduções da receita', g.deducoes,
      'impostos sobre a venda e devoluções · clique para abrir'),
    {
      id: 'g-receita-liquida',
      rotulo: 'Receita líquida',
      tipo: 'subtotal',
      valor: g.receitaLiquida,
      nota: 'é sobre ela que os percentuais abaixo são medidos',
      percentual: 100,
    },
    {
      id: 'g-cmv',
      rotulo: 'CMV — custo da mercadoria vendida',
      sinal: '−',
      valor: -g.cmv,
      nota: ressalva,
      percentual: p.cmv,
    },
    {
      id: 'g-lucro-bruto',
      rotulo: 'Lucro bruto',
      tipo: 'subtotal',
      valor: g.lucroBruto,
      nota: ressalva,
      percentual: p.lucroBruto,
    },
    degrau('g-diretas', 'Despesas diretas', g.despesasDiretas,
      'só existem porque houve venda: frete, comissão'),
    {
      id: 'g-margem-contribuicao',
      rotulo: 'Margem de contribuição',
      tipo: 'subtotal',
      valor: g.margemContribuicao,
      nota: ressalva || 'o que sobra para pagar a estrutura',
      percentual: p.margemContribuicao,
    },
    degrau('g-indiretas', 'Despesas indiretas', g.despesasIndiretas,
      'a estrutura: salários, encargos, aluguel'),
    {
      id: 'g-ebitda',
      rotulo: 'EBITDA',
      tipo: 'subtotal',
      valor: g.ebitda,
      nota: ressalva || 'resultado da operação, antes de dívida e do que não é operação',
      percentual: p.ebitda,
    },
    degrau('g-emprestimos', 'Empréstimos e financiamentos', g.emprestimos, null),
    degrau('g-nao-operacionais', 'Itens não operacionais', g.naoOperacionais, null),
    g.semClassificacao.total > 0 && {
      id: 'g-sem-classificacao',
      rotulo: 'Sem classificação',
      sinal: '−',
      valor: -g.semClassificacao.total,
      nota: 'o app não sabe em que degrau isto entra — classifique abaixo',
      percentual: g.receitaLiquida ? (g.semClassificacao.total / g.receitaLiquida) * 100 : null,
      detalhe: detalhe(g.semClassificacao),
      base: g.receitaLiquida,
    },
    {
      id: 'g-lucro-liquido',
      rotulo: 'Lucro líquido',
      tipo: 'resultado',
      valor: g.lucroLiquido,
      nota: ressalva,
      percentual: p.lucroLiquido,
    },
  ].filter(Boolean);
}

/** Contas a pagar do mês (pela data de vencimento), por plano de contas. */
function agruparDespesas(pagamentos, mes, marcadas) {
  const doMes = pagamentos.filter((p) => p.vencimento && monthKey(p.vencimento) === mes);
  const mapa = new Map();
  for (const p of doMes) {
    const nome = (p.categoria || '').trim() || SEM_CLASSIFICACAO;
    if (!mapa.has(nome)) mapa.set(nome, { nome, valor: 0, itens: 0, mercadoria: marcadas.has(nome) });
    const g = mapa.get(nome);
    g.valor += p.valor || 0;
    g.itens += 1;
  }
  const todos = [...mapa.values()].map((g) => ({ ...g, valor: cents(g.valor) }));
  const grupos = todos.filter((g) => !g.mercadoria).sort((a, b) => b.valor - a.valor);
  const compras = todos.filter((g) => g.mercadoria).sort((a, b) => b.valor - a.valor);

  return {
    grupos,
    total: cents(sum(grupos, (g) => g.valor)),
    mercadoria: { grupos: compras, total: cents(sum(compras, (g) => g.valor)) },
  };
}

function montarAvisos({ cobertura, grupos, marcadas, receitaBruta }) {
  const avisos = [];
  if (!receitaBruta) avisos.push({ nivel: 'atencao', texto: 'Nenhuma nota fiscal neste mês. Importe o relatório fiscal.' });

  if (cobertura.faturadoTotal && !cobertura.completa) {
    const falta = Math.round((cobertura.faturadoTotal - cobertura.faturadoComCusto) * 100) / 100;
    avisos.push({
      nivel: 'atencao',
      texto: `${money(falta)} de venda deste mês ainda não têm custo de pedido — ${cobertura.semCusto} `
        + `nota(s). O CMV abaixo é o custo do resto, então o lucro bruto, a margem de contribuição, `
        + 'o EBITDA e o lucro líquido estão um pouco MAIORES do que vão ficar. O app não completa '
        + 'custo por estimativa: mande o relatório de vendas com a coluna VALOR DO CUSTO, '
        + 'com um mês de folga para trás.',
    });
  }

  const suspeitas = grupos.filter((g) => PISTAS_MERCADORIA.test(g.nome) && !marcadas.has(g.nome));
  if (suspeitas.length) {
    avisos.push({
      nivel: 'atencao',
      texto: `${suspeitas.length === 1 ? 'A conta' : 'As contas'} `
        + `${suspeitas.map((g) => `"${g.nome}"`).join(', ')} `
        + `${suspeitas.length === 1 ? 'parece' : 'parecem'} compra de mercadoria. Se for, marque `
        + 'assim no DRE gerencial, em "Em que degrau entra cada conta": esse custo já entra pelo '
        + 'CMV, e contar duas vezes derruba o resultado do mês sem motivo.',
    });
  }

  const semPlano = grupos.find((g) => g.nome === SEM_CLASSIFICACAO);
  if (semPlano) {
    avisos.push({
      nivel: 'info',
      texto: `${semPlano.itens} conta(s) a pagar sem plano de contas. Elas entram no total, mas não dá para `
        + 'dizer para onde o dinheiro foi.',
    });
  }
  return avisos;
}

/** Os planos de contas já vistos, para você marcar quais são mercadoria. */
export async function planosDeContas() {
  const pagamentos = await store.pagar.listar();
  const mapa = new Map();
  for (const p of pagamentos) {
    const nome = (p.categoria || '').trim();
    if (!nome) continue;
    mapa.set(nome, (mapa.get(nome) || 0) + (p.valor || 0));
  }
  return [...mapa.entries()]
    .map(([nome, valor]) => ({ nome, valor: cents(valor) }))
    .sort((a, b) => b.valor - a.valor);
}

export { SEM_CLASSIFICACAO };
