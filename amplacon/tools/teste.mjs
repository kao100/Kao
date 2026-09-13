/**
 * Teste de ponta a ponta da lógica (sem navegador).
 *
 * Roda o caminho inteiro: arquivo → importação → vínculos → faturamento →
 * comissão → caixa → cobrança, e confere os números que o projeto exige
 * (principalmente: NF de setembro com pedido de agosto é faturamento de
 * setembro, e faturamento fiscal = soma dos vendedores).
 *
 *   node amplacon/tools/teste.mjs
 */

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
const abc = await import('../src/logic/abc.js');
const routine = await import('../src/logic/routine.js');
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
  ok(descricao, JSON.stringify(recebido) === JSON.stringify(esperado), `recebido ${JSON.stringify(recebido)}, esperado ${JSON.stringify(esperado)}`);
}

function arquivo(nome, conteudo) {
  return new File([conteudo], nome, { type: 'text/csv' });
}

async function importar(fonteId, nome, conteudo, extras = {}) {
  const leitura = await readFile(arquivo(nome, conteudo));
  const mapeamento = ingest.sugerirMapeamento(fonteId, leitura.planilhas[0].linhas[0].map(String));
  const preparo = await ingest.prepararTabular({
    fonteId, leitura, planilhaIndex: 0, headerRow: 0, mapeamento, ...extras,
  });
  await ingest.confirmar(preparo);
  return preparo;
}

/* ---------------------------------------------------------------- cenário */

console.log('\n▶ Preparando a base');
await semear();
const contas = await store.contas.listar();
igual('duas contas bancárias criadas na primeira execução', contas.length, 2);

// pedidos: um de agosto (faturado em setembro) e dois de setembro
const pedidos = `Pedido;Data;Vendedor;Cliente;CNPJ;Valor;NF
1001;28/08/2026;Eduardo;Construtora Alfa;11222333000181;15.000,00;3001
1002;02/09/2026;Maria;Depósito Beta;44555666000199;8.400,00;3002
1003;05/09/2026;Eduardo;Obra Gama;77888999000155;22.000,00;3003`;

// NFs: a 3001 foi emitida em setembro, mesmo com pedido de agosto
const nfs = `NF;Serie;Emissao;Cliente;CNPJ;Valor Total;Valor Produtos;Frete;Pedido;Situacao
3001;1;01/09/2026;Construtora Alfa;11222333000181;15.000,00;14.800,00;200,00;1001;Autorizada
3002;1;02/09/2026;Depósito Beta;44555666000199;8.400,00;8.400,00;0,00;1002;Autorizada
3003;1;05/09/2026;Obra Gama;77888999000155;22.000,00;21.500,00;500,00;1003;Autorizada
3004;1;08/09/2026;Cliente Avulso;12345678000190;5.000,00;5.000,00;0,00;;Autorizada
3005;1;09/09/2026;Depósito Beta;44555666000199;1.200,00;1.200,00;0,00;1002;Cancelada`;

const itens = `NF;Item;Codigo;Descricao;Categoria;Unidade;Qtd;Vl Unitario;Valor Total;Custo unitario
3001;1;CIM50;Cimento CP-II 50kg;Cimento;SC;400;30,00;12.000,00;26,00
3001;2;ARE01;Areia media m3;Agregados;M3;20;140,00;2.800,00;95,00
3002;1;CIM50;Cimento CP-II 50kg;Cimento;SC;280;30,00;8.400,00;26,00
3003;1;MAD01;Madeira pinus;Madeira;M3;50;430,00;21.500,00;300,00
3004;1;CIM50;Cimento CP-II 50kg;Cimento;SC;166;30,12;5.000,00;26,00`;

const receber = `Titulo;NF;Cliente;CNPJ;Emissao;Vencimento;Valor;Saldo;Situacao;Telefone
7001;3001;Construtora Alfa;11222333000181;01/09/2026;20/09/2026;15.000,00;15.000,00;Aberto;(11) 98888-1111
7002;3002;Depósito Beta;44555666000199;02/09/2026;05/09/2026;8.400,00;8.400,00;Aberto;(11) 97777-2222
7003;3003;Obra Gama;77888999000155;05/09/2026;25/09/2026;22.000,00;22.000,00;Aberto;(11) 96666-3333`;

