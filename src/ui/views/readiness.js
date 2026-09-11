/** Check-in rápido de recuperação, antes do treino (opcional). */

import { h } from '../../core/dom.js';
import * as store from '../../core/store.js';
import { today } from '../../core/format.js';
import { uid } from '../../core/util.js';
import { openSheet } from '../components/sheet.js';
import { scale } from '../components/inputs.js';
import { evaluateReadiness } from '../../logic/readiness.js';
import { safetyNote } from '../shell.js';

export function openReadinessSheet({ date = today(), optional = true, includeKnee = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openSheet({
      title: 'Como você chegou hoje?',
      onClose: () => { if (!done) resolve(null); },
      content: (close) => {
        const sleep = scale({ from: 1, to: 5, value: 3, labels: ['dormi mal', 'dormi muito bem'] });
        const energy = scale({ from: 1, to: 5, value: 3, labels: ['sem energia', 'cheio de energia'] });
        const soreness = scale({ from: 1, to: 5, value: 2, labels: ['sem dor muscular', 'muita dor muscular'] });
        const motivation = scale({ from: 1, to: 5, value: 4, labels: ['baixa', 'alta'] });
        const knee = includeKnee ? scale({ from: 0, to: 10, value: 0, labels: ['joelho sem dor', 'dor máxima'] }) : null;
        const result = h('div');

        const save = async () => {
          const input = {
            sleep: sleep.getValue(),
            energy: energy.getValue(),
            soreness: soreness.getValue(),
            motivation: motivation.getValue(),
            knee: knee ? knee.getValue() : 0,
          };
          const verdict = evaluateReadiness(input);
          await store.recovery.save({ id: uid('rec'), date, ...input, verdict: verdict.key, ts: Date.now() });
          if (includeKnee && input.knee > 0) {
            await store.painLogs.save({
              id: uid('pain'),
              date,
              context: 'pre-workout',
              score: input.knee,
              painDuringMovement: false,
              swelling: false,
              instability: false,
              notes: 'Registrado no check-in de recuperação.',
              ts: Date.now(),
            });
          }
          result.replaceChildren(
            h(`div.card.card--${verdict.accent === 'ok' ? 'accent' : verdict.accent === 'warn' ? 'warn' : 'danger'}`,
              h('div.card__title', `${verdict.emoji} ${verdict.label}`),
              h('p.muted', { style: { marginTop: '6px' } }, verdict.advice),
              ...verdict.reasons.map((r) => h('p.muted', { style: { fontSize: '13px' } }, r)),
            ),
            h('button.btn.btn--primary.btn--block.mt', { onClick: () => { done = true; close(); resolve(verdict); } }, 'Continuar'),
          );
        };

        return h('div.stack',
          h('div.field', h('label.field__label', 'Sono'), sleep),
          h('div.field', h('label.field__label', 'Energia'), energy),
          h('div.field', h('label.field__label', 'Dor muscular'), soreness),
          h('div.field', h('label.field__label', 'Motivação'), motivation),
          includeKnee ? h('div.field', h('label.field__label', 'Joelho esquerdo (0–10)'), knee) : null,
          safetyNote('Indicação prática para conduzir o treino de hoje. Não é avaliação médica.'),
          result,
          h('div.btn-row',
            optional
              ? h('button.btn.btn--ghost', { onClick: () => { done = true; close(); resolve(null); } }, 'Pular')
              : null,
            h('button.btn.btn--primary', { onClick: save }, 'Ver indicação'),
          ),
        );
      },
    });
  });
}
