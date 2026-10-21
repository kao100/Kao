/**
 * FLUXO DE CAIXA REALIZADO — o que entrou e o que saiu no período fechado.
 *
 * "Aqui no fluxo de caixa, você tem os recebimentos, os desembolsos, a captação
 *  de empréstimo e o saldo de caixa final. Aí ele mostra um gráfico de entradas,
 *  saídas por semana. Aí ele mostra a situação dos lançamentos. (…) Aí tem o
 *  desembolso por conta. O que que eu gastei mais. (…) E tem uma curva ABC dos
 *  desembolsos. Isso é interessante para eu saber aonde eu posso cortar."
 *
 * A tela de Caixa que já existia olha para FRENTE: projeta os próximos dias a
 * partir do saldo informado. Esta olha para TRÁS, para um período fechado, que
 * é outra pergunta — "onde o dinheiro foi" não se responde com projeção.
 *
 * A data que vale é a do VENCIMENTO, e não a do pagamento: é a data que chega
 * em todas as linhas dos relatórios dela. Quando o pagamento tem data própria,
 * ela aparece na situação do lançamento (confirmado, atrasado, em aberto), que
 * é a informação que o relatório realmente traz.
 */

import * as store from '../core/store.js';
import { cents, sum } from '../core/util.js';
import { today, weekStart, addDays, formatDate } from '../core/format.js';
import { lerClassificacao, GRUPOS } from './dre.js';
import { classe } from './abc.js';
import { saldoInformado } from './fluxo.js';

const SEM_CONTA = 'Sem plano de contas';
const SEM_NOME = 'Sem favorecido';

export async function realizado({ de, ate, base = today() }) {
  const [receber, pagar, cfg, saldo] = await Promise.all([
    store.receber.listar(), store.pagar.listar(), store.config(), saldoInformado(),
  ]);
  const classificacao = lerClassificacao(cfg);

  const dentro = (t) => t.vencimento && t.vencimento >= de && t.vencimento <= ate
    && t.status !== 'cancelado';
  const entradas = receber.filter(dentro);
  const saidas = pagar.filter(dentro);

  const resultado = cents(soma(entradas) - soma(saidas));

  return {
    periodo: { de, ate },
    entradas: situacao(entradas, base),
    saidas: situacao(saidas, base),
    resultado,
    semanas: porSemana(entradas, saidas, de, ate),
    porConta: agrupar(saidas, (t) => (t.categoria || '').trim() || SEM_CONTA),
    porDegrau: porDegrau(saidas, classificacao),
    porFavorecido: agrupar(saidas, (t) => (t.fornecedorNome || '').trim() || SEM_NOME),
    maiores: [...saidas]
      .sort((a, b) => (b.valor || 0) - (a.valor || 0))
      .slice(0, 15)
      .map((t) => ({
        favorecido: (t.fornecedorNome || '').trim() || SEM_NOME,
        descricao: t.descricao || null,
        conta: (t.categoria || '').trim() || SEM_CONTA,
        vencimento: t.vencimento,
        valor: cents(t.valor || 0),
        situacao: rotuloDaSituacao(t, base),
      })),
    emprestimos: blocoDoGrupo(saidas, classificacao, 'emprestimo'),
    arvore: montarArvore(entradas, saidas, classificacao),
    saldo,
    /**
     * A CAPTAÇÃO DE EMPRÉSTIMO NÃO CHEGA EM NENHUM ARQUIVO QUE ELA MANDA HOJE.
     *
     * Dinheiro que o banco deposita não passa por contas a receber. O número
     * existe no extrato (ela já ligou o Open Finance ao sistema: "o sistema vai
     * ter todos os pagamentos"), e é de lá que ele virá. Até então a tela diz
     * que não sabe, em vez de somar zero e deixar parecer que não houve.
     */
    captacao: null,
  };
}

function soma(lista) { return cents(sum(lista, (t) => t.valor || 0)); }

/** Confirmado, atrasado, em aberto — os três estados que o relatório traz. */
function situacao(lista, base) {
  const pago = lista.filter((t) => t.status === 'pago');
  const abertos = lista.filter((t) => t.status !== 'pago');
  const atrasado = abertos.filter((t) => t.vencimento < base);
  const aberto = abertos.filter((t) => t.vencimento >= base);
  const bloco = (l) => ({ valor: soma(l), quantidade: l.length });
  return {
    confirmado: bloco(pago),
    atrasado: bloco(atrasado),
    aberto: bloco(aberto),
    total: bloco(lista),
  };
}

function rotuloDaSituacao(t, base) {
  if (t.status === 'pago') return 'Confirmado';
  return t.vencimento < base ? 'Atrasado' : 'Em aberto';
}

