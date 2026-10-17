/**
 * O RETRATO DA BASE, EM TEXTO, PARA ELA ME MANDAR.
 *
 * "Eu não sei nem o que te falar (...) os recebimentos continuam zerados aqui.
 *  Parece que não sei o que tá acontecendo."
 *
 * Eu também não sabia. O mesmo arquivo dela, no mesmo app, pela mesma tela,
 * funciona aqui e não funciona no aparelho dela — e as últimas rodadas inteiras
 * foram eu adivinhando por print. Print mostra o fim da história; o que falta é
 * o começo: o que entrou, com que situação, em que mês vence, e o que a tela
 * calculou a partir disso.
 *
 * Então este módulo escreve esse começo num texto que cabe numa mensagem. Um
 * toque, ela cola, e a dúvida acaba — em vez de mais uma rodada de palpite.
 *
 * NÃO VAI NOME, CPF, CNPJ NEM NÚMERO DE NOTA. Só contagens, somas e as palavras
 * da coluna Situação. O texto vai parar numa conversa, e dado de cliente dela
 * não tem por que viajar para contar por que um número deu zero.
 */

import * as store from '../core/store.js';
import * as db from '../core/db.js';
import { VERSAO } from '../core/versao.js';
import { cents, sum } from '../core/util.js';
import { today, monthKey, money, timestampLabel } from '../core/format.js';
import * as fluxo from './fluxo.js';

const LOJAS = [
  'nfs', 'nfItens', 'pedidos', 'orcamentos', 'receber', 'pagar', 'comissoesRelatorio',
  'vendasProduto', 'fretes', 'clientes', 'vendedores', 'produtos', 'contas', 'saldos',
  'importacoes', 'perfisImport', 'pendencias',
];

export async function montar({ de = today(), ate = null, dias = 30 } = {}) {
  const linhas = [];
  const p = (t) => linhas.push(t);

  p(`AMPLA ${VERSAO} — diagnóstico de ${timestampLabel(Date.now())}`);
  p('');

  /* 1. o que existe na base */
  p('O QUE ESTÁ GUARDADO');
  for (const loja of LOJAS) {
    const n = (await db.getAll(loja)).length;
    if (n) p(`   ${loja.padEnd(20)} ${n}`);
  }
  p('');

  /* 2. os títulos, que é onde o problema está */
  for (const [loja, nome] of [['receber', 'CONTAS A RECEBER'], ['pagar', 'CONTAS A PAGAR']]) {
    const titulos = await db.getAll(loja);
    p(`${nome} — ${titulos.length} título(s)`);
    if (!titulos.length) { p('   (nenhum)'); p(''); continue; }

    const abertos = titulos.filter((t) => t.status === 'aberto');
    p(`   em aberto: ${abertos.length} (${money(cents(sum(abertos, (t) => t.valor || 0)))})`);
    p(`   baixados/cancelados: ${titulos.length - abertos.length}`);

    /* a palavra que veio no arquivo, e o que o app fez com ela */
    const porTexto = new Map();
    for (const t of titulos) {
      const k = t.statusArquivo || '(sem coluna Situação)';
      if (!porTexto.has(k)) porTexto.set(k, { aberto: 0, pago: 0, outro: 0 });
      const g = porTexto.get(k);
      if (t.status === 'aberto') g.aberto += 1;
      else if (t.status === 'pago') g.pago += 1;
      else g.outro += 1;
    }
    p('   situação do arquivo → o que o app entendeu:');
    for (const [texto, g] of [...porTexto.entries()].sort((a, b) => (b[1].aberto + b[1].pago) - (a[1].aberto + a[1].pago))) {
      p(`      "${texto}": ${g.aberto} aberto, ${g.pago} pago${g.outro ? `, ${g.outro} outro` : ''}`);
    }

    /* quando vencem os que estão em aberto — é o que decide o que a tela mostra */
    const porMes = new Map();
    let semVenc = 0;
    let semValor = 0;
    for (const t of abertos) {
      if (!t.vencimento) { semVenc += 1; continue; }
      if (!t.valor) semValor += 1;
      const m = monthKey(t.vencimento);
      const g = porMes.get(m) || { n: 0, total: 0 };
      g.n += 1;
      g.total += t.valor || 0;
      porMes.set(m, g);
    }
    p('   em aberto, por mês de vencimento:');
    for (const [m, g] of [...porMes.entries()].sort()) {
      p(`      ${m}: ${g.n} título(s), ${money(cents(g.total))}`);
    }
    if (semVenc) p(`   SEM data de vencimento: ${semVenc}`);
    if (semValor) p(`   com valor zero: ${semValor}`);
    /* baixa que não veio do arquivo é a que costuma estar errada */
    const porAusencia = titulos.filter((t) => t.baixadoPorAusencia).length;
    const manual = titulos.filter((t) => t.baixaManual).length;
    if (porAusencia) p(`   baixados por sumir de um relatório posterior: ${porAusencia}`);
    if (manual) p(`   baixados à mão: ${manual}`);
    p('');
  }

  /* 3. o que a tela do caixa calculou com isso */
  const fim = ate || null;
  const proj = await fluxo.projetar(fim ? { de, ate: fim } : { de, dias });
  p(`FLUXO DE CAIXA (${proj.periodo.de} a ${proj.periodo.ate})`);
  p(`   saldo informado: ${proj.saldoInicial == null ? 'NENHUM' : money(proj.saldoInicial)}`);
  p(`   a receber no período: ${money(proj.totalReceber)}`);
  p(`   a pagar no período: ${money(proj.totalPagar)}`);
  p(`   recebimentos vencidos: ${money(proj.vencidos.receber.valor)} (${proj.vencidos.receber.quantidade})`);
  p(`   pagamentos vencidos: ${money(proj.vencidos.pagar.valor)} (${proj.vencidos.pagar.quantidade})`);
  p(`   sem vencimento: receber ${proj.semVencimento.receber}, pagar ${proj.semVencimento.pagar}`);
  p('');

  /* 4. as últimas importações, com os avisos que elas deram */
  const imports = (await store.importacoes.listar())
    .sort((a, b) => (b.momento || 0) - (a.momento || 0))
    .slice(0, 5);
  p(`ÚLTIMAS IMPORTAÇÕES (${imports.length})`);
  if (!imports.length) p('   (nenhuma registrada)');
  for (const i of imports) {
    p(`   ${i.fonte} · ${i.momento ? timestampLabel(i.momento) : '?'} · ${i.resumo?.principal ?? i.resumo?.total ?? '?'} registro(s)`);
    for (const a of (i.avisos || []).slice(0, 3)) p(`      aviso: ${String(a).slice(0, 160)}`);
  }

  return linhas.join('\n');
}
