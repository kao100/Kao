# Fontes de dados — o que precisamos de cada sistema

Este é o mapa do **item 15** do projeto: antes de confiar em qualquer número,
é preciso saber de onde ele vem.

O aplicativo **não assume o layout de nenhum arquivo**. Cada fonte abaixo declara
os campos que sabe usar; na primeira importação você liga *coluna do arquivo →
campo do app*, confirma, e o perfil fica salvo. Da segunda vez em diante é um
clique.

> Enquanto uma fonte não existir, a área que depende dela mostra o que falta —
> nunca um número estimado.

---

## Resumo

| # | Fonte | Periodicidade | É a verdade de | Formato ideal |
|---|---|---|---|---|
| 1 | Vendas / NFs emitidas | diária | faturamento (valor e data) | **XML da NF-e** (ou ZIP do dia) |
| 2 | Itens das NFs | diária | produto, quantidade, valor por item | XML da NF-e |
| 3 | Pedidos de venda | diária | **vendedor** de cada venda | XLSX/CSV |
| 4 | Contas a receber | diária | títulos, vencimentos, saldo | XLSX/CSV |
| 5 | Contas a pagar (BPO) | semanal | compromissos e vencimentos | XLSX/CSV |
| 6 | Extrato bancário | diária | saldo real e o que entrou/saiu | **OFX** |
| 7 | Saldos bancários | diária | saldo inicial do fluxo | digitado no app, ou XLSX |
| 8 | Produtos e custos | mensal | categoria, custo, fornecedor | XLSX/CSV |
| 9 | Clientes e contatos | mensal | telefone/e-mail para a cobrança | XLSX/CSV |
| 10 | Vendedores | sob demanda | nomes, apelidos e metas | cadastrado no app |

A definição completa de campos vive em `src/data/sources.js` — é ela que o
importador usa. Mexer lá muda o app; este documento é só a leitura humana.

---

## 1. Vendas / NFs emitidas — a base do faturamento

**Por que o XML é a melhor fonte:** vem do documento fiscal, com data de emissão,
valor total, valor dos produtos, frete, desconto e os itens. É o que garante a
regra do item 4 (*faturamento é da NF, não do pedido*).

Campos obrigatórios quando vier em planilha:

- número da NF
- data de **emissão**
- valor total

Úteis: série, chave, cliente, CNPJ/CPF, valor dos produtos, frete, desconto,
número do pedido, vendedor, situação (autorizada/cancelada), natureza da operação.

**O XML quase nunca traz o vendedor.** Por isso existe a fonte 3.

### O que perguntar ao sistema atual

- [ ] Dá para exportar os XMLs do dia (ou um ZIP com eles)?
- [ ] Existe relatório de "notas emitidas" com **número do pedido** na mesma linha?
- [ ] Como aparecem as notas **canceladas** no relatório? E as **devoluções**?
- [ ] O relatório traz o vendedor? Com que nome exatamente (nome completo, apelido, código)?

---

## 2. Itens das NFs — curva ABC e comissão por produto

Vêm juntos no XML. Se for planilha, cada linha precisa ter: NF, código do
produto, quantidade e valor total do item.

**Custo:** se o arquivo trouxer custo unitário ou total, a margem é calculada.
Se não trouxer, a margem aparece **em branco** e o produto é listado como "sem
custo" — o app não estima custo.

### O que perguntar

- [ ] O relatório de vendas por item traz **custo** (médio, último, ou nenhum)?
- [ ] Traz **categoria/grupo** do produto? Senão, precisamos da fonte 8.

---

## 3. Pedidos de venda — de onde vem o vendedor

Esta é a fonte que resolve o problema central do projeto.

Obrigatórios: número do pedido, data, vendedor.
**Muito importante:** se o relatório trouxer a **NF gerada** por cada pedido, a
ligação fica exata e 100% automática.

Ordem que o app usa para descobrir o vendedor de uma NF:

1. definido à mão no app (vence tudo, com registro de quem e por quê);
2. vendedor que veio no próprio relatório de NFs;
3. número do pedido informado na NF → vendedor daquele pedido;
4. pedido que aponta para aquela NF → vendedor daquele pedido;
5. **nenhuma das anteriores → ⚠️ NF SEM VENDEDOR** (vai para a Conciliação).

