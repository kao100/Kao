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
- **Nunca** há ligação por semelhança de nome, valor aproximado ou data próxima.
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
| 1 | O relatório de pedidos traz a **NF gerada**? | a ligação usa o número do pedido informado na NF; sem ele, vira pendência |
| 2 | Uma NF pode juntar **vários pedidos**? | hoje cada NF tem um vendedor só; se houver rateio, a regra precisa ser definida |
| 3 | Um pedido pode gerar **várias NFs**? | funciona: cada NF é faturamento do seu próprio mês |
| 4 | O relatório de itens traz **custo**? | sem custo, margem e ABC por margem ficam vazios |
| 5 | O BPO manda **categoria/plano de contas**? | sem categoria, não dá para ver para onde o dinheiro vai |
| 6 | Itaú e Bradesco exportam **OFX**? | com planilha funciona, mas sem o identificador único do banco |
| 7 | Qual o **percentual padrão** de comissão e as exceções? | a regra padrão nasce em 0% até ser configurada |
| 8 | Existe **meta por vendedor**, além da meta da empresa? | a meta individual já é cadastrável, mas não vem de arquivo |
| 9 | Quantos dias sem contato um título deve voltar para a fila de cobrança? | hoje são **3 dias** (`RECONTATO_DIAS` em `src/logic/collection.js`) |
| 10 | A partir de que saldo o caixa é "atenção" e "crítico"? | Ajustes traz R$ 20.000 e R$ 0 como ponto de partida |

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
