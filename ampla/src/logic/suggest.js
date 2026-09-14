/**
 * SUGESTÃO DE VÍNCULO NF ↔ PEDIDO
 *
 * O relatório de pedidos da AMPLA não traz a NF gerada. Quando a NF também
 * não traz o número do pedido, não existe chave comum — e o app não inventa.
 *
 * O que ele faz aqui é diferente de adivinhar: procura os pedidos que PODEM ser
 * daquela nota (mesmo cliente, data anterior à emissão, dentro da janela) e
 * apresenta para você confirmar. Nada é gravado sem um clique seu, e o que for
 * confirmado fica registrado como decisão sua, com o pedido que a originou.
 *
 * Como cada NF tem um vendedor só (não há rateio), um pedido confirmado resolve
 * a nota inteira.
 */

import * as store from '../core/store.js';
import { daysBetween } from '../core/format.js';
import { cents, sortBy, digits } from '../core/util.js';
import { valeParaFaturamento } from './revenue.js';
import { recalcular, porQueSemVendedor } from './link.js';

/** Quantos dias antes da emissão ainda vale procurar o pedido. */
export const JANELA_PADRAO = 90;

export const CONFIANCA = {
  exata: {
    label: 'Mesmo cliente e mesmo valor',
    detalhe: 'Um único pedido do mesmo cliente bate com o valor da nota.',
    cor: 'ok',
    sugerir: true,
  },
  unica: {
    label: 'Único pedido do cliente',
    detalhe: 'O valor não bate, mas é o único pedido em aberto desse cliente na janela.',
    cor: 'atencao',
    sugerir: false,
  },
  varias: {
    label: 'Mais de um candidato',
    detalhe: 'Escolha qual pedido gerou esta nota.',
    cor: 'info',
    sugerir: false,
  },
  nenhuma: {
    label: 'Nenhum pedido candidato',
    detalhe: 'Defina o vendedor à mão.',
    cor: 'neutro',
    sugerir: false,
  },
};

/**
 * Monta as sugestões para todas as NFs sem vendedor.
 * @returns {Promise<Array>} uma entrada por NF, com candidatos e confiança
 */
export async function sugestoes({ janelaDias = JANELA_PADRAO, mes = null } = {}) {
  const [nfs, pedidos, vendedores] = await Promise.all([
    store.nfs.listar(), store.pedidos.listar(), store.vendedores.listar(),
  ]);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));

  // pedidos já usados por alguma NF não entram como candidatos de novo
  const pedidosUsados = new Set(nfs.map((n) => n.pedidoId).filter(Boolean));
  const disponiveis = pedidos.filter((p) => p.vendedorId && !pedidosUsados.has(p.id));

  const pedidoPorNumero = new Map(pedidos.map((p) => [String(p.numero), p]));
  const porCliente = new Map();
  for (const pedido of disponiveis) {
    const chave = chaveCliente(pedido);
    if (!chave) continue;
    if (!porCliente.has(chave)) porCliente.set(chave, []);
    porCliente.get(chave).push(pedido);
  }

  const alvo = nfs.filter((nf) => valeParaFaturamento(nf) && !nf.vendedorId && (!mes || nf.mes === mes));

  return sortBy(alvo.map((nf) => {
    const candidatos = (porCliente.get(chaveCliente(nf)) || [])
      .filter((pedido) => {
        if (!pedido.data || !nf.dataEmissao) return false;
        const dias = daysBetween(pedido.data, nf.dataEmissao);
        return dias >= 0 && dias <= janelaDias;
      })
      .map((pedido) => ({
        pedido,
        vendedorNome: nomeVendedor.get(pedido.vendedorId) || pedido.vendedorNome || 'Vendedor',
        diasAntes: daysBetween(pedido.data, nf.dataEmissao),
        diferenca: pedido.valorTotal == null ? null : cents((nf.valorTotal || 0) - pedido.valorTotal),
        mesmoValor: pedido.valorTotal != null && Math.abs(cents((nf.valorTotal || 0) - pedido.valorTotal)) < 0.01,
      }));

    const fortes = candidatos.filter((c) => c.mesmoValor);
    let confianca = 'nenhuma';
    let melhor = null;

    if (fortes.length === 1) { confianca = 'exata'; [melhor] = fortes; } else if (fortes.length > 1) { confianca = 'varias'; }
    else if (candidatos.length === 1) { confianca = 'unica'; [melhor] = candidatos; } else if (candidatos.length > 1) { confianca = 'varias'; }

    // por que esta nota está sem vendedor — é o que diz o que fazer com ela
    const { motivo, explicacao } = porQueSemVendedor(nf, pedidoPorNumero);

    return {
      nf,
      candidatos: sortBy(candidatos, (c) => [c.mesmoValor ? 0 : 1, c.diasAntes].join('|')),
      melhor,
      confianca,
      motivo,
      explicacao,
      sugerido: CONFIANCA[confianca].sugerir && !!melhor,
    };
  }), (s) => [CONFIANCA[s.confianca].sugerir ? 0 : 1, s.nf.dataEmissao].join('|'));
}

