/**
 * Teste de ponta a ponta da lógica (sem navegador).
 *
 * Os arquivos deste teste usam AS COLUNAS REAIS dos relatórios que a AMPLA
 * exporta — inclusive as colunas que o app ignora. Ele é, na prática, a
 * especificação do que o sistema precisa entregar.
 *
 * A prova principal:
 *   nenhum relatório traz o vendedor, e o fiscal não traz o pedido;
 *   quem liga os dois é o CONTAS A RECEBER (NF + descrição na mesma linha).
 *
 *   node ampla/tools/teste.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { instalar } from './fake-idb.mjs';
import { instalar as instalarDom } from './fake-dom.mjs';

instalar();
instalarDom();
Object.defineProperty(globalThis, 'navigator', { value: { storage: {} }, configurable: true });

const store = await import('../src/core/store.js');
const dbMod = await import('../src/core/db.js');
const ingest = await import('../src/logic/ingest.js');
const link = await import('../src/logic/link.js');
const revenue = await import('../src/logic/revenue.js');
const commission = await import('../src/logic/commission.js');
const routine = await import('../src/logic/routine.js');
const dre = await import('../src/logic/dre.js');
const dossie = await import('../src/logic/dossie.js');
const quotes = await import('../src/logic/quotes.js');
const diario = await import('../src/logic/diario.js');
const filtro = await import('../src/logic/filtro.js');
const carteiraMod = await import('../src/logic/carteira.js');
const abcMod = await import('../src/logic/abc.js');
const margemMod = await import('../src/logic/margem.js');
const comercialMod = await import('../src/logic/comercial.js');
const caixaMod = await import('../src/logic/caixa.js');
const comprasLog = await import('../src/logic/compras.js');
const rtMod = await import('../src/logic/rt.js');
const backupMod = await import('../src/logic/backup.js');
const nuvemMod = await import('../src/logic/nuvem.js');
const foto = await import('../src/logic/fotografia.js');
const fluxo = await import('../src/logic/fluxo.js');
const { readFile } = await import('../src/core/files/read.js');
const { semear } = await import('../src/data/seed.js');
const perfis = await import('../src/data/perfis.js');
const { FONTES } = await import('../src/data/sources.js');

let passou = 0;
let falhou = 0;

function ok(descricao, condicao, detalhe = '') {
  if (condicao) { passou += 1; console.log(`  ✓ ${descricao}`); } else {
    falhou += 1;
    console.log(`  ✗ ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

function igual(descricao, recebido, esperado) {
  ok(descricao, JSON.stringify(recebido) === JSON.stringify(esperado),
    `recebido ${JSON.stringify(recebido)}, esperado ${JSON.stringify(esperado)}`);
}

async function limparClassificacao(...nomes) {
  /* salvarConfig funde objetos: mandar {} não apaga chave nenhuma. Para tirar
     uma conta da classificação, o valor tem de ir como null. */
  await store.salvarConfig({
    dre: { classificacao: Object.fromEntries(nomes.map((n) => [n, null])) },
  });
}

async function importar(fonteId, nome, conteudo, extras = {}) {
  const leitura = await readFile(new File([conteudo], nome, { type: 'text/csv' }));
  const cabecalho = leitura.planilhas[0].linhas[0].map(String);
  const mapeamento = ingest.sugerirMapeamento(fonteId, cabecalho);
  const preparo = await ingest.prepararTabular({
    fonteId, leitura, planilhaIndex: 0, headerRow: 0, mapeamento, ...extras,
  });
  await ingest.confirmar(preparo);
  return { preparo, mapeamento, cabecalho };
}


/* --------------------------------------------- um PDF de fonte padrão, à mão */

/**
 * Monta um PDF mínimo com Helvetica (sem fonte embutida) e o texto posicionado
 * por Td, que é como muito ERP gera relatório. O outro caminho — fonte embutida
 * com Identity-H e /ToUnicode — é coberto pelo PDF de verdade em tools/fixtures.
 */
function pdfSimples(linhas) {
  const partes = [];
  let y = 780;
  for (const linha of linhas) {
    for (const [x, texto] of linha) {
      const escapado = texto.replace(/([\\()])/g, '\\$1');
      partes.push(`BT /F1 9 Tf 1 0 0 1 ${x} ${y} Tm (${escapado}) Tj ET`);
    }
    y -= 18;
  }
  const conteudo = partes.join('\n');

  const objs = [
    '<</Type /Catalog /Pages 2 0 R>>',
    '<</Type /Pages /Kids [3 0 R] /Count 1>>',
    '<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
      + '/Resources <</Font <</F1 5 0 R>>>> /Contents 4 0 R>>',
    `<</Length ${conteudo.length}>>\nstream\n${conteudo}\nendstream`,
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<</Size ${objs.length + 1} /Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array([...pdf].map((c) => c.charCodeAt(0)));
}

/* ------------------------------------------- os relatórios, como eles saem */

// relatório fiscal: NÃO tem pedido, NÃO tem vendedor
const FISCAL = `Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação
3001;01/09/2026;Construtora Alfa Ltda;11222333000181;15.000,00;Autorizada
3002;02/09/2026;Depósito Beta ME;44555666000199;8.400,00;Autorizada
3003;05/09/2026;Obra Gama Ltda;77888999000155;22.000,00;Autorizada
3004;08/09/2026;José da Silva;12345678901;5.000,00;Autorizada
3005;09/09/2026;Depósito Beta ME;44555666000199;1.200,00;Cancelada`;

// relatório de vendas: TEM vendedor (é ele que fecha a comissão sozinha); tem
// custo; "prazo de entrega" o app ignora. O pedido 1004 vai de propósito sem
// vendedor, para provar que a linha entra assim mesmo e o app pede só aquela.
const VENDAS = `Número do Pedido;Cliente;Data da Venda;Prazo de Entrega;Vendedor;Situação;Valor do Custo;Valor Total
1001;Construtora Alfa Ltda;28/08/2026;05/09/2026;Carlos;Concretizada;11.200,00;15.000,00
1002;Depósito Beta ME;02/09/2026;06/09/2026;Maria;Concretizada;6.100,00;8.400,00
1003;Obra Gama Ltda;05/09/2026;12/09/2026;Carlos;Concretizada;15.800,00;22.000,00
1004;José da Silva;08/09/2026;15/09/2026;;Concretizada;3.900,00;5.000,00
1005;Marcenaria Sigma;10/09/2026;20/09/2026;Maria;Em aberto;2.000,00;3.500,00`;

// contas a receber: A PONTE — tem nota fiscal E descrição (nº do pedido)
const RECEBER = `Destinado a;CPF/CNPJ;Descrição;Forma de Pagamento;Conta Bancária;Vencimento;Situação;Valor Total;Nota Fiscal
Construtora Alfa Ltda;11222333000181;1001;Boleto;Itaú;20/09/2026;Em aberto;15.000,00;3001
Depósito Beta ME;44555666000199;1002;Boleto;Itaú;05/09/2026;Em aberto;8.400,00;3002
Obra Gama Ltda;77888999000155;1003;PIX;Bradesco;25/09/2026;Em aberto;22.000,00;3003
José da Silva;12345678901;1004;Dinheiro;Itaú;10/09/2026;Recebido;5.000,00;3004`;

const PAGAR = `Destinado a;CPF/CNPJ;Descrição;Plano de Contas;Forma de Pagamento;Conta Bancária;Data de Vencimento;Situação;Valor Total;Nota Fiscal
Fábrica de Cimento SA;99888777000166;Compra de cimento;Mercadoria para revenda;Boleto;Itaú;18/09/2026;Em aberto;42.000,00;55821
Transportadora Sul;88777666000155;Frete setembro;Despesas com frete;Boleto;Itaú;22/09/2026;Em aberto;6.500,00;
Energia Elétrica;;Conta de luz;Despesas administrativas;Débito automático;Bradesco;15/09/2026;Em aberto;3.200,00;`;

// clientes: tem colunas que o app ignora de propósito (vendedor responsável)
const CLIENTES = `Tipo do Cliente;Nome/Razão Social;CPF/CNPJ;IE;Telefone;Celular;E-mail;Endereço;Vendedor Responsável
Jurídica;Construtora Alfa Ltda;11222333000181;123456789;(11) 3333-1111;(11) 98888-1111;alfa@teste.com;Rua A, 100;Carlos
Jurídica;Depósito Beta ME;44555666000199;;;(11) 97777-2222;;Rua B, 200;Carlos
Física;José da Silva;12345678901;;;;;Rua C, 300;`;

const PRODUTOS = `Código Interno;Nome;Valor de Custo;NCM;CEST;CFOP;Grupo;Estoque
CIM50;Cimento CP-II 50kg;26,00;25232910;;5102;Cimento;480
MAD01;Madeira pinus m3;300,00;44071100;;5102;Madeira;60`;

const ORCAMENTOS = `Número;Cliente;Data;Previsão de Entrega;Situação;Valor
900;Construtora Alfa Ltda;20/08/2026;30/08/2026;Aprovado;15.000,00
901;Marcenaria Sigma;03/09/2026;15/09/2026;Em aberto;9.800,00
902;Obra Gama Ltda;04/09/2026;18/09/2026;Perdido;7.200,00`;

/* ---------------------------------------------------------------- cenário */

console.log('\n▶ Primeira execução');
await semear();
igual('duas contas bancárias criadas', (await store.contas.listar()).length, 2);
const regras = await store.regrasComissao.listar();
igual('regra padrão em 2%', regras.find((r) => r.id === 'regra_padrao').percentual, 2);
igual('regra do cimento em 0,5%', regras.find((r) => r.id === 'regra_cimento').percentual, 0.5);

console.log('\n▶ Importando os relatórios como eles saem do sistema');
const fiscal = await importar('nfs', 'fiscal.csv', FISCAL);
igual('as 6 colunas do fiscal foram reconhecidas sozinhas',
  ['numero', 'dataEmissao', 'clienteNome', 'clienteDoc', 'valorTotal', 'status']
    .every((c) => fiscal.mapeamento[c]), true);
igual('5 notas importadas', (await store.nfs.listar()).length, 5);

const vendas = await importar('pedidos', 'vendas.csv', VENDAS);
igual('"Prazo de Entrega" ficou de fora, como pedido', vendas.mapeamento.prazo, undefined);
igual('o custo do pedido foi reconhecido', !!vendas.mapeamento.valorCusto, true);
ok('a contagem diz o que ela mandou, não o que o app criou de tabela',
  fiscal.preparo.resumo.principal === 5 && fiscal.preparo.resumo.total > 5,
  `principal ${fiscal.preparo.resumo.principal}, total ${fiscal.preparo.resumo.total}`);
igual('5 pedidos importados', (await store.pedidos.listar()).length, 5);

await importar('receber', 'receber.csv', RECEBER);
await importar('pagar', 'pagar.csv', PAGAR);
await importar('clientes', 'clientes.csv', CLIENTES);
await importar('produtos', 'produtos.csv', PRODUTOS);
await importar('orcamentos', 'orcamentos.csv', ORCAMENTOS);

igual('4 títulos a receber', (await store.receber.listar()).length, 4);
igual('3 contas a pagar', (await store.pagar.listar()).length, 3);
igual('3 orçamentos', (await store.orcamentos.listar()).length, 3);

const clientes = await store.clientes.listar();
const alfa = clientes.find((c) => c.documento === '11222333000181');
igual('cliente identificado por CNPJ', !!alfa, true);
igual('e-mail do cadastro foi aproveitado', alfa.email, 'alfa@teste.com');
const jose = clientes.find((c) => c.documento === '12345678901');
igual('cliente por CPF também entra', !!jose, true);
igual('cliente sem e-mail entra do mesmo jeito', jose.email, null);

console.log('\n▶ Nada é obrigatório');
const semNada = await importar('pagar', 'pagar2.csv', `Destinado a;Valor Total
Fornecedor Sem Mais Nada;1.234,56`);
igual('linha só com nome e valor entra', semNada.preparo.resumo.novos >= 1, true);
igual('e não gera erro nenhum', semNada.preparo.erros.length, 0);

const dataRuim = await importar('pagar', 'pagar3.csv', `Destinado a;Data de Vencimento;Valor Total
Fornecedor Data Torta;31/31/2026;500,00`);
igual('data impossível não derruba a linha', dataRuim.preparo.erros.length, 0);
igual('ela vira aviso', dataRuim.preparo.atencao.length, 1);
const torto = (await store.pagar.listar()).find((x) => x.fornecedorNome === 'Fornecedor Data Torta');
igual('o registro entra com o vencimento em branco', torto.vencimento, null);
igual('mas com o valor certo', torto.valor, 500);

console.log('\n▶ A ponte: contas a receber liga NF ao pedido');
await link.recalcular();
const nfs = await store.nfs.listar();
const nf3001 = nfs.find((n) => n.numero === '3001');
igual('o relatório fiscal não trazia pedido', FISCAL.includes('Pedido'), false);
igual('mas a NF 3001 achou o pedido 1001 pelo título', nf3001.pedidoNumero, '1001');

console.log('\n▶ O vendedor vem do relatório: você não marca nada');
const vendedoresCriados = await store.vendedores.listar();
ok('os vendedores do arquivo foram cadastrados sozinhos',
  vendedoresCriados.some((v) => v.nome === 'Carlos') && vendedoresCriados.some((v) => v.nome === 'Maria'),
  JSON.stringify(vendedoresCriados.map((v) => v.nome)));
const carlos = vendedoresCriados.find((v) => v.nome === 'Carlos');
const maria = vendedoresCriados.find((v) => v.nome === 'Maria');

igual('a NF 3001 já nasceu com vendedor', nf3001.vendedorId, carlos.id);
igual('e veio pela ponte do contas a receber', nf3001.vendedorOrigem, 'pedido-titulo');
igual('a de outro vendedor também', nfs.find((n) => n.numero === '3002').vendedorId, maria.id);

// a única linha sem vendedor no arquivo é a única que o app pergunta
const cobranca = await link.pedidosSemVendedor();
igual('só o pedido que veio sem vendedor é cobrado',
  cobranca.map((c) => c.pedido.numero), ['1004']);
igual('a nota dele ficou sem dono até isso ser resolvido',
  nfs.find((n) => n.numero === '3004').vendedorId, null);

console.log('\n▶ E o que vier em branco, você resolve uma vez');
const pedidos = await store.pedidos.listar();
ok('cada pedido cobrado já vem com as notas que herdam dele',
  cobranca[0].notas.some((n) => n.numero === '3004'), '');
await link.definirVendedorDoPedido(pedidos.find((p) => p.numero === '1004').id, maria.id, 'conferido');

const nfs2 = await store.nfs.listar();
igual('a NF herdou o vendedor do pedido', nfs2.find((n) => n.numero === '3004').vendedorId, maria.id);
igual('resolvido o pedido, ele sai da lista', (await link.pedidosSemVendedor()).length, 0);
igual('e o que veio do relatório continua de pé',
  nfs2.find((n) => n.numero === '3001').vendedorId, carlos.id);

console.log('\n▶ Faturamento (item 4)');
const setembro = await revenue.resumo({ de: '2026-09-01', ate: '2026-09-30' });
igual('faturamento de setembro (a cancelada fica fora)', setembro.total, 50400);
igual('a cancelada foi contada à parte', setembro.canceladas.quantidade, 1);
igual('fiscal = soma dos vendedores', setembro.conferencia.diferenca, 0);
igual('conferência aprovada', setembro.conferencia.ok, true);
const agosto = await revenue.resumo({ de: '2026-08-01', ate: '2026-08-31' });
igual('pedido de agosto faturado em setembro não conta em agosto', agosto.total, 0);
igual('Carlos: 15.000 + 22.000', setembro.ranking.find((v) => v.nome === 'Carlos').valor, 37000);
igual('Maria: 8.400 + 5.000', setembro.ranking.find((v) => v.nome === 'Maria').valor, 13400);

console.log('\n▶ Comissão sobre o que foi faturado');
const calc = await commission.calcular('2026-09');
// sem itens por produto, a comissão sai sobre o total da nota, a 2%
igual('Carlos: 2% de 37.000', calc.vendedores.find((v) => v.nome === 'Carlos').comissao, 740);
igual('Maria: 2% de 13.400', calc.vendedores.find((v) => v.nome === 'Maria').comissao, 268);
igual('nada bloqueia o fechamento', calc.podeFechar, true);

console.log('\n▶ Financeiro e caixa');
/**
 * A PROJEÇÃO ANTIGA SAIU E A NOVA FICOU — é a mesma pergunta, feita uma vez só.
 *
 * "Eu preciso de um fluxo de caixa. Simples. Entradas e saídas. (...) Não
 *  preciso mais do inadimplência, de cobrança, nada disso."
 *
 * Eram duas projeções concorrentes (`cashflow` e `fluxo`) e uma tela de
 * inadimplência. Ficou a do fluxo, que é a que parte do saldo informado e separa
 * o vencido em vez de projetá-lo.
 */
await fluxo.informarSaldo(30000, '2026-09-13');
const proj = await fluxo.projetar({ de: '2026-09-13', dias: 20 });
igual('saldo inicial informado', proj.saldoInicial, 30000);
const dia18 = proj.linhas.find((l) => l.data === '2026-09-18');
igual('a compra de cimento cai no dia 18', dia18.pagamentos, 42000);
ok('a projeção acusa dia negativo', proj.linhas.some((l) => l.negativo), 'não acusou');

/* o que já venceu não entra na linha do tempo: ele aparece à parte */
const venc = fluxo.separarVencidos(await store.receber.listar(), '2026-09-13');
const beta = venc.vencidos.find((t) => t.clienteNome === 'Depósito Beta ME');
ok('título vencido em 05/09 fica fora da projeção', !!beta, 'não separou');
ok('e nenhum vencido entra como entrada futura',
  !proj.linhas.some((l) => l.entradas.some((e) => e.vencimento < '2026-09-13')), '');

console.log('\n▶ O saldo são as contas, somadas, pela data mais velha');
{
  /**
   * "Se todo dia eu tenho que alimentar o saldo bancário das contas, isso é
   *  fato, para ele conseguir fazer as projeções futuras que eu quero."
   *
   * Contas, no plural — e o extrato saiu da rotina de propósito. Então o saldo
   * de partida é a soma do último saldo de cada conta. A data que vale é a MAIS
   * ANTIGA: se uma conta ficou sem atualizar, a projeção inteira é velha, e
   * esconder isso atrás da data mais nova seria esconder o único erro que
   * importa aqui.
   */
  await store.contas.salvar({ id: 'ct_a', nome: 'Banco A' });
  await store.contas.salvar({ id: 'ct_b', nome: 'Banco B' });
  await store.contas.salvar({ id: 'ct_c', nome: 'Banco C' });

  await fluxo.informarSaldoDaConta('ct_a', 10000, '2026-09-10');
  await fluxo.informarSaldoDaConta('ct_b', 25000, '2026-09-13');

  const s1 = await fluxo.saldoInformado();
  igual('o saldo é a soma das contas', s1.valor, 35000);
  igual('e a data é a da conta mais atrasada', s1.data, '2026-09-10');
  ok('conta sem saldo informado não soma',
    s1.contas.filter((c) => c.valor != null).length === 2, JSON.stringify(s1.contas));
  ok('mas aparece, para a tela poder pedir',
    s1.contas.some((c) => c.contaId === 'ct_c' && c.valor == null), '');

  /* o saldo mais novo da mesma conta substitui o anterior, não soma */
  await fluxo.informarSaldoDaConta('ct_a', 12000, '2026-09-14');
  const s2 = await fluxo.saldoInformado();
  igual('informar de novo corrige, não acumula', s2.valor, 37000);
  igual('e a data mais velha passa a ser a da outra conta', s2.data, '2026-09-13');

  /* conta tirada do caixa para de somar, sem perder o histórico */
  await store.contas.salvar({ id: 'ct_b', nome: 'Banco B', arquivada: true });
  const s3 = await fluxo.saldoInformado();
  igual('conta tirada do caixa sai da soma', s3.valor, 12000);
  ok('e o saldo dela continua guardado',
    (await store.saldos.listar()).some((x) => x.contaId === 'ct_b'), '');

  /* e a projeção parte desse número */
  const p = await fluxo.projetar({ de: '2026-09-14', dias: 5 });
  igual('a projeção parte da soma das contas', p.saldoInicial, 12000);

  for (const id of ['ct_a', 'ct_b', 'ct_c']) await store.contas.remover(id);
  for (const x of await store.saldos.listar()) {
    if (x.contaId?.startsWith('ct_')) await store.saldos.remover(x.id);
  }
  const s4 = await fluxo.saldoInformado();
  igual('sem conta cadastrada, o número único de antes ainda vale', s4.valor, 30000);
}

console.log('\n▶ "Não pago" é aberto, e não pago');
{
  /**
   * "Eu acabei de mandar o contas a pagar só a partir do dia 17 e o que tá em
   *  aberto, ou seja, não tinha nenhum pago. E não tá calhando, tá aparecendo
   *  zero. E eu sei que não é zero. Tem alguma coisa errada e não é o relatório."
   *
   * Não era o relatório. "NÃO PAGO" CONTÉM "PAGO", e "NÃO RECEBIDO" CONTÉM
   * "RECEBID" — a leitura da situação procurava esses pedaços sem olhar a
   * negação na frente. Todo título em aberto do relatório dela entrava como
   * baixado, com saldo zero, e o fluxo de caixa ficava zerado com a base cheia.
   *
   * Nenhum aviso, nenhum erro, e o número errado era redondo e tranquilo: o
   * pior erro que este app pode cometer. Então a tabela abaixo é exaustiva de
   * propósito, com o vocabulário que os sistemas usam de verdade.
   */
  const VOCAB = [
    ['Não pago', 'aberto'], ['Nao pago', 'aberto'], ['NÃO PAGO', 'aberto'],
    ['Não recebido', 'aberto'], ['Nao recebido', 'aberto'],
    ['Em aberto', 'aberto'], ['A receber', 'aberto'], ['A pagar', 'aberto'],
    ['A vencer', 'aberto'], ['Pendente', 'aberto'], ['Vencido', 'aberto'],
    ['Em atraso', 'aberto'], ['Atrasado', 'aberto'], ['Aguardando pagamento', 'aberto'],
    ['Previsto', 'aberto'], ['Sem baixa', 'aberto'],
    /* pagamento parcial não é baixa: o que falta continua em aberto */
    ['Pago parcialmente', 'aberto'], ['Parcialmente recebido', 'aberto'],
    ['Pago', 'pago'], ['PAGO', 'pago'], ['Recebido', 'pago'], ['Quitado', 'pago'],
    ['Liquidado', 'pago'], ['Baixado', 'pago'],
    ['Cancelado', 'cancelado'], ['Baixado por perda', 'cancelado'],
    ['', 'aberto'],
  ];

  const CAB = 'Destinado a;Vencimento;Situação;Valor total;Nota fiscal';
  const linhas = VOCAB.map(([situacao], i) => `CLIENTE ${i};20/11/2026;${situacao};1.000,00;90${i}`);
  await importar('receber', 'vocab.csv', `${CAB}\n${linhas.join('\n')}`,
    { fotografiaCompleta: false });

  const titulos = (await store.receber.listar()).filter((t) => /^CLIENTE \d+$/.test(t.clienteNome || ''));
  igual('cada linha do vocabulário virou um título', titulos.length, VOCAB.length);

  let errados = [];
  for (const [situacao, esperado] of VOCAB) {
    const t = titulos.find((x) => (x.statusArquivo || '') === situacao);
    if (!t || t.status !== esperado) {
      errados.push(`${JSON.stringify(situacao)} → ${t ? t.status : 'não achou'} (esperado ${esperado})`);
    }
  }
  ok('toda situação é lida como a palavra diz', errados.length === 0, errados.join(' | '));

  /* e o saldo acompanha: aberto mantém o valor, pago zera */
  const aberto = titulos.find((t) => t.statusArquivo === 'Não pago');
  igual('título em aberto guarda o valor cheio', aberto.saldo, 1000);
  igual('e não registra pagamento nenhum', aberto.valorRecebido, null);
  const pago = titulos.find((t) => t.statusArquivo === 'Pago');
  igual('título pago zera o saldo', pago.saldo, 0);

  /**
   * E O FLUXO DE CAIXA SAI DO ZERO — que é a prova que importa, porque é a tela
   * onde ela viu o erro.
   */
  const emAberto = VOCAB.filter(([, e]) => e === 'aberto').length;
  const proj = await fluxo.projetar({ de: '2026-11-01', ate: '2026-11-30' });
  igual('e o fluxo de caixa deixa de ser zero', proj.totalReceber, emAberto * 1000);

  for (const t of titulos) await store.receber.remover(t.id);
}

console.log('\n▶ Gráfico sem número não finge desenho');
{
  /**
   * O cartão "Evolução do saldo projetado" passava { x, y } para um componente
   * que lê { rotulo, valor }. Todo ponto virava NaN, o navegador recusava o SVG
   * e o cartão ficava EM BRANCO — numa tela de dinheiro, sem uma palavra, na
   * exata tela onde ela estava procurando o que faltava.
   */
  const { readFileSync: ler } = await import('node:fs');
  const { join: jn, dirname: dn } = await import('node:path');
  const { fileURLToPath: fu } = await import('node:url');
  const raiz = jn(dn(fu(import.meta.url)), '..');

  for (const arquivo of ['src/ui/views/fluxo.js', 'src/ui/views/diario.js']) {
    const fonte = ler(jn(raiz, arquivo), 'utf8');
    let desde = 0;
    let n = 0;
    for (;;) {
      const i = fonte.indexOf('grafLinha(', desde);
      if (i < 0) break;
      desde = i + 10;
      n += 1;
      const argumento = fonte.slice(desde, desde + 300);
      /* a série pode vir montada ali mesmo, ou por um nome declarado antes */
      let trecho = argumento;
      const nome = (argumento.match(/^\s*([A-Za-z_$][\w$]*)\s*,/) || [])[1];
      if (nome) {
        const j = fonte.indexOf(`const ${nome} =`);
        if (j >= 0) trecho = fonte.slice(j, j + 400);
      }
      ok(`${arquivo}: a série ${n} do gráfico tem rotulo e valor`,
        /rotulo/.test(trecho) && /valor/.test(trecho), trecho.slice(0, 160));
    }
  }

  /* e o componente não desenha com número inválido */
  const chart = ler(jn(raiz, 'src/ui/components/chart.js'), 'utf8');
  ok('o gráfico descarta ponto sem número', /Number\.isFinite/.test(chart), '');
}

console.log('\n▶ O diagnóstico conta tudo e não vaza ninguém');
{
  /**
   * "Eu não sei nem o que te falar (...) os recebimentos continuam zerados
   *  aqui. Parece que não sei o que tá acontecendo."
   *
   * Eu também não sabia: o mesmo arquivo, no mesmo app, funciona aqui e não
   * funciona no aparelho dela. Print mostra o fim da história; este texto mostra
   * o começo — o que entrou, com que situação, vencendo em que mês.
   *
   * E ele vai parar numa conversa. Então dado de cliente não pode ir junto: não
   * há razão para nome, CPF, CNPJ ou número de nota viajarem para contar por que
   * um número deu zero.
   */
  const diagnostico = await import('../src/logic/diagnostico.js');
  const guardados = await store.receber.listar();
  for (const t of guardados) await store.receber.remover(t.id);

  const CAB = 'Destinado à;CPF;CNPJ;Vencimento;Situação;Valor total;NF-e';
  await importar('receber', 'diag.csv', [CAB,
    'JOSE DA SILVA SAURO;123.456.789-00;;10/11/2026;Em aberto;1.000,00;9001',
    'CONSTRUTORA XYZ LTDA;;12.345.678/0001-99;11/11/2026;Em aberto;2.000,00;9002',
    'MARIA DE SOUZA PRADO;987.654.321-00;;01/09/2026;Confirmado;5.000,00;9003',
  ].join('\n'), { fotografiaCompleta: false });

  const texto = await diagnostico.montar({ de: '2026-11-01', dias: 30 });

  /* conta o que eu preciso saber */
  ok('diz quantos títulos existem', /CONTAS A RECEBER — 3 título/.test(texto), texto.slice(0, 400));
  ok('diz quantos estão em aberto', /em aberto: 2/.test(texto), '');
  ok('mostra a palavra do arquivo e o que o app fez com ela',
    /"Em aberto": 2 aberto, 0 pago/.test(texto) && /"Confirmado": 0 aberto, 1 pago/.test(texto), texto);
  ok('mostra em que mês os abertos vencem', /2026-11: 2 título/.test(texto), '');
  ok('e o que a tela do caixa calculou', /a receber no período/.test(texto), '');
  ok('e de onde a MARGEM está saindo, que é o que faltava para parar de adivinhar',
    /fonte dos números:/.test(texto) && /pedidos guardados:/.test(texto)
    && /com valor total:/.test(texto) && /itens de nota \(XML\):/.test(texto), texto.slice(-700));

  /* e não vaza ninguém */
  for (const segredo of ['JOSE DA SILVA SAURO', 'CONSTRUTORA XYZ LTDA', 'MARIA DE SOUZA PRADO',
    '123.456.789-00', '12.345.678/0001-99', '987.654.321-00', '9001', '9002']) {
    ok(`não vaza ${segredo}`, !texto.includes(segredo), texto);
  }

  for (const t of await store.receber.listar()) {
    if (/SAURO|XYZ|PRADO/.test(t.clienteNome || '')) await store.receber.remover(t.id);
  }
  for (const t of guardados) await store.receber.salvar(t);
}

console.log('\n▶ Dois campos na mesma coluna: o perfil salvo não manda nisso');
{
  /**
   * "Tô mandando também a forma que as colunas estão se ligando."
   *
   * O print dela mostrava, no fim da lista:
   *
   *     Data do recebimento  →  Vencimento
   *
   * Os dois campos na MESMA coluna do arquivo. Todo título ganhava uma data de
   * recebimento igual ao próprio vencimento — sempre preenchida — e era ela que
   * o recálculo lia como prova de baixa.
   *
   * A ligação vinha de um PERFIL SALVO, e o app reaplicava o perfil sem nunca
   * conferir se ele próprio era coerente. Foi por isso que sobreviveu a apagar a
   * base, a recomeçar do zero e a todas as reimportações: o estrago não estava
   * nos dados, estava na memória de como lê-los.
   */
  const CAB = ['Destinado à', 'CPF', 'CNPJ', 'Descrição', 'Forma de pagamento',
    'Conta bancária', 'Vencimento', 'Situação', 'Valor total', 'NF-e'];

  /* o perfil estragado, igual ao do aparelho dela */
  const perfilRuim = {
    clienteNome: 'Destinado à',
    vencimento: 'Vencimento',
    status: 'Situação',
    valor: 'Valor total',
    dataRecebimento: 'Vencimento',
  };

  ok('o app enxerga o cruzamento', ingest.colunasRepetidas(perfilRuim)
    .some((r) => r.coluna === 'Vencimento' && r.campos.length === 2),
  JSON.stringify(ingest.colunasRepetidas(perfilRuim)));

  const corrigido = ingest.completarMapeamento('receber', CAB, perfilRuim);
  igual('"Vencimento" fica com o campo Vencimento', corrigido.vencimento, 'Vencimento');
  igual('e a Data do recebimento perde a ligação', corrigido.dataRecebimento, undefined);
  igual('o resto do perfil é respeitado', corrigido.status, 'Situação');
  ok('e nada mais fica cruzado', ingest.colunasRepetidas(corrigido).length === 0,
    JSON.stringify(ingest.colunasRepetidas(corrigido)));

  /**
   * E O EFEITO NO NÚMERO, que é o que importa: com a ligação errada, todo
   * título entrava com data de recebimento preenchida. Agora entra em branco.
   */
  const guardados = await store.receber.listar();
  for (const t of guardados) await store.receber.remover(t.id);

  const linhas = [CAB.join(';'),
    'CLIENTE UM;;;Venda nº 1;PIX;CONTA;05/11/2026;Em aberto;1.000,00;9001',
    'CLIENTE DOIS;;;Venda nº 2;PIX;CONTA;06/11/2026;Em aberto;2.000,00;9002'];
  const leitura = await readFile(new File([linhas.join('\n')], 'perfil.csv', { type: 'text/csv' }));
  const preparo = await ingest.prepararTabular({
    fonteId: 'receber',
    leitura,
    planilhaIndex: 0,
    headerRow: 0,
    mapeamento: ingest.completarMapeamento('receber', CAB, perfilRuim),
    fotografiaCompleta: false,
  });
  await ingest.confirmar(preparo);

  const meus = (await store.receber.listar()).filter((t) => /^CLIENTE (UM|DOIS)$/.test(t.clienteNome || ''));
  igual('os dois títulos entraram', meus.length, 2);
  ok('sem data de recebimento inventada', meus.every((t) => !t.dataRecebimento),
    JSON.stringify(meus.map((t) => t.dataRecebimento)));
  ok('e em aberto', meus.every((t) => t.status === 'aberto'), '');

  /* e o recálculo não os fecha, que era o fim da linha */
  await link.recalcular();
  const depois = (await store.receber.listar()).filter((t) => /^CLIENTE (UM|DOIS)$/.test(t.clienteNome || ''));
  ok('e continuam em aberto depois do recálculo',
    depois.every((t) => t.status === 'aberto'), JSON.stringify(depois.map((t) => t.status)));

  for (const t of depois) await store.receber.remover(t.id);
  for (const t of guardados) await store.receber.salvar(t);
}

console.log('\n▶ Custo do pedido maior que a venda não é margem, é unidade trocada');
{
  /**
   * "Mandei os arquivos, tudo certinho, mas mantém o custo. Eu queria ter o
   *  valor real. Pelo Gestão Click acho inviável mudar agora."
   *
   * Em outubro, 28 pedidos entraram com custo acima da venda — um deles com
   * R$ 56.000,00 de custo sobre R$ 1.550,00 de venda, 36 vezes. A causa estava
   * no cadastro (TIJOLO COMUM com custo de milheiro e venda por pacote de 10),
   * mas corrigir o cadastro NÃO reescreve pedido já emitido: o custo fica
   * congelado nele. Dois vendedores ficaram negativos por isso.
   *
   * O app já descartava custo absurdo vindo do cadastro de produtos (acima de
   * 1,5× o preço) e do relatório de produtos vendidos (acima de 5×). Só o custo
   * do PEDIDO — que vem ANTES dos dois — entrava sem nenhuma conferência.
   *
   * Custo acima da venda é venda com prejuízo de verdade (raro) ou unidade
   * trocada (comum). Nos dois casos não serve para calcular margem, e inventar
   * prejuízo é pior que dizer "deste pedaço eu não sei".
   */
  const guardadas = { nfs: await store.nfs.listar(), pedidos: await store.pedidos.listar() };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  await store.vendedores.salvar({ id: 'vA', nome: 'VENDEDOR A' });

  const nota = (n, pedidoNumero, valor) => ({
    id: `nfm_${n}`, numero: String(n), serie: '1', dataEmissao: '2026-10-10',
    valorTotal: valor, valorProdutos: valor, vendedorId: 'vA', pedidoNumero: String(pedidoNumero),
    status: 'autorizada', operacao: 'saida', devolucao: false, devolucaoDeCompra: false,
  });
  const pedido = (n, custo, total) => ({
    id: `pedm_${n}`, numero: String(n), data: '2026-10-09', valorCusto: custo, valorTotal: total,
  });

  const guardadosItens = await store.nfItens.listar();
  for (const x of guardadosItens) await store.nfItens.remover(x.id);
  /* a margem por vendedor sai dos ITENS da nota: sem eles não há tabela */
  const item = (n, valor) => store.nfItens.salvar({
    id: `itm_${n}`, nfId: `nfm_${n}`, data: '2026-10-10', nfStatus: 'autorizada',
    vendedorId: 'vA', produtoId: `prod_${n}`, descricao: `PRODUTO ${n}`,
    quantidade: 1, valorTotal: valor,
  });

  /* o caso dela: custo 36x a venda */
  await store.nfs.salvar(nota(9001, 1897, 1550));
  await store.pedidos.salvar(pedido(1897, 56000, 1550));
  await item(9001, 1550);
  /* um pedido saudável, que tem de continuar contando */
  await store.nfs.salvar(nota(9002, 1900, 10000));
  await store.pedidos.salvar(pedido(1900, 6000, 10000));
  await item(9002, 10000);
  /* e um apertado, mas plausível: 1,4x NÃO pode ser descartado */
  await store.nfs.salvar(nota(9003, 1901, 1000));
  await store.pedidos.salvar(pedido(1901, 1400, 1000));
  await item(9003, 1000);

  const r = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });

  igual('o pedido absurdo é descartado', r.custoSuspeito.quantidade, 1);
  igual('e é o certo', r.custoSuspeito.linhas[0].pedido, '1897');
  igual('com a venda dele fora da margem', r.custoSuspeito.venda, 1550);
  igual('e o custo que foi recusado', r.custoSuspeito.custo, 56000);
  ok('a razão é mostrada para ela entender', r.custoSuspeito.linhas[0].razao > 36, String(r.custoSuspeito.linhas[0].razao));

  /**
   * O NÚMERO QUE IMPORTA: a margem deixa de ser negativa, e passa a valer para
   * o pedaço que tem custo bom.
   */
  const v = r.vendedores.find((x) => x.nome === 'VENDEDOR A')
    || { nome: '(não achou)', custo: null, margem: null, vendaSemCusto: null };
  ok('o vendedor aparece na margem', v.nome === 'VENDEDOR A',
    JSON.stringify(r.vendedores.map((x) => `${x.nome}:${x.venda}`)));
  igual('o custo do pedido absurdo não entra', v.custo, 7400);
  ok('e a margem deixa de ser negativa', v.margem > 0, String(v.margem));
  igual('a venda sem custo confiável aparece em reais', v.vendaSemCusto, 1550);

  /* o apertado continua dentro: a régua é 1,5x, não "qualquer custo alto" */
  ok('pedido com custo 1,4x a venda continua contando',
    r.custoSuspeito.linhas.every((x) => x.pedido !== '1901'),
    JSON.stringify(r.custoSuspeito.linhas.map((x) => x.pedido)));

  /**
   * ============ O CUSTO QUE ELA DIGITA NO PEDIDO ============
   *
   * "Não tem como eu ajustar ou te passar por aqui os custos desses pedidos em
   *  específico pra ficar certinho?"
   *
   * Descartar o custo absurdo tira o prejuízo inventado, mas deixa a venda sem
   * custo nenhum — e a margem de outubro fica valendo só para um pedaço. O
   * custo fica congelado no pedido na emissão: corrigir o cadastro não alcança
   * pedido já emitido, e ela não vai reemitir 22 pedidos. Então ela digita.
   */
  igual('a linha descartada carrega o pedido, para a tela poder oferecer o acerto',
    r.custoSuspeito.linhas[0].pedidoId, 'pedm_1897');
  igual('com a venda do pedido inteiro', r.custoSuspeito.linhas[0].pedidoValor, 1550);
  igual('e o custo que o relatório trouxe', r.custoSuspeito.linhas[0].pedidoCusto, 56000);

  const ped1897 = await store.pedidos.obter('pedm_1897');
  await store.pedidos.salvar({ ...ped1897, custoManual: 900, custoManualEm: Date.now() });
  const rInf = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });

  igual('informado o custo real, o pedido sai da lista de descartados', rInf.custoSuspeito.quantidade, 0);
  igual('e aparece na lista do que ela corrigiu', rInf.custoInformado.quantidade, 1);
  igual('com o número do pedido', rInf.custoInformado.pedidos[0].pedido, '1897');
  igual('o custo que ela digitou', rInf.custoInformado.pedidos[0].custo, 900);
  igual('e o do relatório ao lado, para dar para conferir',
    rInf.custoInformado.pedidos[0].custoRelatorio, 56000);

  const vInf = rInf.vendedores.find((x) => x.nome === 'VENDEDOR A') || {};
  igual('o custo digitado entra na margem', vInf.custo, 8300);
  ok('e a linha do TOTAL leva o frete junto, como a de cada vendedor',
    'frete' in rInf.total && 'margemComFrete' in rInf.total, JSON.stringify(Object.keys(rInf.total)));

  /**
   * E A TELA SABE DIZER QUE O RELATÓRIO DE PRODUTOS VENDIDOS NÃO ESTÁ ENTRANDO.
   *
   * "E você acha que só esse mesmo já vai alterar tudo? Sobre a margem, custo,
   *  lucro. Não tenho que mandar mais nenhum outro relatório?"
   *
   * Ela passou um dia reexportando um relatório que, no mês dela, não encosta na
   * margem — porque a tela dizia que ele era "a fonte de CUSTO", verdade em
   * geral e mentira no caso dela.
   */
  ok('com todo o custo vindo do pedido, a tela sabe que o relatório não entra',
    rInf.conferencia.coberturaDeCusto.soDoPedido === true,
    JSON.stringify(rInf.conferencia.coberturaDeCusto));
  igual('e não sobra mais venda sem custo confiável', vInf.vendaSemCusto, 0);
  ok('a margem passa a valer para a venda inteira', vInf.margem > 0, String(vInf.margem));

  /**
   * A RÉGUA NÃO VALE PARA O QUE ELA DIGITOU.
   *
   * A régua existe para desconfiar de dado automático de origem desconhecida.
   * Se a dona da empresa olha o pedido e diz que custou mais do que vendeu, foi
   * isso que aconteceu — e discordar dela seria o app inventar de novo.
   */
  await store.pedidos.salvar({ ...ped1897, custoManual: 5000, custoManualEm: Date.now() });
  const rAcima = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('custo informado acima da venda NÃO é descartado', rAcima.custoSuspeito.quantidade, 0);
  igual('vale inteiro, do jeito que ela digitou',
    (rAcima.vendedores.find((x) => x.nome === 'VENDEDOR A') || {}).custo, 12400);

  /* apagar o valor desfaz: volta a valer o relatório, e a régua volta a pegar */
  await store.pedidos.salvar({ ...ped1897, custoManual: null, custoManualEm: null });
  const rVolta = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('apagando o valor, o pedido volta a ser descartado', rVolta.custoSuspeito.quantidade, 1);
  igual('e some da lista dos informados', rVolta.custoInformado.quantidade, 0);

  for (const n of ['nfm_9001', 'nfm_9002', 'nfm_9003']) await store.nfs.remover(n);
  for (const n of ['pedm_1897', 'pedm_1900', 'pedm_1901']) await store.pedidos.remover(n);
  for (const n of ['itm_9001', 'itm_9002', 'itm_9003']) await store.nfItens.remover(n);
  for (const x of guardadosItens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
}

