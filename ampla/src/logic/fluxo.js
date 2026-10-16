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
import {
  money, today, addDays, eachDay, monthStart, monthEnd, addMonths, monthKey,
} from '../core/format.js';
import { statusTitulo } from './link.js';

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
  /**
   * POR CONTA, SOMADO — e não um número só.
   *
   * "Se todo dia eu tenho que alimentar o saldo bancário das contas, isso é
   *  fato, para ele conseguir fazer as projeções futuras que eu quero."
   *
   * Contas, no plural: ela olha mais de um banco. Então o saldo de partida é a
   * soma do último saldo de cada conta, e a data que vale é a MAIS ANTIGA
   * delas — se uma conta ficou sem atualizar desde terça, a projeção é tão velha
   * quanto terça, e é isso que o app tem de dizer. Pegar a mais nova esconderia
   * exatamente o erro que importa.
   */
  const porConta = await saldosPorConta();
  if (porConta.length) {
    const comSaldo = porConta.filter((c) => c.valor != null);
    if (comSaldo.length) {
      return {
        valor: cents(sum(comSaldo, (c) => c.valor)),
        data: comSaldo.reduce((pior, c) => (pior == null || c.data < pior ? c.data : pior), null),
        anotadoEm: comSaldo.reduce((m, c) => Math.max(m, c.anotadoEm || 0), 0) || null,
        contas: porConta,
      };
    }
  }
  /* sem conta cadastrada, o número único de antes ainda vale */
  const cfg = await store.config();
  const s = cfg.caixa?.saldoAtual;
  if (!s || s.valor == null) return null;
  return {
    valor: cents(s.valor), data: s.data || null, anotadoEm: s.anotadoEm || null, contas: [],
  };
}

/**
 * O último saldo de cada conta cadastrada, com a data em que ela anotou.
 * Conta sem saldo nenhum vem com valor nulo — para a tela poder pedir.
 */
export async function saldosPorConta() {
  const [contas, saldos] = await Promise.all([store.contas.listar(), store.saldos.listar()]);
  const ativas = contas.filter((c) => !c.arquivada);
  const ultimo = new Map();
  for (const s of saldos) {
    if (s.saldo == null) continue;
    const atual = ultimo.get(s.contaId);
    if (!atual || s.data > atual.data) ultimo.set(s.contaId, s);
  }
  return ativas.map((c) => {
    const s = ultimo.get(c.id);
    return {
      contaId: c.id,
      nome: c.nome || c.banco || 'Conta',
      valor: s ? cents(s.saldo) : null,
      data: s?.data || null,
      anotadoEm: s?.anotadoEm || null,
    };
  });
}

