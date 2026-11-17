/**
 * VENDAS DIGITADAS — o faturamento do outro CNPJ.
 *
 * "Eu tenho mais um CNPJ que acaba entrando na parte de vendas. Eu queria uma
 *  aba dentro do comercial onde eu pudesse adicionar quando o vendedor vendeu,
 *  qual é o valor do cimento, se teve frete, o valor total — pra ficar certinho
 *  o faturamento e ficar mais fácil fazer a comissão."
 *
 * Até aqui o app só lia arquivo: "eu vou alimentar ele, mas eu não vou fazer
 * nenhum ajuste nele". Esta é a exceção, e ela tem um motivo concreto — o
 * Gestão Click exporta só o CNPJ principal, então a venda do outro não chega
 * por relatório nenhum. Sem digitar, ela simplesmente não existe.
 *
 * O QUE ISTO GRAVA, e por que importa:
 *
 *  • uma NOTA FISCAL de verdade, com empresaId e origem 'manual'. Daí em diante
 *    ela passa por valeParaFaturamento como qualquer outra: entra no comercial,
 *    no ranking do vendedor e na comissão, sem caminho paralelo nenhum.
 *  • um PEDIDO, quando ela informa o custo. É assim que o custo entra na margem
 *    sem inventar uma segunda fonte de custo: o caminho é o mesmo das vendas
 *    importadas — a nota pergunta ao pedido quanto custou.
 *  • um ITEM, quando ela descreve o produto. Sem item a nota entra no
 *    faturamento mas fica fora da base da margem, com o valor à vista, que é o
 *    comportamento que o app já explica em reais na tela.
 *
 * O que ela digita NUNCA é tocado por importação: as notas e os pedidos criados
 * aqui têm origem 'manual' e id com prefixo próprio, então nenhum arquivo
 * reenviado sobrescreve ou apaga.
 */

import * as store from '../core/store.js';
import { cents, normalize, uid } from '../core/util.js';
import { monthKey, today } from '../core/format.js';
import { EMPRESA_PRINCIPAL } from './revenue.js';

const PREFIXO_NF = 'nfman_';
const PREFIXO_PEDIDO = 'pedman_';
const PREFIXO_ITEM = 'itman_';

/* ------------------------------------------------------------------ empresas */

/** As empresas além da principal. A principal não mora na lista: ver store.js. */
export async function empresas() {
  const cfg = await store.config();
  return (cfg.empresas || []).map((e) => ({ ...e }));
}

/** Principal + as outras, para as telas montarem o seletor. */
export async function todasAsEmpresas() {
  const cfg = await store.config();
  return [
    { id: EMPRESA_PRINCIPAL, nome: cfg.empresa || 'Empresa principal', cnpj: cfg.cnpj || null, principal: true },
    ...(cfg.empresas || []).map((e) => ({ ...e, principal: false })),
  ];
}

export async function salvarEmpresa({ id, nome, cnpj }) {
  const limpo = String(nome || '').trim();
  if (!limpo) throw new Error('A empresa precisa de um nome.');
  const lista = await empresas();
  const quem = id || `emp_${normalize(limpo).replace(/[^a-z0-9]/g, '').slice(0, 20) || uid()}`;
  if (quem === EMPRESA_PRINCIPAL) throw new Error('Esse id é reservado à empresa principal.');

  const atual = lista.find((e) => e.id === quem);
  const nova = { id: quem, nome: limpo, cnpj: String(cnpj || '').trim() || null };
  const salvas = atual ? lista.map((e) => (e.id === quem ? nova : e)) : [...lista, nova];
  await store.salvarConfig({ empresas: salvas });
  await store.registrar('empresa_salva', { alvoId: quem, alvo: limpo });
  return nova;
}

/**
 * Apagar uma empresa com venda lançada apagaria o faturamento dela sem dizer.
 * O app recusa e diz quantas notas estão presas — tirar a empresa é decisão
 * dela, mas tem de ser tomada sabendo o que sai junto.
 */
