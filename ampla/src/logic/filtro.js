/**
 * BUSCA AVANÇADA — um filtro só, igual em todas as telas.
 *
 * "Eu não consigo filtrar pelo mês. Eu queria que tivesse uma busca avançada,
 *  onde eu conseguisse filtrar os dias como eu quisesse. Mês passado, total, um
 *  dia do próximo mês, um dia do mês anterior. (…) Que eu consiga filtrar
 *  vendedor, data da venda, do recebimento, do pagamento, o produto e pesquisar
 *  o nome."
 *
 * O problema dos atalhos de período (hoje / semana / mês) é que eles respondem
 * as perguntas de quem já sabe o que quer ver. Ela precisa do contrário: olhar o
 * que vem, por janela que ela escolhe, para decidir o que prorrogar. Então aqui
 * a data é DIGITADA, de e até, e os atalhos ficam como conveniência.
 *
 * Tudo vive na URL: o filtro é compartilhável, sobrevive a recarregar a tela, e
 * voltar não perde a busca. Nada é guardado em estado escondido.
 */

import { today, monthStart, monthEnd, monthKey, addMonths, addDays, weekStart, yesterday, formatDate, monthLabel } from '../core/format.js';
import { normalize, digits } from '../core/util.js';

/**
 * Atalhos de período. "Tudo" existe porque ela pediu o total sem recorte, e é
 * uma pergunta legítima: quanto este cliente já comprou, desde sempre.
 */
export const ATALHOS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mesAnterior', label: 'Mês passado' },
  { id: 'ano', label: 'Este ano' },
  { id: 'proximos30', label: 'Próximos 30 dias' },
  { id: 'proximos90', label: 'Próximos 90 dias' },
  { id: 'tudo', label: 'Tudo' },
];

const ABERTO = '0001-01-01';
const FIM_DOS_TEMPOS = '9999-12-31';

/**
 * O intervalo de um atalho. Datas digitadas vencem o atalho: se ela escreveu
 * de/até, é isso que vale, porque foi o que ela pediu explicitamente.
 */
export function intervaloDe(atalho, { de, ate } = {}) {
  if (de || ate) {
    return { de: de || ABERTO, ate: ate || FIM_DOS_TEMPOS, atalho: 'personalizado',
      label: `${de ? formatDate(de) : 'início'} a ${ate ? formatDate(ate) : 'sem fim'}` };
  }
  const hoje = today();
  switch (atalho) {
    case 'hoje': return { de: hoje, ate: hoje, atalho, label: 'Hoje' };
    case 'ontem': return { de: yesterday(), ate: yesterday(), atalho, label: `Ontem (${formatDate(yesterday(), 'short')})` };
    case 'semana': return { de: weekStart(hoje), ate: hoje, atalho, label: 'Esta semana' };
    case 'mesAnterior': {
      const ref = addMonths(hoje, -1);
      return { de: monthStart(ref), ate: monthEnd(ref), atalho, label: monthLabel(monthKey(ref)) };
    }
    case 'ano': return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31`, atalho, label: `Ano de ${hoje.slice(0, 4)}` };
    case 'proximos30': return { de: hoje, ate: addDays(hoje, 30), atalho, label: 'Próximos 30 dias' };
    case 'proximos90': return { de: hoje, ate: addDays(hoje, 90), atalho, label: 'Próximos 90 dias' };
    case 'tudo': return { de: ABERTO, ate: FIM_DOS_TEMPOS, atalho, label: 'Tudo' };
    case 'mes':
    default: return { de: monthStart(hoje), ate: monthEnd(hoje), atalho: 'mes', label: monthLabel(monthKey(hoje)) };
  }
}

/**
 * Lê o filtro da URL. Os nomes são curtos de propósito: a URL fica legível e
 * dá para mandar para o pai por WhatsApp.
 *
 *   p   atalho de período        de/ate  datas digitadas
 *   v   vendedor                 c       cliente ou fornecedor
 *   pr  produto                  q       busca livre
 *   s   situação                 cmp     qual data comparar
 */
export function lerFiltro(query = {}, { atalhoPadrao = 'mes' } = {}) {
  const faixa = intervaloDe(query.p || atalhoPadrao, { de: query.de, ate: query.ate });
  return {
    ...faixa,
    deDigitado: query.de || '',
    ateDigitado: query.ate || '',
    vendedorId: query.v || '',
    clienteId: query.c || '',
    produtoId: query.pr || '',
    busca: query.q || '',
    situacao: query.s || '',
    campoData: query.cmp || '',
    /** O filtro está mexido? É o que decide se o painel abre já aberto. */
    ativo: !!(query.de || query.ate || query.v || query.c || query.pr || query.q || query.s),
  };
}

/** De volta para a query da URL, só com o que foi escolhido. */
export function paraQuery(f) {
  return {
    p: f.deDigitado || f.ateDigitado ? null : (f.atalho === 'mes' ? null : f.atalho),
    de: f.deDigitado || null,
    ate: f.ateDigitado || null,
    v: f.vendedorId || null,
    c: f.clienteId || null,
    pr: f.produtoId || null,
    q: f.busca || null,
    s: f.situacao || null,
    cmp: f.campoData || null,
  };
}

export function dentroDoPeriodo(data, f) {
  if (!data) return false;
  return data >= f.de && data <= f.ate;
}

/**
 * Aplica o filtro a uma lista. `campos` diz onde olhar em cada registro — cada
 * tela tem nomes diferentes para a mesma coisa, e inventar um formato único só
 * para o filtro obrigaria a reescrever as telas.
 *
 * Registro sem a data pedida NÃO entra: aparecer num período a que não pertence
 * seria pior do que ficar de fora, porque a soma do período deixaria de bater.
 */
export function aplicar(lista, f, campos = {}) {
  const {
    data = 'data',
    vendedor = 'vendedorId',
    cliente = 'clienteId',
    produto = 'produtoId',
    situacao = 'status',
    texto = ['clienteNome', 'fornecedorNome', 'descricao', 'numero', 'documento'],
  } = campos;

  const buscaNorma = normalize(f.busca);
  const buscaDigitos = digits(f.busca);

  return lista.filter((r) => {
    if (!dentroDoPeriodo(r[data], f)) return false;
    if (f.vendedorId && r[vendedor] !== f.vendedorId) return false;
    if (f.clienteId && r[cliente] !== f.clienteId) return false;
    if (f.produtoId && r[produto] !== f.produtoId) return false;
    if (f.situacao && r[situacao] !== f.situacao) return false;
    if (!buscaNorma) return true;
    // busca livre: nome, número, documento. Dígito casa com documento sem máscara.
    return texto.some((campo) => {
      const valor = r[campo];
      if (valor == null) return false;
      if (normalize(valor).includes(buscaNorma)) return true;
      return buscaDigitos.length >= 3 && digits(valor).includes(buscaDigitos);
    });
  });
}

/** Resumo em uma linha, para a tela dizer o que está mostrando. */
export function descrever(f, { vendedores = [], clientes = [] } = {}) {
  const partes = [f.label];
  const v = vendedores.find((x) => x.id === f.vendedorId);
  if (v) partes.push(v.nome);
  const c = clientes.find((x) => x.id === f.clienteId);
  if (c) partes.push(c.nome);
  if (f.busca) partes.push(`"${f.busca}"`);
  if (f.situacao) partes.push(f.situacao);
  return partes.join(' · ');
}
