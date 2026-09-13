/**
 * VÍNCULOS E CONTROLE DE QUALIDADE
 *
 * Aqui mora a regra mais delicada do projeto (item 4): o faturamento é da NOTA
 * FISCAL, mas o vendedor é do PEDIDO. Este módulo liga as duas pontas e, quando
 * não consegue ligar com certeza, NÃO inventa: gera uma pendência para resolver
 * à mão na tela de Conciliação.
 *
 * Ordem de confiança para descobrir o vendedor de uma NF:
 *   1. decidido por você no app — definido à mão ou vínculo de pedido
 *      confirmado na tela de sugestões (vence tudo, e fica registrado)
 *   2. vendedor que veio no próprio relatório de NFs
 *   3. pedido informado na NF  → vendedor do pedido
 *   4. pedido que aponta para esta NF → vendedor do pedido
 *   5. nenhuma das anteriores → ⚠️ NF SEM VENDEDOR
 */

import * as store from '../core/store.js';
import { today, monthKey, money, formatDate } from '../core/format.js';
import { normalize, docNumber, sameMoney, cents, sum } from '../core/util.js';

export const TIPOS_PENDENCIA = {
  nf_sem_vendedor: {
    titulo: 'NF sem vendedor',
    icone: '🎯',
    gravidade: 'alta',
    explicacao: 'A nota está no faturamento, mas ninguém recebe a comissão dela.',
  },
  divergencia_faturamento: {
    titulo: 'Faturamento fiscal ≠ soma dos vendedores',
    icone: '⚖️',
    gravidade: 'alta',
    explicacao: 'O total das notas do mês não bate com o total atribuído aos vendedores.',
  },
  receber_sem_nf: {
    titulo: 'Título sem NF identificada',
    icone: '🔗',
    gravidade: 'media',
    explicacao: 'O título cita uma NF que não existe na base (ou existe mais de uma com esse número).',
  },
  extrato_sem_vinculo: {
    titulo: 'Movimento bancário sem vínculo',
    icone: '🏦',
    gravidade: 'media',
    explicacao: 'Entrou ou saiu dinheiro e o app não achou o título correspondente.',
  },
  pago_sem_banco: {
    titulo: 'Título pago sem movimento no banco',
    icone: '❓',
    gravidade: 'media',
    explicacao: 'O título está baixado, mas não há lançamento equivalente no extrato.',
  },
  item_sem_nf: {
    titulo: 'Item sem nota correspondente',
    icone: '📦',
    gravidade: 'baixa',
    explicacao: 'Chegou item de uma NF que ainda não foi importada.',
  },
  produto_sem_custo: {
    titulo: 'Produto vendido sem custo cadastrado',
    icone: '🏷️',
    gravidade: 'baixa',
    explicacao: 'Sem custo o app mostra faturamento, mas não calcula margem.',
  },
  pagar_sem_categoria: {
    titulo: 'Pagamento sem categoria',
    icone: '🗂️',
    gravidade: 'baixa',
    explicacao: 'Atrapalha a visão de onde o dinheiro está indo.',
  },
};

/**
 * Refaz todos os vínculos derivados. É chamado depois de cada importação e
 * pode ser chamado à mão. Não altera nada que o usuário tenha decidido.
 */
