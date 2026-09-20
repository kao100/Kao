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
    porVendedor: montarVendedores(doDia, doMes, vendedores, metaMes, restantes),
    recados: [],
  };
}

/** Junta o dia e o mês de cada vendedor numa linha só. */
function montarVendedores(doDia, doMes, vendedores, metaMes, restantes) {
  const nomes = new Map(vendedores.map((v) => [v.id, v]));
  const hoje = new Map(doDia.ranking.map((v) => [v.vendedorId, v]));
  return doMes.ranking.map((v) => {
    const cadastro = nomes.get(v.vendedorId);
    const metaPessoal = cadastro?.meta || null;
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
      meta: metaPessoal,
      percentualMeta: metaPessoal ? (v.valor / metaPessoal) * 100 : null,
      falta: metaPessoal ? Math.max(0, cents(metaPessoal - v.valor)) : null,
      precisaPorDia: metaPessoal && restantes > 0
        ? cents(Math.max(0, metaPessoal - v.valor) / restantes)
        : null,
      // participação na meta da empresa, quando não há meta individual
      metaEmpresa: metaMes || null,
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

  for (const v of r.porVendedor) {
    if (v.percentualMeta == null || v.falta === 0) continue;
    if (v.percentualMeta < 70 && v.precisaPorDia) {
      saida.push({
        nivel: 'atencao',
        texto: `${v.nome} está em ${pctCurto(v.percentualMeta)} da meta: precisa de `
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
