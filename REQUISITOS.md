# Checklist dos requisitos

Mapeamento item a item do pedido original. ✅ implementado · ⚠️ implementado com
limitação · ⏳ estrutura pronta, faltando dados/uso · ❌ não implementado.

| # | Requisito | Status | Onde / observação |
|---|---|---|---|
| 1 | Objetivo geral (plano, dia certo, execução visual, registro, progressão, cardio, futebol, frequência, corpo, dor, futebol adapta plano, joelho, híbrido, evolução) | ✅ | app inteiro |
| 2 | Perfil permanente (79 kg, 1,77 m, 3 meses, objetivos, natural) | ✅ | `data/seed.js`, Ajustes → Perfil |
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
| 27 | Suplementação (creatina Vitafor, whey DUX; sem substâncias proibidas) | ✅ | `/suplementos` |
| 28 | Espaço de nutrição (kcal, macros, água) sem virar app de dieta | ✅ | `/nutricao` |
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
| 44 | Dados iniciais (peso, altura, suplementos, futebol, objetivos, restrição, programa) | ✅ | `data/seed.js` |
| 45 | Lower A/B editáveis e provisórios, sem inventar tratamento | ✅ | flag `provisional` + avisos |
| 46 | Experiência final desejada (chegar, ver "Hoje — Upper B", registrar série, descansar, cardio guiado, treino concluído) | ✅ | fluxo testado ponta a ponta |
| 47 | Modularidade para receber fotos, cargas, orientações, dor, medidas | ✅ | tudo por store, nada hardcoded na UI |
| 48 | Revisão final e pendências declaradas | ✅ | este arquivo |

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
6. **Banco de alimentos na nutrição** — só registro manual de kcal/macros/água,
   como pedido no item 28.
7. **Alertas sonoros com a tela bloqueada** — o app usa wake lock para manter a
   tela acesa durante treino e cardio; com o aparelho bloqueado o iOS suspende o
   áudio (limitação do sistema, não do app). O cronômetro continua correto porque
   é calculado por timestamp.