const pagar = `Fornecedor;Documento;Vencimento;Valor;Categoria;Situacao
Fabrica de Cimento;NF889;18/09/2026;42.000,00;Mercadoria;Em aberto
Transportadora Sul;NF120;22/09/2026;6.500,00;Frete;Em aberto
Energia;CONTA9;15/09/2026;3.200,00;Utilidades;Em aberto`;

console.log('\n▶ Importando os arquivos');
await importar('pedidos', 'pedidos.csv', pedidos);
igual('3 pedidos importados', (await store.pedidos.listar()).length, 3);
igual('e os 3 clientes vieram junto, sem cadastro à parte', (await store.clientes.listar()).length, 3);

const p2 = await importar('nfs', 'nfs.csv', nfs);
igual('5 notas importadas', p2.resumo.total >= 5, true);

await importar('nfItens', 'itens.csv', itens);
await importar('receber', 'receber.csv', receber);
await importar('pagar', 'pagar.csv', pagar);

// reimportar o mesmo arquivo não pode duplicar nada (item 16)
const repetido = await importar('nfs', 'nfs.csv', nfs);
igual('reimportar o mesmo arquivo não cria registro novo', repetido.resumo.novos, 0);
const totalNfs = (await store.nfs.listar()).length;
igual('continuam 5 notas na base', totalNfs, 5);

console.log('\n▶ Vínculos');
await link.recalcular();
const notas = await store.nfs.listar();
const nf3001 = notas.find((n) => n.numero === '3001');
igual('NF 3001 ficou no mês do FATURAMENTO (setembro), não no do pedido (agosto)', nf3001.mes, '2026-09');
ok('NF 3001 recebeu o vendedor do pedido de agosto', !!nf3001.vendedorId, 'ficou sem vendedor');
igual('a origem do vendedor foi o relatório de pedidos', nf3001.vendedorOrigem, 'pedido');

const nf3004 = notas.find((n) => n.numero === '3004');
igual('NF sem pedido fica SEM vendedor (o app não adivinha)', nf3004.vendedorId, null);

const pendencias = await store.pendencias.listar();
ok('pendência "NF sem vendedor" foi criada', pendencias.some((p) => p.tipo === 'nf_sem_vendedor'), '');
ok('pendência de divergência de faturamento foi criada', pendencias.some((p) => p.tipo === 'divergencia_faturamento'), '');

console.log('\n▶ Faturamento (item 4)');
const setembro = await revenue.resumo({ de: '2026-09-01', ate: '2026-09-30' });
igual('faturamento de setembro soma as 4 notas válidas', setembro.total, 50400);
igual('a nota cancelada ficou de fora', setembro.canceladas.quantidade, 1);
igual('faturamento fiscal do período', setembro.conferencia.fiscal, 50400);
igual('atribuído aos vendedores (sem a NF 3004)', setembro.conferencia.atribuido, 45400);
igual('a diferença aparece — não fica escondida', setembro.conferencia.diferenca, 5000);
igual('conferência reprovada enquanto houver NF sem vendedor', setembro.conferencia.ok, false);

const agosto = await revenue.resumo({ de: '2026-08-01', ate: '2026-08-31' });
igual('agosto não recebe o valor do pedido feito em agosto', agosto.total, 0);

const eduardo = setembro.ranking.find((v) => v.nome === 'Eduardo');
igual('Eduardo vendeu 15.000 + 22.000', eduardo.valor, 37000);

console.log('\n▶ Resolvendo a pendência à mão');
const vendedores = await store.vendedores.listar();
await link.definirVendedorDaNf(nf3004.id, vendedores.find((v) => v.nome === 'Maria').id, 'conferido no caderno do balcão');
const setembro2 = await revenue.resumo({ de: '2026-09-01', ate: '2026-09-30' });
igual('depois da correção o fiscal bate com os vendedores', setembro2.conferencia.diferenca, 0);
igual('conferência aprovada', setembro2.conferencia.ok, true);
const auditoria = await store.auditoria.listar();
ok('a correção manual ficou registrada com motivo', auditoria.some((a) => a.acao === 'vendedor_da_nf' && a.motivo), '');

