# Decisões tomadas e o que ainda depende de você

Registro das escolhas feitas durante a construção — e das que ficaram em aberto
porque dependem de informação que só a empresa tem.

---

## Decisões já implementadas

### Faturamento
- A base oficial é a **NF emitida**, pela **data de emissão**. Pedido de agosto
  faturado em setembro é faturamento de setembro.
- **Canceladas** não entram. **Devoluções** entram como valor negativo no mês em
  que a devolução foi emitida.
- Notas de **entrada** ficam fora do faturamento.
- Toda tela de faturamento mostra a conferência
  `faturamento fiscal = soma dos vendedores`, com a diferença exposta.

### Vendedor
- **Nenhum relatório traz o vendedor.** Foi confirmado pela empresa, e o
  "vendedor responsável" do cadastro de clientes **não é confiável** — o mesmo
  cliente compra de vendedores diferentes. Usar aquele campo seria adivinhar.
- **A ponte é o contas a receber.** Ele traz, na mesma linha, a **nota fiscal** e
  a **descrição, que é o número do pedido**. Com isso o app fecha
  `NF → pedido` sozinho, sem confirmação nenhuma. O relatório fiscal não precisa
  trazer o pedido.
- **O vendedor é definido no PEDIDO, uma vez.** Todas as notas daquele pedido
  herdam — inclusive as emitidas depois. É o contrário de marcar nota por nota.
- **Nunca** há ligação automática por semelhança de nome, valor aproximado ou
  data próxima.
- Cada nota mostra **como** o app chegou ao vendedor (relatório fiscal, pedido,
  ponte do contas a receber, ou definido à mão). A origem fica gravada na nota,
  então um segundo recálculo não a confunde com outra.
- Para o que sobra existe a tela **Conciliação → Atribuir vendedores**, que diz o
  **motivo** de cada nota estar sem vendedor:
  - *o título não liga a nota a nenhum pedido* → falta a coluna NOTA FISCAL no
    export do contas a receber;
  - *pedido X ainda não foi importado* → a tela lista os números que faltam, com
    botão de copiar, para você exportar só esses;
  - *o pedido existe mas ainda não tem vendedor* → é o caso normal, e é onde você
    decide.
- Quando não há pedido nenhum, o app procura pedidos do mesmo cliente anteriores
  à emissão e mostra os candidatos. Marca sozinho apenas quando há **um único**
  pedido com o mesmo valor, e ainda assim só grava com seu clique.
- **Uma NF tem um vendedor só** (não há rateio, confirmado pela empresa).
- Vendedor que aparece num arquivo e ainda não existe no cadastro **é criado** —
  isso é dado do arquivo, não suposição. Nomes diferentes da mesma pessoa se
  resolvem cadastrando **apelidos**.

### Caixa
- Recebimento **vencido sem promessa de pagamento não entra na projeção**: não há
  data confiável. Ele aparece à parte ("vencido fora da projeção") e passa a
  contar assim que houver promessa registrada na cobrança.
- Pagamento **vencido e não pago entra no primeiro dia** da projeção: a obrigação
  continua existindo. É assimétrico de propósito — conservador dos dois lados.
- Há uma chave em Ajustes para incluir vencidos sem promessa, desligada por padrão.

### Comissão
- Nada é fixo no código. As regras ficam no banco, com escopo
  produto+vendedor › produto › categoria+vendedor › categoria › vendedor › padrão.
- O valor **não é gravado**: é recalculado de vendas + regras + ajustes, para não
  existir número congelado sem rastreabilidade.
- Todo ajuste **exige motivo** e guarda valor original, novo, usuário e horário.
- Regras de fábrica, informadas pela empresa: **2% padrão** e **0,5% no cimento**.
  A do cimento pega pela **palavra na descrição** (e não pela categoria), porque
  nem todo arquivo traz categoria. Editar qualquer uma delas tira a marca de
  "veio de fábrica" e nenhuma atualização futura mexe no seu valor.
- O fechamento do mês é **bloqueado** enquanto houver NF sem vendedor ou
  divergência entre fiscal e atribuído.
- Base "margem" só calcula onde há custo confiável; sem custo, a linha fica
  pendente em vez de virar um número errado.

### Conciliação
- Conciliação automática só quando existe **exatamente um** candidato com mesmo
  valor e mesma data. Qualquer ambiguidade vira pendência.
- Título só liga na NF quando existe **uma única** NF com aquele número.
- Pendência resolvida some sozinha; pendência "ignorada" guarda o motivo e volta
  se a condição reaparecer.

### Importação
- Nenhum layout de arquivo é presumido: você liga coluna → campo uma vez por
  fonte e o perfil fica salvo.
- **Nenhum campo é obrigatório** — decisão da empresa, porque o sistema de origem
  não pode ser modificado. Uma linha com um único campo legível entra. Um valor
  ilegível (uma data impossível, por exemplo) não derruba a linha: o campo fica
  em branco e vira **aviso**, com o número da linha.
- A importação **nunca é bloqueada** por falta de coluna. O app importa o que deu
  e depois diz o que não conseguiu ligar, e onde resolver.
- **PDF é lido**, porque um dos sistemas não exporta planilha. O texto é
  remontado em linhas e colunas pela posição em que foi desenhado na página, e
  daí em diante segue o mesmo caminho de um XLSX.
- **PDF escaneado não é lido.** Sem OCR, e sem chute: o app diz que o arquivo não
  tem texto em vez de inventar números a partir de uma imagem.
- A tela de importação anuncia **só os formatos que o leitor abre de verdade**.
  Prometer um formato e falhar depois seria a mesma surpresa que o item 20 manda
  evitar.
- Reimportar o mesmo arquivo atualiza, não duplica (chaves naturais).
- Duas linhas idênticas no mesmo arquivo continuam sendo dois compromissos.

