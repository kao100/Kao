# Kao Training

Aplicativo pessoal de treino — personal training digital e diário de treinamento.
Feito para **uma pessoa só**, com prioridade em praticidade dentro da academia:
musculação + condicionamento + futebol + recuperação, com acompanhamento do
joelho esquerdo (tendão patelar) e da promessa de **30 minutos de exercício todos os dias**.

PWA instalável, funciona offline, dados 100% locais no aparelho.

---

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

`Settings → Pages → Deploy from a branch` apontando para a branch e a pasta raiz.
Todos os caminhos do app são relativos (`./`), então funciona em subdiretório.

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
  data/               conteúdo (sementes)
    exercises.js      biblioteca de exercícios com ficha completa
    program.js        programa semanal inicial + planos de cardio
    illustrations.js  ilustrações SVG próprias de cada exercício
    media.js          resolução de imagem (foto da academia > externa > SVG)
    seed.js           primeira execução (perfil, programa, suplementos)
  logic/              regras de negócio, sem DOM
    planner.js        que treino aparece em cada dia (futebol, sábado, joelho)
    progression.js    progressão dupla
    knee.js           status do joelho, orientações médicas, séries de dor
    readiness.js      check-in de recuperação (🟢🟡🔴)
    report.js         resumo semanal e painel de evolução
    backup.js         exportar/importar JSON e CSV
  ui/
    shell.js          layout, topbar, tab bar, blocos comuns
    components/       sheet, toast, gráficos SVG, inputs grandes, figuras
    views/            uma tela por arquivo
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
| `equipment` | fotos das máquinas da sua academia |
| `supplements` | creatina, whey… |
| `nutrition` | calorias, macros, água (opcional) |
| `dailyLog` | minutos do dia e promessa cumprida |
| `dayPlan` | resposta de "vai ter futebol?" por data |

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

---

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
