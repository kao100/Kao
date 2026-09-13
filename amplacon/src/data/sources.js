/**
 * CATÁLOGO DE FONTES DE DADOS
 *
 * Este arquivo é o mapa do item 15 do projeto: o que cada arquivo precisa
 * trazer, com que periodicidade, e qual fonte é a "verdade" de cada informação.
 *
 * O app NÃO assume o layout de nenhum arquivo. Cada fonte declara os campos
 * canônicos que sabe usar; na importação, o usuário liga coluna → campo uma vez
 * e o app guarda o perfil. Os `sinonimos` servem só para sugerir a ligação —
 * o que vale é a confirmação do usuário.
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
  chave, label, tipo, obrigatorio: false, sinonimos: [], ...opts,
});

export const FONTES = {
  /* ------------------------------------------------------------------ vendas */
  nfs: {
    id: 'nfs',
    nome: 'Vendas / NFs emitidas',
    icone: '🧾',
    periodicidade: 'diaria',
    store: 'nfs',
    verdadeDe: 'Faturamento oficial (valor e data de emissão).',
    descricao: 'Base do faturamento. Ideal: XML das NF-e (ou ZIP com os XMLs do dia). '
      + 'Um relatório de notas emitidas em XLSX/CSV também serve.',
    formatos: ['xml', 'zip', 'xlsx', 'csv'],
    campos: [
      campo('numero', 'Número da NF', 'texto', { obrigatorio: true, sinonimos: ['nf', 'numero nf', 'num nf', 'nota', 'numero da nota', 'documento', 'nro nota', 'n nota'] }),
      campo('serie', 'Série', 'texto', { sinonimos: ['serie', 'série'] }),
      campo('chave', 'Chave de acesso', 'texto', { sinonimos: ['chave', 'chave de acesso', 'chave nfe'] }),
      campo('dataEmissao', 'Data de emissão', 'data', { obrigatorio: true, sinonimos: ['emissao', 'emissão', 'data emissao', 'dt emissao', 'data da nota', 'data nf'] }),
      campo('clienteNome', 'Cliente', 'texto', { sinonimos: ['cliente', 'destinatario', 'destinatário', 'razao social', 'nome cliente'] }),
      campo('clienteDoc', 'CNPJ/CPF do cliente', 'texto', { sinonimos: ['cnpj', 'cpf', 'cnpj/cpf', 'documento cliente', 'cpf/cnpj'] }),
      campo('valorTotal', 'Valor total da NF', 'dinheiro', { obrigatorio: true, sinonimos: ['valor total', 'total', 'valor nf', 'vl total', 'valor da nota', 'total nota'] }),
      campo('valorProdutos', 'Valor dos produtos', 'dinheiro', { sinonimos: ['valor produtos', 'vl produtos', 'total produtos', 'mercadorias'] }),
      campo('valorFrete', 'Frete', 'dinheiro', { sinonimos: ['frete', 'vl frete', 'valor frete'] }),
      campo('valorDesconto', 'Desconto', 'dinheiro', { sinonimos: ['desconto', 'vl desconto', 'descontos'] }),
      campo('pedidoNumero', 'Pedido de venda', 'texto', { sinonimos: ['pedido', 'num pedido', 'numero pedido', 'nro pedido', 'ped', 'pedido venda', 'os'] }),
      campo('vendedorNome', 'Vendedor', 'texto', { sinonimos: ['vendedor', 'representante', 'consultor', 'vend'] }),
      campo('status', 'Situação', 'texto', { sinonimos: ['situacao', 'situação', 'status', 'estado'] }),
      campo('operacao', 'Entrada/Saída', 'texto', { sinonimos: ['tipo', 'operacao', 'operação', 'entrada saida', 'e/s'] }),
      campo('naturezaOperacao', 'Natureza da operação', 'texto', { sinonimos: ['natureza', 'natureza operacao', 'cfop', 'nat operacao'] }),
    ],
    ajuda: 'O XML é a fonte mais confiável de valor e data. Ele quase nunca traz o vendedor: '
      + 'por isso existe a fonte "Pedidos de venda".',
  },

  nfItens: {
    id: 'nfItens',
    nome: 'Itens das NFs (produtos vendidos)',
    icone: '📦',
    periodicidade: 'diaria',
    store: 'nfItens',
    verdadeDe: 'Produto, quantidade e valor por item — base da Curva ABC e da comissão por produto.',
    descricao: 'Vem junto no XML das NF-e. Se o relatório de vendas por item for XLSX/CSV, '
      + 'cada linha deve ter a NF e o produto.',
    formatos: ['xml', 'zip', 'xlsx', 'csv'],
    campos: [
      campo('nfNumero', 'Número da NF', 'texto', { obrigatorio: true, sinonimos: ['nf', 'nota', 'numero nf', 'documento'] }),
      campo('nfSerie', 'Série', 'texto', { sinonimos: ['serie', 'série'] }),
      campo('seq', 'Item nº', 'inteiro', { sinonimos: ['item', 'seq', 'sequencia', 'nro item'] }),
      campo('produtoCodigo', 'Código do produto', 'texto', { obrigatorio: true, sinonimos: ['codigo', 'código', 'cod produto', 'sku', 'referencia', 'cod'] }),
      campo('descricao', 'Descrição', 'texto', { sinonimos: ['descricao', 'descrição', 'produto', 'mercadoria', 'item descricao'] }),
      campo('categoria', 'Categoria/Grupo', 'texto', { sinonimos: ['categoria', 'grupo', 'linha', 'familia', 'família', 'departamento'] }),
      campo('unidade', 'Unidade', 'texto', { sinonimos: ['un', 'unid', 'unidade', 'um'] }),
      campo('quantidade', 'Quantidade', 'numero', { obrigatorio: true, sinonimos: ['qtd', 'qtde', 'quantidade', 'quant'] }),
      campo('valorUnitario', 'Valor unitário', 'dinheiro', { sinonimos: ['vl unitario', 'valor unitario', 'preco', 'preço', 'unitario'] }),
      campo('valorTotal', 'Valor total do item', 'dinheiro', { obrigatorio: true, sinonimos: ['valor total', 'total item', 'vl total', 'total'] }),
      campo('custoUnitario', 'Custo unitário', 'dinheiro', { sinonimos: ['custo', 'custo unitario', 'preco de custo', 'cmv unitario'] }),
      campo('custoTotal', 'Custo total', 'dinheiro', { sinonimos: ['custo total', 'cmv', 'total custo'] }),
    ],
    ajuda: 'Sem custo confiável o app mostra faturamento e quantidade, e deixa a margem em branco — '
      + 'não estima margem.',
  },

  pedidos: {
    id: 'pedidos',
    nome: 'Pedidos de venda (com vendedor)',
    icone: '🤝',
    periodicidade: 'diaria',
    store: 'pedidos',
    verdadeDe: 'Quem é o vendedor de cada venda.',
    descricao: 'Relatório de pedidos do sistema atual. É o que permite ligar NF → pedido → vendedor '
      + 'sem distorcer o mês do faturamento.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('numero', 'Número do pedido', 'texto', { obrigatorio: true, sinonimos: ['pedido', 'numero', 'num pedido', 'nro pedido', 'codigo pedido', 'os'] }),
      campo('data', 'Data do pedido', 'data', { obrigatorio: true, sinonimos: ['data', 'data pedido', 'dt pedido', 'emissao'] }),
      campo('vendedorNome', 'Vendedor', 'texto', { obrigatorio: true, sinonimos: ['vendedor', 'representante', 'consultor', 'vend'] }),
      campo('clienteNome', 'Cliente', 'texto', { sinonimos: ['cliente', 'razao social', 'nome cliente'] }),
      campo('clienteDoc', 'CNPJ/CPF do cliente', 'texto', { sinonimos: ['cnpj', 'cpf', 'cnpj/cpf', 'documento'] }),
      campo('valorTotal', 'Valor do pedido', 'dinheiro', { sinonimos: ['valor', 'total', 'valor total', 'vl pedido'] }),
      campo('nfNumero', 'NF gerada', 'texto', { sinonimos: ['nf', 'nota', 'numero nf', 'nota fiscal'] }),
      campo('status', 'Situação', 'texto', { sinonimos: ['situacao', 'status', 'estado'] }),
    ],
    ajuda: 'Se este relatório já trouxer a NF de cada pedido, a ligação fica exata e automática.',
  },

  /* -------------------------------------------------------------- financeiro */
  receber: {
    id: 'receber',
    nome: 'Contas a receber',
    icone: '💰',
    periodicidade: 'diaria',
    store: 'receber',
    verdadeDe: 'Títulos em aberto, vencimentos e saldo a receber.',
    descricao: 'Relatório de títulos a receber do sistema atual. Alimenta inadimplência, '
      + 'cobrança e fluxo de caixa de uma vez só.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('documento', 'Título / documento', 'texto', { obrigatorio: true, sinonimos: ['titulo', 'título', 'documento', 'duplicata', 'nosso numero', 'doc'] }),
      campo('parcela', 'Parcela', 'texto', { sinonimos: ['parcela', 'parc', 'nº parcela'] }),
      campo('nfNumero', 'NF de origem', 'texto', { sinonimos: ['nf', 'nota', 'nota fiscal', 'numero nf'] }),
      campo('clienteNome', 'Cliente', 'texto', { obrigatorio: true, sinonimos: ['cliente', 'razao social', 'sacado', 'nome'] }),
      campo('clienteDoc', 'CNPJ/CPF', 'texto', { sinonimos: ['cnpj', 'cpf', 'cnpj/cpf', 'documento cliente'] }),
      campo('emissao', 'Emissão', 'data', { sinonimos: ['emissao', 'emissão', 'data emissao', 'dt emissao'] }),
      campo('vencimento', 'Vencimento', 'data', { obrigatorio: true, sinonimos: ['vencimento', 'venc', 'data vencimento', 'dt venc', 'vcto'] }),
      campo('valor', 'Valor do título', 'dinheiro', { obrigatorio: true, sinonimos: ['valor', 'vl titulo', 'valor titulo', 'valor original', 'total'] }),
      campo('valorRecebido', 'Valor recebido', 'dinheiro', { sinonimos: ['recebido', 'valor recebido', 'vl pago', 'baixado', 'pago'] }),
      campo('saldo', 'Saldo em aberto', 'dinheiro', { sinonimos: ['saldo', 'em aberto', 'saldo devedor', 'valor aberto'] }),
      campo('dataRecebimento', 'Data do recebimento', 'data', { sinonimos: ['data pagamento', 'data recebimento', 'baixa', 'dt baixa', 'liquidacao'] }),
      campo('status', 'Situação', 'texto', { sinonimos: ['situacao', 'status', 'estado', 'sit'] }),
      campo('banco', 'Banco / carteira', 'texto', { sinonimos: ['banco', 'carteira', 'portador', 'conta'] }),
      campo('formaPagamento', 'Forma de pagamento', 'texto', { sinonimos: ['forma', 'forma pagamento', 'tipo cobranca', 'meio'] }),
      campo('vendedorNome', 'Vendedor', 'texto', { sinonimos: ['vendedor', 'representante'] }),
      campo('telefone', 'Telefone', 'texto', { sinonimos: ['telefone', 'fone', 'celular', 'whatsapp', 'tel'] }),
      campo('email', 'E-mail', 'texto', { sinonimos: ['email', 'e-mail'] }),
      campo('contato', 'Contato', 'texto', { sinonimos: ['contato', 'responsavel', 'comprador'] }),
    ],
  },

  pagar: {
    id: 'pagar',
    nome: 'Contas a pagar (BPO)',
    icone: '📤',
    periodicidade: 'semanal',
    store: 'pagar',
    verdadeDe: 'Compromissos a pagar e seus vencimentos.',
    descricao: 'Planilha preparada pelo BPO. Alimenta o fluxo de caixa direto.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('fornecedorNome', 'Fornecedor', 'texto', { obrigatorio: true, sinonimos: ['fornecedor', 'credor', 'favorecido', 'beneficiario', 'razao social', 'nome'] }),
      campo('documento', 'Documento / NF', 'texto', { sinonimos: ['documento', 'doc', 'nf', 'titulo', 'nota', 'duplicata'] }),
      campo('parcela', 'Parcela', 'texto', { sinonimos: ['parcela', 'parc'] }),
      campo('vencimento', 'Vencimento', 'data', { obrigatorio: true, sinonimos: ['vencimento', 'venc', 'data vencimento', 'vcto', 'dt venc'] }),
      campo('emissao', 'Emissão', 'data', { sinonimos: ['emissao', 'data emissao', 'competencia'] }),
      campo('valor', 'Valor', 'dinheiro', { obrigatorio: true, sinonimos: ['valor', 'vl', 'valor titulo', 'total', 'valor documento'] }),
      campo('categoria', 'Categoria / plano de contas', 'texto', { sinonimos: ['categoria', 'classificacao', 'plano de contas', 'centro de custo', 'conta', 'despesa', 'natureza'] }),
      campo('banco', 'Banco de pagamento', 'texto', { sinonimos: ['banco', 'conta', 'portador'] }),
      campo('status', 'Situação', 'texto', { sinonimos: ['situacao', 'status', 'pago', 'estado'] }),
      campo('dataPagamento', 'Data do pagamento', 'data', { sinonimos: ['data pagamento', 'dt pagto', 'baixa', 'pagamento'] }),
      campo('valorPago', 'Valor pago', 'dinheiro', { sinonimos: ['valor pago', 'vl pago', 'baixado'] }),
      campo('observacao', 'Observação', 'texto', { sinonimos: ['obs', 'observacao', 'historico', 'descricao'] }),
    ],
  },

  extrato: {
    id: 'extrato',
    nome: 'Extrato bancário',
    icone: '🏦',
    periodicidade: 'diaria',
    store: 'extrato',
    verdadeDe: 'Saldo real e o que de fato entrou e saiu.',
    descricao: 'OFX é o formato ideal (traz identificador único de cada lançamento e o saldo). '
      + 'XLSX/CSV do internet banking também servem.',
    formatos: ['ofx', 'xlsx', 'csv'],
    contaObrigatoria: true,
    campos: [
      campo('data', 'Data', 'data', { obrigatorio: true, sinonimos: ['data', 'dt', 'data lancamento', 'data movimento'] }),
      campo('descricao', 'Histórico / descrição', 'texto', { sinonimos: ['historico', 'histórico', 'descricao', 'lancamento', 'memo', 'detalhe'] }),
      campo('documento', 'Documento', 'texto', { sinonimos: ['documento', 'doc', 'num doc', 'numero documento'] }),
      campo('valor', 'Valor (+ entrada / − saída)', 'dinheiro', { sinonimos: ['valor', 'vl', 'movimento'] }),
      campo('entrada', 'Entrada (crédito)', 'dinheiro', { sinonimos: ['entrada', 'credito', 'crédito', 'receita'] }),
      campo('saida', 'Saída (débito)', 'dinheiro', { sinonimos: ['saida', 'saída', 'debito', 'débito', 'pagamento'] }),
      campo('saldo', 'Saldo após o lançamento', 'dinheiro', { sinonimos: ['saldo', 'saldo atual'] }),
    ],
    ajuda: 'Ou informe "Valor" com sinal, ou informe "Entrada" e "Saída" em colunas separadas.',
  },

  saldos: {
    id: 'saldos',
    nome: 'Saldos bancários',
    icone: '🪙',
    periodicidade: 'diaria',
    store: 'saldos',
    verdadeDe: 'Saldo inicial do fluxo de caixa.',
    descricao: 'Só é preciso quando o extrato não traz saldo. Pode ser digitado na tela de Bancos.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('banco', 'Banco', 'texto', { obrigatorio: true, sinonimos: ['banco', 'conta', 'instituicao'] }),
      campo('data', 'Data', 'data', { obrigatorio: true, sinonimos: ['data', 'dt', 'posicao'] }),
      campo('saldo', 'Saldo', 'dinheiro', { obrigatorio: true, sinonimos: ['saldo', 'valor', 'disponivel'] }),
    ],
  },

  /* ---------------------------------------------------------------- cadastros */
  produtos: {
    id: 'produtos',
    nome: 'Produtos e custos',
    icone: '🏷️',
    periodicidade: 'mensal',
    store: 'produtos',
    verdadeDe: 'Categoria, unidade, custo e fornecedor de cada produto.',
    descricao: 'Sem esta fonte, a Curva ABC funciona por faturamento e quantidade, mas não por margem.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('codigo', 'Código', 'texto', { obrigatorio: true, sinonimos: ['codigo', 'cod', 'sku', 'referencia', 'ref'] }),
      campo('descricao', 'Descrição', 'texto', { obrigatorio: true, sinonimos: ['descricao', 'produto', 'nome', 'mercadoria'] }),
      campo('categoria', 'Categoria', 'texto', { sinonimos: ['categoria', 'grupo', 'linha', 'familia', 'departamento'] }),
      campo('unidade', 'Unidade', 'texto', { sinonimos: ['un', 'unidade', 'unid'] }),
      campo('custo', 'Custo atual', 'dinheiro', { sinonimos: ['custo', 'preco custo', 'custo medio', 'ultimo custo'] }),
      campo('precoVenda', 'Preço de venda', 'dinheiro', { sinonimos: ['preco', 'preco venda', 'venda'] }),
      campo('fornecedorNome', 'Fornecedor', 'texto', { sinonimos: ['fornecedor', 'fabricante', 'marca'] }),
      campo('ncm', 'NCM', 'texto', { sinonimos: ['ncm'] }),
    ],
  },

  clientes: {
    id: 'clientes',
    nome: 'Clientes e contatos',
    icone: '👥',
    periodicidade: 'mensal',
    store: 'clientes',
    verdadeDe: 'Telefone, e-mail e pessoa de contato para a cobrança.',
    descricao: 'Faz a cobrança deixar de depender de procurar telefone em outro sistema.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('nome', 'Cliente', 'texto', { obrigatorio: true, sinonimos: ['cliente', 'razao social', 'nome', 'fantasia'] }),
      campo('documento', 'CNPJ/CPF', 'texto', { sinonimos: ['cnpj', 'cpf', 'cnpj/cpf', 'documento'] }),
      campo('codigo', 'Código', 'texto', { sinonimos: ['codigo', 'cod cliente', 'id'] }),
      campo('telefone', 'Telefone', 'texto', { sinonimos: ['telefone', 'fone', 'celular', 'whatsapp'] }),
      campo('email', 'E-mail', 'texto', { sinonimos: ['email', 'e-mail'] }),
      campo('contato', 'Pessoa de contato', 'texto', { sinonimos: ['contato', 'responsavel', 'comprador'] }),
      campo('cidade', 'Cidade', 'texto', { sinonimos: ['cidade', 'municipio'] }),
      campo('vendedorNome', 'Vendedor', 'texto', { sinonimos: ['vendedor', 'representante'] }),
    ],
  },

  vendedores: {
    id: 'vendedores',
    nome: 'Vendedores',
    icone: '🎯',
    periodicidade: 'demanda',
    store: 'vendedores',
    verdadeDe: 'Nome oficial, apelidos usados nos arquivos e meta de cada vendedor.',
    descricao: 'Pode ser cadastrado direto no app; a importação é só um atalho.',
    formatos: ['xlsx', 'csv'],
    campos: [
      campo('nome', 'Nome', 'texto', { obrigatorio: true, sinonimos: ['nome', 'vendedor', 'representante'] }),
      campo('codigo', 'Código', 'texto', { sinonimos: ['codigo', 'cod', 'matricula', 'id'] }),
      campo('apelidos', 'Como aparece nos arquivos', 'texto', { sinonimos: ['apelido', 'alias', 'abreviacao', 'nome curto'] }),
      campo('meta', 'Meta mensal', 'dinheiro', { sinonimos: ['meta', 'objetivo', 'meta mensal'] }),
      campo('email', 'E-mail', 'texto', { sinonimos: ['email', 'e-mail'] }),
    ],
  },
};

export const FONTES_LISTA = Object.values(FONTES);

/** Fontes que entram no checklist diário/semanal da Central de Arquivos. */
export function fontesDaRotina(periodicidade) {
  return FONTES_LISTA.filter((f) => f.periodicidade === periodicidade);
}

export function fonte(id) {
  return FONTES[id] || null;
}

export function campoDaFonte(fonteId, chave) {
  return FONTES[fonteId]?.campos.find((c) => c.chave === chave) || null;
}
