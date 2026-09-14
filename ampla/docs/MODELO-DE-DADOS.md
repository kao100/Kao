# Modelo de dados

Estrutura criada **antes** das telas, como pede o item 22 do projeto. Tudo vive
no IndexedDB do aparelho (`ampla-admin`), definido em `src/core/db.js`.

---

## Princípio

> **Uma informação entra uma vez.**

Uma NF importada alimenta faturamento, vendedor, cliente, produtos, curva ABC,
comissão, contas a receber, fluxo de caixa e dashboard — sem relançamento.

---

## Chaves naturais (o que impede duplicidade)

Cada registro tem um id determinístico: reimportar o mesmo arquivo gera as mesmas
chaves e **atualiza** o registro em vez de criar outro.

| Entidade | Chave |
|---|---|
| NF | chave de acesso (44 dígitos) quando existir, senão `série-número` |
| Item da NF | `idDaNF#nºDoItem` |
| Pedido | número do pedido, sem zeros à esquerda |
| Orçamento | número do orçamento |
| Título a receber | `cliente + referência + vencimento`, onde a referência é a **nota fiscal**, senão o **nº do pedido** (a descrição), senão o hash da linha |
| Conta a pagar | `fornecedor + referência + vencimento`, mesma regra |
| Movimento bancário | `conta + FITID` do banco; sem OFX, `conta + data + hash(valor, histórico)` |
| Cliente | CNPJ/CPF quando houver, senão código, senão nome normalizado |
| Produto | código interno, senão descrição normalizada |

**Quando não há identificador nenhum** — e isso é permitido, porque nenhum campo
é obrigatório — a chave é um *hash da própria linha*. O mesmo conteúdo continua
sendo o mesmo registro entre importações, sem inventar um número que o relatório
não deu.

Duas linhas **idênticas no mesmo arquivo** são dois compromissos diferentes: a
segunda recebe sufixo `~2`, e continua estável entre importações.

---

## Stores

### Vendas

| Store | Conteúdo |
|---|---|
| `nfs` | documento fiscal: número, série, chave, emissão, `mes`, cliente, valores, situação, operação, devolução, pedido, `pedidoOrigem`, **vendedorId** e **vendedorOrigem** |
| `nfItens` | um registro por item: produto, quantidade, valor, custo; herda data, mês, vendedor e cliente da NF |
| `pedidos` | número, data, cliente, custo, valor, situação e o **vendedorId que você define** — nenhum relatório traz vendedor |
| `orcamentos` | número, cliente, data, situação e valor — base da taxa de conversão |

`mes` é sempre derivado da **data de emissão da NF** — é o que faz um pedido de
agosto faturado em setembro ser faturamento de setembro.

`vendedorOrigem` guarda *como* o app chegou no vendedor: `nf`, `pedido`,
`pedido-nf` ou `manual`. Rastreabilidade é requisito (item 21).

### Financeiro

| Store | Conteúdo |
|---|---|
| `receber` | título, parcela, NF, cliente, emissão, vencimento, valor, recebido, saldo, status, banco, vendedor |
| `pagar` | fornecedor, documento, vencimento, valor, categoria, banco, status, pagamento, `prorrogadoPara` |
| `contas` | contas bancárias (Itaú, Bradesco…) |
| `extrato` | movimentos: conta, data, valor, histórico, FITID, `conciliacaoStatus`, `conciliadoCom` |
| `saldos` | saldo informado por conta e data — ponto de partida do fluxo |
| `cobrancas` | um evento por ação: `cobranca`, `retorno`, `promessa`, `pagamento` |

### Comissões

| Store | Conteúdo |
|---|---|
| `regrasComissao` | escopo, alvo, percentual, base, sem-comissão, vigência |
| `ajustesComissao` | escopo, alvo, tipo, valor, **valor original, motivo, usuário, data** |
| `periodosComissao` | status do mês: calculada → revisada → ajustada → aprovada → fechada |

A comissão **nunca é gravada como número**: é recalculada a partir de vendas +
regras + ajustes. Assim não existe valor congelado sem rastreabilidade.

### Cadastros e operação

`vendedores` (com apelidos e meta), `clientes`, `produtos`, `fornecedores`,
`importacoes` (histórico), `perfisImport` (o mapa coluna→campo salvo),
`pendencias`, `cenarios`, `auditoria`, `kv` (configuração e marcos).

---

## Como as pontas se ligam

```
                        ┌── a ponte ──┐
                        │             │
XML/relatório ──► NF ◄──┤  título a   ├──► pedido ──► vendedor
                   │    │  receber    │                  ▲
                   │    └─────────────┘                  │
                   │           │                   você define,
                   │           │                   uma vez por pedido
                   ├► itens ──► produto ──► curva ABC
                   │    │
                   │    └──► comissão (regra + ajuste) ──► vendedor
                   │
                   │      cobrança ──► promessa
                   │           │
                   ▼           ▼
             fluxo de caixa ◄── contas a pagar ──► plano de contas ──► DRE
                   ▲
             saldo bancário ◄── extrato (OFX)
```

O título a receber é o único registro que tem **nota fiscal e número do pedido na
mesma linha** — por isso ele é a ponte. O relatório fiscal não traz pedido, e
nenhum relatório traz vendedor.

Toda ligação é **exata ou inexistente**:

- título → NF: só liga quando existe **uma única** NF com aquele número;
- NF → pedido: pela ponte do título; se dois títulos apontarem a mesma nota para
  pedidos diferentes, o vínculo é marcado **ambíguo** e não é usado;
- extrato → título: só concilia quando existe **um único** candidato com mesmo
  valor e mesma data;
- pedido → vendedor: **sempre uma decisão sua**, nunca semelhança. A NF guarda em
  `vendedorOrigem`/`pedidoOrigem` por qual caminho o vínculo chegou, e o
  recálculo não mexe no que veio de você.

O que não liga vira pendência na tela de Conciliação, com botão para resolver.

---

## Auditoria

Toda decisão manual grava em `auditoria`: ação, alvo, valor antes, valor depois,
motivo, usuário e horário. Aparece em Ajustes → Histórico de alterações.

São auditados: vendedor definido à mão, ajuste de comissão, mudança de status do
período, baixa de título, pagamento, prorrogação, conciliação manual, vínculo
título→NF, pendência ignorada, saldo informado, regra de comissão e meta.

---

## Backup

`Ajustes → Exportar backup` gera um JSON com todas as stores. Como os dados moram
no navegador, eles ficam presos ao endereço onde o app foi aberto — escolha a URL
definitiva antes de começar a usar de verdade.
