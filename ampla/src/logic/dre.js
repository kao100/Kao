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
import { monthKey } from '../core/format.js';
import { cents, sum } from '../core/util.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

const SEM_CLASSIFICACAO = 'Sem plano de contas';

/**
 * OS DEGRAUS DO DRE GERENCIAL, e a que grupo cada conta do plano pertence.
 *
 * "Tem uma série de coisas aqui que são categorizadas. Como você vai saber
 *  isso? Eu posso te categorizar, não tem problema. Só preciso que tenha isso."
 *
 * O app NÃO adivinha para qual degrau cada conta vai. As pistas abaixo servem
 * só para SUGERIR na tela de classificação, onde ela confirma — e conta não
 * confirmada não é empurrada para um grupo qualquer: ela aparece numa linha
 * própria, "sem classificação", que desconta do lucro líquido e pede o clique.
 * Chutar o grupo de uma conta é inventar vínculo, e inventar vínculo aqui muda
 * o EBITDA sem que ninguém perceba.
 */
export const GRUPOS = [
  {
    id: 'deducao',
    nome: 'Deduções da receita',
    ajuda: 'imposto sobre a venda: Simples/DAS, PIS, COFINS, ICMS, ISS',
    pistas: /simples|\bdas\b|\bpis\b|cofins|icms|\biss\b|irpj|csll|imposto|tribut|federa|difal|\bst\b|substitui/i,
  },
  {
    id: 'mercadoria',
    nome: 'Compra de mercadoria',
    ajuda: 'já entra pelo CMV — fica fora das despesas para não contar duas vezes',
    pistas: /mercadoria|revenda|compra de produto|estoque|fornecedor/i,
  },
  {
    id: 'direta',
    nome: 'Despesas diretas',
    ajuda: 'o que só existe porque houve venda: frete, comissão, RT',
    pistas: /frete|entrega|transport|comiss|\brt\b|indica/i,
  },
  {
    id: 'indireta',
    nome: 'Despesas indiretas',
    ajuda: 'a estrutura: salários, encargos, aluguel, energia, manutenção',
    pistas: null,
  },
  {
    id: 'emprestimo',
    nome: 'Empréstimos e financiamentos',
    ajuda: 'parcela e juros de dívida — fica depois do EBITDA',
    pistas: /emprestim|empréstim|financiam|capital de giro|juros|antecipa|desconto de duplicata/i,
  },
  {
    id: 'naoOperacional',
    nome: 'Itens não operacionais',
    ajuda: 'o que não é a operação: caução, compra de veículo, investimento',
    pistas: /cau[çc][aã]o|ve[íi]culo|imobiliz|investiment|distribui[çc][aã]o de lucro|dividendo/i,
  },
];

const PORID = new Map(GRUPOS.map((g) => [g.id, g]));

/** O grupo que as pistas SUGEREM para uma conta — sugestão, nunca decisão. */
export function sugerirGrupo(nome) {
  const g = GRUPOS.find((x) => x.pistas && x.pistas.test(nome || ''));
  return g ? g.id : null;
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
    pagamentos, mes, classificacao,
    /* a bruta do gerencial é ANTES da devolução: ela volta abaixo, como dedução */
    receitaBruta: cents(receitaBruta + devolucoes), devolucoes, cmv, lucroBruto,
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
    avisos: montarAvisos({ cobertura, mercadoria, grupos, marcadas, receitaBruta }),
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
function montarGerencial({ pagamentos, mes, classificacao, receitaBruta, devolucoes, cmv, lucroBruto }) {
  const doMes = pagamentos.filter((p) => p.vencimento && monthKey(p.vencimento) === mes);

  /* cada conta do plano, com o degrau em que ela cai (ou nenhum) */
  const contas = new Map();
  for (const p of doMes) {
    const nome = (p.categoria || '').trim() || SEM_CLASSIFICACAO;
    if (!contas.has(nome)) {
      contas.set(nome, { nome, valor: 0, itens: 0, grupo: classificacao.get(nome) || null });
    }
    const c = contas.get(nome);
    c.valor += p.valor || 0;
    c.itens += 1;
  }
  const todas = [...contas.values()].map((c) => ({ ...c, valor: cents(c.valor) }));

  const doGrupo = (id) => {
    const lista = todas.filter((c) => c.grupo === id).sort((a, b) => b.valor - a.valor);
    return { total: cents(sum(lista, (c) => c.valor)), contas: lista };
  };
  const semGrupo = (() => {
    const lista = todas.filter((c) => !c.grupo).sort((a, b) => b.valor - a.valor);
    return { total: cents(sum(lista, (c) => c.valor)), contas: lista };
  })();

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
        nome: 'Devoluções de venda', valor: devolucoes, itens: 0, grupo: 'deducao',
        origem: 'notas fiscais',
      }] : []),
      ...deducoesDePlano.contas,
    ],
  };

  const receitaLiquida = cents(receitaBruta - deducoes.total);
  /**
   * O lucro bruto do gerencial desconta os impostos ANTES do CMV; o da tela
   * Comercial não — lá a conta é a da margem, sobre a mercadoria. São dois
   * números com motivos diferentes, e por isso têm nomes diferentes nas duas
   * telas, em vez de um deles aparecer no lugar do outro.
   */
  const lucro = lucroBruto == null ? null : cents(receitaLiquida - cmv);
  const margemContribuicao = lucro == null ? null : cents(lucro - diretas.total);
  const ebitda = margemContribuicao == null ? null : cents(margemContribuicao - indiretas.total);
  const lucroLiquido = ebitda == null ? null
    : cents(ebitda - emprestimos.total - naoOperacionais.total - semGrupo.total);

  const sobre = (v) => (receitaLiquida && v != null ? (v / receitaLiquida) * 100 : null);

  return {
    mes,
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
  const detalhe = (bloco) => bloco.contas.map((c) => ({
    nome: c.nome, valor: c.valor, itens: c.itens, nota: c.origem || null,
  }));
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
      percentual: p.cmv,
    },
    {
      id: 'g-lucro-bruto',
      rotulo: 'Lucro bruto',
      tipo: 'subtotal',
      valor: g.lucroBruto,
      percentual: p.lucroBruto,
    },
    degrau('g-diretas', 'Despesas diretas', g.despesasDiretas,
      'só existem porque houve venda: frete, comissão'),
    {
      id: 'g-margem-contribuicao',
      rotulo: 'Margem de contribuição',
      tipo: 'subtotal',
      valor: g.margemContribuicao,
      nota: 'o que sobra para pagar a estrutura',
      percentual: p.margemContribuicao,
    },
    degrau('g-indiretas', 'Despesas indiretas', g.despesasIndiretas,
      'a estrutura: salários, encargos, aluguel'),
    {
      id: 'g-ebitda',
      rotulo: 'EBITDA',
      tipo: 'subtotal',
      valor: g.ebitda,
      nota: 'resultado da operação, antes de dívida e do que não é operação',
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
    const pct = Math.round(cobertura.percentual || 0);
    avisos.push({
      nivel: 'atencao',
      texto: `O custo é conhecido em ${pct}% do faturamento. O lucro bruto só aparece quando estiver em 100% — `
        + 'o app não completa custo por estimativa. Importe o relatório de vendas com a coluna VALOR DO CUSTO.',
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
