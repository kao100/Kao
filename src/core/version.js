/**
 * Versão do app.
 *
 * `APP_VERSION` precisa ser igual ao `VERSION` do sw.js — é o que garante que
 * uma atualização publicada substitua o cache antigo. A tela de Ajustes mostra
 * este valor, que vem do código realmente instalado no aparelho: se o número aí
 * estiver atrás do publicado, o app está desatualizado, e não é adivinhação.
 */

export const APP_VERSION = 'kao-v8';
export const APP_DATE = '2026-09-11';

/** Mais recente primeiro. */
export const CHANGELOG = [
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