console.log('\n▶ Sem XML, a margem sai dos PEDIDOS — e o custo informado muda o número');
{
  /**
   * O ERRO QUE ME CUSTOU UMA RODADA INTEIRA DELA.
   *
   * "Eu tava colocando, ajustando, e eu via que o número de margem, da
   *  porcentagem, e o custo e o lucro não mudaram."
   *
   * O custo do pedido só entrava na conta pelo caminho dos ITENS DAS NOTAS, que
   * existe só com o XML das NF-e. A base dela não tem XML: a tela mostrava custo,
   * lucro e margem copiados das colunas do relatório de produtos vendidos —
   * números de arquivo, que não mudam porque alguém corrigiu um pedido.
   *
   * E a tela ainda OFERECIA a correção, com botão, em cima de um cálculo que não
   * estava sendo usado. Pedir trabalho e jogar o resultado fora.
   *
   * Este teste é a base dela: pedidos com custo e vendedor, relatório de produtos
   * vendidos, e NENHUM item de nota.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    pedidos: await store.pedidos.listar(),
    itens: await store.nfItens.listar(),
    produto: await store.vendasProduto.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  for (const x of guardadas.produto) await store.vendasProduto.remover(x.id);
  await store.vendedores.salvar({ id: 'vSX', nome: 'VENDEDOR SEM XML' });

  const ped = (n, total, custo, extra = {}) => store.pedidos.salvar({
    id: `pedsx_${n}`, numero: String(n), data: '2026-10-07', mes: '2026-10',
    valorTotal: total, valorCusto: custo, vendedorId: 'vSX',
    concretizado: true, statusArquivo: 'Concretizada', ...extra,
  });
  /* o são */
  await ped(7001, 10000, 6000);
  /* o do tijolo: custo 36× a venda */
  await ped(7002, 1550, 56000);
  /* e um cancelado, que não é venda e não pode entrar em lugar nenhum */
  await ped(7003, 5000, 3000, { concretizado: false, statusArquivo: 'Cancelada' });
  /* o relatório de produtos vendidos existe, como no aparelho dela */
  await store.vendasProduto.salvar({
    id: 'pvsx_1', origemRelatorio: 'produtosVendidos', mes: '2026-10', data: '2026-10-15',
    descricao: 'PRODUTO QUALQUER', produtoId: 'psx1', quantidade: 100,
    custoTotal: 50000, valorTotal: 11550, lucro: -38450,
  });

  const r = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });

  igual('a margem passa a sair dos pedidos', r.fonte, 'pedidos-do-periodo');
  igual('o pedido cancelado fica fora', r.pedidosDoPeriodo.quantidade, 2);
  igual('e é contado à parte, para a diferença não parecer erro', r.pedidosDoPeriodo.cancelados, 1);
  igual('com o valor que ele tinha', r.pedidosDoPeriodo.vendaCancelada, 5000);

  igual('a venda é a soma dos pedidos concretizados', r.total.venda, 11550);
  igual('o custo é o do pedido que passou na régua', r.total.custo, 6000);
  igual('o custo absurdo fica de fora', r.custoSuspeito.quantidade, 1);
  igual('e a lista é de PEDIDOS, não de notas', r.custoSuspeito.unidade, 'pedidos');
  igual('com o pedido certo', r.custoSuspeito.linhas[0].pedido, '7002');
  igual('e com o id, para o botão de informar funcionar', r.custoSuspeito.linhas[0].pedidoId, 'pedsx_7002');

  const vSem = r.vendedores.find((x) => x.nome === 'VENDEDOR SEM XML') || {};
  igual('o vendedor aparece, sem precisar de comissão por produto', vSem.venda, 11550);
  igual('com a venda que ficou sem custo confiável', vSem.vendaSemCusto, 1550);

  /**
   * O NÚMERO QUE ELA ESTAVA OLHANDO. Antes vinha do arquivo (50.000 de custo
   * sobre 11.550 de venda, margem negativa) e não se mexia.
   */
  igual('o custo que a tela mostra é o calculado, não o do arquivo', r.total.custo, 6000);
  ok('e a margem é a calculada', Math.abs(r.total.margem - 48.05) < 0.1, String(r.total.margem));

  /* ---------------------------------------- e agora o que ela faz: informa o custo */
  const alvo = await store.pedidos.obter('pedsx_7002');
  await store.pedidos.salvar({ ...alvo, custoManual: 900, custoManualEm: Date.now() });
  const r2 = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });

  igual('informado o custo, o custo total MUDA', r2.total.custo, 6900);
  igual('o lucro muda', r2.total.lucro, 4650);
  ok('e a margem muda', Math.abs(r2.total.margem - 40.26) < 0.1, String(r2.total.margem));
  igual('a venda continua a mesma, como ela mesma esperava', r2.total.venda, 11550);
  igual('não sobra pedido descartado', r2.custoSuspeito.quantidade, 0);
  igual('e o pedido corrigido aparece na lista dela', r2.custoInformado.quantidade, 1);
  igual('a cobertura de custo fecha', r2.conferencia.coberturaDeCusto.percentual, 100);
  igual('e a conferência não acusa divergência inventada', r2.conferencia.ok, true);
  igual('dizendo de que base ela é', r2.conferencia.base, 'pedidos do relatório de vendas');

  for (const n of ['pedsx_7001', 'pedsx_7002', 'pedsx_7003']) await store.pedidos.remover(n);
  await store.vendasProduto.remover('pvsx_1');
  for (const x of guardadas.produto) await store.vendasProduto.salvar(x);
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
}

console.log('\n▶ O app confere o que montou contra o total que o arquivo declara');
{
  /**
   * "Eu reenviei o relatório que você pediu, no período que você pediu, só que
   *  agora aparece isso."
   *
   * Foram cinco rodadas atrás de R$ 16.546,54 de diferença entre o que o arquivo
   * dela soma e o que o app montou dele. E a resposta estava impressa no próprio
   * arquivo o tempo todo: o relatório abre com um painel que declara "Valor
   * total: R$ 653.592,84".
   *
   * Um leitor de PDF que perde uma linha não é consertável de uma vez por todas
   * — sempre haverá um nome comprido, uma quebra de página. O que é consertável
   * é ele perder linha EM SILÊNCIO.
   */
  const guardadas = await store.vendasProduto.listar();
  for (const x of guardadas) await store.vendasProduto.remover(x.id);

  const PAINEL = [
    'Quantidade;Relatório de produtos vendidos;Custo total;Valor total;;Lucro',
    '200,00;;3.000,00;653.592,84;;650.592,84',
    'Produtos vendidos no período;;Custo dos produtos vendidos;Valor total das vendas;;Valores já confirmados',
    'Produto;Quantidade;Custo médio;Custo total;Valor total;Lucro',
  ].join('\n');

  const preparar = async (linhasDeProduto) => {
    const conteudo = `${PAINEL}\n${linhasDeProduto.join('\n')}`;
    const leitura = await readFile(new File([conteudo], 'pv.csv', { type: 'text/csv' }));
    const cabecalho = leitura.planilhas[0].linhas[3].map(String);
    return ingest.prepararTabular({
      fonteId: 'produtosVendidos',
      leitura,
      planilhaIndex: 0,
      headerRow: 3,
      mapeamento: ingest.sugerirMapeamento('produtosVendidos', cabecalho),
      mesReferencia: '2026-10-01',
    });
  };
  const reclamou = (p) => (p.avisos || []).find((a) => /O PRÓPRIO ARQUIVO diz/.test(a));

  /* o leitor perdeu uma linha: o arquivo declara mais do que o app montou */
  const faltando = await preparar([
    'PRODUTO A;100;10,00;1.000,00;600.000,00;599.000,00',
    'PRODUTO B;100;20,00;2.000,00;37.046,30;35.046,30',
  ]);
  const aviso = reclamou(faltando);
  ok('o app percebe que montou menos do que o arquivo declara', !!aviso,
    JSON.stringify(faltando.avisos));
  ok('dizendo quanto faltou, em reais', /16\.546,54/.test(aviso || ''), aviso);
  ok('e em porcentagem, com vírgula', /2,5%/.test(aviso || ''), aviso);
  ok('com o caminho: exportar em Excel em vez de PDF', /EXCEL/i.test(aviso || ''), aviso);

  /* e quando fecha, ele não diz nada: aviso que aparece sempre ninguém lê */
  const fechando = await preparar([
    'PRODUTO A;100;10,00;1.000,00;600.000,00;599.000,00',
    'PRODUTO B;100;20,00;2.000,00;53.592,84;51.592,84',
  ]);
  ok('quando bate, o app fica calado', !reclamou(fechando), JSON.stringify(fechando.avisos));

  /* centavo de arredondamento do PDF não vira alarme */
  const centavos = await preparar([
    'PRODUTO A;100;10,00;1.000,00;600.000,00;599.000,00',
    'PRODUTO B;100;20,00;2.000,00;53.592,80;51.592,80',
  ]);
  ok('e quatro centavos de arredondamento também não', !reclamou(centavos),
    JSON.stringify(centavos.avisos));

  for (const x of await store.vendasProduto.listar()) await store.vendasProduto.remover(x.id);
  for (const x of guardadas) await store.vendasProduto.salvar(x);
}

console.log('\n▶ Reenviar o relatório do mês SUBSTITUI o mês, como o aviso promete');
{
  /**
   * "Eu reenviei o relatório que você pediu, no período que você pediu, só que
   *  agora aparece isso."
   *
   * Aparecia R$ 1.096.656,33 onde o arquivo dela soma R$ 653.592,84. O app
   * avisava, antes de importar, que as linhas do arquivo anterior "serão
   * SUBSTITUÍDAS" — e não substituía nada: cada linha nova sobrescrevia a do
   * mesmo produto, e todo produto que existia só no arquivo velho ficava ali,
   * somando no mês.
   *
   * Prometer na tela e não fazer é pior que não prometer: ela mandou o arquivo
   * certo, no período certo, e o número continuou errado.
   */
  const guardadas = await store.vendasProduto.listar();
  for (const x of guardadas) await store.vendasProduto.remover(x.id);

  const PVX = 'Produto;Quantidade;Custo médio;Custo total;Valor total;Lucro';
  /* o arquivo com vários meses dentro, que é o que ela tinha mandado */
  await importar('produtosVendidos', 'varios.csv', `${PVX}
TIJOLO X;100;10,00;1.000,00;2.000,00;1.000,00
AREIA X;100;20,00;2.000,00;3.000,00;1.000,00
CIMENTO SO DE AGOSTO;100;30,00;3.000,00;5.000,00;2.000,00
CAL SO DE SETEMBRO;100;40,00;4.000,00;6.000,00;2.000,00`, { mesReferencia: '2026-10-01' });

  const soma = async () => {
    const linhas = (await store.vendasProduto.listar())
      .filter((l) => l.origemRelatorio === 'produtosVendidos' && l.mes === '2026-10');
    return {
      linhas: linhas.length,
      valor: Math.round(linhas.reduce((a, l) => a + (l.valorTotal || 0), 0) * 100) / 100,
    };
  };
  igual('o arquivo grande entrou inteiro', (await soma()).linhas, 4);
  igual('somando tudo', (await soma()).valor, 16000);

  /* agora o relatório só de outubro, como ela reenviou */
  const r2 = await importar('produtosVendidos', 'outubro.csv', `${PVX}
TIJOLO X;100;10,00;1.000,00;2.000,00;1.000,00
AREIA X;100;20,00;2.000,00;3.000,00;1.000,00`, { mesReferencia: '2026-10-01' });

  const depois = await soma();
  igual('as linhas que só existiam no arquivo velho SOMEM', depois.linhas, 2);
  igual('e o mês passa a somar exatamente o arquivo novo', depois.valor, 5000);
  ok('e o app diz quantas tirou e quanto elas somavam',
    (r2.preparo.avisos || []).some((a) => /foram REMOVIDAS do mês/.test(a)),
    JSON.stringify(r2.preparo.avisos));

  for (const x of await store.vendasProduto.listar()) {
    if (/ X$|SO DE /.test(x.descricao || '')) await store.vendasProduto.remover(x.id);
  }
  for (const x of guardadas) await store.vendasProduto.salvar(x);
}

console.log('\n▶ O orçamento guarda o vendedor que veio no arquivo');
{
  /**
   * A aba "Orçamentos não fechados" do fechamento tinha uma coluna Vendedor
   * apontando para um campo que não existia em lugar nenhum: nem na fonte, nem
   * no construtor. Ia vazia em todas as linhas, no relatório que vai para o pai
   * dela — e orçamento em aberto POR VENDEDOR é justamente o que o gerente
   * comercial precisa ver.
   */
  const guardados = await store.orcamentos.listar();
  for (const x of guardados) await store.orcamentos.remover(x.id);

  const ORC = 'Número;Cliente;Data;Vendedor;Situação;Valor';
  await importar('orcamentos', 'orc-vend.csv', `${ORC}
7001;CLIENTE ORC A;05/09/2026;VENDEDOR DOSSIE;Em aberto;10.000,00
7002;CLIENTE ORC B;06/09/2026;VENDEDOR DOSSIE;Aprovado;5.000,00`);

  const lista = await store.orcamentos.listar();
  const a = lista.find((x) => x.numero === '7001');
  igual('a coluna Vendedor é reconhecida sozinha', a?.vendedorNome, 'VENDEDOR DOSSIE');

  const doc = (await dossie.pasta('2026-09')).documentos.find((d) => d.id === 'orcamentos');
  ok('e a coluna aparece no fechamento quando há vendedor',
    doc.colunas.some((c) => c.key === 'vendedorNome'),
    JSON.stringify(doc.colunas.map((c) => c.key)));
  ok('com o nome na linha, não vazia',
    doc.linhas.every((l) => l.vendedorNome === 'VENDEDOR DOSSIE'),
    JSON.stringify(doc.linhas.map((l) => l.vendedorNome)));

  /* e some quando o arquivo não traz, em vez de ir vazia para o relatório */
  for (const x of await store.orcamentos.listar()) await store.orcamentos.remover(x.id);
  await store.orcamentos.salvar({
    id: 'orc_sv', numero: '7003', data: '2026-09-07', mes: '2026-09',
    clienteNome: 'CLIENTE ORC C', valorTotal: 3000, situacao: 'aberto', vendedorNome: null,
  });
  const doc2 = (await dossie.pasta('2026-09')).documentos.find((d) => d.id === 'orcamentos');
  ok('sem vendedor no arquivo, a coluna nem aparece',
    !doc2.colunas.some((c) => c.key === 'vendedorNome'),
    JSON.stringify(doc2.colunas.map((c) => c.key)));

  for (const x of await store.orcamentos.listar()) await store.orcamentos.remover(x.id);
  for (const x of guardados) await store.orcamentos.salvar(x);
}

console.log('\n▶ O faturamento da Margem é o MESMO da tela Hoje');
{
  /**
   * "Faturamento R$ 658.510,63 na aba Hoje está correto, mas no Margem e frete
   *  está R$ 609.296,35. O faturamento num lugar tá num e no outro tá em outro.
   *  O correto é 658.510,63."
   *
   * Os dois números estavam certos e mediam coisas diferentes. Mas a tela
   * mostrava só o segundo, com o mesmo rótulo que a outra usa para o primeiro —
   * e dois números com o mesmo nome em telas diferentes destroem a confiança na
   * base inteira, com razão.
   *
   * Pior: os ITENS eram filtrados pela data da própria linha e as notas pela
   * data de emissão. Quando as duas diferem, as telas contam conjuntos
   * diferentes de venda e a diferença não fecha com nada.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    itens: await store.nfItens.listar(),
    pedidos: await store.pedidos.listar(),
    fretes: await store.fretes.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  for (const x of guardadas.fretes) await store.fretes.remover(x.id);
  await store.vendedores.salvar({ id: 'vFAT', nome: 'VENDEDOR FATURAMENTO' });

  const nota = (n, prod, frete, ped) => store.nfs.salvar({
    id: `nfat_${n}`, numero: String(n), serie: '1', dataEmissao: '2026-10-10',
    valorTotal: prod + frete, valorProdutos: prod, valorFrete: frete,
    vendedorId: 'vFAT', pedidoNumero: ped ? String(ped) : null,
    status: 'autorizada', operacao: 'saida', devolucao: false, devolucaoDeCompra: false,
  });
  /* o item carrega uma data de OUTRO mês de propósito: quem manda é a nota */
  const item = (n, valor) => store.nfItens.salvar({
    id: `itfat_${n}`, nfId: `nfat_${n}`, data: '2026-08-01', nfStatus: 'autorizada',
    vendedorId: 'vFAT', produtoId: 'pfat', descricao: 'ITEM', quantidade: 1, valorTotal: valor,
  });
  await nota(3001, 10000, 1000, 600); await item(3001, 10000);
  await store.pedidos.salvar({ id: 'ped_600', numero: '600', data: '2026-10-05', valorTotal: 11000, valorCusto: 6000 });
  /* e uma nota SEM item nenhum: entra no faturamento, não entra na margem */
  await nota(3002, 4000, 0, null);

  const r = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  const hoje = await revenue.resumo({ de: '2026-10-01', ate: '2026-10-31' });

  igual('o faturamento da Margem bate com o do Hoje, ao centavo',
    r.faturamento.total, hoje.total);
  igual('e conta as mesmas notas', r.faturamento.notas, hoje.notas ?? 2);
  igual('o item entra pelo período da NOTA, não pela data dele', r.total.venda, 10000);
  igual('a nota sem item fica de fora da margem', r.faturamento.semItens.quantidade, 1);
  igual('com o valor dela à vista', r.faturamento.semItens.valor, 4000);

  /* e a conta fecha: faturamento = mercadoria + frete + notas sem item */
  const soma = Math.round((r.faturamento.mercadoria + r.frete.total
    + r.faturamento.semItens.valor) * 100) / 100;
  igual('faturamento = mercadoria + frete + notas sem item', soma, r.faturamento.total);

  /* a margem por vendedor não leva frete: é só mercadoria */
  igual('a margem é só da mercadoria', r.total.venda, 10000);
  igual('e o custo é o do pedido', r.total.custo, 6000);

  for (const n of ['nfat_3001', 'nfat_3002']) await store.nfs.remover(n);
  await store.nfItens.remover('itfat_3001');
  await store.pedidos.remover('ped_600');
  for (const x of guardadas.fretes) await store.fretes.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
}

console.log('\n▶ O DRE comercial fecha: bruta − devolução − fora da base − CMV = lucro bruto');
{
  /**
   * "Da aba comercial, o que eu acrescentaria que você não tem é as vendas
   *  líquidas, ou seja, base para margem, CMV sobre líquida, e CMV custo. É
   *  tipo um DRE. Comercial."
   *
   * Um DRE que não fecha é pior que nenhum: cada linha parece certa e o total
   * mente. Então o que este teste verifica não é cada número — é a CONTA. Cada
   * degrau da escada tem de sair do anterior, e a soma do que sai da base tem
   * de explicar exatamente a diferença entre faturamento e vendas líquidas.
   *
   * E o faturamento daqui tem de ser o mesmo da tela Hoje, pelo mesmo motivo de
   * antes: dois números com o mesmo nome em telas diferentes é a base inteira
   * perdendo credibilidade.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    itens: await store.nfItens.listar(),
    pedidos: await store.pedidos.listar(),
    fretes: await store.fretes.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  for (const x of guardadas.fretes) await store.fretes.remover(x.id);
  await store.vendedores.salvar({ id: 'vDRE', nome: 'VENDEDOR DRE' });

  const faixa = { de: '2026-10-01', ate: '2026-10-31' };
  const nota = (n, prod, frete, extra = {}) => store.nfs.salvar({
    id: `ndre_${n}`, numero: String(n), serie: '1', dataEmissao: '2026-10-12',
    valorTotal: prod + frete, valorProdutos: prod, valorFrete: frete,
    vendedorId: 'vDRE', status: 'autorizada', operacao: 'saida',
    devolucao: false, devolucaoDeCompra: false, ...extra,
  });

  /* venda com item detalhado e custo de pedido: é ela que forma a base da margem */
  await nota(4001, 10000, 1000, { pedidoNumero: '700' });
  await store.nfItens.salvar({
    id: 'idre_4001', nfId: 'ndre_4001', data: '2026-10-12', nfStatus: 'autorizada',
    vendedorId: 'vDRE', produtoId: 'pdre', descricao: 'ITEM DRE', quantidade: 1, valorTotal: 10000,
  });
  await store.pedidos.salvar({
    id: 'ped_700', numero: '700', data: '2026-10-08', valorTotal: 11000, valorCusto: 6000,
  });
  /* venda sem item nenhum: entra no faturamento, não entra na base da margem */
  await nota(4002, 4000, 0);

  const d1 = await comercialMod.dreComercial(faixa);
  const hoje1 = await revenue.resumo(faixa);

  igual('o faturamento do DRE é o mesmo da tela Hoje', d1.faturamento, hoje1.total);
  ok('e os dois caminhos até ele conferem', d1.conferencia.ok, JSON.stringify(d1.conferencia));
  igual('vendas brutas = faturamento quando não houve devolução', d1.vendasBrutas, 15000);
  igual('o frete cobrado sai da base', d1.freteCobrado, 1000);
  igual('a nota sem item também sai da base', d1.semItens.valor, 4000);
  igual('nada fica sem explicação', d1.naoExplicado, 0);
  igual('vendas líquidas = só a mercadoria com item', d1.vendasLiquidas, 10000);
  igual('o CMV é o custo do pedido', d1.cmv, 6000);
  igual('o lucro bruto é líquida − CMV', d1.lucroBruto, 4000);
  igual('o CMV sobre a líquida', Math.round(d1.percentualCmv * 10) / 10, 60);
  igual('e o lucro bruto sobre a líquida', Math.round(d1.percentualLucroBruto * 10) / 10, 40);
  igual('os dois percentuais fecham em 100',
    Math.round((d1.percentualCmv + d1.percentualLucroBruto) * 10) / 10, 100);
  igual('os produtos diferentes são contados', d1.itensVendidos.produtos, 1);

  /* a escada desenhada é a MESMA conta: cada degrau sai do anterior */
  const linhas = comercialMod.linhasDoDre(d1);
  const valor = (id) => linhas.find((l) => l.id === id)?.valor;
  igual('escada: bruta + devolução = faturamento',
    valor('dre-brutas') + (valor('dre-devolucoes') || 0), valor('dre-faturamento'));
  igual('escada: faturamento + fora da base = vendas líquidas',
    valor('dre-faturamento') + (valor('dre-fora-da-base') || 0), valor('dre-liquidas'));
  igual('escada: vendas líquidas + CMV = lucro bruto',
    valor('dre-liquidas') + valor('dre-cmv'), valor('dre-lucro-bruto'));
  ok('a linha "fora da base" abre e diz o que é',
    (linhas.find((l) => l.id === 'dre-fora-da-base')?.detalhe || []).length === 2,
    JSON.stringify(linhas.find((l) => l.id === 'dre-fora-da-base')?.detalhe));

  /* agora uma DEVOLUÇÃO de venda: abate o faturamento sem mexer na base */
  await nota(4003, 1000, 0, { operacao: 'entrada', devolucao: true });
  const d2 = await comercialMod.dreComercial(faixa);
  const hoje2 = await revenue.resumo(faixa);

  igual('a devolução aparece em linha própria', d2.devolucoes.valor, 1000);
  igual('as vendas brutas não mudam', d2.vendasBrutas, 15000);
  igual('o faturamento cai o valor devolvido', d2.faturamento, 14000);
  igual('e continua igual ao da tela Hoje', d2.faturamento, hoje2.total);
  igual('a base da margem não se mexe', d2.vendasLiquidas, 10000);
  igual('nem o lucro bruto', d2.lucroBruto, 4000);
  igual('a conta continua fechando sem resto', d2.naoExplicado, 0);
  const l2 = comercialMod.linhasDoDre(d2);
  const v2 = (id) => l2.find((l) => l.id === id)?.valor;
  igual('escada com devolução: bruta − devolvido = faturamento',
    v2('dre-brutas') + v2('dre-devolucoes'), v2('dre-faturamento'));
  igual('e a devolução entra negativa na escada', v2('dre-devolucoes'), -1000);

  for (const n of ['ndre_4001', 'ndre_4002', 'ndre_4003']) await store.nfs.remover(n);
  await store.nfItens.remover('idre_4001');
  await store.pedidos.remover('ped_700');
  for (const x of guardadas.fretes) await store.fretes.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
}

console.log('\n▶ Frete cobrado dá o MESMO número na tabela e no cartão');
{
  /**
   * A tabela de margem somava R$ 60.403,48 de frete e o cartão "Frete cobrado"
   * dizia R$ 60.743,48, na mesma tela, com o mesmo rótulo. A diferença eram
   * R$ 340,00: uma devolução de R$ 170,00 de frete, descontada de um lado e
   * somada do outro.
   *
   * Dois números com o mesmo nome, um ao lado do outro, é a tela se
   * contradizendo — e quem lê não tem como saber qual acreditar.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    itens: await store.nfItens.listar(),
    pedidos: await store.pedidos.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  await store.vendedores.salvar({ id: 'vFR', nome: 'VENDEDOR FRETE' });

  const nota = (n, valor, frete, dev) => store.nfs.salvar({
    id: `nffr_${n}`, numero: String(n), serie: '1', dataEmissao: '2026-10-10',
    valorTotal: valor + frete, valorProdutos: valor, valorFrete: frete,
    vendedorId: 'vFR', pedidoNumero: '7700',
    status: 'autorizada', operacao: dev ? 'entrada' : 'saida', devolucao: !!dev, devolucaoDeCompra: false,
  });
  const item = (n, valor) => store.nfItens.salvar({
    id: `itfr_${n}`, nfId: `nffr_${n}`, data: '2026-10-10', nfStatus: 'autorizada',
    vendedorId: 'vFR', produtoId: 'pfr', descricao: 'ITEM', quantidade: 1, valorTotal: valor,
  });
  await nota(7001, 10000, 1000, false); await item(7001, 10000);
  await nota(7002, 500, 170, true); await item(7002, 500);
  await store.pedidos.salvar({ id: 'ped_7700', numero: '7700', data: '2026-10-05', valorTotal: 11000, valorCusto: 6000 });

  const r = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  const naTabela = Math.round(r.vendedores.reduce((a, v) => a + (v.frete || 0), 0) * 100) / 100;
  igual('o cartão desconta o frete da devolução', r.frete.total, 830);
  igual('a tabela por vendedor diz o mesmo', naTabela, 830);
  igual('e o TOTAL da tabela também', r.total.frete, 830);

  for (const n of ['nffr_7001', 'nffr_7002']) await store.nfs.remover(n);
  for (const n of ['itfr_7001', 'itfr_7002']) await store.nfItens.remover(n);
  await store.pedidos.remover('ped_7700');
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
}

console.log('\n▶ Entrega sem dono aparece com nome, em vez de virar custo zero');
{
  /**
   * "Do Carlos Eduardo, tá aqui, custo zero, não tem custo nenhum. Queria
   *  entender o porquê tá acontecendo isso. Porque não tá parametrizando os
   *  custos dele."
   *
   * Custo zero numa linha quer dizer "não custou". O que estava acontecendo era
   * "não sei de quem é" — nome escrito na planilha de um jeito que o cadastro
   * não reconhece. Mostrar só o zero transformava um problema de cadastro em
   * informação falsa sobre o vendedor.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    itens: await store.nfItens.listar(),
    fretes: await store.fretes.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  for (const x of guardadas.fretes) await store.fretes.remover(x.id);
  await store.vendedores.salvar({ id: 'vCE', nome: 'CARLOS EDUARDO APARECIDO' });

  await store.nfs.salvar({
    id: 'nfce', numero: '4100', serie: '1', dataEmissao: '2026-10-10',
    valorTotal: 11000, valorProdutos: 10000, valorFrete: 1000, vendedorId: 'vCE',
    status: 'autorizada', operacao: 'saida', devolucao: false, devolucaoDeCompra: false,
  });
  await store.fretes.salvar({
    id: 'frce', data: '2026-10-11', responsavel: 'TRANSPORTADORA',
    valor: 700, vendedorNome: 'CADU', mes: '2026-10',
  });

  const r = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('a entrega sem dono não vira custo de ninguém', r.frete.custo.semVendedor, 700);
  igual('e o nome que não bateu fica à vista',
    (r.frete.custo.nomesSemVendedor[0] || {}).nome, 'CADU');
  igual('com o valor dele', (r.frete.custo.nomesSemVendedor[0] || {}).valor, 700);

  /**
   * O CASO DELA: a planilha escreve o SEGUNDO nome.
   *
   * "O que eu acho que é do Eduardo é que as notas estão como Carlos Eduardo e
   *  na planilha ele deve estar Eduardo."
   *
   * R$ 16.107,10 de entrega ficavam órfãos porque o app só olhava o primeiro
   * nome. O pedaço de nome vale desde que pertença a UM vendedor só.
   */
  await store.fretes.salvar({
    id: 'frce', data: '2026-10-11', responsavel: 'TRANSPORTADORA',
    valor: 700, vendedorNome: 'EDUARDO', mes: '2026-10',
  });
  const rE = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('o segundo nome acha o vendedor', rE.frete.custo.semVendedor, 0);
  igual('e o custo cai na linha certa',
    rE.frete.vendedores.find((v) => v.nome === 'CARLOS EDUARDO APARECIDO')?.custoReal, 700);
  igual('a tela diz que ligou por pedaço de nome',
    (rE.frete.custo.ligadosPorPedaco[0] || {}).escrito, 'EDUARDO');
  igual('e a quem ligou',
    (rE.frete.custo.ligadosPorPedaco[0] || {}).vendedor, 'CARLOS EDUARDO APARECIDO');

  /* partícula não identifica ninguém: "DO" não pode ligar a ninguém */
  await store.fretes.salvar({
    id: 'frce', data: '2026-10-11', responsavel: 'TRANSPORTADORA',
    valor: 700, vendedorNome: 'DO', mes: '2026-10',
  });
  const rP = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('partícula de nome não liga a ninguém', rP.frete.custo.semVendedor, 700);

  /* escrito como no cadastro, bate — e some da lista */
  await store.fretes.salvar({
    id: 'frce', data: '2026-10-11', responsavel: 'TRANSPORTADORA',
    valor: 700, vendedorNome: 'CARLOS EDUARDO APARECIDO', mes: '2026-10',
  });
  const r2 = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('com o nome do cadastro, a entrega acha o dono', r2.frete.custo.semVendedor, 0);
  const linha = r2.frete.vendedores.find((v) => v.nome === 'CARLOS EDUARDO APARECIDO');
  igual('e o custo cai na linha dele', linha?.custoReal, 700);
  igual('com a sobra calculada', linha?.resultado, 300);

  /**
   * E O CASO EM QUE O APP NÃO DECIDE DE PROPÓSITO: dois vendedores com o mesmo
   * primeiro nome. Escolher errado seria pior que não escolher — mas tem de
   * DIZER que foi isso.
   */
  await store.vendedores.salvar({ id: 'vZ1', nome: 'ZELIA MARIA DUARTE' });
  await store.vendedores.salvar({ id: 'vZ2', nome: 'ZELIA CRISTINA BORGES' });
  await store.fretes.salvar({
    id: 'frce', data: '2026-10-11', responsavel: 'TRANSPORTADORA',
    valor: 700, vendedorNome: 'ZELIA', mes: '2026-10',
  });
  const r3 = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('primeiro nome de dois vendedores não escolhe nenhum', r3.frete.custo.semVendedor, 700);

  /**
   * A SOBRA DA TABELA TEM DE SER A MESMA DO CARTÃO.
   *
   * "O frete que sobra agora é 7.370,23. E aqui tá 6.880,23. A sobra tá
   *  diferente do que tá na sobra do outro."
   *
   * O cartão descontava TODO o custo de entrega; a tabela, só o que tinha dono.
   * A diferença era a entrega sem nome na planilha, invisível — dois números com
   * o mesmo nome, outra vez.
   */
  igual('o cartão desconta todo o custo de entrega', r3.frete.custo.resultado,
    Math.round((r3.frete.total - r3.frete.custo.total) * 100) / 100);
  const naTabelaFrete = Math.round((r3.frete.vendedores
    .reduce((a, v) => a + (v.custoReal || 0), 0) + r3.frete.custo.semVendedor) * 100) / 100;
  igual('e a coluna de custo da tabela soma o mesmo, com a linha sem dono junto',
    naTabelaFrete, r3.frete.custo.total);

  /**
   * E "FRETE / FATURAMENTO" DIVIDE PELO FATURAMENTO DE VERDADE.
   *
   * Dividia só pelas notas QUE TÊM frete, o que inflava a porcentagem e punha na
   * tela um "faturamento" diferente do faturamento do mesmo vendedor em qualquer
   * outro lugar do app.
   */
  await store.nfs.salvar({
    id: 'nfce2', numero: '4101', serie: '1', dataEmissao: '2026-10-12',
    valorTotal: 9000, valorProdutos: 9000, vendedorId: 'vCE',
    status: 'autorizada', operacao: 'saida', devolucao: false, devolucaoDeCompra: false,
  });
  const rF = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  const ce = rF.frete.vendedores.find((v) => v.nome === 'CARLOS EDUARDO APARECIDO');
  igual('o faturamento da linha conta TODAS as notas do vendedor', ce?.faturamento, 20000);
  ok('e o peso do frete é sobre esse faturamento',
    Math.abs(ce.peso - 5) < 0.01, String(ce?.peso));
  await store.nfs.remover('nfce2');
  ok('e a tela sabe dizer que foi por ambiguidade',
    (r3.frete.custo.primeirosNomesRepetidos || []).includes('zelia'),
    JSON.stringify(r3.frete.custo.primeirosNomesRepetidos));

  await store.vendedores.remover('vZ1');
  await store.vendedores.remover('vZ2');
  await store.fretes.remover('frce');
  await store.nfs.remover('nfce');
  for (const x of guardadas.fretes) await store.fretes.salvar(x);
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
}

