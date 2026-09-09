import { h, svgFromString } from '../../core/dom.js';
import { resolveExerciseMedia, fallbackSvg } from '../../data/media.js';

/**
 * Figura de um exercício (equipamento ou execução), com fallback automático
 * para a ilustração própria quando a imagem externa não carrega.
 */
export function exerciseFigure(exercise, source, { ratio = 'wide', showCaption = true } = {}) {
  const box = h(`div.exfig.exfig--${ratio}`);

  if (source.kind === 'svg') {
    box.appendChild(svgFromString(source.svg));
  } else {
    const img = h('img', { src: source.src, alt: exercise.namePt, loading: 'lazy' });
    img.addEventListener('error', () => {
      img.remove();
      box.prepend(svgFromString(fallbackSvg(exercise, source.role || 'execution')));
    });
    box.appendChild(img);
  }

  if (showCaption && source.caption) box.appendChild(h('div.exfig__cap', source.caption));
  return box;
}

/** Miniatura para listas. */
export function exerciseThumb(exercise, gymEquipment = []) {
  const media = resolveExerciseMedia(exercise, gymEquipment);
  const src = media.equipment;
  const box = h('div.list-item__thumb');
  if (src.kind === 'svg') box.appendChild(svgFromString(src.svg));
  else {
    const img = h('img', { src: src.src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => {
      img.remove();
      box.appendChild(svgFromString(fallbackSvg(exercise, 'equipment')));
    });
    box.appendChild(img);
  }
  return box;
}

export { resolveExerciseMedia };
