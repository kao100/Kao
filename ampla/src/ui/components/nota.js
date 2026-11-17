/**
 * O QUE DÁ PARA FAZER COM UMA NOTA — num lugar só.
 *
 * "Tem aqui uma aba sem vendedor que vendeu 40. Queria poder ver que notas são
 *  essas, daí eu consigo ajustar. (…) Tem uma outra nota aqui que ele tá
 *  pedindo pra eu fazer: duas notas tiveram o custo do pedido descartado. Essa
 *  nota tá cancelada."
 *
 * Duas telas diferentes, a mesma falta: o app mostrava o problema em cima de um
 * total e não dava onde agir. E as respostas possíveis são sempre as mesmas
 * três — de quem foi esta venda, esta nota foi cancelada, este pedido custou
 * tanto. Então elas moram numa folha só, chamada de qualquer lugar que tenha o
 * id da nota: o comercial, a margem, e o que vier depois.
 *
 * O que NÃO está aqui é decidir por ela. A folha mostra o que a nota tem, com o
 * motivo de estar sendo perguntada, e espera o toque.
 */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { definirVendedorDaNf, cancelarNota, reativarNota } from '../../logic/link.js';
import { abrirFolha, fechar, formulario, confirmar, linhas as linhasDetalhe } from './sheet.js';
import { botao, selo } from './ui.js';
import { ok, erro } from './toast.js';
import { atualizarAlertas } from '../shell.js';
import { money, formatDate } from '../../core/format.js';

/**
 * @param {string} nfId
 * @param {object} [opcoes]
 * @param {string} [opcoes.motivo] por que esta nota está sendo perguntada
 * @param {function} [opcoes.aoMudar] chamado depois de qualquer mudança
 */
export async function abrirNota(nfId, { motivo = null, aoMudar = null } = {}) {
  const [nf, vendedores, pedidos] = await Promise.all([
    store.nfs.obter(nfId), store.vendedores.listar(), store.pedidos.listar(),
  ]);
  if (!nf) { erro('Nota não encontrada.'); return; }

  const vendedor = nf.vendedorId ? vendedores.find((v) => v.id === nf.vendedorId) : null;
  const pedido = nf.pedidoId
    ? pedidos.find((p) => p.id === nf.pedidoId)
    : (nf.pedidoNumero ? pedidos.find((p) => String(p.numero) === String(nf.pedidoNumero)) : null);
  const cancelada = nf.status === 'cancelada';
  /* as três ações já refazem os vínculos por dentro; aqui só sobra avisar */
  const terminar = async (mensagem) => {
    await atualizarAlertas();
    ok(mensagem);
    if (aoMudar) aoMudar(); else refresh();
  };

  abrirFolha({
    titulo: `NF ${nf.numero || 'sem número'}`,
    corpo: h('div.empilha', { style: { gap: '12px' } },
      motivo && h('p.pequeno.muted', motivo),
      linhasDetalhe([
        ['Cliente', nf.clienteNome || 'não identificado'],
        ['Emissão', nf.dataEmissao ? formatDate(nf.dataEmissao) : '—'],
        ['Valor', money(nf.valorTotal || 0)],
        nf.valorFrete ? ['Frete na nota', money(nf.valorFrete)] : null,
        ['Vendedor', vendedor?.nome || 'sem vendedor'],
        ['Pedido', pedido ? (pedido.numero || '—') : (nf.pedidoNumero || 'sem pedido')],
        pedido && pedido.valorCusto != null ? ['Custo do pedido', money(pedido.valorCusto)] : null,
      ]),
      cancelada && h('div.linha', { style: { gap: '8px' } },
        selo('cancelada', 'ruim'),
        h('span.mini.muted', nf.canceladaPor === 'manual'
          ? `marcada por você${nf.canceladaEm ? ` em ${formatDate(nf.canceladaEm)}` : ''}`
          : 'veio cancelada no arquivo')),
      h('p.mini.muted',
        'Nota cancelada sai do faturamento, da margem, do DRE e da comissão — em todas as telas.')),
    acoes: cancelada
      ? [
        nf.canceladaPor === 'manual' && botao('Não estava cancelada', {
          onClick: async () => {
            fechar();
            try {
              await reativarNota(nfId);
              await terminar('Nota de volta ao faturamento.');
            } catch (e) { erro(e.message || 'Não deu para reativar.'); }
          },
        }),
        botao('Fechar', { tipo: 'primario', onClick: () => fechar() }),
      ].filter(Boolean)
      : [
        botao('De quem foi esta venda', {
          tipo: 'primario',
          onClick: () => escolherVendedor(nf, vendedores, terminar),
        }),
        botao('Esta nota foi cancelada', {
          onClick: () => marcarCancelada(nf, terminar),
        }),
      ],
  });
}

