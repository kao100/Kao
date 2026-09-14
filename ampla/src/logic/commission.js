/**
 * COMISSÕES (item 7 do projeto)
 *
 * Nada aqui é fixo no código: as regras ficam no banco e são editadas na tela.
 * O cálculo sai das vendas EFETIVAMENTE FATURADAS e já atribuídas a um vendedor.
 *
 * Ordem de especificidade (a mais específica ganha):
 *   produto + vendedor > produto > categoria + vendedor > categoria >
 *   palavra na descrição > vendedor > padrão
 *
 * Depois do cálculo entram os AJUSTES (por NF, item, produto ou vendedor), que
 * sempre guardam valor original, valor novo, quem fez, quando e por quê.
 */

import * as store from '../core/store.js';
import { monthKey, today } from '../core/format.js';
import { cents, sum, sortBy, uid } from '../core/util.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

export const STATUS_PERIODO = {
  calculada: { label: 'Calculada', cor: 'neutro', ordem: 1 },
  revisada: { label: 'Revisada', cor: 'info', ordem: 2 },
  ajustada: { label: 'Ajustada', cor: 'atencao', ordem: 3 },
  aprovada: { label: 'Aprovada', cor: 'ok', ordem: 4 },
  fechada: { label: 'Fechada', cor: 'ok', ordem: 5 },
};

export const BASES = {
  valorProdutos: 'Valor dos produtos',
  valorTotal: 'Valor total (com frete)',
  margem: 'Margem (valor − custo)',
};

export const ESCOPOS = {
  'produto-vendedor': { label: 'Produto + vendedor', peso: 60 },
  produto: { label: 'Produto', peso: 50 },
  'categoria-vendedor': { label: 'Categoria + vendedor', peso: 40 },
  categoria: { label: 'Categoria', peso: 30 },
  // "termo" pega pela palavra na descrição — útil quando o arquivo não traz
  // categoria (ex.: tudo que tem "cimento" no nome paga 0,5%)
  termo: { label: 'Palavra na descrição', peso: 25 },
  vendedor: { label: 'Vendedor', peso: 20 },
  padrao: { label: 'Padrão da empresa', peso: 10 },
};

export const TIPOS_AJUSTE = {
  percentual: { label: 'Alterar %', ajuda: 'Aplica outro percentual sobre a mesma base.' },
  base: { label: 'Alterar base de cálculo', ajuda: 'Troca o valor sobre o qual o percentual incide.' },
  valorFixo: { label: 'Definir valor fixo', ajuda: 'Ignora o cálculo e usa o valor informado.' },
  remover: { label: 'Retirar comissão', ajuda: 'Zera a comissão desta venda/item.' },
  adicional: { label: 'Adicionar ajuste', ajuda: 'Soma (ou subtrai) um valor extra.' },
};

/* ------------------------------------------------------------------ regras */

export function regraPadrao(percentual = 0) {
  return {
    id: 'regra_padrao',
    escopo: 'padrao',
    nome: 'Padrão da empresa',
    percentual,
    base: 'valorProdutos',
    semComissao: false,
    ativo: true,
  };
}

/** Escolhe a regra que vale para um item, do mais específico para o mais geral. */
export function escolherRegra(regras, { produtoId, categoria, descricao, vendedorId, data }) {
  const candidatas = regras.filter((r) => {
    if (r.ativo === false) return false;
    if (r.vigenciaDe && data && data < r.vigenciaDe) return false;
    if (r.vigenciaAte && data && data > r.vigenciaAte) return false;
    const alvo = r.alvo || {};
    if (alvo.produtoId && alvo.produtoId !== produtoId) return false;
    if (alvo.categoria && normalizarCategoria(alvo.categoria) !== normalizarCategoria(categoria)) return false;
    if (alvo.termo && !contemTermo(alvo.termo, categoria, descricao)) return false;
    if (alvo.vendedorId && alvo.vendedorId !== vendedorId) return false;
    return true;
  });
  if (!candidatas.length) return null;
  return sortBy(candidatas, (r) => (ESCOPOS[r.escopo]?.peso || 0), 'desc')[0];
}

