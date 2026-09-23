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

instalar();
Object.defineProperty(globalThis, 'navigator', { value: { storage: {} }, configurable: true });

const store = await import('../src/core/store.js');
const ingest = await import('../src/logic/ingest.js');
const link = await import('../src/logic/link.js');
const revenue = await import('../src/logic/revenue.js');
const commission = await import('../src/logic/commission.js');
const cashflow = await import('../src/logic/cashflow.js');
const collection = await import('../src/logic/collection.js');
const routine = await import('../src/logic/routine.js');
const dre = await import('../src/logic/dre.js');
const dossie = await import('../src/logic/dossie.js');
const quotes = await import('../src/logic/quotes.js');
const diario = await import('../src/logic/diario.js');
const { readFile } = await import('../src/core/files/read.js');
const { semear } = await import('../src/data/seed.js');

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
await store.saldos.salvar({ id: 'sal_conta_itau_2026-09-13', contaId: 'conta_itau', data: '2026-09-13', saldo: 30000, origem: 'manual' });
const proj = await cashflow.projetar({ de: '2026-09-13', dias: 20 });
igual('saldo inicial informado', proj.saldoInicial, 30000);
const dia18 = proj.linhas.find((l) => l.data === '2026-09-18');
igual('a compra de cimento cai no dia 18', dia18.saidas, 42000);
ok('a projeção acusa dia negativo', !!proj.primeiroDiaNegativo, 'não acusou');

const carteira = await collection.carteira({ referencia: '2026-09-13' });
const beta = carteira.find((l) => l.clienteNome === 'Depósito Beta ME');
igual('título vencido em 05/09 aparece com atraso', beta.diasAtraso, 8);
igual('e entra na fila do dia', beta.precisaCobrarHoje, true);

console.log('\n▶ Reimportar não duplica');
await importar('nfs', 'fiscal.csv', FISCAL);
await importar('receber', 'receber.csv', RECEBER);
await link.recalcular();
igual('continuam 5 notas', (await store.nfs.listar()).length, 5);
igual('continuam 4 títulos', (await store.receber.listar()).length, 4);
igual('o vendedor definido por você continua lá',
  (await store.nfs.listar()).find((n) => n.numero === '3001').vendedorId, carlos.id);

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


console.log('\n▶ Pasta do mês');
{
  const p = await dossie.pasta('2026-09');
  igual('a pasta é do mês pedido', p.mes, '2026-09');
  const ids = p.documentos.map((d) => d.id);
  igual('tem os documentos do fechamento', ids,
    ['dre', 'faturamento', 'comissao', 'receber', 'pagar', 'clientes', 'pendencias']);

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

  igual('um pedido sem vendedor é uma pendência, não três', doVendedor.length, 1);
  igual('e ela aponta a causa: o pedido', doVendedor[0].tipo, 'pedido_sem_vendedor');

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


console.log('\n▶ Relatório de verdade do Gestão Click');
{
  // 16 páginas, 334 vendas, nomes de cliente que quebram em três linhas. O
  // próprio relatório declara os totais no topo — é contra eles que se confere.
  const caminho = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gestao-click-vendas.pdf');
  const leitura = await readFile(new File([readFileSync(caminho)], 'vendas.pdf', { type: 'application/pdf' }));
  const linhas = leitura.planilhas[0].linhas;

  const cab = linhas.find((l) => l.includes('Nº') && l.includes('Cliente'));
  igual('o cabeçalho da tabela foi reconhecido', cab,
    ['Nº', 'Cliente', 'Data', 'Prazo de entrega', '', 'Situação', 'Valor custo', '', 'Valor']);

  const vendas = linhas.filter((l) => /^\d+$/.test(String(l[0] || '').trim()));
  igual('as 334 vendas que o relatório declara', vendas.length, 334);

  const num = (v) => {
    const t = String(v || '').trim();
    return /^[\d.]+,\d{2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : 0;
  };
  const iValor = cab.lastIndexOf('Valor');
  const iCusto = cab.indexOf('Valor custo');
  const soma = (i) => Math.round(vendas.reduce((a, l) => a + num(l[i]), 0) * 100) / 100;
  igual('somando o valor, dá o total do relatório', soma(iValor), 685698.19);
  igual('somando o custo, idem', soma(iCusto), 465000.85);

  igual('nenhuma venda ficou sem cliente',
    vendas.filter((l) => !String(l[1] || '').trim()).length, 0);
  ok('nome comprido quebrado em três linhas voltou inteiro',
    vendas.some((l) => l[1] === 'SANTA AGDA IMOB. ADM. DE BENS E PART. LTDA'),
    JSON.stringify(vendas.find((l) => l[0] === '1147')));
  ok('acento preservado', vendas.some((l) => l[1] === 'FÁBIO PEDROSO LUCAS'), '');
  ok('o rodapé de página não virou registro',
    !linhas.some((l) => l.join(' ').includes('Página')), '');
  ok('e o app diz o que deixou de fora', /ficaram de fora/.test(leitura.aviso || ''), leitura.aviso || '');

  // e as colunas casam sozinhas com os campos do app
  const mapa = ingest.sugerirMapeamento('pedidos', cab.map(String));
  igual('as colunas do Gestão Click casam sozinhas', mapa, {
    numero: 'Nº',
    clienteNome: 'Cliente',
    data: 'Data',
    status: 'Situação',
    valorCusto: 'Valor custo',
    valorTotal: 'Valor',
  });
  ok('e o app não inventa vendedor: este relatório não traz a coluna',
    mapa.vendedorNome === undefined, JSON.stringify(mapa));
}

console.log(`\n${falhou ? '❌' : '✅'} ${passou} verificações passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
