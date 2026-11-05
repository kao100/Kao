/**
 * Versão do app.
 *
 * `APP_VERSION` precisa ser igual ao `VERSION` do sw.js — é o que garante que
 * uma atualização publicada substitua o cache antigo. A tela de Ajustes mostra
 * este valor, que vem do código realmente instalado no aparelho: se o número aí
 * estiver atrás do publicado, o app está desatualizado, e não é adivinhação.
 */

export const APP_VERSION = 'kao-v18';
export const APP_DATE = '2026-11-05';

/** Mais recente primeiro. */
export const CHANGELOG = [
  {
    version: 'kao-v18',
    date: '2026-11-05',
    items: [
      'Fotos da academia corrigidas: o crucifixo e o posterior de ombro mostravam a mesma máquina — que na verdade é um supino de placas, e agora aparece no "Supino reto na máquina".',
      'Saíram 9 fotos que eram cópia de outra com nome diferente (puxada, remada, graviton, crossover, rosca, banco inclinado, leg press). Cada exercício mostra só a máquina dele.',
      'Panturrilha sentada e coice de glúteo na máquina passaram para os exercícios certos. Quem ficou sem foto real (crucifixo, posterior de ombro, remada com apoio do peito) volta a mostrar a ilustração própria até você fotografar a máquina.',
    ],
  },
  {
    version: 'kao-v17',
    date: '2026-11-04',
    items: [
      'Seletor de tempo no treino de hoje: 30 MIN, 40 MIN, 1 HORA, 1H30 e 2 HORAS. O tempo é dividido em preparação, musculação e cardio — com pouco tempo, sai primeiro o acessório; descanso e técnica não são cortados.',
      'PREPARAÇÃO PARA O TREINO: antes da primeira série, aquecimento específico (bicicleta, mobilidade, ativação e séries preparatórias calculadas da sua última carga), com imagens, instruções e cronômetro.',
      'FORTALECIMENTO DO JOELHO: amplitude e posição registradas nas séries de perna, resposta do joelho ao fim de cada exercício e no dia seguinte, e progressão de uma variável por vez.',
      'Joelho: local da dor, rigidez, dificuldade em escadas, tendência de melhora/piora e gráficos de dor × carga, × futebol e × volume semanal. Relatório semanal em PDF para o ortopedista/fisioterapeuta.',
      'Projeto Casamento — 8 semanas: supinos, puxada, remada, desenvolvimento, medidas de peito/braço/abdômen e fotos no Início. Peito passa a ter 3 estímulos por semana; costas fica em 16 séries.',
      'Cardio: bicicleta e caminhada como opções, inclinação máxima individual na esteira e histórico de sintomas.',
    ],
  },
  {
    version: 'kao-v16',
    date: '2026-09-15',
    items: [
      'Complementos: ao terminar o treino, o app pergunta se você quer somar um bloco extra — abdômen, braço, ombro, panturrilha, costas ou cardio.',
      'A sugestão é do dia: leva em conta o que você já treinou, o joelho, o jogo de amanhã e o tempo que sobrou. O que não cabe hoje aparece com o motivo.',
      'O complemento que rende mais sobe na lista: o grupo com menor volume da sua semana, desde que hoje não seja o dia dele.',
      'Se o mesmo complemento aparecer 3× em 7 dias, o app avisa que virou volume fixo e sugere pô-lo no programa, onde a progressão o enxerga.',
    ],
  },
  {
    version: 'kao-v15',
    date: '2026-09-13',
    items: [
      'Corrigido: ao terminar um exercício o app disparava o descanso longo da série antes do exercício seguinte. Agora troca de exercício tem tempo próprio — 1 min por padrão.',
      'Ajustes ganhou "Ritmo entre séries" (programado / mais rápido / bem rápido), com o custo explicado.',
      'Sábado ficou mais pesado: quadríceps subiu de 8 para 12 séries na semana, panturrilha de 6 para 10, e entrou braço direto.',
      'Domingo sem futebol virou intervalado + acessórios de baixa fadiga, nessa ordem — nada ali atrapalha a segunda.',
    ],
  },
  {
    version: 'kao-v14',
    date: '2026-09-13',
    items: [
      'Abdômen no chão: dois exercícios novos (elevação de pernas no solo e abdominal bicicleta) e core em TODOS os treinos de casa — três deles não tinham nenhum.',
      'Cardio em elíptico e simulador de escadas: cada plano diz como fazer em cada aparelho, e a escolha fica salva.',
      'Tempo por treino no perfil. O card de hoje mostra "~X min" e avisa quando passa do seu tempo — sugerindo encurtar descanso antes de cortar série.',
    ],
  },
  {
    version: 'kao-v13',
    date: '2026-09-13',
    items: [
      'Cardio com intensidade de verdade: intervalos 4×4, limiar de 20 min, 10-20-30 e Zona 2 longa de 50 min. Antes nenhum plano passava de RPE 4.',
      'Domingo sem futebol virou a sessão forte da semana (4×4). Nas semanas com jogo, o jogo continua sendo ela.',
      'Core em todos os cinco treinos: 10 → 25 séries por semana, com 6 exercícios novos e progressão do fácil ao difícil.',
      'Tríceps subiu de 5 para 10 séries e bíceps de 7 para 9 — estavam abaixo da faixa que produz crescimento.',
      'Aviso quando um cardio forte cai na véspera de jogo, ou no mesmo dia dele.',
      'Perfil ganhou "Nível": o app deixa de supor que você é iniciante.',
    ],
  },
  {
    version: 'kao-v12',
    date: '2026-09-12',
    items: [
      'Dor por exercício na tela do joelho: a média que você anotou em cada série, comparada ao seu próprio normal. Responde "este exercício me incomoda mais?" com os seus dados, não com palpite.',
      'Ciclo de treino: o programa passa a rodar em blocos de 4 a 12 semanas, com semana de adaptação, acúmulo, semana pesada e deload.',
      'No fim do bloco o app sugere o que girar — sempre dentro do mesmo padrão de movimento, nunca subindo o risco para o joelho, e nunca para um exercício que já está doendo.',
      'Exercício em que você está progredindo bem entra na lista "estes eu não mexeria": trocar o que funciona custa progresso.',
    ],
  },
  {
    version: 'kao-v11',
    date: '2026-09-12',
    items: [
      'Aba nova: Alimentação. Água em um toque, refeições por medida caseira (sem balança) e a proteína do dia contra a sua meta.',
      'Tabela com 75 alimentos do dia a dia brasileiro já embutida; dá para cadastrar os seus com os números do rótulo.',
      'Meta de proteína e de água calculadas a partir do seu peso, e editáveis. A meta de água já soma o treino do dia.',
      'Proteína e água aparecem no Início e no resumo da semana.',
      'A tela antiga de Nutrição foi substituída por esta; o link antigo continua funcionando.',
    ],
  },
  {
    version: 'kao-v10',
    date: '2026-09-12',
    items: [
      'As 4 fotos que eu tinha descartado por terem pessoas em quadro entraram (40 no total): a fileira de barras guiadas (Smith), o par abdutora + adutora, a máquina "exTender" de trás e a foto de área da quadra.',
      'Nenhuma foto ficou de fora: as pessoas foram desfocadas, e a máquina aparece inteira.',
      'A abdutora e a adutora ficam lado a lado e têm a mesma cara — a foto do par agora explica qual é qual.',
    ],
  },
  {
    version: 'kao-v9',
    date: '2026-09-11',
    items: [
      'Mais 5 fotos (36 no total): voador de braços vermelhos, supino inclinado de placas, banco inclinado com barra, banco em frente à polia e o crossover Alfa de frente.',
      'O posterior de ombro ganhou foto — falta 1: supino reto na máquina.',
      'Duas fotos tiveram pessoas do fundo desfocadas, em vez de recortadas: assim a máquina aparece inteira.',
    ],
  },
  {
    version: 'kao-v8',
    date: '2026-09-11',
    items: [
      'Mais 5 fotos da academia, da área que dá para a rua (31 no total): puxada articulada, duas barras assistidas, remada de placas, máquina de quadril com selim e rosca scott na máquina.',
      'A remada com apoio do peito ganhou foto — faltam 2.',
    ],
  },
  {
    version: 'kao-v7',
    date: '2026-09-11',
    items: [
      '"Minha academia" mostra quais exercícios do seu programa ainda estão sem foto — a lista para fotografar na próxima ida.',
      'Ajustes mostra a versão instalada e procura atualização de verdade.',
    ],
  },
  {
    version: 'kao-v6',
    date: '2026-09-11',
    items: [
      'Foto da polia alta associada ao tríceps na polia (26 máquinas no total).',
      'Foto que você apaga em "Minha academia" não volta mais na atualização seguinte.',
    ],
  },
  {
    version: 'kao-v5',
    date: '2026-09-11',
    items: [
      '25 fotos das máquinas da sua academia, já associadas aos exercícios.',
    ],
  },
  {
    version: 'kao-v4',
    date: '2026-09-11',
    items: [
      'Barra fixa nos treinos em casa: 5 exercícios novos e treinos reescritos.',
    ],
  },
  {
    version: 'kao-v3',
    date: '2026-09-11',
    items: [
      'Recordes de carga e repetição com aviso na hora.',
      'Correção e exclusão de série já registrada.',
      '"Trocar máquina" e guia de pegada visíveis durante o treino.',
      'Pergunta do joelho só em dias de perna, cardio e futebol.',
    ],
  },
];
