/**
 * MARGEM E FRETE.
 *
 * "Conseguir ver a margem que está sendo utilizada por vendedor, a margem total.
 *  De 100, quantos por cento? Qual o custo final? Qual o lucro final? E frete:
 *  quanto está sendo cobrado, quanto cada vendedor está cobrando?"
 *
 * A tela diz, em cima de tudo, DE ONDE o número vem. Margem é o assunto em que
 * mais se mente com número — e uma margem que parece exata e não é vale menos
 * que uma margem honesta.
 */

import { h } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as margemLogica from '../../logic/margem.js';
import { lerFiltro, descrever } from '../../logic/filtro.js';
import { filtroAvancado, nadaNoRecorte } from '../components/filtro.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, vazio, aviso } from '../components/ui.js';
import { tabela, exportadores, exportarPlanilha } from '../components/table.js';
import { money, pct, num, formatDate } from '../../core/format.js';

const COLUNAS = [
  { header: 'Vendedor', key: 'nome' },
  { header: 'Vendeu', key: 'venda', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Custo', key: 'custo', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Lucro', key: 'lucro', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Margem', key: 'margem', tipo: 'percentual', alinhar: 'direita' },
  { header: 'Frete', key: 'frete', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Com frete', key: 'margemComFrete', tipo: 'percentual', alinhar: 'direita' },
];

const COLUNAS_FRETE = [
  { header: 'Vendedor', key: 'nome' },
  { header: 'Frete cobrado', key: 'frete', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Faturamento', key: 'faturamento', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Frete / faturamento', key: 'peso', tipo: 'percentual', alinhar: 'direita' },
  { header: 'NFs', key: 'notas', tipo: 'numero', alinhar: 'direita' },
];

export async function telaMargem({ query }) {
  const filtro = lerFiltro(query);
  const [r, vendedores] = await Promise.all([
    margemLogica.margem({ de: filtro.de, ate: filtro.ate }),
    store.vendedores.listar(),
  ]);
  definirTitulo('Margem e frete', descrever(filtro, { vendedores }));

  const painel = filtroAvancado({
    rota: '/margem',
    filtro,
    vendedores,
    rotuloData: 'Período do relatório',
    rotuloBusca: 'Buscar produto',
    aoExportar: () => exportarPlanilha({
      titulo: 'Margem por vendedor',
      subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
      nomeArquivo: `margem_${filtro.de}_${filtro.ate}`,
      colunas: COLUNAS,
      linhas: r.vendedores,
    }),
  });

  /* o que falta para o número existir — dito antes de qualquer número */
  if (!r.temProdutosVendidos && r.fonte !== 'itens-da-nota') {
    return h('div.empilha', { style: { gap: '14px' } },
      painel,
      vazio('📐', 'Falta o relatório de produtos vendidos',
        'A margem vem do CUSTO, e o custo vem desse relatório: produto, quantidade, custo médio, '
        + 'custo total, valor total e lucro. Sem ele o app não estima margem nenhuma — preferimos '
        + 'não ter o número a ter um número inventado.',
        botao('Mandar produtos vendidos', { tipo: 'primario', onClick: () => navigate('/arquivos/produtosVendidos') })));
  }

  return h('div.empilha', { style: { gap: '14px' } },
    painel,

    /* o total, que não depende de vendedor nenhum */
    r.fonte === 'itens-da-nota' && r.temProdutosVendidos && r.totalDasNotas
      && Math.abs(r.totalDasNotas.venda - r.totalRelatorio.venda) > 1
      && aviso('O seu relatório de PRODUTOS VENDIDOS soma '
        + `${money(r.totalRelatorio.venda)} neste período, e as notas somam `
        + `${money(r.totalDasNotas.venda)}. Os dois deveriam ser a mesma coisa — se não são, o `
        + 'relatório é de outro período. Confira o mês que você escolheu ao importá-lo: os números '
        + 'por vendedor usam as NOTAS, mas o custo vem dele.', 'atencao'),

    secao('A margem do período',
      exportadores(() => ({
        titulo: 'Margem do período',
        subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
        nomeArquivo: `margem_total_${filtro.de}`,
        colunas: COLUNAS,
        linhas: r.vendedores,
        total: { nome: 'TOTAL', venda: r.total.venda, custo: r.total.custo, lucro: r.total.lucro, margem: r.total.margem },
      })),
      h('div.grade.grade--2',
        kpi({ label: 'Vendeu', valor: money(r.totalRelatorio.venda), icone: '🧾', cor: 'info' }),
        kpi({ label: 'Custo', valor: money(r.totalRelatorio.custo), icone: '📦', cor: 'laranja' }),
        kpi({ label: 'Lucro', valor: money(r.totalRelatorio.lucro), icone: '💰', cor: 'ok' }),
        kpi({
          label: 'Margem', valor: r.totalRelatorio.margem == null ? '—' : pct(r.totalRelatorio.margem, 1),
          icone: '📐', cor: 'roxo', nota: 'sobre a venda',
        })),
      h('p.mini.muted', { style: { marginTop: '8px' } },
        `${num(r.totalRelatorio.produtos, 0)} produtos no relatório. A margem é sobre a VENDA `
        + '("de 100, quantos por cento sobram"), não sobre o custo — são números diferentes e '
        + 'misturá-los é a confusão mais comum deste assunto.')),

    /**
     * A conferência vem ANTES da tabela, porque é ela que decide se a tabela
     * pode ser levada a sério. Margem baixa num vendedor é notícia; margem baixa
     * por buraco de atribuição é cobrar a pessoa errada.
     */
    /**
     * O AVISO QUE SEGURA O NÚMERO.
     *
     * Quando a margem calculada não bate com a que o próprio relatório declara, a
     * tabela por vendedor continua visível — escondê-la não ajudaria ninguém —
     * mas com o aviso vermelho em cima, dizendo o que conferir. Mostrar uma
     * margem bonita que não fecha é pior do que não mostrar nada.
     */
    r.conferencia.margemConfere === false && aviso(
      `⚠️ NÃO USE ESTES NÚMEROS AINDA. O app calcula ${pct(r.conferencia.margemCalculada, 1)} de `
      + `margem no período, e o seu relatório de produtos vendidos declara `
      + `${pct(r.conferencia.margemDeclarada, 1)}. A venda fecha com as notas; o que não fecha é o `
      + 'CUSTO, que vem do relatório. O motivo mais provável é o relatório ser de outro período '
      + 'que não o desta tela — ele soma '
      + `${money(r.totalRelatorio.venda)} e as notas do período somam ${money(r.total.venda)}. `
      + 'Mande o relatório de produtos vendidos DO MESMO PERÍODO, ou o relatório de produtos (o do '
      + 'cadastro, com código interno e valor de custo), que casa produto a produto com o XML.',
      'ruim'),

    r.fonte === 'itens-da-nota' && aviso('Estes números vêm dos ITENS DAS NOTAS (o XML das NF-e): '
      + 'cada item traz produto, quantidade e valor, e a nota traz o vendedor e a data. É o recorte '
      + 'exato do período que você escolheu — e inclui as devoluções, com sinal negativo.', 'ok'),

    (r.temComissaoPorProduto || r.fonte === 'itens-da-nota') && (r.conferencia.ok
      ? aviso(`✅ A soma dos vendedores bate com o ${r.conferencia.base}: `
        + `${money(r.conferencia.vendaSomada)} vendidos. Cada venda foi atribuída a alguém — a `
        + 'margem de cada um é comparável.', 'ok')
      : aviso(`⚠️ A soma dos vendedores NÃO bate com o ${r.conferencia.base}: `
        + `${money(r.conferencia.diferencaVenda)} de diferença em venda`
        + (r.conferencia.diferencaCusto == null ? '' : ` e ${money(r.conferencia.diferencaCusto)} em custo`)
        + '. Enquanto isso existir, a margem por vendedor é indicativa, não exata — e o buraco pode '
        + 'estar inteiro em um deles.', 'ruim')),

    /* por vendedor, que é o que ela pediu, e que depende da segunda ponte */
    !r.temComissaoPorProduto
      ? aviso('Para abrir a margem POR VENDEDOR falta o relatório de comissão por produto — é ele '
        + 'que diz quanto cada vendedor vendeu de cada produto. Com os dois, o app cruza: custo do '
        + 'vendedor = o que ele vendeu de cada produto × o custo médio daquele produto.', 'atencao',
      botao('Mandar comissão por produto', { pequeno: true, onClick: () => navigate('/arquivos/comissaoProduto') }))
      : secao(r.margemConfiavel ? 'Margem por vendedor' : 'Margem por vendedor (não confere)',
        exportadores(() => ({
          titulo: 'Margem por vendedor',
          subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
          nomeArquivo: `margem_vendedor_${filtro.de}`,
          colunas: COLUNAS,
          linhas: r.vendedores,
          total: { nome: 'TOTAL', venda: r.total.venda, custo: r.total.custo, lucro: r.total.lucro, margem: r.total.margem },
        })),
        tabela({
          colunas: COLUNAS,
          linhas: r.vendedores,
          total: { nome: 'TOTAL', venda: r.total.venda, custo: r.total.custo, lucro: r.total.lucro, margem: r.total.margem },
        }),
        h('p.mini.muted', { style: { marginTop: '8px' } },
          'Custo do vendedor = o que ele vendeu de cada produto × o CUSTO MÉDIO daquele produto, '
          + 'que é o que o seu relatório traz. Se o produto foi comprado por preços diferentes, o '
          + 'custo de uma venda específica pode ter sido outro — o app usa a média do seu sistema '
          + 'e não finge que é exato.'),
        /**
         * A coluna que responde "ele vende perto do custo, mas ganha no frete?".
         * Margem e frete lado a lado, e a soma dos dois — porque material pesado
         * sai com margem apertada de propósito e o resultado está no frete.
         */
        h('p.mini.muted',
          'VENDEU e MARGEM são só a mercadoria. O FRETE é cobrado à parte, e "COM FRETE" é a '
          + 'margem quando ele entra na conta — é aí que uma margem apertada em material pesado '
          + 'pode virar resultado.'),
        r.produtosSemCusto > 0 && aviso(`${r.produtosSemCusto} linha(s) de venda ficaram sem custo: `
          + 'o produto não apareceu no relatório de produtos vendidos deste período. A margem '
          + 'desses vendedores sai maior do que a real — a linha fica marcada abaixo.', 'atencao'),
        r.vendedores.some((v) => !v.completa) && h('div.empilha', { style: { gap: '4px', marginTop: '8px' } },
          ...r.vendedores.filter((v) => !v.completa).map((v) => h('p.mini.muted',
            `⚠️ ${v.nome}: ${v.produtosSemCusto} de ${v.produtos} produtos sem custo no período.`)))),

    /* frete */
    secao('Frete cobrado', r.frete.temDado
      ? exportadores(() => ({
        titulo: 'Frete por vendedor',
        subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
        nomeArquivo: `frete_${filtro.de}`,
        colunas: COLUNAS_FRETE,
        linhas: r.frete.vendedores,
        total: { nome: 'TOTAL', frete: r.frete.total },
      }))
      : null,
    r.frete.temDado
      ? h('div.empilha', { style: { gap: '10px' } },
        h('div.grade.grade--2',
          kpi({ label: 'Frete cobrado', valor: money(r.frete.total), icone: '🚚', cor: 'info' }),
          kpi({
            label: 'Notas com frete', valor: `${r.frete.notasComFrete} de ${r.frete.notasNoPeriodo}`,
            icone: '🧾',
          })),
        tabela({
          colunas: COLUNAS_FRETE,
          linhas: r.frete.vendedores,
          total: { nome: 'TOTAL', frete: r.frete.total },
        }))
      : aviso('O seu relatório fiscal ainda não traz a coluna de FRETE, então o app não sabe quanto '
        + 'foi cobrado — e preferiu dizer isso a mostrar R$ 0,00, que seria outra coisa. Se o export '
        + 'puder sair com a coluna de frete (ou se você mandar os XMLs das NF-e), esta tela se '
        + 'preenche sozinha: total, por vendedor, e quanto o frete pesa sobre o que cada um vendeu.',
      'info')));
}
