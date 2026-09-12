# Checklist dos requisitos

Mapeamento item a item do pedido original. ✅ implementado · ⚠️ implementado com
limitação · ⏳ estrutura pronta, faltando dados/uso · ❌ não implementado.

| # | Requisito | Status | Onde / observação |
|---|---|---|---|
| 1 | Objetivo geral (plano, dia certo, execução visual, registro, progressão, cardio, futebol, frequência, corpo, dor, futebol adapta plano, joelho, híbrido, evolução) | ✅ | app inteiro |
| 2 | Perfil permanente (peso, altura, tempo de treino, objetivos, treino natural) | ✅ | cadastro de primeiro uso (`ui/views/onboarding.js`) e Ajustes → Perfil |
| 3 | Promessa de 30 min/dia + streak 🔥 | ✅ | `store.recomputeDay`, `promiseStreak`, hero do Início |
| 4 | Futebol: quinta fixo, domingo pergunta, sábado ajusta | ✅ | `logic/planner.js` (testado) |
| 5 | Joelho: registro 0–10, dor no movimento, inchaço, instabilidade, gráfico, comparação com treino/futebol/volume, área de orientações médicas com prioridade | ✅ | `logic/knee.js`, telas `/joelho` e `/medico` |
| 6 | Filosofia híbrida (musculação primeiro, cardio depois, sem HIIT desnecessário) | ✅ | programa + textos das telas Programa/Cardio |
| 7 | Estrutura semanal inicial (Seg–Dom) | ✅ | `data/program.js` |
| 8 | Upper A (8 exercícios, séries/faixas) | ✅ | `tpl-upper-a` |
| 9 | Lower A provisório, sem assumir agachamento/avanço/búlgaro | ✅ | `tpl-lower-a`, itens marcados `provisional` |
| 10 | Upper B com ênfase em costas | ✅ | `tpl-upper-b` |
| 11 | Cardio de quarta com as 4 fases, RPE 3–4, talk test, controles | ✅ | `cardio-zona2-30` + tela de cardio guiado |
| 12 | Quinta: futebol com duração, intensidade, gols, distância, calorias, joelho antes/depois; conta para a promessa | ✅ | `/futebol` |
| 13 | Upper C | ✅ | `tpl-upper-c` |
| 14 | Sábado condicional (Lower B + cardio leve OU recuperação) | ✅ | `planner` + `tpl-lower-b` / `tpl-recuperacao` |
| 15 | Domingo condicional (futebol ou Zona 2 30–40 min) | ✅ | `tpl-domingo-*` |
| 16 | Ficha visual completa por exercício (todos os campos pedidos) | ✅ | `data/exercises.js` + `/exercicio/:id` |
| 17 | Imagens: sem copyright/hotlinking; licença, crédito, fonte e fallback | ⚠️ | O app **não baixa imagens da internet**. Ele usa ilustrações SVG próprias (offline, sem licença de terceiros) e permite cadastrar imagem externa informando URL, fonte, crédito e licença — com fallback automático para a ilustração própria se a imagem falhar (`data/media.js`, botão "Imagem externa"). Busca automática por imagens ficou de fora de propósito: quase todo resultado tem direito autoral. |
| 18 | "Minha academia": fotos das máquinas, marca/modelo, substituir imagem genérica | ✅ | `/academia`, prioridade em `resolveExerciseMedia` |
| 19 | Modo treino (um exercício por vez, carga/reps/RIR/dor, finalizar série, descanso automático, +30s, pular) | ✅ | `/treinar/:id` |
| 20 | Progressão dupla com confirmação manual | ✅ | `logic/progression.js` (testado) |
| 21 | Histórico: carga×data, volume×data, reps×data, melhor série, recordes | ✅ | `/progresso/:exerciseId` |
| 22 | RIR 0–3 com alvo 1–2 | ✅ | templates, modo treino, textos |
| 23 | Descansos configuráveis (compostos 2–3 min, isoladores 1–2 min) | ✅ | Ajustes + por exercício no editor |
| 24 | Dashboard (treino de hoje, 30 min, streak, semana, peso) | ✅ | `/` |
| 25 | Meu físico: medidas, fotos, antes × agora, sem estimativa de %G por foto | ✅ | `/fisico` |
| 26 | Recomposição: acompanhar peso, cintura, medidas, fotos, força, volume, condicionamento | ✅ | `/fisico` + `/progresso` + resumo semanal |
| 27 | Suplementação (creatina, whey, marca a escolher; sem substâncias proibidas) | ✅ | `/suplementos` + cadastro inicial |
| 28 | Espaço de nutrição (kcal, macros, água) sem virar app de dieta | ✅ | aba **Alimentação** (`/alimentacao`): água, refeições, proteína e calorias, com 75 alimentos e medida caseira. Ampliado a pedido seu na nona rodada — o pedido original excluía dieta |
| 29 | Alerta de recuperação 🟢🟡🔴 | ✅ | `logic/readiness.js`, sheet antes do treino |
| 30 | Calendário mensal com ícones e detalhe do dia | ✅ | `/calendario`, `/dia/:date` |
| 31 | Timeline de cardio com aviso de troca de fase | ✅ | tela de cardio (bipe + vibração + aviso) |
| 32 | Ajuste do cardio: RPE, talk test, FC, sugerir reduzir se intenso demais | ✅ | sheet de encerramento do cardio |
| 33 | Design moderno, dark, cards grandes, uso com uma mão | ✅ | `styles/` |
| 34 | PWA iOS: manifest, ícone, splash, safe areas, offline | ⚠️ | Manifest, ícones (192/512/maskable/apple-touch), safe areas e cache offline prontos. O iOS gera a splash a partir do ícone + `background_color`; **não** foram geradas as imagens `apple-touch-startup-image` por tamanho de aparelho (opcional, e cada modelo exige um PNG específico). |
| 35 | Persistência robusta + exportar JSON/CSV + importar | ✅ | IndexedDB + `logic/backup.js` + Ajustes |
| 36 | Entidades do modelo de dados | ✅ | ver tabela no README |
| 37 | Treinos totalmente editáveis (trocar, remover, adicionar, séries, reps, descanso, RIR, ordem, máquina, observações) | ✅ | `/programa/:templateId` + troca pontual no modo treino |
| 38 | Painel de evolução com métricas reais | ✅ | `/progresso` |
| 39 | Relatório semanal com progressos, joelho, peso, cintura e observações conservadoras | ✅ | `/semana` |
| 40 | "Como fazer?" em linguagem de iniciante + variações de máquina | ✅ | campo `beginner` + `variations` |
| 41 | Estrutura pronta para fotos reais das máquinas | ✅ | store `equipment`, sem refatoração futura |
| 42 | Segurança: sem "ignore a dor", dor articular ≠ muscular | ✅ | textos revisados em todas as telas |
| 43 | Aplicação funcional (não mockup), componentes reutilizáveis, sem monólito | ✅ | ~30 módulos, camadas core/logic/ui |
| 44 | Dados iniciais (peso, altura, suplementos, futebol, objetivos, restrição, programa) | ✅ | perguntados no primeiro uso e gravados só no aparelho — o repositório é público, então nenhum dado pessoal fica no código |
| 45 | Lower A/B editáveis e provisórios, sem inventar tratamento | ✅ | flag `provisional` + avisos |
| 46 | Experiência final desejada (chegar, ver "Hoje — Upper B", registrar série, descansar, cardio guiado, treino concluído) | ✅ | fluxo testado ponta a ponta |
| 47 | Modularidade para receber fotos, cargas, orientações, dor, medidas | ✅ | tudo por store, nada hardcoded na UI |
| 48 | Revisão final e pendências declaradas | ✅ | este arquivo |

