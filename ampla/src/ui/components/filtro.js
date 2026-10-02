/**
 * O PAINEL DA BUSCA AVANÇADA.
 *
 * Mesmo painel em toda tela de consulta, para não existir "o filtro daquela
 * tela": aprender uma vez serve para todas.
 *
 * Duas decisões que vieram direto do que ela falou:
 *
 *  • A DATA É DIGITADA. "Eu mesma colocar a data. Não ter que clicar na data,
 *    ficou um pouco confuso essa parte." Os atalhos continuam ali, mas são
 *    conveniência — quem manda são os dois campos de/até.
 *  • CLICAR NUM DIA NÃO ESCONDE O RESTO. Antes, escolher um dia sumia com os
 *    outros. Aqui o período é uma FAIXA, e uma faixa de um dia só é um caso
 *    particular dela — não um modo diferente da tela.
 */

import { h } from '../../core/dom.js';
import { navigate, href } from '../../core/router.js';
import { ATALHOS, paraQuery, descrever } from '../../logic/filtro.js';
import { botao } from './ui.js';
import { formatDate } from '../../core/format.js';

/**
 * @param {object} opcoes
 * @param {string} opcoes.rota          para onde navegar ao mudar o filtro
 * @param {object} opcoes.filtro        o que `lerFiltro` devolveu
 * @param {Array}  [opcoes.vendedores]  mostra o seletor de vendedor
 * @param {Array}  [opcoes.clientes]    mostra o seletor de cliente/fornecedor
 * @param {Array}  [opcoes.situacoes]   [{id,label}] para filtrar situação
 * @param {string} [opcoes.rotuloData]  "data da venda", "vencimento", "pagamento"
 * @param {string} [opcoes.rotuloBusca]
 * @param {function} [opcoes.aoExportar] mostra o botão de exportar o que está filtrado
 */
