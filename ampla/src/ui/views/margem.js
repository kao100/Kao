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

/** A linha do TOTAL da mercadoria. O frete tem seção própria, logo abaixo. */
const TOTAL_DA_TABELA = (r) => ({
  nome: 'TOTAL',
  venda: r.total.venda,
  custo: r.total.custo,
  lucro: r.total.lucro,
  margem: r.total.margem,
});

/**
 * A MARGEM É SÓ DA MERCADORIA.
 *
 * "A gente pode considerar a margem só sobre o produto, porque o frete, ao mesmo
 *  tempo que a gente tem cobrado ele, a gente tem o custo dele também. E você
 *  não sabe o custo total do frete — tem mais outras coisas além desses custos
 *  que você vê na planilha. Por isso não dá para considerar a margem sobre o
 *  frete. O que eu preciso saber do frete é quanto que cobra e quanto que teve
 *  de gastos, que nem você tá fazendo lá embaixo. Isso mantém."
 *
 * Ela está certa, e o motivo é melhor que o meu: a coluna "com frete" somava o
 * frete cobrado ao lucro como se ele fosse lucro, quando o custo de entrega que
 * o app conhece é só o que cabe na planilha — e não é tudo. Margem com uma
 * receita cheia e um custo pela metade é margem inflada, e ela ia para o pai.
 *
 * O frete continua inteiro na seção de baixo, onde cobrado e pago ficam lado a
 * lado e a sobra é a conta honesta. Aqui em cima, só mercadoria.
 */
const COLUNAS = [
  { header: 'Vendedor', key: 'nome' },
  { header: 'Vendeu', key: 'venda', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Custo', key: 'custo', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Lucro', key: 'lucro', tipo: 'dinheiro', alinhar: 'direita' },
  { header: 'Margem', key: 'margem', tipo: 'percentual', alinhar: 'direita' },
];

/**
 * O QUE "FRETE / FATURAMENTO" QUER DIZER.
 *
 * "Queria entender como que funciona essas porcentagens. 10, 10, 7, 7. O que
 *  que ela quer dizer?"
 *
 * É quanto do que o vendedor faturou é frete: R$ 16.085,65 de frete sobre
 * R$ 161.207,98 faturados dá 10%. Não é desempenho, é MIX — quem vende material
 * pesado e entrega longe carrega mais frete; quem vende no balcão carrega menos.
 *
 * Serve para ler a sobra da entrega junto: dez por cento de frete com sobra
 * negativa é muito volume de entrega cobrado abaixo do custo, e é aí que se
 * perde dinheiro sem aparecer na margem da mercadoria.
 */
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
 * O QUE A TELA MOSTRARIA SE ELA NÃO TIVESSE INFORMADO ESSES CUSTOS.
 *
 * Sem eles, estes pedidos caem na régua (custo maior que a venda), o custo deles
 * sai da conta e a venda que dependia deles fica descoberta. Escrever os dois
 * cenários lado a lado é a única forma de ela VER que o número de cima já conta
 * com o trabalho que ela teve.
 */
function efeitoDoCustoInformado(r) {
  const i = r.custoInformado;
  const venda = r.total.venda;
  if (!venda || !i.custo) return '';
  const custoSem = cents(r.total.custo - i.custo);
  const margemSem = ((venda - custoSem) / venda) * 100;
  const coberturaSem = i.venda ? ((venda - i.venda) / venda) * 100 : null;
  return 'COMO CONFERIR QUE ELES ESTÃO VALENDO: sem estes custos informados, o app descartaria '
    + `${i.quantidade === 1 ? 'este pedido' : `estes ${i.quantidade}`} (custo maior que a venda) `
    + 'e a tela de cima mostraria custo de '
    + `${money(custoSem)} e margem de ${pct(margemSem, 1)}`
    + (coberturaSem == null ? '' : `, com só ${pct(coberturaSem, 1)} da venda coberta`)
    + `. Com eles, mostra ${money(r.total.custo)} e ${pct(r.total.margem, 1)}, com a venda inteira `
    + 'coberta. Os números de cima são os de agora, com o seu trabalho dentro.';
}

/**
 * OS NOMES DA PLANILHA DE ENTREGAS QUE NÃO ACHARAM VENDEDOR.
 *
 * "Do Carlos Eduardo, tá aqui, custo zero, não tem custo nenhum. Queria
 *  entender o porquê."
 *
 * Mostrar só o zero era a tela dizendo "não custou" quando o que acontecia era
 * "não sei de quem é". A diferença entre as duas é tudo: uma é informação sobre
 * o vendedor, a outra é um nome escrito diferente numa planilha.
 */
