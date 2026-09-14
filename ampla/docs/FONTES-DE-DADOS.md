# Fontes de dados — o que o app lê de cada relatório

Este é o mapa do **item 15** do projeto: antes de confiar em qualquer número,
é preciso saber de onde ele vem.

O aplicativo **não assume o layout de nenhum arquivo**. Cada fonte abaixo
declara os campos que sabe usar; na primeira importação você liga *coluna do
arquivo → campo do app*, confirma, e o perfil fica salvo. Da segunda vez em
diante é um clique.

> Enquanto uma fonte não existir, a área que depende dela mostra o que falta —
> nunca um número estimado.

---

## A regra de ouro: nada é obrigatório

**Nenhuma coluna é obrigatória.** Você exporta o relatório como ele sai do
sistema; o app trabalha com o que veio e **avisa** o que ficou faltando.

Concretamente:

- Uma linha com um único campo legível **entra**.
- Uma data impossível não derruba a linha: o campo fica em branco e vira um
  **aviso**, com o número da linha.
- O app nunca bloqueia a importação por falta de coluna. Ele lista, depois, o
  que não conseguiu ligar — e onde você resolve isso.

Isso é uma decisão da empresa, não um detalhe técnico: o sistema de origem não
pode ser modificado, então quem se adapta é o app.

---

## Resumo

| # | Fonte | Periodicidade | É a verdade de | Formatos |
|---|---|---|---|---|
| 1 | Notas fiscais (relatório fiscal) | diária | faturamento: valor e data de emissão | XLSX · CSV · XML · ZIP |
| 2 | Pedidos de venda (relatório de vendas) | diária | pedidos concretizados, com custo e valor | XLSX · CSV |
| 3 | **Contas a receber** | diária | títulos, vencimentos, banco — **e a ponte nota ↔ pedido** | XLSX · CSV |
| 4 | Contas a pagar | semanal | compromissos, vencimentos, plano de contas | XLSX · CSV |
| 5 | Orçamentos | semanal | quanto foi orçado e quanto virou venda | XLSX · CSV |
| 6 | Extrato bancário | diária | saldo real e o que entrou/saiu | OFX · XLSX · CSV |
| 7 | Produtos | mensal | nome, custo e NCM | XLSX · CSV |
| 8 | Clientes | mensal | razão social, documento, e-mail | XLSX · CSV |
| 9 | Itens vendidos | sob demanda | produto/quantidade/valor — base da Curva ABC | XML · ZIP · XLSX · CSV |
| 10 | Vendedores | sob demanda | nome oficial, apelidos, meta | cadastrado no app |
| 11 | Saldos bancários | sob demanda | saldo inicial do fluxo | digitado no app, ou XLSX |

A definição completa de campos vive em `src/data/sources.js` — é ela que o
importador usa. Mexer lá muda o app; este documento é só a leitura humana.

**PDF ainda não é lido.** Um dos sistemas só exporta em PDF; até o leitor de PDF
ficar pronto, a tela de importação daquela fonte diz isso na cara, em vez de
aceitar o arquivo e falhar depois.

---

## O problema central — e como ele se resolve

Nenhum dos relatórios traz o **vendedor**. E o relatório fiscal **não traz o
pedido**. Sem uma ponte, não há como dizer de quem é cada faturamento.

A ponte é o **contas a receber**: ele tem, na mesma linha, a **nota fiscal** e a
**descrição, que é o número do pedido**.

```
relatório fiscal          contas a receber           relatório de vendas
   NF 3001      ──────►   NF 3001 | pedido 1001  ──────►   pedido 1001
                                                                │
                                                       vendedor │ você define,
                                                                ▼ uma vez
                                                            Carlos
```

Consequências práticas:

1. **Exporte o contas a receber sempre com a coluna NOTA FISCAL.** Sem ela a
   ponte não fecha e as notas ficam sem vendedor.
2. **O vendedor é definido no PEDIDO, não em cada nota.** Você define uma vez e
   todas as notas daquele pedido herdam — inclusive as que forem emitidas
   depois.
3. **O app nunca adivinha.** Se não dá para chegar ao vendedor, a nota vai para
   `⚠️ NFs SEM VENDEDOR` com o motivo exato: sem pedido, pedido não importado,
   ou pedido ainda sem vendedor.

