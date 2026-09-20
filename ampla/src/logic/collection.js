/**
 * INADIMPLÊNCIA / COBRANÇA (item 8 do projeto)
 *
 * Substitui o relatório impresso com "C" escrito à mão. Cada título tem um
 * status derivado dos eventos de cobrança — clicar em [COBREI] já grava data e
 * hora, e no dia seguinte a fila se reorganiza sozinha.
 *
 *  🔴 em aberto / não cobrado
 *  🟠 cobrado, sem retorno
 *  🟡 cobrado, com retorno
 *  🟣 promessa de pagamento
 *  🟢 pago
 */

import * as store from '../core/store.js';
import { today, addDays, daysBetween } from '../core/format.js';
import { uid, cents, sum, sortBy } from '../core/util.js';
import { statusTitulo, emAtraso, diasAtraso } from './link.js';

export const STATUS = {
  aberto: { label: 'Não cobrado', cor: '#E5484D', emoji: '🔴', ordem: 1 },
  cobrado: { label: 'Cobrado, sem retorno', cor: '#F76B15', emoji: '🟠', ordem: 2 },
  retorno: { label: 'Cobrado, com retorno', cor: '#F5D90A', emoji: '🟡', ordem: 3 },
  promessa: { label: 'Promessa de pagamento', cor: '#8E4EC6', emoji: '🟣', ordem: 4 },
  pago: { label: 'Pago', cor: '#30A46C', emoji: '🟢', ordem: 5 },
};

export const FILTROS = [
  { id: 'cobrarHoje', label: 'Preciso cobrar hoje', destaque: true },
  { id: 'naoCobrei', label: 'Ainda não cobrei' },
  { id: 'semRetorno', label: 'Cobrado sem retorno' },
  { id: 'promessasHoje', label: 'Promessas para hoje' },
  { id: 'promessasAtrasadas', label: 'Promessas atrasadas' },
  { id: 'vencidos', label: 'Vencidos' },
  { id: 'pagosHoje', label: 'Pagos hoje' },
  { id: 'todos', label: 'Todos' },
];

/** Dias sem contato depois dos quais o título volta para a fila de hoje. */
const RECONTATO_DIAS = 3;

/**
 * Monta a lista de cobrança: título + histórico + status + próxima ação.
 * É a partir daqui que todas as telas de cobrança trabalham.
 */
export async function carteira({ referencia = today() } = {}) {
  const [titulos, eventos, clientes, vendedores] = await Promise.all([
    store.receber.listar(), store.cobrancas.listar(), store.clientes.listar(), store.vendedores.listar(),
  ]);
  const porTitulo = new Map();
  for (const e of eventos) {
    if (!porTitulo.has(e.tituloId)) porTitulo.set(e.tituloId, []);
    porTitulo.get(e.tituloId).push(e);
  }
  const cliente = new Map(clientes.map((c) => [c.id, c]));
  const vendedor = new Map(vendedores.map((v) => [v.id, v.nome]));

  const linhas = titulos
    .filter((t) => statusTitulo(t) !== 'cancelado')
    .map((titulo) => montar(titulo, sortBy(porTitulo.get(titulo.id) || [], (e) => e.momento), cliente, vendedor, referencia));

  return sortBy(linhas, (l) => [l.pago ? 1 : 0, -l.diasAtraso, -l.valorAberto].join('|'));
}

function montar(titulo, eventos, cliente, vendedor, referencia) {
  const pago = statusTitulo(titulo) === 'pago';
  const cobrancas = eventos.filter((e) => e.tipo === 'cobranca');
  const ultimaCobranca = cobrancas[cobrancas.length - 1] || null;
  const retornos = eventos.filter((e) => e.tipo === 'retorno');
  const ultimoRetorno = retornos[retornos.length - 1] || null;
  const promessas = eventos.filter((e) => e.tipo === 'promessa');
  const promessa = promessas[promessas.length - 1] || null;
  const promessaAtiva = !pago && promessa && promessa.promessaData >= referencia ? promessa : null;
  const promessaVencida = !pago && promessa && promessa.promessaData < referencia ? promessa : null;

  let status = 'aberto';
  if (pago) status = 'pago';
  else if (promessaAtiva) status = 'promessa';
  else if (ultimoRetorno && (!ultimaCobranca || ultimoRetorno.momento > ultimaCobranca.momento)) status = 'retorno';
  else if (ultimaCobranca) status = 'cobrado';

  const dados = cliente.get(titulo.clienteId) || {};
  const atraso = diasAtraso(titulo, referencia);
  const diasSemContato = ultimaCobranca ? daysBetween(ultimaCobranca.data, referencia) : null;

  return {
    id: titulo.id,
    titulo,
    clienteId: titulo.clienteId,
    clienteNome: titulo.clienteNome || dados.nome || 'Cliente',
    documento: titulo.documento,
    nfNumero: titulo.nfNumero,
    valor: titulo.valor,
    valorAberto: pago ? 0 : cents(titulo.saldo ?? titulo.valor),
    vencimento: titulo.vencimento,
    diasAtraso: atraso,
    vencido: emAtraso(titulo, referencia),
    vendedorNome: titulo.vendedorId ? vendedor.get(titulo.vendedorId) : (titulo.vendedorNome || null),
    telefone: dados.telefone || null,
    email: dados.email || null,
    contato: dados.contato || null,
    status,
    pago,
    ultimaCobranca,
    ultimoRetorno,
    promessa: promessaAtiva || promessaVencida,
    promessaAtiva: !!promessaAtiva,
    promessaVencida: !!promessaVencida,
    diasSemContato,
    eventos,
    precisaCobrarHoje: precisaCobrar({ pago, atraso, status, promessaAtiva, promessaVencida, diasSemContato }),
    proximaAcao: proximaAcao({ pago, status, promessaAtiva, promessaVencida, atraso, diasSemContato }),
  };
}

