/**
 * RELATÓRIO DO DIA — o que ela abre de manhã e manda para o pai.
 *
 * Responde, em uma tela: quanto vendemos ontem, quanto no mês até hoje, quanto
 * falta para a meta, se o ritmo dá para chegar lá, e quem precisa vender mais.
 *
 * Nada aqui se marca. É leitura: entra relatório, sai relatório.
 */

import * as store from '../core/store.js';
import {
  today, monthKey, monthStart, monthEnd, addDays, formatDate,
} from '../core/format.js';
import { cents, sum } from '../core/util.js';
import * as revenue from './revenue.js';

/**
 * Conta só os dias em que a empresa vende. Dividir a meta do mês por 30 quando
 * não se abre domingo dá um alvo diário menor do que o real — e aí o mês vira
 * sem ninguém perceber que estava atrasado.
 */
export function diasDeVenda(de, ate, diasDaSemana) {
  const validos = new Set(diasDaSemana?.length ? diasDaSemana : [0, 1, 2, 3, 4, 5, 6]);
  let n = 0;
  for (let d = de; d <= ate; d = addDays(d, 1)) {
    if (validos.has(new Date(`${d}T00:00:00Z`).getUTCDay())) n += 1;
  }
  return n;
}

export async function relatorio(referencia = today()) {
  const cfg = await store.config();
  const semana = cfg.diasDeVenda;
  const mes = monthKey(referencia);
  const inicio = monthStart(referencia);
  const fim = monthEnd(referencia);

  const [doDia, doMes, metaMes, serie, vendedores] = await Promise.all([
    revenue.resumo({ de: referencia, ate: referencia }),
    revenue.resumo({ de: inicio, ate: referencia }),
    store.meta(mes),
    revenue.porDia({ de: inicio, ate: referencia }),
    store.vendedores.listar(),
  ]);

  const decorridos = diasDeVenda(inicio, referencia, semana);
  const totais = diasDeVenda(inicio, fim, semana);
  const restantes = Math.max(0, diasDeVenda(addDays(referencia, 1), fim, semana));

  const metaDiaria = metaMes && totais ? cents(metaMes / totais) : null;
  const ritmoAtual = decorridos ? cents(doMes.total / decorridos) : 0;
  const falta = metaMes ? Math.max(0, cents(metaMes - doMes.total)) : null;
  const precisaPorDia = falta != null && restantes > 0 ? cents(falta / restantes) : null;
  const projecao = decorridos ? cents(ritmoAtual * totais) : 0;

  // onde a meta deveria estar hoje, se o mês fosse parelho
  const esperadoAteHoje = metaDiaria != null ? cents(metaDiaria * decorridos) : null;

  return {
    data: referencia,
    mes,
    dia: {
      total: doDia.total,
      notas: doDia.notas,
      ticketMedio: doDia.ticketMedio,
      clientes: doDia.clientes,
      ranking: doDia.ranking,
      bateuMeta: metaDiaria == null ? null : doDia.total >= metaDiaria,
      vsMeta: metaDiaria == null ? null : cents(doDia.total - metaDiaria),
    },
    mesAteHoje: {
      total: doMes.total,
      notas: doMes.notas,
      clientes: doMes.clientes,
      ticketMedio: doMes.ticketMedio,
      ranking: doMes.ranking,
      semVendedor: doMes.semVendedor,
      conferencia: doMes.conferencia,
    },
    meta: {
      valor: metaMes || null,
      diaria: metaDiaria,
      percentual: metaMes ? (doMes.total / metaMes) * 100 : null,
      falta,
      esperadoAteHoje,
      // adiantado ou atrasado em relação ao ritmo parelho
      diferencaDoRitmo: esperadoAteHoje == null ? null : cents(doMes.total - esperadoAteHoje),
    },
    ritmo: {
      atual: ritmoAtual,
      precisaPorDia,
      projecao,
      percentualProjecao: metaMes ? (projecao / metaMes) * 100 : null,
      diasDecorridos: decorridos,
      diasRestantes: restantes,
      diasNoMes: totais,
      // o ritmo que falta é maior que o que ela vem conseguindo?
      exigeMais: precisaPorDia != null && ritmoAtual > 0 && precisaPorDia > ritmoAtual,
    },
    serie,
    porVendedor: montarVendedores(doDia, doMes, vendedores, metaMes, restantes, decorridos, totais),
    recados: [],
  };
}

/**
 * A linha de objetivo de cada vendedor: onde ele está, onde deveria estar hoje
 * se o mês fosse parelho, e quanto precisa por dia para fechar.
 *
 * Quando o vendedor não tem meta própria, o alvo dele é a fatia da meta da
 * empresa que ele vem puxando — não um número inventado, e sim a participação
 * que ele mesmo tem no faturamento. Fica marcado como estimado para ninguém
 * confundir com uma meta combinada.
 */
