/**
 * ORÇAMENTOS — quanto foi orçado, quanto virou venda.
 *
 * A conversão vem da coluna SITUAÇÃO do próprio relatório, não de adivinhação.
 * O relatório de orçamentos não traz o número do pedido que ele gerou, então
 * cruzar orçamento com pedido por cliente e valor parecido seria inventar
 * vínculo — exatamente o que o item 20 proíbe. Se um dia o export trouxer essa
 * coluna, a taxa passa a ser calculada; até lá ela é a que o sistema informa.
 */

import * as store from '../core/store.js';
import { monthKey } from '../core/format.js';
import { cents, sum } from '../core/util.js';

export const SITUACOES = {
  convertido: { label: 'Virou venda', cor: 'verde', icone: '✅' },
  perdido: { label: 'Perdido', cor: 'vermelho', icone: '❌' },
  aberto: { label: 'Em aberto', cor: 'amarelo', icone: '⏳' },
  desconhecida: { label: 'Sem situação no arquivo', cor: 'muted', icone: '❓' },
};

const doPeriodo = (o, de, ate) => !!o.data && o.data >= de && o.data <= ate;

export async function resumo({ de, ate }) {
  const orcamentos = (await store.orcamentos.listar()).filter((o) => doPeriodo(o, de, ate));

  const grupos = new Map(Object.keys(SITUACOES).map((k) => [k, { situacao: k, quantidade: 0, valor: 0 }]));
  for (const o of orcamentos) {
    const g = grupos.get(o.situacao || 'desconhecida');
    g.quantidade += 1;
    g.valor += o.valorTotal || 0;
  }
  const lista = [...grupos.values()].map((g) => ({ ...g, valor: cents(g.valor) }));

  const total = cents(sum(orcamentos, (o) => o.valorTotal || 0));
  const convertido = lista.find((g) => g.situacao === 'convertido');
  const perdido = lista.find((g) => g.situacao === 'perdido');
  const aberto = lista.find((g) => g.situacao === 'aberto');
  const decididos = convertido.quantidade + perdido.quantidade;
  const semSituacao = lista.find((g) => g.situacao === 'desconhecida');

  /**
   * CEM POR CENTO DE CONVERSÃO ERA UM ERRO DE DIVISÃO, NÃO UMA BOA NOTÍCIA.
   *
   * "A gente fala que a conversão é 100 por cento. Tá errada, precisa arrumar."
   *
   * A taxa dividia os convertidos pelos DECIDIDOS (convertidos + perdidos). A
   * ideia era justa: orçamento em aberto ainda pode virar venda, e contá-lo como
   * perda seria antecipar um fato. Só que o sistema dela NUNCA marca um
   * orçamento como perdido — ele aprova ou deixa em aberto para sempre. Com
   * perdidos = 0, a divisão era convertidos ÷ convertidos: 100%, todo mês, para
   * qualquer empresa, independente de quanto foi orçado.
   *
   * É o pior tipo de erro deste app: não dava erro, e o número errado era
   * redondo e bonito.
   *
   * O número que vale passou a ser o que não depende de o arquivo marcar perda:
   * quanto do que foi ORÇADO já virou venda. A taxa sobre os decididos continua
   * existindo, mas só aparece quando o arquivo realmente produz perdas — e,
   * quando não produz, a tela diz por que ela sumiu.
   */
  const arquivoMarcaPerda = perdido.quantidade > 0;
  const naoDecididos = aberto.quantidade + semSituacao.quantidade;

  return {
    de,
    ate,
    quantidade: orcamentos.length,
    total,
    ticketMedio: orcamentos.length ? cents(total / orcamentos.length) : 0,
    grupos: lista.filter((g) => g.quantidade > 0),
    /* convertidos sobre TUDO que foi orçado no período — é a conversão até aqui */
    taxa: orcamentos.length ? (convertido.quantidade / orcamentos.length) * 100 : null,
    taxaValor: total ? (convertido.valor / total) * 100 : null,
    /* e a antiga, sobre o que já foi decidido, só quando o arquivo decide */
    taxaDecididos: arquivoMarcaPerda && decididos
      ? (convertido.quantidade / decididos) * 100 : null,
    taxaValorDecididos: arquivoMarcaPerda && (convertido.valor + perdido.valor)
      ? (convertido.valor / (convertido.valor + perdido.valor)) * 100 : null,
    arquivoMarcaPerda,
    naoDecididos,
    decididos,
    convertido,
    perdido,
    aberto,
    semSituacao: semSituacao.quantidade,
    porCliente: rankearClientes(orcamentos),
    abertos: orcamentos
      .filter((o) => o.situacao === 'aberto')
      .sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0)),
  };
}

function rankearClientes(orcamentos) {
  const mapa = new Map();
  for (const o of orcamentos) {
    const chave = o.clienteId || o.clienteNome || 'sem';
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        nome: o.clienteNome || 'não identificado', quantidade: 0, valor: 0, convertidos: 0, valorConvertido: 0,
      });
    }
    const c = mapa.get(chave);
    c.quantidade += 1;
    c.valor += o.valorTotal || 0;
    if (o.situacao === 'convertido') {
      c.convertidos += 1;
      c.valorConvertido += o.valorTotal || 0;
    }
  }
  return [...mapa.values()]
    .map((c) => ({
      ...c,
      valor: cents(c.valor),
      valorConvertido: cents(c.valorConvertido),
      taxa: c.quantidade ? (c.convertidos / c.quantidade) * 100 : null,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/** Série mensal: orçado x o que o sistema marcou como virado venda. */
export async function porMes(quantidade = 6, referencia = new Date().toISOString().slice(0, 10)) {
  const orcamentos = await store.orcamentos.listar();
  const meses = [];
  const base = new Date(`${referencia.slice(0, 7)}-01T00:00:00Z`);
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    meses.push(monthKey(d.toISOString().slice(0, 10)));
  }
  return meses.map((mes) => {
    const doMes = orcamentos.filter((o) => o.mes === mes);
    const convertidos = doMes.filter((o) => o.situacao === 'convertido');
    return {
      mes,
      orcado: cents(sum(doMes, (o) => o.valorTotal || 0)),
      convertido: cents(sum(convertidos, (o) => o.valorTotal || 0)),
      quantidade: doMes.length,
    };
  });
}