export async function removerEmpresa(id) {
  const presas = (await store.nfs.listar()).filter((n) => n.empresaId === id);
  if (presas.length) {
    throw new Error(`Esta empresa tem ${presas.length} venda(s) lançada(s). `
      + 'Apague as vendas primeiro, ou deixe a empresa cadastrada.');
  }
  const lista = (await empresas()).filter((e) => e.id !== id);
  await store.salvarConfig({ empresas: lista });
  await store.registrar('empresa_removida', { alvoId: id });
}

/* -------------------------------------------------------------- lançamentos */

export function ehLancamentoManual(nf) {
  return nf?.origem === 'manual';
}

/** As vendas digitadas do período, da mais nova para a mais antiga. */
export async function lancamentos({ de, ate, empresaId = null } = {}) {
  const [nfs, pedidos, itens, vendedores, lista] = await Promise.all([
    store.nfs.listar(), store.pedidos.listar(), store.nfItens.listar(),
    store.vendedores.listar(), todasAsEmpresas(),
  ]);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const nomeEmpresa = new Map(lista.map((e) => [e.id, e.nome]));
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));
  const itemPorNf = new Map(itens.map((i) => [i.nfId, i]));

  return nfs
    .filter(ehLancamentoManual)
    .filter((n) => (!de || n.dataEmissao >= de) && (!ate || n.dataEmissao <= ate))
    .filter((n) => !empresaId || n.empresaId === empresaId)
    .map((n) => {
      const pedido = n.pedidoId ? pedidoPorId.get(n.pedidoId) : null;
      const item = itemPorNf.get(n.id);
      return {
        id: n.id,
        empresaId: n.empresaId || EMPRESA_PRINCIPAL,
        empresaNome: nomeEmpresa.get(n.empresaId) || 'Empresa',
        numero: n.numero,
        data: n.dataEmissao,
        clienteNome: n.clienteNome,
        clienteDoc: n.clienteDoc,
        vendedorId: n.vendedorId,
        vendedorNome: nomeVendedor.get(n.vendedorId) || n.vendedorNome || null,
        descricao: item?.descricao || n.observacao || null,
        valorProdutos: n.valorProdutos,
        valorFrete: n.valorFrete,
        valorTotal: n.valorTotal,
        custo: pedido ? pedido.valorCusto : null,
        observacao: n.observacao || null,
      };
    })
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || String(b.numero).localeCompare(String(a.numero)));
}

/**
 * Grava uma venda digitada. Devolve a nota criada.
 *
 * O id leva a empresa dentro dele de propósito: os dois CNPJs numeram as notas
 * a partir do 1, e sem isso a nota 42 de um sobrescreveria a nota 42 do outro —
 * silenciosamente, que é o pior jeito de perder faturamento.
 */
