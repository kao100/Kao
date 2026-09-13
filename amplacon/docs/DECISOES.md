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
- A ordem de confiança está em `src/logic/link.js` e no documento de fontes.
- **Nunca** há ligação automática por semelhança de nome, valor aproximado ou
  data próxima.
- **O caminho normal é automático:** a NF traz o número do pedido e o relatório
  de vendedores traz pedido + vendedor. Com as duas importações, `NF → pedido →
  vendedor` fecha sozinho, sem confirmação nenhuma. Basta o relatório ter essas
  duas colunas — data não é obrigatória.
- Para o que sobra existe a tela **Conciliação → Atribuir vendedores**, que diz
  o **motivo** de cada nota estar sem vendedor:
  - *pedido X ainda não foi importado* → a tela lista os números que faltam, com
    botão de copiar, para você exportar só esses;
  - *a NF não informa o pedido* → o app procura pedidos do mesmo cliente,
    anteriores à emissão, e mostra os candidatos. Marca sozinho apenas quando há
    **um único** pedido com o mesmo valor, e ainda assim só grava com seu clique.
    Dois pedidos de mesmo valor ficam esperando sua escolha.
- **Uma NF tem um vendedor só** (não há rateio, confirmado pela empresa), então
  um pedido confirmado resolve a nota inteira.
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
- Linha com campo obrigatório ilegível **não entra pela metade**: fica listada
  como erro, com o número da linha e o motivo.
- Reimportar o mesmo arquivo atualiza, não duplica (chaves naturais).
- Duas linhas idênticas no mesmo arquivo continuam sendo dois compromissos.

### Produto
- Curva ABC em quatro critérios: faturamento, quantidade, clientes e margem.
- Produto sem custo aparece com margem **em branco** e é contado à parte — o app
  não estima custo.

### Dados
- Tudo fica no aparelho (IndexedDB). Nenhum número financeiro sai do dispositivo:
  não há servidor, conta ou telemetria.

---

## O que depende de resposta sua

Estas perguntas estão detalhadas em `FONTES-DE-DADOS.md`. Enquanto não forem
respondidas, o app funciona — mas com a limitação anotada ao lado.

| # | Pergunta | Enquanto isso |
|---|---|---|
| 1 | O **export** de NFs traz a coluna do pedido (a tela traz)? | se o export não trouxer, cada NF cai na tela de sugestões em vez de vincular sozinha |
| 2 | O relatório de itens traz **custo**? | sem custo, margem e ABC por margem ficam vazios |
| 3 | O BPO manda **categoria/plano de contas**? | sem categoria, não dá para ver para onde o dinheiro vai |
| 4 | Itaú e Bradesco exportam **OFX**? | com planilha funciona, mas sem o identificador único do banco |
| 5 | Existe **meta por vendedor**, além da meta da empresa? | a meta individual já é cadastrável, mas não vem de arquivo |
| 6 | Quantos dias sem contato um título deve voltar para a fila de cobrança? | hoje são **3 dias** (`RECONTATO_DIAS` em `src/logic/collection.js`) |
| 7 | A partir de que saldo o caixa é "atenção" e "crítico"? | Ajustes traz R$ 20.000 e R$ 0 como ponto de partida |
| 8 | Quantos dias antes da emissão ainda vale procurar o pedido? | a janela começa em **90 dias** e é trocável na própria tela |

### Já respondidas

| Pergunta | Resposta | O que mudou no app |
|---|---|---|
| O relatório de pedidos traz a NF gerada? | **Não** | não é preciso: a ligação vai pelo caminho inverso |
| A NF traz o número do pedido? | **Sim** | `NF → pedido → vendedor` fecha sozinho; o relatório de vendedores precisa de só duas colunas (pedido + vendedor) |
| E o que ficar sem vendedor? | **Você confirma** | a tela "Atribuir vendedores" diz o motivo de cada nota e lista os pedidos que faltam exportar, com botão de copiar |
| Existe rateio de uma NF entre vendedores? | **Não** | confirmado o modelo de um vendedor por NF; um pedido confirmado resolve a nota inteira |
| Qual o percentual de comissão? | **2% padrão, 0,5% no cimento** | regras já criadas de fábrica, editáveis em Comissões → Regras |

---

## Coisas deliberadamente fora desta versão

| Item | Por quê |
|---|---|
| Orçamento × conversão | a informação não foi mapeada em nenhuma fonte ainda |
| Motivo de perda de venda | depende de existir o orçamento; seria escolha rápida, não campo livre |
| Leitura de PDF | o projeto pede PDF "só quando necessário"; nenhuma fonte precisa dele hoje |
| Sincronização entre aparelhos | exigiria servidor; hoje a migração é por backup JSON |
| Login e permissões | o app é de uso administrativo em aparelho próprio |

Nenhum desses itens está bloqueado por arquitetura: todos entram sem refazer a
base de dados.
