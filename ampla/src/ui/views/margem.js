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
import { cents } from '../../core/util.js';

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
  { header: 'Custo rateado', key: 'custoRateado', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Faturamento', key: 'faturamento', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Frete / faturamento', key: 'peso', tipo: 'percentual', alinhar: 'direita' },
  { header: 'NFs', key: 'notas', tipo: 'numero', alinhar: 'direita' },
];

/**
 * Quando a planilha de entregas diz de quem é a venda, o custo de cada vendedor
 * é MEDIDO, não rateado — e aí as colunas mudam: entra o que a entrega dele
 * custou e o que sobrou, e o rateio sai de cena. Um número medido e um número
 * estimado não podem dividir a mesma coluna.
 */
const COLUNAS_FRETE_MEDIDO = [
  { header: 'Vendedor', key: 'nome' },
  { header: 'Frete cobrado', key: 'frete', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Entregas custaram', key: 'custoReal', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Sobra', key: 'resultado', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Faturamento', key: 'faturamento', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Frete / faturamento', key: 'peso', tipo: 'percentual', alinhar: 'direita' },
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

  /* o faturamento é a nota fiscal; sem XML, o que houver */
  const topo = r.fonte === 'itens-da-nota' ? r.total : r.totalRelatorio;

  return h('div.empilha', { style: { gap: '14px' } },
    painel,

    /**
     * A BASE DO FATURAMENTO É A NOTA FISCAL. Isso vem dito antes de qualquer
     * número, porque é a regra da casa:
     *
     * "Dentro do meu sistema, o que vale de faturamento é a nota fiscal. O
     *  relatório de nota fiscal vai ser a base do faturamento mensal e do
     *  faturamento total de cada vendedor. Comissão, tudo, tudo é a nota fiscal,
     *  porque ali a gente sabe que o cliente foi uma venda efetiva."
     *
     * E a diferença entre o relatório de produtos vendidos e as notas NÃO é erro
     * de período: é outra base. O relatório conta as VENDAS do mês; a tela conta
     * as NOTAS do mês. Nem toda venda do mês sai em nota no mesmo mês, e nem toda
     * nota do mês vem de venda deste mês — então é normal o relatório somar mais.
     * Chamar isso de divergência mandava ela caçar um erro que não existe.
     */
    r.fonte === 'itens-da-nota' && r.temProdutosVendidos && r.conferencia.diferencaDeBase > 1
      && aviso(`O seu relatório de produtos vendidos soma ${money(r.conferencia.vendaDoRelatorio)} `
        + `neste período e as notas somam ${money(r.conferencia.vendaDasNotas)} — `
        + `${money(r.conferencia.diferencaDeBase)} de diferença. Isso é NORMAL, não é erro: o `
        + 'relatório conta as VENDAS do mês e esta tela conta as NOTAS do mês, e nem toda venda '
        + 'sai em nota no mesmo mês. O faturamento é a nota fiscal; o relatório entra aqui só '
        + 'como fonte de CUSTO.', 'info'),

    secao('A margem do período',
      exportadores(() => ({
        titulo: 'Margem do período',
        subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
        nomeArquivo: `margem_total_${filtro.de}`,
        colunas: COLUNAS,
        linhas: r.vendedores,
        total: { nome: 'TOTAL', venda: r.total.venda, custo: r.total.custo, lucro: r.total.lucro, margem: r.total.margem },
      })),
      /**
       * O NÚMERO GRANDE É O DA NOTA FISCAL, sempre que o XML existir.
       *
       * Era o do relatório de produtos vendidos, e isso punha 22,5% de margem no
       * alto da tela — a margem de outra base, com as linhas de unidade trocada
       * dentro. O faturamento é a nota; o relatório é fonte de custo.
       */
      h('div.grade.grade--2',
        kpi({ label: 'Vendeu', valor: money(topo.venda), icone: '🧾', cor: 'info' }),
        kpi({ label: 'Custo', valor: money(topo.custo), icone: '📦', cor: 'laranja' }),
        kpi({ label: 'Lucro', valor: money(topo.lucro), icone: '💰', cor: 'ok' }),
        kpi({
          label: 'Margem', valor: topo.margem == null ? '—' : pct(topo.margem, 1),
          icone: '📐', cor: 'roxo', nota: 'sobre a venda',
        })),
      h('p.mini.muted', { style: { marginTop: '8px' } },
        (r.fonte === 'itens-da-nota'
          ? `${num(r.totalDasNotas ? r.totalDasNotas.produtos : 0, 0)} itens de nota no período. `
          : `${num(r.totalRelatorio.produtos, 0)} produtos no relatório. `)
        + 'A margem é sobre a VENDA ("de 100, quantos por cento sobram"), não sobre o custo — são '
        + 'números diferentes e misturá-los é a confusão mais comum deste assunto.'),
      r.conferencia.coberturaDeCusto.percentual != null && h('p.mini.muted',
        `Custo verificado em ${pct(r.conferencia.coberturaDeCusto.percentual, 1)} da venda`
        + (r.conferencia.coberturaDeCusto.semCusto > 0
          ? ` — faltam ${money(r.conferencia.coberturaDeCusto.semCusto)}`
          : ' — nada de fora')
        + (r.conferencia.coberturaDeCusto.notasComPedido > 0
          ? `. ${num(r.conferencia.coberturaDeCusto.notasComPedido, 0)} notas pegaram o custo do `
            + `PEDIDO que as gerou (${pct(r.conferencia.coberturaDeCusto.percentualDoPedido, 1)} `
            + 'da venda), que é o custo do seu próprio sistema.'
          : '.'))),

    /**
     * A conferência vem ANTES da tabela, porque é ela que decide se a tabela
     * pode ser levada a sério. Margem baixa num vendedor é notícia; margem baixa
     * por buraco de atribuição é cobrar a pessoa errada.
     */
    /**
     * O AVISO QUE SEGURA O NÚMERO É A COBERTURA DE CUSTO, não a comparação com a
     * margem que o relatório declara.
     *
     * A venda sai das notas e fecha sozinha. O custo é que é cruzado de outro
     * arquivo, e é nele que mora o erro possível — então a pergunta certa é:
     * quanto da venda faturada tem custo de origem verificada? O que falta
     * aparece em reais, porque "97% de cobertura" não diz quanto dinheiro está
     * fora da conta e R$ 23.378,66 diz.
     */
    r.conferencia.coberturaDeCusto.suficiente === false && aviso(
      `⚠️ NÃO USE ESTES NÚMEROS AINDA. ${money(r.conferencia.coberturaDeCusto.semCusto)} de venda `
      + `faturada (${pct(100 - r.conferencia.coberturaDeCusto.percentual, 1)} do total) está sem `
      + 'custo de origem verificada, e uma margem sobre parte da venda não é margem. O caminho mais '
      + 'curto para fechar é o RELATÓRIO DE VENDAS do mês: ele traz a coluna "Valor custo" de cada '
      + 'pedido, que é o custo que o seu próprio sistema registrou para aquela venda — sem média de '
      + 'período e sem problema de unidade.', 'ruim',
      botao('Mandar relatório de vendas', { pequeno: true, onClick: () => navigate('/arquivos/pedidos') })),

    /**
     * AS LINHAS FURADAS DO RELATÓRIO.
     *
     * Custo maior que a venda do produto no mês inteiro não é prejuízo: é unidade
     * trocada na origem. Dezesseis linhas assim derrubavam a margem declarada do
     * relatório de 42,3% para 22,5% — e eu passei um dia inteiro atrás de uma
     * venda de balcão que não existe por causa delas. Ficam à vista, com nome e
     * valor, para serem corrigidas no cadastro.
     */
    r.conferencia.relatorioFurado.linhas > 0 && aviso(
      `${r.conferencia.relatorioFurado.linhas} ${r.conferencia.relatorioFurado.linhas === 1 ? 'produto' : 'produtos'} `
      + `do relatório de produtos vendidos ${r.conferencia.relatorioFurado.linhas === 1 ? 'tem' : 'têm'} `
      + `CUSTO MAIOR QUE A VENDA: ${money(r.conferencia.relatorioFurado.custo)} de custo sobre `
      + `${money(r.conferencia.relatorioFurado.venda)} de venda. Isso não é prejuízo, é unidade `
      + 'trocada no cadastro — a quantidade está em peça e o custo médio é do pacote. '
      + `${r.conferencia.relatorioFurado.produtos.slice(0, 3).map((x) => x.descricao).join(', ')}`
      + `${r.conferencia.relatorioFurado.linhas > 3 ? ', e outros' : ''}. `
      + 'Essas linhas ficam fora da conta de referência; corrigir a unidade no cadastro resolve '
      + 'na origem.', 'atencao'),

    /**
     * A MARGEM DO RELATÓRIO, como referência e dizendo de que base ela é.
     */
    r.conferencia.margemDeclarada != null && r.fonte === 'itens-da-nota' && aviso(
      `Para comparar: sobre as NOTAS deste período a margem é ${pct(r.conferencia.margemCalculada, 1)}; `
      + `o seu relatório de produtos vendidos declara ${pct(r.conferencia.margemDeclarada, 1)}`
      + (r.conferencia.relatorioFurado.linhas > 0
        ? ` (${pct(r.conferencia.margemDeclaradaBruta, 1)} com as linhas de unidade trocada dentro)`
        : '')
      + '. As duas não precisam ser iguais: são conjuntos diferentes de venda. A desta tela é a '
      + 'que vale, porque é a da nota fiscal.', 'info'),

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
      : secao(r.margemConfiavel ? 'Margem por vendedor' : 'Margem por vendedor (falta custo)',
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
          'Custo do vendedor: quando a nota tem PEDIDO, é o "Valor custo" daquele pedido — o custo '
          + 'que o seu próprio sistema registrou para aquela venda, sem média e sem conversão de '
          + 'unidade. Quando não tem, é o custo do cadastro do produto, e em último caso a '
          + 'proporção custo/venda do relatório de produtos vendidos. O que não teve nenhuma das '
          + 'três fica de fora e aparece em reais logo acima.'),
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
    ((colunasFrete) => secao('Frete cobrado', r.frete.temDado
      ? exportadores(() => ({
        titulo: 'Frete por vendedor',
        subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
        nomeArquivo: `frete_${filtro.de}`,
        colunas: colunasFrete,
        linhas: r.frete.vendedores,
        total: { nome: 'TOTAL', frete: r.frete.total },
      }))
      : null,
    r.frete.temDado
      ? h('div.empilha', { style: { gap: '10px' } },
        h('div.grade.grade--2',
          kpi({ label: 'Frete cobrado', valor: money(r.frete.total), icone: '🚚', cor: 'info' }),
          r.frete.custo.temDado
            ? kpi({ label: 'Frete pago', valor: money(r.frete.custo.total), icone: '💸', cor: 'laranja' })
            : kpi({
              label: 'Notas com frete', valor: `${r.frete.notasComFrete} de ${r.frete.notasNoPeriodo}`,
              icone: '🧾',
            }),
          r.frete.custo.temDado && kpi({
            label: 'Sobra da entrega',
            valor: money(r.frete.custo.resultado),
            icone: r.frete.custo.resultado >= 0 ? '✅' : '🔴',
            cor: r.frete.custo.resultado >= 0 ? 'ok' : 'ruim',
            nota: r.frete.custo.cobertura == null ? null
              : `o cobrado paga ${pct(r.frete.custo.cobertura, 0)} do pago`,
          }),
          r.frete.custo.temDado && kpi({
            label: 'Frota própria', valor: money(r.frete.custo.frotaPropria), icone: '🚛',
            nota: `terceiros ${money(r.frete.custo.terceiros)}`,
          })),

        /**
         * A conta que ela pediu, escrita por extenso. "O Guilherme tem um frete,
         * mas aí o frete também a gente tem custo."
         */
        r.frete.custo.temDado
          ? h('p.mini.muted',
            r.frete.custo.porVendedor
              ? `${num(r.frete.custo.entregas, 0)} entregas no período, e a planilha diz de quem é `
                + 'cada venda — então "entregas custaram" é o que as entregas DELE custaram, '
                + 'medido, e não um rateio. '
                + (r.frete.custo.semVendedor > 0
                  ? `${money(r.frete.custo.semVendedor)} ficaram fora da tabela por não ter vendedor na planilha. `
                  : '')
                + (r.frete.custo.semCobranca > 0
                  ? `${r.frete.custo.semCobranca} entregas estão com R$ 0,00 — entrega sem custo lançado, `
                    + 'que normalmente é a frota própria. '
                  : '')
                + (r.frete.custo.semValor > 0
                  ? `${r.frete.custo.semValor} estão com o valor em branco, e essas o app não conta.`
                  : '')
              : `${r.frete.custo.lancamentos} lançamento(s) de custo no período. A coluna "custo `
                + 'rateado" é só o rateio proporcional ao frete que cada um cobrou: serve para '
                + 'ordem de grandeza, não para cobrar ninguém. Com a coluna VENDEDOR na planilha '
                + 'de entregas, ela vira custo medido.')
          : aviso('Falta o custo do frete. Mande a sua planilha de entregas do Google (XLSX, CSV ou '
            + 'PDF) em Custos de frete. O que importa nela é o CUSTO de cada entrega e o VENDEDOR '
            + 'da venda — com esses dois o app responde quanto a entrega de cada um custou. Sem '
            + 'ela, "fulano cobrou R$ 8 mil de frete" parece resultado, e não é.', 'atencao',
          botao('Mandar custos de frete', { pequeno: true, onClick: () => navigate('/arquivos/fretes') })),

        tabela({
          colunas: colunasFrete,
          linhas: r.frete.vendedores,
          total: {
            nome: 'TOTAL',
            frete: r.frete.total,
            custoRateado: r.frete.custo.temDado && !r.frete.custo.porVendedor ? r.frete.custo.total : null,
            custoReal: r.frete.custo.porVendedor ? cents(r.frete.custo.total - r.frete.custo.semVendedor) : null,
            resultado: r.frete.custo.porVendedor
              ? cents(r.frete.total - (r.frete.custo.total - r.frete.custo.semVendedor)) : null,
          },
        }),

        r.frete.custo.temDado && r.frete.custo.porResponsavel.length > 0
          && secao('Quem fez a entrega', null, tabela({
            colunas: [
              { header: 'Motorista / transportadora', key: 'nome' },
              { header: 'Custo no período', key: 'valor', tipo: 'dinheiro', alinhar: 'direita' },
            ],
            linhas: r.frete.custo.porResponsavel,
            total: { nome: 'TOTAL', valor: r.frete.custo.total },
          })))
      : aviso('O seu relatório fiscal ainda não traz a coluna de FRETE, então o app não sabe quanto '
        + 'foi cobrado — e preferiu dizer isso a mostrar R$ 0,00, que seria outra coisa. Se o export '
        + 'puder sair com a coluna de frete (ou se você mandar os XMLs das NF-e), esta tela se '
        + 'preenche sozinha: total, por vendedor, e quanto o frete pesa sobre o que cada um vendeu.',
      'info')))(r.frete.custo.porVendedor ? COLUNAS_FRETE_MEDIDO : COLUNAS_FRETE));
}