function normalizarCategoria(c) {
  return String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** A palavra da regra aparece na categoria ou na descrição do produto? */
function contemTermo(termo, categoria, descricao) {
  const alvo = normalizarCategoria(termo);
  if (!alvo) return false;
  return normalizarCategoria(categoria).includes(alvo)
    || normalizarCategoria(descricao).includes(alvo);
}

/* ------------------------------------------------------------------ cálculo */

/**
 * Calcula o mês inteiro. Não grava nada: é sempre recalculável a partir das
 * vendas + regras + ajustes (o que evita número "congelado" sem rastreabilidade).
 */
export async function calcular(mes = monthKey()) {
  const [nfs, itens, produtos, vendedores, regras, ajustes, periodo, cfg] = await Promise.all([
    store.nfs.listar(), store.nfItens.listar(), store.produtos.listar(), store.vendedores.listar(),
    store.regrasComissao.listar(), store.ajustesComissao.listar(), store.periodosComissao.obter(mes), store.config(),
  ]);

  const regrasTodas = regras.length ? regras : [regraPadrao(cfg.comissao.percentualPadrao)];
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const doMes = nfs.filter((nf) => nf.mes === mes && valeParaFaturamento(nf));
  const itensPorNf = new Map();
  for (const item of itens) {
    if (!itensPorNf.has(item.nfId)) itensPorNf.set(item.nfId, []);
    itensPorNf.get(item.nfId).push(item);
  }

  const ajustesDoMes = ajustes.filter((a) => !a.mes || a.mes === mes);
  const linhas = [];
  const avisos = { semCusto: 0, semRegra: 0, semItens: 0 };

  for (const nf of doMes) {
    if (!nf.vendedorId) continue; // NF sem vendedor não gera comissão: vira pendência
    const seus = itensPorNf.get(nf.id) || [];
    const sinal = nf.devolucao ? -1 : 1;

    if (!seus.length) {
      avisos.semItens += 1;
      const regra = escolherRegra(regrasTodas, { vendedorId: nf.vendedorId, data: nf.dataEmissao });
      const base = cents(Math.abs(nf.valorProdutos ?? nf.valorTotal ?? 0) * sinal);
      linhas.push(montarLinha({
        nf, item: null, regra, base, produto: null, origemBase: 'nf',
        aviso: 'NF sem itens importados — comissão calculada sobre o total da nota.',
      }));
      if (!regra) avisos.semRegra += 1;
      continue;
    }

    const totalItens = sum(seus, (i) => Math.abs(i.valorTotal || 0)) || 1;
    for (const item of seus) {
      const produto = produtoPorId.get(item.produtoId) || null;
      const categoria = produto?.categoriaManual || produto?.categoria || item.categoria || null;
      const regra = escolherRegra(regrasTodas, {
        produtoId: item.produtoId,
        categoria,
        descricao: item.descricao || produto?.descricao,
        vendedorId: nf.vendedorId,
        data: nf.dataEmissao,
      });
      if (!regra) avisos.semRegra += 1;

      const valorItem = Math.abs(item.valorTotal || 0);
      const proporcao = valorItem / totalItens;
      const freteRateado = cfg.comissao.pagarSobreFrete ? (nf.valorFrete || 0) * proporcao : 0;

      let base = null;
      let impedimento = null;
      const tipoBase = regra?.base || cfg.comissao.basePadrao;
      if (tipoBase === 'margem') {
        const custo = custoDoItem(item, produto);
        if (custo == null) { impedimento = 'sem custo confiável'; avisos.semCusto += 1; } else base = cents(valorItem - custo);
      } else if (tipoBase === 'valorTotal') {
        base = cents(valorItem + freteRateado);
      } else {
        base = cents(valorItem);
      }
      if (base != null) base = cents(base * sinal);

      linhas.push(montarLinha({
        nf, item, regra, base, produto, categoria, origemBase: 'item', impedimento,
      }));
    }
  }

  aplicarAjustes(linhas, ajustesDoMes);

  const porVendedor = new Map();
  for (const linha of linhas) {
    if (!porVendedor.has(linha.vendedorId)) {
      porVendedor.set(linha.vendedorId, {
        vendedorId: linha.vendedorId,
        nome: nomeVendedor.get(linha.vendedorId) || 'Vendedor',
        faturamento: 0, base: 0, comissao: 0, comissaoOriginal: 0,
        linhas: [], ajustes: 0, pendentes: 0,
      });
    }
    const v = porVendedor.get(linha.vendedorId);
    v.faturamento = cents(v.faturamento + (linha.origemBase === 'nf' ? linha.valorVenda : linha.valorVenda));
    v.base = cents(v.base + (linha.base || 0));
    v.comissao = cents(v.comissao + (linha.comissao || 0));
    v.comissaoOriginal = cents(v.comissaoOriginal + (linha.comissaoOriginal || 0));
    if (linha.ajustada) v.ajustes += 1;
    if (linha.impedimento) v.pendentes += 1;
    v.linhas.push(linha);
  }

  const fiscal = cents(sum(nfs.filter((nf) => nf.mes === mes && valeParaFaturamento(nf)), valorFaturado));
  const atribuido = cents(sum(doMes.filter((nf) => nf.vendedorId), valorFaturado));
  const semVendedor = doMes.filter((nf) => !nf.vendedorId);

  const bloqueios = [];
  if (semVendedor.length) {
    bloqueios.push({
      tipo: 'nf_sem_vendedor',
      texto: `${semVendedor.length} NF(s) sem vendedor definido`,
      valor: cents(sum(semVendedor, valorFaturado)),
      rota: '/conciliacao',
    });
  }
  if (Math.abs(cents(fiscal - atribuido)) >= 0.01) {
    bloqueios.push({
      tipo: 'divergencia',
      texto: 'Faturamento fiscal diferente do atribuído aos vendedores',
      valor: cents(fiscal - atribuido),
      rota: '/conciliacao',
    });
  }

  return {
    mes,
    status: periodo?.status || 'calculada',
    fechadoEm: periodo?.fechadoEm || null,
    vendedores: sortBy([...porVendedor.values()], (v) => v.comissao, 'desc'),
    total: cents(sum(linhas, (l) => l.comissao || 0)),
    totalOriginal: cents(sum(linhas, (l) => l.comissaoOriginal || 0)),
    faturamentoAtribuido: atribuido,
    faturamentoFiscal: fiscal,
    conferencia: { fiscal, atribuido, diferenca: cents(fiscal - atribuido), ok: Math.abs(cents(fiscal - atribuido)) < 0.01 },
    semVendedor: { quantidade: semVendedor.length, valor: cents(sum(semVendedor, valorFaturado)), notas: semVendedor },
    avisos,
    bloqueios,
    podeFechar: bloqueios.length === 0,
    linhas,
  };
}

function custoDoItem(item, produto) {
  if (item.custoTotal != null) return Math.abs(item.custoTotal);
  if (item.custoUnitario != null && item.quantidade != null) return Math.abs(item.custoUnitario * item.quantidade);
  if (produto?.custo != null && item.quantidade != null) return Math.abs(produto.custo * item.quantidade);
  return null;
}

function montarLinha({ nf, item, regra, base, produto, categoria, origemBase, impedimento, aviso }) {
  const percentual = regra?.semComissao ? 0 : (regra?.percentual ?? null);
  const comissao = impedimento != null || base == null || percentual == null
    ? null
    : cents((base * percentual) / 100);
  return {
    id: item ? `${nf.id}#${item.seq || item.produtoId}` : nf.id,
    nfId: nf.id,
    nfNumero: nf.numero,
    data: nf.dataEmissao,
    clienteNome: nf.clienteNome,
    vendedorId: nf.vendedorId,
    itemId: item?.id || null,
    produtoId: item?.produtoId || null,
    produtoDescricao: item?.descricao || produto?.descricao || (origemBase === 'nf' ? 'Nota sem itens importados' : null),
    categoria: categoria || null,
    quantidade: item?.quantidade ?? null,
    valorVenda: item ? cents((nf.devolucao ? -1 : 1) * Math.abs(item.valorTotal || 0)) : cents(valorFaturado(nf)),
    regraId: regra?.id || null,
    regraNome: regra?.nome || (regra ? ESCOPOS[regra.escopo]?.label : 'sem regra'),
    baseTipo: regra?.base || null,
    base,
    percentual,
    comissao,
    comissaoOriginal: comissao,
    ajustada: false,
    ajustes: [],
    impedimento: impedimento || (percentual == null ? 'sem regra de comissão' : null),
    aviso: aviso || null,
  };
}

/* ------------------------------------------------------------------ ajustes */

function aplicarAjustes(linhas, ajustes) {
  if (!ajustes.length) return;
  const porEscopo = {
    item: ajustes.filter((a) => a.escopo === 'item'),
    nf: ajustes.filter((a) => a.escopo === 'nf'),
    produto: ajustes.filter((a) => a.escopo === 'produto'),
    vendedor: ajustes.filter((a) => a.escopo === 'vendedor'),
  };

  for (const linha of linhas) {
    const aplicaveis = [
      ...porEscopo.vendedor.filter((a) => a.alvoId === linha.vendedorId),
      ...porEscopo.produto.filter((a) => a.alvoId === linha.produtoId),
      ...porEscopo.nf.filter((a) => a.alvoId === linha.nfId),
      ...porEscopo.item.filter((a) => a.alvoId === linha.id || a.alvoId === linha.itemId),
    ];
    for (const ajuste of aplicaveis) {
      const antes = linha.comissao;
      if (ajuste.tipo === 'remover') {
        linha.comissao = 0;
        linha.percentual = 0;
      } else if (ajuste.tipo === 'percentual') {
        linha.percentual = Number(ajuste.valor);
        linha.comissao = linha.base == null ? null : cents((linha.base * linha.percentual) / 100);
        linha.impedimento = linha.base == null ? linha.impedimento : null;
      } else if (ajuste.tipo === 'base') {
        linha.base = cents(Number(ajuste.valor));
        linha.comissao = linha.percentual == null ? null : cents((linha.base * linha.percentual) / 100);
        linha.impedimento = null;
      } else if (ajuste.tipo === 'valorFixo') {
        linha.comissao = cents(Number(ajuste.valor));
        linha.impedimento = null;
      } else if (ajuste.tipo === 'adicional') {
        linha.comissao = cents((linha.comissao || 0) + Number(ajuste.valor));
        linha.impedimento = null;
      }
      linha.ajustada = true;
      linha.ajustes.push({ ...ajuste, de: antes, para: linha.comissao });
    }
  }
}

/** Registra um ajuste. Guarda valor original, novo, usuário, data e motivo. */
export async function ajustar({ escopo, alvoId, tipo, valor, motivo, mes, valorOriginal, descricaoAlvo }) {
  if (!motivo || !motivo.trim()) throw new Error('O motivo do ajuste é obrigatório.');
  if (tipo !== 'remover' && (valor == null || Number.isNaN(Number(valor)))) {
    throw new Error('Informe o valor do ajuste.');
  }
  const periodo = await store.periodosComissao.obter(mes);
  if (periodo?.status === 'fechada') throw new Error(`As comissões de ${mes} estão fechadas. Reabra o período para ajustar.`);

  const ajuste = {
    id: uid('aj'),
    escopo,
    alvoId,
    descricaoAlvo: descricaoAlvo || null,
    tipo,
    valor: tipo === 'remover' ? 0 : Number(valor),
    valorOriginal: valorOriginal ?? null,
    motivo: motivo.trim(),
    mes,
    criadoEm: Date.now(),
    usuario: (await store.config()).usuario || 'administração',
  };
  await store.ajustesComissao.salvar(ajuste);
  await store.registrar('ajuste_comissao', {
    alvoId, alvo: descricaoAlvo || `${escopo} ${alvoId}`, de: valorOriginal, para: ajuste.valor, motivo: ajuste.motivo,
  });
  await definirStatus(mes, 'ajustada', { silencioso: true });
  return ajuste;
}

export async function removerAjuste(id) {
  const ajuste = await store.ajustesComissao.obter(id);
  if (!ajuste) return;
  const periodo = await store.periodosComissao.obter(ajuste.mes);
  if (periodo?.status === 'fechada') throw new Error('Período fechado. Reabra antes de remover o ajuste.');
  await store.ajustesComissao.remover(id);
  await store.registrar('ajuste_comissao_removido', {
    alvoId: ajuste.alvoId, alvo: ajuste.descricaoAlvo, de: ajuste.valor, para: null, motivo: ajuste.motivo,
  });
}

/* ------------------------------------------------------------------- status */

export async function definirStatus(mes, status, { motivo, silencioso } = {}) {
  const atual = await store.periodosComissao.obter(mes);
  if (atual?.status === 'fechada' && status !== 'reaberta') {
    if (status === 'fechada') return atual;
  }
  if (status === 'fechada') {
    const calculo = await calcular(mes);
    if (!calculo.podeFechar) {
      throw new Error(`Não dá para fechar: ${calculo.bloqueios.map((b) => b.texto).join(' · ')}.`);
    }
  }
  const registro = {
    mes,
    status: status === 'reaberta' ? 'ajustada' : status,
    atualizadoEm: Date.now(),
    fechadoEm: status === 'fechada' ? Date.now() : (status === 'reaberta' ? null : atual?.fechadoEm || null),
    motivo: motivo || atual?.motivo || null,
  };
  await store.periodosComissao.salvar(registro);
  if (!silencioso) {
    await store.registrar('status_comissao', { alvoId: mes, alvo: `Comissões ${mes}`, de: atual?.status || 'calculada', para: registro.status, motivo });
  }
  return registro;
}

/** Fecha o mês — só passa se não houver NF sem vendedor nem divergência. */
export async function fechar(mes, motivo) {
  return definirStatus(mes, 'fechada', { motivo });
}

export async function reabrir(mes, motivo) {
  if (!motivo) throw new Error('Informe o motivo da reabertura.');
  return definirStatus(mes, 'reaberta', { motivo });
}

/** Resumo curto para a Visão da Empresa. */
export async function resumoMes(mes = monthKey(today())) {
  const calculo = await calcular(mes);
  return {
    mes,
    total: calculo.total,
    status: calculo.status,
    vendedores: calculo.vendedores.length,
    podeFechar: calculo.podeFechar,
    bloqueios: calculo.bloqueios,
  };
}
