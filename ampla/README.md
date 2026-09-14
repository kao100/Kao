# AMPLA — Gestão administrativa

Central de comando da empresa: pega o que já existe nos sistemas, bancos e BPO,
cruza, e responde **como a empresa está** em um olhar.

**Não é um ERP e não substitui o sistema atual.** Vendas, emissão de NF, cadastro
e financeiro operacional continuam onde estão. Este app lê o que eles produzem.

PWA instalável, funciona offline, **dados 100% locais no aparelho** — nenhum
número financeiro da empresa sai do dispositivo.

---

## Como rodar

Não há build, bundler ou dependências: são módulos ES nativos.

```bash
# na raiz do repositório
python3 -m http.server 8080
# abra http://localhost:8080/ampla/
```

Qualquer servidor estático serve. Requisitos: HTTPS (ou `localhost`) para o
service worker, e um navegador recente (Safari 16.4+, Chrome 80+) — o app usa
`DecompressionStream` para ler .xlsx sem biblioteca.

### Instalar no iPhone

Abra no **Safari** → **Compartilhar (⬆️) → Adicionar à Tela de Início**.

> Os dados moram no navegador, presos ao endereço onde o app foi aberto.
> Escolha a URL definitiva antes de começar a usar de verdade; para migrar,
> use Ajustes → Exportar backup.

### Conferir se está tudo certo

```bash
node ampla/tools/teste.mjs     # 83 verificações da lógica, sem navegador
```

O teste roda o caminho inteiro (arquivo → importação → vínculos → faturamento →
comissão → caixa → cobrança) e confere os números que o projeto exige.

---

## Por onde começar

1. **Central de arquivos** — o app conduz a rotina e diz o que falta importar.
2. Ordem sugerida: Notas fiscais → Pedidos de venda → **Contas a receber** (é ele que liga nota e pedido) → Contas a pagar → Extratos.
3. **Conciliação** — resolver as exceções (NF sem vendedor, movimento sem vínculo).
4. **Ajustes** — meta do mês, regras de comissão, limites de caixa.

Depois disso, qualquer aba responde na hora.

---

## Módulos

| Aba | Responde |
|---|---|
| 📊 Visão da empresa | como estamos: D-1, mês, meta, receber, pagar, bancos, caixa, alertas |
| 💧 Fluxo de caixa | quanto teremos em cada dia — acumulado — e em que dia quebra |
| 📞 Cobrança | quem cobrar hoje, quem não respondeu, quem prometeu pagar |
| 📈 Comercial | faturamento, ranking, ticket, evolução e o detalhe de cada vendedor |
| 📦 Produtos | curva ABC por faturamento, quantidade, clientes e margem |
| 📝 Orçamentos | quanto foi orçado, quanto virou venda, o que ainda está em aberto e a conversão por cliente |
| 🎯 Comissões | cálculo por regra, ajuste com motivo e fechamento travado por conferência |
| 📤 Contas a pagar | vencimentos, categorias e prorrogação que reflete no caixa |
| 📥 Contas a receber | títulos, saldos e situação |
| 🏦 Bancos | saldo por conta, extrato e o que não conciliou |
| ⚠️ Conciliação | só o que exige atenção; resolveu, sai da frente — inclui **Atribuir vendedores**, onde você define o vendedor de cada pedido |
| 📁 Pasta do mês | o dossiê de fechamento: DRE, faturamento, comissões, a receber, a pagar, clientes e divergências — cada um sai sozinho, ou a pasta inteira de uma vez |
| 🗂️ Central de arquivos | checklist do dia, importação e histórico |

Simulação de cenários fica dentro do Fluxo de caixa.

---

## Regras que o app aplica

- **Faturamento é da NF emitida**, pela data de emissão. Pedido de agosto
  faturado em setembro conta em setembro. Canceladas saem; devoluções entram
  negativas no mês da emissão.
- **PDF serve.** Um dos sistemas não exporta planilha: o app abre o PDF, remonta
  a tabela pela posição do texto na página e segue o mesmo caminho de um XLSX.
  PDF escaneado não — sem OCR e sem chute, o app avisa em vez de inventar.
- **Nada é obrigatório.** Nenhuma coluna de nenhum relatório. Você exporta como o
  sistema deixa; o app importa o que veio e **avisa** o que faltou, em vez de
  bloquear. Data ilegível vira aviso, não erro — a linha entra assim mesmo.
- **Vendedor nunca é adivinhado.** Nenhum relatório traz o vendedor, e o relatório
  fiscal não traz o pedido. A ponte é o **contas a receber**, que tem a nota e o
  número do pedido na mesma linha: com ele, `NF → pedido` fecha sozinho. O
  vendedor você define **uma vez, no pedido**, e todas as notas daquele pedido
  herdam. O que sobra vai para *Atribuir vendedores*, que diz o motivo de cada
  nota (título não liga a pedido, pedido não importado, ou pedido ainda sem
  vendedor) e pergunta em vez de decidir.
- **Comissão de fábrica:** 2% padrão e 0,5% no cimento (pela palavra na
  descrição, já que categoria pode não vir no arquivo). Tudo editável.
- **Conferência que nunca some:** faturamento fiscal = soma dos vendedores. A
  diferença aparece; o fechamento de comissão fica travado enquanto existir.
- **Conversão de orçamento é a do seu sistema:** vem da coluna SITUAÇÃO do
  relatório. O app não casa orçamento com pedido por cliente e valor parecido —
  sem o número do pedido no export, isso seria adivinhar. Orçamento em aberto
  fica fora da taxa: ainda pode virar venda.
