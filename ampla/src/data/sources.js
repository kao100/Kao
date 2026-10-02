/**
 * CATÁLOGO DE FONTES DE DADOS
 *
 * Cada fonte aqui corresponde a um relatório que a AMPLA consegue exportar de
 * verdade, com as colunas que existem nele. O que o sistema não exporta, não
 * aparece pedindo.
 *
 * REGRA DE OURO (definida pela empresa):
 *   NENHUM CAMPO É OBRIGATÓRIO.
 *   O app importa o que vier e depois avisa o que ficou faltando.
 *   Ele nunca bloqueia o envio nem recusa uma linha por falta de informação.
 *
 * Os campos marcados como `chave: true` são os que permitem reconhecer o mesmo
 * registro numa reimportação. Sem eles o registro entra do mesmo jeito — só
 * passa a ser identificado pelo conteúdo da linha.
 *
 * tipo: 'texto' | 'numero' | 'dinheiro' | 'data' | 'inteiro'
 */

export const PERIODICIDADE = {
  diaria: { label: 'Diária', ordem: 1 },
  semanal: { label: 'Semanal', ordem: 2 },
  mensal: { label: 'Mensal', ordem: 3 },
  demanda: { label: 'Sob demanda', ordem: 4 },
};

const campo = (chave, label, tipo, opts = {}) => ({
  chave, label, tipo, chaveNatural: false, sinonimos: [], ...opts,
});

/** Sinônimos que aparecem em quase todo relatório. */
const DOC = ['cpf', 'cnpj', 'cpf/cnpj', 'cnpj/cpf', 'documento', 'cpf cnpj', 'doc'];
const SITUACAO = ['situacao', 'situação', 'status', 'estado'];
const VALOR_TOTAL = ['valor total', 'total', 'vl total', 'valor'];
// o Gestão Click abrevia a coluna do número como "Nº" em vários relatórios
const NUMERO_CURTO = ['nº', 'n°', 'nº.', 'n.', 'no', 'num', 'nro', 'n'];

