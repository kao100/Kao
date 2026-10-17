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
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import * as margemLogica from '../../logic/margem.js';
import { lerFiltro, descrever } from '../../logic/filtro.js';
import { filtroAvancado, nadaNoRecorte } from '../components/filtro.js';
import { definirTitulo } from '../shell.js';
import { kpi, card, secao, botao, vazio, aviso, selo } from '../components/ui.js';
import { tabela, exportadores, exportarPlanilha } from '../components/table.js';
import { money, pct, num, formatDate } from '../../core/format.js';
import { cents, normalize } from '../../core/util.js';
import { ok, erro } from '../components/toast.js';
import { formulario } from '../components/sheet.js';

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
  { header: 'Custo', key: 'custoReal', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Sobra', key: 'resultado', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Faturamento', key: 'faturamento', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Frete / faturamento', key: 'peso', tipo: 'percentual', alinhar: 'direita' },
];

/**
 * Classifica um nome da planilha de entregas: carro nosso ou freteiro. É um
 * cadastro por NOME, feito uma vez — não uma marcação por entrega.
 */
async function classificarEntregador(nome, tipo) {
  const atuais = await store.entregadores.listar();
  const achado = atuais.find((e) => normalize(e.nome) === normalize(nome));
  await store.entregadores.salvar({ ...(achado || {}), id: achado?.id, nome, tipo });
  ok(tipo === 'propria' ? `${nome}: nosso carro.` : `${nome}: freteiro.`);
  refresh();
}

/**
 * O CUSTO REAL DE UM PEDIDO, DIGITADO POR ELA.
 *
 * "Não tem como eu ajustar ou te passar por aqui os custos desses pedidos em
 *  específico pra ficar certinho? Eu já mudei e já alterei, aí a gente, como é
 *  pouca coisa, a gente alterando agora dá."
 *
 * O custo do pedido é congelado na emissão: o acerto que ela fez no cadastro de
 * produtos vale dos pedidos NOVOS em diante, e os de outubro ficariam errados
 * para sempre. Aqui ela digita o custo certo uma vez, por pedido, e acabou.
 *
 * Fica GRAVADO NO PEDIDO, não na nota, por dois motivos: é do pedido que o custo
 * vem, e um pedido que rendeu várias notas divide o custo entre elas na mesma
 * proporção de antes, sem ela ter de digitar duas vezes e sem o app ter de
 * inventar um rateio diferente.
 *
 * Campo em branco desfaz: volta a valer o que o relatório trouxe. Desfazer tem
 * de ser tão fácil quanto fazer, senão um dedo errado vira número errado
 * permanente — e este número entra direto na margem que ela mostra ao pai.
 */
async function informarCusto(linha) {
  const pedido = await store.pedidos.obter(linha.pedidoId);
  if (!pedido) { erro('Pedido não encontrado na base.'); return; }

  const atual = pedido.custoManual ?? null;
  const doRelatorio = linha.pedidoCusto ?? pedido.valorCusto ?? null;
  const venda = linha.pedidoValor ?? pedido.valorTotal ?? null;
  const varias = linha.notasDoPedido > 1;

  const resposta = await formulario({
    titulo: `Custo real do pedido ${linha.pedido || pedido.numero || ''}`.trim(),
    descricao: `Venda do pedido: ${venda == null ? 'não informada' : money(venda)}\n`
      + `Custo no relatório: ${doRelatorio == null ? 'não informado' : money(doRelatorio)}`
      + `${venda && doRelatorio ? ` (${vezes(doRelatorio / venda)} a venda)` : ''}\n\n`
      + 'Digite o que este pedido custou de verdade, somando todos os itens. O valor vale '
      + 'inteiro, do jeito que você digitar, e continua valendo quando você reenviar o relatório '
      + 'de vendas.'
      + (varias ? `\n\nEste pedido gerou ${linha.notasDoPedido} notas: o custo se divide entre elas na proporção do valor de cada uma.` : ''),
    campos: [{
      chave: 'custo',
      label: 'Custo real do pedido',
      tipo: 'dinheiro',
      valor: atual ?? '',
      ajuda: atual == null
        ? 'deixe em branco para não mexer'
        : 'apague o valor para voltar ao custo do relatório',
    }],
    confirmar: 'Salvar',
  });
  if (!resposta) return;

  const qual = pedido.numero ? `Pedido ${pedido.numero}` : 'O pedido';
  const texto = String(resposta.custo ?? '').trim();
  if (!texto) {
    if (atual == null) return;
    await store.pedidos.salvar({ ...pedido, custoManual: null, custoManualEm: null });
    ok(`${qual} voltou ao custo do relatório.`);
    await semPerderOLugar();
    return;
  }

  const valor = Number(texto);
  if (!Number.isFinite(valor) || valor < 0) { erro('Custo inválido.'); return; }
  await store.pedidos.salvar({
    ...pedido,
    custoManual: cents(valor),
    custoManualEm: Date.now(),
  });
  ok(`${qual}: custo real de ${money(cents(valor))}.`);
  await semPerderOLugar();
}