export async function recalcular() {
  const [nfs, pedidos, itens, titulos, pagamentos, movimentos, vendedores, produtos] = await Promise.all([
    store.nfs.listar(), store.pedidos.listar(), store.nfItens.listar(), store.receber.listar(),
    store.pagar.listar(), store.extrato.listar(), store.vendedores.listar(), store.produtos.listar(),
  ]);

  const porNome = indiceVendedores(vendedores);
  const novosVendedores = [];

  /* 1. pedidos: nome do vendedor → cadastro (criando quem ainda não existe) */
  const pedidosAtualizados = [];
  for (const pedido of pedidos) {
    const achado = resolverVendedor(pedido.vendedorNome, porNome, novosVendedores);
    if (achado && pedido.vendedorId !== achado.id) {
      pedidosAtualizados.push({ ...pedido, vendedorId: achado.id });
    }
  }
  for (const p of pedidosAtualizados) {
    const i = pedidos.findIndex((x) => x.id === p.id);
    if (i >= 0) pedidos[i] = p;
  }

  /* 2. índices de pedido */
  const pedidoPorNumero = new Map();
  const pedidoPorNf = new Map();
  for (const pedido of pedidos) {
    if (pedido.numero) pedidoPorNumero.set(String(pedido.numero), pedido);
    if (pedido.nfNumero) {
      const k = String(pedido.nfNumero);
      if (pedidoPorNf.has(k)) pedidoPorNf.set(k, 'ambiguo');
      else pedidoPorNf.set(k, pedido);
    }
  }

  /* 3. NFs: vendedor e mês de faturamento */
  const nfsAtualizadas = [];
  for (const nf of nfs) {
    const antes = { vendedorId: nf.vendedorId, vendedorOrigem: nf.vendedorOrigem, pedidoId: nf.pedidoId };
    const resolvido = resolverVendedorDaNf(nf, { porNome, pedidoPorNumero, pedidoPorNf, novosVendedores });
    const mes = nf.dataEmissao ? monthKey(nf.dataEmissao) : null;
    if (resolvido.vendedorId !== antes.vendedorId || resolvido.vendedorOrigem !== antes.vendedorOrigem
      || resolvido.pedidoId !== antes.pedidoId || nf.mes !== mes) {
      nfsAtualizadas.push({ ...nf, ...resolvido, mes });
    }
  }
  for (const n of nfsAtualizadas) {
    const i = nfs.findIndex((x) => x.id === n.id);
    if (i >= 0) nfs[i] = n;
  }

  /* 4. itens: herdam data/mês da nota (o item sozinho não tem data confiável) */
  const nfPorId = new Map(nfs.map((n) => [n.id, n]));
  const itensAtualizados = [];
  for (const item of itens) {
    const nf = nfPorId.get(item.nfId);
    if (!nf) continue;
    const custoTotal = item.custoTotal != null ? item.custoTotal
      : (item.custoUnitario != null ? cents(item.custoUnitario * (item.quantidade || 0)) : null);
    if (item.data !== nf.dataEmissao || item.mes !== nf.mes || item.vendedorId !== nf.vendedorId
      || item.custoTotal !== custoTotal || item.nfStatus !== nf.status) {
      itensAtualizados.push({
        ...item,
        data: nf.dataEmissao,
        mes: nf.mes,
        vendedorId: nf.vendedorId || null,
        clienteId: nf.clienteId || null,
        nfStatus: nf.status,
        nfDevolucao: !!nf.devolucao,
        custoTotal,
      });
    }
  }

  /* 5. contas a receber: liga na NF e herda o vendedor */
  const nfsPorNumero = new Map();
  for (const nf of nfs) {
    const k = String(docNumber(nf.numero) || nf.numero);
    if (!nfsPorNumero.has(k)) nfsPorNumero.set(k, []);
    nfsPorNumero.get(k).push(nf);
  }
  const titulosAtualizados = [];
  for (const titulo of titulos) {
    let nfId = titulo.nfId || null;
    let vendedorId = titulo.vendedorId || null;
    if (titulo.nfNumero) {
      const candidatas = nfsPorNumero.get(String(titulo.nfNumero)) || [];
      // só liga quando não há dúvida: uma única NF com aquele número
      if (candidatas.length === 1) nfId = candidatas[0].id;
    }
    const nf = nfId ? nfPorId.get(nfId) : null;
    if (nf?.vendedorId) vendedorId = nf.vendedorId;
    else if (!vendedorId && titulo.vendedorNome) {
      vendedorId = resolverVendedor(titulo.vendedorNome, porNome, novosVendedores)?.id || null;
    }
    const status = statusTitulo(titulo);
    if (nfId !== titulo.nfId || vendedorId !== titulo.vendedorId || status !== titulo.status) {
      titulosAtualizados.push({ ...titulo, nfId, vendedorId, status });
    }
  }

  /* 6. conciliação bancária: só o que casa sem ambiguidade */
  const conciliacao = conciliar(movimentos, titulos, pagamentos);

  /* 7. grava tudo de uma vez */
  await store.salvarLote({
    vendedores: novosVendedores,
    pedidos: pedidosAtualizados,
    nfs: nfsAtualizadas,
    nfItens: itensAtualizados,
    receber: titulosAtualizados,
    extrato: conciliacao.movimentos,
  });

  /* 8. pendências */
  const pendencias = await gerarPendencias({ nfs, itens, titulos: titulos.map((t) => titulosAtualizados.find((x) => x.id === t.id) || t), pagamentos, movimentos: conciliacao.movimentos.length ? mesclarPorId(movimentos, conciliacao.movimentos) : movimentos, produtos });

  return {
    vendedoresCriados: novosVendedores.length,
    nfsAtualizadas: nfsAtualizadas.length,
    titulosLigados: titulosAtualizados.length,
    conciliados: conciliacao.movimentos.filter((m) => m.conciliacaoStatus === 'conciliado').length,
    pendencias: pendencias.abertas,
  };
}

