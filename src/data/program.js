/**
 * Programa semanal inicial (100% editável dentro do app).
 *
 * Os treinos ficam salvos no banco como `templates`; este arquivo é apenas a
 * semente da primeira execução. Depois disso, tudo pode ser alterado na tela
 * "Programa" — inclusive os treinos de perna, que são provisórios enquanto
 * houver acompanhamento médico do joelho.
 */

const item = (exerciseId, sets, repMin, repMax, opts = {}) => ({
  exerciseId,
  sets,
  repMin,
  repMax,
  rir: opts.rir ?? 2,
  restSec: opts.restSec ?? 120,
  notes: opts.notes || '',
  timeBased: opts.timeBased || false,   // prancha, isometrias
  durationSec: opts.durationSec || null,
  provisional: opts.provisional || false, // sujeito à avaliação do joelho
});

/* ------------------------------------------------------------------ */
/* Planos de cardio (esteira)                                           */
/* ------------------------------------------------------------------ */

export const CARDIO_PLANS = [
  {
    id: 'cardio-zona2-30',
    name: 'Zona 2 inclinada — 30 min',
    context: 'Quarta-feira, depois do Upper B',
    totalMin: 30,
    rpe: '3–4 / 10',
    talkTest: 'Você deve conseguir conversar em frases completas, mas não cantar confortavelmente.',
    phases: [
      { label: 'Aquecimento', fromMin: 0, toMin: 5, speedMin: 5.0, speedMax: 5.0, incline: 2, note: 'Solta o corpo, respiração tranquila.' },
      { label: 'Subida gradual', fromMin: 5, toMin: 10, speedMin: 5.2, speedMax: 5.2, incline: 5, note: 'Aumente a inclinação para 5%.' },
      { label: 'Bloco principal', fromMin: 10, toMin: 25, speedMin: 5.2, speedMax: 5.5, incline: 7, note: 'Mantenha o RPE em 3–4. Ajuste se passar disso.' },
      { label: 'Volta à calma', fromMin: 25, toMin: 30, speedMin: 4.5, speedMax: 5.0, incline: 2, note: 'Reduza inclinação e velocidade.' },
    ],
  },
  {
    id: 'cardio-leve-25',
    name: 'Cardio leve — 25 min',
    context: 'Sábado, depois do Lower B',
    totalMin: 25,
    rpe: '3 / 10',
    talkTest: 'Conversa tranquila o tempo todo.',
    phases: [
      { label: 'Aquecimento', fromMin: 0, toMin: 5, speedMin: 5.0, speedMax: 5.0, incline: 2, note: 'Comece leve.' },
      { label: 'Bloco principal', fromMin: 5, toMin: 20, speedMin: 5.2, speedMax: 5.5, incline: 6, note: 'Inclinação entre 5% e 7%, conforme o dia.' },
      { label: 'Volta à calma', fromMin: 20, toMin: 25, speedMin: 4.5, speedMax: 5.0, incline: 1.5, note: 'Baixe a inclinação.' },
    ],
  },
  {
    id: 'cardio-zona2-40',
    name: 'Zona 2 — 30 a 40 min',
    context: 'Domingo sem futebol',
    totalMin: 35,
    rpe: '3–4 / 10',
    talkTest: 'Frases completas sem ofegar.',
    phases: [
      { label: 'Aquecimento', fromMin: 0, toMin: 5, speedMin: 4.5, speedMax: 5.0, incline: 1.5, note: 'Entrada suave.' },
      { label: 'Bloco principal', fromMin: 5, toMin: 30, speedMin: 5.0, speedMax: 5.5, incline: 6, note: 'Inclinação 5–7%. Priorize constância, não intensidade.' },
      { label: 'Volta à calma', fromMin: 30, toMin: 35, speedMin: 4.5, speedMax: 4.5, incline: 1, note: 'Desacelere e respire.' },
    ],
  },
  {
    id: 'cardio-recuperacao-35',
    name: 'Recuperação ativa — 30 a 40 min',
    context: 'Véspera de futebol: preservar as pernas',
    totalMin: 35,
    rpe: '2–3 / 10',
    talkTest: 'Deve parecer fácil do começo ao fim.',
    phases: [
      { label: 'Caminhada leve', fromMin: 0, toMin: 20, speedMin: 4.5, speedMax: 5.0, incline: 1.5, note: 'Sem inclinação alta — as pernas precisam estar inteiras amanhã.' },
      { label: 'Mobilidade', fromMin: 20, toMin: 35, speedMin: null, speedMax: null, incline: null, note: 'Fora da esteira: mobilidade de quadril, tornozelo e coluna, sem dor.' },
    ],
  },
  {
    id: 'cardio-promessa-30',
    name: 'Promessa do dia — 30 min',
    context: 'Dia livre / recuperação',
    totalMin: 30,
    rpe: '2–3 / 10',
    talkTest: 'Confortável o tempo todo.',
    phases: [
      { label: 'Caminhada', fromMin: 0, toMin: 25, speedMin: 5.0, speedMax: 5.5, incline: 3, note: 'Pode ser ao ar livre também.' },
      { label: 'Volta à calma', fromMin: 25, toMin: 30, speedMin: 4.5, speedMax: 4.5, incline: 1, note: 'Finalize tranquilo.' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Templates de treino                                                  */
/* ------------------------------------------------------------------ */

export const TEMPLATES = [
  {
    id: 'tpl-upper-a',
    name: 'Upper A',
    subtitle: 'Força + hipertrofia de tronco',
    dayKey: 'mon',
    kind: 'strength',
    accent: 'volt',
    icon: '🏋️',
    order: 1,
    notes: 'Foco em carga nas primeiras séries. Priorize versões em máquina quando disponíveis e adequadas.',
    items: [
      item('machine-chest-press', 3, 5, 8, { rir: 2, restSec: 180 }),
      item('lat-pulldown', 3, 6, 10, { rir: 2, restSec: 150 }),
      item('incline-press', 3, 8, 10, { rir: 2, restSec: 150 }),
      item('seated-cable-row', 3, 8, 10, { rir: 2, restSec: 120 }),
      item('shoulder-press', 3, 6, 10, { rir: 2, restSec: 150 }),
      item('lateral-raise', 3, 10, 15, { rir: 1, restSec: 60 }),
      item('biceps-curl', 2, 8, 12, { rir: 1, restSec: 60 }),
      item('triceps-pushdown', 2, 8, 12, { rir: 1, restSec: 60 }),
    ],
  },
  {
    id: 'tpl-lower-a',
    name: 'Lower A',
    subtitle: 'Treino principal de pernas (provisório)',
    dayKey: 'tue',
    kind: 'strength',
    accent: 'volt',
    icon: '🦵',
    order: 1,
    provisional: true,
    notes: 'Estrutura provisória enquanto houver acompanhamento do joelho esquerdo. Os exercícios marcados dependem da avaliação do ortopedista/fisioterapeuta.',
    items: [
      item('leg-press', 3, 8, 12, { rir: 2, restSec: 180, provisional: true, notes: 'Amplitude e carga conforme liberação médica. Sem dor no tendão patelar.' }),
      item('romanian-deadlift', 3, 8, 10, { rir: 2, restSec: 150 }),
      item('leg-curl', 3, 10, 12, { rir: 1, restSec: 120 }),
      item('hip-thrust', 3, 8, 12, { rir: 2, restSec: 150 }),
      item('leg-extension', 2, 10, 15, { rir: 2, restSec: 90, provisional: true, notes: 'Só com liberação: é o exercício que mais tensiona o tendão patelar.' }),
      item('calf-raise', 3, 10, 15, { rir: 1, restSec: 60 }),
      item('plank', 3, 0, 0, { timeBased: true, durationSec: 40, restSec: 45, rir: null }),
    ],
  },
  {
    id: 'tpl-upper-b',
    name: 'Upper B',
    subtitle: 'Ênfase em costas + cardio Zona 2',
    dayKey: 'wed',
    kind: 'strength',
    accent: 'volt',
    icon: '🏋️',
    order: 1,
    cardioPlanId: 'cardio-zona2-30',
    notes: 'Dia de prestar atenção nas costas: menos pressa, mais sensação do músculo trabalhando. Cardio depois da musculação.',
    items: [
      item('lat-pulldown', 3, 6, 10, { rir: 2, restSec: 150 }),
      item('chest-supported-row', 3, 8, 10, { rir: 2, restSec: 150 }),
      item('unilateral-pulldown', 2, 10, 12, { rir: 1, restSec: 90, notes: 'Um braço por vez, amplitude grande.' }),
      item('reverse-fly', 3, 12, 15, { rir: 1, restSec: 60 }),
      item('lateral-raise', 3, 12, 15, { rir: 1, restSec: 60 }),
      item('hammer-curl', 2, 10, 12, { rir: 1, restSec: 60 }),
    ],
  },
  {
    id: 'tpl-futebol',
    name: 'Futebol society',
    subtitle: 'Esporte + condicionamento de alta intensidade',
    dayKey: 'thu',
    kind: 'football',
    accent: 'ball',
    icon: '⚽',
    order: 1,
    notes: 'Aqueça antes de entrar em campo. Registre a dor do joelho antes e depois.',
    items: [],
  },
  {
    id: 'tpl-upper-c',
    name: 'Upper C',
    subtitle: 'Hipertrofia e estética',
    dayKey: 'fri',
    kind: 'strength',
    accent: 'volt',
    icon: '🏋️',
    order: 1,
    notes: 'Amplitude completa, controle e RIR 1–2 na maior parte das séries. Não precisa buscar falha absoluta.',
    items: [
      item('incline-press', 3, 8, 12, { rir: 2, restSec: 150 }),
      item('seated-cable-row', 3, 8, 12, { rir: 2, restSec: 120 }),
      item('cable-crossover', 2, 10, 15, { rir: 1, restSec: 75 }),
      item('lat-pulldown', 2, 8, 12, { rir: 2, restSec: 120 }),
      item('lateral-raise', 3, 12, 15, { rir: 1, restSec: 60 }),
      item('biceps-curl', 3, 8, 12, { rir: 1, restSec: 60 }),
      item('triceps-pushdown', 3, 8, 12, { rir: 1, restSec: 60 }),
    ],
  },
  {
    id: 'tpl-lower-b',
    name: 'Lower B',
    subtitle: 'Pernas — versão de sábado (provisório)',
    dayKey: 'sat',
    kind: 'strength',
    accent: 'volt',
    icon: '🦵',
    order: 1,
    provisional: true,
    cardioPlanId: 'cardio-leve-25',
    condition: 'no-football-sunday',
    notes: 'Só aparece quando NÃO há futebol no domingo. Estrutura provisória enquanto houver acompanhamento do joelho.',
    items: [
      item('hip-thrust', 3, 8, 12, { rir: 2, restSec: 150 }),
      item('leg-press', 3, 10, 15, { rir: 2, restSec: 150, provisional: true, notes: 'Carga menor que na terça, foco em amplitude confortável.' }),
      item('leg-curl', 3, 10, 12, { rir: 1, restSec: 120 }),
      item('hip-abduction', 3, 12, 15, { rir: 1, restSec: 60, notes: 'Glúteo médio ajuda na estabilidade do joelho.' }),
      item('calf-raise', 3, 12, 15, { rir: 1, restSec: 60 }),
      item('dead-bug', 3, 8, 10, { rir: null, restSec: 45, notes: 'Cada lado conta como 1 repetição.' }),
    ],
  },
  {
    id: 'tpl-recuperacao',
    name: 'Recuperação ativa',
    subtitle: 'Pernas preservadas para o futebol',
    dayKey: 'sat',
    kind: 'recovery',
    accent: 'recover',
    icon: '🧘',
    order: 2,
    cardioPlanId: 'cardio-recuperacao-35',
    condition: 'football-sunday',
    notes: 'Substitui o Lower B quando há futebol no domingo. Nada de treino pesado de pernas na véspera.',
    items: [
      item('mobility-flow', 1, 0, 0, { timeBased: true, durationSec: 600, restSec: 0, rir: null }),
      item('dead-bug', 2, 8, 10, { rir: null, restSec: 45 }),
      item('plank', 2, 0, 0, { timeBased: true, durationSec: 30, restSec: 45, rir: null }),
    ],
  },
  {
    id: 'tpl-domingo-cardio',
    name: 'Zona 2 de domingo',
    subtitle: 'Condicionamento sem impacto alto',
    dayKey: 'sun',
    kind: 'cardio',
    accent: 'cardio',
    icon: '❤️',
    order: 2,
    cardioPlanId: 'cardio-zona2-40',
    condition: 'no-football-sunday',
    notes: 'Aparece quando não há futebol no domingo.',
    items: [],
  },
  {
    id: 'tpl-domingo-futebol',
    name: 'Futebol society',
    subtitle: 'Domingo com jogo',
    dayKey: 'sun',
    kind: 'football',
    accent: 'ball',
    icon: '⚽',
    order: 1,
    condition: 'football-sunday',
    notes: 'Sessão de futebol de domingo.',
    items: [],
  },
];

export const DEFAULT_WEEK_SUMMARY = [
  { dayKey: 'mon', label: 'Upper A — força + hipertrofia' },
  { dayKey: 'tue', label: 'Lower A — treino principal de pernas' },
  { dayKey: 'wed', label: 'Upper B (costas) + cardio Zona 2' },
  { dayKey: 'thu', label: 'Futebol society' },
  { dayKey: 'fri', label: 'Upper C — hipertrofia/estética' },
  { dayKey: 'sat', label: 'Lower B + cardio leve, ou recuperação se houver futebol domingo' },
  { dayKey: 'sun', label: 'Futebol quando houver, senão Zona 2' },
];