function quemNaoBateu(custo) {
  const ligados = (custo.ligadosPorPedaco || [])
    .map((x) => `${x.escrito} → ${x.vendedor}`).join('; ');
  /**
   * O QUE O APP LIGOU SOZINHO, DITO EM VOZ ALTA.
   *
   * Ligar "EDUARDO" a "CARLOS EDUARDO APARECIDO DO NASCIMENTO" é leitura, não
   * adivinhação — o pedaço de nome pertence a um vendedor só na base inteira.
   * Mas é uma decisão do app sobre o dinheiro de alguém, e decisão calada é como
   * se perde a confiança numa conta que está certa.
   */
  const avisoLigados = ligados
    ? `O app ligou pelo nome: ${ligados} — um pedaço de nome que pertence a um vendedor só. `
      + 'Se estiver errado, escreva o nome completo na planilha. '
    : '';
  if (!custo.semVendedor) return avisoLigados;
  return avisoLigados + naoBateuMesmo(custo);
}

function naoBateuMesmo(custo) {
  const nomes = (custo.nomesSemVendedor || []).slice(0, 4)
    .map((x) => `${x.nome} (${money(x.valor)})`).join(', ');
  const repetidos = custo.primeirosNomesRepetidos || [];
  return `⚠️ ${money(custo.semVendedor)} de entrega ficaram FORA da tabela por não achar vendedor: `
    + `${nomes}${(custo.nomesSemVendedor || []).length > 4 ? ', e outros' : ''}. `
    + 'Vendedor com frete cobrado e custo zerado quase sempre é isto: o nome na planilha está '
    + 'diferente do cadastro. '
    + (repetidos.length
      ? `Atenção: mais de um vendedor começa com "${repetidos.join('", "')}" — nesse caso o app não `
        + 'escolhe nenhum de propósito, porque escolher errado seria pior. Escreva o nome completo '
        + 'na planilha de entregas. '
      : 'Escreva o nome como está no cadastro, ou cadastre um apelido para ele. ');
}

/**
 * A CONTA DO FATURAMENTO, FECHANDO NA TELA.
 *
 * Faturamento = mercadoria + frete cobrado + notas sem item detalhado. Escrita
 * assim, com os números do período, ela responde sozinha a pergunta que custou
 * uma conversa inteira: por que a Margem mostra um número e o Hoje mostra outro.
 *
 * Quando sobra diferença que nenhuma das três partes explica, a frase diz isso
 * em vez de arredondar: diferença que o app não sabe explicar é a que precisa
 * aparecer.
 */
function contaDoFaturamento(r) {
  const f = r.faturamento;
  const frete = r.frete?.total || 0;
  const resto = cents(f.total - f.mercadoria - frete - f.semItens.valor);
  const partes = [`${money(f.mercadoria)} de mercadoria`, `${money(frete)} de frete cobrado`];
  if (f.semItens.quantidade) {
    partes.push(`${money(f.semItens.valor)} em ${num(f.semItens.quantidade, 0)} `
      + `${f.semItens.quantidade === 1 ? 'nota sem item detalhado' : 'notas sem itens detalhados'}`);
  }
  return `${money(f.total)} de faturamento = ${partes.join(' + ')}`
    + (Math.abs(resto) >= 1 ? ` + ${money(resto)} que o app ainda não sabe explicar.` : '.')
    + (f.semItens.quantidade
      ? ' Nota sem item detalhado não entra na margem: o app não sabe o que foi vendido nela.'
      : '');
}

/**
 * PARA QUE ESTE RELATÓRIO ESTÁ SERVINDO, DE VERDADE, NESTE MÊS.
 *
 * "E você acha que só esse mesmo já vai alterar tudo? Sobre a margem, custo,
 *  lucro. Não tenho que mandar mais nenhum outro relatório?"
 *
 * Ela passou um dia reexportando o relatório de produtos vendidos por causa
 * desta faixa — um relatório que, no mês dela, não encosta na margem: o custo
 * veio inteiro do "Valor custo" dos pedidos. A frase dizia "o relatório entra
 * aqui só como fonte de CUSTO", verdade em geral e mentira no caso dela, e foi
 * ela que a mandou atrás do arquivo errado.
 *
 * Uma explicação genérica numa tela que tem os dados para ser específica é uma
 * explicação errada.
 */