export async function salvarVenda(dados) {
  const empresaId = String(dados.empresaId || '').trim();
  if (!empresaId || empresaId === EMPRESA_PRINCIPAL) {
    throw new Error('Escolha de qual empresa é esta venda.');
  }
  const data = dados.data || today();
  const clienteNome = String(dados.clienteNome || '').trim();
  if (!clienteNome) throw new Error('A venda precisa do nome do cliente.');

  const produtos = numero(dados.valorProdutos);
  const frete = numero(dados.valorFrete) || 0;
  const total = numero(dados.valorTotal) ?? cents((produtos || 0) + frete);
  if (!total) throw new Error('A venda precisa de um valor.');

  const numeroNota = String(dados.numero || '').trim();
  const id = dados.id
    || `${PREFIXO_NF}${empresaId}_${numeroNota ? normalize(numeroNota).replace(/[^a-z0-9]/g, '') : uid()}`;

  const anterior = dados.id ? await store.nfs.obter(dados.id) : null;
  const clienteId = store.idCliente({ documento: dados.clienteDoc, nome: clienteNome });

  const nota = {
    ...(anterior || {}),
    id,
    empresaId,
    numero: numeroNota || null,
    serie: null,
    dataEmissao: data,
    mes: monthKey(data),
    clienteId,
    clienteNome,
    clienteDoc: String(dados.clienteDoc || '').trim() || null,
    valorTotal: cents(total),
    valorProdutos: produtos == null ? null : cents(produtos),
    valorFrete: cents(frete),
    operacao: 'saida',
    devolucao: false,
    devolucaoDeCompra: false,
    status: 'autorizada',
    statusArquivo: null,
    vendedorId: dados.vendedorId || null,
    /* 'manual' é o que faz o recálculo não desfazer a escolha dela */
    vendedorOrigem: dados.vendedorId ? 'manual' : null,
    vendedorDefinidoEm: dados.vendedorId ? Date.now() : null,
    observacao: String(dados.observacao || '').trim() || null,
    origem: 'manual',
    lancadaEm: anterior?.lancadaEm || Date.now(),
    atualizadaEm: Date.now(),
  };

  /* o cliente passa a existir no cadastro, como em qualquer nota importada */
  if (clienteId) {
    const existente = await store.clientes.obter(clienteId);
    if (!existente) {
      await store.clientes.salvar({
        id: clienteId, nome: clienteNome, documento: nota.clienteDoc, origem: 'manual',
      });
    }
  }

  /**
   * O CUSTO ENTRA PELO PEDIDO, que é o caminho que a margem já conhece.
   * Sem custo informado não existe pedido: a venda fica "sem custo", à vista,
   * em vez de entrar na margem com um número inventado.
   */
  const custo = numero(dados.custo);
  const pedidoId = `${PREFIXO_PEDIDO}${id.slice(PREFIXO_NF.length)}`;
  if (custo != null) {
    const numeroPedido = `M${numeroNota || id.slice(-6)}`;
    await store.pedidos.salvar({
      id: pedidoId,
      numero: numeroPedido,
      data,
      mes: monthKey(data),
      empresaId,
      clienteId,
      clienteNome,
      valorTotal: cents(total),
      valorCusto: cents(custo),
      vendedorId: dados.vendedorId || null,
      situacao: 'concretizada',
      status: 'Concretizada',
      origem: 'manual',
    });
    nota.pedidoId = pedidoId;
    nota.pedidoNumero = numeroPedido;
    nota.pedidoOrigem = 'manual';
  } else {
    await store.pedidos.remover(pedidoId).catch(() => {});
    nota.pedidoId = null;
    nota.pedidoNumero = null;
    nota.pedidoOrigem = null;
  }

  /**
   * O ITEM existe quando ela descreve o que vendeu. É ele que põe a venda na
   * base da margem e na curva ABC; sem ele a nota entra no faturamento e
   * aparece como "nota sem item detalhado", que é verdade.
   */
  const itemId = `${PREFIXO_ITEM}${id.slice(PREFIXO_NF.length)}`;
  const descricao = String(dados.descricao || '').trim();
  if (descricao && produtos) {
    await store.nfItens.salvar({
      id: itemId,
      nfId: id,
      data,
      nfStatus: 'autorizada',
      empresaId,
      vendedorId: dados.vendedorId || null,
      produtoId: `prodman_${normalize(descricao).replace(/[^a-z0-9]/g, '').slice(0, 24)}`,
      descricao,
      quantidade: numero(dados.quantidade) || 1,
      valorTotal: cents(produtos),
      origem: 'manual',
    });
  } else {
    await store.nfItens.remover(itemId).catch(() => {});
  }

  await store.nfs.salvar(nota);
  await store.registrar(anterior ? 'venda_manual_editada' : 'venda_manual_lancada', {
    alvoId: id, alvo: `${clienteNome} · ${numeroNota || 'sem número'}`, para: cents(total),
  });
  return nota;
}

/** Apaga a venda e tudo que ela criou junto. */
export async function removerVenda(id) {
  const nota = await store.nfs.obter(id);
  if (!nota || !ehLancamentoManual(nota)) {
    throw new Error('Esta venda não foi lançada à mão — ela veio de um arquivo.');
  }
  const sufixo = id.startsWith(PREFIXO_NF) ? id.slice(PREFIXO_NF.length) : null;
  if (sufixo) {
    await store.pedidos.remover(`${PREFIXO_PEDIDO}${sufixo}`).catch(() => {});
    await store.nfItens.remover(`${PREFIXO_ITEM}${sufixo}`).catch(() => {});
  }
  await store.nfs.remover(id);
  await store.registrar('venda_manual_apagada', {
    alvoId: id, alvo: nota.clienteNome, de: nota.valorTotal,
  });
}

/** Aceita "1.234,56", "1234.56" e número; devolve null quando não é número. */
function numero(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor).trim().replace(/\s/g, '');
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}