console.log('\n▶ Comissões (item 7)');
await store.regrasComissao.salvar({
  id: 'regra_cimento', escopo: 'categoria', nome: 'Cimento', alvo: { categoria: 'Cimento' },
  percentual: 0.5, base: 'valorProdutos', ativo: true,
});
await store.regrasComissao.salvar({
  id: 'regra_padrao', escopo: 'padrao', nome: 'Padrão da empresa', percentual: 2, base: 'valorProdutos', ativo: true,
});
const calc = await commission.calcular('2026-09');
const comEduardo = calc.vendedores.find((v) => v.nome === 'Eduardo');
// Eduardo: cimento 12.000 x 0,5% = 60 | areia 2.800 x 2% = 56 | madeira 21.500 x 2% = 430
igual('comissão do Eduardo respeita a regra por categoria', comEduardo.comissao, 546);
const comMaria = calc.vendedores.find((v) => v.nome === 'Maria');
// Maria: cimento 8.400 + 5.000 = 13.400 x 0,5% = 67
igual('comissão da Maria só com cimento', comMaria.comissao, 67);
igual('nada bloqueia o fechamento agora', calc.podeFechar, true);

console.log('\n▶ Ajuste de comissão com motivo obrigatório');
let exigiuMotivo = false;
try {
  await commission.ajustar({ escopo: 'nf', alvoId: nf3001.id, tipo: 'percentual', valor: 3, mes: '2026-09' });
} catch { exigiuMotivo = true; }
ok('ajuste sem motivo é recusado', exigiuMotivo, '');

const linhaCimento = calc.linhas.find((l) => l.nfNumero === '3001' && l.produtoDescricao?.includes('Cimento'));
await commission.ajustar({
  escopo: 'item', alvoId: linhaCimento.id, tipo: 'percentual', valor: 1.5,
  motivo: 'venda de cimento com margem muito acima do normal', mes: '2026-09',
  valorOriginal: linhaCimento.comissao, descricaoAlvo: 'Cimento NF 3001',
});
const calc2 = await commission.calcular('2026-09');
const comEduardo2 = calc2.vendedores.find((v) => v.nome === 'Eduardo');
// cimento passa de 60 para 180 → 546 - 60 + 180 = 666
igual('o ajuste entra no cálculo', comEduardo2.comissao, 666);
igual('o valor original continua guardado', comEduardo2.comissaoOriginal, 546);
igual('período passou para "ajustada"', calc2.status, 'ajustada');

await commission.fechar('2026-09', 'conferido com o financeiro');
let bloqueou = false;
try {
  await commission.ajustar({ escopo: 'nf', alvoId: nf3001.id, tipo: 'remover', motivo: 'teste', mes: '2026-09' });
} catch { bloqueou = true; }
ok('mês fechado bloqueia novos ajustes', bloqueou, '');

console.log('\n▶ Curva ABC (item 6)');
const curvaFat = await abc.curva({ de: '2026-09-01', ate: '2026-09-30', criterio: 'faturamento' });
igual('líder por faturamento é o cimento (25.400 somando as 3 notas)', curvaFat.linhas[0].faturamento, 25400);
igual('a madeira fica em segundo', curvaFat.linhas[1].faturamento, 21500);
const curvaQtd = await abc.curva({ de: '2026-09-01', ate: '2026-09-30', criterio: 'quantidade' });
igual('por quantidade o líder é o cimento', curvaQtd.linhas[0].descricao.includes('Cimento'), true);
const curvaMargem = await abc.curva({ de: '2026-09-01', ate: '2026-09-30', criterio: 'margem' });
const madeira = curvaMargem.linhas.find((l) => l.descricao.includes('Madeira'));
igual('margem da madeira = 21.500 - 15.000', madeira.margem, 6500);
const cimento = curvaMargem.linhas.find((l) => l.descricao.includes('Cimento'));
igual('margem do cimento nas 3 notas (1.600 + 1.120 + 684)', cimento.margem, 3404);

