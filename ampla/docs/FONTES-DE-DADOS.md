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
| 1 | Notas fiscais (relatório fiscal) | diária | faturamento: valor e data de emissão | XLSX · CSV · PDF · XML · ZIP |
| 2 | Pedidos de venda (relatório de vendas) | diária | **vendedor**, pedidos concretizados, custo e valor | XLSX · CSV · PDF |
| 3 | **Contas a receber** | diária | títulos, vencimentos, banco — **e a ponte nota ↔ pedido** | XLSX · CSV · PDF |
| 4 | Contas a pagar | semanal | compromissos, vencimentos, plano de contas | XLSX · CSV · PDF |
| 5 | Orçamentos | semanal | quanto foi orçado e quanto virou venda | XLSX · CSV · PDF |
| 6 | Extrato bancário | diária | saldo real e o que entrou/saiu | OFX · XLSX · CSV · PDF |
| 7 | Produtos | mensal | nome, custo e NCM | XLSX · CSV · PDF |
| 8 | Clientes | mensal | razão social, documento, e-mail | XLSX · CSV · PDF |
| 9 | Itens vendidos | sob demanda | produto/quantidade/valor — base da Curva ABC | XML · ZIP · XLSX · CSV |
| 10 | Vendedores | sob demanda | nome oficial, apelidos, meta | cadastrado no app |
| 11 | Saldos bancários | sob demanda | saldo inicial do fluxo | digitado no app, ou XLSX |

A definição completa de campos vive em `src/data/sources.js` — é ela que o
importador usa. Mexer lá muda o app; este documento é só a leitura humana.

---

## Os relatórios do Gestão Click já vêm reconhecidos

Oito relatórios do Gestão Click têm o cabeçalho cadastrado em
`src/data/perfis.js`. Quando o arquivo bate com um deles, o app **não pergunta
nada**: acha o cabeçalho no meio do relatório (depois do título e do bloco de
totais), liga as colunas sozinho e vai direto para a conferência.

| Relatório | Vai para | Colunas |
|---|---|---|
| Vendas | Pedidos | Nº · Cliente · Data · Prazo de entrega · Situação · Valor custo · Valor |
| **Comissão por venda** | Comissões | Nº · Cliente · **Vendedor** · Data de emissão · Valor · Comissão |
| Notas fiscais (NF-e) | Notas fiscais | Nº · Data · Razão social/Nome · CNPJ/CPF · Total · Situação |
| Contas a receber | Contas a receber | Destinado à · CPF · CNPJ · Descrição · Forma de pagamento · Vencimento · Situação · Valor · Valor total · NF-e |
| Contas a pagar | Contas a pagar | Destinado à · CPF · CNPJ · Descrição · Forma de pagamento · Data de vencimento · Situação · Valor · Valor total · NF-e |
| Orçamentos | Orçamentos | Nº · Cliente · Data · Previsão de entrega · Situação · Valor |
| Clientes | Clientes | Nome/Razão social · Documento · E-mail · Nome/Nome Fantasia · Razão Social/Nome Social · CNPJ · CPF · Situação · Vendedor/Responsável |
| Produtos | Produtos | Cód. interno · Nome · Valor de custo · NCM · Grupo · Estoque · Fornecedor · Vr. Varejo |

Detalhes que valem anotar:

- **CPF e CNPJ vêm em colunas separadas**, e cada linha preenche só a sua. Um
  campo pode ser ligado a uma lista de colunas: vale a primeira preenchida.
- **`-----` é como o Gestão Click escreve vazio.** O app trata assim; sem isso
  existiria um grupo de produto chamado "-----" e um fornecedor com o mesmo
  nome — dado que não existe, com cara de que existe.
- Do relatório de produtos o app usa código, nome, custo, NCM e **grupo** (é por
  ele que a Curva ABC agrupa). Estoque, fornecedor e valor de varejo vêm no
  arquivo mas ainda não são usados por nenhuma tela.
- A **descrição** do contas a receber é `Venda de nº 70` — o número do pedido
  sai dali, e é ele que fecha a ponte com a nota fiscal.
- O **relatório de vendas não traz vendedor**, e o **de contas a pagar não traz
  plano de contas** (então o DRE sai sem a divisão por conta).
- O de clientes traz `Vendedor/Responsável`, mas ele **não é usado** para
  atribuir faturamento: a empresa confirmou que o mesmo cliente compra de
  vendedores diferentes.
- Se o Gestão Click mudar uma coluna, o perfil deixa de casar e o app volta a
  perguntar — em vez de ligar errado calado.

---

## PDF também serve