/** O saldo de UMA conta, no dia. É o que a tela do Caixa grava. */
export async function informarSaldoDaConta(contaId, valor, data = today()) {
  await store.saldos.salvar({
    id: `sal_${contaId}_${data}`,
    contaId,
    data,
    saldo: cents(valor),
    origem: 'manual',
    anotadoEm: Date.now(),
  });
  await store.registrar('saldo_informado', { alvoId: contaId, alvo: data, para: cents(valor) });
  return saldoInformado();
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

/**
 * ABERTO É A MESMA COISA AQUI E NO RESTO DO APP.
 *
 * Isto era duas verdades sobre o mesmo título: o Caixa olhava só a coluna de
 * situação, enquanto o resto do app também considerava pago o título com data de
 * recebimento ou com saldo zerado. Dava para um título aparecer como entrada
 * futura numa tela e como pago na outra — e a tela em que a divergência não
 * aparece é sempre a que mente.
 */
const aberto = (t) => statusTitulo(t) === 'aberto';
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

/**
 * POR QUE ESTÁ ZERADO.
 *
 * "Mandei todos os arquivos. Aí eu vou na parte caixa, já alimentei o saldo, aí
 *  eu vejo a projeção para os 30 dias. E aí recebimento, pagamento, líquido —
 *  tá tudo zerado. Eu já mandei."
 *
 * Um zero pode querer dizer seis coisas, e o app mostrava sempre o mesmo zero:
 * não chegou título nenhum, chegou e já está tudo baixado, chegou e está tudo
 * vencido (então sai da projeção de propósito), chegou e vence depois do
 * recorte, chegou sem data de vencimento, ou chegou com valor zero. São
 * problemas diferentes, com soluções diferentes — e um deles nem é problema.
 *
 * Então esta função não calcula nada novo: ela conta onde os títulos foram
 * parar. Quem mostra o zero tem a obrigação de dizer de onde ele veio.
 */
export async function diagnosticar({ de = today(), ate = null, dias = 30 } = {}) {
  const fim = ate || addDays(de, dias - 1);
  const [receber, pagar] = await Promise.all([store.receber.listar(), store.pagar.listar()]);
  return {
    periodo: { de, ate: fim },
    receber: contarOndeEstao(receber, de, fim),
    pagar: contarOndeEstao(pagar, de, fim),
  };
}

function contarOndeEstao(titulos, de, fim) {
  const emAberto = titulos.filter(aberto);
  const comData = emAberto.filter((t) => !!t.vencimento);
  const noPeriodo = comData.filter((t) => t.vencimento >= de && t.vencimento <= fim);
  return {
    importados: titulos.length,
    baixados: titulos.filter((t) => statusTitulo(t) === 'pago').length,
    porQueBaixados: agruparMotivos(titulos.filter((t) => statusTitulo(t) === 'pago')),
    cancelados: titulos.filter((t) => statusTitulo(t) === 'cancelado').length,
    emAberto: emAberto.length,
    vencidos: comData.filter((t) => t.vencimento < de).length,
    depoisDoPeriodo: comData.filter((t) => t.vencimento > fim).length,
    semVencimento: emAberto.length - comData.length,
    noPeriodo: noPeriodo.length,
    /* título em aberto, no prazo, e valendo zero: o valor não veio do arquivo */
    semValor: noPeriodo.filter((t) => !saldoDe(t)).length,
    valorNoPeriodo: cents(sum(noPeriodo, saldoDe)),
  };
}

/**
 * POR QUE CADA TÍTULO FOI DADO COMO BAIXADO, agrupado e com exemplos.
 *
 * "E os recebimentos? Que tá tudo zerado ainda nos recebimentos. Aí parece que
 *  vai ficar negativado pra sempre. Só tem pagamento, né? Não."
 *
 * Dizer "estão todos baixados" não serve: ela sabe que não estão. O que resolve
 * é dizer POR QUE o app acha que estão — e mostrar o texto que ele leu na coluna
 * Situação, palavra por palavra. Se o texto diz "Não recebido", o erro é do app
 * e aparece na hora. Se diz "Recebido", o erro está no filtro do export. São
 * conversas diferentes, e sem o texto nenhuma das duas começa.
 */
function agruparMotivos(baixados) {
  const grupos = new Map();
  for (const t of baixados) {
    /**
     * SEM MOTIVO GRAVADO, O APP NÃO CHUTA UM.
     *
     * Aqui a falta de motivo virava "a coluna Situação dizia isso" — e foi isso
     * que o app escreveu na tela dela sobre 1232 títulos cujo arquivo dizia, em
     * letras, "Em aberto". A frase acusava o relatório de uma coisa que o
     * relatório não diz, e mandou a investigação para o lado errado.
     *
     * Um palpite apresentado como leitura é pior que um "não sei": o "não sei"
     * ao menos leva à pergunta certa.
     */
    const motivo = t.baixadoPorAusencia ? 'ausencia'
      : (t.baixaManual ? 'manual' : (t.baixaMotivo || 'indefinido'));
    if (!grupos.has(motivo)) grupos.set(motivo, { motivo, quantidade: 0, valor: 0, textos: new Set() });
    const g = grupos.get(motivo);
    g.quantidade += 1;
    g.valor = cents(g.valor + (t.valor || 0));
    if (t.statusArquivo) g.textos.add(String(t.statusArquivo).trim());
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, textos: [...g.textos].slice(0, 4) }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

const NOME_DO_MOTIVO = {
  situacao: 'porque a coluna Situação do arquivo dizia isso',
  data: 'porque o arquivo trouxe uma data de pagamento/recebimento preenchida',
  saldo: 'porque o arquivo trouxe saldo zero',
  ausencia: 'porque sumiram de um relatório posterior (o app entende sumir como baixa)',
  manual: 'porque a baixa foi feita aqui dentro, à mão',
  indefinido: 'sem motivo registrado: foram baixados por uma versão antiga do app, que não '
    + 'guardava o porquê — o botão "Reler as situações" acerta isso sem reimportar nada',
};

/** A frase que descreve um grupo de baixas, com o texto lido entre aspas. */
function frasearMotivo(g) {
  const base = `${g.quantidade} ${g.quantidade === 1 ? 'título' : 'títulos'} `
    + `(${money(g.valor)}) ${NOME_DO_MOTIVO[g.motivo] || g.motivo}`;
  if (!g.textos.length) return `${base}.`;
  return `${base} — o arquivo dizia ${g.textos.map((t) => `"${t}"`).join(', ')}.`;
}

/**
 * O diagnóstico virado em frases, do mais provável para o menos.
 *
 * Cada frase diz O QUE fazer, não só o que está errado: um aviso que não dá o
 * próximo passo faz ela voltar aqui me perguntar, que é o trabalho que o app
 * deveria eliminar.
 */
export function explicarZero(d) {
  const falas = [];
  /* "Os 1 títulos" é o tipo de frase que faz ela desconfiar do número ao lado */
  const tit = (n) => (n === 1 ? '1 título' : `${n} títulos`);
  const lados = [
    { nome: 'a receber', c: d.receber, arquivo: 'Contas a receber' },
    { nome: 'a pagar', c: d.pagar, arquivo: 'Contas a pagar' },
  ];

  for (const { nome, c, arquivo } of lados) {
    /**
     * CADA LADO SE EXPLICA SOZINHO.
     *
     * "E os recebimentos? Que tá tudo zerado ainda nos recebimentos. Aí parece
     *  que vai ficar negativado pra sempre. Só tem pagamento, né? Não."
     *
     * Era exatamente este o furo: a explicação só aparecia quando OS DOIS lados
     * estavam zerados. Com as saídas funcionando e as entradas zeradas — o caso
     * dela, e o mais assustador de todos, porque o caixa fica negativo para
     * sempre — a tela não dizia nada. Agora o lado que tem movimento fica
     * calado e o lado zerado fala.
     */
    if (c.valorNoPeriodo) continue;
    if (!c.importados) {
      falas.push({
        nivel: 'atencao',
        texto: `Nenhum título ${nome} entrou na base. O relatório "${arquivo}" não foi importado, `
          + 'ou foi importado e a confirmação no fim não foi concluída. Em Enviar, veja se ele '
          + 'aparece no histórico do dia.',
      });
      continue;
    }
    if (!c.emAberto) {
      falas.push({
        nivel: 'atencao',
        texto: `${tit(c.importados)} ${nome} ${c.importados === 1 ? 'entrou' : 'entraram'} na base, `
          + (c.importados === 1 ? 'e está baixado ou cancelado' : 'e estão baixados ou cancelados')
          + ' — então não há nada para projetar. O app deu baixa assim: '
          + c.porQueBaixados.map(frasearMotivo).join(' ')
          + ' Se o arquivo dizia que o título está EM ABERTO, o erro é de leitura do app, e isto '
          + 'aqui é o que eu preciso saber para consertar.',
      });
      continue;
    }
    if (c.semVencimento === c.emAberto) {
      falas.push({
        nivel: 'atencao',
        texto: `${tit(c.emAberto)} ${nome} em aberto ${c.emAberto === 1 ? 'está' : 'estão'} SEM DATA `
          + 'DE VENCIMENTO. Sem a data o app não sabe em que dia pôr cada um, e por isso nenhum '
          + `entra na projeção. Reenvie o "${arquivo}" com a coluna Vencimento — e, se a coluna `
          + 'estiver lá, confira na importação se ela foi apontada como Vencimento.',
      });
      continue;
    }
    if (!c.noPeriodo) {
      const partes = [];
      if (c.vencidos) {
        partes.push(`${tit(c.vencidos)} já ${c.vencidos === 1 ? 'venceu' : 'venceram'} `
          + '(fica na seção Vencidos, fora da projeção de propósito)');
      }
      if (c.depoisDoPeriodo) {
        partes.push(`${tit(c.depoisDoPeriodo)} ${c.depoisDoPeriodo === 1 ? 'vence' : 'vencem'} `
          + 'depois do fim do período');
      }
      if (c.semVencimento) {
        partes.push(`${tit(c.semVencimento)} ${c.semVencimento === 1 ? 'está' : 'estão'} sem data de vencimento`);
      }
      falas.push({
        nivel: 'info',
        texto: `Nenhum título ${nome} vence neste período: ${partes.join('; ')}. `
          + (c.depoisDoPeriodo ? 'Amplie o período no filtro de cima para vê-los.' : ''),
      });
      const suspeita = notaDasBaixas(c, nome);
      if (suspeita) falas.push(suspeita);
      continue;
    }
    if (c.semValor === c.noPeriodo) {
      falas.push({
        nivel: 'atencao',
        texto: `${tit(c.noPeriodo)} ${nome} ${c.noPeriodo === 1 ? 'vence' : 'vencem'} neste período `
          + `e ${c.noPeriodo === 1 ? 'está' : 'estão'} com VALOR ZERO. O valor não veio do arquivo: `
          + `reenvie o "${arquivo}" conferindo, na importação, qual coluna foi apontada como `
          + '"Valor total".',
      });
      continue;
    }
    if (c.semValor) {
      falas.push({
        nivel: 'info',
        texto: `${c.semValor} de ${tit(c.noPeriodo)} ${nome} do período ${c.semValor === 1 ? 'está' : 'estão'} `
          + 'com valor zero, e por isso não somam nada na projeção.',
      });
    }
    if (c.semVencimento) {
      falas.push({
        nivel: 'info',
        texto: `${tit(c.semVencimento)} ${nome} ${c.semVencimento === 1 ? 'está' : 'estão'} sem data de `
          + 'vencimento e ficou fora da projeção — não aparece em dia nenhum.',
      });
    }
    const suspeita = notaDasBaixas(c, nome);
    if (suspeita) falas.push(suspeita);
  }
  return falas;
}

/**
 * A NOTA SOBRE AS BAIXAS QUE MERECEM DESCONFIANÇA.
 *
 * Baixa por ausência no relatório e baixa feita à mão são o app funcionando: ela
 * mesma causou as duas. Baixa decidida pela coluna Situação, por uma data ou sem
 * motivo registrado é onde o erro de leitura mora — foi ali que "NÃO PAGO" virou
 * pago. Então a nota fala só desses, com o texto que o arquivo trazia.
 *
 * Ela só aparece quando o lado em questão está contribuindo zero: num mês
 * normal, títulos baixados são o esperado e não precisam de aviso.
 */
function notaDasBaixas(c, nome) {
  const suspeitos = (c.porQueBaixados || [])
    .filter((g) => g.motivo === 'situacao' || g.motivo === 'data' || g.motivo === 'indefinido');
  if (!suspeitos.length) return null;
  const quantos = suspeitos.reduce((a, g) => a + g.quantidade, 0);
  const valor = cents(suspeitos.reduce((a, g) => a + g.valor, 0));
  return {
    nivel: 'atencao',
    texto: `E há ${quantos} ${quantos === 1 ? 'título' : 'títulos'} ${nome} (${money(valor)}) que o `
      + 'app deu como baixados por conta do que leu no arquivo: '
      + suspeitos.map(frasearMotivo).join(' ')
      + ' Se algum desses está EM ABERTO no seu sistema, o app leu errado.',
  };
}

/** Os totais do mês corrente, para o resumo de abertura. */
export async function resumo({ base = today(), horizonte = '30' } = {}) {
  const { de, ate } = periodoDoHorizonte(horizonte, base);
  return projetar({ de, ate });
}

export { monthKey };
