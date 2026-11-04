# Kao Training

Aplicativo pessoal de treino — personal training digital e diário de treinamento.
Feito para uso individual, com prioridade em praticidade dentro da academia:
musculação + condicionamento + futebol + recuperação, com acompanhamento de dor
articular e de uma promessa diária de exercício.

PWA instalável, funciona offline, dados 100% locais no aparelho.

## Privacidade

**Nenhum dado pessoal fica no código.** Peso, altura, condição de saúde,
suplementos, cargas, dor, medidas e fotos são digitados no cadastro de primeiro
uso e gravados apenas no IndexedDB do seu aparelho. Não há servidor, não há
conta, não há telemetria — por isso o repositório pode ser público sem expor
nada de quem usa o app.

---

## Primeiro uso

Ao abrir pela primeira vez, o app faz um cadastro rápido em 5 telas: perfil
(peso, altura, tempo de treino), promessa diária, dias de futebol, alguma
limitação em acompanhamento e suplementos. Tudo pode ser alterado depois em
Ajustes → Perfil.

## Como rodar

Não há build, bundler ou dependências: são módulos ES nativos.

```bash
# na raiz do projeto
python3 -m http.server 8080
# abra http://localhost:8080
```

Qualquer servidor estático serve (`npx serve`, Nginx, GitHub Pages, Netlify…).
Requisitos: HTTPS (ou `localhost`) para o service worker funcionar.

### Instalar no iPhone

1. Abra o endereço no **Safari** (não funciona pelo Chrome iOS para instalar).
2. Toque em **Compartilhar (⬆️) → Adicionar à Tela de Início**.
3. O app abre em tela cheia, respeita as safe areas do iPhone e funciona offline.

### Publicar no GitHub Pages

`Settings → Pages → Source: Deploy from a branch`, apontando para a branch do
app e a pasta `/ (root)`. Todos os caminhos são relativos (`./`), então funciona
normalmente em subdiretório (`usuario.github.io/repositorio/`).

Como os dados moram no navegador, eles ficam presos ao endereço onde o app foi
aberto. Escolha a URL definitiva antes de começar a registrar treino de verdade;
para migrar de endereço, use Ajustes → Exportar backup (JSON) e importe no novo.

---

## Arquitetura

```
index.html            shell do app + metatags PWA/iOS
manifest.webmanifest  manifest do PWA
sw.js                 service worker (app shell offline)
icons/                ícones gerados por tools/make-icons.py
src/
  main.js             bootstrap: banco, semente, rotas, service worker
  core/               infraestrutura, sem regra de negócio
    dom.js            h() — criação de elementos (sem framework)
    router.js         rotas por hash
    db.js             IndexedDB puro (stores, índices, persistência)
    store.js          repositórios de domínio + consultas
    format.js         datas (sempre locais), números, durações
    util.js           ids, csv, download, redimensionar imagem
    audio.js          bipes do cronômetro + wake lock
    pdf.js            gerador de PDF mínimo (relatório do joelho), sem dependências
  data/               conteúdo (sementes)
    exercises.js      biblioteca de exercícios com ficha completa
    program.js        programa semanal inicial + planos de cardio
    illustrations.js  ilustrações SVG próprias de cada exercício
    media.js          resolução de imagem (foto da academia > externa > SVG)
    seed.js           primeira execução (programa, exercícios, migrações)
  logic/              regras de negócio, sem DOM
    planner.js        que treino aparece em cada dia (futebol, sábado, joelho)
    warmup.js         PREPARAÇÃO PARA O TREINO: etapas, tempos e séries preparatórias
    budget.js         seletor 30/40/60/90/120 min: divide o tempo e ajusta os exercícios
    session-plan.js   junta preparação + divisão do tempo com os dados do dia
    knee-strength.js  fortalecimento do joelho: progressão, gráficos e relatório semanal
    project.js        Projeto Casamento — 8 semanas (indicadores do tronco)
    progression.js    progressão dupla
    knee.js           status do joelho, orientações médicas, séries de dor
    readiness.js      check-in de recuperação (🟢🟡🔴)
    report.js         resumo semanal e painel de evolução
    backup.js         exportar/importar JSON e CSV
  ui/
    shell.js          layout, topbar, tab bar, blocos comuns
    components/       sheet, toast, gráficos SVG, inputs grandes, figuras
    views/            uma tela por arquivo (inclui o cadastro de primeiro uso)
  styles/             tokens, base, componentes, telas
tools/make-icons.py   gera os PNGs dos ícones (sem dependências)
```

