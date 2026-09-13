/**
 * FLUXO DE CAIXA E SIMULAÇÃO (itens 9 e 10 do projeto)
 *
 * Não é uma lista de entradas e saídas: é a resposta para
 * "QUANTO DINHEIRO A EMPRESA TERÁ NO DIA X?" — sempre ACUMULADO, porque não
 * adianta saber que entram R$ 100 mil no dia 25 se o caixa já ficou negativo no 18.
 *
 * O que entra na projeção (e o que não entra):
 *  • recebimento a vencer            → entra na data do vencimento
 *  • título vencido COM promessa     → entra na data prometida
 *  • título vencido SEM promessa     → NÃO entra (o app não chuta recebimento);
 *                                      aparece à parte como "vencido fora da projeção"
 *  • pagamento a vencer              → entra na data do vencimento (ou da prorrogação)
 *  • pagamento vencido e não pago    → entra no primeiro dia (a obrigação continua)
 *
 * A simulação nunca toca no dado real: ela recebe os mesmos lançamentos e
 * aplica ajustes em memória.
 */

import * as store from '../core/store.js';
import { today, addDays, eachDay } from '../core/format.js';
import { cents, sum, sortBy, uid } from '../core/util.js';
import { statusTitulo } from './link.js';

export const HORIZONTES = [
  { dias: 7, label: '7 dias' },
  { dias: 15, label: '15 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 60, label: '60 dias' },
];

/* --------------------------------------------------------------- saldo real */

/**
 * Saldo de cada conta: usa o saldo informado mais recente (extrato/digitado) e
 * soma os lançamentos posteriores àquela data. Sem saldo informado, mostra
 * apenas a soma do extrato e avisa que a base pode estar incompleta.
 */
export async function saldoAtual(referencia = today()) {
  const [contas, saldos, movimentos] = await Promise.all([
    store.contas.listar(), store.saldos.listar(), store.extrato.listar(),
  ]);

  const porConta = contas.map((conta) => {
    const marcos = sortBy(saldos.filter((s) => s.contaId === conta.id && s.data <= referencia), (s) => s.data);
    const marco = marcos[marcos.length - 1] || null;
    const movs = movimentos.filter((m) => m.contaId === conta.id && m.data <= referencia);
    const posteriores = marco ? movs.filter((m) => m.data > marco.data) : movs;
    const saldo = cents((marco?.saldo || 0) + sum(posteriores, (m) => m.valor));
    return {
      conta,
      saldo,
      base: marco ? 'saldo informado' : 'soma do extrato',
      dataBase: marco?.data || (movs.length ? sortBy(movs, (m) => m.data)[movs.length - 1].data : null),
      confiavel: !!marco,
      movimentos: movs.length,
    };
  });

  return {
    referencia,
    porConta,
    total: cents(sum(porConta, (c) => c.saldo)),
    confiavel: porConta.length > 0 && porConta.every((c) => c.confiavel),
    semContas: contas.length === 0,
  };
}

/* --------------------------------------------------------- lançamentos previstos */

/** Junta tudo que está previsto no período, já com a data em que vai acontecer. */
export async function lancamentosPrevistos({ de = today(), ate }) {
  const [titulos, pagamentos, eventos, cfg] = await Promise.all([
    store.receber.listar(), store.pagar.listar(), store.cobrancas.listar(), store.config(),
  ]);

  const promessaPorTitulo = new Map();
  for (const e of sortBy(eventos.filter((x) => x.tipo === 'promessa'), (x) => x.momento)) {
    promessaPorTitulo.set(e.tituloId, e);
  }

  const entradas = [];
  const foraDaProjecao = [];

  for (const t of titulos) {
    if (statusTitulo(t) !== 'aberto') continue;
    const valor = cents(t.saldo ?? t.valor);
    if (valor <= 0) continue;
    const promessa = promessaPorTitulo.get(t.id);
    const vencido = t.vencimento < de;
    let data = t.vencimento;
    let tipoData = 'vencimento';

    if (promessa && promessa.promessaData >= de) { data = promessa.promessaData; tipoData = 'promessa'; } else if (vencido) {
      if (!cfg.projecao.incluirVencidosSemPromessa) {
        foraDaProjecao.push({ tipo: 'receber', id: t.id, descricao: t.clienteNome, valor, vencimento: t.vencimento, motivo: 'vencido sem promessa de pagamento' });
        continue;
      }
      data = de;
      tipoData = 'vencido';
    }
    if (data > ate) continue;
    entradas.push({
      id: t.id, origem: 'receber', data, tipoData,
      descricao: t.clienteNome || 'Cliente',
      detalhe: `título ${t.documento}${t.nfNumero ? ` · NF ${t.nfNumero}` : ''}`,
      valor, vencimentoOriginal: t.vencimento, vendedorId: t.vendedorId || null,
    });
  }

  const saidas = [];
  for (const p of pagamentos) {
    if (p.status === 'pago') continue;
    const valor = cents(p.valor);
    if (valor <= 0) continue;
    const previsto = p.prorrogadoPara || p.vencimento;
    // conta vencida e não paga continua sendo obrigação: cai no primeiro dia
    const data = previsto < de ? de : previsto;
    if (data > ate) continue;
    saidas.push({
      id: p.id, origem: 'pagar', data,
      tipoData: previsto < de ? 'atrasado' : (p.prorrogadoPara ? 'prorrogado' : 'vencimento'),
      descricao: p.fornecedorNome,
      detalhe: [p.categoria, p.documento && `doc ${p.documento}`].filter(Boolean).join(' · '),
      valor, vencimentoOriginal: p.vencimento, categoria: p.categoria || null,
    });
  }

  return { entradas, saidas, foraDaProjecao };
}

/* ------------------------------------------------------------------ projeção */

/**
 * Projeção diária acumulada.
 * @param {object} opcoes
 * @param {Array} opcoes.ajustes  ajustes de simulação (não tocam no banco)
 */
export async function projetar({ dias = 30, de = today(), ajustes = [] } = {}) {
  const ate = addDays(de, dias - 1);
  const [{ total: saldoInicial, porConta, confiavel }, previstos, cfg] = await Promise.all([
    saldoAtual(de), lancamentosPrevistos({ de, ate }), store.config(),
  ]);

  let entradas = [...previstos.entradas];
  let saidas = [...previstos.saidas];
  let saldoBase = saldoInicial;

  for (const ajuste of ajustes) {
    ({ entradas, saidas, saldoBase } = aplicarAjuste({ entradas, saidas, saldoBase }, ajuste, de, ate));
  }

  const porDiaEntrada = agrupar(entradas);
  const porDiaSaida = agrupar(saidas);

  let acumulado = saldoBase;
  const linhas = eachDay(de, ate).map((data) => {
    const listaEntradas = porDiaEntrada.get(data) || [];
    const listaSaidas = porDiaSaida.get(data) || [];
    const totalEntradas = cents(sum(listaEntradas, (e) => e.valor));
    const totalSaidas = cents(sum(listaSaidas, (s) => s.valor));
    const saldoInicialDia = acumulado;
    acumulado = cents(acumulado + totalEntradas - totalSaidas);
    return {
      data,
      saldoInicial: saldoInicialDia,
      entradas: totalEntradas,
      saidas: totalSaidas,
      saldoFinal: acumulado,
      nivel: nivelDoSaldo(acumulado, cfg),
      itens: { entradas: sortBy(listaEntradas, (e) => -e.valor), saidas: sortBy(listaSaidas, (s) => -s.valor) },
    };
  });

  const negativos = linhas.filter((l) => l.saldoFinal < 0);
  const menor = linhas.reduce((min, l) => (l.saldoFinal < min.saldoFinal ? l : min), linhas[0] || { saldoFinal: saldoBase, data: de });

  return {
    de,
    ate,
    dias,
    saldoInicial: saldoBase,
    saldoInicialReal: saldoInicial,
    contas: porConta,
    confiavel,
    linhas,
    totalEntradas: cents(sum(linhas, (l) => l.entradas)),
    totalSaidas: cents(sum(linhas, (l) => l.saidas)),
    saldoFinal: linhas.length ? linhas[linhas.length - 1].saldoFinal : saldoBase,
    menorSaldo: menor,
    primeiroDiaNegativo: negativos[0] || null,
    diasNegativos: negativos.length,
    foraDaProjecao: previstos.foraDaProjecao,
    valorForaDaProjecao: cents(sum(previstos.foraDaProjecao, (f) => f.valor)),
  };
}

function agrupar(lista) {
  const mapa = new Map();
  for (const item of lista) {
    if (!mapa.has(item.data)) mapa.set(item.data, []);
    mapa.get(item.data).push(item);
  }
  return mapa;
}

function nivelDoSaldo(saldo, cfg) {
  if (saldo < (cfg.caixa.alertaCritico ?? 0)) return 'critico';
  if (saldo < (cfg.caixa.alertaAtencao ?? 0)) return 'atencao';
  return 'ok';
}

/* ---------------------------------------------------------------- simulação */

export const TIPOS_AJUSTE = {
  entrada: { label: 'Adicionar recebimento', icone: '➕', ajuda: 'Ex.: "se entrar R$ 50.000 no dia 25…"' },
  saida: { label: 'Adicionar pagamento', icone: '➖', ajuda: 'Uma compra ou despesa que ainda não está na base.' },
  mover: { label: 'Mudar a data', icone: '📅', ajuda: 'Antecipar um recebimento ou prorrogar um fornecedor.' },
  remover: { label: 'Tirar da projeção', icone: '🚫', ajuda: 'Simular que um lançamento não vai acontecer.' },
  saldo: { label: 'Mudar saldo inicial', icone: '🏦', ajuda: 'Ex.: contar com um limite ou aporte.' },
};

export function novoAjuste(tipo, dados) {
  return { id: uid('sim'), tipo, criadoEm: Date.now(), ...dados };
}

function aplicarAjuste(estado, ajuste, de, ate) {
  let { entradas, saidas, saldoBase } = estado;

  if (ajuste.tipo === 'entrada' || ajuste.tipo === 'saida') {
    const item = {
      id: ajuste.id,
      origem: 'simulacao',
      data: ajuste.data,
      descricao: ajuste.descricao || (ajuste.tipo === 'entrada' ? 'Recebimento simulado' : 'Pagamento simulado'),
      detalhe: 'simulação',
      valor: Math.abs(cents(ajuste.valor)),
      simulado: true,
    };
    if (item.data >= de && item.data <= ate) {
      if (ajuste.tipo === 'entrada') entradas = [...entradas, item];
      else saidas = [...saidas, item];
    }
  }

  if (ajuste.tipo === 'mover') {
    const mover = (lista) => lista.map((item) => (
      item.origem === ajuste.alvo.origem && item.id === ajuste.alvo.id
        ? { ...item, data: ajuste.novaData, movido: true, dataOriginal: item.data }
        : item
    )).filter((item) => item.data >= de && item.data <= ate);
    entradas = mover(entradas);
    saidas = mover(saidas);
  }

  if (ajuste.tipo === 'remover') {
    const fora = (item) => !(item.origem === ajuste.alvo.origem && item.id === ajuste.alvo.id);
    entradas = entradas.filter(fora);
    saidas = saidas.filter(fora);
  }

  if (ajuste.tipo === 'saldo') saldoBase = cents(ajuste.valor);

  return { entradas, saidas, saldoBase };
}

/** Real x simulado lado a lado, para responder "o caixa suporta?". */
export async function comparar({ dias = 30, de = today(), ajustes = [] }) {
  const [real, simulado] = await Promise.all([
    projetar({ dias, de }),
    projetar({ dias, de, ajustes }),
  ]);
  return {
    real,
    simulado,
    diferencaFinal: cents(simulado.saldoFinal - real.saldoFinal),
    resolveu: !!real.primeiroDiaNegativo && !simulado.primeiroDiaNegativo,
    piorou: !real.primeiroDiaNegativo && !!simulado.primeiroDiaNegativo,
    menorSaldoReal: real.menorSaldo?.saldoFinal ?? 0,
    menorSaldoSimulado: simulado.menorSaldo?.saldoFinal ?? 0,
  };
}

/**
 * Aplica de verdade os ajustes de uma simulação (só quando confirmado).
 * Hoje sabe aplicar mudanças de data — o resto continua sendo simulação.
 */
export async function aplicarDeVerdade(ajustes, motivo) {
  if (!motivo) throw new Error('Descreva o motivo — a mudança fica registrada.');
  let aplicados = 0;
  for (const ajuste of ajustes) {
    if (ajuste.tipo !== 'mover') continue;
    if (ajuste.alvo.origem === 'pagar') {
      const conta = await store.pagar.obter(ajuste.alvo.id);
      if (!conta) continue;
      await store.pagar.salvar({ ...conta, prorrogadoPara: ajuste.novaData, prorrogacaoMotivo: motivo });
      await store.registrar('prorrogacao', {
        alvoId: conta.id, alvo: conta.fornecedorNome, de: conta.vencimento, para: ajuste.novaData, motivo,
      });
      aplicados += 1;
    }
    if (ajuste.alvo.origem === 'receber') {
      const titulo = await store.receber.obter(ajuste.alvo.id);
      if (!titulo) continue;
      await store.cobrancas.salvar({
        id: uid('cob'),
        tituloId: titulo.id,
        clienteId: titulo.clienteId,
        tipo: 'promessa',
        data: today(),
        momento: Date.now(),
        promessaData: ajuste.novaData,
        promessaValor: titulo.saldo ?? titulo.valor,
        observacao: motivo,
        usuario: (await store.config()).usuario || 'administração',
      });
      aplicados += 1;
    }
  }
  return aplicados;
}

/* -------------------------------------------------------------- persistência */

export async function salvarCenario(nome, ajustes) {
  const cenario = { id: uid('cen'), nome, ajustes, criadoEm: Date.now() };
  await store.cenarios.salvar(cenario);
  return cenario;
}

export async function excluirCenario(id) {
  await store.cenarios.remover(id);
}

/** Quais pagamentos dá para prorrogar para resolver um dia negativo? */
export async function sugerirProrrogacoes({ de = today(), dias = 30 } = {}) {
  const projecao = await projetar({ de, dias });
  if (!projecao.primeiroDiaNegativo) return { necessario: 0, candidatos: [], dia: null };
  const dia = projecao.primeiroDiaNegativo;
  const necessario = Math.abs(dia.saldoFinal);
  const candidatos = projecao.linhas
    .filter((l) => l.data <= dia.data)
    .flatMap((l) => l.itens.saidas.map((s) => ({ ...s, diaOriginal: l.data })))
    .filter((s) => s.origem === 'pagar');
  return {
    dia,
    necessario: cents(necessario),
    candidatos: sortBy(candidatos, (c) => -c.valor),
  };
}