function montarVendedores(doDia, doMes, vendedores, metaMes, restantes, decorridos, diasNoMes) {
  const nomes = new Map(vendedores.map((v) => [v.id, v]));
  const hoje = new Map(doDia.ranking.map((v) => [v.vendedorId, v]));

  return doMes.ranking.map((v) => {
    const cadastro = nomes.get(v.vendedorId);
    const metaPropria = cadastro?.meta || null;
    const alvo = metaPropria
      || (metaMes ? cents((metaMes * (v.participacao || 0)) / 100) : null);
    const falta = alvo ? Math.max(0, cents(alvo - v.valor)) : null;
    const esperado = alvo && diasNoMes ? cents((alvo / diasNoMes) * decorridos) : null;

    return {
      vendedorId: v.vendedorId,
      nome: v.nome,
      dia: hoje.get(v.vendedorId)?.valor || 0,
      notasDia: hoje.get(v.vendedorId)?.notas || 0,
      mes: v.valor,
      notas: v.notas,
      clientes: v.clientes,
      ticket: v.ticket,
      participacao: v.participacao,

      meta: metaPropria,
      alvo,
      alvoEstimado: !metaPropria && alvo != null,
      percentualMeta: alvo ? (v.valor / alvo) * 100 : null,
      falta,
      precisaPorDia: alvo && restantes > 0 ? cents(falta / restantes) : null,
      ritmo: decorridos ? cents(v.valor / decorridos) : 0,
      esperadoAteHoje: esperado,
      diferencaDoRitmo: esperado == null ? null : cents(v.valor - esperado),
    };
  });
}

/**
 * As frases do "o que precisa fazer". São montadas do próprio número, sem
 * adjetivo: quem lê precisa saber o que fazer, não ouvir que está ruim.
 */
export function recados(r) {
  const saida = [];
  const m = r.meta;
  const ritmo = r.ritmo;

  if (!m.valor) {
    saida.push({
      nivel: 'info',
      texto: 'Nenhuma meta definida para este mês. Em Ajustes você coloca a meta e esta tela '
        + 'passa a mostrar quanto falta e quanto precisa vender por dia.',
    });
    return saida;
  }

  if (m.falta === 0) {
    saida.push({ nivel: 'ok', texto: `Meta batida: ${moedaCurta(r.mesAteHoje.total)} de ${moedaCurta(m.valor)}.` });
  } else if (ritmo.diasRestantes === 0) {
    saida.push({
      nivel: 'ruim',
      texto: `O mês acabou em ${pctCurto(m.percentual)} da meta — faltaram ${moedaCurta(m.falta)}.`,
    });
  } else {
    saida.push({
      nivel: ritmo.exigeMais ? 'atencao' : 'ok',
      texto: `Faltam ${moedaCurta(m.falta)} em ${ritmo.diasRestantes} dia(s) de venda: `
        + `${moedaCurta(ritmo.precisaPorDia)} por dia.`,
    });
  }

  if (m.diferencaDoRitmo != null && m.falta !== 0) {
    const atrasado = m.diferencaDoRitmo < 0;
    saida.push({
      nivel: atrasado ? 'atencao' : 'ok',
      texto: atrasado
        ? `Para um mês parelho, deveria ter ${moedaCurta(m.esperadoAteHoje)} até hoje — está ${moedaCurta(Math.abs(m.diferencaDoRitmo))} atrás.`
        : `Está ${moedaCurta(m.diferencaDoRitmo)} à frente do ritmo parelho do mês.`,
    });
  }

  if (ritmo.percentualProjecao != null && m.falta !== 0) {
    saida.push({
      nivel: ritmo.percentualProjecao >= 100 ? 'ok' : 'atencao',
      texto: `Mantendo o ritmo de ${moedaCurta(ritmo.atual)} por dia, o mês fecha em `
        + `${moedaCurta(ritmo.projecao)} — ${pctCurto(ritmo.percentualProjecao)} da meta.`,
    });
  }

  // só cobra quem tem meta combinada: cobrar alguém por um alvo que o próprio
  // app estimou seria inventar uma conversa que ninguém teve
  for (const v of r.porVendedor) {
    if (v.alvoEstimado || v.percentualMeta == null || v.falta === 0) continue;
    if (v.diferencaDoRitmo != null && v.diferencaDoRitmo < 0 && v.precisaPorDia) {
      saida.push({
        nivel: 'atencao',
        texto: `${v.nome} está em ${pctCurto(v.percentualMeta)} da meta, `
          + `${moedaCurta(Math.abs(v.diferencaDoRitmo))} atrás do ritmo: precisa de `
          + `${moedaCurta(v.precisaPorDia)} por dia para fechar.`,
      });
    }
  }

  if (r.mesAteHoje.semVendedor?.notas > 0) {
    saida.push({
      nivel: 'atencao',
      texto: `${r.mesAteHoje.semVendedor.notas} nota(s) sem vendedor, somando `
        + `${moedaCurta(r.mesAteHoje.semVendedor.valor)}. Elas ficam fora do ranking e da comissão.`,
    });
  }

  return saida;
}

const moedaCurta = (v) => (v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pctCurto = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`);

export { formatDate, sum };