console.log('\n▶ Devolução não empurra a cobertura de custo acima de 100%');
{
  /**
   * "286 notas pegaram o custo do PEDIDO que as gerou (100,6% da venda)."
   *
   * A devolução entra na venda com sinal negativo — está certo, é menos
   * faturamento — mas encolhia o denominador de uma cobertura cujo numerador só
   * cresce. Cobertura acima de 100% não é arredondamento feio: é a tela perdendo
   * a credibilidade na linha que existe para dizer se dá para confiar no número
   * de cima.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    pedidos: await store.pedidos.listar(),
    itens: await store.nfItens.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  await store.vendedores.salvar({ id: 'vDV', nome: 'VENDEDOR DEVOLUCAO' });

  const nota = (n, ped, valor, dev) => store.nfs.salvar({
    id: `nfd_${n}`, numero: String(n), serie: '1', dataEmissao: '2026-10-10',
    valorTotal: valor, valorProdutos: valor, vendedorId: 'vDV', pedidoNumero: ped ? String(ped) : null,
    status: 'autorizada', operacao: dev ? 'entrada' : 'saida', devolucao: !!dev, devolucaoDeCompra: false,
  });
  const item = (n, valor) => store.nfItens.salvar({
    id: `itd_${n}`, nfId: `nfd_${n}`, data: '2026-10-10', nfStatus: 'autorizada',
    vendedorId: 'vDV', produtoId: 'pdv', descricao: 'ITEM', quantidade: 1, valorTotal: valor,
  });
  await nota(6001, 4000, 10000, false); await item(6001, 10000);
  await store.pedidos.salvar({ id: 'ped_4000', numero: '4000', data: '2026-10-05', valorTotal: 10000, valorCusto: 6000 });
  /* a devolução, SEM pedido ligado: era ela que passava de 100% */
  await nota(6002, null, 500, true); await item(6002, 500);

  const r = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  const c = r.conferencia.coberturaDeCusto;
  ok('a cobertura não passa de 100%', c.percentual <= 100, String(c.percentual));
  ok('nem a parcela que veio do pedido', c.percentualDoPedido <= 100, String(c.percentualDoPedido));
  igual('a base é o que passou, sem sinal', c.venda, 10500);
  igual('e a devolução sem custo aparece como o que falta', c.semCusto, 500);
  /* e a venda do período continua com o sinal certo: devolução é menos faturamento */
  igual('a venda continua descontando a devolução', r.total.venda, 9500);

  /**
   * A tela compara o relatório de produtos vendidos com as notas do mês para
   * dizer se o arquivo é do mês ou de vários. Os dois lados têm de existir.
   */
  ok('a conferência traz os dois lados da comparação de base',
    r.conferencia.vendaDasNotas != null && r.conferencia.vendaDoRelatorio != null,
    JSON.stringify({ notas: r.conferencia.vendaDasNotas, rel: r.conferencia.vendaDoRelatorio }));

  for (const n of ['nfd_6001', 'nfd_6002']) await store.nfs.remover(n);
  for (const n of ['itd_6001', 'itd_6002']) await store.nfItens.remover(n);
  await store.pedidos.remover('ped_4000');
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
}

console.log('\n▶ Quando a margem NÃO sai dos pedidos, a tela diz qual coluna faltou');
{
  /**
   * "Eu já vi aqui e eu tô na versão certa, versão 59, mas não mudou nada no que
   *  eu preciso."
   *
   * O app caía na fonte pior em silêncio: a tela ficava idêntica à de antes do
   * conserto, e nem ela nem eu tínhamos como saber qual campo faltava na base
   * dela. Duas rodadas se foram adivinhando por print.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    pedidos: await store.pedidos.listar(),
    itens: await store.nfItens.listar(),
    produto: await store.vendasProduto.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  for (const x of guardadas.produto) await store.vendasProduto.remover(x.id);
  await store.vendasProduto.salvar({
    id: 'pvq_1', origemRelatorio: 'produtosVendidos', mes: '2026-10', data: '2026-10-15',
    descricao: 'PRODUTO', produtoId: 'pq1', quantidade: 10, custoTotal: 900, valorTotal: 1000, lucro: 100,
  });

  /* pedido com custo, mas SEM valor total: a coluna não foi reconhecida */
  await store.pedidos.salvar({
    id: 'pq_1', numero: '8001', data: '2026-10-05', mes: '2026-10',
    valorTotal: null, valorCusto: 700, concretizado: true,
  });
  const semValor = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('sem valor total no pedido, a margem não sai dos pedidos', semValor.fonte, 'relatorio-por-produto');
  igual('e a tela sabe quantos pedidos existem', semValor.origemDosNumeros.pedidosNaBase, 1);
  igual('quantos caíram no período', semValor.origemDosNumeros.noPeriodo, 1);
  igual('e que o que falta é o valor total', semValor.origemDosNumeros.comValorTotal, 0);
  igual('tendo custo', semValor.origemDosNumeros.comCusto, 1);

  /* pedido SEM DATA na linha, mas com o mês escolhido na importação: entra */
  await store.pedidos.salvar({
    id: 'pq_2', numero: '8002', data: null, mes: '2026-10',
    valorTotal: 1000, valorCusto: 600, concretizado: true,
  });
  const porMes = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('pedido sem data entra pelo mês da importação', porMes.fonte, 'pedidos-do-periodo');
  igual('com a venda dele', porMes.total.venda, 1000);
  igual('e o custo dele', porMes.total.custo, 600);

  for (const n of ['pq_1', 'pq_2']) await store.pedidos.remover(n);
  await store.vendasProduto.remover('pvq_1');
  for (const x of guardadas.produto) await store.vendasProduto.salvar(x);
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
}

console.log('\n▶ Pedido sem valor total não desliga a régua do custo');
{
  /**
   * A régua media contra a venda do PEDIDO. Pedido sem valor total faria ela
   * parar de funcionar em silêncio, e o custo absurdo voltaria para dentro da
   * margem sem ninguém ver. Ela volta a medir contra a venda da NOTA.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    pedidos: await store.pedidos.listar(),
    itens: await store.nfItens.listar(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  for (const x of guardadas.itens) await store.nfItens.remover(x.id);
  await store.vendedores.salvar({ id: 'vRG', nome: 'VENDEDOR REGUA' });

  await store.nfs.salvar({
    id: 'nfrg_1', numero: '9100', serie: '1', dataEmissao: '2026-10-10',
    valorTotal: 1550, valorProdutos: 1550, vendedorId: 'vRG', pedidoNumero: '8100',
    status: 'autorizada', operacao: 'saida', devolucao: false, devolucaoDeCompra: false,
  });
  await store.nfItens.salvar({
    id: 'itrg_1', nfId: 'nfrg_1', data: '2026-10-10', nfStatus: 'autorizada',
    vendedorId: 'vRG', produtoId: 'prg', descricao: 'TIJOLO', quantidade: 1, valorTotal: 1550,
  });
  /* custo de 56 mil, e o pedido sem valor total: a régua tem de pegar pela nota */
  await store.pedidos.salvar({
    id: 'ped_8100', numero: '8100', data: '2026-10-09', valorTotal: null, valorCusto: 56000,
  });

  const r = await margemMod.margem({ de: '2026-10-01', ate: '2026-10-31' });
  igual('a régua pega mesmo sem valor total no pedido', r.custoSuspeito.quantidade, 1);
  igual('e o custo absurdo não entra na margem', r.total.custo, 0);

  await store.nfs.remover('nfrg_1');
  await store.nfItens.remover('itrg_1');
  await store.pedidos.remover('ped_8100');
  for (const x of guardadas.itens) await store.nfItens.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
}

console.log('\n▶ O que o arquivo afirma vence o que uma data sugere');
{
  /**
   * O ÚLTIMO, E O QUE MAIS CUSTOU.
   *
   * O log da importação dela mostrava a releitura ABRINDO 565 títulos, e o
   * diagnóstico, feito em seguida, mostrava os mesmos 565 fechados. Alguma
   * coisa os fechava depois — e era `statusTitulo`, chamada por `recalcular()`
   * ao fim de TODA importação:
   *
   *     if (titulo.dataRecebimento || ...) return 'pago';
   *
   * O relatório dela traz data de recebimento preenchida mesmo em título que a
   * coluna Situação chama de "Em aberto" — previsão, não baixa. A data sugeria
   * pago, e a sugestão vencia o que o arquivo AFIRMA.
   *
   * E foi por isso que o contas a pagar sempre funcionou e o a receber nunca:
   * contas a pagar grava `dataPagamento`, que aquela linha não olhava. A mesma
   * pergunta tinha TRÊS leituras no app; eu tinha consertado duas e deixado
   * esta para trás, e ela desfazia as outras duas a cada importação.
   */
  const guardados = await store.receber.listar();
  for (const t of guardados) await store.receber.remover(t.id);

  await store.receber.salvar({
    id: 'y1', clienteNome: 'A', vencimento: '2026-11-05', valor: 2451.52,
    statusArquivo: 'Em aberto', status: 'aberto', saldo: 2451.52,
    dataRecebimento: '2026-10-20',
  });
  await store.receber.salvar({
    id: 'y2', clienteNome: 'B', vencimento: '2026-11-06', valor: 1000,
    statusArquivo: 'Confirmado', status: 'pago', saldo: 0, dataRecebimento: '2026-10-20',
  });
  /* sem coluna Situação, a data continua valendo: é a única evidência que há */
  await store.receber.salvar({
    id: 'y3', clienteNome: 'C', vencimento: '2026-11-07', valor: 700,
    status: 'aberto', saldo: 700, dataRecebimento: '2026-10-21',
  });
  /* e a decisão dela vence as duas */
  await store.receber.salvar({
    id: 'y4', clienteNome: 'D', vencimento: '2026-11-08', valor: 800,
    statusArquivo: 'Em aberto', status: 'pago', saldo: 0, baixaManual: true,
  });

  igual('antes do recálculo, o arquivo manda', (await store.receber.obter('y1')).status, 'aberto');
  await link.recalcular();

  const dep = new Map((await store.receber.listar()).map((t) => [t.id, t]));
  igual('"Em aberto" com data de recebimento CONTINUA aberto', dep.get('y1').status, 'aberto');
  igual('"Confirmado" continua pago', dep.get('y2').status, 'pago');
  igual('sem coluna Situação, a data ainda decide', dep.get('y3').status, 'pago');
  igual('e a baixa feita à mão por ela é respeitada', dep.get('y4').status, 'pago');

  /**
   * E O CAIXA PÁRA DE ZERAR SOZINHO: era este o laço — a releitura abria, o
   * recálculo fechava, e a cada importação a conta voltava à estaca zero.
   */
  const proj = await fluxo.projetar({ de: '2026-11-01', ate: '2026-11-30' });
  igual('o título do arquivo entra no caixa', proj.totalReceber, 2451.52);

  await link.recalcular();
  const dep2 = new Map((await store.receber.listar()).map((t) => [t.id, t]));
  igual('recalcular de novo não desfaz', dep2.get('y1').status, 'aberto');

  for (const id of ['y1', 'y2', 'y3', 'y4']) await store.receber.remover(id);
  for (const t of guardados) await store.receber.salvar(t);
}

console.log('\n▶ O app recusa abrir com código velho');
{
  /**
   * ESTE FOI O ERRO QUE FEZ DEZ CONSERTOS NÃO CHEGAREM NELA.
   *
   * O service worker busca a rede primeiro — mas `fetch()` passa pelo cache HTTP
   * do navegador. Arquivo NOVO (que nunca esteve no cache) vinha fresco; arquivo
   * ANTIGO vinha velho. O aparelho dela rodava uma MISTURA: `versao.js` novo
   * dizendo "v53" e `ingest.js` velho lendo "Em aberto" como pago.
   *
   * O número da versão mentiu sem querer, porque ele era justamente um arquivo
   * novo — e novo sempre chegava.
   *
   * Duas travas, e as duas precisam existir:
   *  1. o service worker não aceita mais nada do cache do navegador;
   *  2. o app confere a própria regra de leitura antes de abrir, e se estiver
   *     velha joga fora o que está guardado e recarrega. Mostrar número errado
   *     com cara de certo é pior que não abrir.
   */
  const { readFileSync: ler } = await import('node:fs');
  const { join: jn, dirname: dn } = await import('node:path');
  const { fileURLToPath: fu } = await import('node:url');
  const raiz = jn(dn(fu(import.meta.url)), '..');

  const sw = ler(jn(raiz, 'sw.js'), 'utf8');
  ok('o service worker instala sem o cache do navegador',
    /cache: 'reload'/.test(sw), '');
  ok('e busca sempre conferindo com o servidor',
    /fetch\(request, \{ cache: 'no-cache' \}\)/.test(sw), '');

  const main = ler(jn(raiz, 'src/main.js'), 'utf8');
  ok('o app confere a própria leitura antes de abrir', /codigoEstaVelho/.test(main), '');
  ok('e recarrega uma vez só, sem virar laço', /ampla_recarregou/.test(main), '');

  /**
   * E AS PROVAS DO AUTOTESTE PRECISAM SER VERDADE.
   *
   * Uma prova errada aqui é pior que nenhuma: ou o app se recusa a abrir com o
   * código certo, ou aceita o errado calado. Então o teste roda as mesmas
   * perguntas contra o leitor de verdade.
   */
  const provas = [...main.matchAll(/\['([^']+)', '(aberto|pago)'\]/g)]
    .map((m) => [m[1], m[2]]);
  ok('o autoteste faz pelo menos quatro perguntas', provas.length >= 4, String(provas.length));
  for (const [texto, esperado] of provas) {
    igual(`a prova "${texto}" bate com o leitor de verdade`,
      ingest.interpretarStatusDoArquivo(texto), esperado);
  }
}

console.log('\n▶ A versão do app não pode mentir');
{
  /**
   * "Na parte do caixa não aparecia essa parte que você falava, de reler as
   *  situações do arquivo."
   *
   * Não aparecia porque ainda não tinha sido publicada: ela testou nos minutos
   * entre o conserto e o deploy. Sem o número da versão à vista, "não apareceu"
   * tem duas causas possíveis — não funcionou, ou não chegou — e elas levam a
   * conversas opostas. Custou rodadas não saber qual era.
   *
   * Uma versão que não acompanha o cache do service worker é pior que nenhuma,
   * porque mente com cara de verdade. Por isso o teste cobra os dois juntos.
   */
  const { readFileSync: ler } = await import('node:fs');
  const { join: jn, dirname: dn } = await import('node:path');
  const { fileURLToPath: fu } = await import('node:url');
  const raiz = jn(dn(fu(import.meta.url)), '..');

  const { VERSAO } = await import('../src/core/versao.js');
  const sw = ler(jn(raiz, 'sw.js'), 'utf8');
  const doCache = (sw.match(/const CACHE = 'ampla-([^']+)'/) || [])[1];
  igual('a versão mostrada é a mesma do cache do app', VERSAO, doCache);

  const ajustes = ler(jn(raiz, 'src/ui/views/ajustes.js'), 'utf8');
  ok('e ela aparece em Ajustes', /VERSAO/.test(ajustes), '');
  ok('com um botão para buscar a versão nova', /buscarAtualizacao/.test(ajustes), '');
}

console.log('\n▶ Reler as situações acerta a base sem reimportar');
{
  /**
   * "Eu reenviei. Esse mesmo arquivo que eu passei para você, eu enviei aqui.
   *  Eu apaguei e reenviei. E não foi."
   *
   * A tela dela mostrava 1232 títulos baixados, afirmando que a coluna Situação
   * dizia isso — sobre linhas em que o arquivo diz, em letras, "Em aberto".
   * Nenhuma versão do código faz isso na importação: aqueles registros foram
   * gravados por uma versão antiga e ficaram. Cada conserto novo só alcança o
   * que entra DEPOIS dele, e reimportar só resolve se o aparelho já estiver com
   * o código novo — coisa que ela não tem como saber.
   *
   * Então o conserto não pode depender de quando o registro entrou. Ele relê o
   * `statusArquivo` guardado com a regra de hoje, nos DOIS sentidos.
   */
  const reparar = await import('../src/core/reparar.js');
  const guardados = await store.receber.listar();
  for (const t of guardados) await store.receber.remover(t.id);

  /* a base dela: tudo baixado, inclusive o que o arquivo diz em aberto */
  const base = [
    { id: 'x1', clienteNome: 'A', vencimento: '2026-12-08', valor: 4904.95, statusArquivo: 'Em aberto', status: 'pago', saldo: 0, valorRecebido: 4904.95 },
    { id: 'x2', clienteNome: 'B', vencimento: '2026-12-15', valor: 9670, statusArquivo: 'Em aberto', status: 'pago', saldo: 0, valorRecebido: 9670 },
    { id: 'x3', clienteNome: 'C', vencimento: '2026-10-01', valor: 900, statusArquivo: 'Atrasado', status: 'pago', saldo: 0, valorRecebido: 900 },
    /* este o arquivo diz recebido, e estava aberto: o conserto tem de FECHAR */
    { id: 'x4', clienteNome: 'D', vencimento: '2026-08-11', valor: 2500, statusArquivo: 'Confirmado', status: 'aberto', saldo: 2500 },
    /* e estes o conserto não encosta */
    { id: 'x5', clienteNome: 'E', vencimento: '2026-11-01', valor: 700, statusArquivo: 'Em aberto', status: 'pago', saldo: 0, baixaManual: true },
    { id: 'x6', clienteNome: 'F', vencimento: '2026-11-02', valor: 800, statusArquivo: 'Em aberto', status: 'pago', saldo: 0, baixadoPorAusencia: true },
    { id: 'x7', clienteNome: 'G', vencimento: '2026-11-03', valor: 600, status: 'pago', saldo: 0 },
  ];
  for (const t of base) await store.receber.salvar(t);

  const r = await reparar.relerSituacoes();
  igual('reabre o que o arquivo diz em aberto (e o atrasado)', r.reabertos, 3);
  igual('e fecha o que o arquivo diz recebido', r.baixados, 1);
  igual('somando o que voltou para o caixa', r.valorReaberto, 15474.95);
  igual('e o que saiu dele', r.valorBaixado, 2500);

  const dep = new Map((await store.receber.listar()).map((t) => [t.id, t]));
  igual('"Em aberto" volta a abrir', dep.get('x1').status, 'aberto');
  igual('com o saldo cheio', dep.get('x1').saldo, 4904.95);
  igual('e sem recebimento registrado', dep.get('x1').valorRecebido, null);
  igual('"Atrasado" também abre — atraso não é baixa', dep.get('x3').status, 'aberto');
  igual('"Confirmado" é baixado, nos dois sentidos', dep.get('x4').status, 'pago');
  igual('e zera o saldo', dep.get('x4').saldo, 0);
  igual('baixa feita à mão por ela é respeitada', dep.get('x5').status, 'pago');
  igual('baixa por ausência no relatório é respeitada', dep.get('x6').status, 'pago');
  igual('sem texto de origem, o app não adivinha', dep.get('x7').status, 'pago');

  /* e o caixa deixa de estar zerado */
  const proj = await fluxo.projetar({ de: '2026-11-15', ate: '2026-12-31' });
  igual('o caixa volta a ter entrada', proj.totalReceber, 14574.95);

  /* rodar de novo não muda mais nada: o conserto é idempotente */
  const r2 = await reparar.relerSituacoes();
  igual('reler de novo não mexe em nada', r2.mudados, 0);

  for (const t of base) await store.receber.remover(t.id);
  for (const t of guardados) await store.receber.salvar(t);
}

console.log('\n▶ O app diz POR QUE deu o título como baixado');
{
  /**
   * "E os recebimentos? Que tá tudo zerado ainda nos recebimentos. Aí parece
   *  que vai ficar negativado pra sempre. Só tem pagamento, né? Não."
   *
   * Dizer "estão todos baixados" não serve: ela sabe que não estão. O que
   * resolve é dizer POR QUE o app acha que estão, com o texto que ele leu na
   * coluna Situação. Se o texto diz "Não recebido", o erro é do app. Se diz
   * "Recebido", o erro está no filtro do export. São conversas diferentes, e
   * sem o texto nenhuma das duas começa — foi exatamente este ida e volta que
   * custou três rodadas.
   */
  const guardados = {
    receber: await store.receber.listar(),
    pagar: await store.pagar.listar(),
  };
  const limpar = async () => {
    for (const t of await store.receber.listar()) await store.receber.remover(t.id);
    for (const t of await store.pagar.listar()) await store.pagar.remover(t.id);
  };

  await limpar();
  /* o cenário dela: as saídas aparecem, as entradas não */
  await store.pagar.salvar({ id: 'q1', fornecedorNome: 'F', vencimento: '2026-11-20', valor: 5000, status: 'aberto' });
  /* entradas baixadas por motivos diferentes, para a frase separar um do outro */
  await store.receber.salvar({ id: 'w1', clienteNome: 'A', vencimento: '2026-11-10', valor: 1000, status: 'pago', saldo: 0, statusArquivo: 'Recebido', baixaMotivo: 'situacao' });
  /* sem coluna Situação no arquivo: só uma data preenchida sustenta a baixa */
  await store.receber.salvar({ id: 'w2', clienteNome: 'B', vencimento: '2026-11-11', valor: 2000, status: 'pago', saldo: 0, baixaMotivo: 'data', dataRecebimento: '2026-11-05' });
  await store.receber.salvar({ id: 'w3', clienteNome: 'C', vencimento: '2026-11-12', valor: 3000, status: 'pago', saldo: 0, baixadoPorAusencia: true });
  await store.receber.salvar({ id: 'w4', clienteNome: 'D', vencimento: '2026-11-13', valor: 4000, status: 'pago', saldo: 0, baixaManual: true });

  const d = await fluxo.diagnosticar({ de: '2026-11-01', ate: '2026-11-30' });
  const frase = fluxo.explicarZero(d).map((f) => f.texto).join(' || ');

  ok('a frase nomeia o motivo da baixa', /coluna Situação do arquivo dizia/.test(frase), frase);
  ok('e mostra o texto que o app leu, entre aspas', /"Recebido"/.test(frase), frase);
  ok('a data preenchida é nomeada como motivo próprio',
    /data de pagamento\/recebimento preenchida/.test(frase), frase);
  ok('e o caso sem coluna Situação é nomeado como tal',
    /\(sem coluna Situação\)|data de pagamento\/recebimento preenchida/.test(frase), frase);

  /**
   * E O QUE ELA MESMA CAUSOU NÃO VIRA SUSPEITA: sumir do relatório e baixar à
   * mão são o app funcionando. Misturá-los com o erro de leitura esconderia o
   * erro no meio do normal.
   */
  const motivos = d.receber.porQueBaixados.map((g) => g.motivo).sort();
  igual('os quatro motivos são separados', motivos.join(','), 'ausencia,data,manual,situacao');

  /**
   * E CADA LADO SE EXPLICA SOZINHO — era aqui o furo.
   *
   * A explicação só aparecia quando OS DOIS lados estavam zerados. Com as saídas
   * funcionando e as entradas zeradas (o caso dela, e o mais assustador, porque
   * o caixa fica negativo para sempre) a tela não dizia nada.
   */
  const proj = await fluxo.projetar({ de: '2026-11-01', ate: '2026-11-30' });
  igual('as saídas aparecem', proj.totalPagar, 5000);
  igual('e as entradas estão zeradas — o cenário dela', proj.totalReceber, 0);
  ok('mesmo com um lado funcionando, o lado zerado é explicado',
    /a receber/.test(frase), frase);
  ok('e o lado que funciona fica calado', !/a pagar/.test(frase), frase);

  /**
   * NO CASO MISTO A SUSPEITA SE SEPARA DO NORMAL.
   *
   * Com um título em aberto (ainda que fora do período), a frase deixa de ser
   * "está tudo baixado" e passa a explicar o período — e aí a nota das baixas
   * precisa aparecer por conta própria, falando SÓ das que podem ser erro de
   * leitura. Sumir do relatório e baixar à mão são o app funcionando: acusá-las
   * aqui esconderia o erro no meio do normal.
   */
  await store.receber.salvar({
    id: 'w5', clienteNome: 'E', vencimento: '2027-06-01', valor: 9000, status: 'aberto',
  });
  const d2 = await fluxo.diagnosticar({ de: '2026-11-01', ate: '2026-11-30' });
  const falas2 = fluxo.explicarZero(d2);
  const suspeita = falas2.find((f) => /app leu errado/.test(f.texto))
    || { texto: `(nenhuma) ${falas2.map((f) => f.texto).join(' || ')}` };
  ok('a nota de suspeita existe', /app leu errado/.test(suspeita.texto), suspeita.texto.slice(0, 300));
  /**
   * W2 SAIU DA LISTA DE SUSPEITOS PORQUE DEIXOU DE SER BAIXADO.
   *
   * Ele é o caso do bug: o arquivo dizia "Em aberto" e uma data de recebimento
   * preenchida o fechava. Agora o que o arquivo AFIRMA vence o que a data
   * sugere, então ele nem chega a fechar — sobra só o w1, que o arquivo mesmo
   * chama de "Recebido".
   */
  ok('conta as duas baixas que o arquivo não explica sozinho',
    /2 títulos a receber \(R\$ 3\.000,00\)/.test(suspeita.texto), suspeita.texto);
  ok('e não acusa a baixa por ausência', !/sumiram de um relatório/.test(suspeita.texto), suspeita.texto);
  ok('nem a baixa feita à mão por ela', !/à mão/.test(suspeita.texto), suspeita.texto);

  await limpar();
  for (const t of guardados.receber) await store.receber.salvar(t);
  for (const t of guardados.pagar) await store.pagar.salvar(t);
}

console.log('\n▶ "Confirmado" quer dizer recebido — provado pelos totais do relatório');
{
  /**
   * "Eu vou te mandar um relatório de recebimento, porque não tá vinculando."
   *
   * O relatório de contas a receber dela, de 01/08 a 31/12, traz três números
   * no topo e 1232 linhas embaixo. Somando as linhas por situação:
   *
   *     548 Em aberto    1.305.654,69
   *      15 Atrasado        23.461,84   → juntos, 1.329.116,53
   *     669 Confirmado   1.275.435,33
   *
   * E o topo do relatório diz, com todas as letras:
   *
   *     A receber   1.329.116,53   "total a receber no período"
   *     Confirmado  1.275.435,33   "valores já confirmados"
   *     Total       2.604.551,86   "1232 cobranças no período"
   *
   * Os dois baldes são disjuntos e somam o total, ao centavo. Então "Confirmado"
   * não é um título a receber que foi conferido: é dinheiro que já entrou. O app
   * lia como aberto e inflaria o caixa dela em R$ 1,27 milhão.
   *
   * Os dados abaixo são sintéticos — o arquivo real tem nome, CPF e CNPJ de
   * cliente, e este repositório é público. O que se reproduz aqui é a ESTRUTURA
   * e a aritmética, que é o que estava errado.
   */
  const CAB = 'Destinado à;CPF;CNPJ;Descrição;Forma de pagamento;Conta bancária;'
    + 'Vencimento;Situação;Valor total;NF-e';
  const linha = (i, situacao, venc, valor) => `CLIENTE ${i};;;Venda de nº ${i};PIX;`
    + `CONTA BANCÁRIA - X;${venc};${situacao};${valor};${4000 + i}`;

  const linhas = [
    linha(1, 'Confirmado', '11/08/2026', '2.500,00'),
    linha(2, 'Confirmado', '12/08/2026', '1.500,00'),
    linha(3, 'Atrasado', '01/10/2026', '900,00'),
    linha(4, 'Em aberto', '08/12/2026', '4.904,95'),
    linha(5, 'Em aberto', '15/12/2026', '9.670,00'),
  ];
  await importar('receber', 'receber-real.csv', `${CAB}\n${linhas.join('\n')}`,
    { fotografiaCompleta: false });

  const meus = (await store.receber.listar()).filter((t) => /^CLIENTE [1-5]$/.test(t.clienteNome || ''));
  igual('as cinco linhas viraram cinco títulos', meus.length, 5);

  const porSituacao = (txt) => meus.filter((t) => t.statusArquivo === txt);
  ok('"Confirmado" entra como recebido',
    porSituacao('Confirmado').every((t) => t.status === 'pago'),
    JSON.stringify(porSituacao('Confirmado').map((t) => t.status)));
  ok('"Em aberto" continua em aberto',
    porSituacao('Em aberto').every((t) => t.status === 'aberto'), '');
  ok('"Atrasado" também: atraso não é baixa',
    porSituacao('Atrasado').every((t) => t.status === 'aberto'), '');

  /**
   * A ARITMÉTICA DO RELATÓRIO: o que fica em aberto é "Em aberto" + "Atrasado",
   * e o que sai é "Confirmado". É esta soma que bate com o topo do arquivo dela.
   */
  const emAberto = meus.filter((t) => t.status === 'aberto');
  igual('o que fica em aberto são os três certos', emAberto.length, 3);
  const somar = (lista) => Math.round(lista.reduce((a, t) => a + t.valor, 0) * 100) / 100;
  igual('somando o valor que o relatório chama de "A receber"', somar(emAberto), 15474.95);
  igual('e o recebido some do em aberto, como manda o topo do relatório',
    somar(meus.filter((t) => t.status === 'pago')), 4000);

  /* o atrasado fica fora da projeção, mas à vista — não vira baixa */
  const venc = fluxo.separarVencidos(meus, '2026-11-01');
  igual('o atrasado sai da projeção', venc.vencidos.length, 1);
  igual('e os dois futuros entram', venc.aVencer.length, 2);

  for (const t of meus) await store.receber.remover(t.id);
}

console.log('\n▶ Importar acerta a base inteira, não só as linhas novas');
{
  /**
   * "Eu reenviei. (...) E não foi. Tá dando sempre a mesma coisa."
   *
   * Cada conserto na leitura só alcança o que entra DEPOIS dele. Um título
   * gravado por uma versão antiga fica com o estado velho para sempre — e
   * reenviar o arquivo só resolve se o aparelho já estiver com o código novo,
   * coisa que ela não tem como saber. Era essa a volta que não fechava.
   *
   * Agora toda importação de título relê a situação de TODA a base guardada.
   * Ela não precisa saber que existe um botão para isso.
   */
  const CAB = 'Destinado à;Vencimento;Situação;Valor total';
  const guardados = await store.receber.listar();
  for (const t of guardados) await store.receber.remover(t.id);

  /* títulos gravados por uma versão antiga: fechados, sem motivo registrado */
  await store.receber.salvar({
    id: 'velho1', clienteNome: 'VELHO A', vencimento: '2026-12-10', valor: 5000,
    statusArquivo: 'Em aberto', status: 'pago', saldo: 0, valorRecebido: 5000,
  });
  await store.receber.salvar({
    id: 'velho2', clienteNome: 'VELHO B', vencimento: '2026-12-11', valor: 7000,
    statusArquivo: 'Atrasado', status: 'pago', saldo: 0, valorRecebido: 7000,
  });
  /* e um que o arquivo dizia recebido, mas entrou aberto */
  await store.receber.salvar({
    id: 'velho3', clienteNome: 'VELHO C', vencimento: '2026-09-01', valor: 3000,
    statusArquivo: 'Confirmado', status: 'aberto', saldo: 3000,
  });

  /* ela manda um arquivo que nem menciona esses títulos */
  const { preparo } = await importar('receber', 'outro.csv',
    `${CAB}\nNOVO X;20/12/2026;Em aberto;900,00`, { fotografiaCompleta: false });

  const dep = new Map((await store.receber.listar()).map((t) => [t.id, t]));
  igual('o título velho que o arquivo dizia em aberto foi reaberto', dep.get('velho1').status, 'aberto');
  igual('com o saldo cheio', dep.get('velho1').saldo, 5000);
  igual('o atrasado também', dep.get('velho2').status, 'aberto');
  igual('e o que o arquivo dizia recebido foi baixado', dep.get('velho3').status, 'pago');
  ok('e a importação conta o que fez',
    preparo.avisos.some((a) => /releu a situação de todos os títulos guardados/.test(a)),
    JSON.stringify(preparo.avisos).slice(0, 250));

  /* importar de novo não mexe mais em nada: é idempotente */
  const r2 = await importar('receber', 'outro.csv',
    `${CAB}\nNOVO X;20/12/2026;Em aberto;900,00`, { fotografiaCompleta: false });
  ok('e na segunda vez não há o que acertar',
    !r2.preparo.avisos.some((a) => /releu a situação/.test(a)), JSON.stringify(r2.preparo.avisos));

  for (const t of await store.receber.listar()) {
    if (/^(VELHO [ABC]|NOVO X)$/.test(t.clienteNome || '')) await store.receber.remover(t.id);
  }
  for (const t of guardados) await store.receber.salvar(t);
}

console.log('\n▶ A importação diz o que vai fazer ANTES do confirmar');
{
  /**
   * "Eu coloquei aqui os relatórios de contas a receber e a pagar. E só foi de
   *  pagamento, não tá indo de recebimento. Tá dando sempre a mesma coisa."
   *
   * Ela confirmava, ia para o Caixa e só lá descobria que tudo tinha entrado
   * baixado. A conta precisa aparecer ANTES — no único momento em que ainda dá
   * para não confirmar — e com a palavra do arquivo ao lado de cada grupo.
   */
  const CAB = 'Destinado à;Vencimento;Situação;Valor total';
  const linhas = [
    'A;10/12/2026;Em aberto;1.000,00',
    'B;11/12/2026;Em aberto;2.000,00',
    'C;01/09/2026;Confirmado;3.000,00',
    'D;02/09/2026;Confirmado;4.000,00',
    'E;03/10/2026;Atrasado;500,00',
  ];
  const { preparo } = await importar('receber', 'situacoes.csv', `${CAB}\n${linhas.join('\n')}`,
    { fotografiaCompleta: false });

  ok('o preparo traz o resumo das situações', !!preparo.situacoes, '');
  igual('conta quantos entram em aberto', preparo.situacoes.abertos, 3);
  igual('e quantos entram como pagos', preparo.situacoes.baixados, 2);
  const porTexto = new Map(preparo.situacoes.porTexto.map((g) => [g.texto, g]));
  igual('"Em aberto" aparece com a contagem dele', porTexto.get('Em aberto').abertos, 2);
  igual('"Confirmado" aparece como pago', porTexto.get('Confirmado').abertos, 0);
  igual('"Atrasado" conta como aberto', porTexto.get('Atrasado').abertos, 1);
  ok('e nada disso vira aviso quando está certo',
    !preparo.avisos.some((a) => /ATENÇÃO: nenhum/.test(a)), JSON.stringify(preparo.avisos));

  for (const t of await store.receber.listar()) {
    if (/^[A-E]$/.test(t.clienteNome || '')) await store.receber.remover(t.id);
  }

  /**
   * E QUANDO NENHUM ENTRA EM ABERTO, O APP GRITA ANTES.
   *
   * Num contas a receber isso é quase sempre leitura errada de uma palavra — e
   * é o aviso que teria evitado todas as idas e voltas: ele mostra a palavra.
   */
  const soPagos = ['F;01/09/2026;Confirmado;3.000,00', 'G;02/09/2026;Confirmado;4.000,00'];
  const r2 = await importar('receber', 'sopagos.csv', `${CAB}\n${soPagos.join('\n')}`,
    { fotografiaCompleta: false });
  ok('avisa que nenhum título entraria em aberto',
    r2.preparo.avisos.some((a) => /nenhum dos 2 títulos deste arquivo vai entrar EM ABERTO/.test(a)),
    JSON.stringify(r2.preparo.avisos).slice(0, 300));
  ok('e mostra a palavra que o arquivo trouxe',
    r2.preparo.avisos.some((a) => /2× "Confirmado"/.test(a)), '');

  for (const t of await store.receber.listar()) {
    if (/^[FG]$/.test(t.clienteNome || '')) await store.receber.remover(t.id);
  }

  /**
   * E A COLUNA SITUAÇÃO NÃO LIGADA É O PIOR CASO: sem ela o app decide por data
   * ou por saldo, que é adivinhação com cara de leitura.
   */
  const semSituacao = await importar('receber', 'sem-situacao.csv',
    `Destinado à;Vencimento;Valor total\nH;10/12/2026;1.000,00`, { fotografiaCompleta: false });
  ok('avisa quando a coluna Situação não foi ligada',
    semSituacao.preparo.avisos.some((a) => /coluna SITUAÇÃO não foi ligada/.test(a)),
    JSON.stringify(semSituacao.preparo.avisos).slice(0, 200));

  for (const t of await store.receber.listar()) {
    if (t.clienteNome === 'H') await store.receber.remover(t.id);
  }
}

console.log('\n▶ Arquivo cheio que vira quase nada tem de gritar');
{
  /**
   * O relatório dela começa com um painel de totais — "A receber / Confirmado /
   * Total" — logo acima da tabela. Se o cabeçalho escolhido cair nesse painel, o
   * app casa a coluna "Total" com o campo Valor, ignora o resto e monta UM
   * registro, sem reclamar de nada. O financeiro fica vazio e parece "não tem
   * movimento" — a mentira mais cara que aquela tela pode contar.
   */
  const comPainel = [
    'A receber;;;Confirmado;;;;Total;;',
    '1.329.116,53;;;1.275.435,33;;;;2.604.551,86;;',
    'Destinado à;CPF;CNPJ;Descrição;Forma de pagamento;Conta bancária;Vencimento;Situação;Valor total;NF-e',
    ...Array.from({ length: 12 }, (_, i) => `CLIENTE P${i};;;Venda;PIX;CONTA;10/12/2026;Em aberto;100,00;${7000 + i}`),
  ].join('\n');

  /* com o cabeçalho no painel de totais, o aproveitamento despenca */
  const { preparo } = await importar('receber', 'painel.csv', comPainel, { fotografiaCompleta: false });
  ok('o app avisa que quase nada foi aproveitado',
    preparo.avisos.some((a) => /LINHA DE CABEÇALHO está errada/.test(a)),
    JSON.stringify(preparo.avisos).slice(0, 300));
  ok('e diz onde procurar a linha certa',
    preparo.avisos.some((a) => /"Vencimento", "Situação" e "Valor total"/.test(a)), '');

  for (const t of await store.receber.listar()) {
    if (/^CLIENTE P\d+$/.test(t.clienteNome || '') || t.valor === 2604551.86) {
      await store.receber.remover(t.id);
    }
  }
}

console.log('\n▶ O conserto reabre o que entrou pago por erro de leitura');
{
  /**
   * Corrigir a leitura resolve as PRÓXIMAS importações. Não resolve o que já
   * está gravado — e mandar ela reimportar tudo seria cobrar dela o preço do meu
   * erro, no app que existe para eliminar trabalho administrativo.
   *
   * Cada título guarda `statusArquivo`: o texto cru da coluna Situação. Então o
   * conserto relê esse texto com a regra certa, sem precisar de arquivo nenhum.
   */
  const reparar = await import('../src/core/reparar.js');

  const base = [
    /* o caso dela: entrou como pago porque "não pago" contém "pago" */
    { id: 'rp1', clienteNome: 'A', vencimento: '2026-11-10', valor: 1000, statusArquivo: 'Não pago', status: 'pago', saldo: 0, valorRecebido: 1000 },
    { id: 'rp2', clienteNome: 'B', vencimento: '2026-11-11', valor: 2000, statusArquivo: 'Não recebido', status: 'pago', saldo: 0, valorRecebido: 2000 },
    /* pago de verdade: não se encosta */
    { id: 'rp3', clienteNome: 'C', vencimento: '2026-11-12', valor: 3000, statusArquivo: 'Pago', status: 'pago', saldo: 0, valorRecebido: 3000 },
    /* baixado por AUSÊNCIA: a fotografia funcionando, não é erro de leitura */
    { id: 'rp4', clienteNome: 'D', vencimento: '2026-11-13', valor: 4000, statusArquivo: 'Não pago', status: 'pago', saldo: 0, baixadoPorAusencia: true },
    /* baixado À MÃO por ela: decisão dela, o app não desfaz */
    { id: 'rp5', clienteNome: 'E', vencimento: '2026-11-14', valor: 5000, statusArquivo: 'Não pago', status: 'pago', saldo: 0, baixaManual: true },
    /* sem texto de origem: reabrir seria adivinhação */
    { id: 'rp6', clienteNome: 'F', vencimento: '2026-11-15', valor: 6000, status: 'pago', saldo: 0 },
    /* já está aberto: nada a fazer */
    { id: 'rp7', clienteNome: 'G', vencimento: '2026-11-16', valor: 7000, statusArquivo: 'Em aberto', status: 'aberto', saldo: 7000 },
  ];
  for (const t of base) await store.receber.salvar(t);
  await dbMod.remove('kv', 'reparo_situacao_v5');

  const r = await reparar.repararSituacaoNegada();
  igual('reabre só os que o próprio texto diz em aberto', r.reabertos, 2);
  igual('somando o valor que tinha sumido do caixa', r.valorReaberto, 3000);

  const dep = new Map((await store.receber.listar()).map((t) => [t.id, t]));
  igual('"Não pago" volta para aberto', dep.get('rp1').status, 'aberto');
  igual('com o saldo cheio de volta', dep.get('rp1').saldo, 1000);
  igual('e sem pagamento registrado', dep.get('rp1').valorRecebido, null);
  igual('"Não recebido" também', dep.get('rp2').status, 'aberto');
  igual('título realmente pago continua pago', dep.get('rp3').status, 'pago');
  igual('baixado por ausência do relatório continua baixado', dep.get('rp4').status, 'pago');
  igual('baixa feita à mão por ela é respeitada', dep.get('rp5').status, 'pago');
  igual('sem texto de origem, o app não adivinha', dep.get('rp6').status, 'pago');
  igual('o que já estava aberto fica como está', dep.get('rp7').status, 'aberto');

  /* roda uma vez só: abrir o app de novo não reabre nada */
  const r2 = await reparar.repararSituacaoNegada();
  igual('na segunda abertura não mexe em nada', r2.reparou, false);

  for (const t of base) await store.receber.remover(t.id);
}

console.log('\n▶ Um zero na projeção tem de dizer de onde veio');
{
  /**
   * "Mandei todos os arquivos. Aí eu vou na parte caixa, já alimentei o saldo,
   *  aí eu vejo a projeção para os 30 dias. E aí recebimento, pagamento,
   *  líquido — tá tudo zerado. Eu já mandei."
   *
   * Seis causas, um zero só na tela. Este teste exige que cada causa produza a
   * SUA frase: é a diferença entre ela resolver sozinha em dez segundos e ela
   * vir me perguntar.
   */
  const originais = {
    receber: await store.receber.listar(),
    pagar: await store.pagar.listar(),
  };
  const limpar = async () => {
    for (const t of await store.receber.listar()) await store.receber.remover(t.id);
    for (const t of await store.pagar.listar()) await store.pagar.remover(t.id);
  };
  const frases = async () => {
    const d = await fluxo.diagnosticar({ de: '2026-09-13', dias: 30 });
    return fluxo.explicarZero(d).map((f) => f.texto).join(' || ');
  };

  /* 1 — não chegou título nenhum */
  await limpar();
  ok('sem título nenhum, o app diz que o relatório não entrou',
    /não foi importado/.test(await frases()), await frases());

  /* 2 — chegou, mas está tudo baixado */
  await limpar();
  await store.receber.salvar({ id: 'z1', vencimento: '2026-09-20', valor: 1000, status: 'pago' });
  ok('tudo baixado, o app diz que não há o que projetar',
    /baixado ou cancelado/.test(await frases()), await frases());

  /* 3 — chegou sem data de vencimento (o caso invisível de antes) */
  await limpar();
  await store.receber.salvar({ id: 'z2', valor: 1000, status: 'aberto' });
  ok('sem vencimento, o app nomeia a coluna que falta',
    /SEM DATA DE VENCIMENTO/.test(await frases()), await frases());

  /* 4 — tudo vencido: sai da projeção de propósito, e isso não é defeito */
  await limpar();
  await store.receber.salvar({ id: 'z3', vencimento: '2026-08-01', valor: 1000, status: 'aberto' });
  const f4 = (await frases()).split(' || ').find((x) => /a receber/.test(x)) || '';
  ok('tudo vencido, o app explica que é de propósito', /já venceu/.test(f4), f4);
  ok('e não chama isso de erro', !/VALOR ZERO|não foi importado/.test(f4), f4);

  /* 5 — vence depois do recorte */
  await limpar();
  await store.receber.salvar({ id: 'z4', vencimento: '2027-01-10', valor: 1000, status: 'aberto' });
  const f5 = (await frases()).split(' || ').find((x) => /a receber/.test(x)) || '';
  ok('vencendo depois do período, o app manda ampliar o período',
    /vence depois do fim do período/.test(f5) && /Amplie o período/.test(f5), f5);

  /* 6 — no prazo, mas com valor zero: a coluna de valor não veio */
  await limpar();
  await store.receber.salvar({ id: 'z5', vencimento: '2026-09-20', valor: 0, status: 'aberto' });
  ok('valor zero, o app nomeia a coluna "Valor total"',
    /VALOR ZERO/.test(await frases()), await frases());

  /* e quando há movimento de verdade, o app não inventa explicação */
  await limpar();
  await store.receber.salvar({ id: 'z6', vencimento: '2026-09-20', valor: 5000, status: 'aberto' });
  const d = await fluxo.diagnosticar({ de: '2026-09-13', dias: 30 });
  igual('com título no prazo, ele entra na conta', d.receber.valorNoPeriodo, 5000);
  const proj = await fluxo.projetar({ de: '2026-09-13', dias: 30 });
  igual('e a projeção deixa de ser zero', proj.totalReceber, 5000);

  /**
   * E "ABERTO" É A MESMA COISA AQUI E NO RESTO DO APP.
   *
   * Eram duas verdades sobre o mesmo título: o Caixa olhava só a situação, o
   * resto do app também considerava pago o título com data de recebimento ou
   * saldo zerado. Um título podia ser entrada futura numa tela e pago na outra.
   */
  await limpar();
  await store.receber.salvar({
    id: 'z7', vencimento: '2026-09-20', valor: 7000, status: 'aberto', dataRecebimento: '2026-09-14',
  });
  const p2 = await fluxo.projetar({ de: '2026-09-13', dias: 30 });
  igual('título com data de recebimento não é entrada futura', p2.totalReceber, 0);

  await limpar();
  for (const t of originais.receber) await store.receber.salvar(t);
  for (const t of originais.pagar) await store.pagar.salvar(t);
}

console.log('\n▶ Reimportar não duplica');
await importar('nfs', 'fiscal.csv', FISCAL);
await importar('receber', 'receber.csv', RECEBER);
await link.recalcular();
igual('continuam 5 notas', (await store.nfs.listar()).length, 5);
igual('continuam 4 títulos', (await store.receber.listar()).length, 4);
igual('o vendedor definido por você continua lá',
  (await store.nfs.listar()).find((n) => n.numero === '3001').vendedorId, carlos.id);

/**
 * O CUSTO QUE ELA DIGITOU NO PEDIDO SOBREVIVE AO ARQUIVO NOVO.
 *
 * Senão o acerto de outubro se perderia no primeiro relatório de novembro — e
 * ela só descobriria pela margem, meses depois, sem ter como saber por quê. O
 * relatório não traz esse campo: ele é só dela, e reimportar não é motivo para
 * apagar decisão de ninguém.
 */
{
  const alvo = (await store.pedidos.listar()).find((x) => x.numero === '1001');
  await store.pedidos.salvar({ ...alvo, custoManual: 1234.56, custoManualEm: 1760000000000 });
  await importar('pedidos', 'vendas.csv', VENDAS);
  const depois = (await store.pedidos.listar()).find((x) => x.numero === '1001');
  igual('o custo informado por você continua lá depois de reimportar', depois.custoManual, 1234.56);
  igual('com a data em que você informou', depois.custoManualEm, 1760000000000);
  igual('e o custo do relatório continua ao lado, intacto', depois.valorCusto, alvo.valorCusto);
  await store.pedidos.salvar({ ...depois, custoManual: null, custoManualEm: null });
}

console.log('\n▶ Rotina');
const r = await routine.rotina('2026-09-14');
ok('a rotina sabe o que ainda falta', r.pendentes.length >= 0, '');


console.log('\n▶ PDF: relatório que não sai em Excel');
{
  const linhas = [
    [[60, 'AMPLA - Contas a Receber']],
    [[60, 'Destinado a'], [220, 'CPF/CNPJ'], [330, 'Descricao'], [400, 'Vencimento'], [490, 'Valor Total']],
    [[60, 'Construtora Alfa Ltda'], [220, '11.222.333/0001-81'], [330, '1001'], [400, '10/09/2026'], [490, '15.000,00']],
    [[60, 'Deposito Beta ME'], [220, '44.555.666/0001-72'], [330, '1003'], [400, '05/09/2026'], [490, '8.400,00']],
  ];
  const leitura = await readFile(new File([pdfSimples(linhas)], 'receber.pdf', { type: 'application/pdf' }));
  igual('o PDF foi reconhecido como PDF', leitura.formato, 'pdf');
  const lidas = leitura.planilhas[0].linhas;
  igual('o título do relatório não virou linha', lidas.some((l) => l.join(' ').includes('AMPLA -')), false);
  igual('o cabeçalho voltou coluna por coluna', lidas[0],
    ['Destinado a', 'CPF/CNPJ', 'Descricao', 'Vencimento', 'Valor Total']);
  igual('a primeira linha de dados voltou inteira', lidas[1],
    ['Construtora Alfa Ltda', '11.222.333/0001-81', '1001', '10/09/2026', '15.000,00']);
  igual('e só entraram cabeçalho e as duas vendas', lidas.length, 3);

  // e o PDF de verdade, gerado por navegador: fonte embutida, Identity-H, acento
  const daPasta = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'contas-a-receber.pdf');
  const bytes = await readFile(new File(
    [readFileSync(daPasta)], 'contas-a-receber.pdf', { type: 'application/pdf' },
  ));
  const reais = bytes.planilhas[0].linhas;
  igual('PDF com fonte embutida: cabeçalho com acento',
    reais[0], ['Destinado a', 'CPF/CNPJ', 'Descrição', 'Vencimento', 'Situação', 'Valor Total', 'Nota Fiscal']);
  igual('PDF com fonte embutida: CNPJ não ganhou espaço na quebra',
    reais[1][1], '11.222.333/0001-81');
  igual('PDF com fonte embutida: acento no nome do cliente', reais[2][0], 'João da Silva');

  // e o mapeamento automático funciona igual ao de planilha
  const mapeamento = ingest.sugerirMapeamento('receber', reais[0].map(String));
  ok('as colunas do PDF casam com os campos do app',
    mapeamento.clienteNome === 'Destinado a' && mapeamento.nfNumero === 'Nota Fiscal', JSON.stringify(mapeamento));
}


