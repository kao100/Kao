/**
 * COMPRAS — a meta, o que foi comprado, e de quem.
 *
 * "Preciso também meta de compras e compras realizadas. Eu vou colocar uma
 *  meta, uma porcentagem, para não ultrapassar isso. Agora a gente está no
 *  momento de diminuir custos. (…) Eu não consideraria meta de 70%, eu acho
 *  muito. Principalmente pro momento agora, que a gente tá com menos
 *  faturamento e mais conta."
 *
 * Por isso o app NÃO chega com uma meta pronta. Setenta por cento era a do
 * relatório do BPO e ela já disse que não é a dela; inventar outra no lugar
 * seria o mesmo erro com número diferente. Sem meta definida, a tela mostra o
 * percentual realizado — que é verdade e já serve — e pede o número dela.
 *
 * A base é a RECEITA LÍQUIDA, a mesma do DRE: faturamento menos impostos e
 * devoluções. Comprar 60% de uma receita que ainda vai pagar imposto não é a
 * mesma conta que comprar 60% do que sobrou.
 *
 * O que conta como compra são os lançamentos do contas a pagar cujo plano de
 * contas ela marcou como COMPRA DE MERCADORIA, no DRE. Enquanto não marcar
 * nenhum, a tela diz que não sabe — e não mostra "zero comprado", que pareceria
 * uma notícia boa.
 */

import * as store from '../core/store.js';
import { cents, sum } from '../core/util.js';
import { monthKey, monthStart, monthEnd, addMonths, weekStart, addDays, formatDate, today } from '../core/format.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';
import { lerClassificacao } from './dre.js';
import { classe } from './abc.js';

const SEM_NOME = 'Sem fornecedor';

export async function compras({ mes = monthKey(today()), meses = 6 } = {}) {
  const [nfs, pagar, cfg] = await Promise.all([
    store.nfs.listar(), store.pagar.listar(), store.config(),
  ]);
  const classificacao = lerClassificacao(cfg);
  const metaPercentual = cfg.compras?.metaPercentual ?? null;

  const grupoDe = (t) => classificacao.get((t.categoria || '').trim()) || null;
  const ativos = pagar.filter((t) => t.status !== 'cancelado' && t.vencimento);
  const deMercadoria = ativos.filter((t) => grupoDe(t) === 'mercadoria');
  const deDeducao = ativos.filter((t) => grupoDe(t) === 'deducao');
  const contasDeMercadoria = [...new Set(deMercadoria.map((t) => (t.categoria || '').trim()))];

  const porMes = [];
  for (let i = meses - 1; i >= 0; i -= 1) {
    const m = monthKey(addMonths(`${mes}-01`, -i));
    porMes.push(linhaDoMes(m, nfs, deDeducao, deMercadoria));
  }
  const atual = porMes[porMes.length - 1];

  const doMes = deMercadoria.filter((t) => monthKey(t.vencimento) === mes);
  const fornecedores = agrupar(doMes, (t) => (t.fornecedorNome || '').trim() || SEM_NOME);

  return {
    mes,
    metaPercentual,
    porMes: porMes.map((l) => comMeta(l, metaPercentual)),
    atual: comMeta(atual, metaPercentual),
    semanas: porSemana(doMes, mes),
    fornecedores,
    lancamentos: [...doMes]
      .sort((a, b) => (b.valor || 0) - (a.valor || 0))
      .map((t) => ({
        fornecedor: (t.fornecedorNome || '').trim() || SEM_NOME,
        descricao: t.descricao || null,
        conta: (t.categoria || '').trim() || null,
        vencimento: t.vencimento,
        valor: cents(t.valor || 0),
      })),
    /**
     * Sem conta marcada como compra de mercadoria não existe "comprei zero":
     * existe "o app não sabe quais lançamentos são compra". A diferença entre as
     * duas frases é a diferença entre uma notícia boa e um dado que falta.
     */
    contasDeMercadoria,
    sabeOQueECompra: contasDeMercadoria.length > 0,
  };
}

function linhaDoMes(m, nfs, deDeducao, deMercadoria) {
  const doMes = nfs.filter((nf) => nf.dataEmissao && monthKey(nf.dataEmissao) === m
    && valeParaFaturamento(nf));
  const faturamento = cents(sum(doMes, (nf) => valorFaturado(nf)));
  /* a devolução já saiu do faturamento acima; aqui faltam os impostos */
  const impostos = cents(sum(
    deDeducao.filter((t) => monthKey(t.vencimento) === m), (t) => t.valor || 0,
  ));
  return {
    mes: m,
    faturamento,
    impostos,
    receitaLiquida: cents(faturamento - impostos),
    comprado: cents(sum(deMercadoria.filter((t) => monthKey(t.vencimento) === m), (t) => t.valor || 0)),
    notas: doMes.length,
  };
}

function comMeta(l, metaPercentual) {
  const meta = metaPercentual == null ? null : cents(l.receitaLiquida * (metaPercentual / 100));
  return {
    ...l,
    meta,
    /* quanto a compra representa da receita líquida — isto vale com ou sem meta */
    percentual: l.receitaLiquida ? (l.comprado / l.receitaLiquida) * 100 : null,
    diferenca: meta == null ? null : cents(l.comprado - meta),
    dentroDaMeta: meta == null ? null : l.comprado <= meta,
  };
}

function porSemana(lancamentos, mes) {
  const de = monthStart(`${mes}-01`);
  const ate = monthEnd(`${mes}-01`);
  const mapa = new Map();
  const toque = (data) => {
    const ini = weekStart(data);
    if (!mapa.has(ini)) mapa.set(ini, { inicio: ini, valor: 0, itens: 0 });
    return mapa.get(ini);
  };
  for (let d = weekStart(de); d <= ate; d = addDays(d, 7)) toque(d);
  for (const t of lancamentos) {
    const s = toque(t.vencimento);
    s.valor += t.valor || 0;
    s.itens += 1;
  }
  return [...mapa.values()]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((s) => ({
      ...s, valor: cents(s.valor), fim: addDays(s.inicio, 6), rotulo: formatDate(s.inicio, 'short'),
    }));
}

function agrupar(lista, chave) {
  const mapa = new Map();
  for (const t of lista) {
    const nome = chave(t);
    if (!mapa.has(nome)) mapa.set(nome, { nome, valor: 0, itens: 0 });
    const g = mapa.get(nome);
    g.valor += t.valor || 0;
    g.itens += 1;
  }
  const linhas = [...mapa.values()]
    .map((g) => ({ ...g, valor: cents(g.valor) }))
    .sort((a, b) => b.valor - a.valor);
  const total = cents(sum(linhas, (g) => g.valor));

  let acumulado = 0;
  return {
    total,
    linhas: linhas.map((g) => {
      const antes = total ? (acumulado / total) * 100 : 0;
      acumulado += g.valor;
      return {
        ...g,
        percentual: total ? (g.valor / total) * 100 : 0,
        acumuladoPercentual: total ? (acumulado / total) * 100 : 0,
        classe: classe(antes),
      };
    }),
  };
}

/** A meta é dela. O app só guarda. */
export async function definirMeta(percentual) {
  const valor = percentual == null || percentual === '' ? null : Number(percentual);
  await store.salvarConfig({
    compras: { metaPercentual: Number.isFinite(valor) ? valor : null },
  });
  return valor;
}
