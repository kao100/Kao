/**
 * Versão do app.
 *
 * `APP_VERSION` precisa ser igual ao `VERSION` do sw.js — é o que garante que
 * uma atualização publicada substitua o cache antigo. A tela de Ajustes mostra
 * este valor, que vem do código realmente instalado no aparelho: se o número aí
 * estiver atrás do publicado, o app está desatualizado, e não é adivinhação.
 */

export const APP_VERSION = 'kao-v12';
export const APP_DATE = '2026-09-12';

/** Mais recente primeiro. */
export const CHANGELOG = [
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
