# Ampla Dados

Plataforma interna de consulta de dados da Ampla: uma API única e um painel
próprios, no lugar de assinar um agregador de terceiros.

Um agregador como os do mercado não produz dado nenhum — ele revende mais de
cem fontes por uma interface só e cobra um markup por isso. O que ele entrega
de fato é integração única, normalização, cache, painel e auditoria. **Tudo
isso está aqui.** O que ele não pode dar de graça — e esta plataforma também
não inventa — é o dado que só existe em bureau pago.

---

## O que esta plataforma resolve, e o que ela não resolve

Vale ser direto sobre isso antes de qualquer coisa, porque muda o que dá para
esperar do dia 1.

### Cobertura total, custo zero por consulta

| Produto | Fonte | Como |
|---|---|---|
| **CNPJ completo** — razão social, situação, endereço, CNAE, porte, capital, Simples/MEI, quadro societário | Dados abertos da Receita Federal | Base própria no Postgres. Resposta em milissegundos, sem rede |
| **Compliance** — PEP, CEIS, CNEP, CEPIM | Portal da Transparência (CGU) | API pública, chave gratuita por autocadastro |
| **Dívida ativa da União** | Dados abertos da PGFN | Base própria no Postgres |
| **Processos judiciais** (por número) | DataJud / CNJ | API pública, chave divulgada pelo próprio CNJ |
| **CEP** | BrasilAPI + ViaCEP | Duas fontes, uma de reserva |
| **Validação de CPF/CNPJ** | Dígito verificador | Cálculo local |
| **Vínculo societário de um CPF** | Dados abertos da Receita | Ver a ressalva sobre máscara, mais abaixo |

### Não existe em fonte pública — exige contrato

| Produto | Por quê |
|---|---|
| **CPF cadastral** — nome, nascimento, nome da mãe, telefone, e-mail, endereço, faixa de renda | O portal da Receita tem captcha; a via oficial é a API do SERPRO, paga por consulta |
| **Score, negativação, restritivo, renda presumida** | Só existe dentro dos bureaus (Serasa, Boa Vista, Quod, SPC) |
| **Óbito, veículo por placa, biometria** | Idem |
| **Busca de processo por CPF/CNPJ** | O DataJud omite os documentos das partes de propósito |

Para todos esses, os conectores **já estão escritos e desligados**. Enquanto
`SERPRO_CPF_ENABLED=false` e `BUREAU_ENABLED=false`, eles não fazem chamada,
não geram custo e a cascata simplesmente pula o degrau. No dia em que a Ampla
fechar um contrato pay-per-use, basta preencher o `.env`: nenhuma outra linha
do sistema muda.

### Onde está a economia de verdade

Ligar uma fonte paga não significa pagar por todas as consultas. Três
mecanismos derrubam o volume faturado:

1. **Base própria** — CNPJ, dívida ativa e compliance nunca chegam a uma
   fonte paga. Em operações reais isso costuma ser 50–70% do volume total.
2. **Cascata** — a consulta para na primeira fonte que responde. A fonte paga
   é sempre o último degrau (campo `ordem` do conector).
3. **Cache com validade por produto** — CNPJ 7 dias, CPF 1 dia, compliance 12
   horas. Consulta repetida dentro da janela não toca no fornecedor.

O painel mostra, no topo, quanto as consultas do período custaram de fato e
quanto custariam compradas prontas.

---

## Como subir

### Com Docker (recomendado)

```bash
cp .env.example .env         # ajuste SESSION_SECRET e as chaves gratuitas
docker compose up -d
docker compose exec api node --experimental-strip-types ingest/criar-admin.ts \
  "Seu Nome" voce@ampla.com.br uma-senha-forte
```

O painel fica em <http://localhost:3000>.

### Sem Docker

Precisa de Node 22+, Postgres 16+ e Redis 7+ rodando.

```bash
npm install
cp .env.example .env
npm run seed:demo            # migra o banco e insere alguns CNPJs de exemplo
npm run criar-admin -- "Seu Nome" voce@ampla.com.br uma-senha-forte
npm run dev
```

O `seed:demo` existe para dar para clicar no painel em minutos. A carga real
da Receita leva horas.

---

## Carregar as bases próprias

### CNPJ da Receita Federal

Publicado mensalmente. Cerca de 6 GB compactados e ~90 GB no banco.

```bash
npm run ingest:cnpj                        # último mês disponível
npm run ingest:cnpj -- 2026-08             # mês específico
npm run ingest:cnpj -- 2026-08 auxiliares  # só as tabelas de domínio
```

Etapas possíveis: `auxiliares`, `empresas`, `estabelecimentos`, `socios`,
`simples` — úteis para retomar uma carga interrompida.

Vale automatizar isso num cron mensal.

### Dívida ativa da PGFN

Publicada por trimestre, quebrada por tipo e por UF. Como a PGFN muda o padrão
de URL com frequência, o script recebe os arquivos em vez de adivinhar:

```bash
npm run ingest:pgfn -- 2026T2 ./data/pgfn/*.csv
npm run ingest:pgfn -- 2026T2 https://dadosabertos.pgfn.gov.br/.../arquivo.zip
```

Downloads em <https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/dados-abertos>.

---

## A API

Toda chamada precisa de duas coisas: uma **chave** (criada no painel) e uma
**finalidade**. A finalidade não é burocracia — é o campo que responde "por que
a Ampla consultou o dado desta pessoa?" quando alguém perguntar.