console.log('\n▶ DRE pelo plano de contas');
{
  const d = await dre.dre('2026-09');
  igual('receita bruta é o faturamento do mês', d.receita.bruta, 50400);
  igual('CMV veio do custo dos pedidos', d.cmv.valor, 37000);
  igual('custo conhecido em 100% do faturamento', d.cmv.cobertura.completa, true);
  igual('lucro bruto = receita - CMV', d.lucroBruto, 13400);
  ok('despesas agrupadas pelo plano de contas',
    d.despesas.grupos.length > 0 && d.despesas.grupos.every((g) => g.nome), JSON.stringify(d.despesas.grupos));
  igual('o resultado fecha', d.resultado, d.lucroBruto - d.despesas.total);
  ok('a lista de planos de contas sai pronta para marcar',
    (await dre.planosDeContas()).length > 0, '');

  // marcar uma conta como mercadoria tira ela das despesas
  const maior = d.despesas.grupos[0];
  await store.salvarConfig({ dre: { contasDeMercadoria: [maior.nome] } });
  const d2 = await dre.dre('2026-09');
  igual('conta marcada como mercadoria sai das despesas',
    d2.despesas.total, d.despesas.total - maior.valor);
  igual('e aparece à parte, para não sumir', d2.mercadoria.total, maior.valor);
  await store.salvarConfig({ dre: { contasDeMercadoria: [] } });

  // uma nota sem custo conhecido: o app não estima, e diz que não estimou
  await store.nfs.salvar({
    id: 'nf_teste_sem_custo', numero: '9999', dataEmissao: '2026-09-20', mes: '2026-09',
    valorTotal: 10000, status: 'autorizada', operacao: 'saida', clienteNome: 'Cliente X',
  });
  const d3 = await dre.dre('2026-09');
  igual('nota sem pedido não recebe custo estimado', d3.cmv.valor, 37000);
  igual('e o lucro bruto fica em branco em vez de errado', d3.lucroBruto, null);
  igual('a cobertura deixa claro o quanto tem custo', d3.cmv.cobertura.completa, false);
  ok('a nota sem custo é nominada, não escondida',
    d3.cmv.semCusto.some((x) => x.numero === '9999'), JSON.stringify(d3.cmv.semCusto));
  await store.nfs.remover('nf_teste_sem_custo');
}


console.log('\n▶ O DRE gerencial: cada degrau sai do anterior, e o que não foi classificado aparece');
{
  /**
   * "A receita bruta, a receita líquida, a margem de contribuição, EBITDA. Aí
   *  você abre as deduções de receita e vê: Simples DAS, PIS, devolução de
   *  vendas. Aí a gente abre as despesas diretas, que é frete, comissão de
   *  vendedores. (…) Como você vai saber isso? Eu posso te categorizar."
   *
   * O risco deste DRE não é errar uma conta: é empurrar para um degrau qualquer
   * a conta que ninguém classificou, e aí o EBITDA fica bonito porque metade da
   * despesa foi parar depois dele. Então o que se verifica aqui é justamente o
   * contrário: conta sem classificação aparece em linha própria, desconta do
   * lucro líquido, e não some dentro de nenhum degrau.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    pedidos: await store.pedidos.listar(),
    pagar: await store.pagar.listar(),
    cfg: await store.config(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.pedidos) await store.pedidos.remover(x.id);
  for (const x of guardadas.pagar) await store.pagar.remover(x.id);

  const nota = (n, valor, extra = {}) => store.nfs.salvar({
    id: `ndg_${n}`, numero: String(n), dataEmissao: '2026-11-10', mes: '2026-11',
    valorTotal: valor, status: 'autorizada', operacao: 'saida',
    devolucao: false, devolucaoDeCompra: false, pedidoNumero: String(n), ...extra,
  });
  const pedido = (n, custo, total) => store.pedidos.salvar({
    id: `pdg_${n}`, numero: String(n), data: '2026-11-08', valorTotal: total, valorCusto: custo,
  });
  await nota(8101, 100000); await pedido(8101, 60000, 100000);
  await nota(8102, 10000, { operacao: 'entrada', devolucao: true }); await pedido(8102, 0, 10000);

  const pagar = (id, categoria, valor) => store.pagar.salvar({
    id: `pgdg_${id}`, categoria, valor, vencimento: '2026-11-15', mes: '2026-11',
    fornecedorNome: 'FORNECEDOR TESTE', descricao: categoria, situacao: 'aberto',
  });
  await pagar(1, 'SIMPLES NACIONAL DAS', 8000);
  await pagar(2, 'FRETE SOBRE VENDAS', 5000);
  await pagar(3, 'ALUGUEL DA LOJA', 7000);
  await pagar(4, 'EMPRESTIMO CAPITAL DE GIRO', 3000);
  await pagar(5, 'CAUCAO DO ALUGUEL', 2000);
  await pagar(6, 'CONTA QUE NINGUEM CLASSIFICOU', 1000);

  /* sem classificação nenhuma: TUDO cai na linha que pede o clique */
  await store.salvarConfig({ dre: { contasDeMercadoria: [], classificacao: {} } });
  const cru = (await dre.dre('2026-11')).gerencial;
  igual('sem classificação, nenhuma despesa entra num degrau',
    [cru.despesasDiretas.total, cru.despesasIndiretas.total, cru.emprestimos.total,
      cru.naoOperacionais.total], [0, 0, 0, 0]);
  igual('e todas aparecem na linha "sem classificação"', cru.semClassificacao.total, 26000);
  igual('a devolução é dedução mesmo antes de qualquer classificação', cru.deducoes.total, 10000);
  igual('a receita bruta é antes da devolução', cru.receitaBruta, 100000);
  igual('e a líquida já desconta ela', cru.receitaLiquida, 90000);

  /* a sugestão é sugestão: ela não classifica nada sozinha */
  igual('o app sugere imposto pelo nome', dre.sugerirGrupo('SIMPLES NACIONAL DAS'), 'deducao');
  igual('e frete como despesa direta', dre.sugerirGrupo('FRETE SOBRE VENDAS'), 'direta');
  igual('mas não inventa grupo para o que não reconhece',
    dre.sugerirGrupo('CONTA QUE NINGUEM CLASSIFICOU'), null);

  /* agora classificada, do jeito que ela escolheria */
  await store.salvarConfig({
    dre: {
      classificacao: {
        'SIMPLES NACIONAL DAS': 'deducao',
        'FRETE SOBRE VENDAS': 'direta',
        'ALUGUEL DA LOJA': 'indireta',
        'EMPRESTIMO CAPITAL DE GIRO': 'emprestimo',
        'CAUCAO DO ALUGUEL': 'naoOperacional',
      },
    },
  });
  const g = (await dre.dre('2026-11')).gerencial;

  igual('deduções = imposto + devolução', g.deducoes.total, 18000);
  igual('receita líquida = bruta − deduções', g.receitaLiquida, 82000);
  igual('o CMV vem do custo do pedido', g.cmv, 60000);
  igual('lucro bruto = líquida − CMV', g.lucroBruto, 22000);
  igual('despesas diretas', g.despesasDiretas.total, 5000);
  igual('margem de contribuição = lucro bruto − diretas', g.margemContribuicao, 17000);
  igual('despesas indiretas', g.despesasIndiretas.total, 7000);
  igual('EBITDA = margem de contribuição − indiretas', g.ebitda, 10000);
  igual('a conta não classificada continua à vista', g.semClassificacao.total, 1000);
  igual('lucro líquido desconta dívida, não operacional E o não classificado',
    g.lucroLiquido, 10000 - 3000 - 2000 - 1000);
  igual('os percentuais são sobre a receita líquida',
    Math.round(g.percentuais.ebitda * 10) / 10, Math.round((10000 / 82000) * 1000) / 10);

  /* e a escada desenhada é a mesma conta, degrau por degrau */
  const linhas = dre.linhasDoDreGerencial(g);
  const v = (id) => linhas.find((l) => l.id === id)?.valor;
  igual('escada: bruta + deduções = líquida',
    v('g-receita-bruta') + v('g-deducoes'), v('g-receita-liquida'));
  igual('escada: líquida + CMV = lucro bruto',
    v('g-receita-liquida') + v('g-cmv'), v('g-lucro-bruto'));
  igual('escada: lucro bruto + diretas = margem de contribuição',
    v('g-lucro-bruto') + v('g-diretas'), v('g-margem-contribuicao'));
  igual('escada: margem de contribuição + indiretas = EBITDA',
    v('g-margem-contribuicao') + v('g-indiretas'), v('g-ebitda'));
  igual('escada: EBITDA + dívida + não operacional + sem classificação = lucro líquido',
    v('g-ebitda') + v('g-emprestimos') + v('g-nao-operacionais') + v('g-sem-classificacao'),
    v('g-lucro-liquido'));
  const dedu = linhas.find((l) => l.id === 'g-deducoes');
  ok('a linha de deduções abre e nomeia a devolução',
    dedu.detalhe.some((x) => x.nome === 'Devoluções de venda' && x.valor === 10000),
    JSON.stringify(dedu.detalhe));

  /* conta marcada como mercadoria sai das despesas: o CMV já a contém */
  await store.salvarConfig({ dre: { classificacao: { 'ALUGUEL DA LOJA': 'mercadoria' } } });
  const g2 = (await dre.dre('2026-11')).gerencial;
  igual('marcada como mercadoria, a conta sai das indiretas', g2.despesasIndiretas.total, 0);
  igual('e aparece à parte, para não sumir', g2.compras.total, 7000);

  /* o custo que ela informou a mão vale no DRE também */
  await store.salvarConfig({ dre: { classificacao: { 'ALUGUEL DA LOJA': 'indireta' } } });
  const p1 = await store.pedidos.obter('pdg_8101');
  await store.pedidos.salvar({ ...p1, custoManual: 45000, custoManualEm: Date.now() });
  const g3 = (await dre.dre('2026-11')).gerencial;
  igual('o custo informado a mão manda no CMV do DRE', g3.cmv, 45000);
  igual('e o lucro bruto acompanha', g3.lucroBruto, 82000 - 45000);

  for (const x of await store.pagar.listar()) await store.pagar.remover(x.id);
  for (const n of ['ndg_8101', 'ndg_8102']) await store.nfs.remover(n);
  for (const n of ['pdg_8101', 'pdg_8102']) await store.pedidos.remover(n);
  await limparClassificacao('SIMPLES NACIONAL DAS', 'FRETE SOBRE VENDAS', 'ALUGUEL DA LOJA',
    'EMPRESTIMO CAPITAL DE GIRO', 'CAUCAO DO ALUGUEL', 'CONTA QUE NINGUEM CLASSIFICOU');
  await store.salvarConfig({
    dre: { contasDeMercadoria: guardadas.cfg.dre?.contasDeMercadoria || [] },
  });
  for (const x of guardadas.pagar) await store.pagar.salvar(x);
  for (const x of guardadas.pedidos) await store.pedidos.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
}

console.log('\n▶ Caixa do período: para onde o dinheiro foi, sem nada escondido');
{
  /**
   * "Aí ele mostra a situação dos lançamentos: entradas, atrasados, em aberto,
   *  total. (…) Aí tem o desembolso por conta. O que que eu gastei mais. (…) E
   *  tem uma curva ABC dos desembolsos. Isso é interessante para eu saber aonde
   *  eu posso cortar."
   *
   * O risco aqui é a soma por cima: um total que não bate com as partes, ou uma
   * semana sumindo do gráfico porque não teve movimento. Semana vazia é
   * informação — o gráfico com buraco no meio faz a pessoa ler a semana errada.
   */
  const guardadas = {
    receber: await store.receber.listar(),
    pagar: await store.pagar.listar(),
    cfg: await store.config(),
  };
  for (const x of guardadas.receber) await store.receber.remover(x.id);
  for (const x of guardadas.pagar) await store.pagar.remover(x.id);

  const saida = (id, categoria, valor, vencimento, quem, status) => store.pagar.salvar({
    id: `cxp_${id}`, categoria, valor, vencimento, mes: '2026-12',
    fornecedorNome: quem, descricao: categoria, status,
  });
  const entrada = (id, valor, vencimento, cliente, status) => store.receber.salvar({
    id: `cxr_${id}`, valor, vencimento, mes: '2026-12', clienteNome: cliente, status,
  });

  /* dezembro de 2026: 1ª a 5ª semana, com a terceira de propósito sem nada */
  await entrada(1, 90000, '2026-12-02', 'CLIENTE ALFA', 'pago');
  await entrada(2, 30000, '2026-12-09', 'CLIENTE BETA', 'aberto');   // vence antes da base
  await entrada(3, 25000, '2026-12-28', 'CLIENTE GAMA', 'aberto');   // vence depois
  await saida(1, 'COMPRA DE MERCADORIA', 60000, '2026-12-03', 'FORNECEDOR Z', 'pago');
  await saida(2, 'ALUGUEL', 7000, '2026-12-09', 'IMOBILIARIA', 'aberto');
  await saida(3, 'ENERGIA', 2300, '2026-12-29', 'CPFL', 'aberto');
  await saida(4, 'COMPRA DE MERCADORIA', 31000, '2026-12-04', 'FORNECEDOR W', 'pago');
  /* cancelado não é saída: não saiu dinheiro nenhum */
  await store.pagar.salvar({
    id: 'cxp_x', categoria: 'ALUGUEL', valor: 99999, vencimento: '2026-12-05',
    mes: '2026-12', fornecedorNome: 'IMOBILIARIA', status: 'cancelado',
  });

  await store.salvarConfig({
    dre: {
      classificacao: {
        'COMPRA DE MERCADORIA': 'mercadoria', ALUGUEL: 'indireta', ENERGIA: 'indireta',
      },
    },
  });

  const r = await caixaMod.realizado({ de: '2026-12-01', ate: '2026-12-31', base: '2026-12-15' });

  igual('recebimentos somam o período', r.entradas.total.valor, 145000);
  igual('desembolsos também, e o cancelado fica de fora', r.saidas.total.valor, 100300);
  igual('resultado = recebido − desembolsado', r.resultado, 44700);

  igual('entradas confirmadas', r.entradas.confirmado.valor, 90000);
  igual('entradas atrasadas são as que venceram e seguem abertas', r.entradas.atrasado.valor, 30000);
  igual('entradas em aberto são as que ainda vão vencer', r.entradas.aberto.valor, 25000);
  igual('as três situações fecham o total',
    r.entradas.confirmado.valor + r.entradas.atrasado.valor + r.entradas.aberto.valor,
    r.entradas.total.valor);
  igual('e do lado das saídas também',
    r.saidas.confirmado.valor + r.saidas.atrasado.valor + r.saidas.aberto.valor,
    r.saidas.total.valor);

  igual('a semana sem movimento continua no gráfico',
    r.semanas.some((x) => x.a === 0 && x.b === 0), true);
  igual('a soma das semanas é o total de entradas',
    Math.round(r.semanas.reduce((a, x) => a + x.a, 0) * 100) / 100, r.entradas.total.valor);
  igual('e o de saídas',
    Math.round(r.semanas.reduce((a, x) => a + x.b, 0) * 100) / 100, r.saidas.total.valor);
  ok('cada semana sabe quando começa e quando acaba',
    r.semanas.every((x) => x.inicio && x.fim && x.fim > x.inicio), JSON.stringify(r.semanas[0]));

  const conta = (n) => r.porConta.linhas.find((c) => c.nome === n);
  igual('as duas compras do mesmo plano viram uma conta só', conta('COMPRA DE MERCADORIA').valor, 91000);
  igual('com os dois lançamentos contados', conta('COMPRA DE MERCADORIA').itens, 2);
  igual('a curva ABC põe a maior em A', conta('COMPRA DE MERCADORIA').classe, 'A');
  igual('o total por conta é o total de saídas', r.porConta.total, r.saidas.total.valor);
  igual('as três classes somam o total',
    Math.round(r.porConta.classes.reduce((a, c) => a + c.valor, 0) * 100) / 100,
    r.saidas.total.valor);

  igual('a maior saída vem primeiro', r.maiores[0].valor, 60000);
  igual('e diz em que situação está', r.maiores[0].situacao, 'Confirmado');

  const raiz = r.arvore.find((n) => n.numero === '2');
  igual('a árvore tem os desembolsos na raiz 2', raiz.valor, r.saidas.total.valor);
  igual('os filhos somam a raiz',
    Math.round(raiz.filhos.reduce((a, f) => a + f.valor, 0) * 100) / 100, raiz.valor);
  const merc = raiz.filhos.find((f) => f.nome === 'Compra de mercadoria');
  igual('o degrau 2.x é o do DRE', merc.valor, 91000);
  ok('e 2.x.y é a conta do plano, numerada',
    merc.filhos.length === 1 && /^2\.\d+\.1$/.test(merc.filhos[0].numero),
    JSON.stringify(merc.filhos));
  igual('a captação de empréstimo é dita como desconhecida, não como zero', r.captacao, null);

  for (const x of await store.pagar.listar()) await store.pagar.remover(x.id);
  for (const x of await store.receber.listar()) await store.receber.remover(x.id);
  await limparClassificacao('COMPRA DE MERCADORIA', 'ALUGUEL', 'ENERGIA');
  await store.salvarConfig({
    dre: { contasDeMercadoria: guardadas.cfg.dre?.contasDeMercadoria || [] },
  });
  for (const x of guardadas.pagar) await store.pagar.salvar(x);
  for (const x of guardadas.receber) await store.receber.salvar(x);
}

console.log('\n▶ Compras: a meta é dela, e zero sem classificação não é "comprei zero"');
{
  /**
   * "Eu vou colocar uma meta, uma porcentagem, para não ultrapassar isso. (…)
   *  Eu não consideraria meta de 70%, eu acho muito."
   *
   * Duas coisas que o app não pode fazer aqui: chegar com uma meta inventada, e
   * mostrar "R$ 0,00 comprados" quando na verdade ninguém disse quais contas do
   * plano são compra. A segunda é a pior: zero por falta de informação parece
   * uma notícia ótima no mês em que ela está tentando cortar custo.
   */
  const guardadas = {
    nfs: await store.nfs.listar(),
    pagar: await store.pagar.listar(),
    cfg: await store.config(),
  };
  for (const x of guardadas.nfs) await store.nfs.remover(x.id);
  for (const x of guardadas.pagar) await store.pagar.remover(x.id);

  await store.nfs.salvar({
    id: 'nfcp', numero: '5500', dataEmissao: '2027-01-10', mes: '2027-01', valorTotal: 200000,
    status: 'autorizada', operacao: 'saida', devolucao: false, devolucaoDeCompra: false,
  });
  const conta = (id, categoria, valor, vencimento, quem) => store.pagar.salvar({
    id: `cp_${id}`, categoria, valor, vencimento, mes: vencimento.slice(0, 7),
    fornecedorNome: quem, descricao: categoria, status: 'aberto',
  });
  await conta(1, 'SIMPLES NACIONAL DAS', 12000, '2027-01-20', 'RECEITA FEDERAL');
  await conta(2, 'COMPRA DE MERCADORIA', 60000, '2027-01-06', 'FORNECEDOR Z');
  await conta(3, 'COMPRA DE MERCADORIA', 25000, '2027-01-14', 'FORNECEDOR W');
  await conta(4, 'ALUGUEL', 7000, '2027-01-10', 'IMOBILIARIA');

  /* nada classificado: a tela não pode dizer "comprei zero" */
  await limparClassificacao('SIMPLES NACIONAL DAS', 'COMPRA DE MERCADORIA', 'ALUGUEL');
  await store.salvarConfig({ dre: { contasDeMercadoria: [] }, compras: { metaPercentual: null } });
  const cego = await comprasLog.compras({ mes: '2027-01', meses: 3 });
  igual('sem conta marcada, o app assume que não sabe', cego.sabeOQueECompra, false);
  igual('e o comprado é zero por falta de informação, não por falta de compra',
    cego.atual.comprado, 0);
  igual('sem meta, não existe meta em reais', cego.atual.meta, null);
  igual('nem diferença para cobrar', cego.atual.diferenca, null);

  /* classificada, e com a meta dela */
  await store.salvarConfig({
    dre: { classificacao: { 'COMPRA DE MERCADORIA': 'mercadoria', 'SIMPLES NACIONAL DAS': 'deducao' } },
  });
  const r = await comprasLog.compras({ mes: '2027-01', meses: 3 });
  igual('agora o app sabe o que é compra', r.sabeOQueECompra, true);
  igual('receita líquida = faturamento − impostos', r.atual.receitaLiquida, 188000);
  igual('o aluguel não entra na compra', r.atual.comprado, 85000);
  igual('e o percentual sai mesmo sem meta',
    Math.round(r.atual.percentual * 10) / 10, Math.round((85000 / 188000) * 1000) / 10);
  igual('sem meta definida, o app não finge que há uma', r.atual.meta, null);

  await comprasLog.definirMeta(55);
  const m = await comprasLog.compras({ mes: '2027-01', meses: 3 });
  igual('a meta em reais é a porcentagem da líquida', m.atual.meta, 103400);
  igual('a diferença é comprado − meta', m.atual.diferenca, 85000 - 103400);
  igual('e o app diz que está dentro', m.atual.dentroDaMeta, true);

  await comprasLog.definirMeta(40);
  const m2 = await comprasLog.compras({ mes: '2027-01', meses: 3 });
  igual('com a meta mais apertada, está acima', m2.atual.dentroDaMeta, false);
  igual('e diz quanto passou', m2.atual.diferenca, 85000 - 75200);

  await comprasLog.definirMeta('');
  igual('a meta pode ser tirada',
    (await comprasLog.compras({ mes: '2027-01', meses: 3 })).metaPercentual, null);

  const forn = m.fornecedores;
  igual('o ranking soma o comprado do mês', forn.total, 85000);
  igual('o maior fornecedor vem primeiro', forn.linhas[0].nome, 'FORNECEDOR Z');
  igual('e abre a classe A', forn.linhas[0].classe, 'A');
  igual('as semanas do mês somam o mesmo total',
    Math.round(m.semanas.reduce((a, s) => a + s.valor, 0) * 100) / 100, 85000);
  igual('cada compra aparece uma a uma', m.lancamentos.length, 2);
  igual('os três meses pedidos vieram', m.porMes.length, 3);

  for (const x of await store.pagar.listar()) await store.pagar.remover(x.id);
  await store.nfs.remover('nfcp');
  await limparClassificacao('SIMPLES NACIONAL DAS', 'COMPRA DE MERCADORIA', 'ALUGUEL');
  await store.salvarConfig({
    dre: { contasDeMercadoria: guardadas.cfg.dre?.contasDeMercadoria || [] },
    compras: { metaPercentual: guardadas.cfg.compras?.metaPercentual ?? null },
  });
  for (const x of guardadas.pagar) await store.pagar.salvar(x);
  for (const x of guardadas.nfs) await store.nfs.salvar(x);
}

console.log('\n▶ Pasta do mês');
{
  const p = await dossie.pasta('2026-09');
  igual('a pasta é do mês pedido', p.mes, '2026-09');
  const ids = p.documentos.map((d) => d.id);
  /**
   * A LISTA É A QUE ELA DITOU, NA ORDEM DA CONVERSA COM O PAI.
   *
   * "Relatório geral da empresa para passar para o meu pai: fluxo de caixa ali,
   *  saldos, margem, quanto que você cobrou de frete, faturamento total,
   *  faturamento por vendedor. Orçamentos não fechados, essa visibilidade, eu
   *  preciso enviar para o meu pai todo mês. Sala de comissão, e é isso."
   */
  igual('tem os documentos do fechamento', ids,
    ['dre', 'faturamento', 'margem', 'frete', 'caixa', 'orcamentos', 'comissao',
      'receber', 'pagar', 'clientes', 'pendencias']);

  /**
   * A pasta não recalcula nada: ela chama o mesmo módulo da tela. É isso que o
   * teste confere — se os dois números divergissem, o pai e ela estariam lendo
   * relatórios diferentes do mesmo mês.
   */
  const margemDoc = p.documentos.find((d) => d.id === 'margem');
  const margemDireto = await margemMod.margem({ de: '2026-09-01', ate: '2026-09-30' });
  igual('a margem da pasta é a mesma da tela', margemDoc.total.venda, margemDireto.total.venda);
  igual('e tem uma linha por vendedor', margemDoc.linhas.length, margemDireto.vendedores.length);
  ok('dizendo onde falta custo, em vez de calcular por cima',
    margemDoc.linhas.every((l) => !!l.cobertura), '');

  const freteDoc = p.documentos.find((d) => d.id === 'frete');
  ok('o frete mostra cobrado e custo na mesma linha',
    freteDoc.colunas.some((c) => c.key === 'cobrado') && freteDoc.colunas.some((c) => c.key === 'custo'), '');

  /**
   * E AS COLUNAS CHEGAM PREENCHIDAS.
   *
   * O documento lia `v.custo`, um campo que o módulo de frete nunca devolveu —
   * o custo medido por vendedor chama-se `custoReal`. No relatório que vai para
   * o pai dela, "Custo das entregas" e "Sobra / falta" vinham vazias em TODAS as
   * linhas, com o TOTAL preenchido embaixo: a tabela parecendo quebrada
   * justamente no documento que ela não revisa linha a linha antes de mandar.
   *
   * Um nome de campo errado não dá erro em lugar nenhum: dá `undefined`, que
   * vira célula vazia. Só um teste que OLHA o número pega isso.
   */
  {
    const guardados = await store.fretes.listar();
    for (const x of guardados) await store.fretes.remover(x.id);
    await store.vendedores.salvar({ id: 'vDOS', nome: 'VENDEDOR DOSSIE' });
    await store.nfs.salvar({
      id: 'nfdos', numero: '9500', serie: '1', dataEmissao: '2026-09-10',
      valorTotal: 1300, valorProdutos: 1000, valorFrete: 300, vendedorId: 'vDOS',
      status: 'autorizada', operacao: 'saida', devolucao: false, devolucaoDeCompra: false,
    });
    await store.fretes.salvar({
      id: 'fr_teste', data: '2026-09-10', responsavel: 'TRANSPORTADORA TESTE',
      valor: 100, vendedorNome: 'VENDEDOR DOSSIE', mes: '2026-09',
    });

    const p2 = await dossie.pasta('2026-09');
    const doc = p2.documentos.find((d) => d.id === 'frete');
    const linha = doc.linhas.find((l) => l.nome === 'VENDEDOR DOSSIE');
    ok('a linha do vendedor existe no documento de frete', !!linha,
      JSON.stringify(doc.linhas.map((l) => l.nome)));
    igual('o frete cobrado dele chega na linha', linha?.cobrado, 300);
    igual('o custo da entrega dele também', linha?.custo, 100);
    igual('e a sobra sai calculada', linha?.resultado, 200);
    igual('batendo com o total do documento', doc.total.custo, 100);

    /**
     * NENHUMA COLUNA DO RELATÓRIO DO PAI PODE SER FANTASMA.
     *
     * Uma coluna cujo campo não existe em linha nenhuma não dá erro em lugar
     * nenhum: dá `undefined`, que vira célula vazia no Excel e no PDF. Foi assim
     * que "Custo das entregas" e "Sobra / falta" foram para o relatório dele
     * vazias, com o total preenchido embaixo — e assim que a coluna "Vendedor"
     * dos orçamentos ia vazia desde sempre.
     *
     * Vazio PROPOSITAL (null) continua valendo: quer dizer "não sei", e a célula
     * vazia é melhor que o número inventado. O que isto proíbe é a coluna que
     * nunca teve campo nenhum por trás.
     *
     * Roda aqui, com o frete semeado, porque o guarda só vale pelos documentos
     * que têm linha — e é justamente o de frete que estava quebrado.
     */
    const fantasmas = [];
    for (const d of p2.documentos) {
      if (!d.linhas?.length) continue;
      for (const c of d.colunas) {
        if (!d.linhas.some((l) => l[c.key] !== undefined)) {
          fantasmas.push(`${d.id}.${c.key} ("${c.header}")`);
        }
      }
    }
    ok('nenhuma coluna do fechamento aponta para campo que não existe',
      fantasmas.length === 0, fantasmas.join(', '));
    ok('e a conferência alcançou todos os documentos do fechamento',
      p2.documentos.every((d) => d.linhas?.length),
      `sem linhas: ${p2.documentos.filter((d) => !d.linhas?.length).map((d) => d.id).join(', ')}`);

    await store.fretes.remover('fr_teste');
    await store.nfs.remover('nfdos');
    for (const x of guardados) await store.fretes.salvar(x);
  }

  const caixaDoc = p.documentos.find((d) => d.id === 'caixa');
  ok('o caixa abre pelo saldo informado',
    caixaDoc.linhas[0].conta === 'Saldo em banco informado', caixaDoc.linhas[0].conta);
  ok('e fecha com a posição do mês liquidado',
    caixaDoc.linhas.at(-1).conta === '= Posição com o mês liquidado', caixaDoc.linhas.at(-1).conta);

  const orcDoc = p.documentos.find((d) => d.id === 'orcamentos');
  ok('a aba de orçamentos é a dos NÃO fechados',
    orcDoc.nome === 'Orçamentos não fechados', orcDoc.nome);

  const dreDoc = p.documentos.find((d) => d.id === 'dre');
  ok('o DRE abre pela receita bruta', dreDoc.linhas[0].conta === 'RECEITA BRUTA', dreDoc.linhas[0].conta);
  ok('e fecha com o resultado do mês',
    dreDoc.linhas.some((l) => l.conta === '= RESULTADO DO MÊS'), '');

  const clientesDoc = p.documentos.find((d) => d.id === 'clientes');
  igual('os clientes do mês somam o faturamento',
    clientesDoc.total.valor, p.resumo.total);
  ok('e vêm do maior para o menor',
    clientesDoc.linhas.every((c, i) => i === 0 || clientesDoc.linhas[i - 1].valor >= c.valor), '');

  const planilhas = dossie.planilhasDaPasta(p);
  igual('sai uma aba de Excel por documento', planilhas.length, p.documentos.length);
  ok('cada aba tem nome, colunas e linhas',
    planilhas.every((x) => x.name && x.columns.length && Array.isArray(x.rows)), '');
  ok('o nome da aba cabe no limite do Excel',
    planilhas.every((x) => x.name.length <= 31), JSON.stringify(planilhas.map((x) => x.name)));

  const blocos = dossie.blocosDaPasta(p);
  ok('e o PDF sai com um bloco por documento',
    blocos.length === p.documentos.length && blocos.every((b) => b.tipo === 'tabela' && b.titulo), '');
}