/** Entradas × saídas semana a semana, pela segunda-feira de cada uma. */
function porSemana(entradas, saidas, de, ate) {
  const mapa = new Map();
  const toque = (data) => {
    const ini = weekStart(data);
    if (!mapa.has(ini)) mapa.set(ini, { inicio: ini, a: 0, b: 0 });
    return mapa.get(ini);
  };
  /* todas as semanas do recorte existem, mesmo as vazias: semana sem movimento
     é informação, e o gráfico com buraco no meio engana a leitura */
  for (let d = weekStart(de); d <= ate; d = addDays(d, 7)) toque(d);
  for (const t of entradas) toque(t.vencimento).a += t.valor || 0;
  for (const t of saidas) toque(t.vencimento).b += t.valor || 0;

  return [...mapa.values()]
    .sort((x, y) => x.inicio.localeCompare(y.inicio))
    .map((s) => ({
      ...s,
      a: cents(s.a),
      b: cents(s.b),
      saldo: cents(s.a - s.b),
      rotulo: formatDate(s.inicio, 'short'),
      fim: addDays(s.inicio, 6),
    }));
}

/**
 * Agrupa e já devolve a curva ABC: A é o que forma os primeiros 80% do gasto,
 * B vai até 95%, C é o resto. É o "aonde eu posso cortar" em ordem.
 */
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

  /* a mesma régua da curva ABC de produtos: duas telas de ABC que classificam
     diferente é a tela se contradizendo */
  let acumulado = 0;
  const comClasse = linhas.map((g) => {
    const antes = total ? (acumulado / total) * 100 : 0;
    acumulado += g.valor;
    return {
      ...g,
      percentual: total ? (g.valor / total) * 100 : 0,
      acumuladoPercentual: total ? (acumulado / total) * 100 : 0,
      classe: classe(antes),
    };
  });

  return {
    total,
    linhas: comClasse,
    classes: ['A', 'B', 'C'].map((c) => {
      const dela = comClasse.filter((g) => g.classe === c);
      return {
        classe: c,
        quantidade: dela.length,
        valor: cents(sum(dela, (g) => g.valor)),
        percentual: total ? (sum(dela, (g) => g.valor) / total) * 100 : 0,
      };
    }),
  };
}

function blocoDoGrupo(saidas, classificacao, grupo) {
  const lista = saidas.filter((t) => classificacao.get((t.categoria || '').trim()) === grupo);
  return { valor: soma(lista), quantidade: lista.length };
}

/** As saídas pelos degraus do DRE, para o fluxo falar a mesma língua do resultado. */
function porDegrau(saidas, classificacao) {
  const mapa = new Map(GRUPOS.map((g) => [g.id, { id: g.id, nome: g.nome, valor: 0, itens: 0, contas: new Map() }]));
  mapa.set(null, { id: null, nome: 'Sem classificação', valor: 0, itens: 0, contas: new Map() });

  for (const t of saidas) {
    const conta = (t.categoria || '').trim() || SEM_CONTA;
    const grupo = classificacao.get(conta) || null;
    const g = mapa.get(grupo) || mapa.get(null);
    g.valor += t.valor || 0;
    g.itens += 1;
    if (!g.contas.has(conta)) g.contas.set(conta, { nome: conta, valor: 0, itens: 0 });
    const c = g.contas.get(conta);
    c.valor += t.valor || 0;
    c.itens += 1;
  }

  return [...mapa.values()]
    .filter((g) => g.itens > 0)
    .map((g) => ({
      ...g,
      valor: cents(g.valor),
      contas: [...g.contas.values()]
        .map((c) => ({ ...c, valor: cents(c.valor) }))
        .sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * O FLUXO DETALHADO EM ÁRVORE — 1, 1.1, 1.1.1.
 *
 * "Tem ali um fluxo com as principais nomenclaturas, que é recebimento,
 *  desembolsos, as despesas administrativas 1.1, aí depois vem 1.1.1, no
 *  sentido assim: você abre e vai abrindo e vai desmembrando as coisas."
 *
 * Nível 1 é entrou/saiu; 1.1 é o degrau do DRE; 1.1.1 é a conta do plano. A
 * numeração não é enfeite: é como ela vai apontar para uma linha e dizer "essa
 * aqui" sem precisar do nome inteiro.
 */
function montarArvore(entradas, saidas, classificacao) {
  const porCliente = agrupar(entradas, (t) => (t.clienteNome || '').trim() || 'Sem cliente');
  const degraus = porDegrau(saidas, classificacao);

  return [
    {
      numero: '1',
      nome: 'Recebimentos',
      valor: soma(entradas),
      filhos: porCliente.linhas.slice(0, 20).map((c, i) => ({
        numero: `1.${i + 1}`,
        nome: c.nome,
        valor: c.valor,
        itens: c.itens,
        filhos: [],
      })),
    },
    {
      numero: '2',
      nome: 'Desembolsos',
      valor: soma(saidas),
      filhos: degraus.map((g, i) => ({
        numero: `2.${i + 1}`,
        nome: g.nome,
        valor: g.valor,
        itens: g.itens,
        filhos: g.contas.map((c, j) => ({
          numero: `2.${i + 1}.${j + 1}`,
          nome: c.nome,
          valor: c.valor,
          itens: c.itens,
          filhos: [],
        })),
      })),
    },
  ];
}
