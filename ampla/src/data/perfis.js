/**
 * PERFIS DE FÁBRICA — os relatórios do Gestão Click, já reconhecidos.
 *
 * "Eu não quero ter que fazer essa ligação toda vez que eu te mandar um
 *  relatório."
 *
 * Cada perfil guarda o cabeçalho exato de um relatório e a ligação coluna →
 * campo que ele exige. Quando o cabeçalho do arquivo bate com um destes, o app
 * pula a tela de mapeamento inteira: reconhece o relatório, sabe de qual fonte
 * ele é, e vai direto para a conferência.
 *
 * Os cabeçalhos abaixo foram tirados dos arquivos de verdade, e cada um deles
 * é teste fixo em tools/fixtures.
 *
 * Nada aqui é obrigatório: se um dia o Gestão Click mudar uma coluna, o perfil
 * deixa de casar e o app volta a perguntar, em vez de ligar errado calado.
 */

/**
 * Só as colunas que importam para o reconhecimento (as vazias são ignoradas).
 * Um campo ligado a uma LISTA de colunas aceita a primeira que vier preenchida:
 * o Gestão Click separa CPF e CNPJ em duas colunas e cada linha preenche só a
 * sua.
 */
export const PERFIS = [
  {
    id: 'gc-vendas',
    fonte: 'pedidos',
    nome: 'Relatório de vendas',
    colunas: ['Nº', 'Cliente', 'Data', 'Prazo de entrega', 'Situação', 'Valor custo', 'Valor'],
    mapa: {
      numero: 'Nº',
      clienteNome: 'Cliente',
      data: 'Data',
      status: 'Situação',
      valorCusto: 'Valor custo',
      valorTotal: 'Valor',
    },
    observacao: 'Este relatório não traz a coluna do vendedor.',
  },
  /**
   * O MESMO RELATÓRIO DE VENDAS, exportado sem as colunas de prazo e situação.
   *
   * Vem DEPOIS do completo de propósito: o cabeçalho de sete colunas contém este
   * de cinco, e quem chega primeiro ganha. Assim o export completo continua sendo
   * reconhecido como completo.
   */
  {
    id: 'gc-vendas-simples',
    fonte: 'pedidos',
    nome: 'Relatório de vendas (sem prazo e situação)',
    colunas: ['Nº', 'Cliente', 'Data', 'Valor custo', 'Valor'],
    mapa: {
      numero: 'Nº',
      clienteNome: 'Cliente',
      data: 'Data',
      valorCusto: 'Valor custo',
      valorTotal: 'Valor',
    },
    observacao: 'Sem a coluna SITUAÇÃO, o app não separa venda concretizada de cancelada — o '
      + 'pedido entra, mas só é cobrado vendedor dele quando já tem nota. E sem a coluna VENDEDOR '
      + 'a comissão não fecha sozinha. Vale incluir as duas no próximo export.',
  },
  {
    id: 'gc-nfe',
    fonte: 'nfs',
    nome: 'Relatório de notas fiscais (NF-e)',
    colunas: ['Nº', 'Data', 'Razão social/Nome', 'CNPJ/CPF', 'Total', 'Situação'],
    mapa: {
      numero: 'Nº',
      dataEmissao: 'Data',
      clienteNome: 'Razão social/Nome',
      clienteDoc: 'CNPJ/CPF',
      valorTotal: 'Total',
      status: 'Situação',
    },
    observacao: 'Se o export trouxer a coluna NATUREZA DA OPERAÇÃO, ela é reconhecida sozinha — e '
      + 'é ela que separa venda de DEVOLUÇÃO. Sem ela, a devolução entra como faturamento e '
      + 'ainda gera comissão.',
  },
  {
    id: 'gc-comissao',
    fonte: 'comissoes',
    nome: 'Relatório de comissão por venda',
    colunas: ['Nº', 'Cliente', 'Vendedor', 'Data de emissão', 'Valor', 'Comissão'],
    mapa: {
      numero: 'Nº',
      clienteNome: 'Cliente',
      vendedorNome: 'Vendedor',
      data: 'Data de emissão',
      valor: 'Valor',
      comissao: 'Comissão',
    },
    observacao: 'É deste relatório que cada venda ganha dono. A comissão que ele traz é a que o '
      + 'sistema calculou por pedido — o app recalcula sobre a nota emitida e mostra as duas.',
  },
  {
    id: 'gc-receber',
    fonte: 'receber',
    nome: 'Relatório de contas a receber',
    colunas: ['Destinado à', 'CPF', 'CNPJ', 'Descrição', 'Forma de pagamento', 'Vencimento',
      'Situação', 'Valor', 'Valor total', 'NF-e'],
    mapa: {
      clienteNome: 'Destinado à',
      // o export traz CPF e CNPJ em colunas separadas: cada um no seu campo
      clienteDoc: 'CNPJ',
      clienteCpf: 'CPF',
      descricao: 'Descrição',
      formaPagamento: 'Forma de pagamento',
      vencimento: 'Vencimento',
      status: 'Situação',
      valor: 'Valor total',
      nfNumero: 'NF-e',
    },
  },
  {
    id: 'gc-pagar',
    fonte: 'pagar',
    nome: 'Relatório de contas a pagar',
    colunas: ['Destinado à', 'CPF', 'CNPJ', 'Descrição', 'Forma de pagamento', 'Data de vencimento',
      'Situação', 'Valor', 'Valor total', 'NF-e'],
    mapa: {
      fornecedorNome: 'Destinado à',
      fornecedorDoc: 'CNPJ',
      fornecedorCpf: 'CPF',
      descricao: 'Descrição',
      formaPagamento: 'Forma de pagamento',
      vencimento: 'Data de vencimento',
      status: 'Situação',
      valor: 'Valor total',
      nfNumero: 'NF-e',
    },
    observacao: 'Este relatório não traz o plano de contas, então o DRE sai sem a divisão por conta.',
  },
  {
    id: 'gc-orcamentos',
    fonte: 'orcamentos',
    nome: 'Relatório de orçamentos',
    colunas: ['Nº', 'Cliente', 'Data', 'Previsão de entrega', 'Situação', 'Valor'],
    mapa: {
      numero: 'Nº',
      clienteNome: 'Cliente',
      data: 'Data',
      status: 'Situação',
      valorTotal: 'Valor',
    },
  },
  {
    id: 'gc-produtos',
    fonte: 'produtos',
    nome: 'Relatório de produtos',
    colunas: ['Cód. interno', 'Nome', 'Valor de custo', 'NCM', 'Grupo', 'Estoque',
      'Fornecedor', 'Vr. Varejo'],
    mapa: {
      codigo: 'Cód. interno',
      descricao: 'Nome',
      custo: 'Valor de custo',
      ncm: 'NCM',
      categoria: 'Grupo',
      precoVenda: 'Vr. Varejo',
      estoque: 'Estoque',
    },
    observacao: 'Entra tudo: custo, valor de varejo (o preço de venda), grupo, NCM e estoque.',
  },
  {
    /**
     * O mesmo relatório de produtos, exportado sem a coluna GRUPO. É o que sai
     * quando o filtro de grupo não é usado — e como o perfil exige todas as
     * colunas que lista, sem esta variante o arquivo caía na tela de mapeamento.
     */
    id: 'gc-produtos-sem-grupo',
    fonte: 'produtos',
    nome: 'Relatório de produtos (sem a coluna Grupo)',
    colunas: ['Cód. interno', 'Nome', 'Valor de custo', 'NCM', 'Estoque', 'Fornecedor', 'Vr. Varejo'],
    mapa: {
      codigo: 'Cód. interno',
      descricao: 'Nome',
      custo: 'Valor de custo',
      ncm: 'NCM',
      precoVenda: 'Vr. Varejo',
      estoque: 'Estoque',
    },
    observacao: 'Sem a coluna Grupo, a Curva ABC por categoria fica sem agrupamento — o resto '
      + 'entra igual. Se der para exportar com o Grupo, ela passa a funcionar.',
  },
  {
    id: 'gc-produtos-vendidos',
    fonte: 'produtosVendidos',
    nome: 'Relatório de produtos vendidos',
    colunas: ['Produto', 'Quantidade', 'Custo médio', 'Custo total', 'Valor total', 'Lucro'],
    mapa: {
      descricao: 'Produto',
      quantidade: 'Quantidade',
      custoUnitario: 'Custo médio',
      custoTotal: 'Custo total',
      valorTotal: 'Valor total',
      lucro: 'Lucro',
    },
    observacao: 'Este é o relatório que faz a margem sair sem o app estimar nada: o custo vem do '
      + 'seu sistema. Ele não traz data — escolha o mês na importação.',
  },
  {
    id: 'gc-comissao-produto',
    fonte: 'comissaoProduto',
    nome: 'Relatório de comissão por produto',
    colunas: ['Produto', 'Vendedor', 'Quantidade', 'Valor total', 'Comissão integral (%)'],
    mapa: {
      descricao: 'Produto',
      vendedorNome: 'Vendedor',
      quantidade: 'Quantidade',
      valorTotal: 'Valor total',
      comissao: 'Comissão integral (%)',
    },
    observacao: 'As linhas de total por vendedor (as que vêm sem produto) são descartadas — elas '
      + 'repetem o que já está nas linhas de cima e dobrariam todos os números.',
  },
  {
    id: 'gc-clientes',
    fonte: 'clientes',
    nome: 'Relatório de clientes',
    colunas: ['Nome/Razão social', 'Documento', 'E-mail', 'Nome/Nome Fantasia',
      'Razão Social/Nome Social', 'CNPJ', 'CPF', 'Situação', 'Vendedor/Responsável'],
    mapa: {
      nome: ['Razão Social/Nome Social', 'Nome/Nome Fantasia', 'Nome/Razão social'],
      documento: ['CNPJ', 'CPF', 'Documento'],
      email: 'E-mail',
      // "Situação" (Ativo/Inativo) vem no relatório, mas o app ainda não usa
      // status de cliente para nada — ligar um campo que ninguém lê só criaria
      // a impressão de que alguma tela leva isso em conta.
    },
    // o vendedor do cadastro NÃO é usado: a empresa confirmou que não é
    // confiável, porque o mesmo cliente compra de vendedores diferentes
    observacao: 'A coluna "Vendedor/Responsável" existe, mas não é usada para atribuir '
      + 'faturamento — o mesmo cliente compra de vendedores diferentes.',
  },
];

