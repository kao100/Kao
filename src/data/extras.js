/**
 * Complementos: blocos opcionais para o dia em que sobra tempo.
 *
 * A ideia é separar duas coisas que costumam se misturar e estragar o
 * programa:
 *
 *   - o **treino do dia**, que é fixo, progride com carga e sustenta o ciclo
 *     de blocos. É nele que a progressão dupla funciona, porque você repete o
 *     mesmo exercício semana após semana e compara;
 *   - o **complemento**, que é do dia e só do dia. Entra quando sobrou tempo,
 *     sai quando não sobrou, e não muda o programa.
 *
 * Por isso nenhum complemento é sugerido "porque sim": cada um declara o que
 * treina e quanto custa de fadiga, e `logic/extras.js` filtra os que fazem
 * sentido hoje — considerando o que você acabou de treinar, o joelho, o
 * futebol de amanhã e quanto tempo ainda cabe.
 *
 * `fatigue` é o custo sistêmico, de 1 a 3. Complemento de fadiga 3 na véspera
 * de jogo é exatamente o que não se deve fazer.
 */

const ex = (exerciseId, sets, repMin, repMax, opts = {}) => ({
  exerciseId, sets, repMin, repMax,
  rir: opts.rir ?? 1,
  restSec: opts.restSec ?? 45,
  timeBased: opts.timeBased || false,
  durationSec: opts.durationSec,
  notes: opts.notes || '',
});

