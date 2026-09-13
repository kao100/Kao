/**
 * IMPORTAÇÃO
 *
 * Uma informação entra uma vez (item 19 do projeto). Aqui o arquivo bruto vira
 * registro canônico, com três garantias:
 *
 *  1. campo obrigatório que não dá para ler vira ERRO com o número da linha —
 *     a linha não entra pela metade e não é preenchida por suposição;
 *  2. registro já existente é reconhecido pela chave natural e ATUALIZADO,
 *     nunca duplicado (item 16);
 *  3. o que foi ajustado à mão no app é preservado numa reimportação.
 */

import { parseNumber, parseAnyDate, monthKey, today } from '../core/format.js';
import { normalize, key as chaveTexto, digits, docNumber, uid, hashString, cents } from '../core/util.js';
import { FONTES } from '../data/sources.js';
import { rowsToObjects } from '../core/files/read.js';
import * as store from '../core/store.js';
import * as db from '../core/db.js';

/** Campos que o app calcula ou o usuário edita — uma reimportação não pode apagar. */
const PRESERVAR = {
  nfs: ['vendedorId', 'vendedorOrigem', 'vendedorDefinidoEm', 'pedidoId', 'pedidoOrigem', 'observacao'],
  receber: ['vendedorId', 'nfId', 'observacao', 'contatoPreferido'],
  pagar: ['prorrogadoPara', 'prorrogacaoMotivo', 'observacaoInterna'],
  extrato: ['conciliacaoStatus', 'conciliadoCom', 'conciliadoEm', 'conciliadoPor'],
  produtos: ['comissaoRegraId', 'categoriaManual'],
  clientes: ['contato', 'telefone', 'email', 'observacao'],
  vendedores: ['apelidos', 'meta', 'ativo'],
};

/* ------------------------------------------------------------- mapeamento */

/**
 * Sugere coluna → campo comparando o cabeçalho com os sinônimos da fonte.
 * É só sugestão: quem confirma é o usuário, na tela de importação.
 */
export function sugerirMapeamento(fonteId, cabecalho) {
  const fonte = FONTES[fonteId];
  if (!fonte) return {};
  const colunas = cabecalho.map((c) => ({ nome: c, norma: normalize(c), chave: chaveTexto(c) }));
  const usadas = new Set();
  const mapa = {};

  for (const campo of fonte.campos) {
    const alvos = [campo.label, campo.chave, ...(campo.sinonimos || [])];
    const normas = alvos.map(normalize);
    const chaves = alvos.map(chaveTexto);

    let achada = colunas.find((c) => !usadas.has(c.nome) && normas.includes(c.norma))
      || colunas.find((c) => !usadas.has(c.nome) && chaves.includes(c.chave));

    if (!achada) {
      // tolera "Vl. Total R$" x "valor total": compara por começo/contido
      achada = colunas.find((c) => !usadas.has(c.nome) && c.chave.length >= 4
        && chaves.some((k) => k.length >= 4 && (c.chave.startsWith(k) || k.startsWith(c.chave))));
    }
    if (achada) { mapa[campo.chave] = achada.nome; usadas.add(achada.nome); }
  }
  return mapa;
}

export function camposFaltando(fonteId, mapeamento) {
  const fonte = FONTES[fonteId];
  if (!fonte) return [];
  return fonte.campos.filter((c) => c.obrigatorio && !mapeamento[c.chave]);
}

/* ------------------------------------------------------- leitura de valores */

