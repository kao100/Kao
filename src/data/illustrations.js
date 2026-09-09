/**
 * Ilustrações próprias dos exercícios (SVG desenhado à mão neste arquivo).
 *
 * Por que ilustração própria e não foto da internet:
 *  - fotos de exercícios quase sempre têm direitos autorais e não podem ser
 *    "hotlinkadas" nem copiadas sem licença;
 *  - estas ilustrações são geradas localmente, funcionam offline e não dependem
 *    de nenhum servidor externo.
 *
 * O modelo de dados ainda aceita imagens externas licenciadas e fotos das
 * máquinas da sua academia (ver data/media.js) — elas substituem estes desenhos
 * quando existirem.
 *
 * Cada chave tem duas camadas:
 *   machine  → só o equipamento (serve para reconhecer o aparelho na academia)
 *   athlete  → o boneco na posição de execução, com seta de movimento
 */

const C = {
  frame: '#39424F',
  frameLine: '#5A6878',
  pad: '#6B7787',
  stack: '#454F5D',
  floor: '#2A313A',
  body: '#C8FF4D',
  arrow: '#FF7A34',
  cable: '#8A94A3',
  cardio: '#4CC8FF',
  ball: '#48E28A',
};

/* ---------------------------- primitivas ---------------------------- */

const rect = (x, y, w, h, fill = C.frame, r = 4, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;

const line = (x1, y1, x2, y2, stroke = C.frameLine, w = 5) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;

const poly = (points, stroke = C.body, w = 7) =>
  `<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const circle = (cx, cy, r, fill = C.frameLine, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

const head = (cx, cy, r = 11) => circle(cx, cy, r, C.body);

/** Pilha de pesos (identifica máquina de placas). */
const stack = (x, y, w, h) => {
  const plates = [];
  const step = 11;
  for (let py = y + 4; py < y + h - 4; py += step) {
    plates.push(rect(x + 3, py, w - 6, step - 3, C.stack, 2));
  }
  return `${rect(x, y, w, h, '#2E353F', 5)}${plates.join('')}${line(x + w / 2, y - 8, x + w / 2, y + h - 10, C.cable, 3)}`;
};

/** Seta indicando a direção do movimento. */
const arrow = (x1, y1, x2, y2) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 9;
  const a1 = [x2 - size * Math.cos(angle - 0.5), y2 - size * Math.sin(angle - 0.5)];
  const a2 = [x2 - size * Math.cos(angle + 0.5), y2 - size * Math.sin(angle + 0.5)];
  return `${line(x1, y1, x2, y2, C.arrow, 4)}
    <polygon points="${x2},${y2} ${a1[0]},${a1[1]} ${a2[0]},${a2[1]}" fill="${C.arrow}"/>`;
};

const floor = () => line(14, 212, 306, 212, C.floor, 6);

const dumbbell = (cx, cy, len = 26) => `
  ${rect(cx - len / 2, cy - 4, len, 8, C.frameLine, 3)}
  ${rect(cx - len / 2 - 9, cy - 11, 9, 22, C.stack, 3)}
  ${rect(cx + len / 2, cy - 11, 9, 22, C.stack, 3)}`;

const barbell = (cx, cy, len = 150) => `
  ${line(cx - len / 2, cy, cx + len / 2, cy, C.frameLine, 6)}
  ${rect(cx - len / 2 - 6, cy - 20, 10, 40, C.stack, 3)}
  ${rect(cx + len / 2 - 4, cy - 20, 10, 40, C.stack, 3)}`;

/* ---------------------------- cenas ---------------------------- */

const SCENES = {
  /* ---------- Puxada alta / Lat Pulldown ---------- */
  latPulldown: {
    machine: () => `
      ${floor()}
      ${rect(250, 40, 16, 172, C.frame)}
      ${rect(150, 36, 110, 12, C.frame)}
      ${circle(158, 48, 9, C.frameLine)}
      ${line(158, 52, 158, 76, C.cable, 3)}
      ${line(120, 78, 196, 78, C.frameLine, 8)}
      ${line(126, 78, 134, 70, C.frameLine, 6)}
      ${line(190, 78, 182, 70, C.frameLine, 6)}
      ${stack(232, 96, 34, 110)}
      ${rect(112, 150, 86, 14, C.pad, 6)}
      ${rect(108, 122, 62, 12, C.pad, 6)}
      ${line(140, 134, 140, 150, C.frame, 6)}
      ${rect(120, 164, 12, 48, C.frame)}`,
    athlete: () => `
      ${head(150, 100)}
      ${poly([[150, 112], [155, 148]])}
      ${poly([[152, 118], [136, 92], [128, 78]])}
      ${poly([[152, 118], [172, 92], [182, 78]])}
      ${poly([[155, 148], [122, 154], [116, 190]])}
      ${arrow(206, 82, 206, 130)}`,
  },

  /* ---------- Puxada unilateral (um braço) ---------- */
  unilateralPulldown: {
    machine: () => `
      ${floor()}
      ${rect(252, 40, 16, 172, C.frame)}
      ${rect(160, 36, 100, 12, C.frame)}
      ${circle(168, 48, 9, C.frameLine)}
      ${line(168, 52, 168, 82, C.cable, 3)}
      ${rect(158, 82, 22, 10, C.frameLine, 4)}
      ${stack(234, 96, 34, 110)}
      ${rect(112, 152, 86, 14, C.pad, 6)}
      ${rect(120, 166, 12, 46, C.frame)}`,
    athlete: () => `
      ${head(150, 102)}
      ${poly([[150, 114], [156, 150]])}
      ${poly([[152, 120], [168, 98], [172, 86]])}
      ${poly([[152, 122], [138, 140]])}
      ${poly([[156, 150], [124, 156], [118, 192]])}
      ${arrow(200, 86, 200, 128)}`,
  },

  /* ---------- Supino reto (máquina de peito / chest press) ---------- */
  chestPress: {
    machine: () => `
      ${floor()}
      ${rect(196, 60, 16, 152, C.frame)}
      ${rect(96, 148, 108, 16, C.pad, 7)}
      ${rect(86, 108, 22, 62, C.pad, 8)}
      ${line(150, 164, 150, 200, C.frame, 8)}
      ${rect(120, 200, 70, 12, C.frame)}
      ${line(176, 118, 208, 118, C.frameLine, 7)}
      ${circle(176, 118, 8, C.frameLine)}
      ${circle(176, 140, 8, C.frameLine)}
      ${line(176, 140, 208, 140, C.frameLine, 7)}
      ${stack(214, 84, 32, 118)}`,
    athlete: () => `
      ${head(96, 96)}
      ${poly([[104, 104], [126, 132], [140, 150]])}
      ${poly([[118, 122], [150, 116], [174, 120]])}
      ${poly([[118, 128], [150, 134], [174, 140]])}
      ${poly([[140, 150], [124, 176], [124, 200]])}
      ${arrow(228, 132, 262, 132)}`,
  },

  /* ---------- Supino inclinado ---------- */
  inclinePress: {
    machine: () => `
      ${floor()}
      ${poly([[96, 186], [176, 108]], C.pad, 20)}
      ${rect(84, 176, 34, 14, C.pad, 6)}
      ${line(130, 160, 130, 204, C.frame, 9)}
      ${rect(104, 202, 74, 10, C.frame)}
      ${rect(196, 56, 14, 156, C.frame)}
      ${line(178, 92, 206, 92, C.frameLine, 7)}
      ${circle(180, 92, 8, C.frameLine)}
      ${stack(216, 80, 30, 118)}`,
    athlete: () => `
      ${head(112, 132)}
      ${poly([[120, 126], [144, 108], [160, 96]])}
      ${poly([[132, 116], [154, 96], [176, 94]])}
      ${poly([[132, 122], [152, 108], [176, 100]])}
      ${poly([[160, 96], [154, 128], [140, 148]])}
      ${arrow(232, 118, 254, 96)}`,
  },

  /* ---------- Remada sentada / Seated Cable Row ---------- */
  seatedRow: {
    machine: () => `
      ${floor()}
      ${rect(240, 96, 46, 110, C.frame, 6)}
      ${stack(248, 104, 30, 96)}
      ${line(96, 158, 240, 158, C.cable, 3)}
      ${rect(84, 150, 20, 16, C.frameLine, 4)}
      ${rect(120, 176, 92, 14, C.pad, 6)}
      ${rect(196, 190, 14, 22, C.frame)}
      ${rect(60, 168, 22, 44, C.frame, 4)}`,
    athlete: () => `
      ${head(152, 116)}
      ${poly([[152, 128], [156, 172]])}
      ${poly([[152, 136], [128, 152], [104, 158]])}
      ${poly([[156, 172], [118, 176], [92, 186]])}
      ${arrow(70, 132, 44, 132)}`,
  },

  /* ---------- Remada com apoio do peito / Chest Supported Row ---------- */
  chestSupportedRow: {
    machine: () => `
      ${floor()}
      ${poly([[128, 190], [188, 112]], C.pad, 22)}
      ${line(158, 158, 158, 204, C.frame, 9)}
      ${rect(126, 202, 70, 10, C.frame)}
      ${rect(196, 92, 14, 116, C.frame)}
      ${line(186, 126, 224, 126, C.frameLine, 7)}
      ${circle(190, 126, 8, C.frameLine)}
      ${rect(112, 194, 40, 12, C.pad, 5)}
      ${stack(224, 96, 30, 108)}`,
    athlete: () => `
      ${head(196, 96)}
      ${poly([[190, 104], [160, 136], [142, 160]])}
      ${poly([[176, 118], [186, 142], [176, 158]])}
      ${poly([[142, 160], [132, 186], [132, 204]])}
      ${arrow(230, 150, 230, 116)}`,
  },

  /* ---------- Desenvolvimento de ombros (máquina) ---------- */
  shoulderPress: {
    machine: () => `
      ${floor()}
      ${rect(190, 46, 16, 166, C.frame)}
      ${rect(114, 152, 84, 16, C.pad, 7)}
      ${rect(150, 104, 20, 56, C.pad, 8)}
      ${line(150, 168, 150, 202, C.frame, 8)}
      ${rect(120, 202, 66, 10, C.frame)}
      ${line(120, 84, 186, 84, C.frameLine, 7)}
      ${circle(124, 84, 8, C.frameLine)}
      ${circle(182, 84, 8, C.frameLine)}
      ${stack(210, 74, 32, 130)}`,
    athlete: () => `
      ${head(138, 116)}
      ${poly([[138, 128], [146, 156]])}
      ${poly([[138, 132], [118, 110], [122, 88]])}
      ${poly([[140, 132], [162, 112], [166, 88]])}
      ${poly([[146, 156], [116, 162], [110, 196]])}
      ${arrow(254, 128, 254, 90)}`,
  },

  /* ---------- Elevação lateral ---------- */
  lateralRaise: {
    machine: () => `
      ${floor()}
      ${dumbbell(60, 120, 22)}
      ${dumbbell(252, 120, 22)}
      ${rect(24, 176, 66, 34, C.frame, 5)}
      ${line(30, 186, 84, 186, C.frameLine, 3)}
      ${line(30, 198, 84, 198, C.frameLine, 3)}`,
    athlete: () => `
      ${head(156, 74)}
      ${poly([[156, 86], [156, 140]])}
      ${poly([[156, 96], [122, 100], [96, 118]])}
      ${poly([[156, 96], [190, 100], [216, 118]])}
      ${poly([[156, 140], [140, 176], [140, 208]])}
      ${poly([[156, 140], [174, 176], [174, 208]])}
      ${arrow(96, 152, 84, 116)}
      ${arrow(216, 152, 228, 116)}`,
  },

  /* ---------- Rosca bíceps ---------- */
  bicepsCurl: {
    machine: () => `
      ${floor()}
      ${dumbbell(90, 150, 24)}
      ${dumbbell(230, 150, 24)}
      ${rect(24, 182, 62, 28, C.frame, 5)}
      ${line(30, 192, 80, 192, C.frameLine, 3)}
      ${line(30, 202, 80, 202, C.frameLine, 3)}`,
    athlete: () => `
      ${head(160, 70)}
      ${poly([[160, 82], [160, 138]])}
      ${poly([[160, 92], [140, 122], [148, 100]])}
      ${poly([[160, 92], [180, 122], [172, 100]])}
      ${poly([[160, 138], [146, 174], [146, 206]])}
      ${poly([[160, 138], [176, 174], [176, 206]])}
      ${arrow(214, 140, 214, 104)}`,
  },

  /* ---------- Rosca martelo ---------- */
  hammerCurl: {
    machine: () => `
      ${floor()}
      ${rect(74, 132, 10, 30, C.frameLine, 3)}
      ${rect(64, 126, 30, 10, C.stack, 3)}
      ${rect(64, 158, 30, 10, C.stack, 3)}
      ${rect(234, 132, 10, 30, C.frameLine, 3)}
      ${rect(224, 126, 30, 10, C.stack, 3)}
      ${rect(224, 158, 30, 10, C.stack, 3)}`,
    athlete: () => `
      ${head(160, 70)}
      ${poly([[160, 82], [160, 138]])}
      ${poly([[160, 92], [142, 120], [146, 98]])}
      ${poly([[160, 92], [178, 120], [174, 98]])}
      ${poly([[160, 138], [148, 174], [148, 206]])}
      ${poly([[160, 138], [174, 174], [174, 206]])}
      ${arrow(210, 138, 210, 102)}`,
  },

  /* ---------- Tríceps na polia ---------- */
  triceps: {
    machine: () => `
      ${floor()}
      ${rect(236, 34, 16, 178, C.frame)}
      ${rect(180, 30, 70, 12, C.frame)}
      ${circle(188, 42, 9, C.frameLine)}
      ${line(188, 46, 188, 96, C.cable, 3)}
      ${line(170, 98, 208, 98, C.frameLine, 7)}
      ${stack(220, 92, 32, 116)}`,
    athlete: () => `
      ${head(142, 92)}
      ${poly([[142, 104], [146, 154]])}
      ${poly([[144, 112], [166, 116], [186, 100]])}
      ${poly([[146, 154], [132, 186], [132, 208]])}
      ${poly([[146, 154], [160, 186], [160, 208]])}
      ${arrow(96, 104, 96, 148)}`,
  },

  /* ---------- Crucifixo / Peck deck ---------- */
  pecDeck: {
    machine: () => `
      ${floor()}
      ${rect(150, 40, 16, 170, C.frame)}
      ${rect(112, 150, 90, 16, C.pad, 7)}
      ${rect(146, 96, 20, 60, C.pad, 8)}
      ${line(156, 76, 96, 92, C.frameLine, 8)}
      ${line(156, 76, 216, 92, C.frameLine, 8)}
      ${rect(86, 86, 14, 40, C.pad, 6)}
      ${rect(212, 86, 14, 40, C.pad, 6)}
      ${rect(140, 200, 40, 12, C.frame)}`,
    athlete: () => `
      ${head(158, 118)}
      ${poly([[158, 130], [158, 164]])}
      ${poly([[158, 136], [118, 130], [98, 112]])}
      ${poly([[158, 136], [198, 130], [218, 112]])}
      ${arrow(94, 156, 130, 168)}
      ${arrow(222, 156, 186, 168)}`,
  },

  /* ---------- Crossover ---------- */
  crossover: {
    machine: () => `
      ${floor()}
      ${rect(34, 40, 16, 172, C.frame)}
      ${rect(270, 40, 16, 172, C.frame)}
      ${circle(42, 54, 9, C.frameLine)}
      ${circle(278, 54, 9, C.frameLine)}
      ${line(42, 58, 118, 128, C.cable, 3)}
      ${line(278, 58, 202, 128, C.cable, 3)}
      ${stack(24, 96, 30, 108)}
      ${stack(266, 96, 30, 108)}`,
    athlete: () => `
      ${head(160, 80)}
      ${poly([[160, 92], [160, 146]])}
      ${poly([[160, 100], [134, 120], [118, 130]])}
      ${poly([[160, 100], [186, 120], [202, 130]])}
      ${poly([[160, 146], [144, 180], [144, 208]])}
      ${poly([[160, 146], [176, 180], [176, 208]])}
      ${arrow(112, 146, 148, 162)}
      ${arrow(208, 146, 172, 162)}`,
  },

  /* ---------- Posterior de ombro / Reverse fly ---------- */
  reverseFly: {
    machine: () => `
      ${floor()}
      ${rect(150, 44, 16, 166, C.frame)}
      ${rect(112, 150, 90, 16, C.pad, 7)}
      ${rect(146, 100, 20, 56, C.pad, 8)}
      ${line(158, 84, 100, 104, C.frameLine, 8)}
      ${line(158, 84, 216, 104, C.frameLine, 8)}
      ${rect(92, 98, 12, 34, C.pad, 5)}
      ${rect(212, 98, 12, 34, C.pad, 5)}`,
    athlete: () => `
      ${head(158, 116)}
      ${poly([[158, 128], [158, 162]])}
      ${poly([[158, 134], [126, 122], [102, 112]])}
      ${poly([[158, 134], [190, 122], [214, 112]])}
      ${arrow(118, 88, 90, 76)}
      ${arrow(198, 88, 226, 76)}`,
  },

  /* ---------- Leg press ---------- */
  legPress: {
    machine: () => `
      ${floor()}
      ${poly([[52, 196], [116, 150]], C.pad, 24)}
      ${rect(40, 186, 30, 22, C.pad, 6)}
      ${line(96, 172, 226, 92, C.frame, 10)}
      ${line(205, 58, 247, 126, C.frameLine, 15)}
      ${line(217, 51, 259, 119, C.stack, 10)}
      ${line(227, 45, 269, 113, C.stack, 8)}
      ${line(60, 208, 250, 208, C.frame, 8)}`,
    athlete: () => `
      ${head(70, 168)}
      ${poly([[80, 172], [118, 156]])}
      ${poly([[118, 156], [156, 140], [196, 108]])}
      ${poly([[118, 164], [158, 150], [198, 118]])}
      ${poly([[92, 166], [124, 176]])}
      ${arrow(196, 172, 236, 142)}`,
  },

  /* ---------- Cadeira extensora ---------- */
  legExtension: {
    machine: () => `
      ${floor()}
      ${rect(96, 158, 92, 16, C.pad, 7)}
      ${rect(88, 108, 20, 56, C.pad, 8)}
      ${line(140, 174, 140, 202, C.frame, 8)}
      ${rect(112, 200, 60, 12, C.frame)}
      ${circle(196, 160, 10, C.frameLine)}
      ${rect(216, 128, 16, 30, C.pad, 6)}
      ${line(196, 160, 224, 142, C.frameLine, 7)}
      ${stack(240, 110, 30, 94)}`,
    athlete: () => `
      ${head(104, 96)}
      ${poly([[104, 108], [110, 154]])}
      ${poly([[106, 116], [128, 130]])}
      ${poly([[110, 154], [166, 158], [214, 142]])}
      ${arrow(246, 180, 246, 146)}`,
  },

  /* ---------- Mesa/cadeira flexora ---------- */
  legCurl: {
    machine: () => `
      ${floor()}
      ${rect(84, 148, 132, 16, C.pad, 7)}
      ${line(150, 164, 150, 202, C.frame, 8)}
      ${rect(120, 200, 64, 12, C.frame)}
      ${circle(220, 150, 10, C.frameLine)}
      ${rect(232, 118, 16, 28, C.pad, 6)}
      ${line(220, 150, 240, 132, C.frameLine, 7)}
      ${stack(254, 104, 28, 96)}`,
    athlete: () => `
      ${head(88, 138)}
      ${poly([[100, 142], [176, 144]])}
      ${poly([[176, 144], [216, 140], [234, 124]])}
      ${poly([[120, 136], [150, 132]])}
      ${arrow(266, 176, 266, 140)}`,
  },

  /* ---------- Levantamento terra romeno / hip hinge ---------- */
  hipHinge: {
    machine: () => `
      ${floor()}
      ${dumbbell(120, 178, 24)}
      ${dumbbell(200, 178, 24)}`,
    athlete: () => `
      ${head(112, 96)}
      ${poly([[122, 100], [166, 116]])}
      ${poly([[140, 108], [140, 168]])}
      ${poly([[166, 116], [170, 154], [166, 206]])}
      ${arrow(232, 118, 232, 168)}`,
  },

  /* ---------- Panturrilha ---------- */
  calfRaise: {
    machine: () => `
      ${floor()}
      ${rect(112, 190, 96, 22, C.frame, 5)}
      ${rect(96, 90, 16, 122, C.frame)}
      ${rect(208, 90, 16, 122, C.frame)}
      ${rect(96, 86, 128, 14, C.pad, 5)}`,
    athlete: () => `
      ${head(160, 78)}
      ${poly([[160, 90], [160, 138]])}
      ${poly([[160, 96], [132, 104]])}
      ${poly([[160, 96], [188, 104]])}
      ${poly([[160, 138], [150, 172], [150, 188]])}
      ${poly([[160, 138], [172, 172], [172, 188]])}
      ${arrow(232, 150, 232, 116)}`,
  },

  /* ---------- Abdominal / prancha ---------- */
  core: {
    machine: () => `
      ${floor()}
      ${rect(70, 192, 180, 12, C.pad, 5)}`,
    athlete: () => `
      ${head(96, 150)}
      ${poly([[108, 156], [180, 172]])}
      ${poly([[108, 156], [104, 190]])}
      ${poly([[180, 172], [216, 190]])}
      ${arrow(150, 122, 150, 150)}`,
  },

  /* ---------- Esteira / cardio ---------- */
  treadmill: {
    machine: () => `
      ${floor()}
      ${poly([[70, 200], [232, 168]], C.frame, 16)}
      ${rect(226, 96, 14, 84, C.frame)}
      ${rect(196, 84, 62, 20, C.frameLine, 6)}
      ${line(60, 206, 250, 206, C.floor, 5)}
      ${circle(240, 96, 6, C.cardio)}`,
    athlete: () => `
      ${head(140, 104, 11)}
      ${poly([[140, 116], [148, 152]], C.cardio)}
      ${poly([[142, 124], [118, 136]], C.cardio)}
      ${poly([[142, 124], [166, 112]], C.cardio)}
      ${poly([[148, 152], [128, 172], [124, 188]], C.cardio)}
      ${poly([[148, 152], [172, 166], [186, 178]], C.cardio)}`,
  },

  /* ---------- Futebol ---------- */
  football: {
    machine: () => `
      ${floor()}
      ${circle(238, 190, 18, C.ball)}
      ${line(50, 92, 50, 212, C.frameLine, 5)}
      ${line(50, 92, 120, 92, C.frameLine, 5)}
      ${line(120, 92, 120, 212, C.frameLine, 5)}`,
    athlete: () => `
      ${head(160, 84, 11)}
      ${poly([[160, 96], [162, 136]], C.ball)}
      ${poly([[160, 104], [136, 118]], C.ball)}
      ${poly([[160, 104], [186, 96]], C.ball)}
      ${poly([[162, 136], [142, 168], [136, 196]], C.ball)}
      ${poly([[162, 136], [196, 156], [220, 176]], C.ball)}
      ${arrow(244, 158, 276, 140)}`,
  },

  /* ---------- Mobilidade / recuperação ---------- */
  mobility: {
    machine: () => `
      ${floor()}
      ${rect(66, 196, 188, 12, C.pad, 6)}`,
    athlete: () => `
      ${head(120, 118, 11)}
      ${poly([[128, 126], [166, 150]], '#A88BFF')}
      ${poly([[166, 150], [212, 146]], '#A88BFF')}
      ${poly([[128, 126], [176, 142]], '#A88BFF')}
      ${poly([[166, 150], [156, 186]], '#A88BFF')}
      ${arrow(232, 122, 258, 140)}`,
  },

  /* ---------- Caminhada ---------- */
  walk: {
    machine: () => `
      ${floor()}
      ${line(40, 208, 280, 190, C.floor, 6)}`,
    athlete: () => `
      ${head(146, 92, 11)}
      ${poly([[146, 104], [152, 146]], C.cardio)}
      ${poly([[148, 112], [126, 128]], C.cardio)}
      ${poly([[148, 112], [172, 122]], C.cardio)}
      ${poly([[152, 146], [130, 172], [126, 198]], C.cardio)}
      ${poly([[152, 146], [178, 170], [190, 196]], C.cardio)}`,
  },
};

const FALLBACK = {
  machine: () => `
    ${floor()}
    ${rect(112, 96, 96, 96, C.frame, 10)}
    ${line(132, 128, 188, 128, C.frameLine, 6)}
    ${line(132, 152, 188, 152, C.frameLine, 6)}`,
  athlete: () => `${head(160, 70)}${poly([[160, 82], [160, 130]])}`,
};

/**
 * Devolve a string SVG de uma ilustração.
 * @param {string} key            chave em SCENES
 * @param {object} [opts]
 * @param {boolean} [opts.athlete=true]  desenhar o boneco em execução
 */
export function illustration(key, { athlete = true } = {}) {
  const scene = SCENES[key] || FALLBACK;
  return `<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
    <g>${scene.machine()}</g>
    ${athlete ? `<g>${scene.athlete()}</g>` : ''}
  </svg>`;
}

export function hasIllustration(key) {
  return Boolean(SCENES[key]);
}

export const ILLUSTRATION_KEYS = Object.keys(SCENES);
