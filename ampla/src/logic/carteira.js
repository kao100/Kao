/**
 * CARTEIRA DE CLIENTES — quem compra, quem orça, quem parou.
 *
 * "No começo do ano eu passei toda a minha carteira para alguns vendedores e
 *  eles já tinham um faturamento deles e a carteira deles, e isso não deu certo.
 *  Eu vendia 800 mil, só eu. O Guilherme vendia 500, o Eduardo 500. Agora eles
 *  não estão atingindo nada, nem com um deles e nem com o meu. Então o que eu
 *  preciso saber? Quais são os clientes que compram, estão orçando, não estão
 *  fechando?"
 *
 * Esta é a pergunta mais difícil de responder honestamente, porque a tentação é
 * grande: dizer "este cliente caiu 40%" quando o que existe no arquivo é um mês
 * sem nota. Então a regra aqui é a mesma do resto do app — o app soma e compara,
 * mas não interpreta:
 *
 *  • COMPROU é nota fiscal emitida, nada mais. Devolução entra negativa.
 *  • ORÇOU é o relatório de orçamentos, com a situação que ELE informa.
 *  • PAROU não é um palpite: é "última nota antes do período que você escolheu, e
 *    nenhuma dentro dele". O app diz há quantos dias, e quem decide é você.
 *  • O VENDEDOR de um cliente é por onde ele comprou — e quando compra de mais de
 *    um, aparecem todos, com quanto em cada. Um cliente não "pertence" a ninguém
 *    no app; o cadastro tem um responsável que a própria empresa disse não ser
 *    confiável, e ele continua ignorado.
 */

import * as store from '../core/store.js';
import { today } from '../core/format.js';
import { cents, sum, normalize } from '../core/util.js';
import { valeParaFaturamento, valorFaturado } from './revenue.js';

/** Dias sem comprar a partir dos quais o cliente entra na lista de "parou". */
export const DIAS_PARADO = 60;

function diasAte(data, referencia = today()) {
  if (!data) return null;
  return Math.round((new Date(`${referencia}T12:00`) - new Date(`${data}T12:00`)) / 86400000);
}

/**
 * Uma linha por cliente, com o que ele comprou e o que ele orçou no período —
 * e também o histórico inteiro, porque "quanto esse cliente já comprou com a
 * gente" é uma pergunta sem recorte de data.
 */