function ler(registro, mapeamento, campo) {
  const coluna = mapeamento[campo.chave];
  if (!coluna) return { ok: true, valor: null, ausente: true };
  const bruto = registro[coluna];
  if (bruto == null || String(bruto).trim() === '') {
    return campo.obrigatorio
      ? { ok: false, motivo: `${campo.label} está vazio` }
      : { ok: true, valor: null, ausente: true };
  }
  if (campo.tipo === 'data') {
    const iso = parseAnyDate(bruto);
    if (!iso) return { ok: false, motivo: `${campo.label}: não entendi a data "${bruto}"` };
    return { ok: true, valor: iso };
  }
  if (campo.tipo === 'dinheiro' || campo.tipo === 'numero' || campo.tipo === 'inteiro') {
    const n = parseNumber(bruto);
    if (n == null) return { ok: false, motivo: `${campo.label}: não entendi o número "${bruto}"` };
    return { ok: true, valor: campo.tipo === 'inteiro' ? Math.round(n) : n };
  }
  return { ok: true, valor: String(bruto).trim() };
}

/** Converte uma linha inteira usando o mapeamento; junta os erros da linha. */
function lerLinha(fonte, registro, mapeamento) {
  const dados = {};
  const problemas = [];
  for (const campo of fonte.campos) {
    const r = ler(registro, mapeamento, campo);
    if (!r.ok) problemas.push(r.motivo);
    else if (!r.ausente) dados[campo.chave] = r.valor;
  }
  return { dados, problemas };
}

/* ------------------------------------------------------------- preparação */

/**
 * Dry-run: monta os registros e diz o que vai acontecer, sem gravar nada.
 * A gravação só acontece em confirmar().
 */
export async function prepararTabular({ fonteId, leitura, planilhaIndex = 0, headerRow = 0, mapeamento, contaId = null }) {
  const fonte = FONTES[fonteId];
  if (!fonte) throw new Error(`Fonte desconhecida: ${fonteId}`);
  const faltando = camposFaltando(fonteId, mapeamento);
  if (faltando.length) {
    throw new Error(`Falta ligar: ${faltando.map((c) => c.label).join(', ')}.`);
  }

  const planilha = leitura.planilhas[planilhaIndex];
  if (!planilha) throw new Error('Planilha não encontrada no arquivo.');
  const { registros } = rowsToObjects(planilha.linhas, headerRow);

  const contexto = await montarContexto();
  const saida = novoPreparo(fonteId, leitura);
  const usados = new Map();

  for (const registro of registros) {
    const { dados, problemas } = lerLinha(fonte, registro, mapeamento);
    if (problemas.length) {
      saida.erros.push({ linha: registro.__linha, motivo: problemas.join(' · '), dados: resumoLinha(registro) });
      continue;
    }
    try {
      const construidos = await construir(fonteId, dados, { contexto, contaId, usados, linha: registro.__linha });
      for (const item of construidos) empilhar(saida, item);
    } catch (err) {
      saida.erros.push({ linha: registro.__linha, motivo: err.message, dados: resumoLinha(registro) });
    }
  }

  await classificar(saida, contexto);
  return saida;
}