Um dos sistemas não exporta planilha — o relatório sai em PDF e pronto. O app
abre o PDF, descobre **onde cada pedaço de texto foi desenhado na página** e
remonta linhas e colunas pelas coordenadas. O resultado entra no mesmo fluxo de
uma planilha: você liga coluna → campo uma vez, e o perfil fica salvo.

O que ele resolve sozinho:

- título e período antes da tabela não viram registro;
- cabeçalho repetido a cada página é descartado (uma vez por página);
- célula que quebrou em duas linhas volta inteira — inclusive o CNPJ partido no
  hífen, que volta como `11.222.333/0001-81` e não `11.222.333/0001- 81`;
- coluna de valor alinhada à direita continua sendo uma coluna só.

Conferido contra os seis relatórios de verdade do **Gestão Click** — vendas,
notas fiscais, contas a receber, contas a pagar, orçamentos e clientes. Cada um
declara os próprios totais no topo, e todos bateram na vírgula:

| Relatório | Registros | Soma |
|---|---|---|
| Contas a receber | 398 | R$ 792.526,47 |
| Contas a pagar | 388 | R$ 730.696,30 |
| Orçamentos | 685 | R$ 2.300.243,07 |
| Notas fiscais | 336 | R$ 706.537,21 |
| Vendas | 334 | R$ 685.698,19 |

A fixture do teste é **sintética**, com a mesma estrutura (cabeçalho repetido por
página, rodapé, nomes que quebram em três linhas) e nomes inventados: o
repositório é público e relatório de verdade leva nome, CNPJ e e-mail de cliente
junto.

Duas coisas o app diz em vez de esconder: quantas linhas de título, cabeçalho
repetido e numeração de página ficaram de fora, e quantos pedaços de texto não
couberam em nenhuma linha (normalmente o fim de um nome muito comprido — o valor
e a data não são afetados).

**PDF escaneado (foto do papel) não serve.** Não há OCR e não vai haver chute: o
app avisa que o arquivo não tem texto e pede o relatório gerado direto do
sistema. Adivinhar número de imagem seria o oposto do item 20.

---

## Os três relatórios que se completam

Nenhum relatório sozinho responde nada. Três se completam, e é por isso que os
três precisam chegar:

| Relatório | O que SÓ ele traz |
|---|---|
| **Fiscal (NF-e)** | o faturamento de verdade: valor, data e **a natureza da operação**, que é o que separa venda de DEVOLUÇÃO |
| **Pedidos de venda** | o custo — e portanto a margem |
| **Comissão por venda** | **o vendedor** |

E dois que valem a pena mandar uma vez por mês:

| Relatório | Para que serve |
|---|---|
| **Produtos vendidos** | custo médio, custo total e lucro por produto — é o que faz a Curva ABC por MARGEM sair sem o app estimar nada |
| **Comissão por produto** | quanto cada produto vendeu, por vendedor — confere a regra de 0,5% no cimento contra os 2% dos demais |

**Juntos, os dois dão a MARGEM POR VENDEDOR**, que nenhum relatório sozinho dá:

```
produtos vendidos          comissão por produto
custo médio do produto  ×  quanto o vendedor vendeu dele  =  custo do vendedor
```

Conferido no arquivo real: a soma dos vendedores fecha a venda com R$ 0,08 de
diferença. O custo fecha com R$ 6.187,77 a menos, porque 27 linhas vendidas por
alguém não aparecem no relatório de custo — a tela mostra essa diferença em vez
de escondê-la, porque ela faz as margens saírem um pouco MAIORES que a realidade.

**Frete** não está em nenhum dos dois, nem no relatório fiscal de hoje. O campo
existe no app e é reconhecido sozinho se um dia a coluna vier (ou pelos XMLs das
NF-e); até lá a tela diz que não sabe, em vez de mostrar R$ 0,00 — que seria
outra coisa.

Os dois vêm **agregados** (totais de um período, sem número de nota), então moram
em base própria: a Curva ABC usa os itens das notas quando eles existem, ou estes
quando não — nunca os dois somados, que contaria a mesma venda duas vezes. Se o
relatório não trouxer data, você escolhe o mês na importação; o app não escolhe
um por você.

**Vendedor não é relatório.** Ele se cadastra em Ajustes, em dez segundos — e
aparece sozinho quando você manda a comissão por venda, pelo nome que vem nela.
Mandar um arquivo só de vendedores era uma tarefa a mais sem nada em troca.

E um quarto liga tudo: o **contas a receber** traz a nota e o número do pedido
na mesma linha.

```
     fiscal            contas a receber          pedidos        comissão
       NF      ──────►   NF | pedido   ──────►   pedido   ◄──────  vendedor
    (valor,              └ 1ª ponte              (custo)
     data)      ──────►  mesmo cliente
                         + mesmo valor  ──────►
                         └ 2ª ponte
```