export async function carteira({ de, ate, vendedorId = '', busca = '' } = {}) {
  /**
   * "Dias sem comprar" em relação a QUANDO? Ao fim do período que ela escolheu —
   * não a hoje. Olhando março, "parou" quer dizer "não comprou até o fim de
   * março"; medir contra hoje daria um número que não tem nada a ver com a tela.
   * Quando o período termina no futuro (este mês, por exemplo), a referência
   * volta a ser hoje: o futuro ainda não aconteceu.
   */
  const referencia = ate && ate < today() ? ate : today();
  const [nfs, orcamentos, vendedores, clientes] = await Promise.all([
    store.nfs.listar(), store.orcamentos.listar(), store.vendedores.listar(), store.clientes.listar(),
  ]);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const docDoCliente = new Map(clientes.map((c) => [c.id, c.documento || null]));

  const linhas = new Map();
  const pegar = (id, nome) => {
    const chave = id || `nome:${normalize(nome)}`;
    if (!linhas.has(chave)) {
      linhas.set(chave, {
        clienteId: id || null,
        chave,
        nome: nome || 'cliente não identificado',
        documento: docDoCliente.get(id) || null,
        comprouPeriodo: 0,
        notasPeriodo: 0,
        comprouSempre: 0,
        notasSempre: 0,
        orcouPeriodo: 0,
        orcamentosPeriodo: 0,
        orcouSempre: 0,
        convertidoPeriodo: 0,
        perdidoPeriodo: 0,
        abertoPeriodo: 0,
        ultimaCompra: null,
        primeiraCompra: null,
        ultimoOrcamento: null,
        porVendedor: new Map(),
      });
    }
    return linhas.get(chave);
  };

  for (const nf of nfs) {
    if (!valeParaFaturamento(nf)) continue;
    const l = pegar(nf.clienteId, nf.clienteNome);
    const valor = valorFaturado(nf);
    l.comprouSempre += valor;
    l.notasSempre += 1;
    if (!l.ultimaCompra || nf.dataEmissao > l.ultimaCompra) l.ultimaCompra = nf.dataEmissao;
    if (!l.primeiraCompra || nf.dataEmissao < l.primeiraCompra) l.primeiraCompra = nf.dataEmissao;
    if (nf.vendedorId) {
      const atual = l.porVendedor.get(nf.vendedorId) || 0;
      l.porVendedor.set(nf.vendedorId, atual + valor);
    }
    if (nf.dataEmissao >= de && nf.dataEmissao <= ate) {
      l.comprouPeriodo += valor;
      l.notasPeriodo += 1;
    }
  }

  for (const o of orcamentos) {
    const l = pegar(o.clienteId, o.clienteNome);
    l.orcouSempre += o.valorTotal || 0;
    if (!l.ultimoOrcamento || (o.data || '') > l.ultimoOrcamento) l.ultimoOrcamento = o.data || null;
    if (o.data && o.data >= de && o.data <= ate) {
      l.orcouPeriodo += o.valorTotal || 0;
      l.orcamentosPeriodo += 1;
      if (o.situacao === 'convertido') l.convertidoPeriodo += o.valorTotal || 0;
      else if (o.situacao === 'perdido') l.perdidoPeriodo += o.valorTotal || 0;
      else if (o.situacao === 'aberto') l.abertoPeriodo += o.valorTotal || 0;
    }
  }

  const alvoBusca = normalize(busca);
  const saida = [...linhas.values()]
    .map((l) => {
      const vendedoresDoCliente = [...l.porVendedor.entries()]
        .map(([id, valor]) => ({ vendedorId: id, nome: nomeVendedor.get(id) || 'Vendedor', valor: cents(valor) }))
        .sort((a, b) => b.valor - a.valor);
      const diasSemComprar = diasAte(l.ultimaCompra, referencia);
      return {
        ...l,
        porVendedor: undefined,
        vendedores: vendedoresDoCliente,
        vendedorPrincipal: vendedoresDoCliente[0] || null,
        // mais de um vendedor no mesmo cliente é fato, não problema — mas é o
        // fato que explica a confusão de carteira que ela descreveu
        multiVendedor: vendedoresDoCliente.length > 1,
        comprouPeriodo: cents(l.comprouPeriodo),
        comprouSempre: cents(l.comprouSempre),
        orcouPeriodo: cents(l.orcouPeriodo),
        orcouSempre: cents(l.orcouSempre),
        convertidoPeriodo: cents(l.convertidoPeriodo),
        perdidoPeriodo: cents(l.perdidoPeriodo),
        abertoPeriodo: cents(l.abertoPeriodo),
        diasSemComprar,
        // orçou no período e não comprou nada: é a lista que ela quer mandar
        // para o pai — "esse cliente orça muito e fecha pouco"
        orcaENaoFecha: l.orcamentosPeriodo > 0 && l.notasPeriodo === 0,
        // comprava antes e não comprou no período: "qual cliente parou"
        parou: l.notasPeriodo === 0 && l.notasSempre > 0,
        taxaConversao: l.orcouPeriodo ? (l.convertidoPeriodo / l.orcouPeriodo) * 100 : null,
      };
    })
    .filter((l) => {
      if (vendedorId && !l.vendedores.some((v) => v.vendedorId === vendedorId)) return false;
      if (!alvoBusca) return true;
      return normalize(l.nome).includes(alvoBusca) || String(l.documento || '').includes(busca.replace(/\D/g, ''));
    })
    .sort((a, b) => b.comprouPeriodo - a.comprouPeriodo || b.comprouSempre - a.comprouSempre);

  const compraram = saida.filter((l) => l.notasPeriodo > 0);
  const pararam = saida.filter((l) => l.parou && (l.diasSemComprar == null || l.diasSemComprar >= DIAS_PARADO));
  const orcamSemFechar = saida.filter((l) => l.orcaENaoFecha);

  return {
    periodo: { de, ate },
    linhas: saida,
    resumo: {
      clientesComCompra: compraram.length,
      faturamento: cents(sum(compraram, (l) => l.comprouPeriodo)),
      ticketPorCliente: compraram.length ? cents(sum(compraram, (l) => l.comprouPeriodo) / compraram.length) : 0,
      orcado: cents(sum(saida, (l) => l.orcouPeriodo)),
      clientesQuePararam: pararam.length,
      valorDeQuemParou: cents(sum(pararam, (l) => l.comprouSempre)),
      orcamSemFechar: orcamSemFechar.length,
      valorOrcadoSemFechar: cents(sum(orcamSemFechar, (l) => l.orcouPeriodo)),
      comMaisDeUmVendedor: saida.filter((l) => l.multiVendedor).length,
    },
    pararam,
    orcamSemFechar,
  };
}

