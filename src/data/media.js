/**
 * Resolução de imagens dos exercícios.
 *
 * Ordem de prioridade:
 *   1. foto real da máquina da SUA academia (tela "Minha academia");
 *   2. imagem externa licenciada cadastrada no exercício (com licença e crédito);
 *   3. ilustração própria em SVG (sempre disponível, funciona offline).
 *
 * Toda imagem externa precisa registrar sourceUrl, attribution e license.
 * Se ela falhar ao carregar, o app cai automaticamente para a ilustração própria.
 */

import { illustration } from './illustrations.js';

export const LICENSES = [
  { value: 'own', label: 'Ilustração/foto própria' },
  { value: 'cc0', label: 'CC0 / domínio público' },
  { value: 'cc-by', label: 'CC BY (exige crédito)' },
  { value: 'cc-by-sa', label: 'CC BY-SA (exige crédito e mesma licença)' },
  { value: 'manufacturer', label: 'Material de divulgação do fabricante' },
  { value: 'licensed', label: 'Licença comercial adquirida' },
  { value: 'unknown', label: 'Licença desconhecida (não recomendado)' },
];

/**
 * @param {object} exercise
 * @param {Array} gymEquipment  registros da store `equipment` deste exercício
 * @returns {{equipment: object, execution: object}}
 */
export function resolveExerciseMedia(exercise, gymEquipment = []) {
  const mine = gymEquipment
    .filter((e) => e.exerciseId === exercise.id && e.photo)
    .sort((a, b) => (b.useAsPrimary ? 1 : 0) - (a.useAsPrimary ? 1 : 0));

  const external = (exercise.media || []).filter((m) => m.url);
  const externalEquipment = external.find((m) => m.role === 'equipment');
  const externalExecution = external.find((m) => m.role === 'execution');

  const equipmentSource = mine[0]
    ? { kind: 'photo', src: mine[0].photo, caption: mine[0].brand || mine[0].model ? `${mine[0].brand || ''} ${mine[0].model || ''}`.trim() : 'Máquina da minha academia', equipmentId: mine[0].id }
    : externalEquipment
      ? { kind: 'url', src: externalEquipment.url, caption: creditLine(externalEquipment), meta: externalEquipment }
      : { kind: 'svg', svg: illustration(exercise.illustration, { athlete: false }), caption: 'Ilustração do equipamento' };

  const executionSource = externalExecution
    ? { kind: 'url', src: externalExecution.url, caption: creditLine(externalExecution), meta: externalExecution }
    : { kind: 'svg', svg: illustration(exercise.illustration, { athlete: true }), caption: 'Ilustração da execução' };

  return { equipment: equipmentSource, execution: executionSource, myPhotos: mine };
}

export function creditLine(media) {
  const parts = [];
  if (media.attribution) parts.push(media.attribution);
  const license = LICENSES.find((l) => l.value === media.license);
  if (license) parts.push(license.label);
  return parts.join(' · ') || 'Imagem externa';
}

/** Estrutura de uma imagem externa (usada no editor de exercício). */
export function emptyMedia(role = 'execution') {
  return { role, url: '', sourceUrl: '', attribution: '', license: 'unknown', addedAt: Date.now() };
}

/** Fallback: devolve a ilustração própria quando a imagem externa quebra. */
export function fallbackSvg(exercise, role) {
  return illustration(exercise.illustration, { athlete: role !== 'equipment' });
}