Cada nota mostra **como** o app chegou ao vendedor (coluna "Vendedor via"):
pelo relatório fiscal, pelo pedido, pela ponte do contas a receber, ou porque
você definiu à mão. Item 20: a origem nunca fica escondida.

---

## 1. Notas fiscais (relatório fiscal) — a base do faturamento

**Colunas reais:** número da nota · data · razão social · CPF/CNPJ · total ·
situação.

É a verdade do **item 4**: faturamento é da NF, pela **data de emissão**, nunca
pela data do pedido. Pedido de agosto com nota em setembro é faturamento de
setembro.

- Notas **canceladas** não entram no faturamento; aparecem contadas à parte.
- **Devoluções** entram como valor negativo no mês da emissão.
- Não traz pedido nem vendedor — quem faz a ponte é o contas a receber.

O **XML da NF-e** (ou um ZIP com os XMLs do dia) também é aceito e é mais rico:
traz os itens, o que alimenta a Curva ABC.

## 2. Pedidos de venda (relatório de vendas)

**Colunas reais:** número do pedido · cliente · data da venda · situação ·
valor do custo · valor total.

É daqui que vem o **custo** — e portanto a margem. Sem custo, a margem aparece
em branco e o produto é listado como "sem custo": o app não estima custo.

O vendedor **não** vem neste relatório. Você o define dentro do app, por pedido.

## 3. Contas a receber — a fonte mais importante

**Colunas reais:** destinado a · CPF/CNPJ · descrição (nº do pedido) · forma de
pagamento · conta bancária · vencimento · situação · valor total · nota fiscal.

Além de ser a ponte, é a verdade dos **títulos**: vencimento, situação e em qual
banco o dinheiro entra — base da cobrança (item 8) e das entradas do fluxo de
caixa (item 9).

## 4. Contas a pagar

**Colunas reais:** destinado a · CPF/CNPJ · descrição · plano de contas · forma
de pagamento · conta bancária · data de vencimento · situação · valor total ·
nota fiscal.

O **plano de contas** é o que torna o DRE possível: é ele que classifica cada
saída.

## 5. Orçamentos

**Colunas reais:** número do orçamento · cliente · data · situação · valor.

Serve para a taxa de conversão: quanto foi orçado, quanto virou pedido.

## 6. Extrato bancário

**OFX é o melhor formato** — tem identificador único por movimento (FITID), então
reimportar o mesmo período não duplica nada.

Em planilha, serve tanto uma coluna de "valor" com sinal quanto duas colunas
separadas de entrada e saída — o que o banco der.

É a verdade do **saldo real**, e a base da conciliação (item 12).

## 7. Produtos

**Colunas reais:** código interno · nome · valor de custo · NCM.

Base da Curva ABC (item 6). CEST, CFOP, grupo e estoque podem vir junto; o app
guarda.

## 8. Clientes

**Colunas reais:** razão social · CPF/CNPJ · e-mail.

Telefone, celular, tipo, IE e endereço podem vir junto — o app usa na cobrança,
mas nenhum é necessário.

> **O "vendedor responsável" do cadastro de clientes não é usado.** A empresa
> confirmou que ele não é confiável: um mesmo cliente pode ter comprado de
> vendedores diferentes. Usar esse campo seria exatamente o "adivinhar vínculo"
> que o item 20 proíbe.

## 9. Itens vendidos

Vêm juntos no XML da NF-e. Em planilha, cada linha precisa da nota, do código do
produto, da quantidade e do valor — mas, como sempre, o que faltar vira aviso,
não bloqueio.

## 10. Vendedores

Cadastrados dentro do app: nome oficial, apelidos (para casar com o que vier nos
arquivos) e meta mensal.

## 11. Saldos bancários

O saldo inicial de cada conta, digitado no app ou importado. Sem ele o fluxo de
caixa projeta variação, mas não saldo.

---

## Reimportar nunca duplica

Cada registro tem uma **chave natural** — NF pelo número, título pelo cliente +
referência + vencimento, movimento bancário pelo FITID. Reimportar o mesmo
arquivo, ou um arquivo com período sobreposto, **atualiza no lugar**.

Quando o relatório não traz identificador nenhum, a chave é um *hash* da própria
linha: o mesmo conteúdo continua sendo o mesmo registro.

E o que **você** decidiu (o vendedor de um pedido, um ajuste de comissão)
sobrevive a qualquer reimportação: o recálculo não mexe no que veio de uma
decisão sua.