export const EXTRAS = [
  /* ---------------- abdômen ---------------- */
  {
    id: 'extra-core-chao',
    name: 'Circuito de abdômen no chão',
    icon: '🧘',
    kind: 'strength',
    minutes: 12,
    fatigue: 1,
    targets: ['Core'],
    needs: 'colchonete',
    summary: 'Quatro exercícios de chão, sem equipamento. Serve na academia e em casa.',
    items: [
      ex('reverse-crunch', 3, 12, 18),
      ex('bicycle-crunch', 3, 14, 20, { notes: 'Devagar. Aqui velocidade engana.' }),
      ex('side-plank', 2, 0, 0, { timeBased: true, durationSec: 40, notes: 'Cada lado conta como 1 série.' }),
      ex('hollow-hold', 2, 0, 0, { timeBased: true, durationSec: 30 }),
    ],
  },
  {
    id: 'extra-core-barra',
    name: 'Abdômen na barra',
    icon: '🏋️',
    kind: 'strength',
    minutes: 10,
    fatigue: 1,
    targets: ['Core'],
    needs: 'barra fixa',
    summary: 'Suspenso na barra: é a versão mais difícil, e a que mais pega a parte de baixo do abdômen.',
    items: [
      ex('hanging-knee-raise', 4, 8, 15, { restSec: 60 }),
      ex('plank', 3, 0, 0, { timeBased: true, durationSec: 45 }),
    ],
  },
  {
    id: 'extra-core-anti',
    name: 'Core anti-rotação',
    icon: '🌀',
    kind: 'strength',
    minutes: 12,
    fatigue: 1,
    targets: ['Core'],
    needs: 'polia',
    summary: 'Treina resistir a girar — que é o que o corpo faz em mudança de direção no futebol.',
    items: [
      ex('pallof-press', 4, 10, 15, { rir: 2, restSec: 60, notes: 'Cada lado conta como 1 série.' }),
      ex('side-plank', 3, 0, 0, { timeBased: true, durationSec: 45, notes: 'Cada lado conta como 1 série.' }),
    ],
  },

  /* ---------------- membros ---------------- */
  {
    id: 'extra-bracos',
    name: 'Braço extra',
    icon: '💪',
    kind: 'strength',
    minutes: 14,
    fatigue: 1,
    targets: ['Bíceps', 'Tríceps'],
    needs: 'polia ou halteres',
    summary: 'Bíceps e tríceps alternados. Braço recupera rápido e aguenta volume.',
    items: [
      ex('biceps-curl', 3, 10, 15, { restSec: 45 }),
      ex('triceps-pushdown', 3, 10, 15, { restSec: 45 }),
      ex('hammer-curl', 2, 12, 15, { restSec: 45 }),
    ],
  },
  {
    id: 'extra-ombro',
    name: 'Ombro e posterior',
    icon: '🎯',
    kind: 'strength',
    minutes: 12,
    fatigue: 1,
    targets: ['Ombros'],
    needs: 'polia ou halteres',
    summary: 'Elevação lateral e posterior de ombro: repetição alta, fadiga baixa, e é o que arredonda o ombro.',
    items: [
      ex('lateral-raise', 3, 12, 20, { restSec: 45 }),
      ex('reverse-fly', 3, 15, 20, { restSec: 45 }),
    ],
  },
  {
    id: 'extra-panturrilha',
    name: 'Panturrilha extra',
    icon: '🦵',
    kind: 'strength',
    minutes: 10,
    fatigue: 1,
    targets: ['Panturrilha'],
    needs: 'máquina de panturrilha',
    summary: 'Panturrilha responde a frequência. Repetições altas, pausa de 1 s embaixo.',
    items: [
      ex('calf-raise', 4, 12, 20, { restSec: 45, notes: 'Pausa de 1 s na posição mais alongada.' }),
    ],
  },
  {
    id: 'extra-costas',
    name: 'Costas extra',
    icon: '🪝',
    kind: 'strength',
    minutes: 14,
    fatigue: 2,
    targets: ['Costas'],
    needs: 'polia',
    summary: 'Puxada unilateral e remada: amplitude grande, carga moderada.',
    items: [
      ex('unilateral-pulldown', 3, 10, 15, { rir: 1, restSec: 60 }),
      ex('seated-cable-row', 3, 10, 15, { rir: 1, restSec: 75 }),
    ],
  },

  /* ---------------- cardio ---------------- */
  {
    id: 'extra-cardio-zona2',
    name: 'Zona 2 de 20 a 30 min',
    icon: '❤️',
    kind: 'cardio',
    cardioPlanId: 'cardio-zona2-30',
    minutes: 35,
    fatigue: 1,
    targets: ['Cardio'],
    needs: 'esteira, elíptico ou escada',
    summary: 'Ritmo conversável. Some para a base aeróbica e quase não atrapalha a recuperação.',
  },
  {
    id: 'extra-cardio-longo',
    name: 'Zona 2 longa — 50 min',
    icon: '🫀',
    kind: 'cardio',
    cardioPlanId: 'cardio-zona2-50',
    minutes: 50,
    fatigue: 1,
    targets: ['Cardio'],
    needs: 'esteira, elíptico ou escada',
    summary: 'Para o dia em que sobra bastante tempo. É o que faz render mais no segundo tempo.',
  },
  {
    id: 'extra-cardio-intervalado',
    name: '10-20-30 — 30 min',
    icon: '⚡',
    kind: 'cardio',
    cardioPlanId: 'cardio-10-20-30',
    minutes: 30,
    fatigue: 3,
    targets: ['Cardio'],
    needs: 'esteira, elíptico ou escada',
    summary: 'Intervalado curto. Só em dia sem jogo por perto — e nunca na véspera.',
  },

  /* ---------------- recuperação ---------------- */
  {
    id: 'extra-mobilidade',
    name: 'Mobilidade e alongamento',
    icon: '🧎',
    kind: 'cardio',
    cardioPlanId: 'cardio-recuperacao-35',
    minutes: 15,
    fatigue: 0,
    targets: ['Recuperação'],
    needs: 'colchonete',
    summary: 'Sempre cabe. Não conta como treino, conta como recuperação — e conta para a promessa.',
  },
];

export function extraById(id) {
  return EXTRAS.find((e) => e.id === id) || null;
}