/** NF-e em XML (ou ZIP de XMLs): não precisa de mapeamento, o layout é fixo. */
export async function prepararNfe({ leitura }) {
  const contexto = await montarContexto();
  const saida = novoPreparo('nfs', leitura);
  const notas = leitura.nfe?.notas || [];
  const eventos = leitura.nfe?.eventos || [];

  for (const nota of notas) {
    if (!nota.numero || !nota.dataEmissao || nota.valorTotal == null) {
      saida.erros.push({ linha: nota.chave || nota.numero || '?', motivo: 'XML sem número, data de emissão ou valor total.' });
      continue;
    }
    const nfId = idNf({ chave: nota.chave, numero: nota.numero, serie: nota.serie });
    const cliente = nota.clienteNome || nota.clienteDoc
      ? montarCliente({ nome: nota.clienteNome, documento: nota.clienteDoc, cidade: nota.clienteMunicipio })
      : null;

    empilhar(saida, {
      store: 'nfs',
      registro: {
        id: nfId,
        chave: nota.chave || null,
        numero: String(nota.numero),
        serie: nota.serie || null,
        dataEmissao: nota.dataEmissao,
        mes: monthKey(nota.dataEmissao),
        clienteId: cliente?.id || null,
        clienteNome: nota.clienteNome || null,
        clienteDoc: digits(nota.clienteDoc) || null,
        valorTotal: cents(nota.valorTotal),
        valorProdutos: nota.valorProdutos == null ? null : cents(nota.valorProdutos),
        valorFrete: nota.valorFrete == null ? null : cents(nota.valorFrete),
        valorDesconto: nota.valorDesconto == null ? null : cents(nota.valorDesconto),
        operacao: nota.operacao,
        devolucao: nota.finalidade === '4',
        naturezaOperacao: nota.naturezaOperacao,
        pedidoNumero: docNumber(nota.itens.find((i) => i.pedidoXml)?.pedidoXml || '') || null,
        pedidoOrigem: nota.itens.some((i) => i.pedidoXml) ? 'xml' : null,
        vendedorNome: null,
        status: 'autorizada',
        infoComplementar: nota.infoComplementar,
        origem: 'xml',
      },
    });

    if (cliente) empilhar(saida, { store: 'clientes', registro: cliente });

    for (const item of nota.itens) {
      if (item.valorTotal == null || item.quantidade == null) {
        saida.erros.push({ linha: `NF ${nota.numero} item ${item.seq}`, motivo: 'Item sem quantidade ou valor.' });
        continue;
      }
      const produtoId = store.idProduto({ codigo: item.produtoCodigo, descricao: item.descricao });
      empilhar(saida, {
        store: 'nfItens',
        registro: {
          id: `${nfId}#${item.seq || chaveTexto(item.produtoCodigo || item.descricao)}`,
          nfId,
          nfNumero: String(nota.numero),
          seq: item.seq,
          mes: monthKey(nota.dataEmissao),
          data: nota.dataEmissao,
          produtoId,
          produtoCodigo: item.produtoCodigo,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorTotal: cents(item.valorTotal),
          desconto: item.desconto || 0,
          custoUnitario: null,
          custoTotal: null,
          origem: 'xml',
        },
      });
      empilhar(saida, {
        store: 'produtos',
        registro: {
          id: produtoId,
          codigo: item.produtoCodigo || null,
          descricao: item.descricao || null,
          unidade: item.unidade || null,
          ncm: item.ncm || null,
          categoria: null,
          custo: null,
          origem: 'xml',
        },
      });
    }
  }

  for (const evento of eventos) {
    if (!evento.cancelamento || !evento.chave) continue;
    saida.cancelamentos.push(evento);
  }

  await classificar(saida, contexto);
  return saida;
}

/** Extrato em OFX: o FITID do banco é a garantia contra duplicidade. */
export async function prepararOfx({ leitura, contaId }) {
  if (!contaId) throw new Error('Escolha a conta bancária deste extrato.');
  const contexto = await montarContexto();
  const saida = novoPreparo('extrato', leitura);
  const ofx = leitura.ofx;
  const usados = new Map();

  for (const mov of ofx.movimentos) {
    const id = idExtrato({ contaId, fitid: mov.fitid, data: mov.data, valor: mov.valor, descricao: mov.descricao }, usados);
    empilhar(saida, {
      store: 'extrato',
      registro: {
        id,
        contaId,
        fitid: mov.fitid || null,
        data: mov.data,
        mes: monthKey(mov.data),
        descricao: mov.descricao || mov.tipo || 'Lançamento',
        documento: mov.documento || null,
        valor: cents(mov.valor),
        tipo: mov.valor >= 0 ? 'entrada' : 'saida',
        conciliacaoStatus: 'pendente',
        conciliadoCom: null,
        origem: 'ofx',
      },
    });
  }

  if (ofx.saldo?.valor != null && ofx.saldo.data) {
    empilhar(saida, {
      store: 'saldos',
      registro: {
        id: `sal_${contaId}_${ofx.saldo.data}`,
        contaId,
        data: ofx.saldo.data,
        saldo: cents(ofx.saldo.valor),
        origem: 'ofx',
      },
    });
  }
  saida.periodo = { de: ofx.periodo?.de || null, ate: ofx.periodo?.ate || null };
  await classificar(saida, contexto);
  return saida;
}