Regra de dependência: `views → components/logic → core`. `core` não conhece
nenhuma tela; `logic` não toca no DOM. Trocar a persistência (por exemplo, para
sincronizar com um servidor) mexe só em `core/db.js` + `core/store.js`.

---

## Modelo de dados (IndexedDB `kao-training`)

| Store | Conteúdo |
|---|---|
| `kv` | perfil e configurações |
| `exercises` | biblioteca de exercícios (editável) |
| `templates` | treinos do programa (editáveis) |
| `sessions` | sessões de musculação realizadas (snapshot do template) |
| `sets` | cada série: carga, reps, RIR, dor, tempo |
| `cardio` | sessões de cardio, com fases planejadas × reais |
| `football` | partidas: duração, RPE, gols, distância, joelho antes/depois |
| `measurements` | peso e circunferências |
| `photos` | fotos de progresso (frente/lado/costas) |
| `painLogs` | dor no joelho: 0–10, movimento, inchaço, instabilidade |
| `recovery` | check-in de sono/energia/dor muscular/motivação |
| `medical` | orientações médicas (prioridade sobre o plano padrão) |
| `equipment` | fotos das máquinas da academia (40 já vêm cadastradas em `assets/gym/`) |
| `supplements` | creatina, whey… |
| `nutrition` | um registro por dia: água consumida (e as linhas do registro manual antigo) |
| `meals` | um registro por alimento consumido: data, refeição, medida, gramas e macros |
| `foods` | tabela de alimentos — os 75 que vêm no app e os que você cadastrar do rótulo |
| `dailyLog` | minutos do dia e promessa cumprida |
| `dayPlan` | resposta de "vai ter futebol?", local (academia/casa) e tempo escolhido (`budgetMin`) por data |
| `kneeResponses` | resposta do joelho por exercício (sem dor / desconforto leve / dor aumentou), depois do treino e no dia seguinte (melhor / igual / pior) |

Sessões guardam uma **cópia** do treino: editar o programa depois não reescreve o histórico.

---

## Regras que o app aplica

- **Promessa diária**: todo dia tem atividade; a sequência (🔥) só zera se o dia
  fechar com menos de 30 minutos registrados.
- **Quinta**: futebol por padrão. **Domingo**: o app pergunta.
  **Sábado**: se houver futebol confirmado no domingo, o Lower B é substituído
  por recuperação ativa/cardio leve para preservar as pernas.
- **Quarta**: nunca treino pesado de pernas (véspera do futebol); se você mover
  pernas para quarta, o app avisa.
- **Progressão dupla**: a carga só é sugerida para subir quando todas as séries
  atingem o topo da faixa de repetições — e a confirmação é sempre sua.
- **Joelho**: dor ≥ 5/10, dor acima do seu padrão recente, inchaço ou
  instabilidade fazem o app parar de sugerir aumento de carga e sinalizar cautela.
- **Orientações médicas** cadastradas têm prioridade: exercício marcado como não
  liberado aparece sinalizado no treino, na ficha e no editor do programa.
- **Alternativas por exercício**: todo exercício tem substitutos equivalentes
  (aparelho ocupado, máquina inexistente, exercício desconfortável). O leg press,
  por exemplo, oferece agachamento até a caixa, hip thrust, step-up, stiff, ponte
  de glúteo e afundo — com o grau de exigência do joelho sinalizado em cada um.
  A troca pode ser só para a sessão do dia (modo treino) ou definitiva (programa).
