/**
 * Preparação para o treino — biblioteca de exercícios de aquecimento.
 *
 * Princípios (e o que fica de fora de propósito):
 *  - aquecer é subir a temperatura, soltar as articulações que o treino vai
 *    usar e ensaiar o primeiro exercício com carga menor;
 *  - nada de alongamento estático longo antes de exercício de força: segurar
 *    um alongamento por muito tempo antes de levantar peso pesado tende a
 *    reduzir a força naquela sessão. Aqui tudo é dinâmico;
 *  - amplitude sempre confortável. No joelho, o aquecimento é para preparar
 *    o tendão para a carga — não para testar a dor.
 *
 * Cada drill traz a ilustração (SVG próprio, offline), a dose e o "como".
 */

export const DRILLS = {
  /* ---------------- aquecimento cardiovascular ---------------- */
  'bike-easy': {
    name: 'Bicicleta ergométrica leve',
    illustration: 'bike',
    dose: 'ritmo fácil, RPE 2–3',
    how: [
      'Selim na altura do quadril: com o pedal embaixo, o joelho fica só levemente dobrado.',
      'Resistência baixa e cadência confortável — você conversa sem esforço.',
      'Nos últimos 30–60 s, suba um pouco a resistência para o corpo esquentar de verdade.',
    ],
    knee: 'Se o joelho incomodar, suba um pouco o selim (menos flexão) e baixe a resistência. Se mesmo assim doer, troque pela caminhada.',
  },
  'bike-gentle': {
    name: 'Bicicleta bem leve (dia de cautela)',
    illustration: 'bike',
    dose: 'resistência mínima, RPE 2',
    how: [
      'Selim um pouco mais alto que o normal: menos dobra no joelho.',
      'Resistência quase zero. O objetivo é aquecer o tendão, não cansar.',
      'Se houver dor durante a pedalada, pare e faça a caminhada leve no lugar.',
    ],
    knee: 'Pedalada leve costuma ser bem tolerada, mas é a sua resposta que manda — não a regra.',
  },
  'walk-easy': {
    name: 'Caminhada leve (esteira plana ou elíptico)',
    illustration: 'walk',
    dose: 'ritmo de passeio, RPE 2–3',
    how: [
      'Esteira sem inclinação ou com pouca inclinação, ou elíptico com resistência baixa.',
      'Passada natural, braços soltos.',
    ],
    knee: 'Inclinação não é obrigatória para aquecer: escolha o que for confortável hoje.',
  },
  'march-home': {
    name: 'Marcha no lugar / subir e descer um degrau devagar',
    illustration: 'walk',
    dose: 'ritmo leve',
    how: [
      'Marcha elevando os joelhos até a altura confortável, braços acompanhando.',
      'Se tiver escada: suba e desça um degrau devagar, alternando a perna que sobe.',
    ],
    knee: 'Degrau só se não doer. Marcha no lugar é a opção de menor carga.',
  },

  /* ---------------- mobilidade dinâmica — tronco superior ---------------- */
  'arm-circles': {
    name: 'Círculos de braço',
    illustration: 'armCircles',
    dose: '10 para frente + 10 para trás',
    how: [
      'Braços abertos na altura dos ombros.',
      'Comece com círculos pequenos e vá aumentando até o maior círculo confortável.',
    ],
  },
  'scap-pushup': {
    name: 'Flexão escapular',
    illustration: 'pushUp',
    dose: '10 repetições',
    how: [
      'Em posição de prancha alta (ou com as mãos num banco), braços esticados.',
      'Sem dobrar os cotovelos, deixe o peito descer entre as escápulas e depois empurre o chão para afastá-las.',
    ],
  },
  'band-pull-apart': {
    name: 'Afastar o elástico (ou crucifixo invertido bem leve)',
    illustration: 'bandPullApart',
    dose: '12–15 repetições',
    how: [
      'Braços esticados à frente, elástico na largura dos ombros.',
      'Abra os braços levando as escápulas para trás e para baixo, sem encolher os ombros.',
      'Sem elástico: a máquina de posterior de ombro com a placa mais leve faz o mesmo papel.',
    ],
  },
  'thoracic-rotation': {
    name: 'Rotação de tronco em quatro apoios',
    illustration: 'mobility',
    dose: '6 por lado',
    how: [
      'Em quatro apoios, mão atrás da cabeça.',
      'Gire o tronco levando o cotovelo para o teto, acompanhando com o olhar. Volte devagar.',
    ],
  },

  /* ---------------- ativação — tronco superior ---------------- */
  'external-rotation': {
    name: 'Rotação externa de ombro (elástico ou polia leve)',
    illustration: 'reverseFly',
    dose: '12 por lado, bem leve',
    how: [
      'Cotovelo colado ao corpo, dobrado a 90°.',
      'Gire o antebraço para fora sem afastar o cotovelo da cintura.',
      'É ativação: a carga é quase nenhuma.',
    ],
  },
  'light-pushup': {
    name: 'Flexão de braço leve',
    illustration: 'inclinePushUp',
    dose: '8–10, longe da falha',
    how: [
      'Mãos num banco ou na barra do Smith para ficar fácil.',
      'Desça controlado sentindo o peito alongar e suba sem pressa.',
    ],
  },
  'scap-pulldown': {
    name: 'Puxada escapular',
    illustration: 'latPulldown',
    dose: '10–12, carga leve',
    how: [
      'Na puxada alta, braços esticados.',
      'Sem dobrar os cotovelos, puxe só as escápulas para baixo e solte. É o primeiro centímetro de toda puxada.',
    ],
  },
  'straight-arm-pulldown': {
    name: 'Pulldown com braço estendido (leve)',
    illustration: 'latPulldown',
    dose: '12, carga leve',
    how: [
      'Na polia alta, em pé, braços quase esticados.',
      'Leve a barra até as coxas num arco, sentindo a lateral das costas. Volte devagar.',
    ],
  },
  'face-pull-light': {
    name: 'Posterior de ombro leve',
    illustration: 'reverseFly',
    dose: '12–15, carga leve',
    how: [
      'Voador invertido ou polia na altura do rosto, carga bem baixa.',
      'Abra os braços para trás sem encolher os ombros.',
    ],
  },
  'light-arm-pair': {
    name: 'Rosca e tríceps leves',
    illustration: 'bicepsCurl',
    dose: '1 série de 12–15 de cada, ~50% da carga',
    how: [
      'Uma série fácil de rosca e uma de tríceps na polia.',
      'Serve para o cotovelo chegar quente às séries pesadas.',
    ],
  },

  /* ---------------- mobilidade dinâmica — pernas ---------------- */
  'leg-swing-front': {
    name: 'Balanço de perna para frente e para trás',
    illustration: 'legSwing',
    dose: '10 por perna',
    how: [
      'Apoie a mão numa parede ou máquina.',
      'Balance a perna para frente e para trás, aumentando a amplitude aos poucos.',
      'Joelho solto — o movimento é do quadril.',
    ],
  },
  'leg-swing-side': {
    name: 'Balanço lateral de perna',
    illustration: 'legSwing',
    dose: '10 por perna',
    how: [
      'De frente para a parede, mãos apoiadas.',
      'Balance a perna de um lado para o outro, cruzando à frente do corpo.',
    ],
  },
  'ankle-rock': {
    name: 'Mobilidade de tornozelo na parede',
    illustration: 'ankleRock',
    dose: '10 por lado',
    how: [
      'Um pé à frente, perto da parede, calcanhar no chão.',
      'Leve o joelho em direção à parede sem tirar o calcanhar do chão, e volte.',
      'Tornozelo travado faz o joelho trabalhar mais no agachamento e no leg press.',
    ],
    knee: 'Amplitude só até onde não houver dor na frente do joelho.',
  },
  'hip-openers': {
    name: 'Abertura de quadril em pé',
    illustration: 'mobility',
    dose: '6 por lado',
    how: [
      'Em pé, eleve o joelho e desenhe um círculo para fora ("abrir o portão").',
      'Depois o contrário ("fechar o portão").',
    ],
  },
  'partial-squat': {
    name: 'Agachamento livre parcial',
    illustration: 'boxSquat',
    dose: '8–10, amplitude confortável',
    how: [
      'Sem peso, desça só até onde o joelho estiver confortável — pode ser bem pouco.',
      'Aumente a profundidade aos poucos ao longo das repetições, se não houver dor.',
    ],
    knee: 'Não é teste de dor: se incomodar, reduza a amplitude ou pule.',
  },

  /* ---------------- ativação — pernas ---------------- */
  'glute-bridge-act': {
    name: 'Ponte de glúteo',
    illustration: 'gluteBridge',
    dose: '10–12, segurando 2 s em cima',
    how: [
      'Deitado, joelhos dobrados, pés no chão.',
      'Suba o quadril apertando o glúteo, segure e desça devagar.',
    ],
  },
  'band-walk-act': {
    name: 'Caminhada lateral com miniband',
    illustration: 'lateralWalk',
    dose: '10 passos para cada lado',
    how: [
      'Miniband acima dos joelhos, meio agachamento alto.',
      'Passos curtos para o lado sem deixar os joelhos se fecharem.',
    ],
  },
  'calf-raise-act': {
    name: 'Elevação de panturrilha',
    illustration: 'calfRaise',
    dose: '12–15, sem peso',
    how: ['Em pé, suba na ponta dos pés e desça devagar.'],
  },
  'iso-guided': {
    name: 'Isometria orientada pelo profissional',
    illustration: 'wallSit',
    dose: 'conforme a sua orientação',
    how: [
      'Só aparece porque as suas orientações liberam uma isometria (cadeira extensora, parede ou agachamento espanhol).',
      'Use o ângulo, a carga e o tempo que o profissional indicou.',
    ],
    knee: 'Se a isometria doer mais do que o combinado, pare e registre.',
  },

  /* ---------------- futebol ---------------- */
  'jog-easy': {
    name: 'Trote leve',
    illustration: 'walk',
    dose: '3 min',
    how: ['Trote leve em volta do campo, aumentando o ritmo aos poucos.'],
  },
  'accelerations': {
    name: 'Acelerações progressivas',
    illustration: 'walk',
    dose: '3–4 tiros de 15–20 m',
    how: [
      'Cada tiro um pouco mais rápido que o anterior: 50%, 70%, 80%.',
      'Volte andando. Inclua uma frenagem controlada e uma mudança de direção leve.',
    ],
    knee: 'Frenagem e mudança de direção são o que mais cobra do tendão: comece suave.',
  },
};