## Adições posteriores ao pedido original

| Requisito | Status | Onde |
|---|---|---|
| Alternativa para o leg press (e para todo exercício) | ✅ | mapa `ALTERNATIVES` em `data/exercises.js`; seção "Alternativas" na ficha; alternativas no topo da troca do modo treino e do editor do programa |
| Treino alternativo para os dias sem academia (calistenia / peso do corpo) | ✅ | `HOME_TEMPLATES` em `data/program.js` (Upper A/B/C e Lower A/B em casa), planos `cardio-casa-30` e `cardio-casa-20`, alternador 🏋️/🏠 no card de hoje e na tela do dia |

Como funciona a progressão em casa: sem placas para adicionar, a progressão
dupla continua valendo pelas repetições — ao chegar no topo da faixa em todas as
séries, o próximo passo é a variação mais difícil (mãos mais baixas, pés
elevados, corpo mais horizontal, mochila mais pesada), registrada como um novo
exercício ou anotada na observação da série.

## Melhorias da terceira rodada (uso real)

| Ideia | Status | Onde |
|---|---|---|
| Corrigir uma série já registrada durante o treino | ✅ | toque na série no modo treino → editar carga/reps/RIR/dor ou excluir |
| Botões visíveis de "Série extra" e "Encerrar exercício" | ✅ | antes ficavam escondidos no menu ⋯ |
| Reconhecimento ao bater recorde | ✅ | `logic/records.js` + store `achievements`: aviso na hora, resumo pós-treino, lista em Progresso e 🏆 no resumo semanal |
| Instrução de pegada, barra, cotovelo e abdômen | ✅ | `SETUP` em `data/exercises.js` (30 exercícios): linha rápida no modo treino + card completo na ficha, com o que muda em cada variação |
| Alternativa de máquina quando o aparelho está ocupado | ✅ | botão "🔁 Trocar máquina" direto na tela de treino (o recurso existia, estava escondido no menu) |
| Pergunta do joelho só em dias de perna/futebol | ✅ | `openReadinessSheet({ includeKnee })` — dias de superiores não perguntam mais |
| Atualização automática do app | ✅ | `main.js` detecta versão nova publicada e recarrega sozinho uma vez |