```bash
curl -H "Authorization: Bearer ampla_live_…" \
     -H "X-Finalidade: análise de crédito do pedido 1234" \
     https://dados.ampla.interno/v1/cnpj/19131243000197
```

| Rota | O que faz |
|---|---|
| `GET /v1/cnpj/:cnpj` | Empresa completa |
| `GET /v1/cpf/:cpf?nome=&campos=&sem_fonte_paga=` | CPF; `campos` interrompe a cascata assim que o que você pediu foi obtido |
| `GET /v1/compliance/:documento?nome=` | PEP, sanções e dívida ativa, com um resumo em linguagem de negócio |
| `GET /v1/processos?numero=&nome=&tribunal=` | Processos judiciais |
| `GET /v1/cep/:cep` | Endereço por CEP |
| `GET /v1/fontes` | Quais fontes estão ligadas e quanto custa cada uma |
| `GET /health` | Estado do banco e da base da Receita |

Toda resposta traz o mesmo envelope, independente da fonte que respondeu:

```jsonc
{
  "produto": "cnpj",
  "encontrado": true,
  "dados": { /* schema normalizado */ },
  "origem": "fonte",              // "cache" | "fonte" | "nenhuma"
  "fontes": [                     // a cascata, degrau por degrau
    { "fonte": "receita-cnpj-local", "ok": true, "custoCentavos": 0, "latenciaMs": 7 }
  ],
  "custoTotalCentavos": 0,
  "latenciaTotalMs": 7,
  "consultaId": "uuid-para-rastrear-na-auditoria"
}
```

`sem_fonte_paga=true` garante que a consulta não gasta um centavo, mesmo com
fonte paga contratada e ligada.

---

## Arquitetura

```
Cliente (painel ou chave de API)
  ↓
Portaria     autenticação, quota diária, finalidade obrigatória
  ↓
Roteador     cascata: para na fonte mais barata que responde
  ├─ Cache Redis          TTL por produto
  ├─ Base própria         Receita, PGFN
  ├─ APIs públicas        Transparência, DataJud, BrasilAPI, ViaCEP
  └─ Fontes pagas         SERPRO, bureau — último degrau, desligadas
  ↓
Normalizador → um schema único de resposta
  ↓
Auditoria    quem, o quê, quando, por quê, de onde veio, quanto custou
```

O **normalizador** é a peça que importa a longo prazo: é ele que permite
trocar Serasa por Boa Vista reescrevendo um arquivo só. Sem ele, o fornecedor
entra no código inteiro — que é exatamente como um agregador de terceiro
prende quem o usa.

```
src/
  core/        tipos normalizados, cascata, registro de conectores, auth, auditoria
  connectors/  uma fonte por arquivo — trocar de fornecedor é trocar um arquivo
    paid/      fontes pagas, desligadas por padrão
  products/    a política de cada produto (o que mesclar, quando parar)
  db/          pool, migrações
  cache/       Redis, com degradação limpa se estiver fora do ar
  http/        rotas da API e do painel
web/           painel — módulos ES nativos, sem build
ingest/        carga dos dados abertos
test/          testes unitários
```

---

## LGPD

A plataforma trata dado pessoal, então algumas decisões são deliberadas:

- **Finalidade obrigatória** em toda consulta, gravada junto com o registro.
- **Auditoria completa** — autor, documento, finalidade, fontes acionadas,
  custo e latência, com um `consultaId` para rastrear ponta a ponta.
- **CPF mascarado não identifica ninguém.** A Receita e a PGFN publicam o CPF
  como `***123456**`, escondendo 5 dígitos: cada máscara bate com milhares de
  CPFs no país. Por isso o vínculo societário só é devolvido quando o chamador
  informa também o nome, e o resultado é conferência, não certeza. Devolver a
  lista sem isso seria entregar dado de terceiro.
- **A chave de API nunca é gravada** — o banco guarda só o hash e um prefixo.
- **O nome que o chamador envia não volta como dado apurado.** O campo `nome`
  da resposta fica nulo até que uma fonte o preencha.

Duas coisas que ficaram deliberadamente de fora, e não por limitação técnica:
raspar portal do governo contornando captcha, e carregar base de dado pessoal
de origem não oficial. Além do risco de ANPD, isso contaminaria toda a
operação.

---

## Testes

```bash
npm test          # unitários: validação de documento, cascata, mesclagem
npm run typecheck
```

A suíte cobre o que dá para testar sem rede: dígito verificador, a cascata
(incluindo fonte que falha, fonte desligada e o freio antes da fonte paga),
os alertas de compliance e a mesclagem de CPF.

---

## Próximos passos sugeridos

1. **Cron mensal** da carga da Receita e trimestral da PGFN.
2. **Score próprio da Ampla** — modelo com o histórico de pagamento da própria
   carteira. Para o livro de vocês costuma prever melhor que o score do bureau,
   e custa zero por consulta. É o substituto real do que o bureau vende.
3. **Protesto (CENPROT)** e **CND da Receita/PGFN**, que têm consulta pública.
4. **Webhook de mudança cadastral** — avisar quando uma empresa monitorada muda
   de situação entre duas cargas.
5. **Relatório de economia por área**, para justificar (ou não) cada contrato
   pago que vier a ser assinado.