/**
 * O detalhe de um cliente: tudo que ele fez, em ordem. Sem recorte de período —
 * "quanto esse cliente comprou com a gente" é pergunta de histórico.
 */
export async function cliente(chave) {
  const [nfs, orcamentos, titulos, vendedores, clientes] = await Promise.all([
    store.nfs.listar(), store.orcamentos.listar(), store.receber.listar(),
    store.vendedores.listar(), store.clientes.listar(),
  ]);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const ehDele = (r) => (r.clienteId ? r.clienteId === chave : `nome:${normalize(r.clienteNome)}` === chave);

  const minhasNotas = nfs.filter((n) => ehDele(n) && valeParaFaturamento(n))
    .sort((a, b) => String(b.dataEmissao).localeCompare(String(a.dataEmissao)));
  const meusOrcamentos = orcamentos.filter(ehDele)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const meusTitulos = titulos.filter(ehDele);
  const cadastro = clientes.find((c) => c.id === chave) || null;

  const porMes = new Map();
  for (const nf of minhasNotas) {
    if (!nf.mes) continue;
    porMes.set(nf.mes, cents((porMes.get(nf.mes) || 0) + valorFaturado(nf)));
  }

  const porVendedor = new Map();
  for (const nf of minhasNotas) {
    if (!nf.vendedorId) continue;
    porVendedor.set(nf.vendedorId, cents((porVendedor.get(nf.vendedorId) || 0) + valorFaturado(nf)));
  }

  return {
    chave,
    nome: cadastro?.nome || minhasNotas[0]?.clienteNome || meusOrcamentos[0]?.clienteNome || 'Cliente',
    documento: cadastro?.documento || minhasNotas[0]?.clienteDoc || null,
    email: cadastro?.email || null,
    notas: minhasNotas,
    orcamentos: meusOrcamentos,
    comprouSempre: cents(sum(minhasNotas, valorFaturado)),
    orcouSempre: cents(sum(meusOrcamentos, (o) => o.valorTotal || 0)),
    aberto: cents(sum(meusTitulos.filter((t) => t.status === 'aberto'), (t) => t.valor || 0)),
    vencido: cents(sum(meusTitulos.filter((t) => t.status === 'aberto' && t.vencimento < today()), (t) => t.valor || 0)),
    ultimaCompra: minhasNotas[0]?.dataEmissao || null,
    diasSemComprar: diasAte(minhasNotas[0]?.dataEmissao || null),
    porMes: [...porMes.entries()].map(([mes, valor]) => ({ mes, valor })).sort((a, b) => a.mes.localeCompare(b.mes)),
    porVendedor: [...porVendedor.entries()]
      .map(([id, valor]) => ({ vendedorId: id, nome: nomeVendedor.get(id) || 'Vendedor', valor }))
      .sort((a, b) => b.valor - a.valor),
  };
}