## Barra fixa em casa (quarta rodada)

| Item | Status | Onde |
|---|---|---|
| Exercícios de barra fixa | ✅ | `pull-up`, `chin-up`, `negative-pull-up`, `hanging-knee-raise`, `dead-hang` — ficha completa, pegada/posicionamento e ilustração própria |
| Progressão para a primeira barra | ✅ | suspensão → negativa (descida de 3–5 s) → supinada → pronada, encadeada pelas alternativas de cada exercício |
| Treinos em casa usando a barra | ✅ | Upper A/B/C em casa com barra e barra supinada; Lower A/B em casa com elevação de joelhos na barra |
| "O que eu tenho em casa" | ✅ | Ajustes → lista de equipamentos; sem barra fixa marcada, o modo em casa avisa e aponta as alternativas |
| Migração que respeita edições | ✅ | `seed.js` v3 só reescreve o treino em casa que continua idêntico ao de fábrica; treino editado fica intacto |

## Fotos reais das máquinas (quinta rodada)

26 fotos da academia entram em "Minha academia" já associadas aos exercícios
(`data/gym-equipment.js` + `assets/gym/`). Elas substituem a ilustração do
equipamento na ficha e no modo treino.

- identificadas por etiqueta na máquina: extensora, abdutora, multi-hip;
- identificadas pela imagem (marcadas com "confirmar" no app): as demais;
- fotos de área geral e com outras pessoas em quadro foram descartadas; uma foi
  recortada para tirar pessoas do fundo;
- a semente é idempotente: foto que você apagar ou reassociar não volta.

A polia alta do tríceps entrou depois, recortada de uma foto de área que eu
tinha descartado — o recorte pega só a coluna de cabos, sem ninguém no quadro.

Uma sexta rodada trouxe mais 5 fotos, da área da academia que dá para a rua:
puxada de braços articulados, duas barras assistidas lado a lado, remada de
placas com apoio para o peito, máquina de quadril com selim e rosca scott na
máquina. Duas delas foram recortadas para tirar pessoas do quadro. São 31 no
total.

**Nenhuma foto ficou de fora.** Na oitava rodada você pediu para usar todas,
inclusive as que tinham pessoas, desfocando-as se possível. As 4 que eu havia
descartado entraram: a fileira de barras guiadas (Smith), o par abdutora +
adutora, a máquina "exTender" vista de trás e a foto de área ao lado da quadra.
São **40 fotos e 40 associações** — uma para cada imagem enviada.

Sobre pessoas em quadro: o método passou a ser desfoque por região, não recorte.
O recorte tirava junto os braços das máquinas, que é justamente o que permite
reconhecê-las. Todas as fotos publicadas foram conferidas visualmente depois do
desfoque.

Uma sétima rodada trouxe mais 5 (36 no total): voador de braços vermelhos,
supino inclinado de placas, banco inclinado com barra, banco em frente à polia e
o crossover Alfa 2050 de frente. Aqui as duas fotos com pessoas ao fundo foram
**desfocadas** em vez de recortadas: o recorte tirava junto os braços da
máquina, que é justamente o que permite reconhecê-la.

Exercício do programa ainda sem foto: supino reto na máquina. A remada com apoio
do peito e o posterior de ombro saíram da lista — elevação
lateral e rosca martelo, que eu tinha listado antes, são com halteres e não
dependem de aparelho específico. A tela "Minha academia" calcula essa lista
sozinha a partir do programa, então ela não depende de eu manter este texto em
dia.

## Alimentação (nona rodada)

O pedido original dizia "sem funcionalidades de dieta". Você mudou isso
explicitamente: proteína, água e calorias são o que sustenta o treino, e viraram
uma aba própria. O que ficou:

- **Água em um toque** — copo (250 ml), garrafa (500 ml) ou litro. A meta sai de
  35 ml/kg **mais** o treino do dia: o planejador diz se há musculação, cardio ou
  futebol, e a meta sobe junto.
- **Refeições por medida caseira** — 7 horários (café, lanches, almoço,
  pós-treino, jantar, ceia). Você busca "frango", escolhe "1 filé médio" e
  pronto: nada de balança. O app abre no horário provável pelo relógio.
- **75 alimentos embutidos** (`data/foods.js`), agrupados: proteínas,
  carboidratos, feijões, laticínios, frutas, legumes, gorduras, bebidas,
  suplementos e pratos prontos (marmita, x-salada, açaí, pão de queijo).
  Valores por 100 g de tabelas de composição.
