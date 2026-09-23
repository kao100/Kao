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
  },
  {
    id: 'gc-receber',
    fonte: 'receber',
    nome: 'Relatório de contas a receber',
    colunas: ['Destinado à', 'CPF', 'CNPJ', 'Descrição', 'Forma de pagamento', 'Vencimento',
      'Situação', 'Valor', 'Valor total', 'NF-e'],
    mapa: {
      clienteNome: 'Destinado à',
      clienteDoc: ['CNPJ', 'CPF'],
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
      fornecedorDoc: ['CNPJ', 'CPF'],
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
    },
    observacao: 'Estoque, fornecedor e valor de varejo vêm no relatório, mas ainda não são '
      + 'usados por nenhuma tela — quando forem, entram sem você precisar reenviar nada.',
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