/**
 * Cliente da NF e do pedido são o mesmo?
 * O `clienteId` já é derivado do CNPJ/CPF quando ele existe (ver store.idCliente),
 * então ele é a chave comum entre as duas bases. O documento é só o plano B.
 */
function chaveCliente(registro) {
  if (registro.clienteId) return registro.clienteId;
  const doc = digits(registro.clienteDoc);
  return doc.length >= 11 ? `doc:${doc}` : null;
}

/**
 * Confirma o vínculo escolhido. O vendedor passa a ser o do pedido, marcado
 * como decisão confirmada — nem uma reimportação nem o recálculo desfazem.
 */
export async function confirmar(nfId, pedidoId, { motivo } = {}) {
  const [nf, pedido] = await Promise.all([store.nfs.obter(nfId), store.pedidos.obter(pedidoId)]);
  if (!nf) throw new Error('NF não encontrada.');
  if (!pedido) throw new Error('Pedido não encontrado.');
  if (!pedido.vendedorId) throw new Error('Este pedido não tem vendedor.');

  await store.nfs.salvar({
    ...nf,
    pedidoId: pedido.id,
    pedidoNumero: pedido.numero,
    pedidoOrigem: 'confirmado',
    vendedorId: pedido.vendedorId,
    vendedorOrigem: 'pedido-confirmado',
    vendedorDefinidoEm: Date.now(),
  });
  await store.registrar('vinculo_nf_pedido', {
    alvoId: nf.id,
    alvo: `NF ${nf.numero}`,
    de: nf.pedidoNumero || null,
    para: `pedido ${pedido.numero}`,
    motivo: motivo || `confirmado na tela de sugestões (${pedido.vendedorNome || 'vendedor do pedido'})`,
  });
  return { nf, pedido };
}

/**
 * Confirma vários de uma vez (a lista que você marcou na tela).
 * Recalcula uma única vez no fim.
 */
export async function confirmarVarios(pares, { motivo } = {}) {
  let feitos = 0;
  const erros = [];
  for (const { nfId, pedidoId } of pares) {
    try {
      await confirmar(nfId, pedidoId, { motivo });
      feitos += 1;
    } catch (err) {
      erros.push({ nfId, motivo: err.message });
    }
  }
  if (feitos) await recalcular();
  return { feitos, erros };
}

/** Desfaz um vínculo confirmado (volta a NF para "sem vendedor"). */
export async function desfazer(nfId, motivo) {
  const nf = await store.nfs.obter(nfId);
  if (!nf) return;
  await store.nfs.salvar({
    ...nf,
    pedidoId: null,
    pedidoOrigem: null,
    vendedorId: null,
    vendedorOrigem: null,
    vendedorDefinidoEm: null,
  });
  await store.registrar('vinculo_nf_pedido_desfeito', {
    alvoId: nf.id, alvo: `NF ${nf.numero}`, de: nf.pedidoNumero, para: null, motivo,
  });
  await recalcular();
}

/**
 * Pedidos que as NFs citam mas que não estão na base.
 *
 * É a lista mais útil da tela: como a NF traz o número do pedido, basta exportar
 * estes pedidos do relatório de vendedores para o vínculo fechar sozinho.
 */
export async function pedidosFaltando() {
  const [nfs, pedidos] = await Promise.all([store.nfs.listar(), store.pedidos.listar()]);
  const existentes = new Set(pedidos.map((p) => String(p.numero)));
  const mapa = new Map();

  for (const nf of nfs) {
    if (!valeParaFaturamento(nf) || nf.vendedorId || !nf.pedidoNumero) continue;
    const numero = String(nf.pedidoNumero);
    if (existentes.has(numero)) continue;
    if (!mapa.has(numero)) mapa.set(numero, { numero, notas: [], valor: 0, de: nf.dataEmissao, ate: nf.dataEmissao });
    const linha = mapa.get(numero);
    linha.notas.push(nf.numero);
    linha.valor = cents(linha.valor + (nf.valorTotal || 0));
    if (nf.dataEmissao < linha.de) linha.de = nf.dataEmissao;
    if (nf.dataEmissao > linha.ate) linha.ate = nf.dataEmissao;
  }
  return sortBy([...mapa.values()], (x) => Number(x.numero) || x.numero);
}

/** Resumo curto para a tela de conciliação. */
export async function resumo(opcoes) {
  const [lista, faltando] = await Promise.all([sugestoes(opcoes), pedidosFaltando()]);
  return {
    total: lista.length,
    sugeridas: lista.filter((s) => s.sugerido).length,
    escolher: lista.filter((s) => s.confianca === 'varias' || s.confianca === 'unica').length,
    semCandidato: lista.filter((s) => s.confianca === 'nenhuma').length,
    pedidosFaltando: faltando.length,
  };
}
