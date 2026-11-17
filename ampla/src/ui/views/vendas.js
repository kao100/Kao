/**
 * VENDAS DO OUTRO CNPJ — a única tela do app onde ela digita venda.
 *
 * "Eu tenho mais um CNPJ que acaba entrando na parte de vendas. Queria uma aba
 *  dentro do comercial onde eu pudesse adicionar quando o vendedor vendeu, qual
 *  é o valor do cimento, se teve frete, o valor total — pra ficar certinho o
 *  faturamento e ficar mais fácil fazer a comissão."
 *
 * O resto do app é só leitura, de propósito: "eu vou alimentar ele, mas eu não
 * vou fazer nenhum ajuste nele". A exceção existe porque o Gestão Click exporta
 * só o CNPJ principal — a venda do outro não chega por relatório nenhum, e sem
 * digitar ela simplesmente não existe em lugar nenhum.
 *
 * O que entra aqui vira nota fiscal de verdade na base: soma no faturamento, no
 * ranking do vendedor e na comissão. O DRE, o caixa e as compras continuam só
 * com o CNPJ principal, e dizem isso na tela — é de lá que vêm os custos e as
 * contas a pagar, e somar faturamento sem custo levantaria a margem sem motivo.
 */

import { h } from '../../core/dom.js';
import { navigate, href, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as vendas from '../../logic/vendas.js';
import { recalcular } from '../../logic/link.js';
import { definirTitulo, atualizarAlertas } from '../shell.js';
import { kpi, card, secao, botao, aviso, vazio, chips } from '../components/ui.js';
import { tabela, exportadores } from '../components/table.js';
import { formulario, confirmar, abrirFolha, fechar, linhas as linhasDetalhe } from '../components/sheet.js';
import { ok, erro } from '../components/toast.js';
import { lerFiltro, descrever } from '../../logic/filtro.js';
import { filtroAvancado } from '../components/filtro.js';
import { money, formatDate, today } from '../../core/format.js';
import { cents, sum } from '../../core/util.js';

export async function telaVendas({ query }) {
  const busca = lerFiltro(query);
  const faixa = { de: busca.de, ate: busca.ate };
  const [lista, empresas, vendedores] = await Promise.all([
    vendas.lancamentos(faixa), vendas.empresas(), store.vendedores.listar(),
  ]);
  definirTitulo('Vendas do outro CNPJ', descrever(busca, { vendedores }));

  const painel = filtroAvancado({
    rota: '/comercial/vendas',
    filtro: busca,
    rotuloData: 'Data da venda',
    rotuloBusca: 'Buscar cliente ou número da nota',
  });

  if (!empresas.length) {
    return h('div.empilha', { style: { gap: '14px' } },
      botao('‹ Voltar para o comercial', { onClick: () => navigate(href('/comercial', query)) }),
      vazio('🏢', 'Cadastre o outro CNPJ primeiro',
        'Cada venda digitada precisa dizer de qual empresa ela é — sem isso o faturamento dos '
        + 'dois vira um só e não dá mais para separar depois.',
        botao('Cadastrar empresa', { tipo: 'primario', onClick: () => pedirEmpresa() })));
  }

  const total = cents(sum(lista, (x) => x.valorTotal || 0));
  const comCusto = lista.filter((x) => x.custo != null);
  const semVendedor = lista.filter((x) => !x.vendedorId);

  return h('div.empilha', { style: { gap: '14px' } },
    botao('‹ Voltar para o comercial', { onClick: () => navigate(href('/comercial', query)) }),
    painel,

    h('div.grade.grade--3',
      kpi({
        label: 'Faturamento lançado', valor: money(total), icone: '✍️',
        nota: `${lista.length} venda(s) no período`,
      }),
      kpi({
        label: 'Com custo informado', valor: `${comCusto.length} de ${lista.length}`, icone: '🏷️',
        nota: comCusto.length === lista.length ? 'todas entram na margem' : 'as outras ficam fora da margem',
        cor: lista.length && comCusto.length < lista.length ? 'atencao' : undefined,
      }),
      kpi({
        label: 'Sem vendedor', valor: String(semVendedor.length), icone: '🙋',
        cor: semVendedor.length ? 'ruim' : 'ok',
        nota: semVendedor.length ? 'não geram comissão' : 'todas com dono',
      })),

    botao('➕ Lançar uma venda', {
      tipo: 'primario', bloco: true, grande: true,
      onClick: () => lancar({ empresas, vendedores }),
    }),

    aviso('O que você lança aqui entra no FATURAMENTO e na COMISSÃO junto com o CNPJ principal — '
      + 'é a mesma venda do mesmo vendedor. O DRE gerencial, o fluxo de caixa e as compras '
      + 'continuam só com o CNPJ principal, porque é dele que vêm os custos e as contas a pagar '
      + 'que você manda por arquivo.', 'info'),

    lista.length === 0
      ? vazio('📝', 'Nenhuma venda lançada neste período',
        'Toque em "Lançar uma venda" para registrar a primeira.')
      : secao('Vendas lançadas',
        exportadores(() => ({
          titulo: 'Vendas lançadas à mão',
          subtitulo: `${formatDate(faixa.de)} a ${formatDate(faixa.ate)}`,
          periodo: `${lista.length} venda(s) · ${money(total)}`,
          nomeArquivo: `vendas_lancadas_${faixa.de}_a_${faixa.ate}`,
          colunas: COLUNAS,
          linhas: lista,
          total: { clienteNome: 'TOTAL', valorTotal: total },
        })),
        card(null, null,
          tabela({
            colunas: COLUNAS,
            linhas: lista,
            total: { clienteNome: 'TOTAL', valorTotal: total },
            aoClicar: (linha) => abrirVenda(linha, { empresas, vendedores }),
          }),
          h('p.mini.muted', { style: { marginTop: '8px' } },
            'Toque numa linha para corrigir ou apagar.'))),

    cardEmpresas(empresas));
}

const COLUNAS = [
  { header: 'Data', key: 'data', tipo: 'date' },
  { header: 'Nº', key: 'numero' },
  { header: 'Cliente', key: 'clienteNome' },
  { header: 'Vendedor', key: 'vendedorNome' },
  { header: 'Produtos', key: 'valorProdutos', tipo: 'money', alinhar: 'direita' },
  { header: 'Frete', key: 'valorFrete', tipo: 'money', alinhar: 'direita' },
  { header: 'Total', key: 'valorTotal', tipo: 'money', alinhar: 'direita' },
  { header: 'Custo', key: 'custo', tipo: 'money', alinhar: 'direita' },
];

/**
 * O formulário é a nota fiscal, na ordem em que ela lê o papel: quem vendeu,
 * para quem, o que, por quanto. O total vem somado de produtos + frete, mas dá
 * para digitar outro — a nota manda, não a minha conta.
 */
async function lancar({ empresas, vendedores, venda = null }) {
  if (!vendedores.length) {
    erro('Cadastre os vendedores antes — é o nome deles que faz a comissão fechar.');
    return;
  }
  const r = await formulario({
    titulo: venda ? `Venda ${venda.numero || ''}`.trim() : 'Lançar uma venda',
    descricao: 'Esta venda entra no faturamento e na comissão como qualquer nota importada. '
      + 'O custo é opcional: com ele a venda entra na margem; sem ele, ela aparece como '
      + '"sem custo" em vez de entrar com um número inventado.',
    campos: [
      {
        chave: 'empresaId',
        label: 'Empresa (CNPJ)',
        tipo: 'select',
        valor: venda?.empresaId || empresas[0].id,
        opcoes: empresas.map((e) => ({ valor: e.id, label: e.cnpj ? `${e.nome} · ${e.cnpj}` : e.nome })),
      },
      { chave: 'data', label: 'Data da venda', tipo: 'data', valor: venda?.data || today(), obrigatorio: true },
      {
        chave: 'vendedorId',
        label: 'Vendedor',
        tipo: 'select',
        valor: venda?.vendedorId || '',
        opcoes: [{ valor: '', label: '— sem vendedor —' },
          ...vendedores.map((v) => ({ valor: v.id, label: v.nome }))],
        ajuda: 'Sem vendedor a venda entra no faturamento, mas não gera comissão.',
      },
      { chave: 'clienteNome', label: 'Cliente', tipo: 'texto', valor: venda?.clienteNome || '', obrigatorio: true },
      { chave: 'clienteDoc', label: 'CPF / CNPJ do cliente', tipo: 'texto', valor: venda?.clienteDoc || '' },
      { chave: 'numero', label: 'Número da nota', tipo: 'texto', valor: venda?.numero || '' },
      {
        chave: 'descricao',
        label: 'O que foi vendido',
        tipo: 'texto',
        valor: venda?.descricao || '',
        ajuda: 'Ex.: CIMENTO CP II. Com isso a venda entra na margem e na curva ABC; '
          + 'sem isso ela entra no faturamento como "nota sem item detalhado".',
      },
      { chave: 'valorProdutos', label: 'Valor dos produtos', tipo: 'dinheiro', valor: venda?.valorProdutos ?? '' },
      { chave: 'valorFrete', label: 'Frete cobrado', tipo: 'dinheiro', valor: venda?.valorFrete ?? '' },
      {
        chave: 'valorTotal',
        label: 'Valor total da nota',
        tipo: 'dinheiro',
        valor: venda?.valorTotal ?? '',
        ajuda: 'Deixe em branco para somar produtos + frete.',
      },
      {
        chave: 'custo',
        label: 'Custo da mercadoria (opcional)',
        tipo: 'dinheiro',
        valor: venda?.custo ?? '',
        ajuda: 'Quanto esta mercadoria custou para a empresa.',
      },
      { chave: 'observacao', label: 'Observação', tipo: 'texto', valor: venda?.observacao || '' },
    ],
    confirmar: venda ? 'Salvar' : 'Lançar',
  });
  if (!r) return;

  try {
    await vendas.salvarVenda({ ...r, id: venda?.id });
    await recalcular();
    await atualizarAlertas();
    ok(venda ? 'Venda atualizada.' : 'Venda lançada — ela já está no faturamento e na comissão.');
    refresh();
  } catch (e) {
    erro(e.message || 'Não deu para lançar.');
    return;
  }

}

/**
 * Tocar numa linha abre o que ela tem, com as duas saídas: corrigir e apagar.
 * Apagar não fica ao lado do botão de salvar — é outro gesto, de propósito.
 */
function abrirVenda(venda, ctx) {
  abrirFolha({
    titulo: `${venda.clienteNome}`,
    corpo: h('div.empilha', { style: { gap: '10px' } },
      linhasDetalhe([
        ['Empresa', venda.empresaNome],
        ['Data', formatDate(venda.data)],
        ['Nota', venda.numero || '—'],
        ['Vendedor', venda.vendedorNome || 'sem vendedor'],
        venda.descricao ? ['Produto', venda.descricao] : null,
        ['Produtos', money(venda.valorProdutos || 0)],
        ['Frete', money(venda.valorFrete || 0)],
        ['Total', money(venda.valorTotal || 0)],
        ['Custo', venda.custo == null ? 'não informado' : money(venda.custo)],
      ]),
      venda.custo == null && h('p.mini.muted',
        'Sem custo informado, esta venda entra no faturamento e na comissão, mas fica fora da margem.')),
    acoes: [
      h('button.btn.btn--primario', {
        onClick: () => { fechar(); lancar({ ...ctx, venda }); },
      }, 'Corrigir'),
      h('button.btn.btn--perigo', {
        onClick: () => { fechar(); apagarVenda(venda); },
      }, 'Apagar'),
    ],
  });
}

async function apagarVenda(venda) {
  const sim = await confirmar({
    titulo: 'Apagar esta venda?',
    texto: `${venda.clienteNome} · ${money(venda.valorTotal)}\n\n`
      + 'Ela sai do faturamento, do ranking do vendedor e da comissão. '
      + 'O custo e o item lançados junto saem também.',
    confirmar: 'Apagar',
    perigo: true,
  });
  if (!sim) return;
  await vendas.removerVenda(venda.id);
  await recalcular();
  await atualizarAlertas();
  ok('Venda apagada.');
  refresh();
}

/* ------------------------------------------------------------- as empresas */

function cardEmpresas(empresas) {
  return card('Empresas cadastradas',
    botao('➕ Nova', { pequeno: true, onClick: () => pedirEmpresa() }),
    h('p.pequeno.muted', { style: { marginBottom: '10px' } },
      'O CNPJ principal é o do Gestão Click e não precisa estar aqui — ele já é o dono de tudo '
      + 'que chega por arquivo. Esta lista é só dos outros.'),
    h('div.empilha', { style: { gap: '4px' } },
      ...empresas.map((e) => h('button.item.card--clicavel', { onClick: () => pedirEmpresa(e) },
        h('span.tarefa__icone', '🏢'),
        h('div.item__corpo',
          h('div.item__titulo', e.nome),
          e.cnpj && h('div.item__sub', e.cnpj)),
        h('span', '›')))));
}

async function pedirEmpresa(empresa = null) {
  const r = await formulario({
    titulo: empresa ? empresa.nome : 'Outro CNPJ',
    descricao: 'O nome é o que vai aparecer nas telas, ao lado de cada venda desta empresa.',
    campos: [
      { chave: 'nome', label: 'Nome da empresa', tipo: 'texto', valor: empresa?.nome || '', obrigatorio: true },
      { chave: 'cnpj', label: 'CNPJ', tipo: 'texto', valor: empresa?.cnpj || '' },
    ],
    confirmar: 'Salvar',
  });
  if (!r) return;
  try {
    await vendas.salvarEmpresa({ id: empresa?.id, nome: r.nome, cnpj: r.cnpj });
    ok('Empresa salva.');
    refresh();
  } catch (e) {
    erro(e.message || 'Não deu para salvar.');
  }
}