/**
 * Redesenhar a tela joga ela para o topo — e são 22 pedidos para acertar. Vinte
 * e duas rolagens de volta até a tabela é o tipo de atrito que faz uma tarefa
 * curta ser abandonada no meio. A lista fica onde estava.
 */
async function semPerderOLugar() {
  const y = window.scrollY;
  await refresh();
  window.scrollTo({ top: y });
}

/**
 * "22 pedidos tiveram" ou "22 notas tiveram" — a lista é de uma coisa ou de
 * outra conforme a base que está valendo, e chamar pedido de nota faz ela
 * procurar no lugar errado.
 */
function umOuMuitos(suspeito) {
  const um = suspeito.quantidade === 1;
  if (suspeito.unidade === 'pedidos') return um ? 'pedido teve' : 'pedidos tiveram';
  return um ? 'nota teve' : 'notas tiveram';
}

/** Quanto da venda entrou com o custo do sistema dela, dito na língua da base. */
function custoDoProprioSistema(r) {
  const c = r.conferencia.coberturaDeCusto;
  const quantos = r.fonte === 'pedidos-do-periodo' ? c.pedidosComCusto : c.notasComPedido;
  if (!quantos) return '.';
  const quem = r.fonte === 'pedidos-do-periodo'
    ? `${num(quantos, 0)} pedidos entraram com o "Valor custo" do próprio pedido`
    : `${num(quantos, 0)} notas pegaram o custo do PEDIDO que as gerou`;
  return `. ${quem} (${pct(c.percentualDoPedido, 1)} da venda), que é o custo do seu próprio sistema.`;
}

