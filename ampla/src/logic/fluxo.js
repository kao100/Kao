/**
 * FLUXO DE CAIXA — a visão financeira, e a única.
 *
 * "Não quero mais três módulos separados dificultando minha visualização: Caixa,
 *  Contas a Receber, Contas a Pagar. A principal visão financeira deve ser
 *  FLUXO DE CAIXA."
 *
 * A conta é a que ela escreveu, sem nada por cima:
 *
 *   saldo do dia = saldo do dia anterior + a receber do dia − a pagar do dia
 *
 * DE ONDE VEM CADA NÚMERO:
 *
 *   saldo inicial  → ela digita, todo dia. Um número só, informado à mão.
 *   entradas       → contas a receber, pela data de vencimento.
 *   saídas         → contas a pagar, pela data de vencimento.
 *
 * O EXTRATO BANCÁRIO SAIU. "Tem taxas, transferências, movimentações internas
 * que tornam a conciliação muito complexa e geram números incorretos." Um saldo
 * digitado por quem olha a conta é mais confiável do que um saldo montado de
 * lançamentos que ninguém conseguiu conciliar — e custa dez segundos por dia.
 *
 * O QUE ESTÁ VENCIDO NÃO É PROJETADO. "Não é prudente projetar caixa
 * considerando como certa uma entrada que já está vencida." Então o vencido
 * aparece à parte, dos dois lados, e nenhum dos dois entra na linha dos dias.
 */

import * as store from '../core/store.js';
import { cents, sum } from '../core/util.js';
import { today, addDays, eachDay, monthStart, monthEnd, addMonths, monthKey } from '../core/format.js';

export const HORIZONTES = [
  { id: '7', dias: 7, label: 'Próximos 7 dias' },
  { id: '15', dias: 15, label: 'Próximos 15 dias' },
  { id: '30', dias: 30, label: 'Próximos 30 dias' },
  { id: 'mes', label: 'Mês atual' },
  { id: 'proximo', label: 'Próximo mês' },
];

/** Traduz o atalho escolhido em um começo e um fim. */
export function periodoDoHorizonte(id, base = today()) {
  if (id === 'mes') return { de: base, ate: monthEnd(base) };
  if (id === 'proximo') {
    const proximo = addMonths(base, 1);
    return { de: monthStart(proximo), ate: monthEnd(proximo) };
  }
  const dias = Number(id) || 30;
  return { de: base, ate: addDays(base, dias - 1) };
}

/* ------------------------------------------------------------------- saldo */

/**
 * O SALDO QUE ELA INFORMA — um número e uma data, nada mais.
 *
 * Guardar a data junto é o que impede o erro mais fácil daqui: usar o saldo de
 * terça para projetar a partir de quinta, somando duas vezes o que entrou no
 * meio. Quando o saldo está velho, o app diz, em vez de calcular por cima.
 */
export async function saldoInformado() {
  const cfg = await store.config();
  const s = cfg.caixa?.saldoAtual;
  if (!s || s.valor == null) return null;
  return { valor: cents(s.valor), data: s.data || null, anotadoEm: s.anotadoEm || null };
}

export async function informarSaldo(valor, data = today()) {
  await store.salvarConfig({
    caixa: { saldoAtual: { valor: cents(valor), data, anotadoEm: Date.now() } },
  });
  await store.registrar('saldo_informado', { alvo: data, para: cents(valor) });
  return saldoInformado();
}

/**
 * RECURSOS EXTRAORDINÁRIOS — empréstimo, aporte, o dinheiro que não veio da
 * operação.
 *
 * "O saldo bancário REAL precisa continuar sendo o principal saldo. Porém quero
 *  também visualizar como estaria o caixa da operação sem aquele recurso."
 *
 * Não é um contas a receber nem um contas a pagar: é um ajuste gerencial que não
 * muda nenhum número real. Por isso ele vive na configuração, e a tela mostra as
 * duas linhas lado a lado — nunca uma no lugar da outra.
 */
export async function recursosExtraordinarios() {
  const cfg = await store.config();
  return (cfg.caixa?.extraordinarios || []).map((r) => ({ ...r, valor: cents(r.valor || 0) }));
}

export async function salvarRecursos(lista) {
  await store.salvarConfig({ caixa: { extraordinarios: lista } });
  return recursosExtraordinarios();
}

/** Quanto do saldo de hoje é recurso extraordinário, na data de referência. */
export function extraordinarioEm(recursos, data) {
  return cents(sum(recursos.filter((r) => !r.data || r.data <= data), (r) => r.valor));
}

/* ------------------------------------------------------- títulos do período */

const aberto = (t) => t.status !== 'pago' && t.status !== 'cancelado';
const saldoDe = (t) => cents(t.saldo ?? t.valor ?? 0);

/**
 * Separa o que está vencido do que ainda vai vencer.
 *
 * Vencido é o que tem vencimento ANTES da data-base. Ele não entra na projeção
 * — entra numa lista própria, porque é decisão, não previsão.
 */
export function separarVencidos(titulos, base) {
  const emAberto = titulos.filter(aberto);
  return {
    vencidos: emAberto.filter((t) => t.vencimento && t.vencimento < base),
    aVencer: emAberto.filter((t) => t.vencimento && t.vencimento >= base),
    semData: emAberto.filter((t) => !t.vencimento),
  };
}