- **Seus alimentos** — "Novo alimento" cadastra com os números do rótulo, que
  sempre ganham da tabela. Ficam salvos para as próximas vezes.
- **"Você registrou recentemente"** — os alimentos mais frequentes dos últimos
  30 dias aparecem antes de você digitar qualquer coisa.
- **Meta de proteína** — 1,6–2,2 g/kg é a faixa de referência para hipertrofia;
  a meta usa o piso e é editável. Sem peso registrado, o app diz isso em vez de
  inventar número.
- **Onde aparece** — cartão de proteína e água no Início, seção no resumo da
  semana (média só dos dias registrados) e gráfico de 14 dias na aba.
- **Exportação** — CSV item a item e CSV por dia; o JSON completo já pega tudo.

Limite mantido: o app **acompanha, não prescreve**. As metas são estimativas a
partir do seu peso, não uma dieta, e a tela diz isso e aponta nutricionista para
plano individual. Nenhuma recomendação de substância — a regra dos 100% natural
vale aqui também.

Dia sem registro não conta como zero em nenhuma média: em branco significa
desconhecido, e tratar como zero desanima sem motivo.

## Ciclos de treino e dor por exercício (décima rodada)

Duas perguntas suas viraram funcionalidade.

**"Com problema no joelho, ainda vale fazer leg press?"** — nenhum app pode
responder isso no abstrato, e este não vai fingir que pode. O que dá para fazer
é responder com os seus próprios registros: `/joelho` ganhou a seção **Dor por
exercício**, que soma a dor que você anotou em cada série e compara com a sua
média nos outros exercícios de perna — não com uma tabela. Um exercício só ganha
leitura depois de 6 séries (`MIN_SETS_FOR_READING`): menos que isso fala do dia,
não do exercício. O rótulo é deliberadamente conservador ("acima do seu normal",
nunca "pare"), e o texto manda levar a tela à consulta.

**"Não é ruim fazer sempre o mesmo treino?"** — é meio mito e meio verdade, e o
app agora explica os dois lados em `/ciclo`. O que faz crescer é sobrecarga
progressiva, não novidade; trocar toda semana impede saber se você ficou mais
forte. Mas variar poupa a articulação, atinge porções diferentes do músculo e
evita enjoo. A conciliação implementada: **o padrão fica, a variante gira** —
blocos de 4 a 12 semanas (padrão 6), com adaptação, acúmulo, semana pesada e
deload, e sugestão de rotação só no fim.

Regras da rotação (`logic/cycle.js`), em ordem:

1. só sugere alternativas já cadastradas do exercício, que respeitam o mesmo
   padrão de movimento;
2. nunca sugere uma alternativa com `kneeRisk` maior que a do exercício atual;
3. nunca sugere trocar **para** um exercício que os seus registros mostram acima
   do seu normal de dor;
4. exercício com dor acima do normal ou com carga travada há 3+ semanas sobe ao
   topo com o motivo escrito;
5. exercício em que a carga está subindo entra em "estes eu não mexeria".

Nada é aplicado sozinho: a troca é um toque seu, e o histórico do exercício
antigo continua salvo — voltando a ele, as cargas antigas estão lá.

## Pendências assumidas nesta versão

1. **Imagens fotográficas dos exercícios** — o app entrega ilustrações próprias
   (SVG, offline). Fotos reais entram por "Minha academia" (suas fotos) ou pelo
   cadastro de imagem externa com licença e crédito. Nenhuma imagem de terceiros
   foi embutida.
2. **Splash screens específicas do iOS** — o iOS usa ícone + cor de fundo. Gerar
   os `apple-touch-startup-image` por modelo é opcional e ficou de fora.
3. **Notificações/lembretes** — PWA no iOS tem suporte limitado e exige
   permissão + app instalado; não implementado.
4. **Sincronização em nuvem / multi-dispositivo** — por escolha de projeto os
   dados são locais. A migração é feita por backup JSON.
5. **Integração com Apple Health / relógio** — frequência cardíaca, distância e
   calorias são digitadas manualmente.
6. ~~**Banco de alimentos na nutrição**~~ — **resolvido na v11.** A aba
   Alimentação traz 75 alimentos do dia a dia brasileiro com medida caseira,
   busca, registro por refeição, água em um toque e meta de proteína calculada
   do peso. Ver a seção "Alimentação" abaixo.
7. **Alertas sonoros com a tela bloqueada** — o app usa wake lock para manter a
   tela acesa durante treino e cardio; com o aparelho bloqueado o iOS suspende o
   áudio (limitação do sistema, não do app). O cronômetro continua correto porque
   é calculado por timestamp.