/* ------------------------------------------------ construção por tipo de fonte */

async function construir(fonteId, d, ctx) {
  if (fonteId === 'nfs') return construirNf(d);
  if (fonteId === 'nfItens') return construirItem(d, ctx);
  if (fonteId === 'pedidos') return construirPedido(d);
  if (fonteId === 'receber') return construirReceber(d, ctx);
  if (fonteId === 'pagar') return construirPagar(d, ctx);
  if (fonteId === 'extrato') return construirExtrato(d, ctx);
  if (fonteId === 'saldos') return construirSaldo(d, ctx);
  if (fonteId === 'produtos') return construirProduto(d);
  if (fonteId === 'clientes') return [{ store: 'clientes', registro: montarCliente(d) }];
  if (fonteId === 'vendedores') return construirVendedor(d);
  throw new Error(`Fonte sem construtor: ${fonteId}`);
}

function construirNf(d) {
  const id = idNf(d);
  const cliente = d.clienteNome || d.clienteDoc ? montarCliente({ nome: d.clienteNome, documento: d.clienteDoc }) : null;
  const status = interpretarStatusNf(d.status);
  const saida = [{
    store: 'nfs',
    registro: {
      id,
      chave: d.chave || null,
      numero: String(d.numero),
      serie: d.serie || null,
      dataEmissao: d.dataEmissao,
      mes: monthKey(d.dataEmissao),
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      clienteDoc: digits(d.clienteDoc) || null,
      valorTotal: cents(d.valorTotal),
      valorProdutos: d.valorProdutos == null ? null : cents(d.valorProdutos),
      valorFrete: d.valorFrete == null ? null : cents(d.valorFrete),
      valorDesconto: d.valorDesconto == null ? null : cents(d.valorDesconto),
      operacao: interpretarOperacao(d.operacao),
      devolucao: /devolu/i.test(d.naturezaOperacao || '') || /devolu/i.test(d.operacao || ''),
      naturezaOperacao: d.naturezaOperacao || null,
      pedidoNumero: d.pedidoNumero ? docNumber(d.pedidoNumero) : null,
      pedidoOrigem: d.pedidoNumero ? 'relatorio' : null,
      vendedorNome: d.vendedorNome || null,
      status,
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

function construirItem(d, ctx) {
  const nfId = idNf({ numero: d.nfNumero, serie: d.nfSerie });
  const nfExistente = ctx.contexto.nfs.get(nfId);
  const produtoId = store.idProduto({ codigo: d.produtoCodigo, descricao: d.descricao });
  const data = nfExistente?.dataEmissao || null;
  const seq = d.seq || chaveTexto(d.produtoCodigo);
  const custoTotal = d.custoTotal != null ? d.custoTotal
    : (d.custoUnitario != null && d.quantidade != null ? cents(d.custoUnitario * d.quantidade) : null);

  return [
    {
      store: 'nfItens',
      registro: {
        id: `${nfId}#${seq}`,
        nfId,
        nfNumero: String(d.nfNumero),
        seq: d.seq || null,
        data,
        mes: data ? monthKey(data) : null,
        produtoId,
        produtoCodigo: d.produtoCodigo,
        descricao: d.descricao || null,
        unidade: d.unidade || null,
        quantidade: d.quantidade,
        valorUnitario: d.valorUnitario ?? null,
        valorTotal: cents(d.valorTotal),
        custoUnitario: d.custoUnitario ?? null,
        custoTotal,
        origem: 'relatorio',
      },
    },
    {
      store: 'produtos',
      registro: {
        id: produtoId,
        codigo: d.produtoCodigo,
        descricao: d.descricao || null,
        categoria: d.categoria || null,
        unidade: d.unidade || null,
        custo: d.custoUnitario ?? null,
        origem: 'relatorio',
      },
    },
  ];
}

function construirPedido(d) {
  const numero = docNumber(d.numero) || String(d.numero);
  const cliente = d.clienteNome || d.clienteDoc ? montarCliente({ nome: d.clienteNome, documento: d.clienteDoc }) : null;
  const saida = [{
    store: 'pedidos',
    registro: {
      id: `ped_${numero}`,
      numero,
      data: d.data || null,
      mes: d.data ? monthKey(d.data) : null,
      vendedorNome: d.vendedorNome,
      vendedorId: null, // resolvido no recálculo, contra o cadastro de vendedores
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      clienteDoc: digits(d.clienteDoc) || null,
      valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
      nfNumero: d.nfNumero ? docNumber(d.nfNumero) : null,
      status: d.status || null,
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

function construirReceber(d, ctx) {
  const cliente = montarCliente({ nome: d.clienteNome, documento: d.clienteDoc, telefone: d.telefone, email: d.email, contato: d.contato });
  const documento = docNumber(d.documento) || String(d.documento);
  const id = idTitulo('rec', { documento, parcela: d.parcela, clienteId: cliente.id, vencimento: d.vencimento }, ctx.usados);
  const valor = cents(d.valor);
  const recebido = d.valorRecebido == null ? null : cents(d.valorRecebido);
  const saldo = d.saldo != null ? cents(d.saldo) : (recebido != null ? cents(valor - recebido) : valor);

  return [
    {
      store: 'receber',
      registro: {
        id,
        documento,
        parcela: d.parcela || null,
        nfNumero: d.nfNumero ? docNumber(d.nfNumero) : null,
        nfId: null,
        clienteId: cliente.id,
        clienteNome: d.clienteNome,
        emissao: d.emissao || null,
        vencimento: d.vencimento,
        valor,
        valorRecebido: recebido,
        saldo,
        dataRecebimento: d.dataRecebimento || null,
        statusArquivo: d.status || null,
        status: interpretarStatusTitulo(d.status, saldo, d.dataRecebimento),
        banco: d.banco || null,
        formaPagamento: d.formaPagamento || null,
        vendedorNome: d.vendedorNome || null,
        vendedorId: null,
        origem: 'relatorio',
      },
    },
    { store: 'clientes', registro: cliente },
  ];
}

function construirPagar(d, ctx) {
  const fornecedor = {
    id: store.idFornecedor({ nome: d.fornecedorNome }),
    nome: String(d.fornecedorNome).trim(),
    origem: 'relatorio',
  };
  const documento = d.documento ? docNumber(d.documento) || String(d.documento) : '';
  const id = idTitulo('pag', { documento, parcela: d.parcela, clienteId: fornecedor.id, vencimento: d.vencimento, valor: d.valor }, ctx.usados);
  const pago = !!(d.dataPagamento || /pago|quitad|liquidad|baixad/i.test(d.status || ''));

  return [
    {
      store: 'pagar',
      registro: {
        id,
        fornecedorId: fornecedor.id,
        fornecedorNome: fornecedor.nome,
        documento: documento || null,
        parcela: d.parcela || null,
        emissao: d.emissao || null,
        vencimento: d.vencimento,
        valor: cents(d.valor),
        categoria: d.categoria || null,
        banco: d.banco || null,
        statusArquivo: d.status || null,
        status: pago ? 'pago' : 'aberto',
        dataPagamento: d.dataPagamento || null,
        valorPago: d.valorPago == null ? null : cents(d.valorPago),
        observacao: d.observacao || null,
        origem: 'bpo',
      },
    },
    { store: 'fornecedores', registro: fornecedor },
  ];
}

function construirExtrato(d, ctx) {
  if (!ctx.contaId) throw new Error('Escolha a conta bancária deste extrato.');
  let valor = d.valor;
  if (valor == null) {
    const entrada = d.entrada || 0;
    const saidaValor = d.saida || 0;
    if (!entrada && !saidaValor) throw new Error('Linha sem valor de entrada nem de saída.');
    valor = entrada ? Math.abs(entrada) : -Math.abs(saidaValor);
  }
  const id = idExtrato({ contaId: ctx.contaId, fitid: null, data: d.data, valor, descricao: d.descricao }, ctx.usados);
  return [{
    store: 'extrato',
    registro: {
      id,
      contaId: ctx.contaId,
      fitid: null,
      data: d.data,
      mes: monthKey(d.data),
      descricao: d.descricao || 'Lançamento',
      documento: d.documento || null,
      valor: cents(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      conciliacaoStatus: 'pendente',
      conciliadoCom: null,
      origem: 'planilha',
    },
  }];
}

function construirSaldo(d, ctx) {
  const conta = acharConta(ctx.contexto.contas, d.banco);
  if (!conta) throw new Error(`Banco "${d.banco}" não está cadastrado em Bancos.`);
  return [{
    store: 'saldos',
    registro: { id: `sal_${conta.id}_${d.data}`, contaId: conta.id, data: d.data, saldo: cents(d.saldo), origem: 'planilha' },
  }];
}

function construirProduto(d) {
  const id = store.idProduto({ codigo: d.codigo, descricao: d.descricao });
  return [{
    store: 'produtos',
    registro: {
      id,
      codigo: d.codigo,
      descricao: d.descricao,
      categoria: d.categoria || null,
      unidade: d.unidade || null,
      custo: d.custo ?? null,
      precoVenda: d.precoVenda ?? null,
      fornecedorNome: d.fornecedorNome || null,
      ncm: d.ncm || null,
      custoAtualizadoEm: d.custo != null ? today() : null,
      origem: 'cadastro',
    },
  }];
}

function construirVendedor(d) {
  const apelidos = d.apelidos ? String(d.apelidos).split(/[;,/|]/).map((s) => s.trim()).filter(Boolean) : [];
  return [{
    store: 'vendedores',
    registro: {
      id: `vend_${chaveTexto(d.codigo || d.nome).slice(0, 24)}`,
      nome: String(d.nome).trim(),
      codigo: d.codigo || null,
      apelidos,
      meta: d.meta ?? null,
      email: d.email || null,
      ativo: true,
      origem: 'cadastro',
    },
  }];
}

/* ------------------------------------------------------------ chaves naturais */

export function idNf({ chave, numero, serie }) {
  if (chave && digits(chave).length === 44) return `nf_${digits(chave)}`;
  const n = docNumber(numero) || String(numero || '').trim();
  const s = String(serie ?? '').trim() || '1';
  return `nf_${s}-${n}`;
}

function idTitulo(prefixo, { documento, parcela, clienteId, vencimento, valor }, usados) {
  const base = documento
    ? `${prefixo}_${clienteId}_${documento}_${parcela || '1'}`
    : `${prefixo}_${clienteId}_${vencimento}_${hashString(`${valor ?? ''}|${parcela ?? ''}`)}`;
  return unico(base, usados);
}

function idExtrato({ contaId, fitid, data, valor, descricao }, usados) {
  if (fitid) return `ext_${contaId}_${chaveTexto(fitid)}`;
  const base = `ext_${contaId}_${data}_${hashString(`${cents(valor)}|${normalize(descricao)}`)}`;
  return unico(base, usados);
}

/**
 * Duas linhas idênticas no mesmo arquivo são dois compromissos diferentes —
 * o sufixo mantém as duas, e reimportar o mesmo arquivo gera as mesmas chaves.
 */
function unico(base, usados) {
  if (!usados) return base;
  const n = (usados.get(base) || 0) + 1;
  usados.set(base, n);
  return n === 1 ? base : `${base}~${n}`;
}

/* ---------------------------------------------------------------- utilitários */

function montarCliente(d) {
  const id = store.idCliente({ documento: d.documento, nome: d.nome, codigo: d.codigo });
  return {
    id,
    nome: d.nome ? String(d.nome).trim() : null,
    documento: digits(d.documento) || null,
    codigo: d.codigo || null,
    telefone: d.telefone || null,
    email: d.email || null,
    contato: d.contato || null,
    cidade: d.cidade || null,
    origem: 'importacao',
  };
}

function acharConta(contas, texto) {
  const alvo = chaveTexto(texto);
  if (!alvo) return null;
  return contas.find((c) => chaveTexto(c.nome) === alvo)
    || contas.find((c) => chaveTexto(c.banco) === alvo)
    || contas.find((c) => alvo.includes(chaveTexto(c.banco)) && chaveTexto(c.banco))
    || null;
}

function interpretarOperacao(texto) {
  if (!texto) return 'saida';
  const t = normalize(texto);
  if (t === '0' || /entrada/.test(t)) return 'entrada';
  return 'saida';
}

function interpretarStatusNf(texto) {
  const t = normalize(texto);
  if (!t) return 'autorizada';
  if (/cancel/.test(t)) return 'cancelada';
  if (/denegad|inutiliz|rejeit/.test(t)) return 'invalida';
  return 'autorizada';
}

function interpretarStatusTitulo(statusArquivo, saldo, dataRecebimento) {
  const t = normalize(statusArquivo);
  if (/cancel|baixad por perda/.test(t)) return 'cancelado';
  if (dataRecebimento || /pago|quitad|liquidad|recebid/.test(t)) return 'pago';
  if (saldo != null && saldo <= 0) return 'pago';
  return 'aberto';
}

function resumoLinha(registro) {
  return Object.entries(registro)
    .filter(([k]) => k !== '__linha')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

/* -------------------------------------------------- montagem e classificação */

function novoPreparo(fonteId, leitura) {
  return {
    id: uid('imp'),
    fonteId,
    arquivo: leitura.arquivo,
    formato: leitura.formato,
    hash: leitura.hash,
    porStore: {},
    erros: [],
    cancelamentos: [],
    avisos: leitura.aviso ? [leitura.aviso] : [],
    periodo: { de: null, ate: null },
    resumo: { total: 0, novos: 0, atualizados: 0, repetidos: 0 },
  };
}

function empilhar(preparo, { store: nome, registro }) {
  if (!preparo.porStore[nome]) preparo.porStore[nome] = new Map();
  const anterior = preparo.porStore[nome].get(registro.id);
  // dentro do mesmo arquivo, o último preenchimento ganha, sem perder o que veio antes
  preparo.porStore[nome].set(registro.id, anterior ? mesclarRegistro(anterior, registro) : registro);
}

function mesclarRegistro(base, novo) {
  const out = { ...base };
  for (const [k, v] of Object.entries(novo)) if (v != null) out[k] = v;
  return out;
}

async function montarContexto() {
  const [nfs, contas] = await Promise.all([store.nfs.listar(), store.contas.listar()]);
  return { nfs: new Map(nfs.map((n) => [n.id, n])), contas };
}

/** Compara com o que já existe no banco: novo, atualizado ou repetido. */
async function classificar(preparo, contexto) {
  const datas = [];
  for (const [nome, mapa] of Object.entries(preparo.porStore)) {
    const existentes = new Map((await db.getAll(nome)).map((r) => [r.id, r]));
    const detalhe = { novos: 0, atualizados: 0, repetidos: 0 };

    for (const [id, registro] of mapa) {
      const antigo = existentes.get(id);
      if (!antigo) { detalhe.novos += 1; registro.__acao = 'novo'; } else {
        const mesclado = preservar(nome, antigo, registro);
        if (iguais(antigo, mesclado)) { detalhe.repetidos += 1; registro.__acao = 'repetido'; } else { detalhe.atualizados += 1; registro.__acao = 'atualizado'; }
        mapa.set(id, mesclado);
      }
      for (const campo of ['dataEmissao', 'data', 'vencimento']) {
        if (registro[campo]) datas.push(registro[campo]);
      }
    }
    preparo.resumo.total += mapa.size;
    preparo.resumo.novos += detalhe.novos;
    preparo.resumo.atualizados += detalhe.atualizados;
    preparo.resumo.repetidos += detalhe.repetidos;
    preparo[`detalhe_${nome}`] = detalhe;
  }
  if (datas.length && !preparo.periodo.de) {
    datas.sort();
    preparo.periodo = { de: datas[0], ate: datas[datas.length - 1] };
  }
  if (contexto) preparo.__contexto = null;
  return preparo;
}

/** Mantém o que foi decidido dentro do app (vendedor definido à mão, conciliação…). */
function preservar(nome, antigo, novo) {
  const out = { ...antigo, ...novo };
  for (const campo of PRESERVAR[nome] || []) {
    if (antigo[campo] != null && (novo[campo] == null || novo[campo] === '')) out[campo] = antigo[campo];
  }
  // vendedor que você definiu (à mão ou confirmando um pedido) não volta atrás
  if (nome === 'nfs' && ['manual', 'pedido-confirmado'].includes(antigo.vendedorOrigem)) {
    out.vendedorId = antigo.vendedorId;
    out.vendedorOrigem = antigo.vendedorOrigem;
    out.pedidoId = antigo.pedidoId || null;
  }
  if (nome === 'extrato' && antigo.conciliacaoStatus === 'conciliado') {
    out.conciliacaoStatus = 'conciliado';
    out.conciliadoCom = antigo.conciliadoCom;
  }
  // campos que o cadastro completa aos poucos não voltam para null
  for (const [k, v] of Object.entries(antigo)) {
    if (v != null && (out[k] == null || out[k] === '') && !k.startsWith('__')) out[k] = v;
  }
  out.__acao = novo.__acao;
  return out;
}

function iguais(a, b) {
  const limpar = (o) => JSON.stringify(Object.fromEntries(
    Object.entries(o).filter(([k]) => !k.startsWith('__') && k !== 'importadoEm').sort(),
  ));
  return limpar(a) === limpar(b);
}

/* ------------------------------------------------------------------ gravação */

/** Grava de verdade e registra a importação no histórico (item 16). */
export async function confirmar(preparo, { observacao = null } = {}) {
  const lote = {};
  const momento = Date.now();

  for (const [nome, mapa] of Object.entries(preparo.porStore)) {
    lote[nome] = [...mapa.values()].map((r) => {
      const { __acao, ...limpo } = r;
      return { ...limpo, importadoEm: momento, importacaoId: preparo.id };
    });
  }

  // cancelamentos vindos de eventos de NF-e: marcam a nota, não criam registro novo
  const canceladas = [];
  for (const evento of preparo.cancelamentos) {
    const id = idNf({ chave: evento.chave });
    const nf = await db.get('nfs', id);
    if (!nf) { preparo.avisos.push(`Cancelamento da chave ${evento.chave.slice(-8)} chegou antes da NF.`); continue; }
    canceladas.push({ ...nf, status: 'cancelada', canceladaEm: evento.dataEvento, justificativaCancelamento: evento.justificativa });
  }
  if (canceladas.length) lote.nfs = [...(lote.nfs || []), ...canceladas];

  await store.salvarLote(lote);

  const registro = {
    id: preparo.id,
    fonte: preparo.fonteId,
    arquivo: preparo.arquivo,
    formato: preparo.formato,
    hash: preparo.hash,
    data: today(),
    momento,
    periodo: preparo.periodo,
    resumo: { ...preparo.resumo, canceladas: canceladas.length },
    erros: preparo.erros.slice(0, 200),
    totalErros: preparo.erros.length,
    avisos: preparo.avisos,
    observacao,
  };
  await store.importacoes.salvar(registro);
  await store.marcarAtualizacao(preparo.fonteId, {
    arquivo: preparo.arquivo,
    ate: preparo.periodo.ate,
    registros: preparo.resumo.total,
    erros: preparo.erros.length,
  });
  return registro;
}

/** Este arquivo já foi importado antes? (não bloqueia — apenas avisa) */
export async function importacaoAnterior(hash) {
  const lista = await store.importacoes.listar();
  return lista.find((i) => i.hash === hash) || null;
}