const limpar = (v) => String(v ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** As colunas preenchidas de um cabeçalho, normalizadas e em ordem. */
function assinaturaDe(linha) {
  return linha.map(limpar).filter(Boolean);
}

/**
 * Este cabeçalho é de algum relatório conhecido?
 * Exige que TODAS as colunas do perfil estejam presentes, na ordem — assim um
 * relatório parecido, mas diferente, não passa por engano.
 */
PERFIS.push({
  id: 'forms-entrega',
  fonte: 'fretes',
  nome: 'Solicitação de entrega (planilha do Google)',
  colunas: ['PERÍODO', 'NOTA FISCAL OU PEDIDO', 'VENDEDOR', 'RESPONSÁVEL PELA ENTREGA', 'PREÇO CUSTO (F)'],
  mapa: {
    descricao: 'NOTA FISCAL OU PEDIDO',
    vendedorNome: 'VENDEDOR',
    responsavel: 'RESPONSÁVEL PELA ENTREGA',
    valor: 'PREÇO CUSTO (F)',
  },
  /**
   * O QUE ESTA PLANILHA RESPONDE, E SÓ ISSO:
   *
   * "Não se apegue ao pedido de nota fiscal, nem nada. Porque às vezes a nota
   *  fiscal é entregue com um pedido. Se apegue ao custo que tem cada... não
   *  precisa nem ser cada venda, mas atente ao custo. Não queira abraçar todas
   *  as informações; pega só o que é importante."
   *
   * Então o app lê três coisas: QUANTO custou, de QUEM é a venda e QUEM
   * entregou. O número da nota/pedido entra como referência da linha, para ela
   * se achar na planilha — não para amarrar entrega a venda. Uma entrega leva
   * nota e pedido juntos, e forçar esse vínculo erraria em silêncio.
   *
   * A planilha também não tem data: o mês é o que ela escolhe na importação.
   */
  observacao: 'Esta planilha não tem coluna de data — escolha o mês na importação e exporte um '
    + 'mês por vez. O que o app aproveita dela é o CUSTO de cada entrega, o VENDEDOR da venda e '
    + 'QUEM entregou. É com isso que ele responde quanto o frete de cada vendedor custou.',
});

export function perfilDoCabecalho(linha) {
  const achadas = assinaturaDe(linha);
  if (!achadas.length) return null;
  return PERFIS.find((p) => {
    const esperadas = p.colunas.map(limpar);
    let i = 0;
    for (const col of esperadas) {
      const onde = achadas.indexOf(col, i);
      if (onde < 0) return false;
      i = onde + 1;
    }
    return true;
  }) || null;
}

/**
 * Procura, nas primeiras linhas do arquivo, uma que seja cabeçalho conhecido.
 * Relatório de sistema tem título, período e totais antes da tabela.
 */
export function reconhecer(linhas, limite = 25) {
  for (let i = 0; i < Math.min(linhas.length, limite); i += 1) {
    const perfil = perfilDoCabecalho(linhas[i]);
    if (perfil) return { perfil, headerRow: i };
  }
  return null;
}