function mesclarPorId(base, novos) {
  const mapa = new Map(base.map((b) => [b.id, b]));
  for (const n of novos) mapa.set(n.id, n);
  return [...mapa.values()];
}

/* ------------------------------------------------------------------ vendedor */

function indiceVendedores(vendedores) {
  const mapa = new Map();
  for (const v of vendedores) {
    mapa.set(normalize(v.nome), v);
    for (const a of v.apelidos || []) mapa.set(normalize(a), v);
    if (v.codigo) mapa.set(normalize(v.codigo), v);
  }
  return mapa;
}

/**
 * O nome que veio no arquivo é dado, não suposição: se ainda não existe
 * vendedor com aquele nome, o cadastro é criado. O que nunca acontece é
 * "parecer" com outro nome e ser ligado por semelhança.
 */
function resolverVendedor(nome, porNome, novos) {
  const alvo = normalize(nome);
  if (!alvo) return null;
  if (porNome.has(alvo)) return porNome.get(alvo);
  const novo = {
    id: `vend_${alvo.replace(/[^a-z0-9]/g, '').slice(0, 24) || Date.now().toString(36)}`,
    nome: String(nome).trim(),
    apelidos: [],
    ativo: true,
    criadoEm: Date.now(),
    origem: 'importacao',
  };
  porNome.set(alvo, novo);
  novos.push(novo);
  return novo;
}

/** Origens que vieram de uma decisão sua: o recálculo não mexe nelas. */
const DECIDIDO_POR_VOCE = new Set(['manual', 'pedido-confirmado']);

function resolverVendedorDaNf(nf, { porNome, pedidoPorNumero, pedidoPorNf, novosVendedores }) {
  if (DECIDIDO_POR_VOCE.has(nf.vendedorOrigem) && nf.vendedorId) {
    return { vendedorId: nf.vendedorId, vendedorOrigem: nf.vendedorOrigem, pedidoId: nf.pedidoId || null };
  }
  if (nf.vendedorNome) {
    const v = resolverVendedor(nf.vendedorNome, porNome, novosVendedores);
    if (v) return { vendedorId: v.id, vendedorOrigem: 'nf', pedidoId: nf.pedidoId || null };
  }
  if (nf.pedidoNumero) {
    const pedido = pedidoPorNumero.get(String(nf.pedidoNumero));
    if (pedido?.vendedorId) return { vendedorId: pedido.vendedorId, vendedorOrigem: 'pedido', pedidoId: pedido.id };
  }
  const numero = String(docNumber(nf.numero) || nf.numero);
  const porNf = pedidoPorNf.get(numero);
  if (porNf && porNf !== 'ambiguo' && porNf.vendedorId) {
    return { vendedorId: porNf.vendedorId, vendedorOrigem: 'pedido-nf', pedidoId: porNf.id };
  }
  return { vendedorId: null, vendedorOrigem: null, pedidoId: null };
}

/* -------------------------------------------------------------------- título */

export function statusTitulo(titulo) {
  if (titulo.status === 'cancelado') return 'cancelado';
  if (titulo.dataRecebimento || (titulo.saldo != null && titulo.saldo <= 0)) return 'pago';
  return 'aberto';
}

export function emAtraso(titulo, referencia = today()) {
  return statusTitulo(titulo) === 'aberto' && titulo.vencimento < referencia;
}

export function diasAtraso(titulo, referencia = today()) {
  if (!emAtraso(titulo, referencia)) return 0;
  return Math.round((new Date(`${referencia}T12:00`) - new Date(`${titulo.vencimento}T12:00`)) / 86400000);
}

/* --------------------------------------------------------------- conciliação */

/**
 * Casa extrato com títulos. Regra dura: só concilia sozinho quando existe
 * exatamente UM candidato com mesmo valor e mesma data. Qualquer dúvida
 * (dois títulos iguais, valor agrupado, data diferente) fica pendente.
 */