### Produto
- Curva ABC em quatro critérios: faturamento, quantidade, clientes e margem.
- Produto sem custo aparece com margem **em branco** e é contado à parte — o app
  não estima custo.

### Orçamentos
- A **conversão é a que o relatório informa** na coluna SITUAÇÃO: aprovado vira
  "virou venda", recusado vira "perdido", o resto fica "em aberto".
- **Orçamento em aberto não entra na taxa.** Contá-lo como perda seria antecipar
  um fato que ainda não aconteceu; a taxa é sobre o que já foi decidido.
- Orçamento **sem situação no arquivo** entra no total orçado e fica fora da
  taxa, com a quantidade dita na tela.
- O app **não cruza orçamento com pedido** por cliente e valor parecido. Sem o
  número do pedido no export, seria inventar vínculo. Se um dia essa coluna
  existir, a taxa passa a ser calculada em vez de informada.

### DRE e fechamento
- O **CMV** vem do "valor do custo" do pedido que gerou cada nota. Quando um
  pedido rendeu mais de uma nota, o custo é dividido na proporção do valor de
  cada uma — e só quando o pedido informa o valor total, que é o que torna a
  divisão verificável. Sem isso a nota fica **sem custo**, em vez de receber um
  rateio inventado.
- O **lucro bruto só aparece quando o custo cobre 100% do faturamento** do mês.
  Abaixo disso a tela mostra a cobertura e nomeia as notas sem custo. Um lucro
  calculado sobre parte do faturamento seria um número aparentemente perfeito
  com diferença embutida.
- **Despesas pelo vencimento**, não pelo pagamento: é a data que todo relatório
  traz.
- **Compra de mercadoria não entra duas vezes.** Se o plano de contas tiver
  compras de mercadoria, esse custo já veio pelo CMV. As contas que você marcar
  saem das despesas operacionais e aparecem como memorando. O app **sugere**
  quais parecem ser, pela palavra no nome, mas não marca sozinho: só você sabe o
  que cada conta significa no seu plano.
- A **pasta do mês** não guarda cópia de nada: é montada na hora, do banco.
  Assim ela nunca conta uma história diferente da do resto do app.

### Interface
- O nome da empresa é **AMPLA**. Ele aparece na abertura, no ícone e no nome do
  app instalado.
- Fundo **claro** (não branco), detalhes no **azul do logotipo** (`#0044B9`,
  amostrado do arquivo original). Fundo escuro foi descartado a pedido da
  empresa: dava cara de aplicativo de investimento.

### Dados
- Tudo fica no aparelho (IndexedDB). Nenhum número financeiro sai do dispositivo:
  não há servidor, conta ou telemetria.

---

## O que depende de resposta sua

Estas perguntas estão detalhadas em `FONTES-DE-DADOS.md`. Enquanto não forem
respondidas, o app funciona — mas com a limitação anotada ao lado.

| # | Pergunta | Enquanto isso |
|---|---|---|
| 1 | O export do **contas a receber** sai com a coluna NOTA FISCAL? | sem ela a ponte não fecha, e as notas caem na tela de sugestões em vez de vincular sozinhas |
| 2 | O relatório de itens traz **custo**? | sem custo, margem e ABC por margem ficam vazios |
| 3 | Itaú e Bradesco exportam **OFX**? | com planilha funciona, mas sem o identificador único do banco |
| 4 | Existe **meta por vendedor**, além da meta da empresa? | a meta individual já é cadastrável, mas não vem de arquivo |
| 5 | Quantos dias sem contato um título deve voltar para a fila de cobrança? | hoje são **3 dias** (`RECONTATO_DIAS` em `src/logic/collection.js`) |
| 6 | A partir de que saldo o caixa é "atenção" e "crítico"? | Ajustes traz R$ 20.000 e R$ 0 como ponto de partida |
| 7 | Quantos dias antes da emissão ainda vale procurar o pedido? | a janela começa em **90 dias** e é trocável na própria tela |

### Já respondidas

| Pergunta | Resposta | O que mudou no app |
|---|---|---|
| O relatório de pedidos traz a NF gerada? | **Não** | a ligação vai pelo caminho inverso, via contas a receber |
| Algum relatório traz o **vendedor**? | **Nenhum** | o vendedor é definido no app, uma vez por pedido, e todas as notas daquele pedido herdam |
| O "vendedor responsável" do cadastro de clientes serve? | **Não, não é confiável** | o campo é ignorado de propósito |
| O relatório fiscal traz o número do pedido? | **Não** | quem faz a ponte é o contas a receber, que tem nota e pedido na mesma linha |
| Pode haver coluna obrigatória? | **Não** | nada é obrigatório; o app importa o que veio e avisa o que faltou |
| E o que ficar sem vendedor? | **Você confirma** | a tela "Atribuir vendedores" diz o motivo de cada nota e lista os pedidos que faltam exportar, com botão de copiar |
| Existe rateio de uma NF entre vendedores? | **Não** | confirmado o modelo de um vendedor por NF; um pedido confirmado resolve a nota inteira |
| Qual o percentual de comissão? | **2% padrão, 0,5% no cimento** | regras já criadas de fábrica, editáveis em Comissões → Regras |

---

## Coisas deliberadamente fora desta versão

| Item | Por quê |
|---|---|
| Motivo de perda de venda | o relatório de orçamentos traz a situação, mas não o porquê; seria escolha rápida, não campo livre |
| Sincronização entre aparelhos | exigiria servidor; hoje a migração é por backup JSON |
| Login e permissões | o app é de uso administrativo em aparelho próprio |

Nenhum desses itens está bloqueado por arquitetura: todos entram sem refazer a
base de dados.
