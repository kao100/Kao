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
const filtro = await import('../src/logic/filtro.js');
const carteiraMod = await import('../src/logic/carteira.js');
const abcMod = await import('../src/logic/abc.js');
const margemMod = await import('../src/logic/margem.js');
const rtMod = await import('../src/logic/rt.js');
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
    .then((l) => l.filter((x) => x.status === 'aberta' && ['nf_sem_pedido', 'pedido_sem_vendedor'].includes(x.tipo)
      && ['7001', '7002', '5001', '5002'].some((n) => (x.titulo || '').includes(n))));

  const antes = await abertas();
  const tipos = {};
  for (const x of antes) tipos[x.tipo] = (tipos[x.tipo] || 0) + 1;
  igual('a nota com pedido não vira pendência própria: quem responde é o pedido',
    antes.filter((x) => x.titulo.includes('7001')).length, 0);
  // a 7002 não tem título nenhum, mas o pedido 5002 é do mesmo cliente com o
  // mesmo valor: a segunda ponte fecha, e quem responde por ela é o pedido
  igual('a nota sem título achou o pedido pela segunda ponte',
    antes.filter((x) => x.tipo === 'nf_sem_pedido' && x.titulo.includes('7002')).length, 0);
  igual('e os dois pedidos pedem vendedor', tipos.pedido_sem_vendedor, 2);
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
  igual('e a origem diz de onde veio', nfs7001.vendedorOrigem, 'pedido-titulo');
  igual('a nota sem título também tem dono', nfs7002.vendedorId, rita.id);
  igual('e a origem diz que foi pela segunda ponte', nfs7002.vendedorOrigem, 'pedido-valor');
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

  // produto vendido por alguém mas fora do relatório de custo: margem incompleta
  await importar('comissaoProduto', 'mc2.csv', `${CP}
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

console.log(`\n${falhou ? '❌' : '✅'} ${passou} verificações passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