export const FONTES = {
  /* ------------------------------------------------------------------ fiscal */
  nfs: {
    id: 'nfs',
    nome: 'Notas fiscais (relatório fiscal)',
    icone: '🧾',
    periodicidade: 'diaria',
    store: 'nfs',
    verdadeDe: 'Faturamento oficial: valor e data de emissão.',
    descricao: 'Relatório fiscal de notas emitidas. É a base do faturamento — '
      + 'o mês da venda é o mês da NOTA, não o do pedido.',
    formatos: ['xlsx', 'csv', 'pdf', 'xml', 'zip'],
    colunasReais: ['número da nota', 'data', 'razão social', 'CPF/CNPJ', 'total', 'situação',
      'natureza da operação'],
    campos: [
      campo('numero', 'Número da nota', 'texto', { chaveNatural: true, sinonimos: ['nota', 'nf', 'numero nota', 'num nota', 'nro nota', 'numero', 'documento'] }),
      campo('dataEmissao', 'Data', 'data', { sinonimos: ['data', 'emissao', 'emissão', 'data emissao', 'data da nota'] }),
      campo('clienteNome', 'Razão social', 'texto', { sinonimos: ['razao social', 'razão social', 'cliente', 'destinatario', 'nome'] }),
      campo('clienteDoc', 'CPF / CNPJ', 'texto', { sinonimos: DOC }),
      campo('valorTotal', 'Total', 'dinheiro', { sinonimos: VALOR_TOTAL }),
      campo('status', 'Situação', 'texto', { sinonimos: SITUACAO }),
      /**
       * NATUREZA DA OPERAÇÃO — é ela que diz o que é DEVOLUÇÃO.
       *
       * Sem esta coluna, uma devolução entra como venda normal: soma no
       * faturamento e gera comissão sobre dinheiro que voltou. Ela sempre
       * existiu no XML, mas não havia como ligá-la num relatório — agora há.
       */
      campo('naturezaOperacao', 'Natureza da operação', 'texto', {
        sinonimos: ['natureza', 'natureza da operacao', 'natureza da operação', 'natureza operacao',
          'nat operacao', 'nat op', 'cfop descricao', 'tipo de operacao', 'tipo operacao', 'finalidade'],
      }),
      // existem no XML, e em alguns relatórios; se não vier, tudo bem
      campo('serie', 'Série', 'texto', { sinonimos: ['serie', 'série'] }),
      campo('pedidoNumero', 'Pedido', 'texto', { sinonimos: ['pedido', 'num pedido', 'numero pedido', 'nro pedido'] }),
    ],
    ajuda: 'INCLUA A COLUNA NATUREZA DA OPERAÇÃO. É ela que separa venda de DEVOLUÇÃO: sem ela, '
      + 'a devolução entra como faturamento e ainda gera comissão. Este relatório também não traz '
      + 'o pedido nem o vendedor — quem faz essa ponte é o CONTAS A RECEBER, que tem a nota e o '
      + 'número do pedido na mesma linha.',
  },

  /* ------------------------------------------------------------------ vendas */
  pedidos: {
    id: 'pedidos',
    nome: 'Pedidos de venda (relatório de vendas)',
    icone: '🤝',
    periodicidade: 'diaria',
    store: 'pedidos',
    verdadeDe: 'Pedidos concretizados, com custo e valor.',
    descricao: 'Relatório de vendas do sistema. Traz custo do pedido — é dele que sai a margem. '
      + 'Só as vendas com situação CONCRETIZADA entram no resultado.',
    formatos: ['xlsx', 'csv', 'pdf'],
    colunasReais: ['número do pedido', 'cliente', 'data da venda', 'vendedor', 'situação', 'valor do custo', 'valor total'],
    campos: [
      campo('numero', 'Número do pedido', 'texto', { chaveNatural: true, sinonimos: ['pedido', 'numero', 'num pedido', 'nro pedido', 'codigo', 'os', ...NUMERO_CURTO] }),
      campo('clienteNome', 'Cliente', 'texto', { sinonimos: ['cliente', 'razao social', 'razão social', 'nome'] }),
      campo('data', 'Data da venda', 'data', { sinonimos: ['data', 'data venda', 'data da venda', 'emissao'] }),
      // é esta coluna que faz a comissão fechar sem marcação nenhuma
      campo('vendedorNome', 'Vendedor', 'texto', { sinonimos: ['vendedor', 'representante', 'consultor', 'vendedor responsavel', 'vendedora'] }),
      campo('status', 'Situação', 'texto', { sinonimos: SITUACAO }),
      campo('valorCusto', 'Valor do custo', 'dinheiro', { sinonimos: ['custo', 'valor custo', 'valor do custo', 'vl custo', 'cmv'] }),
      campo('valorTotal', 'Valor total', 'dinheiro', { sinonimos: VALOR_TOTAL }),
      campo('clienteDoc', 'CPF / CNPJ', 'texto', { sinonimos: DOC }),
    ],
    ajuda: 'Inclua a coluna VENDEDOR no export. É ela que faz a comissão fechar sozinha: o '
      + 'vendedor do pedido passa para todas as notas daquele pedido, sem você marcar nada.',
  },

  orcamentos: {
    id: 'orcamentos',
    nome: 'Orçamentos',
    icone: '📝',
    periodicidade: 'semanal',
    store: 'orcamentos',
    verdadeDe: 'Quanto foi orçado e quanto virou venda.',
    descricao: 'Relatório de orçamentos. Permite ver taxa de conversão: quanto saiu de orçamento '
      + 'e quanto virou pedido.',
    formatos: ['xlsx', 'csv', 'pdf'],
    colunasReais: ['número do orçamento', 'cliente', 'data', 'situação', 'valor'],
    campos: [
      campo('numero', 'Número do orçamento', 'texto', { chaveNatural: true, sinonimos: ['orcamento', 'orçamento', 'numero', 'num orcamento', 'codigo'] }),
      campo('clienteNome', 'Cliente', 'texto', { sinonimos: ['cliente', 'razao social', 'nome'] }),
      campo('data', 'Data', 'data', { sinonimos: ['data', 'data orcamento', 'emissao'] }),
      campo('status', 'Situação', 'texto', { sinonimos: SITUACAO }),
      campo('valorTotal', 'Valor', 'dinheiro', { sinonimos: VALOR_TOTAL }),
      campo('clienteDoc', 'CPF / CNPJ', 'texto', { sinonimos: DOC }),
    ],
  },

  /**
   * O relatório que dá dono a cada venda. Nem o fiscal nem o de pedidos trazem
   * vendedor — é este que traz, e sem ele nenhuma comissão sai.
   */
  comissoes: {
    id: 'comissoes',
    nome: 'Comissão por venda',
    icone: '🧮',
    periodicidade: 'diaria',
    store: 'comissoesRelatorio',
    verdadeDe: 'O VENDEDOR de cada venda.',
    descricao: 'Relatório de comissão por venda. É dele que sai o vendedor. A comissão que vem '
      + 'aqui é a que o sistema calculou POR PEDIDO; o app recalcula sobre a nota emitida, que é '
      + 'o que a empresa considera venda do mês, e mostra as duas lado a lado.',
    formatos: ['xlsx', 'csv', 'pdf'],
    colunasReais: ['número', 'cliente', 'vendedor', 'data de emissão', 'valor', 'comissão'],
    campos: [
      campo('numero', 'Número', 'texto', { chaveNatural: true, sinonimos: ['pedido', 'numero', 'venda', 'num', 'nro', ...NUMERO_CURTO] }),
      campo('clienteNome', 'Cliente', 'texto', { sinonimos: ['cliente', 'razao social', 'razão social', 'nome'] }),
      campo('vendedorNome', 'Vendedor', 'texto', { sinonimos: ['vendedor', 'representante', 'consultor', 'vendedora', 'responsavel'] }),
      campo('data', 'Data de emissão', 'data', { sinonimos: ['data de emissao', 'data de emissão', 'data', 'emissao', 'emissão'] }),
      campo('valor', 'Valor', 'dinheiro', { sinonimos: VALOR_TOTAL }),
      campo('comissao', 'Comissão', 'dinheiro', { sinonimos: ['comissao', 'comissão', 'valor comissao', 'vl comissao'] }),
    ],
    ajuda: 'Mande este todo dia junto com os outros. É por ele que cada venda ganha dono — '
      + 'sem ele, nenhuma comissão sai.',
  },

  /* -------------------------------------------------------------- financeiro */
  receber: {
    id: 'receber',
    nome: 'Contas a receber',
    icone: '💰',
    periodicidade: 'diaria',
    store: 'receber',
    verdadeDe: 'Títulos, vencimentos, banco de entrada — e a ponte entre nota e pedido.',
    descricao: 'Relatório financeiro de contas a receber. É a fonte mais importante do app: '
      + 'tem a NOTA FISCAL e a DESCRIÇÃO (número do pedido) na mesma linha, o que liga '
      + 'faturamento ↔ pedido ↔ vendedor sem adivinhação.',
    formatos: ['xlsx', 'csv', 'pdf'],
    colunasReais: ['destinado a', 'CPF/CNPJ', 'descrição (nº do pedido)', 'forma de pagamento',
      'conta bancária', 'vencimento', 'situação', 'valor total', 'nota fiscal'],
    campos: [
      campo('clienteNome', 'Destinado a', 'texto', { sinonimos: ['destinado a', 'destinatario', 'cliente', 'razao social', 'nome', 'sacado'] }),
      /**
       * O relatório dela sai com CPF e CNPJ em DUAS colunas, cada linha
       * preenchendo só a sua. Ligar as duas no mesmo campo deixava uma de fora.
       * Agora são dois campos, e o app usa a que vier preenchida.
       */
      campo('clienteDoc', 'CNPJ', 'texto', { sinonimos: ['cnpj', 'cnpj cliente', 'cnpj do cliente'] }),
      campo('clienteCpf', 'CPF', 'texto', { sinonimos: ['cpf', 'cpf cliente', 'cpf do cliente'] }),
      campo('descricao', 'Descrição (nº do pedido)', 'texto', { chaveNatural: true, sinonimos: ['descricao', 'descrição', 'historico', 'observacao', 'referencia', 'pedido'] }),
      campo('nfNumero', 'Nota fiscal', 'texto', { sinonimos: ['nota fiscal', 'nota', 'nf', 'numero nf', 'num nota'] }),
      campo('formaPagamento', 'Forma de pagamento', 'texto', { sinonimos: ['forma de pagamento', 'forma pagamento', 'forma', 'tipo pagamento', 'meio'] }),
      campo('banco', 'Conta bancária', 'texto', { sinonimos: ['conta bancaria', 'conta bancária', 'banco', 'conta', 'carteira', 'portador'] }),
      campo('vencimento', 'Vencimento', 'data', { sinonimos: ['vencimento', 'venc', 'data vencimento', 'vcto', 'dt venc'] }),
      campo('status', 'Situação', 'texto', { sinonimos: SITUACAO }),
      campo('valor', 'Valor total', 'dinheiro', { sinonimos: VALOR_TOTAL }),
      campo('emissao', 'Emissão', 'data', { sinonimos: ['emissao', 'emissão', 'data emissao'] }),
      campo('dataRecebimento', 'Data do recebimento', 'data', { sinonimos: ['data pagamento', 'recebimento', 'baixa', 'liquidacao', 'data recebimento'] }),
    ],
    ajuda: 'Inclua a coluna NOTA FISCAL no export. É ela, junto com a descrição, que fecha o '
      + 'vínculo entre o relatório fiscal e o de vendas.',
  },

  pagar: {
    id: 'pagar',
    nome: 'Contas a pagar',
    icone: '📤',
    periodicidade: 'semanal',
    store: 'pagar',
    verdadeDe: 'Compromissos, vencimentos, banco de saída e plano de contas (base do DRE).',
    descricao: 'Relatório financeiro de contas a pagar. O PLANO DE CONTAS é o que permite montar '
      + 'o DRE e ver para onde o dinheiro está indo.',
    formatos: ['xlsx', 'csv', 'pdf'],
    colunasReais: ['destinado a', 'CPF/CNPJ', 'descrição', 'plano de contas', 'forma de pagamento',
      'conta bancária', 'data de vencimento', 'situação', 'valor total', 'nota fiscal'],
    campos: [
      campo('fornecedorNome', 'Destinado a', 'texto', { sinonimos: ['destinado a', 'fornecedor', 'credor', 'favorecido', 'beneficiario', 'razao social', 'nome'] }),
      // duas colunas separadas, como vem no export (ver contas a receber)
      campo('fornecedorDoc', 'CNPJ', 'texto', { sinonimos: ['cnpj', 'cnpj fornecedor'] }),
      campo('fornecedorCpf', 'CPF', 'texto', { sinonimos: ['cpf', 'cpf fornecedor'] }),
      campo('descricao', 'Descrição', 'texto', { chaveNatural: true, sinonimos: ['descricao', 'descrição', 'historico', 'observacao'] }),
      campo('categoria', 'Plano de contas', 'texto', { sinonimos: ['plano de contas', 'plano contas', 'categoria', 'classificacao', 'centro de custo', 'conta', 'natureza', 'grupo'] }),
      campo('formaPagamento', 'Forma de pagamento', 'texto', { sinonimos: ['forma de pagamento', 'forma pagamento', 'forma', 'meio'] }),
      campo('banco', 'Conta bancária', 'texto', { sinonimos: ['conta bancaria', 'conta bancária', 'banco', 'conta', 'portador'] }),
      campo('vencimento', 'Data de vencimento', 'data', { sinonimos: ['vencimento', 'data de vencimento', 'venc', 'vcto', 'dt venc'] }),
      campo('status', 'Situação', 'texto', { sinonimos: SITUACAO }),
      campo('valor', 'Valor total', 'dinheiro', { sinonimos: VALOR_TOTAL }),
      campo('nfNumero', 'Nota fiscal', 'texto', { sinonimos: ['nota fiscal', 'nota', 'nf', 'documento'] }),
      campo('dataPagamento', 'Data do pagamento', 'data', { sinonimos: ['data pagamento', 'pagamento', 'baixa', 'dt pagto'] }),
    ],
  },

  /* ------------------------------------------------------------------ bancos */
  extrato: {
    id: 'extrato',
    nome: 'Extrato bancário',
    icone: '🏦',
    periodicidade: 'diaria',
    store: 'extrato',
    verdadeDe: 'Saldo real e o que de fato entrou e saiu.',
    descricao: 'OFX é o melhor formato (traz identificador único por lançamento e o saldo). '
      + 'XLSX, CSV e PDF do internet banking também servem.',
    formatos: ['ofx', 'xlsx', 'csv', 'pdf'],
    contaObrigatoria: true,
    campos: [
      campo('data', 'Data', 'data', { sinonimos: ['data', 'dt', 'data lancamento', 'data movimento'] }),
      campo('descricao', 'Histórico', 'texto', { sinonimos: ['historico', 'histórico', 'descricao', 'lancamento', 'memo', 'detalhe'] }),
      campo('documento', 'Documento', 'texto', { sinonimos: ['documento', 'doc', 'num doc'] }),
      campo('valor', 'Valor (+ entrada / − saída)', 'dinheiro', { sinonimos: ['valor', 'vl', 'movimento'] }),
      campo('entrada', 'Entrada (crédito)', 'dinheiro', { sinonimos: ['entrada', 'credito', 'crédito'] }),
      campo('saida', 'Saída (débito)', 'dinheiro', { sinonimos: ['saida', 'saída', 'debito', 'débito'] }),
      campo('saldo', 'Saldo', 'dinheiro', { sinonimos: ['saldo', 'saldo atual'] }),
    ],
    ajuda: 'Ou uma coluna "valor" com sinal, ou duas colunas separadas de entrada e saída — o que o banco der.',
  },

  /* ---------------------------------------------------------------- cadastros */
  produtos: {
    id: 'produtos',
    nome: 'Produtos',
    icone: '🏷️',
    periodicidade: 'mensal',
    store: 'produtos',
    verdadeDe: 'Nome, custo, preço de venda e NCM de cada produto.',
    descricao: 'Relatório de produtos. O app usa código interno, nome, valor de custo, VALOR DE '
      + 'VAREJO (o preço de venda), NCM e grupo (que é como a Curva ABC agrupa).',
    formatos: ['xlsx', 'csv', 'pdf'],
    colunasReais: ['código interno', 'nome', 'valor de custo', 'NCM', 'grupo', 'vr. varejo'],
    campos: [
      campo('codigo', 'Código interno', 'texto', { chaveNatural: true, sinonimos: ['codigo interno', 'código interno', 'codigo', 'cod', 'sku', 'referencia', 'ref'] }),
      campo('descricao', 'Nome', 'texto', { sinonimos: ['nome', 'descricao', 'descrição', 'produto', 'mercadoria'] }),
      campo('custo', 'Valor de custo', 'dinheiro', { sinonimos: ['valor de custo', 'valor custo', 'custo', 'preco custo', 'custo medio'] }),
      campo('ncm', 'NCM', 'texto', { sinonimos: ['ncm'] }),
      // é por esta coluna que a Curva ABC agrupa por categoria
      campo('categoria', 'Grupo', 'texto', { sinonimos: ['grupo', 'categoria', 'familia', 'linha', 'departamento'] }),
      /**
       * VR. VAREJO é o preço de venda. Com ele e o custo na mesma linha, a
       * margem do cadastro dá para ser conferida contra a margem realizada na
       * nota — que é o jeito de ver onde o desconto está comendo o lucro.
       */
      campo('precoVenda', 'Valor de varejo (venda)', 'dinheiro', {
        sinonimos: ['vr varejo', 'vr. varejo', 'valor varejo', 'valor de varejo', 'preco de venda',
          'preço de venda', 'preco venda', 'venda', 'varejo', 'preco'],
      }),
      campo('estoque', 'Estoque', 'numero', { sinonimos: ['estoque', 'saldo', 'quantidade em estoque', 'qtd estoque'] }),
    ],
  },

  clientes: {
    id: 'clientes',
    nome: 'Clientes',
    icone: '👥',
    periodicidade: 'mensal',
    store: 'clientes',
    verdadeDe: 'Razão social, documento e e-mail para a cobrança.',
    descricao: 'Relatório de clientes. O app usa razão social, CPF/CNPJ e e-mail. '
      + 'O vendedor do cadastro NÃO é usado — ele nem sempre está correto; '
      + 'o vendedor válido é o que você define no pedido.',
    formatos: ['xlsx', 'csv', 'pdf'],
    colunasReais: ['razão social', 'CPF/CNPJ', 'e-mail'],
    campos: [
      campo('nome', 'Razão social', 'texto', { sinonimos: ['razao social', 'razão social', 'nome', 'cliente', 'fantasia'] }),
      campo('documento', 'CPF / CNPJ', 'texto', { chaveNatural: true, sinonimos: DOC }),
      campo('email', 'E-mail', 'texto', { sinonimos: ['email', 'e-mail'] }),
      campo('telefone', 'Telefone', 'texto', { sinonimos: ['telefone', 'fone', 'tel'] }),
      campo('celular', 'Celular', 'texto', { sinonimos: ['celular', 'whatsapp', 'cel'] }),
      campo('tipo', 'Tipo do cliente', 'texto', { sinonimos: ['tipo', 'tipo cliente', 'tipo do cliente'] }),
      campo('ie', 'Inscrição estadual', 'texto', { sinonimos: ['ie', 'inscricao estadual', 'inscrição estadual'] }),
      campo('endereco', 'Endereço', 'texto', { sinonimos: ['endereco', 'endereço', 'logradouro'] }),
    ],
    ajuda: 'Telefone, celular, tipo, IE e endereço podem vir junto — o app guarda e usa na cobrança, '
      + 'mas nenhum deles é necessário.',
  },

  vendedores: {
    id: 'vendedores',
    nome: 'Vendedores',
    icone: '🎯',
    periodicidade: 'demanda',
    store: 'vendedores',
    verdadeDe: 'Nome oficial, apelidos e meta de cada vendedor.',
    descricao: 'Normalmente cadastrado dentro do app mesmo. A importação é só um atalho.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('nome', 'Nome', 'texto', { chaveNatural: true, sinonimos: ['nome', 'vendedor', 'representante'] }),
      campo('codigo', 'Código', 'texto', { sinonimos: ['codigo', 'cod', 'matricula'] }),
      campo('apelidos', 'Também aparece como', 'texto', { sinonimos: ['apelido', 'alias', 'nome curto'] }),
      campo('meta', 'Meta mensal', 'dinheiro', { sinonimos: ['meta', 'objetivo'] }),
    ],
  },

  /* --------------------------------------------------- opcional / complementar */
  nfItens: {
    id: 'nfItens',
    nome: 'Itens vendidos (por produto)',
    icone: '📦',
    periodicidade: 'demanda',
    store: 'nfItens',
    verdadeDe: 'Produto, quantidade e valor por item — base da Curva ABC.',
    descricao: 'Só existe se o sistema exportar vendas item a item, ou pelo XML das NF-e. '
      + 'Sem isso, a Curva ABC fica sem dados (o resto do app funciona igual).',
    formatos: ['xml', 'zip', 'xlsx', 'csv'],
    campos: [
      campo('nfNumero', 'Nota fiscal', 'texto', { chaveNatural: true, sinonimos: ['nf', 'nota', 'numero nf'] }),
      campo('produtoCodigo', 'Código do produto', 'texto', { chaveNatural: true, sinonimos: ['codigo', 'cod produto', 'sku'] }),
      campo('descricao', 'Produto', 'texto', { sinonimos: ['descricao', 'produto', 'nome'] }),
      campo('quantidade', 'Quantidade', 'numero', { sinonimos: ['qtd', 'qtde', 'quantidade'] }),
      campo('valorTotal', 'Valor total', 'dinheiro', { sinonimos: VALOR_TOTAL }),
      campo('valorUnitario', 'Valor unitário', 'dinheiro', { sinonimos: ['valor unitario', 'preco', 'unitario'] }),
      campo('custoUnitario', 'Custo unitário', 'dinheiro', { sinonimos: ['custo', 'custo unitario'] }),
      campo('seq', 'Item nº', 'inteiro', { sinonimos: ['item', 'seq'] }),
    ],
  },

  saldos: {
    id: 'saldos',
    nome: 'Saldos bancários',
    icone: '🪙',
    periodicidade: 'demanda',
    store: 'saldos',
    verdadeDe: 'Saldo inicial do fluxo de caixa.',
    descricao: 'Só é preciso quando o extrato não traz saldo. Dá para digitar direto em Bancos.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('banco', 'Banco', 'texto', { sinonimos: ['banco', 'conta', 'instituicao'] }),
      campo('data', 'Data', 'data', { sinonimos: ['data', 'posicao'] }),
      campo('saldo', 'Saldo', 'dinheiro', { sinonimos: ['saldo', 'valor', 'disponivel'] }),
    ],
  },
};

export const FONTES_LISTA = Object.values(FONTES);

/** Fontes que entram no checklist da rotina. */
export function fontesDaRotina(periodicidade) {
  return FONTES_LISTA.filter((f) => f.periodicidade === periodicidade);
}

export function fonte(id) {
  return FONTES[id] || null;
}

export function campoDaFonte(fonteId, chave) {
  return FONTES[fonteId]?.campos.find((c) => c.chave === chave) || null;
}

/**
 * Campos que identificam o registro numa reimportação. Não são obrigatórios:
 * sem eles o app usa o conteúdo da linha como identidade.
 */
export function camposChave(fonteId) {
  return (FONTES[fonteId]?.campos || []).filter((c) => c.chaveNatural);
}