export function filtroAvancado({
  rota, filtro, vendedores, clientes, pessoas, grupos, produtos, situacoes,
  rotuloData = 'Data', rotuloEntidade = 'Cliente',
  rotuloBusca = 'Buscar por nome, número ou documento',
  aoExportar, extra,
}) {
  const ir = (mudanca) => navigate(href(rota, paraQuery({ ...filtro, ...mudanca })));

  const escolherAtalho = (id) => ir({ atalho: id, deDigitado: '', ateDigitado: '' });

  const campoData = (chave, label, valor) => h('label.filtro__campo',
    h('span.filtro__rotulo', label),
    h('input.entrada', {
      type: 'date', value: valor || '',
      onChange: (e) => ir({ [chave]: e.target.value }),
    }));

  const seletor = (chave, label, opcoes, valor, vazio) => h('label.filtro__campo',
    h('span.filtro__rotulo', label),
    h('select.entrada', {
      onChange: (e) => ir({ [chave]: e.target.value }),
    },
    h('option', { value: '', selected: !valor }, vazio),
    ...opcoes.map((o) => h('option', {
      value: o.id, selected: String(o.id) === String(valor),
    }, o.nome || o.label))));

  // o painel abre fechado quando nada foi mexido: a tela não começa com um
  // formulário na frente do número que ela veio ver
  return h('details.filtro', { open: filtro.ativo },
    h('summary.filtro__resumo',
      h('span.filtro__lupa', '🔎'),
      h('span.crescer', descrever(filtro, { vendedores: vendedores || [], clientes: clientes || [] })),
      h('span.filtro__seta', '▾')),

    h('div.filtro__corpo',
      h('div.filtro__atalhos',
        ...ATALHOS.map((a) => h(`button.chip${filtro.atalho === a.id ? '.chip--ativo' : ''}`, {
          type: 'button', onClick: () => escolherAtalho(a.id),
        }, a.label))),

      h('div.filtro__grade',
        campoData('deDigitado', `${rotuloData} — de`, filtro.deDigitado),
        campoData('ateDigitado', `${rotuloData} — até`, filtro.ateDigitado)),

      h('p.mini.muted', filtro.deDigitado || filtro.ateDigitado
        ? 'Datas digitadas valem mais que o atalho.'
        : `Mostrando ${formatDate(filtro.de)} a ${formatDate(filtro.ate)}. Escreva as datas para escolher outra janela.`),

      h('div.filtro__grade',
        vendedores?.length ? seletor('vendedorId', 'Vendedor', vendedores, filtro.vendedorId, 'Todos os vendedores') : null,
        clientes?.length ? seletor('clienteId', rotuloEntidade, clientes, filtro.clienteId, `Todos (${clientes.length})`) : null,
        grupos?.length ? seletor('grupo', 'Grupo', grupos, filtro.grupo, 'Todos os grupos') : null,
        produtos?.length ? seletor('produtoId', 'Produto', produtos, filtro.produtoId, `Todos (${produtos.length})`) : null,
        situacoes?.length ? seletor('situacao', 'Situação', situacoes, filtro.situacao, 'Qualquer situação') : null),

      /**
       * TODAS AS PESSOAS NUM SELETOR SÓ.
       *
       * "Cliente, fornecedor, funcionário, enfim, todas essas pessoas que fazem
       *  parte do complexo AMPLA."
       *
       * Quem usa não precisa saber em qual cadastro a pessoa mora. O tipo vai
       * escrito ao lado do nome, e a escolha filtra pelo campo certo daquela base.
       */
      pessoas?.length ? h('label.filtro__campo',
        h('span.filtro__rotulo', `Pessoa (${pessoas.length} entre clientes, fornecedores e vendedores)`),
        h('select.entrada', {
          onChange: (e) => {
            const p = pessoas.find((x) => `${x.campo}:${x.id}` === e.target.value);
            if (!p) { ir({ vendedorId: '', clienteId: '' }); return; }
            ir(p.campo === 'vendedorId' ? { vendedorId: p.id, clienteId: '' } : { clienteId: p.id, vendedorId: '' });
          },
        },
        h('option', { value: '' }, 'Qualquer pessoa'),
        ...pessoas.map((p) => h('option', {
          value: `${p.campo}:${p.id}`,
          selected: (p.campo === 'vendedorId' && p.id === filtro.vendedorId)
            || (p.campo !== 'vendedorId' && p.id === filtro.clienteId),
        }, `${p.nome} · ${p.tipo}`)))) : null,

      h('label.filtro__campo',
        h('span.filtro__rotulo', rotuloBusca),
        h('input.entrada', {
          type: 'search', value: filtro.busca, placeholder: 'ex.: Brenge, 4142, 12345678',
          onChange: (e) => ir({ busca: e.target.value.trim() }),
        })),

      extra || null,

      h('div.btn-linha', { style: { marginTop: '10px', flexWrap: 'wrap' } },
        aoExportar && botao('⬇️ Exportar isto', { pequeno: true, onClick: aoExportar }),
        filtro.ativo && botao('Limpar filtro', { pequeno: true, onClick: () => navigate(href(rota, {})) }))));
}

/**
 * "NÃO TEM NADA AQUI" — mas tem em outro lugar.
 *
 * O padrão das telas é o mês corrente. No dia 2 do mês, isso mostra zero, mesmo
 * com a base cheia — e zero sem explicação parece app quebrado. Então, quando o
 * recorte está vazio mas a base não está, a tela diz até quando existe dado e
 * oferece o período em um toque. O filtro dela não é trocado por baixo: ela
 * escolhe.
 */
export function nadaNoRecorte({ rota, ultimaData, primeiraData, rotulo = 'dado' }) {
  if (!ultimaData) return null;
  const mes = String(ultimaData).slice(0, 7);
  return h('div.aviso.aviso--info',
    h('div.crescer',
      h('strong', `Não há ${rotulo} neste recorte`),
      h('div.mini', primeiraData && primeiraData !== ultimaData
        ? `A base vai de ${formatDate(primeiraData)} a ${formatDate(ultimaData)}.`
        : `O último ${rotulo} da base é de ${formatDate(ultimaData)}.`)),
    botao('Ver esse período', {
      pequeno: true,
      onClick: () => navigate(href(rota, { de: `${mes}-01`, ate: ultimaData })),
    }));
}