console.log('\n▶ Fluxo de caixa (item 9)');
await store.saldos.salvar({ id: 'sal_conta_itau_2026-09-10', contaId: 'conta_itau', data: '2026-09-10', saldo: 12000, origem: 'manual' });
await store.saldos.salvar({ id: 'sal_conta_bradesco_2026-09-10', contaId: 'conta_bradesco', data: '2026-09-10', saldo: 3000, origem: 'manual' });
const proj = await cashflow.projetar({ de: '2026-09-10', dias: 20 });
igual('saldo inicial soma os dois bancos', proj.saldoInicial, 15000);
igual('o título vencido em 05/09 não entra na projeção (sem promessa)', proj.foraDaProjecao.length, 1);
igual('e o valor dele aparece separado', proj.valorForaDaProjecao, 8400);
const dia18 = proj.linhas.find((l) => l.data === '2026-09-18');
igual('dia 18 tem a saída de 42.000', dia18.saidas, 42000);
ok('a projeção acusa dia negativo', !!proj.primeiroDiaNegativo, 'não acusou');
// 15.000 - 3.200 (energia, dia 15) ainda é positivo; quem derruba é a compra de 42.000
igual('o primeiro dia negativo é 18/09', proj.primeiroDiaNegativo.data, '2026-09-18');
igual('e o saldo desse dia é 15.000 - 3.200 - 42.000', proj.primeiroDiaNegativo.saldoFinal, -30200);

console.log('\n▶ Simulação (item 10) — sem tocar no real');
const ajuste = cashflow.novoAjuste('entrada', { valor: 50000, data: '2026-09-14', descricao: 'aporte simulado' });
const comparacao = await cashflow.comparar({ de: '2026-09-10', dias: 20, ajustes: [ajuste] });
ok('o cenário simulado melhora o caixa', comparacao.simulado.saldoFinal > comparacao.real.saldoFinal, '');
igual('a diferença é exatamente o valor simulado', comparacao.diferencaFinal, 50000);
const projDepois = await cashflow.projetar({ de: '2026-09-10', dias: 20 });
igual('o cenário real continua intacto depois da simulação', projDepois.saldoFinal, proj.saldoFinal);

console.log('\n▶ Cobrança (item 8)');
const carteira = await collection.carteira({ referencia: '2026-09-10' });
const beta = carteira.find((l) => l.documento === '7002');
igual('título vencido em 05/09 está com 5 dias de atraso', beta.diasAtraso, 5);
igual('e ainda não foi cobrado', beta.status, 'aberto');
igual('entra na fila de "preciso cobrar hoje"', beta.precisaCobrarHoje, true);

await collection.registrarCobranca(beta.id, { canal: 'whatsapp', contato: 'Sr. Paulo' });
const carteira2 = await collection.carteira({ referencia: '2026-09-10' });
igual('depois de cobrar, muda para "cobrado sem retorno"', carteira2.find((l) => l.documento === '7002').status, 'cobrado');
igual('e sai da fila do dia', carteira2.find((l) => l.documento === '7002').precisaCobrarHoje, false);

await collection.registrarRetorno(beta.id, { retorno: 'paga na sexta', prometeuPagar: true, promessaData: '2026-09-18', promessaValor: 8400 });
const carteira3 = await collection.carteira({ referencia: '2026-09-10' });
igual('com promessa o status vira roxo', carteira3.find((l) => l.documento === '7002').status, 'promessa');

const projComPromessa = await cashflow.projetar({ de: '2026-09-10', dias: 20 });
igual('a promessa faz o vencido entrar no caixa na data prometida', projComPromessa.foraDaProjecao.length, 0);
const dia18b = projComPromessa.linhas.find((l) => l.data === '2026-09-18');
igual('e o dia 18 passa a ter a entrada de 8.400', dia18b.entradas, 8400);

console.log('\n▶ Recebimento alimenta tudo de uma vez (item 19)');
await collection.registrarPagamento(beta.id, { data: '2026-09-18', valor: 8400, contaId: 'conta_itau' });
const tituloPago = await store.receber.obter(beta.id);
igual('título quitado', tituloPago.status, 'pago');
const carteira4 = await collection.carteira({ referencia: '2026-09-18' });
igual('sai da inadimplência', carteira4.find((l) => l.documento === '7002').status, 'pago');
const projDepoisPagto = await cashflow.projetar({ de: '2026-09-19', dias: 10 });
ok('o título pago não é mais previsto como entrada',
  !projDepoisPagto.linhas.some((l) => l.itens.entradas.some((e) => e.id === beta.id)), '');

console.log('\n▶ Rotina e integridade (itens 3 e 15)');
const r = await routine.rotina('2026-09-10');
ok('a rotina lista as fontes que faltam', r.pendentes.length > 0, '');
ok('o selo de integridade não fica verde com pendência', r.integridade.nivel !== 'verde', '');

console.log(`\n${falhou ? '❌' : '✅'} ${passou} verificações passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