Nunca há ligação por semelhança de nome, valor ou data aproximada.

### O que perguntar

- [ ] O relatório de pedidos mostra a NF gerada?
- [ ] Um pedido pode gerar **várias** NFs (entrega parcelada)? Como aparece?
- [ ] Uma NF pode juntar **vários** pedidos? (isso muda a regra de rateio da comissão)
- [ ] O nome do vendedor é escrito igual em todos os relatórios?

---

## 4. Contas a receber

Obrigatórios: título/documento, cliente, vencimento, valor.
Úteis: NF de origem, parcela, emissão, valor recebido, saldo, data do
recebimento, situação, banco/carteira, forma de pagamento, telefone, e-mail.

O **telefone** aqui (ou na fonte 9) é o que evita procurar contato em outro
sistema na hora de cobrar.

### O que perguntar

- [ ] O relatório traz a **NF de origem** do título?
- [ ] Traz telefone/contato do cliente?
- [ ] Como aparecem títulos **parcialmente** recebidos?
- [ ] Existe algum título que não nasce de NF (adiantamento, acordo)?

---

## 5. Contas a pagar (BPO)

Obrigatórios: fornecedor, vencimento, valor.
Úteis: documento, categoria/plano de contas, banco, situação, data e valor do
pagamento, observação.

Sem **categoria**, o app mostra o total a pagar mas não consegue dizer para onde
o dinheiro está indo — e abre a pendência "pagamento sem categoria".

### O que perguntar ao BPO

- [ ] Em que formato vem a planilha? Com que frequência?
- [ ] Tem categoria/plano de contas? Qual a lista?
- [ ] Vem só o que está em aberto, ou também o que já foi pago?
- [ ] Como aparecem parcelamentos e boletos prorrogados?

---

## 6. Extrato bancário (Itaú e Bradesco)

**OFX é o formato ideal:** traz o `FITID`, um identificador único por lançamento
que o banco garante. É ele que impede a mesma movimentação de entrar duas vezes.
Traz também o saldo da conta na data.

XLSX/CSV do internet banking também funcionam. Nesse caso o app aceita ou uma
coluna "valor" com sinal, ou duas colunas separadas de entrada e saída.

A conciliação automática só acontece quando há **exatamente um** candidato com
mesmo valor e mesma data. Qualquer dúvida vira pendência — o app não escolhe.

### O que perguntar

- [ ] Os dois bancos exportam OFX? De quantos dias por vez?
- [ ] O extrato em planilha traz "valor com sinal" ou "débito/crédito" separados?

---

## 7 a 10. Complementares

| Fonte | Sem ela… |
|---|---|
| Saldos bancários | o fluxo de caixa parte só da soma do extrato, e avisa que pode estar incompleto |
| Produtos e custos | a curva ABC funciona por faturamento e quantidade, mas **não por margem** |
| Clientes e contatos | a cobrança funciona, mas sem telefone/e-mail na tela |
| Vendedores | os vendedores são criados sozinhos a partir dos pedidos; o cadastro serve para apelidos e metas |

**Apelidos** resolvem o mesmo vendedor aparecer como "Eduardo" num arquivo e
"EDU" em outro. Sem apelido cadastrado, o app trata como duas pessoas — porque
juntar por semelhança seria adivinhar.

---

## Informações que hoje NÃO temos

Levantadas na leitura do projeto, para decidir depois:

| Informação | Onde entraria | Situação |
|---|---|---|
| Orçamentos (valor orçado × convertido) | Produtos / Comercial | não mapeada — precisa existir no sistema atual |
| Motivo de perda de venda | Produtos | seria escolha rápida (preço, prazo, concorrência, sem estoque, desistiu, outro) |
| Custo por NF no momento da venda | Produtos / Comissões | depende do relatório de itens trazer custo |
| Rateio de NF que junta vários pedidos | Comissões | depende da resposta da fonte 3 |
| Meta por vendedor | Comercial | cadastrável no app; hoje só a meta da empresa é usada nos gráficos |

Enquanto não existirem, as telas mostram o campo vazio e dizem o motivo.
