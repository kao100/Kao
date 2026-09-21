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
- **O relatório de vendas traz a coluna VENDEDOR.** É ela que faz a comissão
  fechar sozinha: o vendedor do pedido passa para todas as notas daquele pedido
  pela ponte do contas a receber, sem marcação nenhuma.
- O "vendedor responsável" do **cadastro de clientes** continua ignorado: a
  empresa confirmou que não é confiável, porque o mesmo cliente compra de
  vendedores diferentes.
- Linha que vier **sem** vendedor entra assim mesmo e é a única que o app
  pergunta, uma vez, no pedido. É o único lugar do app em que se marca algo.
- **Nunca** há ligação por semelhança de nome, valor aproximado ou data próxima.
- Vendedor que aparece no arquivo e não existe no cadastro **é criado** — isso é
  dado do arquivo, não suposição. Nomes diferentes da mesma pessoa se resolvem
  cadastrando **apelidos**.
- Cada nota guarda **como** o vendedor chegou até ela, e o recálculo não mexe no
  que veio de uma decisão sua.

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

### O relatório que ela manda ATUALIZA — não vira um relatório novo
- O arquivo do dia é o **estado atual** do sistema dela: já vem com as baixas
  dadas, os boletos prorrogados e o que continua em aberto. O app absorve isso.
- Por isso o **vencimento saiu da chave natural** de contas a receber e a pagar.
  Boleto prorrogado é o mesmo boleto com outra data: com a data na chave, o
  relatório do dia seguinte criava um segundo título e o valor aparecia em dobro
  no caixa e na inadimplência. A chave é cliente + referência + valor; parcelas
  do mesmo documento com o mesmo valor se separam pela ordem no arquivo, e aí
  são intercambiáveis porque não há mais nada que as diferencie.
- **A situação do arquivo manda.** Se veio "Recebido", o título está recebido —
  mesmo sem data de recebimento na planilha, que é o normal em vários exports.
  Antes o app só olhava saldo e data, e a baixa dada no sistema não chegava aqui.
- A tela de relatórios diz **com qual arquivo cada fonte está atualizada**, em
  vez de listar um histórico que só cresce. É um relatório vivo, não uma pilha.
- A contagem mostra **o que ela mandou**, não o que o app criou de tabela junto:
  4 notas são 4 notas, não 8 registros.

### Um problema é contado uma vez só
- Um pedido sem vendedor gerava **três** pendências: o pedido, a nota dele e a
  diferença de faturamento do mês. Era o mesmo dinheiro dito de três jeitos, e o
  "valor envolvido" saía triplicado — dois pedidos de R$ 30.400 viravam
  "5 pendências, R$ 91.200".
- Agora vale a **causa**: a nota cujo pedido já está sendo cobrado não vira
  pendência própria, porque resolver o pedido resolve a nota.
- A **divergência de faturamento** só vira pendência pelo que sobra depois de
  descontar as notas sem vendedor. A parte que elas explicam já está dita; o que
  sobra é que ninguém está vendo.

### Recomeço do zero (21/09/2026)
- A empresa pediu para descartar tudo o que foi mandado nos primeiros testes e
  começar limpo, com o aplicativo inteiro do jeito que ficou.
- Os dados moram **no aparelho**, não num servidor: não há como apagá-los de
  fora. Então quem apaga é o próprio app, na primeira abertura depois da
  atualização — uma vez só, controlado pela marca em `core/reiniciar.js`.
- O recomeço vem **antes** da migração e apaga também o banco antigo do
  AMPLACON, senão a migração traria tudo de volta no recálculo seguinte.
- Depois disso `semear()` recria o que é de fábrica: as contas bancárias e as
  regras de comissão (2% padrão, 0,5% no cimento).
- Trocar a marca dispara um novo recomeço em todos os aparelhos. Só mexer nela
  quando a intenção for mesmo apagar os dados de quem já está usando.

### O vendedor se resolve na hora de importar
- O sistema de origem **não deixa acrescentar vendedor a um pedido já feito** —
  nem a uma venda ou nota já emitida. Então o vínculo só pode nascer aqui, e o
  único momento em que ela está com o relatório na mão é a importação.
- Por isso, logo depois de gravar, o app mostra os pedidos que vieram sem
  vendedor e deixa marcar cada um ali mesmo, com um toque. Dá para **criar um
  vendedor novo na hora**, sem sair da tela.
- Marcado assim, fica gravado como decisão sua: reenviar o mesmo relatório no
  dia seguinte não apaga o que ela pôs.
- "Deixar para depois" existe e diz o preço: aquele faturamento fica fora do
  ranking e da comissão até alguém resolver.

### Seis abas, e o resto no menu
- A barra tinha catorze abas e rolava para o lado. Rolar para achar uma aba é o
  contrário de abrir o app e saber como a empresa está.
- Ficam na barra as seis que ela abre todo dia: Relatório, Caixa, Vencidos,
  Comercial, Orçados e Comissões. O resto continua existindo, a um toque, no
  menu (☰) do topo.
- **Mandar os relatórios** é a ação diária dela, então ganhou botão próprio no
  topo (📤), visível em qualquer tela, sem ocupar uma das seis vagas.
- A **Conciliação saiu da barra**: quando o relatório vem certo ela fica vazia.
  O aviso virou um recado dentro do Relatório do dia — "2 pedidos vieram sem
  vendedor, R$ 30.400" — que leva direto para a tela de resolver.

### O app é um gestor, não uma lista de tarefas
- **Não se marca nada no app.** Dar baixa aqui e no sistema seria o mesmo
  trabalho duas vezes, em dois lugares, para justificar a mesma coisa. A baixa
  acontece no sistema; a próxima importação traz o resultado.
- Por isso a **Cobrança virou Inadimplência**: um relatório de quem está
  devendo, há quanto tempo e quanto, sem botão de cobrei, promessa ou recebi.
  As ações saíram de `collection.js`; os eventos antigos continuam gravados e
  continuam sendo lidos, então quem já tinha histórico não perde nada.
- **Meta do mês vira meta por dia** pelos dias em que a empresa vende (padrão
  segunda a sábado, configurável). Dividir por 30 quando não se abre domingo dá
  um alvo diário menor do que o real, e o mês vira sem ninguém perceber que
  estava atrasado.
- **Sem meta definida, o app não inventa uma**: ele pede.
- O **relatório do dia** é a tela de abertura e sai inteiro em PDF ou Excel —
  é feito para ser lido e mandado para outra pessoa.
- O **impulso comercial** traça a linha de objetivo de cada vendedor: onde está,
  onde deveria estar hoje se o mês fosse parelho, e quanto precisa por dia. Sem
  meta combinada, o alvo é a fatia da meta da empresa que a pessoa já vem
  puxando, marcada como **estimada** — e ninguém é cobrado por um alvo que o
  próprio app estimou.

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