**Por que duas pontes.** A do contas a receber é a mais forte, e é sempre a
primeira. O limite dela não é a venda — toda venda gera conta a receber — é o
**export**. Medido no arquivo real:

| | |
|---|---|
| títulos no arquivo | 398 |
| deles **recebidos** | **0** — o relatório saiu só com os "em aberto" |
| notas fiscais citadas | 3489 a 4199 (371 das 397 abaixo de 4000) |
| notas do relatório fiscal | 3878 a 4232 |
| notas do mês com algum título | **74 de 336** |

O que sobra num export "em aberto" é o rabo de títulos velhos ainda não pagos,
não o mês corrente: a venda de setembro já recebida sai da lista. **Mandar uma
vez o contas a receber sem o filtro de situação fecha essa ponte para o mês
inteiro** — e o app avisa na importação quando vê um arquivo em que nenhum
título está recebido.

A segunda ponte cobre o que sobrar, sem inventar: nota e pedido da mesma venda têm o
MESMO cliente e o MESMO valor até o centavo, e o pedido vem antes da nota. Vale
só quando o par é único, e a janela é de 30 dias. Resultado no mesmo mês: 297 das
336 notas com dono, R$ 555 mil atribuídos de R$ 706 mil.

O que a segunda ponte **recusa**, e por quê:

| Situação | O que o app faz |
|---|---|
| dois pedidos iguais, vendedores diferentes | não escolhe — vira pendência com os números dos candidatos |
| dois pedidos iguais, mesmo vendedor | atribui o **vendedor**, mas não finge saber qual pedido |
| pedido depois da nota | ignora — não é a venda dela |
| um centavo de diferença | ignora — não é o mesmo valor |
| pedido de mais de 30 dias antes | fora da janela |

**Faturamento é da nota, não do pedido.** Um pedido do mês passado cuja nota saiu
este mês é venda deste mês. Por isso o app soma NFs e não pedidos — e por isso a
comissão que o sistema calcula (por pedido) pode divergir da que o app calcula
(por nota). O app guarda as duas para você comparar.

### Uma venda, uma pendência

Toda nota vem de um pedido. O app nunca cobra a nota E o pedido dela como dois
problemas — antes disso, 336 notas e 334 pedidos viravam quase 700 itens, com o
mesmo dinheiro contado duas vezes. Agora:

- nota que já chegou ao pedido → **não aparece**: quem responde é o pedido;
- nota que não chegou a pedido nenhum → aparece **uma vez**, com o motivo escrito
  (as duas pontes falharam, e o texto diz qual das duas e por quê), e recebe
  vendedor direto: o sistema de origem não deixa acrescentar vendedor a uma nota
  já emitida, então este é o único lugar onde isso pode acontecer;
- pedido sem vendedor → aparece **uma vez**, e o que resolve é o relatório de
  comissão.

### A coisa mais importante a saber sobre o contas a receber

**Exporte-o sem o filtro de situação, pelo menos uma vez por mês.**

O relatório exportado do jeito de sempre sai só com os títulos **em aberto**. Toda
venda gera conta a receber — mas a venda já recebida sai da lista, e é exatamente
o título dela que ligaria a nota fiscal daquele mês ao pedido. No arquivo real:
398 títulos, **nenhum** recebido, e as notas citadas quase todas de antes do mês
importado.

Mande **uma vez** um contas a receber do mês **com todas as situações** (ou com
"Recebido" incluído) e a ponte fecha para o mês inteiro. Depois disso o envio
diário mantém tudo em dia. O app avisa na importação quando percebe um arquivo em
que nenhum título está recebido — não fica calado esperando você descobrir.

---

## O problema central — e como ele se resolve

O relatório fiscal **não traz o pedido**, e é do pedido que vem o **vendedor**.
Sem uma ponte, não há como dizer de quem é cada faturamento.

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
2. **O vendedor vem na coluna VENDEDOR do relatório de vendas**, no pedido — e
   dali passa para todas as notas daquele pedido, inclusive as emitidas depois.
   Linha que vier sem vendedor entra assim mesmo, e é a única que o app
   pergunta, uma vez.
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

**Colunas reais:** número do pedido · cliente · data da venda · **vendedor** ·
situação · valor do custo · valor total.

É daqui que vem o **custo** — e portanto a margem. Sem custo, a margem aparece
em branco e o produto é listado como "sem custo": o app não estima custo.

**Inclua a coluna VENDEDOR no export.** É ela que faz a comissão fechar sozinha.

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