async function escolherVendedor(nf, vendedores, terminar) {
  if (!vendedores.length) {
    erro('Nenhum vendedor cadastrado ainda.');
    return;
  }
  const r = await formulario({
    titulo: `NF ${nf.numero || ''} — de quem foi?`.trim(),
    descricao: `${nf.clienteNome || 'cliente não identificado'} · `
      + `${nf.dataEmissao ? formatDate(nf.dataEmissao) : 'sem data'} · ${money(nf.valorTotal || 0)}`,
    campos: [{
      chave: 'vendedorId',
      label: 'Vendedor',
      tipo: 'select',
      valor: nf.vendedorId || vendedores[0].id,
      opcoes: vendedores.map((v) => ({ valor: v.id, label: v.nome })),
    }],
    confirmar: 'Definir',
  });
  if (!r) return;
  try {
    await definirVendedorDaNf(nf.id, r.vendedorId, 'definido na tela');
    await terminar('Venda com dono — o faturamento e a comissão já mudaram.');
  } catch (e) {
    erro(e.message || 'Não deu para definir.');
  }
}

async function marcarCancelada(nf, terminar) {
  const sim = await confirmar({
    titulo: `Cancelar a NF ${nf.numero || ''}?`.trim(),
    texto: `${nf.clienteNome || 'cliente não identificado'} · ${money(nf.valorTotal || 0)}\n\n`
      + 'Ela sai do faturamento, da margem, do DRE e da comissão do vendedor, em todas as telas. '
      + 'A marca fica gravada e sobrevive quando você reenviar o relatório de notas.\n\n'
      + 'Se for engano, dá para voltar atrás por aqui mesmo.',
    confirmar: 'Sim, foi cancelada',
    perigo: true,
  });
  if (!sim) return;
  try {
    await cancelarNota(nf.id, 'Marcada na tela');
    await terminar('Nota cancelada — ela saiu do faturamento e da comissão.');
  } catch (e) {
    erro(e.message || 'Não deu para cancelar.');
  }
}

/**
 * A LISTA QUE FALTAVA: as notas por trás de um total, cada uma com saída.
 * Usada no comercial, no cartão das notas sem vendedor.
 */
export function listaDeNotas({ titulo, texto, motivoDaNota = null, notas, aoMudar }) {
  abrirFolha({
    titulo,
    corpo: h('div.empilha', { style: { gap: '10px' } },
      texto && h('p.pequeno.muted', texto),
      h('div.lista', ...notas.map((n) => h('button.item.card--clicavel', {
        /* o texto da lista fala do total; dentro de uma nota ele soaria errado
           ("R$ 40.000,00" numa nota de R$ 30.000,00), então o motivo é outro */
        onClick: () => { fechar(); abrirNota(n.id, { motivo: motivoDaNota, aoMudar }); },
      },
      h('div.item__corpo',
        h('div.item__titulo', `NF ${n.numero || 'sem número'} · ${n.clienteNome}`),
        h('div.item__sub',
          `${n.dataEmissao ? formatDate(n.dataEmissao) : 'sem data'}`
          + `${n.pedidoNumero ? ` · pedido ${n.pedidoNumero}` : ' · sem pedido na nota'}`)),
      h('span.num.pequeno', money(n.valor || 0)),
      h('span', '›')))),
      h('p.mini.muted', 'Toque numa nota para dizer de quem foi, ou que ela foi cancelada.')),
    acoes: [
      botao('Resolver em lote', {
        onClick: () => { fechar(); navigate('/conciliacao/vendedores'); },
      }),
      botao('Fechar', { tipo: 'primario', onClick: () => fechar() }),
    ],
  });
}
