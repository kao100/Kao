/**
 * IMPORTAÇÃO
 *
 * Uma informação entra uma vez (item 19 do projeto). Aqui o arquivo bruto vira
 * registro canônico, com quatro garantias:
 *
 *  1. NADA É OBRIGATÓRIO. O app importa o arquivo como ele é e depois avisa o
 *     que ficou faltando — nunca recusa a linha nem bloqueia o envio;
 *  2. o que não dá para ler vira AVISO com o número da linha, e o campo fica
 *     vazio em vez de ser preenchido por suposição;
 *  3. registro já existente é reconhecido pela chave natural e ATUALIZADO,
 *     nunca duplicado (item 16). Sem chave, a identidade é o conteúdo da linha;
 *  4. o que foi ajustado à mão no app é preservado numa reimportação.
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

/**
 * Campos-chave que não foram ligados. É só informação para a tela: não impede
 * nada. Sem chave, o app identifica o registro pelo conteúdo da linha.
 */
export function camposSemLigacao(fonteId, mapeamento) {
  const fonte = FONTES[fonteId];
  if (!fonte) return [];
  return fonte.campos.filter((c) => c.chaveNatural && !mapeamento[c.chave]);
}

/* ------------------------------------------------------- leitura de valores */

/**
 * Lê um campo. NUNCA falha: valor que não dá para interpretar vira null + aviso,
 * e a linha entra assim mesmo.
 */
function ler(registro, mapeamento, campo) {
  const ligacao = mapeamento[campo.chave];
  if (!ligacao) return { valor: null, ausente: true };

  // Um campo pode vir de mais de uma coluna: o Gestão Click separa CPF e CNPJ
  // em duas, e cada linha preenche só a sua. Vale a primeira que tiver valor.
  const colunas = Array.isArray(ligacao) ? ligacao : [ligacao];
  const coluna = colunas.find((c) => registro[c] != null && String(registro[c]).trim() !== '');
  if (!coluna) return { valor: null, ausente: true };
  const bruto = registro[coluna];

  if (campo.tipo === 'data') {
    const iso = parseAnyDate(bruto);
    return iso ? { valor: iso } : { valor: null, aviso: `${campo.label}: não entendi a data "${bruto}"` };
  }
  if (campo.tipo === 'dinheiro' || campo.tipo === 'numero' || campo.tipo === 'inteiro') {
    const n = parseNumber(bruto);
    if (n == null) return { valor: null, aviso: `${campo.label}: não entendi o número "${bruto}"` };
    return { valor: campo.tipo === 'inteiro' ? Math.round(n) : n };
  }
  return { valor: String(bruto).trim() };
}

/** Converte uma linha inteira. Devolve o que deu para ler e os avisos do caminho. */
function lerLinha(fonte, registro, mapeamento) {
  const dados = {};
  const avisos = [];
  for (const campo of fonte.campos) {
    const r = ler(registro, mapeamento, campo);
    if (r.aviso) avisos.push(r.aviso);
    if (!r.ausente && r.valor != null) dados[campo.chave] = r.valor;
  }
  return { dados, avisos, vazia: Object.keys(dados).length === 0 };
}

/* ------------------------------------------------------------- preparação */

/**
 * Dry-run: monta os registros e diz o que vai acontecer, sem gravar nada.
 * A gravação só acontece em confirmar().
 */