function paraQueServeORelatorio(r) {
  if (r.conferencia.coberturaDeCusto.soDoPedido) {
    return 'E neste mês ele NÃO entra na conta da margem: todo o custo veio do "Valor custo" dos '
      + 'seus pedidos, que é a melhor fonte que existe. O relatório fica aqui como referência e '
      + 'para apontar produtos com unidade trocada no cadastro — a margem, o custo e o lucro '
      + 'acima não mudam por causa dele.';
  }
  return 'O relatório entra aqui como fonte de CUSTO para a parte da venda que não pegou custo '
    + 'do pedido.';
}

/**
 * O QUE FALTA PARA A MARGEM SAIR DOS PEDIDOS, campo por campo.
 *
 * Para o custo vir do pedido — que é onde o custo informado por ela entra — o
 * app precisa de três coisas na mesma linha: data no período, valor total e
 * custo. Qualquer uma que falte derruba a fonte inteira, e é sempre uma coluna
 * que não foi mapeada na importação. Então a frase diz qual.
 */
function faltouParaOsPedidos(o) {
  if (!o) return '';
  if (!o.pedidosNaBase) {
    return 'Não há nenhum pedido guardado: mande o relatório de vendas do mês, que é ele que traz '
      + 'o "Valor custo" de cada pedido.';
  }
  const partes = [`${num(o.pedidosNaBase, 0)} pedidos guardados`,
    `${num(o.noPeriodo, 0)} com data neste período`,
    `${num(o.comValorTotal, 0)} com valor total`,
    `${num(o.comCusto, 0)} com custo`];
  const base = `Na sua base: ${partes.join(', ')}.`;
  if (!o.noPeriodo) {
    return `${base} Nenhum pedido caiu dentro do período — é a coluna DATA DA VENDA que não foi `
      + 'reconhecida na importação. Reenvie o relatório de vendas conferindo essa coluna.';
  }
  if (!o.comValorTotal) {
    return `${base} Nenhum pedido tem valor total — é a coluna VALOR TOTAL que não foi reconhecida. `
      + 'Reenvie o relatório de vendas conferindo essa coluna.';
  }
  if (!o.comCusto) {
    return `${base} Nenhum pedido tem custo — é a coluna VALOR DO CUSTO que não foi reconhecida. `
      + 'Reenvie o relatório de vendas conferindo essa coluna.';
  }
  if (!o.concretizados) {
    return `${base} Todos estão como cancelados neste período, então nenhum entra como venda.`;
  }
  return base;
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

/**
 * Meio a mais o relatório pode somar, e sobra folga: venda do fim do mês que só
 * vira nota no mês seguinte raramente passa de uns poucos por cento. Metade já é
 * grande demais para ser isso.
 */
function relatorioGrandeDemais(r) {
  const doRelatorio = r.conferencia.vendaDoRelatorio;
  const dasNotas = r.conferencia.vendaDasNotas;
  return !!dasNotas && doRelatorio / dasNotas > 1.5;
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
    /**
     * DIFERENÇA DE BASE TEM TAMANHO — E ACIMA DE CERTO PONTO NÃO É DIFERENÇA DE
     * BASE, É ARQUIVO DE OUTRO PERÍODO.
     *
     * "O seu relatório de produtos vendidos soma R$ 2.758.143,98 neste período e
     *  as notas somam R$ 609.296,35. Isso é NORMAL, não é erro."
     *
     * Não era normal: o arquivo dela tinha quatro meses dentro, importado como
     * se fosse outubro. Venda do mês que ainda não virou nota explica uns 10%,
     * 20% — não explica quatro vezes e meia. Chamar isso de normal foi o app
     * tranquilizando ela sobre a única coisa na tela que estava realmente
     * errada.
     *
     * O relatório não traz data por linha: o app não tem como saber o período
     * dele. O que ele sabe é o tamanho da diferença — e aí é honesto dizer "isto
     * é grande demais para ser só diferença de base" em vez de explicar como
     * normal uma coisa que não é.
     */
    r.fonte === 'itens-da-nota' && r.temProdutosVendidos && r.conferencia.diferencaDeBase > 1
      && (relatorioGrandeDemais(r)
        ? aviso(`O seu relatório de produtos vendidos soma ${money(r.conferencia.vendaDoRelatorio)} `
          + `neste período — ${vezes(r.conferencia.vendaDoRelatorio / r.conferencia.vendaDasNotas)} `
          + `o que as notas do mês somam (${money(r.conferencia.vendaDasNotas)}). Diferença de base `
          + 'existe (nem toda venda do mês sai em nota no mesmo mês), mas ela é de alguns por cento '
          + '— não disso. Quase certo que o arquivo de produtos vendidos cobre MAIS DE UM MÊS e foi '
          + 'importado como se fosse só este. Isso NÃO afeta a margem acima, que vem do custo do '
          + 'pedido. Afeta a lista de produtos com unidade trocada e esta comparação. Para resolver: '
          + 'exporte o relatório de produtos vendidos só do mês e reenvie.', 'atencao',
        botao('Reenviar produtos vendidos', { pequeno: true, onClick: () => navigate('/arquivos/produtosVendidos') }))
        : aviso(`O seu relatório de produtos vendidos soma ${money(r.conferencia.vendaDoRelatorio)} `
          + `neste período e as notas somam ${money(r.conferencia.vendaDasNotas)} — `
          + `${money(r.conferencia.diferencaDeBase)} de diferença. Isso é NORMAL, não é erro: o `
          + 'relatório conta as VENDAS do mês e esta tela conta as NOTAS do mês, e nem toda venda '
          + 'sai em nota no mesmo mês. O faturamento é a nota fiscal. '
          + paraQueServeORelatorio(r), 'info')),

    secao('A margem do período',
      exportadores(() => ({
        titulo: 'Margem do período',
        subtitulo: `${formatDate(filtro.de)} a ${formatDate(filtro.ate)}`,
        nomeArquivo: `margem_total_${filtro.de}`,
        colunas: COLUNAS,
        linhas: r.vendedores,
        total: TOTAL_DA_TABELA(r),
      })),
      /**
       * O NÚMERO GRANDE É O DA NOTA FISCAL, sempre que o XML existir.
       *
       * Era o do relatório de produtos vendidos, e isso punha 22,5% de margem no
       * alto da tela — a margem de outra base, com as linhas de unidade trocada
       * dentro. O faturamento é a nota; o relatório é fonte de custo.
       */
      /**
       * O FATURAMENTO VEM PRIMEIRO, E É O MESMO NÚMERO DA TELA DO HOJE.
       *
       * "Faturamento R$ 658.510,63 na aba Hoje está correto, mas no Margem e
       *  frete está R$ 609.296,35. O faturamento num lugar tá num e no outro tá
       *  em outro. O correto é 658.510,63."
       *
       * Os dois números estavam certos e mediam coisas diferentes — faturamento
       * é a nota cheia, a margem é da mercadoria — mas a tela mostrava só o
       * segundo, com o mesmo rótulo que a outra usa para o primeiro. Dois
       * números com o mesmo nome em telas diferentes destrói a confiança na base
       * inteira, e com razão.
       *
       * Agora os dois aparecem juntos, com a conta no meio: faturamento menos
       * frete menos notas sem item detalhado é a mercadoria, e é sobre ela que a
       * margem é medida.
       */
      h('div.grade.grade--2',
        kpi({
          label: 'Faturamento', valor: money(r.faturamento.total), icone: '🧾', cor: 'info',
          nota: `${num(r.faturamento.notas, 0)} notas · o mesmo número da tela Hoje`,
        }),
        kpi({
          label: 'Mercadoria', valor: money(r.faturamento.mercadoria), icone: '📦', cor: 'info',
          nota: 'sem o frete — é sobre ela que a margem é medida',
        }),
        kpi({ label: 'Custo', valor: money(topo.custo), icone: '🏷️', cor: 'laranja' }),
        kpi({ label: 'Lucro', valor: money(topo.lucro), icone: '💰', cor: 'ok' }),
        kpi({
          label: 'Margem', valor: topo.margem == null ? '—' : pct(topo.margem, 1),
          icone: '📐', cor: 'roxo', nota: 'sobre a mercadoria',
        }),
        kpi({
          label: 'Frete cobrado', valor: money(r.frete.total), icone: '🚚',
          nota: 'fora da margem — a conta dele fica abaixo',
        })),
      h('p.mini.muted', { style: { marginTop: '8px' } }, contaDoFaturamento(r)),
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
      /**
       * A PROVA DE QUE ELES ESTÃO ENTRANDO.
       *
       * "Sobre os 22 pedidos com custo informado por mim, eles não foram
       *  parametrizados ainda. Eu sei que você falou que o custo é R$ 402.209,53,
       *  mas eu acho que não é."
       *
       * Ela não tinha como saber. O card dizia que os 22 estavam lá, e o número
       * de cima não mudava na frente dela — porque ela já os tinha informado
       * quando olhou pela primeira vez. "Está aplicado" é uma afirmação minha;
       * o que convence é o número que apareceria se não estivesse.
       */
      h('p.pequeno.muted', { style: { marginBottom: '10px' } }, efeitoDoCustoInformado(r)),
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

    /**
     * QUANDO A MARGEM NÃO VEM DOS PEDIDOS, A TELA DIZ O QUE FALTOU — COM NÚMERO.
     *
     * "Eu já vi aqui e eu tô na versão certa, versão 59, mas não mudou nada no
     *  que eu preciso."
     *
     * O app caía na fonte pior em silêncio. A tela ficava igual à de antes do
     * conserto, e nem ela nem eu tínhamos como saber qual campo faltava na base.
     * Duas rodadas foram embora assim, adivinhando por print.
     *
     * Agora a contagem está na tela: qual campo faltou, em quantos pedidos. É a
     * diferença entre "reenvie o relatório com a coluna X mapeada" e mais uma
     * semana de palpite.
     */
    r.fonte === 'relatorio-por-produto' && aviso(
      'ATENÇÃO: estes números são as colunas CUSTO TOTAL e LUCRO do seu relatório de produtos '
      + 'vendidos, somadas. São números do arquivo — eles não mudam quando você informa o custo '
      + 'de um pedido, nem quando o app descarta um custo absurdo. '
      + faltouParaOsPedidos(r.origemDosNumeros), 'atencao',
      botao('Reenviar relatório de vendas', { pequeno: true, onClick: () => navigate('/arquivos/pedidos') })),

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
          total: TOTAL_DA_TABELA(r),
        })),
        tabela({
          colunas: COLUNAS,
          linhas: r.vendedores,
          total: TOTAL_DA_TABELA(r),
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
        h('p.mini.muted',
          'VENDEU e MARGEM são só a MERCADORIA. O frete não entra aqui: ele é cobrado à parte e '
          + 'tem custo próprio, que o app só conhece até onde a planilha de entregas alcança. '
          + 'Somá-lo à margem daria uma receita cheia com um custo pela metade. O que ele cobrou '
          + 'e o que ele custou estão na seção de frete, logo abaixo.'),
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
                + quemNaoBateu(r.frete.custo)
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

        /**
         * A COLUNA TEM DE SOMAR O MESMO QUE O CARTÃO.
         *
         * "O frete que sobra agora é 7.370,23. E aqui tá 6.880,23. A sobra tá
         *  diferente do que tá na sobra do outro."
         *
         * O cartão "Sobra da entrega" descontava TODO o custo de entrega do
         * período; a tabela descontava só o que tinha dono. A diferença eram os
         * R$ 490,00 da entrega sem nome na planilha — e ela ficava invisível,
         * virando dois números com o mesmo nome, outra vez.
         *
         * O custo sem dono é custo igual: ele entra na tabela como uma linha
         * própria, em vez de sumir do total. Aí a coluna fecha com o cartão, e a
         * linha diz sozinha o que está faltando resolver.
         */
        tabela({
          colunas: colunasFrete,
          linhas: r.frete.custo.semVendedor > 0
            ? [...r.frete.vendedores, {
              nome: 'sem vendedor na planilha',
              frete: 0,
              custoReal: r.frete.custo.semVendedor,
              custoRateado: null,
              resultado: cents(-r.frete.custo.semVendedor),
              faturamento: null,
              peso: null,
              notas: null,
            }]
            : r.frete.vendedores,
          total: {
            nome: 'TOTAL',
            frete: r.frete.total,
            custoRateado: r.frete.custo.temDado && !r.frete.custo.porVendedor ? r.frete.custo.total : null,
            custoReal: r.frete.custo.porVendedor ? r.frete.custo.total : null,
            resultado: r.frete.custo.porVendedor ? r.frete.custo.resultado : null,
          },
        }),

        h('p.mini.muted',
          'FRETE / FATURAMENTO é quanto do que cada um faturou é frete — não é desempenho, é MIX: '
          + 'quem vende material pesado e entrega longe carrega mais frete, quem vende no balcão '
          + 'carrega menos. Vale ler junto com a SOBRA: peso alto com sobra negativa é muita '
          + 'entrega cobrada abaixo do custo, e esse dinheiro não aparece na margem da mercadoria.'),

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