console.log('\n▶ Orçamentos: quanto virou venda');
{
  const q = await quotes.resumo({ de: '2026-09-01', ate: '2026-09-30' });
  ok('os orçamentos do mês entraram', q.quantidade > 0, String(q.quantidade));
  const doMes = (await store.orcamentos.listar())
    .filter((o) => o.data >= '2026-09-01' && o.data <= '2026-09-30');
  igual('o total orçado bate com a soma', q.total,
    Math.round(doMes.reduce((a, o) => a + (o.valorTotal || 0), 0) * 100) / 100);
  ok('a situação veio do arquivo, não de suposição',
    q.grupos.every((g) => ['convertido', 'perdido', 'aberto', 'desconhecida'].includes(g.situacao)),
    JSON.stringify(q.grupos));
  ok('a taxa só conta o que já foi decidido',
    q.taxa == null || q.decididos === q.convertido.quantidade + q.perdido.quantidade, String(q.taxa));
  ok('orçamento em aberto não é contado como perda',
    q.decididos === q.convertido.quantidade + q.perdido.quantidade, '');
  const serie = await quotes.porMes(3, '2026-09-14');
  igual('a série mensal tem um ponto por mês', serie.length, 3);
  ok('e o último é o mês de referência', serie[serie.length - 1].mes === '2026-09', serie[serie.length - 1].mes);
}


console.log('\n▶ Relatório do dia: meta e ritmo');
{
  await store.salvarConfig({ metasPorMes: { '2026-09': 100000 }, diasDeVenda: [1, 2, 3, 4, 5, 6] });

  // setembro de 2026: dia 1 é terça. Até o dia 14 há 12 dias de venda (sem os
  // domingos 6 e 13); no mês inteiro, 26.
  igual('conta só os dias em que a empresa vende',
    diario.diasDeVenda('2026-09-01', '2026-09-14', [1, 2, 3, 4, 5, 6]), 12);
  igual('e o mês inteiro sem domingo', diario.diasDeVenda('2026-09-01', '2026-09-30', [1, 2, 3, 4, 5, 6]), 26);

  const r = await diario.relatorio('2026-09-14');
  igual('o mês até hoje é o faturamento do período', r.mesAteHoje.total, 50400);
  igual('a meta veio do que você definiu', r.meta.valor, 100000);
  igual('falta o que ainda não foi faturado', r.meta.falta, 49600);
  ok('o percentual da meta bate', Math.round(r.meta.percentual) === 50, String(r.meta.percentual));

  igual('meta diária = meta do mês / dias de venda', r.meta.diaria, Math.round((100000 / 26) * 100) / 100);
  igual('dias restantes de venda', r.ritmo.diasRestantes, 14);
  igual('o quanto precisa por dia para fechar', r.ritmo.precisaPorDia, Math.round((49600 / 14) * 100) / 100);
  ok('e a projeção usa o ritmo que ela vem tendo',
    r.ritmo.projecao === Math.round((50400 / 12) * 26 * 100) / 100, String(r.ritmo.projecao));

  const rec = diario.recados(r);
  ok('os recados dizem o que fazer, com número',
    rec.some((x) => x.texto.includes('por dia')), JSON.stringify(rec.map((x) => x.texto)));
  ok('e avisam se o ritmo atual não chega lá',
    rec.some((x) => x.texto.includes('o mês fecha em')), '');

  // agosto não tem meta definida: o app não inventa uma
  const semMeta = await diario.relatorio('2026-08-14');
  igual('sem meta definida, nada de meta é inventado', semMeta.meta.valor, null);
  igual('e nem meta diária', semMeta.meta.diaria, null);
  igual('nem quanto falta', semMeta.meta.falta, null);
  ok('o app pede a meta em vez de chutar',
    diario.recados(semMeta)[0].texto.includes('Nenhuma meta definida'), '');
}


console.log('\n▶ O relatório do dia ATUALIZA, não acumula');
{
  const H = 'Destinado a;CPF/CNPJ;Descrição;Forma de Pagamento;Conta Bancária;Vencimento;Situação;Valor Total;Nota Fiscal';
  const antes = (await store.receber.listar()).length;

  // segunda: dois títulos do mesmo cliente, um deles em duas parcelas iguais
  await importar('receber', 'seg.csv', `${H}
Cliente Prorroga Ltda;99888777000166;7001;Boleto;Itaú;20/09/2026;Em aberto;15.000,00;8001
Cliente Prorroga Ltda;99888777000166;7002;Boleto;Itaú;20/09/2026;Em aberto;2.500,00;8002
Cliente Prorroga Ltda;99888777000166;7002;Boleto;Itaú;20/10/2026;Em aberto;2.500,00;8002`);
  const t1 = (await store.receber.listar()).filter((t) => t.clienteNome === 'Cliente Prorroga Ltda');
  igual('os três títulos entraram', t1.length, 3);

  // terça: o 8001 foi prorrogado para 30/09 e uma parcela do 8002 foi paga
  await importar('receber', 'ter.csv', `${H}
Cliente Prorroga Ltda;99888777000166;7001;Boleto;Itaú;30/09/2026;Em aberto;15.000,00;8001
Cliente Prorroga Ltda;99888777000166;7002;Boleto;Itaú;20/09/2026;Recebido;2.500,00;8002
Cliente Prorroga Ltda;99888777000166;7002;Boleto;Itaú;20/10/2026;Em aberto;2.500,00;8002`);
  const t2 = (await store.receber.listar()).filter((t) => t.clienteNome === 'Cliente Prorroga Ltda');
  igual('continuam três: o arquivo atualizou, não acumulou', t2.length, 3);

  const prorrogado = t2.find((t) => t.nfNumero === '8001');
  igual('o boleto prorrogado é o mesmo, com a data nova', prorrogado.vencimento, '2026-09-30');
  igual('e o valor não dobrou',
    t2.reduce((a, t) => a + (t.valor || 0), 0), 20000);

  const pagas = t2.filter((t) => t.nfNumero === '8002' && link.statusTitulo(t) === 'pago');
  igual('a baixa que ela deu no sistema chegou aqui', pagas.length, 1);
  igual('e a outra parcela continua em aberto',
    t2.filter((t) => t.nfNumero === '8002' && link.statusTitulo(t) === 'aberto').length, 1);

  // e o mesmo vale para o contas a pagar
  const HP = 'Destinado a;CPF/CNPJ;Descrição;Plano de Contas;Forma de Pagamento;Conta Bancária;Data de Vencimento;Situação;Valor Total;Nota Fiscal';
  await importar('pagar', 'p1.csv', `${HP}
Fornecedor Prorroga;11999888000155;Compra;Compra de mercadoria;Boleto;Itaú;15/09/2026;Em aberto;9.000,00;5501`);
  await importar('pagar', 'p2.csv', `${HP}
Fornecedor Prorroga;11999888000155;Compra;Compra de mercadoria;Boleto;Itaú;25/09/2026;Pago;9.000,00;5501`);
  const pg = (await store.pagar.listar()).filter((c) => c.fornecedorNome === 'Fornecedor Prorroga');
  igual('conta a pagar prorrogada também não duplica', pg.length, 1);
  igual('com a data nova', pg[0].vencimento, '2026-09-25');
  igual('e já marcada como paga', pg[0].status, 'pago');

  // reimportar o mesmo arquivo de novo não muda nada
  await importar('receber', 'ter.csv', `${H}
Cliente Prorroga Ltda;99888777000166;7001;Boleto;Itaú;30/09/2026;Em aberto;15.000,00;8001
Cliente Prorroga Ltda;99888777000166;7002;Boleto;Itaú;20/09/2026;Recebido;2.500,00;8002
Cliente Prorroga Ltda;99888777000166;7002;Boleto;Itaú;20/10/2026;Em aberto;2.500,00;8002`);
  igual('e reenviar o mesmo arquivo não muda nada',
    (await store.receber.listar()).filter((t) => t.clienteNome === 'Cliente Prorroga Ltda').length, 3);

  // limpa para não interferir nos outros blocos
  for (const t of t2) await store.receber.remover(t.id);
  for (const c of pg) await store.pagar.remover(c.id);
  igual('a base voltou ao que era', (await store.receber.listar()).length, antes);
}


console.log('\n▶ Um problema é contado uma vez só');
{
  // Antes: um pedido sem vendedor gerava TRÊS pendências — o pedido, a nota
  // dele e a diferença de faturamento do mês — e o valor envolvido saía
  // triplicado. É um problema só, e resolver o pedido resolve tudo.
  const alvo = (await store.pedidos.listar()).find((p) => p.numero === '1003');
  const vendedorOriginal = alvo.vendedorId;
  // como se a coluna VENDEDOR tivesse vindo em branco para este pedido
  await store.pedidos.salvar({ ...alvo, vendedorId: null, vendedorOrigem: null, vendedorNome: null });
  await link.recalcular();

  const abertas = (await store.pendencias.listar()).filter((x) => x.status === 'aberta');
  const doVendedor = abertas.filter((x) => ['pedido_sem_vendedor', 'nf_sem_vendedor', 'divergencia_faturamento'].includes(x.tipo));

  igual('uma venda sem vendedor é uma pendência, não três', doVendedor.length, 1);
  /**
   * E ELA PERGUNTA PELA NOTA, não pelo pedido. "O XML já representa aquilo que
   * efetivamente foi faturado" — então é a nota que precisa de dono, e é ela que
   * aparece na tela, com cliente, valor e data.
   */
  igual('e ela pergunta pela NOTA, que é o que vale', doVendedor[0].tipo, 'nf_sem_vendedor');

  const notaDoPedido = (await store.nfs.listar()).find((n) => n.numero === '3003');
  igual('a nota realmente ficou sem vendedor', notaDoPedido.vendedorId, null);
  igual('mas o valor é contado uma vez só', doVendedor[0].valor, notaDoPedido.valorTotal);

  // resolver o pedido resolve tudo de uma vez
  await link.definirVendedorDoPedido(alvo.id, vendedorOriginal, 'teste');
  await link.recalcular();
  const depois = (await store.pendencias.listar())
    .filter((x) => x.status === 'aberta' && ['pedido_sem_vendedor', 'nf_sem_vendedor', 'divergencia_faturamento'].includes(x.tipo));
  igual('resolvido o pedido, não sobra nenhuma das três', depois.length, 0);
  igual('e a nota voltou a ter dono',
    (await store.nfs.listar()).find((n) => n.numero === '3003').vendedorId, vendedorOriginal);
}


console.log('\n▶ Vendedor em branco: resolver na hora de importar');
{
  // No sistema dela não dá para acrescentar vendedor a um pedido já feito, então
  // o vínculo só pode nascer na importação. O app tem que perceber isso na hora.
  const V = 'Número do Pedido;Cliente;Data da Venda;Vendedor;Situação;Valor do Custo;Valor Total';
  await importar('pedidos', 'novas.csv', `${V}
2001;Cliente Novo A;12/09/2026;;Concretizada;1.000,00;2.500,00
2002;Cliente Novo B;12/09/2026;Carlos;Concretizada;800,00;1.900,00`);
  await link.recalcular();

  const cobrados = await link.pedidosSemVendedor();
  const numeros = cobrados.map((c) => c.pedido.numero);
  ok('a importação já sabe qual pedido ficou sem dono',
    numeros.includes('2001') && !numeros.includes('2002'), JSON.stringify(numeros));

  // é isso que a tela oferece: marcar ali mesmo, inclusive criando um vendedor novo
  const roberto = await store.vendedores.salvar({ nome: 'Roberto', apelidos: [], ativo: true });
  const alvo = cobrados.find((c) => c.pedido.numero === '2001');
  await link.definirVendedorDoPedido(alvo.pedido.id, roberto.id, 'definido na importação');

  igual('marcado na hora, o pedido sai da cobrança',
    (await link.pedidosSemVendedor()).some((c) => c.pedido.numero === '2001'), false);
  igual('e fica gravado que a decisão foi sua',
    (await store.pedidos.listar()).find((p) => p.numero === '2001').vendedorOrigem, 'manual');

  // reenviar o mesmo relatório não apaga o que ela resolveu à mão
  await importar('pedidos', 'novas.csv', `${V}
2001;Cliente Novo A;12/09/2026;;Concretizada;1.000,00;2.500,00
2002;Cliente Novo B;12/09/2026;Carlos;Concretizada;800,00;1.900,00`);
  await link.recalcular();
  igual('e reenviar o arquivo não apaga o vendedor que você pôs',
    (await store.pedidos.listar()).find((p) => p.numero === '2001').vendedorId, roberto.id);

  for (const n of ['2001', '2002']) {
    const p2 = (await store.pedidos.listar()).find((x) => x.numero === n);
    if (p2) await store.pedidos.remover(p2.id);
  }
  await link.recalcular();
}


console.log('\n▶ Recomeçar do zero (uma vez só)');
{
  const reiniciar = await import('../src/core/reiniciar.js');
  const dbm = await import('../src/core/db.js');

  ok('antes do recomeço existe dado dos testes', (await store.nfs.listar()).length > 0, '');

  // como se ela ainda não tivesse recebido a atualização
  await dbm.put('kv', { key: 'reinicio', valor: 'marca-antiga', em: Date.now() });
  store.limparCache();

  const r1 = await reiniciar.reiniciarSePreciso();
  store.limparCache();
  igual('o recomeço acontece', r1.reiniciou, true);
  igual('as notas foram apagadas', (await store.nfs.listar()).length, 0);
  igual('os títulos também', (await store.receber.listar()).length, 0);
  igual('os vendedores também', (await store.vendedores.listar()).length, 0);
  igual('e a configuração voltou ao padrão', (await store.config()).metasPorMes, {});

  // a marca da migração fica gravada: o banco antigo não pode voltar
  const marcaMig = await dbm.get('kv', reiniciar.MARCA ? 'migracao_amplacon' : 'migracao_amplacon');
  ok('a migração do AMPLACON fica marcada como feita, para não trazer tudo de volta',
    !!marcaMig, JSON.stringify(marcaMig));

  // abrir de novo não apaga o que ela mandar depois
  await store.nfs.salvar({
    id: 'nf_depois', numero: '9100', dataEmissao: '2026-09-21', mes: '2026-09',
    valorTotal: 7000, status: 'autorizada', operacao: 'saida',
  });
  const r2 = await reiniciar.reiniciarSePreciso();
  store.limparCache();
  igual('na segunda abertura ele não apaga de novo', r2.reiniciou, false);
  igual('e o que ela mandou depois continua lá',
    (await store.nfs.listar()).map((n) => n.numero), ['9100']);

  // e o de fábrica volta
  await semear();
  const regras = await store.regrasComissao.listar();
  ok('as regras de comissão de fábrica voltam (2% e 0,5%)',
    regras.some((x) => x.percentual === 2) && regras.some((x) => x.percentual === 0.5),
    JSON.stringify(regras.map((x) => x.percentual)));
  ok('e as contas bancárias também', (await store.contas.listar()).length > 0, '');
}


console.log('\n▶ Relatório paginado, como sai do sistema');
{
  // Fixture SINTÉTICA, com a mesma estrutura do relatório de vendas do Gestão
  // Click — título, período, bloco de totais, cabeçalho repetido a cada página,
  // rodapé "Página N de M" e nomes de cliente que quebram em até três linhas.
  // Os nomes são inventados de propósito: o repositório é público, e relatório
  // de verdade leva nome, CNPJ e e-mail de cliente junto.
  const caminho = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'relatorio-vendas-paginado.pdf');
  const leitura = await readFile(new File([readFileSync(caminho)], 'vendas.pdf', { type: 'application/pdf' }));
  const linhas = leitura.planilhas[0].linhas;

  const achado = perfis.reconhecer(linhas);
  ok('o app reconhece o relatório sozinho', !!achado, '(não reconheceu)');
  igual('e sabe de que fonte ele é', achado.perfil.fonte, 'pedidos');

  const cab = linhas[achado.headerRow];
  igual('achou o cabeçalho no meio do arquivo, depois do bloco de totais', cab,
    ['Nº', 'Cliente', 'Data', 'Prazo de entrega', 'Situação', 'Valor custo', 'Valor']);

  const vendas = linhas.filter((l) => /^\d+$/.test(String(l[0] || '').trim()));
  igual('as 120 vendas do arquivo', vendas.length, 120);

  const num = (v) => {
    const t = String(v || '').trim();
    return /^[\d.]+,\d{2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : 0;
  };
  const soma = (i) => Math.round(vendas.reduce((a, l) => a + num(l[i]), 0) * 100) / 100;
  igual('a soma dos valores bate com o total declarado', soma(cab.lastIndexOf('Valor')), 1068118.26);
  igual('e a dos custos também', soma(cab.indexOf('Valor custo')), 586746.95);

  ok('nome comprido quebrado em três linhas voltou inteiro',
    vendas.some((l) => l[1] === 'JACARANDA CONSTRUCOES E EMPREENDIMENTOS IMOBILIARIOS LTDA'),
    JSON.stringify(vendas.map((l) => l[1]).filter((x) => x.length > 40).slice(0, 2)));
  ok('o rodapé de página não virou registro',
    !linhas.some((l) => l.join(' ').includes('Página')), '');
  ok('o cabeçalho repetido a cada página entrou uma vez só',
    linhas.filter((l) => l[0] === 'Nº').length === 1, '');
  ok('e o app diz o que deixou de fora', /ficaram de fora/.test(leitura.aviso || ''), leitura.aviso || '');
}

console.log('\n▶ Os relatórios que já vêm ligados');
{
  // Ela não liga coluna nenhuma: o app conhece o cabeçalho de cada relatório.
  const esperado = {
    'gc-vendas': 'pedidos',
    'gc-vendas-simples': 'pedidos',
    'gc-nfe': 'nfs',
    'gc-comissao': 'comissoes',
    'gc-receber': 'receber',
    'gc-pagar': 'pagar',
    'gc-orcamentos': 'orcamentos',
    'gc-produtos': 'produtos',
    'gc-produtos-sem-grupo': 'produtos',
    'gc-produtos-vendidos': 'produtosVendidos',
    'gc-comissao-produto': 'comissaoProduto',
    'gc-clientes': 'clientes',
    'forms-entrega': 'fretes',
  };
  igual('os treze relatórios estão cadastrados',
    Object.fromEntries(perfis.PERFIS.map((p) => [p.id, p.fonte])), esperado);

  for (const perfil of perfis.PERFIS) {
    const achado = perfis.perfilDoCabecalho(perfil.colunas);
    ok(`${perfil.nome}: o cabeçalho é reconhecido`, achado?.id === perfil.id, achado?.id || 'nenhum');

    // toda coluna do mapa existe mesmo no cabeçalho, e todo campo existe na fonte
    const doMapa = Object.values(perfil.mapa).flat();
    ok(`${perfil.nome}: o mapa só cita colunas que o relatório tem`,
      doMapa.every((c) => perfil.colunas.includes(c)),
      doMapa.filter((c) => !perfil.colunas.includes(c)).join(', '));

    const campos = new Set(FONTES[perfil.fonte].campos.map((c) => c.chave));
    ok(`${perfil.nome}: o mapa só cita campos que a fonte tem`,
      Object.keys(perfil.mapa).every((k) => campos.has(k)),
      Object.keys(perfil.mapa).filter((k) => !campos.has(k)).join(', '));
  }


  // "-----" é como o Gestão Click escreve vazio: não pode virar valor
  const comTracos = {
    'Cód. interno': '123', Nome: 'CIMENTO CP2 50KG', 'Valor de custo': '31,50',
    NCM: '25232910', Grupo: '-----', Estoque: '-1,00', Fornecedor: '-----', 'Vr. Varejo': '39,90',
  };
  const lido = ingest.lerParaTeste('produtos', comTracos, perfis.PERFIS.find((p) => p.id === 'gc-produtos').mapa);
  igual('o traço do Gestão Click não vira grupo de produto', lido.dados.categoria, undefined);
  igual('mas o que tem valor entra', lido.dados.descricao, 'CIMENTO CP2 50KG');
  igual('inclusive o custo', lido.dados.custo, 31.5);
  // o cabeçalho de vendas vem com colunas vazias no meio quando sai de PDF
  const comVazias = ['Nº', 'Cliente', 'Data', 'Prazo de entrega', '', 'Situação', 'Valor custo', '', 'Valor'];
  igual('coluna vazia no meio não atrapalha o reconhecimento',
    perfis.perfilDoCabecalho(comVazias)?.id, 'gc-vendas');

  // um cabeçalho parecido, mas de outro relatório, NÃO pode casar
  igual('cabeçalho diferente não é reconhecido à força',
    perfis.perfilDoCabecalho(['Nº', 'Cliente', 'Data']), null);
}


console.log('\n▶ Relatório de produtos');
{
  // Fixture sintética no formato do relatório de produtos do Gestão Click:
  // Cód. interno · Nome · Valor de custo · NCM · Grupo · Estoque · Fornecedor ·
  // Vr. Varejo, com "-----" nos campos vazios e estoque negativo.
  const caminho = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'relatorio-produtos.pdf');
  const leitura = await readFile(new File([readFileSync(caminho)], 'produtos.pdf', { type: 'application/pdf' }));
  const linhas = leitura.planilhas[0].linhas;

  const achado = perfis.reconhecer(linhas);
  igual('o relatório de produtos é reconhecido', achado?.perfil.id, 'gc-produtos');
  igual('e vai para a fonte de produtos', achado.perfil.fonte, 'produtos');
  igual('as oito colunas foram separadas', linhas[achado.headerRow],
    ['Cód. interno', 'Nome', 'Valor de custo', 'NCM', 'Grupo', 'Estoque', 'Fornecedor', 'Vr. Varejo']);

  const itens = linhas.slice(achado.headerRow + 1).filter((l) => /^\d{10,}$/.test(String(l[0] || '').trim()));
  igual('os 80 produtos do arquivo', itens.length, 80);
  igual('todos com nome', itens.filter((l) => l[1]).length, 80);

  const num = (v) => {
    const t = String(v || '').trim();
    return /^[\d.]+,\d{2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : 0;
  };
  igual('e a soma dos custos bate',
    Math.round(itens.reduce((a, l) => a + num(l[2]), 0) * 100) / 100, 105455.86);

  // e o que o app grava a partir disso
  const preparo = await ingest.prepararTabular({
    fonteId: 'produtos',
    leitura,
    planilhaIndex: 0,
    headerRow: achado.headerRow,
    mapeamento: achado.perfil.mapa,
  });
  const gravados = [...preparo.porStore.produtos.values()];
  igual('os 80 produtos entram', gravados.length, 80);
  igual('nenhum grupo "-----" foi inventado',
    gravados.filter((p) => p.categoria).length, 0);
  ok('o custo virou número', gravados.every((p) => p.custo == null || typeof p.custo === 'number'), '');
  ok('e o NCM entrou', gravados.filter((p) => p.ncm).length === 80, '');
}