function agrupar(titulos, campoNome) {
  const porDia = new Map();
  for (const t of titulos) {
    if (!porDia.has(t.vencimento)) porDia.set(t.vencimento, []);
    porDia.get(t.vencimento).push({
      id: t.id,
      nome: t[campoNome] || 'sem identificação',
      documento: t.documento || t.descricao || null,
      nfNumero: t.nfNumero || null,
      valor: saldoDe(t),
      vencimento: t.vencimento,
    });
  }
  return porDia;
}

/* ---------------------------------------------------------------- projeção */

/**
 * A PROJEÇÃO DIÁRIA.
 *
 * @param {string} de    primeiro dia do recorte
 * @param {string} ate   último dia
 *
 * Cada linha traz o detalhe de quem entra e de quem sai, porque é isso que
 * transforma o fluxo numa ferramenta de decisão: "neste dia meu caixa fica
 * apertado, preciso negociar este fornecedor".
 */
export async function projetar({ de = today(), ate = null, dias = 30 } = {}) {
  const fim = ate || addDays(de, dias - 1);
  const [receber, pagar, saldo, recursos] = await Promise.all([
    store.receber.listar(), store.pagar.listar(), saldoInformado(), recursosExtraordinarios(),
  ]);

  const rec = separarVencidos(receber, de);
  const pag = separarVencidos(pagar, de);

  const entradasPorDia = agrupar(rec.aVencer.filter((t) => t.vencimento <= fim), 'clienteNome');
  const saidasPorDia = agrupar(pag.aVencer.filter((t) => t.vencimento <= fim), 'fornecedorNome');

  const saldoInicial = saldo?.valor ?? null;
  const extraordinario = extraordinarioEm(recursos, de);

  let acumulado = saldoInicial ?? 0;
  const linhas = eachDay(de, fim).map((data) => {
    const entradas = entradasPorDia.get(data) || [];
    const saidas = saidasPorDia.get(data) || [];
    const recebimentos = cents(sum(entradas, (x) => x.valor));
    const pagamentos = cents(sum(saidas, (x) => x.valor));
    const inicial = acumulado;
    acumulado = cents(inicial + recebimentos - pagamentos);
    return {
      data,
      saldoInicial: cents(inicial),
      recebimentos,
      pagamentos,
      liquido: cents(recebimentos - pagamentos),
      saldoProjetado: acumulado,
      // a segunda realidade: o mesmo dia sem o dinheiro que não veio da operação
      saldoOperacional: cents(acumulado - extraordinario),
      entradas: entradas.sort((a, b) => b.valor - a.valor),
      saidas: saidas.sort((a, b) => b.valor - a.valor),
      negativo: acumulado < 0,
    };
  });

  const menor = linhas.reduce((pior, l) => (pior == null || l.saldoProjetado < pior.saldoProjetado ? l : pior), null);
  const totalReceber = cents(sum(linhas, (l) => l.recebimentos));
  const totalPagar = cents(sum(linhas, (l) => l.pagamentos));

  return {
    periodo: { de, ate: fim },
    /* sem saldo informado o app não inventa um: ele pede */
    temSaldo: saldoInicial != null,
    saldo,
    saldoInicial,
    extraordinario,
    recursos,
    saldoOperacionalHoje: saldoInicial == null ? null : cents(saldoInicial - extraordinario),
    linhas,
    totalReceber,
    totalPagar,
    saldoFinal: linhas.length ? linhas[linhas.length - 1].saldoProjetado : saldoInicial,
    saldoOperacionalFinal: linhas.length ? linhas[linhas.length - 1].saldoOperacional : null,
    menorSaldo: menor ? menor.saldoProjetado : saldoInicial,
    menorSaldoEm: menor ? menor.data : null,
    diasNegativos: linhas.filter((l) => l.negativo).map((l) => l.data),
    /**
     * O VENCIDO, dos dois lados, fora da projeção.
     *
     * O a receber vencido não é dinheiro que entra amanhã — é cobrança. O a
     * pagar vencido é necessidade de caixa HOJE, e some da linha do tempo se
     * ninguém o mostrar.
     */
    vencidos: {
      receber: {
        quantidade: rec.vencidos.length,
        valor: cents(sum(rec.vencidos, saldoDe)),
        titulos: rec.vencidos.map((t) => ({
          id: t.id, nome: t.clienteNome || 'cliente', valor: saldoDe(t), vencimento: t.vencimento,
          documento: t.documento || null, nfNumero: t.nfNumero || null,
        })).sort((a, b) => b.valor - a.valor),
      },
      pagar: {
        quantidade: pag.vencidos.length,
        valor: cents(sum(pag.vencidos, saldoDe)),
        titulos: pag.vencidos.map((t) => ({
          id: t.id, nome: t.fornecedorNome || 'fornecedor', valor: saldoDe(t), vencimento: t.vencimento,
          documento: t.documento || null,
        })).sort((a, b) => b.valor - a.valor),
      },
    },
    /* título sem data não entra em dia nenhum: fica visível para ela resolver */
    semVencimento: {
      receber: rec.semData.length,
      pagar: pag.semData.length,
      valor: cents(sum([...rec.semData, ...pag.semData], saldoDe)),
    },
  };
}

/** Os totais do mês corrente, para o resumo de abertura. */
export async function resumo({ base = today(), horizonte = '30' } = {}) {
  const { de, ate } = periodoDoHorizonte(horizonte, base);
  return projetar({ de, ate });
}

export { monthKey };