- **Recordes**: superar a maior carga (ou repetir mais com a mesma carga) gera um
  reconhecimento na hora, guardado no histórico de conquistas.
- **Pergunta do joelho** só aparece em dias de perna, cardio e futebol.
- **Modo "em casa"**: cada dia da semana tem uma versão de calistenia, com peso
  do corpo e improviso (barra fixa, mesa, cadeira, degrau, mochila carregada). O
  botão 🏠 no card do treino de hoje troca o dia inteiro — inclusive o cardio, que
  vira caminhada/escada na rua. Nenhum dia é perdido e a promessa continua de pé.
  Os treinos caseiros assumem barra fixa; em Ajustes → "O que eu tenho em casa"
  dá para desmarcar, e o app passa a apontar as alternativas sem barra.

---

### Tempo do dia, preparação e joelho (v17)

- **Seletor de tempo** no card de hoje: 30 MIN · 40 MIN · 1 HORA · 1H30 · 2 HORAS.
  A preparação é reservada primeiro e nunca encolhe para caber o treino; com
  pouco tempo saem os acessórios (core, braço, isoladores) e depois séries dos
  exercícios de menor prioridade. Descanso entre séries não é cortado. Nos dias
  de superiores, peito, costas e ombros têm prioridade; nos de pernas,
  quadríceps, posteriores e glúteos. Tempo sobrando vira cardio opcional e
  complementos — o app não inventa volume.
- **ANTES DE COMEÇAR**: o modo treino abre com a preparação do dia — superiores
  5–8 min (mobilidade, ativação específica para peito/costas/ombros/braços,
  séries preparatórias), pernas 8–12 min (bicicleta leve, mobilidade de
  quadril/tornozelo/joelho, ativação de glúteo, séries preparatórias com
  amplitude crescente). Joelho em atenção/cautela ou recuperação baixa deixam a
  preparação mais longa. Cada etapa tem ilustração, instruções e cronômetro.
  As séries preparatórias saem da sua última carga e não contam como série.
- **Fortalecimento do joelho**: as séries de perna registram amplitude (e
  posição dos pés no leg press); ao fim de cada exercício o app pergunta como o
  joelho respondeu; no dia seguinte, como ele acordou. A carga só sobe com
  sessão anterior sem dor, joelho bem no dia seguinte, nada alterado na última
  vez e orientação profissional permitindo — e uma variável por vez
  (repetições → amplitude → carga). Piora persistente, inchaço, instabilidade
  ou "pior no dia seguinte" 2× na semana interrompem a progressão e indicam
  procurar o profissional.
- **Relatório semanal do joelho** em `/joelho/relatorio`, exportável em PDF.

## Segurança e limites

Este app é uma **ferramenta de acompanhamento**, não uma ferramenta médica.
Ele não diagnostica, não prescreve medicamento, não cria protocolo de reabilitação
e nunca sugere treinar por cima de dor. Dor articular/tendínea é tratada de forma
diferente do desconforto muscular normal do treino. Nada de esteroides,
anabolizantes, SARMs, pró-hormonais ou "boosters" — o objetivo é 100% natural.

---

## Backup

`Ajustes → Meus dados`:

- **JSON completo** (tudo, inclusive fotos) — serve para restaurar em outro aparelho;
- **CSV por tipo** (séries, cardio, futebol, joelho, medidas, promessa, nutrição);
- **Importar** um JSON, mesclando ou substituindo.

O app também pede *persistent storage* ao navegador para o Safari não descartar
os dados. Ainda assim: exporte um backup de vez em quando.

---

## O que ficou pendente

Veja `REQUISITOS.md` — cada item do pedido original está mapeado, com o que foi
implementado e o que ficou de fora nesta primeira versão (e por quê).