function conciliar(movimentos, titulos, pagamentos) {
  const recebidosPorChave = new Map();
  for (const t of titulos) {
    if (statusTitulo(t) !== 'pago' || !t.dataRecebimento) continue;
    const valor = t.valorRecebido != null ? t.valorRecebido : t.valor;
    empilharChave(recebidosPorChave, `${t.dataRecebimento}|${cents(valor)}`, t);
  }
  const pagosPorChave = new Map();
  for (const p of pagamentos) {
    if (p.status !== 'pago' || !p.dataPagamento) continue;
    const valor = p.valorPago != null ? p.valorPago : p.valor;
    empilharChave(pagosPorChave, `${p.dataPagamento}|${cents(valor)}`, p);
  }

  const atualizados = [];
  for (const mov of movimentos) {
    if (mov.conciliacaoStatus === 'conciliado' || mov.conciliacaoStatus === 'ignorado') continue;
    const chave = `${mov.data}|${cents(Math.abs(mov.valor))}`;
    const candidatos = mov.valor >= 0 ? recebidosPorChave.get(chave) : pagosPorChave.get(chave);
    if (candidatos && candidatos.length === 1) {
      const alvo = candidatos[0];
      atualizados.push({
        ...mov,
        conciliacaoStatus: 'conciliado',
        conciliadoCom: { tipo: mov.valor >= 0 ? 'receber' : 'pagar', id: alvo.id, descricao: alvo.clienteNome || alvo.fornecedorNome },
        conciliadoEm: Date.now(),
        conciliadoPor: 'automatico',
      });
    }
  }
  return { movimentos: atualizados };
}

function empilharChave(mapa, chave, valor) {
  if (!mapa.has(chave)) mapa.set(chave, []);
  mapa.get(chave).push(valor);
}

/* --------------------------------------------------------------- pendências */

