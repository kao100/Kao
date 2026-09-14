/**
 * ROTINA DIÁRIA E INTEGRIDADE (itens 3 e 15 do projeto)
 *
 * O app conduz: mostra o que falta importar hoje, o que já entrou, e traduz
 * isso num selo de confiança que aparece em todas as telas.
 *
 *  🟢 dados completos   🟡 falta alguma atualização   🔴 falta coisa importante
 */

import * as store from '../core/store.js';
import { today, yesterday, monthKey, daysBetween } from '../core/format.js';
import { FONTES_LISTA, PERIODICIDADE } from '../data/sources.js';

/** Fontes sem as quais os números principais ficam errados. */
const ESSENCIAIS = ['nfs', 'receber', 'extrato'];

export async function rotina(referencia = today()) {
  const [marcos, importacoes, pendencias, contas] = await Promise.all([
    store.marcos(), store.importacoes.listar(), store.pendencias.listar(), store.contas.listar(),
  ]);

  const ultimaPorFonte = new Map();
  for (const imp of importacoes) {
    const atual = ultimaPorFonte.get(imp.fonte);
    if (!atual || imp.momento > atual.momento) ultimaPorFonte.set(imp.fonte, imp);
  }

  const tarefas = FONTES_LISTA
    .filter((f) => f.periodicidade !== 'demanda')
    .map((fonte) => {
      const ultima = ultimaPorFonte.get(fonte.id) || null;
      const marco = marcos[fonte.id] || null;
      const estado = avaliar(fonte, ultima, marco, referencia);
      return {
        fonteId: fonte.id,
        nome: fonte.nome,
        icone: fonte.icone,
        periodicidade: fonte.periodicidade,
        periodicidadeLabel: PERIODICIDADE[fonte.periodicidade].label,
        essencial: ESSENCIAIS.includes(fonte.id),
        ultima,
        cobreAte: marco?.ate || null,
        erros: ultima?.totalErros || 0,
        ...estado,
      };
    });

  // extrato só faz sentido quando existe conta cadastrada
  const semContas = contas.length === 0;
  for (const t of tarefas) {
    if (t.fonteId === 'extrato' && semContas) {
      t.feito = false;
      t.bloqueada = true;
      t.observacao = 'Cadastre os bancos primeiro.';
    }
  }

  const abertas = pendencias.filter((p) => p.status === 'aberta');
  if (abertas.length) {
    tarefas.push({
      fonteId: 'conciliacao',
      nome: 'Conciliar pendências',
      icone: '⚠️',
      periodicidade: 'diaria',
      periodicidadeLabel: 'Diária',
      essencial: true,
      feito: false,
      atrasada: true,
      quantidade: abertas.length,
      rota: '/conciliacao',
      ultima: null,
    });
  }

  const doDia = tarefas.filter((t) => t.periodicidade === 'diaria');
  const concluidas = tarefas.filter((t) => t.feito);
  const pendentes = tarefas.filter((t) => !t.feito);

  return {
    referencia,
    tarefas,
    pendentes,
    concluidas,
    total: tarefas.length,
    progresso: tarefas.length ? Math.round((concluidas.length / tarefas.length) * 100) : 100,
    diarias: { total: doDia.length, feitas: doDia.filter((t) => t.feito).length },
    integridade: integridade(tarefas, abertas),
    atualizadoAte: atualizadoAte(tarefas),
    pendenciasAbertas: abertas.length,
  };
}

function avaliar(fonte, ultima, marco, referencia) {
  if (!ultima) {
    return { feito: false, atrasada: true, nunca: true, desde: null };
  }
  const diasDesde = daysBetween(ultima.data, referencia);
  const cobreOntem = marco?.ate ? marco.ate >= yesterday() : false;

  if (fonte.periodicidade === 'diaria') {
    const feito = ultima.data === referencia || cobreOntem;
    return { feito, atrasada: !feito && diasDesde >= 1, desde: diasDesde };
  }
  if (fonte.periodicidade === 'semanal') {
    const feito = diasDesde <= 6;
    return { feito, atrasada: !feito, desde: diasDesde };
  }
  // mensal
  const feito = monkeyMes(ultima.data) === monkeyMes(referencia);
  return { feito, atrasada: !feito, desde: diasDesde };
}

function monkeyMes(iso) { return monthKey(iso); }

/**
 * Selo de integridade. Vermelho é reservado para o que estraga decisão:
 * faltar venda, título ou extrato do dia.
 */
function integridade(tarefas, pendenciasAbertas) {
  const essenciaisAtrasadas = tarefas.filter((t) => t.essencial && !t.feito && !t.bloqueada);
  const graves = pendenciasAbertas.filter((p) => p.tipo === 'nf_sem_vendedor' || p.tipo === 'divergencia_faturamento');
  if (essenciaisAtrasadas.length || graves.length) {
    return {
      nivel: 'vermelho',
      emoji: '🔴',
      texto: essenciaisAtrasadas.length
        ? `Falta atualizar: ${essenciaisAtrasadas.map((t) => t.nome).join(', ')}`
        : `${graves.length} pendência(s) afetam o faturamento`,
    };
  }
  const outras = tarefas.filter((t) => !t.feito && !t.bloqueada);
  if (outras.length || pendenciasAbertas.length) {
    return {
      nivel: 'amarelo',
      emoji: '🟡',
      texto: outras.length
        ? `${outras.length} atualização(ões) pendente(s)`
        : `${pendenciasAbertas.length} pendência(s) de conciliação`,
    };
  }
  return { nivel: 'verde', emoji: '🟢', texto: 'Dados completos e conciliados' };
}

/** Até que dia os números podem ser considerados completos. */
function atualizadoAte(tarefas) {
  const datas = tarefas
    .filter((t) => t.essencial && t.cobreAte)
    .map((t) => t.cobreAte);
  if (!datas.length) return null;
  return datas.sort()[0];
}

/** Linha "DADOS ATUALIZADOS ATÉ ..." usada no topo das telas. */
export async function selo() {
  const r = await rotina();
  const [importacoes] = await Promise.all([store.importacoes.listar()]);
  const ultima = importacoes.reduce((max, i) => (!max || i.momento > max.momento ? i : max), null);
  return {
    integridade: r.integridade,
    atualizadoAte: r.atualizadoAte,
    ultimaImportacao: ultima ? { momento: ultima.momento, arquivo: ultima.arquivo, fonte: ultima.fonte } : null,
    pendentes: r.pendentes.length,
    progresso: r.progresso,
  };
}

/** Histórico com filtro simples, para a tela de importações. */
export async function historico({ fonte = null, limite = 60 } = {}) {
  const lista = await store.importacoes.listar();
  return lista
    .filter((i) => !fonte || i.fonte === fonte)
    .sort((a, b) => b.momento - a.momento)
    .slice(0, limite);
}