function precisaCobrar({ pago, atraso, status, promessaAtiva, promessaVencida, diasSemContato }) {
  if (pago) return false;
  if (promessaVencida) return true;
  if (promessaAtiva) return false;
  if (atraso <= 0) return false;
  if (status === 'aberto') return true;
  return diasSemContato != null && diasSemContato >= RECONTATO_DIAS;
}

function proximaAcao({ pago, status, promessaAtiva, promessaVencida, atraso, diasSemContato }) {
  if (pago) return 'Nada a fazer';
  if (promessaVencida) return 'Promessa não cumprida — cobrar de novo';
  if (promessaAtiva) return `Aguardando pagamento prometido`;
  if (atraso <= 0) return 'Ainda no prazo';
  if (status === 'aberto') return 'Fazer a primeira cobrança';
  if (status === 'cobrado') {
    return diasSemContato >= RECONTATO_DIAS ? 'Sem retorno — insistir' : 'Aguardar retorno';
  }
  return 'Confirmar o que foi combinado';
}

/* -------------------------------------------------------------------- filtros */

export function aplicarFiltro(linhas, filtro, referencia = today()) {
  switch (filtro) {
    case 'cobrarHoje': return linhas.filter((l) => l.precisaCobrarHoje);
    case 'naoCobrei': return linhas.filter((l) => !l.pago && l.status === 'aberto');
    case 'semRetorno': return linhas.filter((l) => l.status === 'cobrado');
    case 'promessasHoje': return linhas.filter((l) => l.promessa && l.promessa.promessaData === referencia && !l.pago);
    case 'promessasAtrasadas': return linhas.filter((l) => l.promessaVencida);
    case 'vencidos': return linhas.filter((l) => l.vencido);
    case 'pagosHoje': return linhas.filter((l) => l.pago && l.titulo.dataRecebimento === referencia);
    case 'todos':
    default: return linhas.filter((l) => !l.pago || l.titulo.dataRecebimento >= addDays(referencia, -7));
  }
}

export function totais(linhas, referencia = today()) {
  const abertos = linhas.filter((l) => !l.pago);
  const vencidos = abertos.filter((l) => l.vencido);
  const promessas = abertos.filter((l) => l.promessaAtiva);
  return {
    aberto: cents(sum(abertos, (l) => l.valorAberto)),
    vencido: cents(sum(vencidos, (l) => l.valorAberto)),
    titulosVencidos: vencidos.length,
    aVencer: cents(sum(abertos.filter((l) => !l.vencido), (l) => l.valorAberto)),
    cobrarHoje: abertos.filter((l) => l.precisaCobrarHoje).length,
    valorCobrarHoje: cents(sum(abertos.filter((l) => l.precisaCobrarHoje), (l) => l.valorAberto)),
    promessas: cents(sum(promessas, (l) => l.promessa.promessaValor ?? l.valorAberto)),
    promessasQuantidade: promessas.length,
    pagosHoje: cents(sum(linhas.filter((l) => l.pago && l.titulo.dataRecebimento === referencia), (l) => l.titulo.valorRecebido ?? l.valor)),
    faixas: faixasAtraso(vencidos),
  };
}

function faixasAtraso(vencidos) {
  const faixas = [
    { id: '1-15', label: '1 a 15 dias', min: 1, max: 15 },
    { id: '16-30', label: '16 a 30 dias', min: 16, max: 30 },
    { id: '31-60', label: '31 a 60 dias', min: 31, max: 60 },
    { id: '61-90', label: '61 a 90 dias', min: 61, max: 90 },
    { id: '90+', label: 'mais de 90 dias', min: 91, max: 99999 },
  ];
  return faixas.map((f) => {
    const lista = vencidos.filter((l) => l.diasAtraso >= f.min && l.diasAtraso <= f.max);
    return { ...f, quantidade: lista.length, valor: cents(sum(lista, (l) => l.valorAberto)) };
  });
}

/**
 * As ações de cobrança (cobrei / teve retorno / recebi / promessa) foram
 * removidas: dar baixa aqui e no sistema era o mesmo trabalho duas vezes. A
 * baixa acontece no sistema, e a próxima importação do contas a receber traz o
 * resultado. O que sobrou aqui é leitura.
 *
 * Os eventos antigos continuam gravados em `cobrancas` e o montar() acima ainda
 * os lê, então quem já tinha histórico não perde nada.
 */