/**
 * Ativação específica por ênfase do treino de superiores.
 * A ordem dentro de cada lista é a ordem em que entram.
 */
export const UPPER_ACTIVATION = {
  chest: ['scap-pushup', 'external-rotation', 'light-pushup'],
  back: ['scap-pulldown', 'straight-arm-pulldown', 'band-pull-apart'],
  shoulders: ['external-rotation', 'face-pull-light', 'band-pull-apart'],
  arms: ['light-arm-pair', 'external-rotation'],
};

export const UPPER_MOBILITY = ['arm-circles', 'band-pull-apart', 'thoracic-rotation'];
export const LOWER_MOBILITY = ['leg-swing-front', 'leg-swing-side', 'ankle-rock', 'hip-openers', 'partial-squat'];
export const LOWER_ACTIVATION = ['glute-bridge-act', 'band-walk-act', 'calf-raise-act'];

/** Exercícios de casa: sem máquina, sem elástico obrigatório. */
export const HOME_UPPER_ACTIVATION = ['scap-pushup', 'light-pushup'];

/** Isometrias que, se liberadas nas orientações, entram na ativação de pernas. */
export const GUIDED_ISOMETRIC_IDS = ['leg-extension-iso', 'wall-sit', 'spanish-squat'];

/** Aquecimento de campo antes do futebol. */
export const FOOTBALL_PREP = [
  { kind: 'cardio', title: 'Trote leve', minutes: 3, drills: ['jog-easy'] },
  { kind: 'mobility', title: 'Mobilidade dinâmica', minutes: 3, drills: ['leg-swing-front', 'leg-swing-side', 'hip-openers'] },
  { kind: 'activation', title: 'Ativação de glúteo', minutes: 2, drills: ['glute-bridge-act', 'band-walk-act'] },
  { kind: 'ramp', title: 'Acelerações progressivas', minutes: 2, drills: ['accelerations'] },
];