/** "36,1×" — com vírgula, que é como ela lê número. */
function vezes(razao) {
  return `${num(razao, 1)}×`;
}

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
  if (r.fonte === 'relatorio-por-produto' && !r.temProdutosVendidos) {
    return h('div.empilha', { style: { gap: '14px' } },
      painel,
      vazio('📐', 'Falta o relatório de produtos vendidos',
        'A margem vem do CUSTO, e o custo vem desse relatório: produto, quantidade, custo médio, '
        + 'custo total, valor total e lucro. Sem ele o app não estima margem nenhuma — preferimos '
        + 'não ter o número a ter um número inventado.',
        botao('Mandar produtos vendidos', { tipo: 'primario', onClick: () => navigate('/arquivos/produtosVendidos') })));
  }

  /**
   * O NÚMERO GRANDE É O QUE O APP CALCULOU, e só é o do arquivo quando o app não
   * tem nada melhor.
   *
   * "Eu tava ajustando e via que a margem, o custo e o lucro não mudaram."
   *
   * Não mudavam porque aqui estava `r.totalRelatorio`: as colunas de custo e
   * lucro somadas do relatório de produtos vendidos. Número de arquivo não se
   * mexe — nem pelo custo que ela acabou de informar, nem pela régua que
   * descartou um custo absurdo. Era um número que não respondia a nada.
   */
  const topo = r.fonte === 'relatorio-por-produto' ? r.totalRelatorio : r.total;

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
          : (r.fonte === 'pedidos-do-periodo'
            ? `${num(r.pedidosDoPeriodo.quantidade, 0)} pedidos do relatório de vendas no período`
              + (r.pedidosDoPeriodo.cancelados > 0
                ? ` (${num(r.pedidosDoPeriodo.cancelados, 0)} cancelados ficaram fora, `
                  + `${money(r.pedidosDoPeriodo.vendaCancelada)}). `
                : '. ')
            : `${num(r.totalRelatorio.produtos, 0)} produtos no relatório. `))
        + 'A margem é sobre a VENDA ("de 100, quantos por cento sobram"), não sobre o custo — são '
        + 'números diferentes e misturá-los é a confusão mais comum deste assunto.'),
      r.conferencia.coberturaDeCusto.percentual != null && h('p.mini.muted',
        `Custo verificado em ${pct(r.conferencia.coberturaDeCusto.percentual, 1)} da venda`
        + (r.conferencia.coberturaDeCusto.semCusto > 0
          ? ` — faltam ${money(r.conferencia.coberturaDeCusto.semCusto)}`
          : ' — nada de fora')
        + custoDoProprioSistema(r))),

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
     * OS PEDIDOS COM CUSTO MAIOR QUE A VENDA.
     *
     * "Mandei os arquivos, tudo certinho, mas mantém o custo. Eu queria ter o
     *  valor real."
     *
     * Corrigir o cadastro do produto na origem não reescreve pedido já emitido:
     * o custo fica congelado nele. Então estes pedidos continuariam derrubando a
     * margem para sempre, e sozinhos — 28 deles levaram dois vendedores dela
     * para o negativo em outubro.
     *
     * O custo deles sai da conta, mas eles NÃO somem da tela: ficam aqui, com
     * número, cliente e os dois valores, porque é esta a lista que ela leva para
     * corrigir na origem. Esconder seria trocar um número errado por um número
     * sem explicação.
     */
    r.custoSuspeito?.quantidade > 0 && card(
      `${r.custoSuspeito.quantidade} ${umOuMuitos(r.custoSuspeito)} o custo do pedido descartado`,
      h('span.mini.muted', `${money(r.custoSuspeito.venda)} de venda fora da margem`),
      h('p.pequeno.muted', { style: { marginBottom: '10px' } },
        'O pedido registrou um custo MAIOR que a própria venda — quase sempre produto cadastrado '
        + 'em unidade diferente da que é vendida (custo do milheiro, venda por pacote). O app não '
        + 'inventa prejuízo com isso: tira esse custo da conta e mostra aqui. Corrigir o cadastro '
        + 'não conserta pedido já emitido — o custo fica congelado nele. Por isso: toque em '
        + 'INFORMAR e digite o custo real do pedido. Ele passa a valer na margem na hora, e fica '
        + 'guardado mesmo quando você reenviar o relatório.'),
      tabela({
        colunas: [
          { header: 'Pedido', key: 'pedido' },
          { header: 'NF', key: 'numero' },
          { header: 'Vendedor', key: 'vendedor' },
          { header: 'Venda', key: 'venda', tipo: 'money', alinhar: 'direita' },
          { header: 'Custo do pedido', key: 'custo', tipo: 'money', alinhar: 'direita' },
          { header: 'Custo/venda', key: 'vezes', alinhar: 'direita' },
          {
            header: 'Custo real',
            key: 'acao',
            alinhar: 'direita',
            formatar: (_v, linha) => (linha.pedidoId
              ? botao('Informar', { pequeno: true, onClick: () => informarCusto(linha) })
              : h('span.mini.muted', 'sem pedido')),
          },
        ],
        linhas: r.custoSuspeito.linhas.map((x) => ({
          ...x,
          vendedor: x.vendedor || 'sem vendedor',
          vezes: vezes(x.razao),
        })),
      })),

    /**
     * O QUE ELA JÁ CORRIGIU À MÃO, À VISTA.
     *
     * Número digitado por cima de número importado tem de aparecer em algum
     * lugar com o original do lado — senão, daqui a três meses, ninguém sabe
     * mais por que a margem daquele pedido é aquela. Dá para rever e desfazer
     * cada um, a qualquer hora.
     */
    r.custoInformado?.quantidade > 0 && card(
      `${r.custoInformado.quantidade} ${r.custoInformado.quantidade === 1 ? 'pedido com custo' : 'pedidos com custo'} informado por você`,
      h('span.mini.muted', `${money(r.custoInformado.custo)} de custo real no lugar de ${money(r.custoInformado.custoRelatorio)} do relatório`),
      h('p.pequeno.muted', { style: { marginBottom: '10px' } },
        'Estes entram na margem com o valor que VOCÊ informou, inteiro, sem conferência do app — '
        + 'e continuam valendo quando o relatório for reenviado. Toque em qualquer linha para '
        + 'corrigir ou voltar ao valor do relatório.'),
      tabela({
        colunas: [
          { header: 'Pedido', key: 'pedido' },
          { header: 'Venda do pedido', key: 'valor', tipo: 'money', alinhar: 'direita' },
          { header: 'Custo no relatório', key: 'custoRelatorio', tipo: 'money', alinhar: 'direita' },
          { header: 'Custo real', key: 'custo', tipo: 'money', alinhar: 'direita' },
          { header: 'Informado em', key: 'quando' },
        ],
        linhas: r.custoInformado.pedidos.map((x) => ({
          ...x,
          quando: x.em ? formatDate(new Date(x.em).toISOString().slice(0, 10)) : '—',
        })),
        aoClicar: (linha) => informarCusto({
          pedidoId: linha.pedidoId,
          pedido: linha.pedido,
          pedidoValor: linha.valor,
          pedidoCusto: linha.custoRelatorio,
          custoInformado: linha.custo,
        }),
      })),

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

    r.fonte === 'pedidos-do-periodo' && aviso('Estes números vêm dos PEDIDOS do relatório de '
      + 'vendas: cada pedido traz o valor vendido e o "Valor custo" na mesma linha — a mesma venda, '
      + 'a mesma unidade, o custo que o seu sistema registrou — e o relatório de comissão por venda '
      + 'diz de quem é o pedido. É aqui que o custo que você informa entra na conta.', 'ok'),

    r.fonte === 'itens-da-nota' && aviso('Estes números vêm dos ITENS DAS NOTAS (o XML das NF-e): '
      + 'cada item traz produto, quantidade e valor, e a nota traz o vendedor e a data. É o recorte '
      + 'exato do período que você escolheu — e inclui as devoluções, com sinal negativo.', 'ok'),

    (r.temComissaoPorProduto || r.fonte !== 'relatorio-por-produto') && (r.conferencia.ok
      ? aviso(`✅ A soma dos vendedores bate com o ${r.conferencia.base}: `
        + `${money(r.conferencia.vendaSomada)} vendidos. Cada venda foi atribuída a alguém — a `
        + 'margem de cada um é comparável.', 'ok')
      : aviso(`⚠️ A soma dos vendedores NÃO bate com o ${r.conferencia.base}: `
        + `${money(r.conferencia.diferencaVenda)} de diferença em venda`
        + (r.conferencia.diferencaCusto == null ? '' : ` e ${money(r.conferencia.diferencaCusto)} em custo`)
        + '. Enquanto isso existir, a margem por vendedor é indicativa, não exata — e o buraco pode '
        + 'estar inteiro em um deles.', 'ruim')),

    /* por vendedor, que é o que ela pediu, e que depende da segunda ponte */
    r.fonte === 'relatorio-por-produto' && !r.temComissaoPorProduto
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
          r.fonte === 'pedidos-do-periodo'
          ? 'Custo do vendedor: o "Valor custo" de cada pedido dele, somado — o custo que o seu '
            + 'próprio sistema registrou para aquela venda, sem média de período e sem conversão '
            + 'de unidade. Pedido com custo maior que a venda fica de fora até você informar o '
            + 'custo real, e o que ficou de fora aparece em reais logo acima.'
          : 'Custo do vendedor: quando a nota tem PEDIDO, é o "Valor custo" daquele pedido — o custo '
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
          /**
           * SÓ MOSTRA A SEPARAÇÃO QUANDO ELA EXISTE.
           *
           * A planilha de entregas não tem coluna de tipo, e aí "frota própria
           * R$ 0,00 / terceiros R$ 0,00" não é informação: é o app dizendo zero
           * onde devia dizer "não sei". No lugar vai o que o arquivo tem mesmo.
           */
          r.frete.custo.temDado && (r.frete.custo.frotaPropria || r.frete.custo.terceiros
            ? kpi({
              label: 'Frota própria', valor: money(r.frete.custo.frotaPropria), icone: '🚛',
              nota: `terceiros ${money(r.frete.custo.terceiros)}`,
            })
            : kpi({
              label: 'Entregas', valor: num(r.frete.custo.entregas, 0), icone: '📦',
              nota: r.frete.custo.semCobranca
                ? `${r.frete.custo.semCobranca} sem custo de terceiro` : null,
            }))),

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

        /**
         * QUEM FEZ A ENTREGA, E DE QUEM É O CARRO.
         *
         * "Tem tanto nossos carros quanto os freteiros. É interessante vincular
         *  qual que é qual: o VUC é nosso carro, o João é terceiro."
         *
         * Dois botões por nome, e a classificação vale para sempre — não é por
         * entrega, é por pessoa. Enquanto um nome não for classificado, o custo
         * dele fica em "não classificado" em vez de cair no lado errado.
         */
        r.frete.custo.temDado && r.frete.custo.porResponsavel.length > 0
          && secao('Quem fez a entrega', null,
            r.frete.custo.semClassificacao > 0 && aviso(
              `${money(r.frete.custo.semClassificacao)} ainda sem dizer se é carro nosso ou `
              + 'freteiro. Classifique cada nome uma vez — vale para todos os meses.', 'atencao'),
            h('div.lista', ...r.frete.custo.porResponsavel.map((e) => h('div.item',
              h('div.item__corpo',
                h('div.item__titulo', e.nome),
                h('div.item__sub',
                  h('span', money(e.valor)),
                  h('span', `${num(e.entregas, 0)} entrega(s)`),
                  e.tipo === 'propria' ? selo('nosso carro', 'ok')
                    : e.tipo === 'terceiro' ? selo('freteiro', 'info')
                      : selo('não classificado', 'atencao'))),
              e.tipo !== 'propria' && botao('Nosso carro', {
                pequeno: true, onClick: () => classificarEntregador(e.nome, 'propria'),
              }),
              e.tipo !== 'terceiro' && botao('Freteiro', {
                pequeno: true, onClick: () => classificarEntregador(e.nome, 'terceiro'),
              })))),
            h('p.mini.muted',
              'Nosso carro = frota própria, com salário fixo que não é desta entrega. Freteiro = '
              + 'terceiro, que cobra por entrega. A soma dos dois é o custo total; o que ainda não '
              + 'foi classificado fica à parte, sem cair no lado errado.')))
      : aviso('O seu relatório fiscal ainda não traz a coluna de FRETE, então o app não sabe quanto '
        + 'foi cobrado — e preferiu dizer isso a mostrar R$ 0,00, que seria outra coisa. Se o export '
        + 'puder sair com a coluna de frete (ou se você mandar os XMLs das NF-e), esta tela se '
        + 'preenche sozinha: total, por vendedor, e quanto o frete pesa sobre o que cada um vendeu.',
      'info')))(r.frete.custo.porVendedor ? COLUNAS_FRETE_MEDIDO : COLUNAS_FRETE));
}