- **DRE sem estimativa:** o CMV vem do "valor do custo" do pedido que gerou cada
  nota. Nota sem custo conhecido não recebe um custo médio — ela fica de fora, a
  cobertura aparece na tela e o lucro bruto só sai quando o custo cobre 100% do
  faturamento.
- **Nada é contado duas vezes:** as contas do plano que você marcar como compra
  de mercadoria saem das despesas (o custo já entrou pelo CMV) e aparecem à
  parte. O app sugere quais parecem ser, mas quem marca é você.
- **Caixa:** vencido sem promessa não entra na projeção (não há data confiável);
  pagamento vencido entra no primeiro dia (a obrigação continua).
- **Simulação não toca no real** até você mandar aplicar — e aí fica registrado.
- **Conciliação automática só sem ambiguidade:** um único candidato com mesmo
  valor e mesma data. Qualquer dúvida vira pendência.
- **Reimportar não duplica:** cada registro tem chave natural e é atualizado.
- **Linha ilegível não entra pela metade:** vira erro com número da linha e motivo.
- **Todo ajuste manual exige motivo** e guarda valor antes, depois, quem e quando.

---

## Arquitetura

```
index.html            shell do app + metatags PWA/iOS
manifest.webmanifest  manifest do PWA
sw.js                 service worker (app shell offline)
assets/               marca.svg (divisa vetorizada) e logotipo original
icons/                ícones gerados por tools/make-icons.py
docs/                 fontes de dados, modelo de dados e decisões
src/
  main.js             bootstrap: banco, rotas, service worker
  core/               infraestrutura, sem regra de negócio
    dom.js            h() — criação de elementos (sem framework)
    router.js         rotas por hash
    db.js             IndexedDB puro (stores, índices, persistência)
    store.js          repositórios de domínio + cache
    format.js         datas, dinheiro e leitura de número/data de arquivo
    util.js           ids, hash, normalização, download
    files/            zip · xlsx (ler) · xlsxw (escrever) · csv · nfe · ofx · read
  data/
    sources.js        catálogo de fontes e campos canônicos (o mapa de importação)
    seed.js           primeira execução (contas e regras de comissão)
  logic/              regras de negócio, sem DOM
    ingest.js         arquivo → registro canônico, validação e deduplicação
    link.js           NF ↔ pedido ↔ vendedor, conciliação e pendências
    revenue.js        faturamento e conferência fiscal
    commission.js     regras, ajustes e fechamento
    collection.js     cobrança: status, fila do dia e baixas
    suggest.js        candidatos de pedido para cada NF sem vendedor
    cashflow.js       projeção acumulada e simulação
    abc.js            curva ABC e ficha do produto
    routine.js        rotina diária e selo de integridade
    reports.js        PDF (impressão) e Excel (.xlsx de verdade)
  ui/
    shell.js          layout, topo, navegação e selo de dados
    components/       marca, kpi, sheet, toast, gráficos SVG, tabela
    views/            uma tela por arquivo
  styles/             tokens, base, componentes, telas, impressão
tools/
  make-icons.py       gera os PNGs dos ícones (sem dependências)
  teste.mjs           teste de ponta a ponta da lógica
  fake-idb.mjs        IndexedDB de mentira, só para o teste
```

Regra de dependência: `views → components/logic → core`. `core` não conhece
nenhuma tela; `logic` não toca no DOM. Trocar a persistência (por exemplo, para
sincronizar com um servidor) mexe só em `core/db.js` + `core/store.js`.

---

## Identidade

A divisa do logotipo foi vetorizada a partir do arquivo original
(`assets/logotipo-original.png`) e vive em `assets/marca.svg` — mesmos vértices,
sem arredondamento, para continuar nítida em 24px. O azul da marca, amostrado do
arquivo, é **#0044B9**.

O fundo é **claro** — não branco: um cinza-azulado (`#EEF2F8`) com os cartões em
branco e os detalhes no azul da marca. Fundo escuro foi descartado a pedido da
empresa, porque dava cara de aplicativo de investimento. Os ícones do PWA e o
cabeçalho dos relatórios saem da mesma forma: `python3 tools/make-icons.py`
regenera tudo.

---

## Sem dependências

Nada é instalado. O que normalmente pediria biblioteca foi resolvido com o que o
navegador já tem:

| Precisava | Como foi feito |
|---|---|
| Ler .xlsx | `DecompressionStream` + leitura do XML da planilha |
| Escrever .xlsx | ZIP sem compressão (método "stored") + CRC32 próprio |
| Ler XML de NF-e | `DOMParser` |
| Ler OFX | leitor tolerante (o formato costuma ser SGML) |
| **Ler PDF** | `DecompressionStream` nos streams + interpretação dos operadores de texto; a tabela sai da posição de cada pedaço na página |
| Gerar PDF | folha de impressão + `window.print()` |
| Gráficos | SVG escrito à mão |

---

## Documentação

- [`docs/FONTES-DE-DADOS.md`](docs/FONTES-DE-DADOS.md) — o que pedir a cada
  sistema, campo por campo, com o checklist de perguntas.
- [`docs/MODELO-DE-DADOS.md`](docs/MODELO-DE-DADOS.md) — stores, chaves naturais
  e como as pontas se ligam.
- [`docs/DECISOES.md`](docs/DECISOES.md) — o que foi decidido, o que depende de
  resposta sua e o que ficou fora desta versão.
