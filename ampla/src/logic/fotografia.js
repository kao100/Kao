/**
 * O RELATÓRIO FINANCEIRO É UMA FOTOGRAFIA, NÃO UM LANÇAMENTO.
 *
 * "Segunda-feira o relatório mostra NF 100, R$ 5.000, em aberto. Terça eu mando
 *  um relatório novo e a NF 100 continua nele. Isso NÃO significa mais R$ 5.000.
 *  É o mesmo título continuando em aberto."
 *
 * O app tratava cada importação como se fossem títulos novos e nunca fechava os
 * que sumiam do arquivo. Quem dá baixa dá baixa no GestãoClick, o título some do
 * próximo export — e aqui ele ficava aberto para sempre. Semana após semana isso
 * virou os R$ 600 mil em aberto que não existem.
 *
 * A REGRA NOVA, em uma frase: o arquivo de hoje é a verdade sobre o que está em
 * aberto hoje. Título que estava aberto, cabia neste arquivo e não veio nele,
 * foi baixado.
 *
 * E A PARTE DELICADA — "não quero que o sistema dê baixa em uma conta
 * simplesmente porque importei um relatório com outro filtro".
 *
 * Por isso a baixa por ausência só alcança o que o arquivo COBRE. A cobertura é
 * medida pelos vencimentos que vieram nele: um export de outubro não encosta em
 * título de novembro. Fora da janela, o silêncio do arquivo não quer dizer nada,
 * e nada acontece.
 */

import * as store from '../core/store.js';
import * as db from '../core/db.js';
import { cents, sum } from '../core/util.js';

/** Os dois relatórios que são fotografia. O resto do app não muda. */
export const FONTES_FOTOGRAFIA = { receber: 'receber', pagar: 'pagar' };

/**
 * A JANELA QUE O ARQUIVO COBRE.
 *
 * Do menor ao maior vencimento que ele trouxe.
 */
export function coberturaDe(registros) {
  const datas = registros.map((r) => r.vencimento).filter(Boolean).sort();
  if (!datas.length) return null;
  return { de: datas[0], ate: datas[datas.length - 1], titulos: registros.length };
}

/**
 * A JANELA QUE VALE PARA FECHAR — e os dois lados dela têm regras diferentes,
 * porque os riscos são diferentes.
 *
 * O LADO DE CIMA é o último vencimento do arquivo, e ponto. Um export com
 * horizonte mais curto não pode fechar título que vence depois do que ele
 * enxerga: foi exatamente isso que ela pediu para não acontecer.
 *
 * O LADO DE BAIXO desce até onde a fotografia ANTERIOR começava. Um relatório de
 * títulos em aberto não tem começo: ele traz tudo que está vencido também. E o
 * caso mais comum de baixa é justamente o título MAIS ANTIGO sair — se a janela
 * começasse no primeiro vencimento do arquivo novo, o título que acabou de ser
 * pago cairia fora dela e nunca fecharia. Era esse o furo.
 */
export function janelaParaFechar(atual, anterior) {
  if (!atual) return null;
  const de = anterior?.de && anterior.de < atual.de ? anterior.de : atual.de;
  return { de, ate: atual.ate, titulos: atual.titulos };
}

const CHAVE = (fonte) => `fotografia:${fonte}`;

export async function ultimaFotografia(fonte) {
  const salvo = await db.get('kv', CHAVE(fonte));
  return salvo?.valor || null;
}

export async function guardarFotografia(fonte, cobertura) {
  await db.put('kv', { key: CHAVE(fonte), valor: cobertura, atualizadoEm: Date.now() });
}

/**
 * Quem sumiu da fotografia e estava em aberto dentro da janela dela.
 *
 * @param {object[]} existentes   o que já está no app
 * @param {Set<string>} noArquivo ids que vieram no arquivo de agora
 * @param {object} cobertura      { de, ate } do arquivo
 */
export function ausentesNaFotografia(existentes, noArquivo, cobertura) {
  if (!cobertura) return [];
  return existentes.filter((t) => {
    if (noArquivo.has(t.id)) return false;
    // já estava fechado: não há o que fechar de novo
    if (t.status === 'pago' || t.status === 'cancelado') return false;
    // sem vencimento não dá para saber se o arquivo o cobria: fica como está
    if (!t.vencimento) return false;
    if (t.vencimento < cobertura.de || t.vencimento > cobertura.ate) return false;
    /**
     * Título que ELA decidiu à mão não é apagado por ausência. Uma baixa feita
     * aqui dentro é informação que o relatório não tem, e o app não pode
     * desfazer a decisão dela por silêncio de arquivo.
     */
    if (t.baixaManual) return false;
    return true;
  });
}

/**
 * Fecha por ausência. Não apaga nada: marca, com a data do fechamento e o
 * motivo, para a tela poder dizer "saiu do relatório de 07/10" em vez de o
 * dinheiro simplesmente evaporar.
 */
export function fecharPorAusencia(titulos, { quando = Date.now(), arquivo = null } = {}) {
  return titulos.map((t) => ({
    ...t,
    status: 'pago',
    saldo: 0,
    valorRecebido: t.valor ?? null,
    valorPago: t.valor ?? null,
    baixadoPorAusencia: true,
    baixadoEm: quando,
    baixadoPor: arquivo,
  }));
}

/**
 * Aplica a fotografia inteira: o que veio no arquivo já foi gravado pelo
 * importador; aqui fecha-se o que faltou.
 *
 * @returns {{ fechados: number, valor: number, cobertura: object|null }}
 */
export async function aplicarFotografia(fonte, idsNoArquivo, registrosDoArquivo, { arquivo = null } = {}) {
  const repo = store[FONTES_FOTOGRAFIA[fonte]];
  if (!repo) return { fechados: 0, valor: 0, cobertura: null };

  const cobertura = coberturaDe(registrosDoArquivo);
  const anterior = await ultimaFotografia(fonte);
  const janela = janelaParaFechar(cobertura, anterior);
  if (cobertura) await guardarFotografia(fonte, cobertura);

  const existentes = await repo.listar();
  const sumidos = ausentesNaFotografia(existentes, new Set(idsNoArquivo), janela);
  if (!sumidos.length) return { fechados: 0, valor: 0, cobertura, janela };

  await repo.salvarMuitos(fecharPorAusencia(sumidos, { arquivo }));
  return {
    fechados: sumidos.length,
    valor: cents(sum(sumidos, (t) => t.saldo ?? t.valor ?? 0)),
    cobertura,
    janela,
  };
}