export async function prepararTabular({ fonteId, leitura, planilhaIndex = 0, headerRow = 0, mapeamento, contaId = null }) {
  const fonte = FONTES[fonteId];
  if (!fonte) throw new Error(`Fonte desconhecida: ${fonteId}`);

  const planilha = leitura.planilhas[planilhaIndex];
  if (!planilha) throw new Error('Planilha não encontrada no arquivo.');
  const { registros } = rowsToObjects(planilha.linhas, headerRow);

  const contexto = await montarContexto();
  const saida = novoPreparo(fonteId, leitura);
  const usados = new Map();

  for (const registro of registros) {
    const { dados, avisos, vazia } = lerLinha(fonte, registro, mapeamento);
    // linha totalmente vazia é separador/rodapé do relatório: passa batido
    if (vazia) continue;
    if (avisos.length) {
      saida.atencao.push({ linha: registro.__linha, motivo: avisos.join(' · '), dados: resumoLinha(registro) });
    }
    try {
      const construidos = await construir(fonteId, dados, {
        contexto, contaId, usados, linha: registro.__linha, bruto: registro,
      });
      for (const item of construidos) empilhar(saida, item);
    } catch (err) {
      // só chega aqui o que impede montar o registro (ex.: extrato sem conta escolhida)
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
    const cliente = montarCliente(
      { cidade: nota.clienteMunicipio },
      { nome: nota.clienteNome, documento: nota.clienteDoc },
    );

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
  if (fonteId === 'nfs') return construirNf(d, ctx);
  if (fonteId === 'nfItens') return construirItem(d, ctx);
  if (fonteId === 'pedidos') return construirPedido(d, ctx);
  if (fonteId === 'orcamentos') return construirOrcamento(d, ctx);
  if (fonteId === 'receber') return construirReceber(d, ctx);
  if (fonteId === 'pagar') return construirPagar(d, ctx);
  if (fonteId === 'extrato') return construirExtrato(d, ctx);
  if (fonteId === 'saldos') return construirSaldo(d, ctx);
  if (fonteId === 'produtos') return construirProduto(d, ctx);
  if (fonteId === 'clientes') return [{ store: 'clientes', registro: montarCliente(d, { nome: d.nome, documento: d.documento }) }];
  if (fonteId === 'vendedores') return construirVendedor(d);
  throw new Error(`Fonte sem construtor: ${fonteId}`);
}

/** Identidade de emergência: o conteúdo da própria linha do arquivo. */
function daLinha(ctx) {
  return hashString(JSON.stringify(ctx?.bruto || {}));
}

function construirNf(d, ctx) {
  const id = d.numero
    ? idNf(d)
    : unico(`nf_x${daLinha(ctx)}`, ctx.usados);
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  const saida = [{
    store: 'nfs',
    registro: {
      id,
      chave: d.chave || null,
      numero: d.numero ? String(d.numero) : null,
      serie: d.serie || null,
      dataEmissao: d.dataEmissao || null,
      mes: d.dataEmissao ? monthKey(d.dataEmissao) : null,
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      clienteDoc: digits(d.clienteDoc) || null,
      valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
      valorProdutos: d.valorProdutos == null ? null : cents(d.valorProdutos),
      valorFrete: d.valorFrete == null ? null : cents(d.valorFrete),
      operacao: interpretarOperacao(d.operacao),
      devolucao: /devolu/i.test(d.naturezaOperacao || ''),
      naturezaOperacao: d.naturezaOperacao || null,
      pedidoNumero: d.pedidoNumero ? docNumber(d.pedidoNumero) : null,
      pedidoOrigem: d.pedidoNumero ? 'relatorio' : null,
      vendedorNome: d.vendedorNome || null,
      status: interpretarStatusNf(d.status),
      statusArquivo: d.status || null,
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
  const seq = d.seq || chaveTexto(d.produtoCodigo || d.descricao || '') || daLinha(ctx);
  const custoTotal = d.custoTotal != null ? d.custoTotal
    : (d.custoUnitario != null && d.quantidade != null ? cents(d.custoUnitario * d.quantidade) : null);

  return [
    {
      store: 'nfItens',
      registro: {
        id: `${nfId}#${seq}`,
        nfId,
        nfNumero: d.nfNumero ? String(d.nfNumero) : null,
        seq: d.seq || null,
        data,
        mes: data ? monthKey(data) : null,
        produtoId,
        produtoCodigo: d.produtoCodigo || null,
        descricao: d.descricao || null,
        unidade: d.unidade || null,
        quantidade: d.quantidade ?? null,
        valorUnitario: d.valorUnitario ?? null,
        valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
        custoUnitario: d.custoUnitario ?? null,
        custoTotal,
        origem: 'relatorio',
      },
    },
    {
      store: 'produtos',
      registro: {
        id: produtoId,
        codigo: d.produtoCodigo || null,
        descricao: d.descricao || null,
        custo: d.custoUnitario ?? null,
        origem: 'itens',
      },
    },
  ];
}

function construirPedido(d, ctx) {
  const numero = d.numero ? (docNumber(d.numero) || String(d.numero)) : null;
  const id = numero ? `ped_${numero}` : unico(`ped_x${daLinha(ctx)}`, ctx.usados);
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  const saida = [{
    store: 'pedidos',
    registro: {
      id,
      numero,
      data: d.data || null,
      mes: d.data ? monthKey(d.data) : null,
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      clienteDoc: digits(d.clienteDoc) || null,
      valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
      valorCusto: d.valorCusto == null ? null : cents(d.valorCusto),
      statusArquivo: d.status || null,
      concretizado: concretizado(d.status),
      // o relatório de vendas não traz vendedor: fica para você definir no app
      vendedorNome: d.vendedorNome || null,
      vendedorId: null,
      nfNumero: d.nfNumero ? docNumber(d.nfNumero) : null,
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

function construirOrcamento(d, ctx) {
  const numero = d.numero ? (docNumber(d.numero) || String(d.numero)) : null;
  const id = numero ? `orc_${numero}` : unico(`orc_x${daLinha(ctx)}`, ctx.usados);
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  const saida = [{
    store: 'orcamentos',
    registro: {
      id,
      numero,
      data: d.data || null,
      mes: d.data ? monthKey(d.data) : null,
      clienteId: cliente?.id || null,
      clienteNome: d.clienteNome || null,
      valorTotal: d.valorTotal == null ? null : cents(d.valorTotal),
      statusArquivo: d.status || null,
      situacao: situacaoOrcamento(d.status),
      origem: 'relatorio',
    },
  }];
  if (cliente) saida.push({ store: 'clientes', registro: cliente });
  return saida;
}

function construirReceber(d, ctx) {
  const cliente = montarCliente(d, { nome: d.clienteNome, documento: d.clienteDoc });
  // a descrição do relatório financeiro é o número do pedido
  const pedidoNumero = d.descricao ? docNumber(d.descricao) : null;
  const nfNumero = d.nfNumero ? docNumber(d.nfNumero) : null;
  const referencia = nfNumero || pedidoNumero || daLinha(ctx);
  const valor = d.valor == null ? null : cents(d.valor);
  // O VENCIMENTO NÃO ENTRA NA CHAVE. Boleto prorrogado é o mesmo boleto com
  // outra data: se a data identificasse o título, o relatório do dia seguinte
  // criaria um segundo e o valor apareceria em dobro no caixa e na
  // inadimplência. Parcelas do mesmo documento se separam pelo valor e, quando
  // até o valor é igual, pela ordem no arquivo — e aí elas são intercambiáveis,
  // porque não há mais nada que as diferencie.
  const id = unico(`rec_${cliente?.id || 'sem'}_${referencia}_${valor ?? 'sv'}`, ctx.usados);
  // a situação do arquivo é a verdade: a baixa aconteceu no sistema dela
  const situacao = interpretarStatusTitulo(d.status, null, d.dataRecebimento);
  const quitado = situacao === 'pago';

  return [
    {
      store: 'receber',
      registro: {
        id,
        documento: d.descricao || null,
        descricao: d.descricao || null,
        pedidoNumero,
        nfNumero,
        nfId: null,
        clienteId: cliente?.id || null,
        clienteNome: d.clienteNome || null,
        emissao: d.emissao || null,
        vencimento: d.vencimento || null,
        valor,
        valorRecebido: quitado ? valor : null,
        saldo: quitado ? 0 : valor,
        dataRecebimento: d.dataRecebimento || null,
        formaPagamento: d.formaPagamento || null,
        banco: d.banco || null,
        statusArquivo: d.status || null,
        status: situacao,
        vendedorId: null,
        origem: 'relatorio',
      },
    },
    cliente && { store: 'clientes', registro: cliente },
  ].filter(Boolean);
}

function construirPagar(d, ctx) {
  const fornecedor = d.fornecedorNome || d.fornecedorDoc ? {
    id: store.idFornecedor({ nome: d.fornecedorNome, documento: d.fornecedorDoc }),
    nome: d.fornecedorNome ? String(d.fornecedorNome).trim() : null,
    documento: digits(d.fornecedorDoc) || null,
    origem: 'relatorio',
  } : null;
  const referencia = d.descricao ? chaveTexto(d.descricao).slice(0, 24)
    : (d.nfNumero ? docNumber(d.nfNumero) : daLinha(ctx));
  const valorPag = d.valor == null ? null : cents(d.valor);
  // mesmo motivo do contas a receber: conta prorrogada é a mesma conta
  const id = unico(`pag_${fornecedor?.id || 'sem'}_${referencia}_${valorPag ?? 'sv'}`, ctx.usados);
  const pago = !!(d.dataPagamento || /pago|quitad|liquidad|baixad/i.test(d.status || ''));

  return [
    {
      store: 'pagar',
      registro: {
        id,
        fornecedorId: fornecedor?.id || null,
        fornecedorNome: d.fornecedorNome || null,
        fornecedorDoc: digits(d.fornecedorDoc) || null,
        documento: d.nfNumero ? docNumber(d.nfNumero) : null,
        descricao: d.descricao || null,
        nfNumero: d.nfNumero ? docNumber(d.nfNumero) : null,
        vencimento: d.vencimento || null,
        valor: valorPag,
        categoria: d.categoria || null,
        formaPagamento: d.formaPagamento || null,
        banco: d.banco || null,
        statusArquivo: d.status || null,
        status: pago ? 'pago' : 'aberto',
        dataPagamento: d.dataPagamento || null,
        valorPago: null,
        origem: 'relatorio',
      },
    },
    fornecedor && { store: 'fornecedores', registro: fornecedor },
  ].filter(Boolean);
}

function construirExtrato(d, ctx) {
  if (!ctx.contaId) throw new Error('Escolha a conta bancária deste extrato.');
  let valor = d.valor;
  if (valor == null) {
    const entrada = d.entrada || 0;
    const saidaValor = d.saida || 0;
    if (!entrada && !saidaValor) return [];   // linha sem valor: ignora em silêncio
    valor = entrada ? Math.abs(entrada) : -Math.abs(saidaValor);
  }
  const data = d.data || null;
  const id = idExtrato({ contaId: ctx.contaId, fitid: null, data: data || daLinha(ctx), valor, descricao: d.descricao }, ctx.usados);
  return [{
    store: 'extrato',
    registro: {
      id,
      contaId: ctx.contaId,
      fitid: null,
      data,
      mes: data ? monthKey(data) : null,
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
  if (!conta) throw new Error(`Banco "${d.banco || '—'}" não está cadastrado em Bancos.`);
  const data = d.data || today();
  return [{
    store: 'saldos',
    registro: { id: `sal_${conta.id}_${data}`, contaId: conta.id, data, saldo: cents(d.saldo || 0), origem: 'planilha' },
  }];
}

function construirProduto(d, ctx) {
  const id = d.codigo || d.descricao
    ? store.idProduto({ codigo: d.codigo, descricao: d.descricao })
    : unico(`prod_x${daLinha(ctx)}`, ctx.usados);
  return [{
    store: 'produtos',
    registro: {
      id,
      codigo: d.codigo || null,
      descricao: d.descricao || null,
      custo: d.custo ?? null,
      ncm: d.ncm || null,
      custoAtualizadoEm: d.custo != null ? today() : null,
      origem: 'cadastro',
    },
  }];
}

function construirVendedor(d) {
  const apelidos = d.apelidos ? String(d.apelidos).split(/[;,/|]/).map((x) => x.trim()).filter(Boolean) : [];
  return [{
    store: 'vendedores',
    registro: {
      id: `vend_${chaveTexto(d.codigo || d.nome || '').slice(0, 24) || uid()}`,
      nome: d.nome ? String(d.nome).trim() : 'Sem nome',
      codigo: d.codigo || null,
      apelidos,
      meta: d.meta ?? null,
      ativo: true,
      origem: 'cadastro',
    },
  }];
}

/** "Concretizada" é a única situação que conta como venda. */
function concretizado(status) {
  const t = normalize(status);
  if (!t) return null;                       // sem informação: não decide
  if (/concretizad|faturad|conclu|finalizad/.test(t)) return true;
  return false;
}

function situacaoOrcamento(status) {
  const t = normalize(status);
  if (!t) return null;
  if (/aprovad|convertid|concretizad|ganho/.test(t)) return 'convertido';
  if (/perdid|recusad|cancelad|reprovad/.test(t)) return 'perdido';
  return 'aberto';
}

/* ------------------------------------------------------------ chaves naturais */

export function idNf({ chave, numero, serie }) {
  if (chave && digits(chave).length === 44) return `nf_${digits(chave)}`;
  const n = docNumber(numero) || String(numero || '').trim();
  if (!n) return `nf_sem_numero`;
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

/**
 * Monta o cliente a partir de qualquer relatório. `identidade` diz onde estão o
 * nome e o documento naquele arquivo; o resto (telefone, e-mail…) é aproveitado
 * quando existir. Sem nome e sem documento, não cria cliente nenhum.
 */
function montarCliente(d, identidade = {}) {
  const nome = identidade.nome ?? d.nome ?? null;
  const documento = identidade.documento ?? d.documento ?? null;
  if (!nome && !digits(documento)) return null;
  return {
    id: store.idCliente({ documento, nome, codigo: d.codigo }),
    nome: nome ? String(nome).trim() : null,
    documento: digits(documento) || null,
    codigo: d.codigo || null,
    tipo: d.tipo || null,
    ie: d.ie || null,
    telefone: d.telefone || null,
    celular: d.celular || null,
    email: d.email || null,
    endereco: d.endereco || null,
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
  if (dataRecebimento || /pago|quitad|liquidad|recebid|baixad/.test(t)) return 'pago';
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
    atencao: [],
    cancelamentos: [],
    avisos: leitura.aviso ? [leitura.aviso] : [],
    periodo: { de: null, ate: null },
    resumo: { total: 0, principal: 0, novos: 0, atualizados: 0, repetidos: 0 },
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
    // o que ela mandou são notas, ou títulos — os clientes criados de tabela
    // são consequência. Contar tudo junto faria "4 notas" virar "8 registros".
    if (nome === FONTES[preparo.fonteId]?.store) preparo.resumo.principal = mapa.size;
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
    registros: preparo.resumo.principal || preparo.resumo.total,
    erros: preparo.erros.length,
  });
  return registro;
}

/** Este arquivo já foi importado antes? (não bloqueia — apenas avisa) */
export async function importacaoAnterior(hash) {
  const lista = await store.importacoes.listar();
  return lista.find((i) => i.hash === hash) || null;
}