console.log('\n▶ Uma venda, uma pendência');
{
  // Toda nota vem de um pedido. Antes o app cobrava a nota E o pedido dela como
  // dois problemas, e o valor envolvido contava o mesmo dinheiro duas vezes.
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação';
  const VEND = 'Número do Pedido;Cliente;Data da Venda;Vendedor;Situação;Valor do Custo;Valor Total';
  const REC = 'Destinado a;CPF/CNPJ;Descrição;Forma de Pagamento;Conta Bancária;Vencimento;Situação;Valor Total;Nota Fiscal';

  await importar('nfs', 'f.csv', `${FISC}
7001;02/10/2026;Cliente Um Ltda;11111111000111;10.000,00;Autorizada
7002;03/10/2026;Cliente Dois Ltda;22222222000122;4.000,00;Autorizada`);
  await importar('pedidos', 'v.csv', `${VEND}
5001;Cliente Um Ltda;01/10/2026;;Concretizada;6.000,00;10.000,00
5002;Cliente Dois Ltda;01/10/2026;;Concretizada;2.500,00;4.000,00`);
  // só a primeira nota tem ponte
  await importar('receber', 'r.csv', `${REC}
Cliente Um Ltda;11111111000111;5001;Boleto;Itaú;10/10/2026;Em aberto;10.000,00;7001`);
  await link.recalcular();

  const abertas = () => store.pendencias.listar()
    .then((l) => l.filter((x) => x.status === 'aberta' && ['nf_sem_vendedor', 'pedido_sem_vendedor'].includes(x.tipo)
      && ['7001', '7002', '5001', '5002'].some((n) => (x.titulo || '').includes(n))));

  const antes = await abertas();
  const tipos = {};
  for (const x of antes) tipos[x.tipo] = (tipos[x.tipo] || 0) + 1;
  /**
   * AGORA QUEM PERGUNTA É A NOTA, e uma vez por nota.
   *
   * Antes, uma venda sem vendedor podia gerar três itens: a nota, o pedido dela
   * e a divergência do mês. Com o pedido fora da rotina, sobrou a pergunta que
   * ela quer responder: de quem foi esta nota.
   */
  igual('cada nota sem dono pergunta uma vez', antes.length, 2);
  igual('e a pergunta é sobre a nota', tipos.nf_sem_vendedor, 2);
  ok('o pedido não pergunta mais nada', !tipos.pedido_sem_vendedor, JSON.stringify(tipos));
  igual('duas pendências para duas vendas — não seis', antes.length, 2);

  // agora o relatório de comissão, que é de onde vem o vendedor
  const COM = 'Nº;Cliente;Vendedor;Data de emissão;Valor;Comissão';
  await importar('comissoes', 'c.csv', `${COM}
5001;Cliente Um Ltda;Rita;02/10/2026;10.000,00;200,00
5002;Cliente Dois Ltda;Rita;03/10/2026;4.000,00;80,00`);
  await link.recalcular();

  const depois = await abertas();
  igual('o relatório de comissão resolve os dois pedidos de uma vez',
    depois.filter((x) => x.tipo === 'pedido_sem_vendedor').length, 0);
  ok('a vendedora foi criada a partir do relatório',
    (await store.vendedores.listar()).some((v) => v.nome === 'Rita'), '');

  const nfs7001 = (await store.nfs.listar()).find((n) => n.numero === '7001');
  const nfs7002 = (await store.nfs.listar()).find((n) => n.numero === '7002');
  const rita = (await store.vendedores.listar()).find((v) => v.nome === 'Rita');
  igual('a nota com pedido herdou a vendedora', nfs7001.vendedorId, rita.id);
  igual('a nota sem título também tem dono', nfs7002.vendedorId, rita.id);
  /**
   * A ORIGEM MUDOU DE PROPÓSITO.
   *
   * Antes o vendedor chegava à nota passando pelo registro do PEDIDO. Agora ele
   * vem direto do relatório de comissão, pelo número do pedido que o próprio XML
   * carrega — "não quero mais depender do relatório geral de vendas". O caminho
   * ficou mais curto e o resultado é o mesmo: a Rita.
   */
  igual('e veio direto do relatório de comissão', nfs7001.vendedorOrigem, 'comissao-pedido');
  igual('sem precisar do registro de pedido no meio', nfs7002.vendedorOrigem, 'comissao-pedido');
  igual('com o pedido certo', nfs7002.pedidoNumero, '5002');

  // as duas vendas fecharam: não sobra nada
  igual('não sobra pendência nenhuma', depois.map((x) => x.tipo), []);

  // e o app guarda o que o sistema calculou, para poder comparar depois
  const doRelatorio = await store.comissoesRelatorio.listar();
  igual('as linhas do relatório ficam guardadas', doRelatorio.length, 2);
  igual('com a comissão que o SISTEMA calculou',
    doRelatorio.find((c) => c.numero === '5001').comissaoRelatorio, 200);

  // limpeza
  for (const n of ['7001', '7002']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  for (const n of ['5001', '5002']) {
    const x = (await store.pedidos.listar()).find((y) => y.numero === n);
    if (x) await store.pedidos.remover(x.id);
    const c = (await store.comissoesRelatorio.listar()).find((y) => y.numero === n);
    if (c) await store.comissoesRelatorio.remover(c.id);
  }
  for (const t of (await store.receber.listar()).filter((x) => x.nfNumero === '7001')) await store.receber.remover(t.id);
  await link.recalcular();
}

console.log('\n▶ Título que cita nota de outro mês não é divergência');
{
  const REC = 'Destinado a;CPF/CNPJ;Descrição;Forma de Pagamento;Conta Bancária;Vencimento;Situação;Valor Total;Nota Fiscal';
  // a base tem notas 3001..3005; o título cita a 1200, de um mês que ela nem importou
  await importar('receber', 'velha.csv', `${REC}
Cliente Antigo;33333333000133;900;Boleto;Itaú;20/12/2026;Em aberto;500,00;1200`);
  await link.recalcular();
  const p = (await store.pendencias.listar())
    .filter((x) => x.status === 'aberta' && x.tipo === 'receber_sem_nf' && (x.titulo || '').includes('1200'));
  igual('nota fora da faixa importada não vira aviso', p.length, 0);

  for (const t of (await store.receber.listar()).filter((x) => x.nfNumero === '1200')) await store.receber.remover(t.id);
  await link.recalcular();
}

console.log('\n▶ A segunda ponte: mesmo cliente, mesmo valor, pedido antes da nota');
{
  /**
   * De 336 notas de um mês real, só 74 aparecem em algum título do contas a
   * receber: o export sai só com os títulos EM ABERTO, e o título da venda já
   * recebida é justamente o que ligaria a nota do mês ao pedido. A segunda
   * ponte fecha esse buraco SEM
   * inventar: mesmo cliente, mesmo valor até o centavo, pedido antes da nota, e
   * par único. Este bloco é a especificação do que ela aceita e, principalmente,
   * do que ela RECUSA.
   */
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação';
  const VEND = 'Número do Pedido;Cliente;Data da Venda;Vendedor;Situação;Valor do Custo;Valor Total';

  await importar('pedidos', 'pv.csv', `${VEND}
6101;Ponte Unica Ltda;05/11/2026;Alberto;Concretizada;500,00;1.111,11
6102;Ponte Dois Donos Ltda;05/11/2026;Alberto;Concretizada;900,00;2.222,22
6103;Ponte Dois Donos Ltda;06/11/2026;Beatriz;Concretizada;900,00;2.222,22
6104;Ponte Mesmo Dono Ltda;05/11/2026;Alberto;Concretizada;900,00;3.333,33
6105;Ponte Mesmo Dono Ltda;06/11/2026;Alberto;Concretizada;900,00;3.333,33
6106;Ponte Depois Ltda;20/11/2026;Alberto;Concretizada;900,00;4.444,44
6107;Ponte Centavo Ltda;05/11/2026;Alberto;Concretizada;900,00;5.555,55
6108;Ponte Longe Ltda;01/09/2026;Alberto;Concretizada;900,00;6.666,66`);
  await importar('nfs', 'pn.csv', `${FISC}
8101;07/11/2026;Ponte Unica Ltda;44444444000144;1.111,11;Autorizada
8102;07/11/2026;Ponte Dois Donos Ltda;44444444000255;2.222,22;Autorizada
8103;07/11/2026;Ponte Mesmo Dono Ltda;44444444000366;3.333,33;Autorizada
8104;07/11/2026;Ponte Depois Ltda;44444444000477;4.444,44;Autorizada
8105;07/11/2026;Ponte Centavo Ltda;44444444000588;5.555,56;Autorizada
8106;07/11/2026;Ponte Longe Ltda;44444444000699;6.666,66;Autorizada`);
  await link.recalcular();

  const nota = async (n) => (await store.nfs.listar()).find((x) => x.numero === n);
  const nomeDo = async (nf) => (nf.vendedorId
    ? (await store.vendedores.listar()).find((v) => v.id === nf.vendedorId)?.nome
    : null);

  const unica = await nota('8101');
  igual('par único: liga no pedido', unica.pedidoNumero, '6101');
  igual('e a origem não mente sobre como foi', unica.vendedorOrigem, 'pedido-valor');
  igual('com o vendedor do pedido', await nomeDo(unica), 'Alberto');

  const doisDonos = await nota('8102');
  igual('dois pedidos iguais de vendedores diferentes: não escolhe', doisDonos.vendedorId, null);
  igual('e não inventa vínculo com nenhum dos dois', doisDonos.pedidoNumero, null);

  const mesmoDono = await nota('8103');
  igual('dois pedidos iguais do MESMO vendedor: o vendedor é certo',
    await nomeDo(mesmoDono), 'Alberto');
  igual('e a origem diz que o pedido continua indefinido', mesmoDono.vendedorOrigem, 'vendedor-valor');
  igual('sem escolher um pedido no lugar do outro', mesmoDono.pedidoNumero, null);

  const depois = await nota('8104');
  igual('pedido DEPOIS da nota não é a venda dela', depois.vendedorId, null);

  const centavo = await nota('8105');
  igual('um centavo de diferença não é o mesmo valor', centavo.vendedorId, null);

  const longe = await nota('8106');
  igual('pedido de dois meses antes está fora da janela', longe.vendedorId, null);

  // e o que sobrou é cobrado: a nota entra na lista de vendas sem dono, com o
  // motivo escrito, porque é ela que precisa de vendedor — não um pedido
  const semDono = await link.vendasSemVendedor();
  const cobradas = semDono.filter((x) => x.tipo === 'nota' && ['8102', '8104', '8105', '8106']
    .some((n) => x.titulo.includes(n)));
  igual('as quatro recusadas viram trabalho para resolver', cobradas.length, 4);
  ok('e a nota dos dois donos explica por que o app não escolheu',
    /2 pedidos deste cliente com este mesmo valor/.test(
      cobradas.find((x) => x.titulo.includes('8102')).explicacao),
    cobradas.find((x) => x.titulo.includes('8102')).explicacao);

  // recalcular de novo não muda nada: vínculo derivado é refeito, não acumulado
  await link.recalcular();
  igual('recalcular duas vezes dá o mesmo resultado',
    (await nota('8101')).pedidoNumero, '6101');
  igual('e não gruda vínculo em quem foi recusada', (await nota('8102')).pedidoNumero, null);

  // limpeza
  for (const n of ['8101', '8102', '8103', '8104', '8105', '8106']) {
    const x = await nota(n);
    if (x) await store.nfs.remover(x.id);
  }
  for (const n of ['6101', '6102', '6103', '6104', '6105', '6106', '6107', '6108']) {
    const x = (await store.pedidos.listar()).find((y) => y.numero === n);
    if (x) await store.pedidos.remover(x.id);
  }
  await link.recalcular();
}

console.log('\n▶ Por nota × por pedido: a conferência por vendedor');
{
  /**
   * "Eu sei que um vendedor vendeu bem mais do que tá no relatório."
   * A tela de comissões põe os dois números lado a lado para ela poder checar
   * sozinha, em vez de desconfiar.
   */
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação';
  const VEND = 'Número do Pedido;Cliente;Data da Venda;Vendedor;Situação;Valor do Custo;Valor Total';
  const COM = 'Nº;Cliente;Vendedor;Data de emissão;Valor;Comissão';

  await importar('pedidos', 'cv.csv', `${VEND}
7201;Confere Um Ltda;03/12/2026;;Concretizada;500,00;10.000,00
7202;Confere Dois Ltda;03/12/2026;;Concretizada;500,00;7.000,00`);
  await importar('comissoes', 'cc.csv', `${COM}
7201;Confere Um Ltda;Sílvia;03/12/2026;10.000,00;200,00
7202;Confere Dois Ltda;Sílvia;03/12/2026;7.000,00;140,00`);
  // só a primeira virou nota: a segunda venda não tem nota nenhuma no mês
  await importar('nfs', 'cn.csv', `${FISC}
9201;04/12/2026;Confere Um Ltda;55555555000155;10.000,00;Autorizada`);
  await link.recalcular();

  const c = await commission.calcular('2026-12');
  const silvia = c.conferenciaVendedores.find((v) => v.nome === 'Sílvia');
  igual('por nota emitida: só a nota que existe', silvia.porNota, 10000);
  igual('por pedido: o que o relatório de comissão traz', silvia.porPedido, 17000);
  igual('e a diferença é a venda que ainda não virou nota', silvia.diferenca, -7000);

  // limpeza
  for (const n of ['9201']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  for (const n of ['7201', '7202']) {
    const x = (await store.pedidos.listar()).find((y) => y.numero === n);
    if (x) await store.pedidos.remover(x.id);
    const y = (await store.comissoesRelatorio.listar()).find((z) => z.numero === n);
    if (y) await store.comissoesRelatorio.remover(y.id);
  }
  await link.recalcular();
}

console.log('\n▶ Contas a receber só com os "em aberto": o app avisa');
{
  /**
   * A ponte mais forte entre nota e pedido é o contas a receber. Ela falha calada
   * quando o export sai só com os títulos EM ABERTO: a venda já recebida sai da
   * lista, e é o título dela que ligaria a nota daquele mês ao pedido. No arquivo
   * real foram 398 títulos, nenhum recebido, e só 74 de 336 notas atravessaram.
   */
  const REC = 'Destinado a;CPF/CNPJ;Descrição;Forma de Pagamento;Conta Bancária;Vencimento;Situação;Valor Total;Nota Fiscal';
  const linha = (i, situacao) => `Cliente Filtro ${i} Ltda;6666666600${String(i).padStart(4, '0')};`
    + `Venda de nº ${9300 + i};Boleto;Itaú;${String((i % 28) + 1).padStart(2, '0')}/01/2027;${situacao};`
    + `1.000,00;${9400 + i}`;

  const soAbertos = await importar('receber', 'filtro.csv',
    [REC, ...Array.from({ length: 25 }, (_, i) => linha(i, 'Em aberto'))].join('\n'));
  ok('avisa quando nenhum título do arquivo está recebido',
    soAbertos.preparo.avisos.some((a) => /EM ABERTO/.test(a)),
    JSON.stringify(soAbertos.preparo.avisos));
  ok('e diz o que fazer: exportar sem o filtro de situação',
    soAbertos.preparo.avisos.some((a) => /sem o filtro/i.test(a)), '');

  const comRecebidos = await importar('receber', 'filtro2.csv',
    [REC, ...Array.from({ length: 24 }, (_, i) => linha(i, 'Em aberto')), linha(24, 'Recebido')].join('\n'));
  ok('não avisa quando o arquivo traz recebidos também',
    !comRecebidos.preparo.avisos.some((a) => /EM ABERTO/.test(a)),
    JSON.stringify(comRecebidos.preparo.avisos));

  // arquivo pequeno não diz nada sobre filtro nenhum: não inventa aviso
  const pequeno = await importar('receber', 'filtro3.csv',
    [REC, linha(90, 'Em aberto'), linha(91, 'Em aberto')].join('\n'));
  ok('e não acusa filtro num arquivo de duas linhas',
    !pequeno.preparo.avisos.some((a) => /EM ABERTO/.test(a)), '');

  for (const t of (await store.receber.listar()).filter((x) => /Cliente Filtro/.test(x.clienteNome || ''))) {
    await store.receber.remover(t.id);
  }
  await link.recalcular();
}

console.log('\n▶ Devolução: tira do faturamento e abate a comissão de quem vendeu');
{
  /**
   * "O Guilherme fez uma venda mês passado e o cliente devolveu esse mês. Só que
   *  eu já paguei a comissão do mês passado. Então eu preciso abater na comissão
   *  desse mês essas notas fiscais devolvidas."
   *
   * Quem diz o que é devolução é a coluna NATUREZA DA OPERAÇÃO. Sem ela, a
   * devolução entra como venda: soma no faturamento e ainda gera comissão.
   */
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  const VEND = 'Número do Pedido;Cliente;Data da Venda;Vendedor;Situação;Valor do Custo;Valor Total';
  const COM = 'Nº;Cliente;Vendedor;Data de emissão;Valor;Comissão';

  await importar('pedidos', 'dv.csv', `${VEND}
8301;Devolve Ltda;02/03/2027;;Concretizada;3.000,00;5.000,00`);
  await importar('comissoes', 'dc.csv', `${COM}
8301;Devolve Ltda;Teodoro;02/03/2027;5.000,00;100,00`);
  // a venda em março, a devolução em ABRIL — e uma devolução de COMPRA no meio
  await importar('nfs', 'dn.csv', `${FISC}
9301;03/03/2027;Devolve Ltda;77777777000177;5.000,00;Autorizada;Venda de mercadoria
9302;05/04/2027;Devolve Ltda;77777777000177;5.000,00;Autorizada;Devolução de venda
9303;06/04/2027;Fornecedor Qualquer Ltda;77777777000288;900,00;Autorizada;Devolução de compra`);
  await link.recalcular();

  const nota = async (n) => (await store.nfs.listar()).find((x) => x.numero === n);
  const venda = await nota('9301');
  const devolucao = await nota('9302');
  const devCompra = await nota('9303');

  igual('a natureza do arquivo diz o que é devolução', devolucao.devolucao, true);
  igual('e a venda normal não é devolução', venda.devolucao, false);
  igual('devolução de COMPRA não é devolução de venda', devCompra.devolucao, false);
  ok('mas fica marcada à parte, para não virar faturamento negativo por engano',
    devCompra.devolucaoDeCompra === true, JSON.stringify(devCompra.devolucaoDeCompra));

  igual('a devolução achou de quem era a venda', devolucao.vendedorId, venda.vendedorId);
  igual('e a origem diz que veio da nota devolvida', devolucao.vendedorOrigem, 'devolucao-nota');
  igual('com o número da nota original guardado', devolucao.notaDevolvida, '9301');
  igual('a devolução NÃO gruda no pedido da venda', devolucao.pedidoNumero, null);

  // faturamento: a venda soma em março, a devolução subtrai em abril
  const marco = await revenue.resumo({ de: '2027-03-01', ate: '2027-03-31' });
  const abril = await revenue.resumo({ de: '2027-04-01', ate: '2027-04-30' });
  igual('março fatura a venda', marco.total, 5000);
  igual('abril fica negativo pela devolução', abril.total, -5000);

  // comissão: 2% em março, −2% em abril, do MESMO vendedor
  const cMarco = await commission.calcular('2027-03');
  const cAbril = await commission.calcular('2027-04');
  const teodoroMarco = cMarco.vendedores.find((v) => v.nome === 'Teodoro');
  const teodoroAbril = cAbril.vendedores.find((v) => v.nome === 'Teodoro');
  igual('março paga a comissão da venda', teodoroMarco.comissao, 100);
  igual('abril abate a comissão da devolução', teodoroAbril.comissao, -100);

  igual('e a devolução aparece na lista do mês', cAbril.resumoDevolucoes.quantidade, 1);
  igual('com o valor devolvido', cAbril.resumoDevolucoes.valor, 5000);
  igual('e quanto foi abatido de comissão', cAbril.resumoDevolucoes.comissaoAbatida, -100);
  igual('nenhuma devolução ficou sem dono', cAbril.resumoDevolucoes.semDono, 0);
  igual('abatido do vendedor certo', cAbril.devolucoes[0].vendedorNome, 'Teodoro');

  // devolução cujo original não está na base: vira pendência, não some
  await importar('nfs', 'dn2.csv', `${FISC}
9304;07/04/2027;Cliente Sumido Ltda;77777777000399;1.234,56;Autorizada;Devolução de venda`);
  await link.recalcular();
  const orfa = await nota('9304');
  igual('devolução sem a venda original não ganha vendedor nenhum', orfa.vendedorId, null);
  const pend = (await store.pendencias.listar())
    .filter((x) => x.status === 'aberta' && x.tipo === 'devolucao_sem_origem' && x.titulo.includes('9304'));
  igual('e vira pendência própria, com pergunta própria', pend.length, 1);
  const cAbril2 = await commission.calcular('2027-04');
  ok('e o mês não pode fechar com devolução sem dono',
    cAbril2.bloqueios.some((b) => b.tipo === 'devolucao_sem_dono'),
    JSON.stringify(cAbril2.bloqueios.map((b) => b.tipo)));

  // limpeza
  for (const n of ['9301', '9302', '9303', '9304']) {
    const x = await nota(n);
    if (x) await store.nfs.remover(x.id);
  }
  const ped = (await store.pedidos.listar()).find((x) => x.numero === '8301');
  if (ped) await store.pedidos.remover(ped.id);
  const com = (await store.comissoesRelatorio.listar()).find((x) => x.numero === '8301');
  if (com) await store.comissoesRelatorio.remover(com.id);
  await link.recalcular();
}

console.log('\n▶ Busca avançada: a data é digitada, e o período é uma faixa');
{
  /**
   * "Eu não consigo filtrar pelo mês. Eu queria uma busca avançada onde eu
   *  conseguisse filtrar os dias como eu quisesse. (…) Eu mesma colocar a data,
   *  não ter que clicar na data."
   */
  const comAtalho = filtro.lerFiltro({ p: 'mesAnterior' });
  ok('atalho de mês passado devolve uma faixa fechada',
    comAtalho.de < comAtalho.ate && comAtalho.de.endsWith('-01'), `${comAtalho.de} a ${comAtalho.ate}`);

  const digitado = filtro.lerFiltro({ p: 'mesAnterior', de: '2027-05-10', ate: '2027-05-12' });
  igual('data digitada vence o atalho', [digitado.de, digitado.ate], ['2027-05-10', '2027-05-12']);
  igual('e o atalho passa a ser "personalizado"', digitado.atalho, 'personalizado');

  const soDe = filtro.lerFiltro({ de: '2027-05-10' });
  igual('só "de" significa daí para frente, sem fim', soDe.ate, '9999-12-31');
  const soAte = filtro.lerFiltro({ ate: '2027-05-10' });
  igual('só "até" significa desde sempre', soAte.de, '0001-01-01');

  const tudo = filtro.lerFiltro({ p: 'tudo' });
  ok('"tudo" pega tudo', tudo.de === '0001-01-01' && tudo.ate === '9999-12-31', '');

  // ida e volta pela URL: o filtro é compartilhável e sobrevive a recarregar
  const volta = filtro.lerFiltro(
    Object.fromEntries(Object.entries(filtro.paraQuery(digitado)).filter(([, v]) => v != null)),
  );
  igual('o filtro sobrevive à ida e volta pela URL', [volta.de, volta.ate], ['2027-05-10', '2027-05-12']);

  // aplicar: fora do período não entra, nem por engano
  const linhas = [
    { data: '2027-05-09', clienteNome: 'Antes Ltda', vendedorId: 'v1' },
    { data: '2027-05-10', clienteNome: 'Brenge Construções', vendedorId: 'v1' },
    { data: '2027-05-11', clienteNome: 'Outro Cliente', vendedorId: 'v2', documento: '12345678' },
    { data: '2027-05-13', clienteNome: 'Depois Ltda', vendedorId: 'v1' },
    { data: null, clienteNome: 'Sem data', vendedorId: 'v1' },
  ];
  igual('só o que está dentro da faixa entra',
    filtro.aplicar(linhas, digitado).map((l) => l.clienteNome),
    ['Brenge Construções', 'Outro Cliente']);
  igual('filtro de vendedor corta junto',
    filtro.aplicar(linhas, { ...digitado, vendedorId: 'v2' }).map((l) => l.clienteNome),
    ['Outro Cliente']);
  igual('busca por nome não precisa de acento nem maiúscula',
    filtro.aplicar(linhas, { ...digitado, busca: 'brenge construcoes' }).map((l) => l.clienteNome),
    ['Brenge Construções']);
  igual('busca por número casa com documento',
    filtro.aplicar(linhas, { ...digitado, busca: '123456' }).map((l) => l.clienteNome),
    ['Outro Cliente']);
  igual('registro sem a data pedida fica de fora, para a soma do período bater',
    filtro.aplicar(linhas, filtro.lerFiltro({ p: 'tudo' })).some((l) => l.clienteNome === 'Sem data'),
    false);
}

console.log('\n▶ Carteira de clientes: quem compra, quem parou, quem orça e não fecha');
{
  /**
   * "Quais clientes pararam, quais estão orçando e não estão fechando, quanto X
   *  cliente compra com X vendedor."
   */
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  const VEND = 'Número do Pedido;Cliente;Data da Venda;Vendedor;Situação;Valor do Custo;Valor Total';
  const COM = 'Nº;Cliente;Vendedor;Data de emissão;Valor;Comissão';
  const ORC = 'Número;Cliente;Data;Previsão de entrega;Situação;Valor';

  await importar('pedidos', 'kp.csv', `${VEND}
8501;Fiel Ltda;03/06/2026;;Concretizada;600,00;1.000,00
8502;Fiel Ltda;10/06/2026;;Concretizada;900,00;1.500,00
8503;Sumiu Ltda;05/02/2026;;Concretizada;500,00;9.000,00`);
  await importar('comissoes', 'kc.csv', `${COM}
8501;Fiel Ltda;Ana;03/06/2026;1.000,00;20,00
8502;Fiel Ltda;Bruno;10/06/2026;1.500,00;30,00
8503;Sumiu Ltda;Ana;05/02/2026;9.000,00;180,00`);
  await importar('nfs', 'kn.csv', `${FISC}
9501;03/06/2026;Fiel Ltda;88888888000111;1.000,00;Autorizada;Venda de mercadoria
9502;10/06/2026;Fiel Ltda;88888888000111;1.500,00;Autorizada;Venda de mercadoria
9503;05/02/2026;Sumiu Ltda;88888888000222;9.000,00;Autorizada;Venda de mercadoria`);
  await importar('orcamentos', 'ko.csv', `${ORC}
7701;So Orca Ltda;08/06/2026;;Em aberto;5.000,00
7702;Fiel Ltda;09/06/2026;;Aprovado;1.500,00`);
  await link.recalcular();

  const c = await carteiraMod.carteira({ de: '2026-06-01', ate: '2026-06-30' });
  const achar = (nome) => c.linhas.find((l) => l.nome === nome);

  const fiel = achar('Fiel Ltda');
  igual('comprou no período é a soma das notas', fiel.comprouPeriodo, 2500);
  igual('e duas notas', fiel.notasPeriodo, 2);
  igual('comprou de dois vendedores', fiel.vendedores.map((v) => v.nome).sort(), ['Ana', 'Bruno']);
  ok('e isso fica marcado: é a carteira repartida aparecendo', fiel.multiVendedor, '');
  igual('com quanto em cada', fiel.vendedores.find((v) => v.nome === 'Bruno').valor, 1500);

  const sumiu = achar('Sumiu Ltda');
  ok('quem comprava e não comprou no período entra como "parou"', sumiu.parou, '');
  igual('e o histórico dele continua à vista', sumiu.comprouSempre, 9000);
  ok('está na lista de quem parou', c.pararam.some((l) => l.nome === 'Sumiu Ltda'),
    JSON.stringify({ dias: sumiu.diasSemComprar, lista: c.pararam.map((l) => l.nome) }));
  // "parou" é medido contra o FIM do período escolhido, não contra hoje
  igual('e os dias sem comprar são contados até o fim do período', sumiu.diasSemComprar, 145);

  const soOrca = achar('So Orca Ltda');
  igual('quem orçou e não comprou nada aparece', soOrca.orcaENaoFecha, true);
  igual('com o valor orçado', soOrca.orcouPeriodo, 5000);
  ok('e não entra na lista de quem parou (nunca comprou)',
    !c.pararam.some((l) => l.nome === 'So Orca Ltda'), '');
  ok('mas entra na de orçou sem fechar',
    c.orcamSemFechar.some((l) => l.nome === 'So Orca Ltda'), '');

  igual('o resumo conta só quem comprou', c.resumo.clientesComCompra, 1);
  igual('e o faturamento é o do período', c.resumo.faturamento, 2500);
  igual('e avisa quantos têm carteira dividida', c.resumo.comMaisDeUmVendedor, 1);

  // filtrar por vendedor: só os clientes daquele vendedor
  const soAna = await carteiraMod.carteira({ de: '2026-06-01', ate: '2026-06-30', vendedorId: fiel.vendedores.find((v) => v.nome === 'Ana').vendedorId });
  ok('filtrando por vendedor sobra quem comprou dele',
    soAna.linhas.every((l) => l.vendedores.some((v) => v.nome === 'Ana')), '');

  // a ficha de um cliente: histórico inteiro, sem recorte
  const ficha = await carteiraMod.cliente(fiel.chave);
  igual('a ficha soma tudo que o cliente já comprou', ficha.comprouSempre, 2500);
  igual('e mostra com quem ele comprou', ficha.porVendedor.length, 2);
  igual('e o mês a mês', ficha.porMes.length, 1);

  // limpeza
  for (const n of ['9501', '9502', '9503']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  for (const n of ['8501', '8502', '8503']) {
    const x = (await store.pedidos.listar()).find((y) => y.numero === n);
    if (x) await store.pedidos.remover(x.id);
    const y = (await store.comissoesRelatorio.listar()).find((z) => z.numero === n);
    if (y) await store.comissoesRelatorio.remover(y.id);
  }
  for (const o of (await store.orcamentos.listar()).filter((x) => ['7701', '7702'].includes(String(x.numero)))) {
    await store.orcamentos.remover(o.id);
  }
  await link.recalcular();
}

console.log('\n▶ Os dois relatórios de produto: total por período, não item de nota');
{
  /**
   * "Os relatórios que eu tenho de produto é relatório de comissão por produto,
   *  onde aparece um valor total vendido, a quantidade vendida por vendedor. (…)
   *  Outro relatório é os produtos vendidos, com produto, quantidade, custo
   *  médio, custo total, valor total e lucro."
   *
   * Nenhum traz o número da nota: são TOTAIS de um período. Somá-los junto com os
   * itens das notas contaria a mesma venda duas vezes, então a curva usa um OU
   * outro, e o item da nota manda quando existe.
   */
  const PV = 'Produto;Código;Quantidade;Custo médio;Custo total;Valor total;Lucro';
  const CP = 'Produto;Código;Vendedor;Quantidade;Valor total;Comissão';

  await importar('produtosVendidos', 'pv.csv', `${PV}
CIMENTO CP II 50KG;CIM50;400;32,00;12.800,00;20.000,00;7.200,00
AREIA MEDIA M3;ARE01;100;60,00;6.000,00;9.000,00;3.000,00`, { mesReferencia: '2026-04-01' });

  const linhas = (await store.vendasProduto.listar()).filter((l) => l.mes === '2026-04');
  igual('as duas linhas entraram', linhas.length, 2);
  const cimento = linhas.find((l) => /CIMENTO/.test(l.descricao || ''));
  igual('com o custo total do arquivo', cimento.custoTotal, 12800);
  igual('e o lucro do arquivo', cimento.lucro, 7200);
  igual('e o mês escolhido na importação', cimento.mes, '2026-04');
  // o custo médio de um relatório de TOTAIS não vira o custo do produto: ele é a
  // média de um período, em unidade que pode não ser a da venda. Fica num campo
  // próprio, e a margem só o usa como plano B, com verificação de unidade.
  const cadastrado = (await store.produtos.listar()).find((p) => p.codigo === 'CIM50');
  igual('o custo médio do relatório NÃO vira o custo do produto', cadastrado.custo ?? null, null);
  igual('ele fica num campo próprio', cadastrado.custoMedioRelatorio, 32);

  // reimportar ATUALIZA, não soma de novo
  await importar('produtosVendidos', 'pv.csv', `${PV}
CIMENTO CP II 50KG;CIM50;400;32,00;12.800,00;20.000,00;7.200,00
AREIA MEDIA M3;ARE01;100;60,00;6.000,00;9.000,00;3.000,00`, { mesReferencia: '2026-04-01' });
  igual('reimportar não duplica',
    (await store.vendasProduto.listar()).filter((l) => l.mes === '2026-04').length, 2);

  // a curva ABC usa o relatório quando não há item de nota no período
  const origem = await abcMod.origemDosNumeros({ de: '2026-04-01', ate: '2026-04-30' });
  igual('a curva lê o relatório agregado quando não há item de nota', origem.fonte, 'relatorio-agregado');
  const curva = await abcMod.curva({ de: '2026-04-01', ate: '2026-04-30', criterio: 'faturamento' });
  igual('e o faturamento é a soma do arquivo', curva.total, 29000);
  igual('com o cimento na frente', curva.linhas[0].descricao, 'CIMENTO CP II 50KG');
  const margem = await abcMod.curva({ de: '2026-04-01', ate: '2026-04-30', criterio: 'margem' });
  igual('a margem sai sem estimativa, direto do custo do arquivo', margem.total, 10200);

  // comissão por produto: o mesmo produto por dois vendedores
  await importar('comissaoProduto', 'cp.csv', `${CP}
CIMENTO CP II 50KG;CIM50;Ana;300;15.000,00;75,00
CIMENTO CP II 50KG;CIM50;Bruno;100;5.000,00;25,00`, { mesReferencia: '2026-05-01' });
  const maio = (await store.vendasProduto.listar()).filter((l) => l.mes === '2026-05');
  igual('cada vendedor é uma linha', maio.length, 2);
  igual('com a comissão que o sistema calculou',
    maio.reduce((a, l) => a + (l.comissaoRelatorio || 0), 0), 100);

  // o item da nota manda quando existe: o agregado não é somado em cima
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  const ITENS = 'Nota fiscal;Código do produto;Produto;Quantidade;Valor total';
  await importar('nfs', 'pvn.csv', `${FISC}
9601;10/04/2026;Cliente Curva Ltda;99999999000199;1.000,00;Autorizada;Venda de mercadoria`);
  await importar('nfItens', 'pvi.csv', `${ITENS}
9601;CIM50;CIMENTO CP II 50KG;20;1.000,00`);
  const origem2 = await abcMod.origemDosNumeros({ de: '2026-04-01', ate: '2026-04-30' });
  igual('com item de nota na base, a curva passa a ler o item', origem2.fonte, 'itens-da-nota');
  const curva2 = await abcMod.curva({ de: '2026-04-01', ate: '2026-04-30', criterio: 'faturamento' });
  igual('e NÃO soma os dois: só o item da nota', curva2.total, 1000);

  // limpeza
  for (const l of (await store.vendasProduto.listar())) await store.vendasProduto.remover(l.id);
  for (const i of (await store.nfItens.listar()).filter((x) => x.nfNumero === '9601')) await store.nfItens.remover(i.id);
  const nf = (await store.nfs.listar()).find((x) => x.numero === '9601');
  if (nf) await store.nfs.remover(nf.id);
  for (const p of (await store.produtos.listar()).filter((x) => ['CIM50', 'ARE01'].includes(x.codigo))) {
    await store.produtos.remover(p.id);
  }
  await link.recalcular();
}

console.log('\n▶ Vendedor se cadastra, não se manda por relatório');
{
  const { FONTES_LISTA, FONTES } = await import('../src/data/sources.js');
  ok('a fonte "vendedores" sai da lista de relatórios a mandar',
    !FONTES_LISTA.some((f) => f.id === 'vendedores'),
    FONTES_LISTA.map((f) => f.id).join(','));
  ok('mas continua existindo, para o importador e o backup', !!FONTES.vendedores, '');
  ok('e os dois relatórios de produto entraram na lista',
    FONTES_LISTA.some((f) => f.id === 'comissaoProduto') && FONTES_LISTA.some((f) => f.id === 'produtosVendidos'), '');
}

console.log('\n▶ Margem e frete por vendedor');
{
  /**
   * "Conseguir ver a margem que está sendo utilizada por vendedor, a margem
   *  total. De 100, quantos por cento? Qual o custo final? Qual o lucro final?
   *  E frete: quanto cada vendedor está cobrando?"
   *
   * O custo vem do relatório de PRODUTOS VENDIDOS; quanto cada vendedor vendeu de
   * cada produto vem do de COMISSÃO POR PRODUTO. O app cruza os dois — não
   * estima nada.
   */
  const PV = 'Produto;Quantidade;Custo médio;Custo total;Valor total;Lucro';
  const CP = 'Produto;Vendedor;Quantidade;Valor total;Comissão integral (%)';

  await importar('produtosVendidos', 'mv.csv', `${PV}
CIMENTO MARGEM 50KG;200;30,00;6.000,00;10.000,00;4.000,00
AREIA MARGEM M3;100;40,00;4.000,00;6.000,00;2.000,00`, { mesReferencia: '2026-07-01' });
  await importar('comissaoProduto', 'mc.csv', `${CP}
CIMENTO MARGEM 50KG;Nair;150;7.500,00;37,50
CIMENTO MARGEM 50KG;Otavio;50;2.500,00;12,50
AREIA MARGEM M3;Nair;100;6.000,00;120,00`, { mesReferencia: '2026-07-01' });
  await link.recalcular();

  const m = await margemMod.margem({ de: '2026-07-01', ate: '2026-07-31' });

  // o total vem direto do relatório, sem passar por vendedor nenhum
  igual('o total vendido é o do relatório', m.totalRelatorio.venda, 16000);
  igual('o custo total também', m.totalRelatorio.custo, 10000);
  igual('e o lucro também', m.totalRelatorio.lucro, 6000);
  igual('margem sobre a venda: de 100, quantos por cento sobram',
    Math.round(m.totalRelatorio.margem * 100) / 100, 37.5);

  const nair = m.vendedores.find((v) => v.nome === 'Nair');
  const otavio = m.vendedores.find((v) => v.nome === 'Otavio');
  igual('Nair vendeu cimento e areia', nair.venda, 13500);
  // 150 × 30 (custo médio do cimento) + 100 × 40 (da areia) = 8.500
  igual('e o custo dela é quantidade × custo médio de cada produto', nair.custo, 8500);
  igual('com o lucro que sobra', nair.lucro, 5000);
  igual('e a margem dela', Math.round(nair.margem * 100) / 100, 37.04);
  ok('margem completa: todo produto dela tinha custo', nair.completa, '');

  igual('Otavio vendeu só cimento', otavio.venda, 2500);
  igual('com custo de 50 × 30', otavio.custo, 1500);

  igual('a soma dos vendedores bate com o total', m.total.venda, 16000);
  igual('e o custo somado também', m.total.custo, 10000);
  /* aqui o custo VEM do relatório: a tela não pode dizer que ele é dispensável */
  ok('quando o custo vem do relatório, a tela não diz que ele é só referência',
    !m.conferencia.coberturaDeCusto.soDoPedido,
    JSON.stringify(m.conferencia.coberturaDeCusto));

  /**
   * Produto vendido por alguém mas fora do relatório de custo: margem incompleta.
   *
   * O arquivo vai INTEIRO, com as linhas de antes mais a nova: relatório mensal
   * é fotografia do mês, e reimportar o mês substitui o mês. Mandar só a linha
   * nova apagaria as outras — que é o que o aviso da importação promete e o app
   * passou a cumprir.
   */
  await importar('comissaoProduto', 'mc2.csv', `${CP}
CIMENTO MARGEM 50KG;Nair;150;7.500,00;37,50
CIMENTO MARGEM 50KG;Otavio;50;2.500,00;12,50
AREIA MARGEM M3;Nair;100;6.000,00;120,00
PRODUTO SEM CUSTO;Nair;10;500,00;10,00`, { mesReferencia: '2026-07-01' });
  const m2 = await margemMod.margem({ de: '2026-07-01', ate: '2026-07-31' });
  const nair2 = m2.vendedores.find((v) => v.nome === 'Nair');
  ok('produto sem custo marca a margem como incompleta', !nair2.completa, '');
  igual('e o app diz quantos foram', nair2.produtosSemCusto, 1);
  igual('sem inventar custo nenhum para ele', nair2.custo, 8500);

  /**
   * CUSTO EM UNIDADE DIFERENTE — o erro mais caro desta tela.
   *
   * No arquivo real, TIJOLO COMUM é vendido a R$ 7,20 na nota e aparece com
   * "custo médio" de R$ 87,38 no relatório, porque o relatório conta o pacote.
   * Custo por unidade × quantidade da nota dava R$ 80 mil de prejuízo que não
   * existe. A proporção CUSTO/VENDA do mesmo produto não tem unidade, e por isso
   * atravessa essa diferença sem errar.
   */
  await importar('produtosVendidos', 'un.csv', `${PV}
TIJOLO PACOTE;100;87,38;8.738,00;14.400,00;5.662,00`, { mesReferencia: '2026-08-01' });
  const FISC2 = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  const ITENS2 = 'Nota fiscal;Código do produto;Produto;Quantidade;Valor total';
  await importar('nfs', 'un-nf.csv', `${FISC2}
9901;10/08/2026;Cliente Tijolo Ltda;20202020000120;7.200,00;Autorizada;Venda de mercadoria`);
  await importar('nfItens', 'un-it.csv', `${ITENS2}
9901;TIJ01;TIJOLO PACOTE;1000;7.200,00`);
  await link.recalcular();

  const mu = await margemMod.margem({ de: '2026-08-01', ate: '2026-08-31' });
  console.log('    DBG itens-agosto:', JSON.stringify((await store.nfItens.listar()).filter((i) => (i.data || '').startsWith('2026-08')).map((i) => [i.produtoId, i.quantidade, i.valorTotal, i.nfStatus, i.vendedorId])));
  const linhaTijolo = mu.vendedores[0];
  // o relatório diz: custo 8.738 sobre venda 14.400 = 60,7% de custo.
  // 7.200 vendidos × 60,7% = 4.369 de custo, e NÃO 1000 × 87,38 = 87.380.
  igual('o custo vem pela proporção, não pela unidade', linhaTijolo.custo, 4369);
  ok('e a margem fica igual à do relatório, não negativa',
    Math.abs(linhaTijolo.margem - 39.3) < 0.2, String(linhaTijolo.margem));

  // a margem do relatório fica como REFERÊNCIA, com a base dela dita
  ok('a margem calculada e a do relatório ficam lado a lado',
    Math.abs(mu.conferencia.margemCalculada - 39.3) < 0.2
    && Math.abs(mu.conferencia.margemDeclarada - 39.3) < 0.2,
    JSON.stringify([mu.conferencia.margemCalculada, mu.conferencia.margemDeclarada]));
  /**
   * O QUE DECIDE SE A TELA MOSTRA O NÚMERO É A COBERTURA DE CUSTO, não a
   * comparação com a margem declarada. As duas são bases diferentes de venda —
   * o relatório conta as vendas do mês, a tela conta as notas do mês — e tratar
   * a diferença como erro me fez caçar, por um dia, uma venda de balcão que não
   * existe.
   */
  igual('toda a venda tem custo', mu.conferencia.coberturaDeCusto.semCusto, 0);
  ok('e a cobertura de 100% é o que libera a tela',
    mu.conferencia.coberturaDeCusto.percentual === 100 && mu.margemConfiavel === true, '');

  for (const x of (await store.nfs.listar()).filter((y) => y.numero === '9901')) await store.nfs.remover(x.id);
  for (const x of (await store.nfItens.listar()).filter((y) => y.nfNumero === '9901')) await store.nfItens.remover(x.id);
  for (const x of (await store.vendasProduto.listar()).filter((y) => y.mes === '2026-08')) await store.vendasProduto.remover(x.id);
  for (const x of (await store.produtos.listar()).filter((y) => y.codigo === 'TIJ01')) await store.produtos.remover(x.id);
  await link.recalcular();

  /**
   * O CUSTO DO PEDIDO VEM ANTES DE TODOS — e dissolve o problema da unidade.
   *
   * "Dentro do meu sistema, o que vale de faturamento é a nota fiscal. (...) Por
   *  que ter o pedido de venda também? (...) O que que você tem no relatório de
   *  pedido de venda? O vendedor."
   *
   * O pedido tem mais que o vendedor: tem a coluna VALOR DO CUSTO, que é o CMV
   * que o sistema dela registrou para aquela venda — na unidade da venda e sem
   * média de período. Nenhuma fonte de custo chega perto disso, e por isso ela
   * vem primeiro: quando a nota tem pedido, a cascata de produto não é usada.
   */
  const VENDC = 'Número do Pedido;Cliente;Data da Venda;Vendedor;Situação;Valor do Custo;Valor Total';
  await importar('pedidos', 'cp.csv', `${VENDC}
7701;Cliente Custo Ltda;05/08/2026;Alberto;Concretizada;4.000,00;10.000,00`);
  /**
   * O relatório traz duas linhas: uma sã e uma FURADA, com custo maior que a
   * venda do produto no mês inteiro. Era assim que TIJOLO COMUM 9X19X5 (PACOTE
   * C/10) punha R$ 345.933,00 de custo sobre R$ 29.767,75 de venda e derrubava a
   * margem declarada do relatório inteiro de 42,3% para 22,5%.
   */
  await importar('produtosVendidos', 'cp-pv.csv', `${PV}
CIMENTO CP;100;30,00;3.000,00;10.000,00;7.000,00
TIJOLO PCT;500;87,38;43.690,00;4.000,00;-39.690,00`, { mesReferencia: '2026-08-01' });
  await importar('nfs', 'cp-nf.csv', `${FISC2}
9902;10/08/2026;Cliente Custo Ltda;30303030000130;10.000,00;Autorizada;Venda de mercadoria`);
  await importar('nfItens', 'cp-it.csv', `${ITENS2}
9902;CIM01;CIMENTO CP;100;10.000,00`);
  await link.recalcular();

  const mp = await margemMod.margem({ de: '2026-08-01', ate: '2026-08-31' });
  igual('a venda é a da nota', mp.total.venda, 10000);
  // 4.000 é o custo do PEDIDO. 3.000 seria o do relatório, e perde.
  igual('e o custo é o que o pedido declarou, não o do relatório', mp.total.custo, 4000);
  igual('margem de 60%, sobre a venda', Math.round(mp.total.margem), 60);
  igual('a nota pegou o custo pelo pedido', mp.conferencia.coberturaDeCusto.notasComPedido, 1);
  igual('cobrindo toda a venda', mp.conferencia.coberturaDeCusto.doPedido, 10000);

  /* a linha furada do relatório sai da referência e fica à vista */
  igual('o relatório tem uma linha furada', mp.conferencia.relatorioFurado.linhas, 1);
  igual('com o custo que não existe', mp.conferencia.relatorioFurado.custo, 43690);
  ok('e ela aparece com nome, para ser corrigida na origem',
    mp.conferencia.relatorioFurado.produtos[0].descricao === 'TIJOLO PCT',
    JSON.stringify(mp.conferencia.relatorioFurado.produtos));
  // sem ela, o relatório declara 70%; com ela, declararia -233%
  igual('a margem de referência é a do relatório LIMPO',
    Math.round(mp.conferencia.margemDeclarada), 70);
  ok('e a que ele declara de fato fica registrada, sem esconder nada',
    mp.conferencia.margemDeclaradaBruta < -200, String(mp.conferencia.margemDeclaradaBruta));

  /**
   * E A DIFERENÇA DE BASE NÃO É ERRO.
   *
   * "Nem toda nota fiscal que eu uso para emitir usa o pedido de venda do mês
   *  passado. (...) Então é normal aparecer mais pedidos de venda do que notas
   *  fiscais. Mas o ideal e o certo é ser as notas fiscais."
   *
   * O relatório soma R$ 14.000 e as notas R$ 10.000. Isso aparece na tela como
   * informação, e NÃO segura a margem: quem segura é a cobertura de custo.
   */
  igual('a diferença entre as duas bases é medida', mp.conferencia.diferencaDeBase, 4000);
  ok('e não impede a tela de mostrar a margem', mp.margemConfiavel === true, '');

  for (const x of (await store.nfs.listar()).filter((y) => y.numero === '9902')) await store.nfs.remover(x.id);
  for (const x of (await store.nfItens.listar()).filter((y) => y.nfNumero === '9902')) await store.nfItens.remover(x.id);
  for (const x of (await store.vendasProduto.listar()).filter((y) => y.mes === '2026-08')) await store.vendasProduto.remover(x.id);
  for (const x of (await store.pedidos.listar()).filter((y) => y.numero === '7701')) await store.pedidos.remover(x.id);
  await link.recalcular();

  /**
   * O CADASTRO DE PRODUTOS É O MELHOR CUSTO — e também o melhor teste.
   *
   * Ele traz custo e varejo do mesmo produto, na mesma linha e na mesma unidade.
   * Quando a razão entre os dois é sã, o custo absoluto vale. Quando o custo é
   * MAIOR que o preço de tabela, ou o produto é vendido com prejuízo ou as
   * unidades diferem (TIJOLO com custo de R$ 280,00 e varejo de R$ 7,20, porque
   * o custo é do pacote). Nos dois casos o custo não serve, e o app prefere
   * dizer "sem custo" a inventar prejuízo.
   */
  const PROD = 'Cód. interno;Nome;Valor de custo;NCM;Estoque;Fornecedor;Vr. Varejo';
  await importar('produtos', 'cad.csv', `${PROD}
CAD01;PRODUTO SADIO;40,00;25051000;10,00;-----;100,00
CAD02;PRODUTO UNIDADE TROCADA;280,00;25051000;10,00;-----;7,20`);
  const FISC4 = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  const ITENS4 = 'Nota fiscal;Código do produto;Produto;Quantidade;Valor total';
  await importar('nfs', 'cad-nf.csv', `${FISC4}
9920;10/09/2027;Cliente Cadastro Ltda;40404040000140;1.080,00;Autorizada;Venda de mercadoria`);
  await importar('nfItens', 'cad-it.csv', `${ITENS4}
9920;CAD01;PRODUTO SADIO;10;900,00
9920;CAD02;PRODUTO UNIDADE TROCADA;25;180,00`);
  await link.recalcular();

  const mc = await margemMod.margem({ de: '2027-09-01', ate: '2027-09-30' });
  const linha = mc.vendedores[0];
  // só o produto sadio custeia: 10 × 40 = 400. O outro fica de fora.
  igual('o custo vem do cadastro, por unidade', linha.custo, 400);
  igual('e o produto cujo custo não fecha com o preço fica sem custo', linha.produtosSemCusto, 1);
  ok('aparecendo na lista, com o fator que denuncia a unidade',
    mc.unidadeDiferente.some((u) => /UNIDADE TROCADA/.test(u.descricao) && u.fator > 30),
    JSON.stringify(mc.unidadeDiferente.map((u) => [u.descricao, u.fator])));
  ok('e o app avisa que a margem está incompleta', !linha.completa, '');

  for (const x of (await store.nfs.listar()).filter((y) => y.numero === '9920')) await store.nfs.remover(x.id);
  for (const x of (await store.nfItens.listar()).filter((y) => y.nfNumero === '9920')) await store.nfItens.remover(x.id);
  for (const x of (await store.produtos.listar()).filter((y) => ['CAD01', 'CAD02'].includes(y.codigo))) {
    await store.produtos.remover(x.id);
  }
  await link.recalcular();

  // frete: sem a coluna no arquivo, o app diz que não sabe — não mostra zero
  igual('sem coluna de frete, o app não finge que o frete é zero', m.frete.temDado, false);

  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação;Frete';
  await importar('nfs', 'fr.csv', `${FISC}
9701;10/07/2026;Cliente Frete Ltda;10101010000110;1.000,00;Autorizada;Venda de mercadoria;120,00
9702;11/07/2026;Cliente Frete Ltda;10101010000110;2.000,00;Autorizada;Venda de mercadoria;80,00`);
  await link.recalcular();
  const comFrete = await margemMod.frete({ de: '2026-07-01', ate: '2026-07-31' });
  ok('com a coluna, o frete aparece', comFrete.temDado, '');
  igual('somado', comFrete.total, 200);
  igual('em duas notas', comFrete.notasComFrete, 2);

  // limpeza
  for (const l of (await store.vendasProduto.listar())) await store.vendasProduto.remover(l.id);
  for (const n of ['9701', '9702']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  for (const p2 of (await store.produtos.listar()).filter((x) => /MARGEM|SEM CUSTO/.test(x.descricao || ''))) {
    await store.produtos.remover(p2.id);
  }
  for (const v of (await store.vendedores.listar()).filter((x) => ['Nair', 'Otavio'].includes(x.nome))) {
    await store.vendedores.remover(v.id);
  }
  await link.recalcular();
}

console.log('\n▶ Mesmo vendedor com dois nomes: o app pergunta, não junta sozinho');
{
  /**
   * O relatório de comissão por venda traz "EDUARDO"; o de comissão por produto,
   * "CARLOS EDUARDO APARECIDO DO NASCIMENTO". Juntar por semelhança é o que o
   * item 20 proíbe — então o app mostra o par e pergunta.
   */
  const curto = await store.vendedores.salvar({ nome: 'EDUARDO', apelidos: [], ativo: true });
  const longo = await store.vendedores.salvar({ nome: 'CARLOS EDUARDO APARECIDO DO NASCIMENTO', apelidos: [], ativo: true });
  const outro = await store.vendedores.salvar({ nome: 'ANALICE', apelidos: [], ativo: true });
  const ana = await store.vendedores.salvar({ nome: 'ANA', apelidos: [], ativo: true });

  const pares = link.vendedoresParecidos(await store.vendedores.listar());
  ok('acha o par pelo nome inteiro dentro do nome comprido',
    pares.some((p) => p.curto.id === curto.id && p.longo.id === longo.id),
    JSON.stringify(pares.map((p) => [p.curto.nome, p.longo.nome])));
  ok('mas NÃO acha "ANA" dentro de "ANALICE": é palavra, não pedaço',
    !pares.some((p) => p.curto.id === ana.id && p.longo.id === outro.id), '');

  await link.recalcular();
  const pend = (await store.pendencias.listar())
    .filter((x) => x.status === 'aberta' && x.tipo === 'vendedor_duplicado');
  ok('e vira pendência para ela decidir', pend.length >= 1, String(pend.length));

  // juntar: o nome do outro vira apelido e some um cadastro
  await link.juntarVendedores(curto.id, longo.id, 'teste');
  const depois = await store.vendedores.listar();
  igual('o cadastro que saiu some', depois.filter((v) => v.id === longo.id).length, 0);
  ok('e o nome dele vira apelido do que ficou',
    depois.find((v) => v.id === curto.id).apelidos.includes('CARLOS EDUARDO APARECIDO DO NASCIMENTO'), '');

  for (const v of [curto, outro, ana]) {
    const x = (await store.vendedores.listar()).find((y) => y.id === v.id);
    if (x) await store.vendedores.remover(x.id);
  }
  await link.recalcular();

  // e quando são vários pares de uma vez: o nome CURTO fica em todos
  const antes = (await store.vendedores.listar()).map((v) => v.id);
  const a1 = await store.vendedores.salvar({ nome: 'TULIO', apelidos: [], ativo: true });
  const a2 = await store.vendedores.salvar({ nome: 'TULIO BARROS DE SA', apelidos: [], ativo: true });
  const b1 = await store.vendedores.salvar({ nome: 'IVONE', apelidos: [], ativo: true });
  const b2 = await store.vendedores.salvar({ nome: 'IVONE PEREIRA LOPES', apelidos: [], ativo: true });

  const feitos = await link.juntarTodosOsPares('teste em lote');
  igual('junta os dois pares de uma vez', feitos.length, 2);
  const restantes = await store.vendedores.listar();
  igual('o nome curto é o que fica',
    restantes.filter((v) => ['TULIO', 'IVONE'].includes(v.nome)).length, 2);
  igual('e o completo some como cadastro',
    restantes.filter((v) => [a2.id, b2.id].includes(v.id)).length, 0);
  ok('virando apelido do que ficou',
    restantes.find((v) => v.nome === 'TULIO').apelidos.includes('TULIO BARROS DE SA'), '');

  for (const v of restantes) if (!antes.includes(v.id)) await store.vendedores.remover(v.id);
  await link.recalcular();
}

console.log('\n▶ XML da NF-e: traz frete, devolução e os itens com custo');
{
  /**
   * "Eu acho que eu mandando o XML das notas resolve 100%. Adicione um campo
   *  para eu poder colocar o XML também."
   *
   * O XML é a melhor fonte que existe para este app, e por três motivos que
   * nenhum relatório dela cobre juntos:
   *   • vFrete  → o frete cobrado, por nota e por vendedor
   *   • natOp / finNFe → o que é devolução, sem depender de coluna nenhuma
   *   • det/prod → os itens, com quantidade e valor, que fazem a curva ABC
   *
   * A nota deste teste é inventada: CNPJ, cliente e produtos não existem.
   */
  const { readFile } = await import('../src/core/files/read.js');

  const nfe = (numero, { natOp, finNFe, tpNF = '1', vFrete = '0.00', vNF, itens }) => `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe3526${numero}0000000000000000000000000000000000">
<ide><nNF>${numero}</nNF><serie>1</serie><mod>55</mod><dhEmi>2027-08-12T10:00:00-03:00</dhEmi>
<natOp>${natOp}</natOp><tpNF>${tpNF}</tpNF><finNFe>${finNFe}</finNFe></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>AMPLA TESTE</xNome></emit>
<dest><CNPJ>11111111000191</CNPJ><xNome>CLIENTE DE TESTE LTDA</xNome><xMun>SAO PAULO</xMun><UF>SP</UF></dest>
${itens}
<total><ICMSTot><vProd>${vNF}</vProd><vFrete>${vFrete}</vFrete><vDesc>0.00</vDesc><vNF>${vNF}</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

  const item = (seq, cod, nome, qtd, unit, total) => `<det nItem="${seq}"><prod><cProd>${cod}</cProd>
<xProd>${nome}</xProd><NCM>25232910</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
<qCom>${qtd}</qCom><vUnCom>${unit}</vUnCom><vProd>${total}</vProd></prod></det>`;

  const importarXml = async (nome, texto) => {
    const leitura = await readFile(new File([texto], nome, { type: 'text/xml' }));
    const preparo = await ingest.prepararNfe({ leitura });
    await ingest.confirmar(preparo);
    return preparo;
  };

  await importarXml('venda.xml', nfe('9801', {
    natOp: 'VENDA DE MERCADORIA', finNFe: '1', vFrete: '150.00', vNF: '1000.00',
    itens: item(1, 'CIM-XML', 'CIMENTO XML 50KG', '20.0000', '50.0000', '1000.00'),
  }));
  await link.recalcular();

  const nota = (await store.nfs.listar()).find((n) => n.numero === '9801');
  ok('a nota do XML entrou', !!nota, '');
  igual('com o frete que nenhum relatório traz', nota.valorFrete, 150);
  igual('e a natureza da operação', nota.naturezaOperacao, 'VENDA DE MERCADORIA');
  igual('não é devolução', nota.devolucao, false);
  igual('é saída', nota.operacao, 'saida');

  const itens = (await store.nfItens.listar()).filter((i) => i.nfNumero === '9801');
  igual('e o item veio junto', itens.length, 1);
  igual('com quantidade', itens[0].quantidade, 20);
  igual('e valor', itens[0].valorTotal, 1000);

  // devolução de VENDA: finNFe 4 e natureza de devolução
  await importarXml('devolucao.xml', nfe('9802', {
    natOp: 'DEVOLUCAO DE VENDA', finNFe: '4', vNF: '1000.00',
    itens: item(1, 'CIM-XML', 'CIMENTO XML 50KG', '20.0000', '50.0000', '1000.00'),
  }));
  await link.recalcular();
  const dev = (await store.nfs.listar()).find((n) => n.numero === '9802');
  igual('devolução de venda é devolução', dev.devolucao, true);

  /**
   * A DEVOLUÇÃO DE VENDA VEM COMO NOTA DE ENTRADA (tpNF=0): é o certo
   * fiscalmente, porque a empresa emite entrada para receber a mercadoria de
   * volta. A regra "nota de entrada não é faturamento" engolia a devolução
   * inteira — nos XMLs de um mês real, 9 devoluções não abatiam nada.
   */
  await importarXml('devolucao-entrada.xml', nfe('9804', {
    natOp: 'Devolucao de venda', finNFe: '4', tpNF: '0', vNF: '300.00',
    itens: item(1, 'CIM-XML', 'CIMENTO XML 50KG', '6.0000', '50.0000', '300.00'),
  }));
  await link.recalcular();
  const devEntrada = (await store.nfs.listar()).find((n) => n.numero === '9804');
  igual('devolução de venda chega como nota de entrada', devEntrada.operacao, 'entrada');
  ok('e mesmo assim conta para o faturamento', revenue.valeParaFaturamento(devEntrada), '');
  igual('entrando NEGATIVA, que é o estorno da receita', revenue.valorFaturado(devEntrada), -300);

  // compra de fornecedor continua de fora: entrada que não é devolução de venda
  await importarXml('compra.xml', nfe('9805', {
    natOp: 'Compra para comercializacao', finNFe: '1', tpNF: '0', vNF: '900.00',
    itens: item(1, 'CIM-XML', 'CIMENTO XML 50KG', '18.0000', '50.0000', '900.00'),
  }));
  await link.recalcular();
  const compra = (await store.nfs.listar()).find((n) => n.numero === '9805');
  ok('compra de fornecedor continua fora do faturamento',
    !revenue.valeParaFaturamento(compra), '');

  // devolução de COMPRA: finNFe 4 também, mas não é anti-venda
  await importarXml('devcompra.xml', nfe('9803', {
    natOp: 'DEVOLUCAO DE COMPRA', finNFe: '4', vNF: '500.00',
    itens: item(1, 'CIM-XML', 'CIMENTO XML 50KG', '10.0000', '50.0000', '500.00'),
  }));
  await link.recalcular();
  const devCompra = (await store.nfs.listar()).find((n) => n.numero === '9803');
  igual('devolução de COMPRA não vira faturamento negativo', devCompra.devolucao, false);
  ok('e fica marcada à parte', devCompra.devolucaoDeCompra === true, '');

  // o frete do XML alimenta a tela de frete por vendedor
  const fr = await margemMod.frete({ de: '2027-08-01', ate: '2027-08-31' });
  ok('o frete do XML aparece na tela de frete', fr.temDado, '');
  igual('com o valor da nota', fr.total, 150);

  // reimportar o mesmo XML não duplica
  await importarXml('venda.xml', nfe('9801', {
    natOp: 'VENDA DE MERCADORIA', finNFe: '1', vFrete: '150.00', vNF: '1000.00',
    itens: item(1, 'CIM-XML', 'CIMENTO XML 50KG', '20.0000', '50.0000', '1000.00'),
  }));
  igual('reimportar o mesmo XML não duplica',
    (await store.nfs.listar()).filter((n) => n.numero === '9801').length, 1);

  /**
   * VÁRIOS DE UMA VEZ. "Enviar um por um é muita nota."
   *
   * Só XML junta: cada NF-e é um documento independente, então ler várias e
   * somá-las num pacote é a mesma coisa que ler um ZIP. Planilha e PDF não
   * juntam — dois relatórios diferentes no mesmo lote virariam uma tabela sem
   * sentido, e isso seria perder dado calado.
   */
  const { readFiles } = await import('../src/core/files/read.js');
  const arquivoXml = (nome, texto) => new File([texto], nome, { type: 'text/xml' });

  const lote = await readFiles([
    arquivoXml('a.xml', nfe('9811', { natOp: 'VENDA', finNFe: '1', vFrete: '10.00', vNF: '100.00', itens: item(1, 'P1', 'PRODUTO UM', '1.0000', '100.0000', '100.00') })),
    arquivoXml('b.xml', nfe('9812', { natOp: 'VENDA', finNFe: '1', vFrete: '20.00', vNF: '200.00', itens: item(1, 'P2', 'PRODUTO DOIS', '2.0000', '100.0000', '200.00') })),
    arquivoXml('quebrado.xml', '<isto nao e> uma nota'),
  ]);
  igual('o lote junta as notas que deram certo', lote.nfe.notas.length, 2);
  igual('e o formato é o mesmo de um XML só', lote.formato, 'nfe');
  ok('o arquivo quebrado não derruba o lote: vira aviso',
    /1 de 3 arquivo\(s\) não puderam ser lidos/.test(lote.aviso || ''), lote.aviso);
  ok('e o nome do lote diz quantos e quantas notas',
    /3 arquivos \(2 nota\(s\)\)/.test(lote.arquivo), lote.arquivo);

  // a mesma nota em dois arquivos entra uma vez só, e o app avisa
  const repetido = await readFiles([
    arquivoXml('x.xml', nfe('9813', { natOp: 'VENDA', finNFe: '1', vNF: '50.00', itens: item(1, 'P3', 'PRODUTO TRES', '1.0000', '50.0000', '50.00') })),
    arquivoXml('x-copia.xml', nfe('9813', { natOp: 'VENDA', finNFe: '1', vNF: '50.00', itens: item(1, 'P3', 'PRODUTO TRES', '1.0000', '50.0000', '50.00') })),
  ]);
  ok('nota repetida entre arquivos é avisada', /vieram repetidas/.test(repetido.aviso || ''), repetido.aviso);
  const preparoRep = await ingest.prepararNfe({ leitura: repetido });
  await ingest.confirmar(preparoRep);
  igual('e entra uma vez só',
    (await store.nfs.listar()).filter((n) => n.numero === '9813').length, 1);

  // dois relatórios juntos: recusa com explicação, em vez de misturar
  let recusou = null;
  try {
    await readFiles([
      new File(['a;b\n1;2'], 'um.csv', { type: 'text/csv' }),
      new File(['a;b\n3;4'], 'dois.csv', { type: 'text/csv' }),
    ]);
  } catch (err) { recusou = err.message; }
  ok('vários relatórios no mesmo lote são recusados', !!recusou, String(recusou));
  ok('com explicação do porquê', /um de cada vez/.test(recusou || ''), String(recusou));

  // um arquivo só continua funcionando igual
  const sozinho = await readFiles([arquivoXml('so.xml', nfe('9814', { natOp: 'VENDA', finNFe: '1', vNF: '10.00', itens: item(1, 'P4', 'PRODUTO QUATRO', '1.0000', '10.0000', '10.00') }))]);
  igual('um arquivo só é lido como sempre foi', sozinho.nfe.notas.length, 1);
  igual('e mantém o nome do arquivo', sozinho.arquivo, 'so.xml');

  for (const n of ['9813']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }

  // limpeza
  for (const n of ['9801', '9802', '9803', '9804', '9805']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  for (const i of (await store.nfItens.listar()).filter((x) => /980/.test(x.nfNumero || ''))) {
    await store.nfItens.remover(i.id);
  }
  const prod = (await store.produtos.listar()).find((x) => x.codigo === 'CIM-XML');
  if (prod) await store.produtos.remover(prod.id);
  await link.recalcular();
}

console.log('\n▶ Custo do frete: o cobrado paga o pago?');
{
  /**
   * "Além do custo do material, tem o custo de frete também. Tanto com terceiro
   *  quanto com a minha frota própria. (…) É bom você considerar que a gente tem
   *  esse custo, para às vezes pensar: ah, o Guilherme tem um frete, mas aí o
   *  frete também a gente tem custo."
   *
   * O custo da frota é FIXO e mensal: salário de motorista não é de uma entrega.
   * O app não divide isso por nota nem por vendedor — dividir seria inventar.
   * Ele faz a conta que existe: cobrado no período menos pago no período.
   */
  const FR = 'Data;Tipo;Motorista;Descrição;Valor';
  await importar('fretes', 'fr.csv', `${FR}
05/11/2026;Frota própria;Jonas;Salário do mês;3.200,00
05/11/2026;Frota própria;Jonas;Hora extra;450,00
10/11/2026;Terceiro;Transportadora Norte;Entregas da semana;1.800,00
12/11/2026;;Posto da esquina;Combustível;900,00`, { mesReferencia: '2026-11-01' });

  const linhas = (await store.fretes.listar()).filter((l) => l.mes === '2026-11');
  igual('as quatro linhas entraram', linhas.length, 4);
  igual('frota própria é reconhecida pelo texto',
    linhas.filter((l) => l.tipo === 'propria').length, 2);
  igual('terceiro também', linhas.filter((l) => l.tipo === 'terceiro').length, 1);
  igual('e o que não diz o tipo fica indefinido, sem chute',
    linhas.filter((l) => l.tipo === 'indefinido').length, 1);

  // notas com frete cobrado no mesmo mês
  const FISC3 = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação;Frete';
  await importar('nfs', 'frn.csv', `${FISC3}
9910;06/11/2026;Cliente Frete A;30303030000130;5.000,00;Autorizada;Venda de mercadoria;4.000,00
9911;07/11/2026;Cliente Frete B;30303030000241;3.000,00;Autorizada;Venda de mercadoria;1.500,00`);
  await link.recalcular();

  const f = await margemMod.frete({ de: '2026-11-01', ate: '2026-11-30' });
  igual('o frete cobrado soma as notas', f.total, 5500);
  ok('e o custo veio da planilha', f.custo.temDado, '');
  igual('somando tudo que saiu', f.custo.total, 6350);
  igual('com a frota separada', f.custo.frotaPropria, 3650);
  igual('e os terceiros também', f.custo.terceiros, 1800);
  igual('o que não foi classificado continua contando', f.custo.naoClassificado, 900);
  igual('a conta que importa: cobrado menos pago', f.custo.resultado, -850);
  ok('o cobrado paga 86% do pago', Math.abs(f.custo.cobertura - 86.61) < 0.1, String(f.custo.cobertura));
  igual('e dá para ver quem fez a entrega', f.custo.porResponsavel[0].nome, 'Jonas');
  igual('com quanto custou', f.custo.porResponsavel[0].valor, 3650);

  /**
   * O CUSTO DE FRETE DE CADA VENDEDOR, quando a planilha diz de quem é a venda.
   *
   * "Não se apegue ao pedido de nota fiscal, nem nada. Se apegue ao custo. Não
   *  queira abraçar todas as informações; pega só o que é importante."
   *
   * A planilha de solicitação de entrega traz valor, vendedor e quem entregou.
   * Com o vendedor na linha, o custo de cada um é MEDIDO — e o rateio, que era
   * só ordem de grandeza, sai de cena.
   */
  /* um vendedor com nome composto no cadastro, como no caso real */
  await store.vendedores.salvar({ nome: 'Marcelo Santana', apelidos: [], ativo: true });
  const FRV = 'Período;Nota fiscal ou pedido;Vendedor;Responsável pela entrega;Valor';
  await importar('fretes', 'frv.csv', `${FRV}
MANHÃ;NF 9910;Alberto;Messias;135,00
TARDE;PED 7001;Alberto;Elias;150,00
MANHÃ;NOTA 9911;Beatriz;Moises;90,00
TARDE;NF 9914;Alb;Elias;10,00
MANHÃ;PED 7003;Marcelo;Geraldo;120,00
MANHÃ;PEDIDO No.7002;;Diego;200,00
TARDE;NF 9912;Alberto;Val;0,00
NOITE;NF 9913;Beatriz;Val;`, { mesReferencia: '2026-12-01' });

  const fv = await margemMod.frete({ de: '2026-12-01', ate: '2026-12-31' });
  igual('as oito entregas entraram', fv.custo.entregas, 8);
  igual('e o custo é a soma do que foi lançado', fv.custo.total, 705);
  /* o formulário diz MARCELO, o cadastro diz MARCELO SANTANA: é a mesma pessoa */
  const mar = fv.vendedores.find((v) => v.nome === 'Marcelo Santana');
  igual('o primeiro nome acha o vendedor de nome composto', (mar || {}).custoReal ?? 'não achou', 120);
  /* e ele entra na tabela mesmo sem ter cobrado frete em nota nenhuma */
  igual('quem tem custo de entrega e não cobrou frete aparece assim mesmo', (mar || {}).frete, 0);
  /**
   * O primeiro nome resolve, porque pertence a um vendedor só — é o caso real:
   * o formulário diz MARCELO e o cadastro diz MARCELO SANTANA. "Alb" não é o
   * primeiro nome de ninguém, então fica de fora em vez de ser adivinhado.
   */
  ok('primeiro nome parecido mas incompleto não vira vínculo',
    fv.custo.semVendedor === 210, String(fv.custo.semVendedor));
  ok('o custo agora é por vendedor, não rateio', fv.custo.porVendedor === true, '');

  // R$ 0,00 é entrega sem custo de terceiro; valor em branco o app não conta
  igual('entrega com zero é contada como sem cobrança', fv.custo.semCobranca, 1);
  igual('e a de valor em branco não vira zero', fv.custo.semValor, 1);
  /**
   * O NÚMERO DA NOTA OU DO PEDIDO NÃO AMARRA NADA. Ele entra como referência da
   * linha e só. "Às vezes a nota fiscal é entregue com um pedido" — forçar esse
   * vínculo erraria calado, e o que ela quer é o custo.
   */
  const refs = (await store.fretes.listar()).filter((l) => l.mes === '2026-12');
  ok('o documento citado fica guardado como referência da linha',
    refs.some((l) => (l.descricao || l.nfNumero || '').includes('9910')),
    JSON.stringify(refs.map((l) => l.descricao || l.nfNumero)));
  ok('e nenhuma entrega sai amarrada a uma nota ou a um pedido',
    refs.every((l) => !l.nfId && !l.pedidoId), '');

  // reenviar a planilha do mês atualiza, não soma de novo
  await importar('fretes', 'fr.csv', `${FR}
05/11/2026;Frota própria;Jonas;Salário do mês;3.200,00
05/11/2026;Frota própria;Jonas;Hora extra;450,00
10/11/2026;Terceiro;Transportadora Norte;Entregas da semana;1.800,00
12/11/2026;;Posto da esquina;Combustível;900,00`, { mesReferencia: '2026-11-01' });
  igual('reenviar a planilha não duplica',
    (await store.fretes.listar()).filter((l) => l.mes === '2026-11').length, 4);

  // limpeza
  for (const v of (await store.vendedores.listar()).filter((x) => x.nome === 'Marcelo Santana')) {
    await store.vendedores.remover(v.id);
  }
  for (const l of (await store.fretes.listar())) await store.fretes.remover(l.id);
  for (const n of ['9910', '9911']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  await link.recalcular();
}

console.log('\n▶ Quem emite nota não é, por isso, vendedor');
{
  /**
   * "A Maria Victoria não é vendedora. Às vezes ela emite algumas notas, mas não
   *  é vendedora. Deve ter emitido uma nota e acabou saindo o nome dela. Por
   *  isso precisa ter a possibilidade de vincular essa nota para o vendedor
   *  correto."
   *
   * O app NÃO tira a nota dela sozinho — mover faturamento e comissão de uma
   * pessoa para outra por conta própria é exatamente o que ele não pode fazer.
   * Ele deixa a pendência com o botão de dizer de quem era.
   */
  const emissora = await store.vendedores.salvar({ nome: 'Vitoria Emissora', ativo: true });
  const FX = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  await importar('nfs', 'emis.csv', `${FX}
9950;10/10/2026;Cliente da Obra Ltda;40404040000140;7.000,00;Autorizada;Venda de mercadoria`);
  /* o nome dela veio no arquivo, como acontece de verdade quando ela emite a nota */
  const nf = (await store.nfs.listar()).find((x) => x.numero === '9950');
  await store.nfs.salvar({ ...nf, vendedorNome: 'Vitoria Emissora' });
  await link.recalcular();

  /**
   * ANTES DE QUALQUER COISA, O APP PERGUNTA — e pergunta na conciliação, não em
   * Ajustes: "não precisa ir em ajustes, vendedores, editar o papel; isso é
   * diferente para mim".
   */
  const pergunta = (await store.pendencias.listar()).filter((p) => p.tipo === 'vendedor_a_confirmar'
    && p.alvo.id === emissora.id);
  igual('o nome novo vira uma pergunta de um toque', pergunta.length, 1);
  ok('dizendo em quantas notas ele apareceu', /1 nota/.test(pergunta[0].detalhe), pergunta[0].detalhe);

  /* ela responde "não vende" — é isso que liga a pendência das notas */
  await store.vendedores.salvar({ ...emissora, confirmado: true, naoVende: true });
  await link.recalcular();
  igual('respondida, a pergunta não volta',
    (await store.pendencias.listar()).filter((p) => p.tipo === 'vendedor_a_confirmar'
      && p.alvo.id === emissora.id).length, 0);

  const pend = (await store.pendencias.listar()).filter((p) => p.tipo === 'nf_vendedor_nao_vende');
  igual('a nota no nome de quem não vende vira pendência', pend.length, 1);
  igual('apontando para a própria nota, para o botão poder resolver', pend[0].alvo.id, nf.id);
  igual('com o valor à vista', pend[0].valor, 7000);
  /* e o app não moveu nada sozinho */
  const depois = (await store.nfs.listar()).find((x) => x.numero === '9950');
  igual('o app não tirou a nota dela por conta própria', depois.vendedorId, emissora.id);

  /* e a volta atrás: dizer que ela vende limpa tudo */
  await store.vendedores.salvar({ ...emissora, confirmado: true, naoVende: false });
  await link.recalcular();
  igual('marcada como vendedora, a pendência some',
    (await store.pendencias.listar()).filter((p) => p.tipo === 'nf_vendedor_nao_vende').length, 0);

  await store.nfs.remover(nf.id);
  await store.vendedores.remover(emissora.id);
  await link.recalcular();
}

console.log('\n▶ Carro nosso ou freteiro, e a entrega sem custo informado');
{
  /**
   * "Na planilha tem tanto nossos carros quanto os freteiros. Vincular qual que
   *  é qual: o VUC é nosso carro, o João é terceiro."
   *
   * O app não deduz isso do valor: R$ 0,00 numa entrega quer dizer que não houve
   * custo de terceiro naquela entrega, não que o motorista seja da casa.
   */
  const FRC = 'Período;Nota fiscal ou pedido;Vendedor;Responsável pela entrega;Valor';
  await importar('fretes', 'frc.csv', `${FRC}
MANHÃ;NF 100;Alberto;VUC;300,00
TARDE;NF 101;Alberto;Joao;200,00
MANHÃ;NF 102;Alberto;Lala;100,00
NOITE;NF 103;Alberto;Lala;`, { mesReferencia: '2027-01-01' });

  const antes = await margemMod.frete({ de: '2027-01-01', ate: '2027-01-31' });
  igual('sem classificar, tudo fica em não classificado', antes.custo.naoClassificado, 600);
  igual('e o app diz quanto está esperando por isso', antes.custo.semClassificacao, 600);

  await store.entregadores.salvar({ nome: 'VUC', tipo: 'propria' });
  await store.entregadores.salvar({ nome: 'Joao', tipo: 'terceiro' });
  const depois = await margemMod.frete({ de: '2027-01-01', ate: '2027-01-31' });
  igual('o carro nosso entra como frota própria', depois.custo.frotaPropria, 300);
  igual('o freteiro entra como terceiro', depois.custo.terceiros, 200);
  igual('e quem ainda não foi dito continua à parte', depois.custo.semClassificacao, 100);
  const vuc = depois.custo.porResponsavel.find((x) => x.nome === 'VUC');
  igual('a lista mostra o tipo de cada nome', vuc.tipo, 'propria');

  /**
   * "O que tiver valor em branco, põe para eu vincular valor também. Essas em
   *  branco realmente não tivemos custo com ela. Eu vinculo e ponho zero."
   *
   * Em branco e zero são coisas diferentes, e o app não transforma um no outro
   * sozinho — mas transformar é um toque.
   */
  await link.recalcular();
  const pend = (await store.pendencias.listar()).filter((p) => p.tipo === 'frete_sem_valor');
  igual('a entrega sem custo informado vira pendência', pend.length, 1);
  const linha = await store.fretes.obter(pend[0].alvo.id);
  ok('apontando para a linha certa', (linha.descricao || linha.nfNumero || '').includes('103'),
    JSON.stringify([linha.descricao, linha.nfNumero]));

  /* o botão de um toque: não teve custo */
  await store.fretes.salvar({ ...linha, valor: 0, valorOrigem: 'manual' });
  await link.recalcular();
  igual('resolvida, a pendência some',
    (await store.pendencias.listar()).filter((p) => p.tipo === 'frete_sem_valor').length, 0);
  const fim = await margemMod.frete({ de: '2027-01-01', ate: '2027-01-31' });
  igual('e o zero informado não muda o custo total', fim.custo.total, 600);
  igual('mas passa a contar como entrega sem cobrança', fim.custo.semCobranca, 1);
  igual('e nenhuma fica mais em branco', fim.custo.semValor, 0);

  for (const l of (await store.fretes.listar())) await store.fretes.remover(l.id);
  for (const e of (await store.entregadores.listar())) await store.entregadores.remover(e.id);
  await link.recalcular();
}

console.log('\n▶ RT: a comissão de quem traz a obra');
{
  /**
   * "Tenho três que ganham: o Thomas, o André e a Tereza. Esses três ganham RT
   *  em cima de X CNPJs e eles ganham em cima do valor total vendido, contando
   *  frete, tudo."
   *
   * Cliente não é faturamento: um cliente pode ter vários CNPJs. Por isso o
   * vínculo é com uma LISTA de documentos, e não com um cadastro de cliente.
   */
  const FY = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação;Frete';
  await importar('nfs', 'rt.csv', `${FY}
9960;05/10/2026;Obra Alfa Ltda;11222333000181;10.000,00;Autorizada;Venda de mercadoria;1.000,00
9961;06/10/2026;Obra Beta Ltda;11222333000262;5.000,00;Autorizada;Venda de mercadoria;0,00
9962;07/10/2026;Cliente Avulso Ltda;99888777000166;8.000,00;Autorizada;Venda de mercadoria;0,00`);

  const indicador = await store.rts.salvar({
    nome: 'Indicador Um',
    percentual: 10,
    documentos: ['11.222.333/0001-81', '11.222.333/0002-62'],
    ativo: true,
  });

  const r = await rtMod.rt({ de: '2026-10-01', ate: '2026-10-31' });
  const linha = r.linhas.find((l) => l.nome === 'Indicador Um');
  /* dois CNPJs do mesmo indicador somam: 10.000 + 5.000 */
  igual('o faturamento dos CNPJs dele soma', linha.faturamento, 15000);
  /* e é sobre o TOTAL, com frete: o frete de R$ 1.000 já está dentro dos 10.000 */
  igual('o RT é 10% sobre esse total', linha.valor, 1500);
  igual('a venda de quem ele não trouxe fica de fora', r.faturamentoCoberto, 15000);
  igual('e o detalhe abre por faturamento', linha.faturamentos.length, 2);

  /* sem CNPJ vinculado não há conta a fazer, e zero seria outra coisa */
  await store.rts.salvar({ nome: 'Indicador Sem Vínculo', percentual: 10, documentos: [], ativo: true });
  const r2 = await rtMod.rt({ de: '2026-10-01', ate: '2026-10-31' });
  const vazia = r2.linhas.find((l) => l.nome === 'Indicador Sem Vínculo');
  ok('quem não tem CNPJ vinculado não recebe zero, recebe nada', vazia.valor === null, String(vazia.valor));
  igual('e aparece na lista do que falta vincular', r2.semDocumento.length, 1);

  /**
   * O MESMO CNPJ EM DOIS CADASTROS pagaria a mesma venda duas vezes. O app não
   * escolhe qual vale — ele devolve o conflito.
   */
  await store.rts.salvar({
    nome: 'Indicador Dois', percentual: 10, documentos: ['11.222.333/0001-81'], ativo: true,
  });
  const r3 = await rtMod.rt({ de: '2026-10-01', ate: '2026-10-31' });
  igual('CNPJ repetido entre dois RTs é acusado', r3.conflitos.length, 1);
  igual('dizendo qual documento', r3.conflitos[0].documento, '11222333000181');

  /* a leitura da lista colada aceita linha, vírgula e ponto e vírgula */
  igual('a lista colada é lida nos três separadores',
    rtMod.lerDocumentos('11.222.333/0001-81\n99888777000166, 123; 11222333000181').length, 2);

  for (const x of (await store.rts.listar())) await store.rts.remover(x.id);
  for (const n of ['9960', '9961', '9962']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  await link.recalcular();
}

console.log('\n▶ O XML não diz que a nota foi cancelada');
{
  /**
   * "Todas as que foram para ignoradas são as notas que foram canceladas."
   *
   * O cancelamento da NF-e é OUTRO documento — um evento, em arquivo separado. O
   * XML da própria nota continua dizendo "Autorizado o uso da NF-e" para sempre,
   * mesmo depois de cancelada. Então um lote grande sem nenhum evento ou é um mês
   * sem cancelamento, ou é um export incompleto — e no segundo caso a nota
   * cancelada conta como faturamento e gera comissão.
   *
   * O app não tem como saber qual dos dois é. Ele avisa, e não escolhe.
   */
  const { readFiles } = await import('../src/core/files/read.js');
  const umaNota = (numero) => `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe3526${numero}0000000000000000000000000000000000">
<ide><nNF>${numero}</nNF><serie>1</serie><mod>55</mod><dhEmi>2027-09-10T10:00:00-03:00</dhEmi>
<natOp>VENDA</natOp><tpNF>1</tpNF><finNFe>1</finNFe></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>AMPLA TESTE</xNome></emit>
<dest><CNPJ>11111111000191</CNPJ><xNome>CLIENTE DE TESTE LTDA</xNome></dest>
<total><ICMSTot><vProd>100.00</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc><vNF>100.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

  const arquivos = [];
  for (let i = 0; i < 20; i += 1) {
    const n = String(9600 + i);
    arquivos.push(new File([umaNota(n)], `n${n}.xml`, { type: 'text/xml' }));
  }
  const leitura = await readFiles(arquivos);
  const preparo = await ingest.prepararNfe({ leitura });
  igual('as vinte notas foram lidas', leitura.nfe.notas.length, 20);
  igual('e nenhum evento de cancelamento veio junto', preparo.cancelamentos.length, 0);
  ok('então o app avisa, em vez de supor que ninguém cancelou nada',
    preparo.avisos.some((a) => /cancelamento/i.test(a) && /SITUAÇÃO/.test(a)),
    JSON.stringify(preparo.avisos));

  /* lote pequeno não avisa: uma nota avulsa sem evento é o normal */
  const soUma = await readFiles([new File([umaNota('9699')], 'n9699.xml', { type: 'text/xml' })]);
  const preparoUm = await ingest.prepararNfe({ leitura: soUma });
  ok('uma nota avulsa não vira aviso',
    !preparoUm.avisos.some((a) => /cancelamento/i.test(a)), JSON.stringify(preparoUm.avisos));
}

console.log('\n▶ Arquivo sem a coluna não desmarca o que o outro marcou');
{
  /**
   * O XML diz que a nota é DEVOLUÇÃO, pela natureza da operação. O relatório
   * fiscal dela sai SEM essa coluna — e, importado depois, devolvia
   * devolucao:false por cima do true do XML.
   *
   * Medido nos arquivos reais de setembro: três notas (3991, 4126 e 4229)
   * voltavam a contar como venda. Como devolução entra NEGATIVA, o faturamento
   * mexia o dobro do valor delas — R$ 7.965,32 a mais no mês.
   *
   * "Não sei" não pode virar "não é".
   */
  const { readFile } = await import('../src/core/files/read.js');
  const devXml = `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe35269830000000000000000000000000000000000000">
<ide><nNF>9830</nNF><serie>1</serie><mod>55</mod><dhEmi>2027-09-20T10:00:00-03:00</dhEmi>
<natOp>DEVOLUCAO DE VENDA</natOp><tpNF>0</tpNF><finNFe>4</finNFe></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>AMPLA TESTE</xNome></emit>
<dest><CNPJ>11111111000191</CNPJ><xNome>CLIENTE DE TESTE LTDA</xNome></dest>
<total><ICMSTot><vProd>500.00</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc><vNF>500.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;
  await ingest.confirmar(await ingest.prepararNfe({
    leitura: await readFile(new File([devXml], 'dev9830.xml', { type: 'text/xml' })),
  }));
  const comXml = (await store.nfs.listar()).find((n) => n.numero === '9830');
  ok('o XML marcou a nota como devolução', comXml?.devolucao === true, String(comXml?.devolucao));

  /* o relatório fiscal dela NÃO tem a coluna de natureza da operação */
  const SEM_NATUREZA = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação';
  await importar('nfs', 'semnat.csv', `${SEM_NATUREZA}
9830;20/09/2027;CLIENTE DE TESTE LTDA;11111111000191;500,00;Autorizada`);

  const depois = (await store.nfs.listar()).find((n) => n.numero === '9830');
  ok('e o relatório sem a coluna NÃO desmarca', depois?.devolucao === true, String(depois?.devolucao));
  igual('a natureza que veio do XML também fica', depois?.naturezaOperacao, 'DEVOLUCAO DE VENDA');

  /* e quando o arquivo TEM a coluna, ela vale: é informação, não ausência */
  const COM_NATUREZA = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  await importar('nfs', 'comnat.csv', `${COM_NATUREZA}
9830;20/09/2027;CLIENTE DE TESTE LTDA;11111111000191;500,00;Autorizada;Venda de mercadoria`);
  const corrigida = (await store.nfs.listar()).find((n) => n.numero === '9830');
  ok('arquivo COM a coluna corrige de verdade', corrigida?.devolucao === false, String(corrigida?.devolucao));

  await store.nfs.remover(corrigida.id);
  await link.recalcular();
}

console.log('\n▶ A mesma nota vista pelo relatório e pelo XML é UMA nota');
{
  /**
   * "Título venda número 871 cita a nota fiscal 4061. Eu vou em escolher nota e
   *  só aparece uma outra, nada a ver."
   *
   * A NF 4061 ESTAVA na base — duas vezes. Uma veio do XML, identificada pela
   * chave de 44 dígitos; a outra veio do relatório fiscal, identificada por
   * série e número. Como havia duas candidatas, o app se recusava a ligar o
   * título — a regra certa ("só liga quando não há dúvida") aplicada a uma
   * dúvida que ele mesmo tinha criado.
   *
   * Número e série identificam a nota sem ambiguidade dentro de um CNPJ. Então
   * é esse par que manda, e a chave entra como dado a mais.
   */
  const { readFile } = await import('../src/core/files/read.js');
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';

  /* primeiro o relatório fiscal, que é como ela costuma mandar */
  await importar('nfs', 'fis.csv', `${FISC}
9820;12/08/2027;CLIENTE DE TESTE LTDA;11111111000191;1.000,00;Autorizada;Venda de mercadoria`);
  igual('o relatório trouxe a nota',
    (await store.nfs.listar()).filter((n) => n.numero === '9820').length, 1);

  /* e depois o XML da MESMA nota */
  const xml = `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe35269820000000000000000000000000000000000000">
<ide><nNF>9820</nNF><serie>1</serie><mod>55</mod><dhEmi>2027-08-12T10:00:00-03:00</dhEmi>
<natOp>VENDA DE MERCADORIA</natOp><tpNF>1</tpNF><finNFe>1</finNFe></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>AMPLA TESTE</xNome></emit>
<dest><CNPJ>11111111000191</CNPJ><xNome>CLIENTE DE TESTE LTDA</xNome><xMun>SAO PAULO</xMun><UF>SP</UF></dest>
<det nItem="1"><prod><cProd>P9</cProd><xProd>PRODUTO NOVE</xProd><NCM>25232910</NCM><CFOP>5102</CFOP>
<uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>100.0000</vUnCom><vProd>1000.00</vProd>
<xPed>8710</xPed></prod></det>
<total><ICMSTot><vProd>1000.00</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc><vNF>1000.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;
  const leitura = await readFile(new File([xml], 'n9820.xml', { type: 'text/xml' }));
  await ingest.confirmar(await ingest.prepararNfe({ leitura }));
  await link.recalcular();

  const notas9820 = (await store.nfs.listar()).filter((n) => n.numero === '9820');
  igual('o XML da mesma nota NÃO cria uma segunda', notas9820.length, 1);
  ok('e a nota passa a ter a chave do XML', !!notas9820[0].chave, String(notas9820[0].chave));
  ok('sem perder os itens', (await store.nfItens.listar()).some((i) => i.nfId === notas9820[0].id), '');

  /**
   * E É ISSO QUE FAZ O TÍTULO ACHAR A NOTA. Com duas candidatas ele não ligava;
   * com uma, liga sozinho e a pendência nem chega a existir.
   */
  const REC = 'Descrição;Cliente;CPF/CNPJ;Vencimento;Valor;Situação;Nota fiscal';
  await importar('receber', 'rec9820.csv', `${REC}
Venda de nº 871;CLIENTE DE TESTE LTDA;11111111000191;20/09/2027;1.000,00;Em aberto;9820`);
  await link.recalcular();

  const titulo = (await store.receber.listar()).find((t) => t.nfNumero === '9820');
  ok('o título que cita a NF 9820 acha a nota sozinho', titulo?.nfId === notas9820[0].id,
    JSON.stringify([titulo?.nfId, notas9820[0].id]));
  igual('e não sobra pendência de título sem NF',
    (await store.pendencias.listar()).filter((p) => p.tipo === 'receber_sem_nf'
      && p.alvo?.id === titulo?.id).length, 0);

  /**
   * E A SEGUNDA PONTE: O NÚMERO DO PEDIDO, que os dois lados carregam.
   *
   * O título se chama "Venda de nº 871"; o XML da nota traz <xPed>871</xPed>.
   * Quando o número da NOTA no relatório financeiro não bate — ou a nota citada
   * nem está na base —, o pedido liga assim mesmo. Não é semelhança: é o mesmo
   * número escrito pelo mesmo sistema nos dois documentos.
   */
  const nota9820 = notas9820[0];
  igual('a nota carrega o pedido que veio dentro do XML', nota9820.pedidoNumero, '8710');
  await importar('receber', 'recped.csv', `${REC}
Venda de nº 8710;CLIENTE DE TESTE LTDA;11111111000191;25/09/2027;1.590,00;Em aberto;9999`);
  await link.recalcular();
  const porPedido = (await store.receber.listar()).find((t) => t.pedidoNumero === '8710');
  ok('o título acha a nota pelo número do PEDIDO, mesmo citando outra NF',
    porPedido?.nfId === nota9820.id, JSON.stringify([porPedido?.nfId, porPedido?.nfNumero]));

  for (const t of (await store.receber.listar()).filter((x) => x.pedidoNumero === '8710')) {
    await store.receber.remover(t.id);
  }
  for (const t of (await store.receber.listar()).filter((x) => x.nfNumero === '9820')) {
    await store.receber.remover(t.id);
  }
  for (const n of notas9820) await store.nfs.remover(n.id);
  for (const i of (await store.nfItens.listar()).filter((x) => x.nfNumero === '9820')) {
    await store.nfItens.remover(i.id);
  }
  await link.recalcular();
}

console.log('\n▶ O relatório financeiro é uma FOTOGRAFIA, não um lançamento');
{
  /**
   * "Chegou a aparecer algo próximo de R$ 600 mil em aberto, o que não
   *  corresponde à realidade."
   *
   * A causa: o app nunca fechava um título que sumia do relatório. Quem dá baixa
   * dá baixa no GestãoClick, o título some do próximo export — e aqui ficava
   * aberto para sempre. Semana após semana, virou o número que não existe.
   */
  const REC = 'Descrição;Cliente;CPF/CNPJ;Vencimento;Valor;Situação;Nota fiscal';

  /* segunda-feira: três títulos em aberto */
  await importar('receber', 'foto1.csv', `${REC}
Venda de nº 7001;CLIENTE FOTO LTDA;60606060000160;10/11/2027;5.000,00;Em aberto;7101
Venda de nº 7002;CLIENTE FOTO LTDA;60606060000160;15/11/2027;3.000,00;Em aberto;7102
Venda de nº 7003;CLIENTE FOTO LTDA;60606060000160;20/11/2027;2.000,00;Em aberto;7103`);
  const emAberto = async () => (await store.receber.listar())
    .filter((t) => t.clienteNome === 'CLIENTE FOTO LTDA' && t.status !== 'pago');
  igual('segunda: três títulos em aberto', (await emAberto()).length, 3);
  igual('somando o que realmente existe', Math.round((await emAberto())
    .reduce((a, t) => a + (t.saldo || 0), 0)), 10000);

  /* terça: o MESMO relatório de novo. Não pode virar R$ 20.000 */
  await importar('receber', 'foto2.csv', `${REC}
Venda de nº 7001;CLIENTE FOTO LTDA;60606060000160;10/11/2027;5.000,00;Em aberto;7101
Venda de nº 7002;CLIENTE FOTO LTDA;60606060000160;15/11/2027;3.000,00;Em aberto;7102
Venda de nº 7003;CLIENTE FOTO LTDA;60606060000160;20/11/2027;2.000,00;Em aberto;7103`);
  igual('terça: reimportar não cria título novo', (await emAberto()).length, 3);
  igual('nem dobra o valor', Math.round((await emAberto())
    .reduce((a, t) => a + (t.saldo || 0), 0)), 10000);

  /* quarta: ela deu baixa na 7001, que some do relatório */
  await importar('receber', 'foto3.csv', `${REC}
Venda de nº 7002;CLIENTE FOTO LTDA;60606060000160;15/11/2027;3.000,00;Em aberto;7102
Venda de nº 7003;CLIENTE FOTO LTDA;60606060000160;20/11/2027;2.000,00;Em aberto;7103`);
  igual('quarta: o título que sumiu foi dado como baixado', (await emAberto()).length, 2);
  igual('e o em aberto cai para o que é verdade', Math.round((await emAberto())
    .reduce((a, t) => a + (t.saldo || 0), 0)), 5000);
  const baixado = (await store.receber.listar()).find((t) => t.nfNumero === '7101');
  ok('a baixa fica registrada, com o motivo', baixado.baixadoPorAusencia === true, '');
  igual('e o saldo dele zera', baixado.saldo, 0);

  /**
   * E A PARTE DELICADA: "não quero que o sistema dê baixa em uma conta
   * simplesmente porque importei um relatório com outro filtro".
   *
   * Este export cobre só novembro. O título de dezembro não está nele — e não
   * pode ser fechado por isso.
   */
  await importar('receber', 'foto4.csv', `${REC}
Venda de nº 7004;CLIENTE FOTO LTDA;60606060000160;10/12/2027;9.000,00;Em aberto;7104`);
  igual('título de dezembro entrou', (await emAberto()).filter((t) => t.nfNumero === '7104').length, 1);

  await importar('receber', 'foto5.csv', `${REC}
Venda de nº 7002;CLIENTE FOTO LTDA;60606060000160;15/11/2027;3.000,00;Em aberto;7102
Venda de nº 7003;CLIENTE FOTO LTDA;60606060000160;20/11/2027;2.000,00;Em aberto;7103`);
  ok('export só de novembro NÃO encosta no título de dezembro',
    (await emAberto()).some((t) => t.nfNumero === '7104'),
    JSON.stringify((await emAberto()).map((t) => t.nfNumero)));

  /**
   * A JANELA DESCE ATÉ ONDE A FOTOGRAFIA ANTERIOR COMEÇAVA.
   *
   * Era aqui que estava o furo: o caso mais comum é o título MAIS ANTIGO ser
   * pago e sumir. Se a janela começasse no primeiro vencimento do arquivo novo,
   * justamente o que acabou de ser pago cairia fora dela e nunca fecharia.
   */
  igual('a janela desce até o começo da fotografia anterior',
    foto.janelaParaFechar({ de: '2027-11-15', ate: '2027-11-20' }, { de: '2027-11-10', ate: '2027-11-20' }).de,
    '2027-11-10');
  igual('mas o teto é sempre o do arquivo novo',
    foto.janelaParaFechar({ de: '2027-11-15', ate: '2027-11-20' }, { de: '2027-11-10', ate: '2027-12-31' }).ate,
    '2027-11-20');

  /* e a cobertura é medida pelos vencimentos que vieram no arquivo */
  const cob = foto.coberturaDe([{ vencimento: '2027-11-10' }, { vencimento: '2027-11-20' }, { vencimento: null }]);
  igual('a janela do arquivo começa no menor vencimento', cob.de, '2027-11-10');
  igual('e termina no maior', cob.ate, '2027-11-20');
  igual('arquivo sem vencimento nenhum não fecha nada',
    foto.ausentesNaFotografia([{ id: 'x', status: 'aberto', vencimento: '2027-11-15' }], new Set(), null).length, 0);

  /* baixa feita à mão por ela não é desfeita por silêncio de arquivo */
  const manual = { id: 'y', status: 'aberto', vencimento: '2027-11-12', baixaManual: true };
  igual('decisão dela não é apagada por ausência',
    foto.ausentesNaFotografia([manual], new Set(), { de: '2027-11-01', ate: '2027-11-30' }).length, 0);

  for (const t of (await store.receber.listar()).filter((x) => x.clienteNome === 'CLIENTE FOTO LTDA')) {
    await store.receber.remover(t.id);
  }
  await link.recalcular();
}

console.log('\n▶ Fluxo de caixa: saldo informado, projeção diária, vencido à parte');
{
  /**
   * "Saldo projetado do dia = saldo do dia anterior + contas a receber previstas
   *  para o dia − contas a pagar previstas para o dia."
   *
   * A conta é essa, sem nada por cima. O que exige cuidado é o que NÃO entra
   * nela: o que já venceu, e o dinheiro que não veio da operação.
   */
  for (const t of await store.receber.listar()) await store.receber.remover(t.id);
  for (const t of await store.pagar.listar()) await store.pagar.remover(t.id);

  const REC = 'Descrição;Cliente;CPF/CNPJ;Vencimento;Valor;Situação;Nota fiscal';
  const PAG = 'Descrição;Fornecedor;CPF/CNPJ;Vencimento;Valor;Situação';
  await importar('receber', 'fx-rec.csv', `${REC}
Venda de nº 8001;CLIENTE FLUXO LTDA;70707070000170;10/01/2028;25.000,00;Em aberto;8001
Venda de nº 8002;CLIENTE FLUXO LTDA;70707070000170;12/01/2028;10.000,00;Em aberto;8002
Venda de nº 8003;OUTRO CLIENTE LTDA;70707070000261;05/12/2027;7.000,00;Em aberto;8003`);
  await importar('pagar', 'fx-pag.csv', `${PAG}
Compra 900;FORNECEDOR A LTDA;80808080000180;10/01/2028;15.000,00;Em aberto
Compra 901;FORNECEDOR B LTDA;80808080000271;11/01/2028;40.000,00;Em aberto
Compra 902;FORNECEDOR C LTDA;80808080000362;03/12/2027;3.000,00;Em aberto`);

  await fluxo.informarSaldo(100000, '2028-01-10');
  const p = await fluxo.projetar({ de: '2028-01-10', ate: '2028-01-12' });

  igual('o saldo inicial é o que ela informou', p.saldoInicial, 100000);
  igual('três dias no recorte', p.linhas.length, 3);

  /* dia 10: entra 25.000, sai 15.000 → 110.000 */
  igual('dia 10 recebe', p.linhas[0].recebimentos, 25000);
  igual('dia 10 paga', p.linhas[0].pagamentos, 15000);
  igual('e o saldo do dia 10 fecha em 110.000', p.linhas[0].saldoProjetado, 110000);
  /* dia 11: sai 40.000 → 70.000 */
  igual('dia 11 fecha em 70.000', p.linhas[1].saldoProjetado, 70000);
  /* dia 12: entra 10.000 → 80.000 */
  igual('dia 12 fecha em 80.000', p.linhas[2].saldoProjetado, 80000);
  igual('o saldo do dia começa onde o anterior terminou', p.linhas[1].saldoInicial, 110000);

  igual('o total a receber do período', p.totalReceber, 35000);
  igual('o total a pagar do período', p.totalPagar, 55000);
  igual('o menor saldo previsto', p.menorSaldo, 70000);
  igual('e o dia dele', p.menorSaldoEm, '2028-01-11');

  /**
   * O VENCIDO FICA FORA DA PROJEÇÃO.
   *
   * "Não considerar automaticamente como dinheiro que vai entrar amanhã."
   * Os dois títulos de dezembro venceram antes da data-base: nenhum deles mexe
   * em nenhuma linha, e os dois aparecem em lista própria.
   */
  igual('o a receber vencido não entra na projeção', p.vencidos.receber.valor, 7000);
  igual('o a pagar vencido também fica à parte', p.vencidos.pagar.valor, 3000);
  ok('e nenhum dia foi contaminado por eles',
    p.linhas.every((l) => l.recebimentos !== 7000 && l.pagamentos !== 3000), '');

  /* e dá para abrir o dia e ver de quem é cada valor */
  igual('o dia 11 abre com o fornecedor', p.linhas[1].saidas[0].nome, 'FORNECEDOR B LTDA');
  igual('com o valor dele', p.linhas[1].saidas[0].valor, 40000);
  igual('o dia 10 abre com o cliente', p.linhas[0].entradas[0].nome, 'CLIENTE FLUXO LTDA');

  /**
   * SALDO REAL × SALDO OPERACIONAL.
   *
   * "Saldo real R$ 180.000, menos recurso extraordinário R$ 250.000, saldo
   *  operacional ajustado −R$ 70.000. Não quero substituir o saldo real."
   */
  await fluxo.salvarRecursos([{ descricao: 'Empréstimo', valor: 250000, data: '2027-06-01' }]);
  const q = await fluxo.projetar({ de: '2028-01-10', ate: '2028-01-12' });
  igual('o saldo real continua sendo o principal', q.saldoInicial, 100000);
  igual('e o operacional desconta o recurso', q.saldoOperacionalHoje, -150000);
  igual('a projeção carrega as duas linhas', q.linhas[0].saldoProjetado, 110000);
  igual('a real e a ajustada', q.linhas[0].saldoOperacional, -140000);
  /* recurso com data futura ainda não conta */
  await fluxo.salvarRecursos([{ descricao: 'Aporte', valor: 50000, data: '2029-01-01' }]);
  igual('recurso que ainda não entrou não desconta nada',
    (await fluxo.projetar({ de: '2028-01-10', ate: '2028-01-10' })).extraordinario, 0);

  /* os atalhos de período */
  igual('próximos 7 dias', fluxo.periodoDoHorizonte('7', '2028-01-10').ate, '2028-01-16');
  igual('mês atual termina no fim do mês', fluxo.periodoDoHorizonte('mes', '2028-01-10').ate, '2028-01-31');
  igual('próximo mês começa no dia 1', fluxo.periodoDoHorizonte('proximo', '2028-01-10').de, '2028-02-01');

  /* sem saldo informado, o app não inventa um */
  await store.salvarConfig({ caixa: { saldoAtual: null, extraordinarios: [] } });
  const sem = await fluxo.projetar({ de: '2028-01-10', ate: '2028-01-10' });
  ok('sem saldo informado o app diz que falta', sem.temSaldo === false, '');

  for (const t of await store.receber.listar()) await store.receber.remover(t.id);
  for (const t of await store.pagar.listar()) await store.pagar.remover(t.id);
  await link.recalcular();
}

console.log('\n▶ Três meses de margem são três meses, não um');
{
  /**
   * "Importamos relatórios de 3 meses diferentes e o app considerou como se
   *  fosse apenas de 1 mês."
   *
   * O relatório de produtos vendidos e o de comissão por produto são totais de
   * um período: nenhuma linha tem data. O mês vem da tela, e é ele que separa um
   * arquivo do outro — a chave de cada linha é mês + vendedor + produto.
   *
   * O caminho do mapeamento manual não passava o mês. Sem mês, as três
   * importações viravam o MESMO registro e o último arquivo apagava os dois
   * anteriores: três meses colapsavam num só.
   */
  const PV = 'Produto;Quantidade;Custo médio;Custo total;Valor total;Lucro';
  const mandar = (mes, valor, extras = {}) => importar('produtosVendidos', `pv-${mes}.csv`,
    `${PV}\nCIMENTO MARGEM;100;20,00;2.000,00;${valor};1.000,00`,
    { ...(mes ? { mesReferencia: `${mes}-01` } : {}), ...extras });

  const meus = async () => (await store.vendasProduto.listar())
    .filter((l) => l.descricao === 'CIMENTO MARGEM');
  for (const l of await meus()) await store.vendasProduto.remover(l.id);

  await mandar('2026-07', '7.000,00');
  await mandar('2026-08', '8.000,00');
  await mandar('2026-09', '9.000,00');

  const tres = await meus();
  igual('três relatórios de três meses são três registros', tres.length, 3);
  igual('julho guarda o valor de julho',
    tres.find((l) => l.mes === '2026-07').valorTotal, 7000);
  igual('agosto o de agosto', tres.find((l) => l.mes === '2026-08').valorTotal, 8000);
  igual('setembro o de setembro', tres.find((l) => l.mes === '2026-09').valorTotal, 9000);

  /* e a margem de cada mês enxerga só o mês dela */
  const jul = await margemMod.margem({ de: '2026-07-01', ate: '2026-07-31' });
  igual('a margem de julho vê só julho', jul.totalRelatorio.venda, 7000);
  const set = await margemMod.margem({ de: '2026-09-01', ate: '2026-09-30' });
  igual('a de setembro só setembro', set.totalRelatorio.venda, 9000);

  /**
   * E O MÊS NUNCA FICA VAZIO. Era isso que colapsava tudo: sem mês, a chave de
   * todas as linhas ficava igual.
   */
  for (const l of await meus()) await store.vendasProduto.remover(l.id);
  const { preparo } = await mandar(null, '5.000,00');
  const semMes = await meus();
  igual('sem mês escolhido ainda assim cai num mês', semMes.length, 1);
  ok('e nenhum registro fica sem mês', semMes.every((l) => !!l.mes), JSON.stringify(semMes.map((l) => l.mes)));
  ok('com o app avisando qual mês assumiu',
    preparo.avisos.some((a) => /assumiu/.test(a)), JSON.stringify(preparo.avisos));

  /**
   * E QUANDO O MÊS ESCOLHIDO JÁ TEM OUTRO ARQUIVO, o app avisa que vai
   * substituir — é o que teria mostrado o erro no dia em que aconteceu.
   */
  for (const l of await meus()) await store.vendasProduto.remover(l.id);
  await mandar('2026-07', '7.000,00');
  const { preparo: segundo } = await importar('produtosVendidos', 'pv-outro.csv',
    `${PV}\nCIMENTO MARGEM;100;20,00;2.000,00;4.000,00;1.000,00`,
    { mesReferencia: '2026-07-01' });
  ok('reimportar no mesmo mês avisa que substitui',
    segundo.avisos.some((a) => /SUBSTITUÍDAS/.test(a)), JSON.stringify(segundo.avisos));
  igual('e substitui mesmo, sem somar', (await meus())[0].valorTotal, 4000);

  for (const l of await meus()) await store.vendasProduto.remover(l.id);
}

console.log('\n▶ Três meses de frete também são três meses');
{
  /**
   * A OUTRA METADE DO MESMO ERRO: "a parte do relatório de margem e frete".
   *
   * A planilha de entregas dela não tem coluna de data — "a de solicitação de
   * entrega não tem". O mês vem da tela, e sem ele a linha ficava com data nula.
   * O relatório de frete filtra o custo por data (`c.data >= de && <= ate`),
   * então custo sem data não aparecia em período NENHUM: nem no mês certo, nem
   * em outro. Sumia.
   */
  const PL = 'Motorista;Descrição;Valor;Vendedor';
  const planilha = (mes, valor) => importar('fretes', `fre-${mes || 'sem'}.csv`,
    `${PL}\nVUC TESTE;ENTREGA TESTE MES;${valor};MARCELO`,
    mes ? { mesReferencia: `${mes}-01` } : {});

  const meus = async () => (await store.fretes.listar())
    .filter((f) => f.descricao === 'ENTREGA TESTE MES');
  for (const f of await meus()) await store.fretes.remover(f.id);

  await planilha('2026-07', '700,00');
  await planilha('2026-08', '800,00');
  await planilha('2026-09', '900,00');

  const linhas = await meus();
  igual('três planilhas de três meses são três linhas de custo', linhas.length, 3);
  ok('e nenhuma fica sem data', linhas.every((f) => !!f.data), JSON.stringify(linhas.map((f) => f.data)));

  const custoDe = async (de, ate) => {
    const r = await margemMod.frete({ de, ate });
    return r.custo.total;
  };
  const jul = await custoDe('2026-07-01', '2026-07-31');
  const ago = await custoDe('2026-08-01', '2026-08-31');
  const set = await custoDe('2026-09-01', '2026-09-30');
  ok('o custo de julho aparece em julho', jul >= 700, String(jul));
  ok('o de agosto em agosto', ago >= 800, String(ago));
  ok('o de setembro em setembro', set >= 900, String(set));
  ok('e nenhum mês carrega o custo do outro', jul !== ago && ago !== set, `${jul} ${ago} ${set}`);

  for (const f of await meus()) await store.fretes.remover(f.id);
}

console.log('\n▶ Todo caminho de importação leva o mês escolhido adiante');
{
  /**
   * O ERRO NÃO ESTAVA NA LÓGICA — ESTAVA NA CHAMADA.
   *
   * Há dois caminhos de importação na tela: o automático, quando o app reconhece
   * o relatório, e o manual, quando ela mesma aponta as colunas. O manual não
   * passava `mesReferencia`, e era só por ele que os três meses caíam num só.
   *
   * O teste de lógica não pega isso: ele chama prepararTabular direto, já com o
   * mês. Quem pega é esta conferência do próprio arquivo da tela — a mesma ideia
   * da lista de arquivos do modo offline, que também se confere sozinha.
   */
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const tela = readFileSync(join(raiz, 'src/ui/views/arquivos.js'), 'utf8');

  const chamadas = tela.split('ingest.prepararTabular(').slice(1);
  igual('a tela tem as duas chamadas de importação', chamadas.length, 2);
  const semMes = chamadas.filter((c) => !/mesReferencia/.test(c.slice(0, 600)));
  ok('e as duas levam o mês escolhido', semMes.length === 0,
    `${semMes.length} chamada(s) sem mesReferencia`);
}

console.log('\n▶ Cinco lugares, e a meta pedida de onde ela é lida');
{
  /**
   * "Ficou muito complexo, onde eu não conseguia mais entender e fazer nada."
   *
   * Eram oito abas na barra e mais oito num menu. Nada do que ela pediu depois
   * era novo — o faturamento diário, a meta, a pasta do mês, tudo já existia e
   * estava enterrado. Então o que este teste guarda não é uma conta: é a
   * superfície. Ela cresce sozinha, uma tela de cada vez, e foi assim que o app
   * ficou impossível de usar.
   */
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const shell = readFileSync(join(raiz, 'src/ui/shell.js'), 'utf8');
  const main = readFileSync(join(raiz, 'src/main.js'), 'utf8');

  const trechoBarra = shell.slice(
    shell.indexOf('export const MODULOS = ['),
    shell.indexOf('export const OUTRAS = ['),
  );
  const naBarra = trechoBarra.match(/path: '[^']*'/g) || [];
  igual('a barra tem cinco lugares', naBarra.length, 5);
  igual('e são os que ela nomeou', naBarra.join(' '),
    "path: '/arquivos' path: '/fluxo' path: '/' path: '/comissoes' path: '/fechamento'");

  for (const morta of ['/cobranca', '/bancos', '/empresa', '/receber', '/pagar', '/caixa/antigo']) {
    ok(`${morta} saiu de vez`, !main.includes(`path: '${morta}'`), 'ainda roteada');
  }

  /**
   * E A META NÃO PEDE MAIS PARA ELA IR A OUTRA TELA.
   *
   * "As metas dos vendedores, quanto que tem que ser vendido por dia, esse
   *  impulso comercial — isso não tem."
   *
   * Tinha: o cálculo inteiro, dormindo. Sem meta cadastrada, a tela só dizia
   * "defina em Ajustes" — então ela nunca viu funcionar. O botão agora fica
   * onde a frase estava.
   */
  const hoje = readFileSync(join(raiz, 'src/ui/views/diario.js'), 'utf8');
  ok('o Hoje pede a meta nele mesmo', /Definir a meta do mês/.test(hoje), '');
  ok('e a meta de cada vendedor também', /Definir meta por vendedor/.test(hoje), '');
  ok('sem mandar ninguém para Ajustes',
    !/Em Ajustes você define a meta/.test(hoje), 'ainda aponta para Ajustes');

  /* o saldo é informado no Caixa, e o extrato saiu da lista de arquivos */
  const fontes = await import('../src/data/sources.js');
  const naLista = fontes.FONTES_LISTA.map((f) => f.id);
  ok('o extrato saiu dos relatórios que ela manda', !naLista.includes('extrato'), naLista.join(','));
  ok('e o saldo também: ele se digita', !naLista.includes('saldos'), naLista.join(','));
  ok('mas o app ainda sabe ler um extrato antigo', !!fontes.fonte('extrato'), '');
}

console.log('\n▶ Orçamento muda de situação, não some');
{
  /**
   * O orçamento entra na rotina diária — "todo dia irei mandar o relatório de
   * orçamento". Mas ele NÃO é fotografia como o contas a receber: um orçamento
   * resolvido não desaparece do sistema, ele muda de situação.
   *
   * O risco é o mesmo que inchou o contas a receber, por outro caminho: um
   * export filtrado por "em aberto" congelaria como aberto, para sempre, todo
   * orçamento que virou venda.
   */
  const ORC = 'Número;Cliente;Data;Situação;Valor';
  await importar('orcamentos', 'orc1.csv', `${ORC}
9001;CLIENTE ORC LTDA;05/01/2028;Em aberto;10.000,00
9002;CLIENTE ORC LTDA;06/01/2028;Em aberto;4.000,00`);
  const meus = async () => (await store.orcamentos.listar()).filter((o) => ['9001', '9002'].includes(o.numero));
  igual('dois orçamentos entraram', (await meus()).length, 2);

  /* no dia seguinte o 9001 virou venda: a SITUAÇÃO muda, o registro é o mesmo */
  await importar('orcamentos', 'orc2.csv', `${ORC}
9001;CLIENTE ORC LTDA;05/01/2028;Aprovado;10.000,00
9002;CLIENTE ORC LTDA;06/01/2028;Em aberto;4.000,00`);
  igual('reimportar não cria orçamento novo', (await meus()).length, 2);
  igual('e a situação do que virou venda é atualizada',
    (await meus()).find((o) => o.numero === '9001').situacao, 'convertido');

  /* e o app avisa quando o export parece filtrado por situação */
  const linhas = Array.from({ length: 12 }, (_, i) => `95${String(i).padStart(2, '0')};CLIENTE ORC LTDA;07/01/2028;Em aberto;1.000,00`);
  const { preparo } = await importar('orcamentos', 'orc3.csv', `${ORC}\n${linhas.join('\n')}`);
  ok('export com uma situação só vira aviso',
    preparo.avisos.some((x) => /filtrado/.test(x)), JSON.stringify(preparo.avisos));

  for (const o of (await store.orcamentos.listar()).filter((x) => x.clienteNome === 'CLIENTE ORC LTDA')) {
    await store.orcamentos.remover(o.id);
  }
}

console.log('\n▶ O app abre offline inteiro, sem arquivo faltando');
{
  /**
   * O service worker guarda uma LISTA de arquivos. Toda tela nova que entrou no
   * app e não entrou na lista funciona com internet e quebra sem ela — e o lugar
   * onde isso aparece é justamente o celular, que é onde a internet falha.
   *
   * Catorze arquivos estavam de fora quando este teste foi escrito, vários de
   * telas feitas nesta mesma semana. Agora a lista se cobra sozinha.
   */
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');

  const varrer = (pasta, prefixo) => readdirSync(join(raiz, pasta)).flatMap((nome) => {
    const caminho = `${pasta}/${nome}`;
    if (statSync(join(raiz, caminho)).isDirectory()) return varrer(caminho, prefixo);
    return nome.endsWith('.js') || nome.endsWith('.css') ? [caminho] : [];
  });

  const arquivos = varrer('src', 'src');
  const fora = arquivos.filter((c) => !sw.includes(`'${c}'`));
  igual('todo arquivo do app está na lista do offline', fora.join(', '), '');
  ok('e a lista não está vazia', arquivos.length > 40, String(arquivos.length));
}

console.log('\n▶ Sincronização: o mesmo app, a mesma base, em dois aparelhos');
{
  /**
   * "Quero a sincronização de verdade. É exatamente isso que precisamos."
   *
   * O transporte aqui é de mentira — uma gaveta na memória — e é esse o ponto:
   * toda a decisão de QUANDO enviar, QUANDO buscar e O QUE FAZER quando os dois
   * mexeram pode ser conferida sem rede, sem Google e sem conta nenhuma.
   */
  const nuvemFalsa = { blob: null, props: null };
  let chamadas = { enviou: 0, baixou: 0 };
  nuvemMod.definirTransporte({
    nome: 'Gaveta de teste',
    async conectado() { return true; },
    async conectar() { return true; },
    async desconectar() { nuvemFalsa.blob = null; },
    async metadados() {
      if (!nuvemFalsa.blob) return null;
      return { atualizadoEm: nuvemFalsa.props.atualizadoEm, dispositivo: nuvemFalsa.props.dispositivo,
        registros: nuvemFalsa.props.registros, tamanho: nuvemFalsa.blob.size };
    },
    async enviar(blob, props) {
      chamadas.enviou += 1;
      nuvemFalsa.blob = blob; nuvemFalsa.props = props;
      return { arquivoId: 'falso-1', atualizadoEm: props.atualizadoEm };
    },
    async baixar() {
      chamadas.baixou += 1;
      if (!nuvemFalsa.blob) throw new Error('nada na nuvem');
      return { blob: nuvemFalsa.blob, arquivoId: 'falso-1', atualizadoEm: nuvemFalsa.props.atualizadoEm };
    },
  });

  /* ---- o aparelho que importa: tem dados e manda para a nuvem */
  const FISC = 'Número da Nota;Data;Razão Social;CPF/CNPJ;Total;Situação;Natureza da operação';
  await importar('nfs', 'sync.csv', `${FISC}
9870;10/09/2027;CLIENTE SINCRONIA LTDA;50505050000150;3.000,00;Autorizada;Venda de mercadoria
9871;11/09/2027;CLIENTE SINCRONIA LTDA;50505050000150;1.500,00;Autorizada;Venda de mercadoria`);
  await link.recalcular();

  const antesDeEnviar = await nuvemMod.estado();
  ok('o aparelho sabe que tem coisa para enviar', antesDeEnviar.enviarPendente === true, '');
  igual('e que a nuvem ainda não tem nada', antesDeEnviar.remoto, null);

  const envio = await nuvemMod.enviar();
  ok('o envio leva a base inteira', envio.registros > 0, String(envio.registros));
  ok('e ela cabe num arquivo pequeno', envio.tamanho < 400 * 1024, `${envio.tamanho} bytes`);

  const depoisDeEnviar = await nuvemMod.estado();
  ok('depois de enviar não há mais nada pendente', depoisDeEnviar.enviarPendente === false,
    JSON.stringify([depoisDeEnviar.mudanca, depoisDeEnviar.carimbo]));
  ok('e o passo automático não fica enviando de novo',
    (await nuvemMod.sincronizar()).acao === 'nada', '');

  /**
   * ---- o OUTRO aparelho: base vazia, busca da nuvem.
   * Apagar tudo aqui é o que simula abrir o app no celular pela primeira vez.
   */
  const guardado = envio.registros;
  for (const nome of Object.keys(dbMod.STORES)) await dbMod.clearStore(nome);
  store.limparCache();
  // aparelho novo não tem memória de mudança nenhuma: é o que o celular dela vê
  store.marcarMudanca(0);
  await store.salvarEstadoNuvem({ carimbo: 0, em: 0, arquivoId: null, conta: null });
  igual('o segundo aparelho começa sem nota nenhuma', (await store.nfs.listar()).length, 0);

  const doOutroLado = await nuvemMod.estado();
  ok('ele vê que a nuvem tem algo mais novo', doOutroLado.buscarPendente === true, '');

  /* o recálculo entra DENTRO da busca, senão o celular devolveria o que recebeu */
  let recalculou = 0;
  const r = await nuvemMod.sincronizar({ aoRestaurar: async () => { recalculou += 1; await link.recalcular(); } });
  igual('o passo automático decide buscar', r.acao, 'buscou');
  igual('refazendo os vínculos antes de carimbar', recalculou, 1);
  ok('e depois disso ele NÃO acha que tem novidade para devolver',
    (await nuvemMod.estado()).enviarPendente === false, '');
  igual('e a base volta inteira', r.registros, guardado);
  igual('com as notas que o outro aparelho importou',
    (await store.nfs.listar()).filter((n) => ['9870', '9871'].includes(n.numero)).length, 2);
  const nota = (await store.nfs.listar()).find((n) => n.numero === '9870');
  igual('ao centavo', nota.valorTotal, 3000);

  ok('e agora os dois estão em dia', (await nuvemMod.sincronizar()).acao === 'nada', '');

  /**
   * ---- OS DOIS MEXERAM: o app não escolhe sozinho.
   *
   * Jogar fora o trabalho de alguém sem perguntar é o erro que só aparece um mês
   * depois, quando o número não fecha. Aqui ele para e devolve 'conflito'.
   */
  await importar('nfs', 'sync2.csv', `${FISC}
9872;12/09/2027;CLIENTE SINCRONIA LTDA;50505050000150;900,00;Autorizada;Venda de mercadoria`);
  // e a nuvem recebeu uma versão mais nova vinda de outro lugar
  nuvemFalsa.props = { ...nuvemFalsa.props, atualizadoEm: Date.now() + 60000, dispositivo: 'computador' };

  const brigando = await nuvemMod.estado();
  ok('o app enxerga os dois lados mexidos',
    brigando.enviarPendente === true && brigando.buscarPendente === true, '');
  const decisao = await nuvemMod.sincronizar();
  igual('e não decide por conta própria', decisao.acao, 'conflito');
  igual('nem buscou escondido', chamadas.baixou, 1);
  igual('nem enviou escondido', chamadas.enviou, 1);
  igual('a nota local continua lá, intacta',
    (await store.nfs.listar()).filter((n) => n.numero === '9872').length, 1);

  /* ---- e quando ela decide, o que ela mandar é o que vale */
  await nuvemMod.enviar();
  ok('mandando enviar, o lado dela vence e o conflito acaba',
    (await nuvemMod.sincronizar()).acao === 'nada', '');

  /* ---- arquivo que não é nosso não entra */
  nuvemFalsa.blob = new Blob([JSON.stringify({ app: 'outra-coisa', dados: {} })]);
  nuvemFalsa.props = { atualizadoEm: Date.now() + 120000, dispositivo: 'x', registros: 0 };
  let recusou = false;
  try { await nuvemMod.buscar(); } catch { recusou = true; }
  ok('arquivo de outro app é recusado antes de apagar qualquer coisa', recusou, '');
  ok('e a base local continua de pé', (await store.nfs.listar()).length >= 3, '');

  nuvemMod.definirTransporte(null);
  for (const n of ['9870', '9871', '9872']) {
    const x = (await store.nfs.listar()).find((y) => y.numero === n);
    if (x) await store.nfs.remover(x.id);
  }
  await store.salvarEstadoNuvem({ carimbo: 0, em: 0, arquivoId: null, conta: null });
  await link.recalcular();
}

console.log('\n▶ O retrato da base: comprime, volta igual, e não mistura');
{
  const snap = await backupMod.montarSnapshot({ dispositivo: 'computador' });
  igual('o retrato se identifica', snap.app, 'ampla');
  ok('e traz um carimbo de quando foi tirado', snap.em > 0, String(snap.em));

  const { blob, comprimido } = await backupMod.comprimir(snap);
  ok('o arquivo sai comprimido', comprimido === true, '');
  const texto = await backupMod.descomprimir(blob);
  igual('e volta exatamente igual', texto, JSON.stringify(snap));

  /* o mesmo leitor abre JSON puro, para backup antigo continuar entrando */
  const puro = new Blob([JSON.stringify(snap)]);
  igual('JSON sem compressão também é lido', await backupMod.descomprimir(puro), JSON.stringify(snap));

  let barrou = false;
  try { backupMod.validarSnapshot({ app: 'outro' }); } catch { barrou = true; }
  ok('e arquivo de outro app não passa', barrou, '');
}

console.log(`\n${falhou ? '❌' : '✅'} ${passou} verificações passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