async function gerarPendencias({ nfs, itens, titulos, pagamentos, movimentos, produtos }) {
  const anteriores = await store.pendencias.listar();
  const ignoradas = new Map(anteriores.filter((p) => p.status === 'ignorada').map((p) => [p.id, p]));
  const encontradas = [];

  const nova = (tipo, ref, dados) => {
    const id = `pend_${tipo}_${ref}`;
    const antiga = ignoradas.get(id);
    encontradas.push({
      id,
      tipo,
      ref,
      status: antiga ? 'ignorada' : 'aberta',
      motivoIgnorada: antiga?.motivoIgnorada || null,
      criadaEm: anteriores.find((p) => p.id === id)?.criadaEm || Date.now(),
      ...dados,
    });
  };

  for (const nf of nfs) {
    if (nf.status === 'cancelada' || nf.operacao === 'entrada') continue;
    if (!nf.vendedorId) {
      nova('nf_sem_vendedor', nf.id, {
        titulo: `NF ${nf.numero}`,
        detalhe: `${nf.clienteNome || 'cliente não identificado'} · emissão ${formatDate(nf.dataEmissao)}`,
        valor: nf.valorTotal,
        mes: nf.mes,
        alvo: { store: 'nfs', id: nf.id },
      });
    }
  }

  const nfIds = new Set(nfs.map((n) => n.id));
  const itensOrfaos = itens.filter((i) => !nfIds.has(i.nfId));
  if (itensOrfaos.length) {
    nova('item_sem_nf', 'geral', {
      titulo: `${itensOrfaos.length} item(ns) sem a NF correspondente`,
      detalhe: 'Importe o XML ou o relatório de notas do mesmo período.',
      valor: sum(itensOrfaos, (i) => i.valorTotal),
      quantidade: itensOrfaos.length,
    });
  }

  for (const t of titulos) {
    if (t.nfNumero && !t.nfId) {
      nova('receber_sem_nf', t.id, {
        titulo: `Título ${t.documento} cita a NF ${t.nfNumero}`,
        detalhe: `${t.clienteNome} · vence ${formatDate(t.vencimento)}`,
        valor: t.valor,
        alvo: { store: 'receber', id: t.id },
      });
    }
  }

  const semVinculo = movimentos.filter((m) => m.conciliacaoStatus === 'pendente');
  for (const mov of semVinculo) {
    nova('extrato_sem_vinculo', mov.id, {
      titulo: `${mov.valor >= 0 ? 'Entrada' : 'Saída'} de ${money(Math.abs(mov.valor))}`,
      detalhe: `${mov.descricao || 'sem descrição'} · ${formatDate(mov.data)}`,
      valor: Math.abs(mov.valor),
      alvo: { store: 'extrato', id: mov.id },
    });
  }

  const conciliadosIds = new Set(movimentos.filter((m) => m.conciliadoCom).map((m) => `${m.conciliadoCom.tipo}:${m.conciliadoCom.id}`));
  for (const t of titulos) {
    if (statusTitulo(t) === 'pago' && t.dataRecebimento && !conciliadosIds.has(`receber:${t.id}`)) {
      nova('pago_sem_banco', t.id, {
        titulo: `${t.clienteNome} — título ${t.documento}`,
        detalhe: `baixado em ${formatDate(t.dataRecebimento)}, sem lançamento igual no extrato`,
        valor: t.valorRecebido ?? t.valor,
        alvo: { store: 'receber', id: t.id },
      });
    }
  }

  const semCategoria = pagamentos.filter((p) => p.status !== 'pago' && !p.categoria);
  if (semCategoria.length) {
    nova('pagar_sem_categoria', 'geral', {
      titulo: `${semCategoria.length} pagamento(s) em aberto sem categoria`,
      detalhe: 'Atrapalha a visão de para onde o dinheiro está indo.',
      valor: sum(semCategoria, (p) => p.valor),
      quantidade: semCategoria.length,
    });
  }

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const vendidosSemCusto = new Set();
  for (const item of itens) {
    if (item.custoTotal != null) continue;
    const prod = produtoPorId.get(item.produtoId);
    if (prod && prod.custo != null) continue;
    vendidosSemCusto.add(item.produtoId);
  }
  if (vendidosSemCusto.size) {
    nova('produto_sem_custo', 'geral', {
      titulo: `${vendidosSemCusto.size} produto(s) vendidos sem custo cadastrado`,
      detalhe: 'A margem fica em branco para eles — o app não estima custo.',
      quantidade: vendidosSemCusto.size,
    });
  }

  // divergência faturamento fiscal x atribuído, mês a mês
  const meses = new Map();
  for (const nf of nfs) {
    if (!nf.mes || nf.status === 'cancelada' || nf.operacao === 'entrada') continue;
    if (!meses.has(nf.mes)) meses.set(nf.mes, { fiscal: 0, atribuido: 0 });
    const valor = nf.devolucao ? -nf.valorTotal : nf.valorTotal;
    meses.get(nf.mes).fiscal += valor;
    if (nf.vendedorId) meses.get(nf.mes).atribuido += valor;
  }
  for (const [mes, v] of meses) {
    if (!sameMoney(v.fiscal, v.atribuido, 1)) {
      nova('divergencia_faturamento', mes, {
        titulo: `${mes}: diferença de ${money(cents(v.fiscal - v.atribuido))}`,
        detalhe: `fiscal ${money(v.fiscal)} × vendedores ${money(v.atribuido)}`,
        valor: cents(v.fiscal - v.atribuido),
        mes,
      });
    }
  }

  // grava: pendências que sumiram são apagadas (resolvidas de fato)
  const idsAtuais = new Set(encontradas.map((p) => p.id));
  const remover = anteriores.filter((p) => !idsAtuais.has(p.id)).map((p) => p.id);
  await store.pendencias.removerMuitos(remover);
  await store.pendencias.salvarMuitos(encontradas);

  return {
    total: encontradas.length,
    abertas: encontradas.filter((p) => p.status === 'aberta').length,
    resolvidas: remover.length,
  };
}

/** Define o vendedor de uma NF à mão — com registro de quem, quando e por quê. */
export async function definirVendedorDaNf(nfId, vendedorId, motivo) {
  const nf = await store.nfs.obter(nfId);
  if (!nf) throw new Error('NF não encontrada.');
  const antes = nf.vendedorId;
  await store.nfs.salvar({ ...nf, vendedorId, vendedorOrigem: 'manual', vendedorDefinidoEm: Date.now() });
  await store.registrar('vendedor_da_nf', {
    alvoId: nfId, alvo: `NF ${nf.numero}`, de: antes, para: vendedorId, motivo,
  });
  await recalcular();
}
