/**
 * Cadastro de primeiro uso.
 *
 * Os dados pessoais (peso, altura, condição de saúde, suplementos) NÃO ficam
 * no código: eles são digitados aqui e gravados só no banco local do seu
 * aparelho. Assim o repositório pode ser público sem expor nada seu.
 */

import { h } from '../../core/dom.js';
import * as store from '../../core/store.js';
import { today } from '../../core/format.js';
import { uid } from '../../core/util.js';
import { SUPPLEMENT_SUGGESTIONS } from '../../data/seed.js';
import { stepper, yesNo, textInput, textArea } from '../components/inputs.js';
import { safetyNote } from '../shell.js';

/**
 * Renderiza o cadastro inicial dentro de `container`.
 * @returns {Promise<void>} resolve quando o cadastro termina
 */
export function runOnboarding(container) {
  return new Promise((resolve) => {
    let step = 0;
    const data = {
      name: '',
      weightKg: null,
      heightM: null,
      experienceMonths: null,
      promiseMinutes: 30,
      thursdayFootball: true,
      sundayFootball: true,
      conditionLabel: '',
      conditionNote: '',
      nextAppointment: '',
      supplements: [],
    };

    const render = () => {
      container.replaceChildren(STEPS[step](data, {
        next: () => { step += 1; step >= STEPS.length ? finish() : render(); },
        back: () => { step = Math.max(0, step - 1); render(); },
        progress: `${step + 1} de ${STEPS.length}`,
      }));
      window.scrollTo({ top: 0 });
    };

    const finish = async () => {
      await store.profile.save({
        name: data.name.trim(),
        weightKg: data.weightKg,
        heightM: data.heightM,
        experienceMonths: data.experienceMonths,
        promiseMinutes: data.promiseMinutes,
        football: {
          thursdayFixed: data.thursdayFootball,
          sundayOptional: data.sundayFootball,
          note: '',
        },
        conditions: data.conditionLabel.trim()
          ? [{
            id: uid('cond'),
            label: data.conditionLabel.trim(),
            status: 'em acompanhamento',
            note: data.conditionNote.trim(),
            followUp: data.nextAppointment ? `Retorno marcado para ${data.nextAppointment}.` : '',
          }]
          : [],
        onboarded: true,
      });

      if (data.nextAppointment) {
        await store.settings.save({
          nextAppointment: data.nextAppointment,
          appointmentNote: data.conditionLabel.trim() ? `Retorno — ${data.conditionLabel.trim()}` : 'Consulta',
        });
      }

      if (data.weightKg) {
        await store.measurements.save({ id: uid('ms'), date: today(), weightKg: data.weightKg, notes: 'Registro inicial.' });
      }

      if (data.supplements.length) {
        await store.supplements.saveMany(data.supplements.map((s) => ({ ...s, createdAt: Date.now(), active: true })));
      }

      resolve();
    };

    render();
  });
}

/* ------------------------------------------------------------------ */
/* Passos                                                               */
/* ------------------------------------------------------------------ */

const shell = (title, subtitle, progress, body, actions) => h('div.app',
  h('main.app__main', { style: { paddingBottom: '40px' } },
    h('div.stack.stack--lg',
      h('header.topbar',
        h('div.topbar__title',
          h('div.topbar__eyebrow', `Cadastro inicial · ${progress}`),
          h('h1.topbar__h1', title),
        ),
      ),
      subtitle ? h('p.muted', { style: { marginTop: '-8px' } }, subtitle) : null,
      body,
      actions,
    ),
  ),
);

const STEPS = [
  /* ---------- 1. boas-vindas ---------- */
  (data, nav) => shell(
    'Bem-vindo',
    null,
    nav.progress,
    h('div.stack',
      h('div.card',
        h('div.card__title', 'Este app é só seu'),
        h('p', { style: { marginTop: '8px' } },
          'Tudo o que você registrar — treinos, cargas, dor, medidas e fotos — fica gravado apenas neste aparelho. Nada é enviado para nenhum servidor.'),
        h('p', 'Por isso o código pode ser público sem expor nada sobre você: seus dados nunca moram no código, moram no seu celular.'),
      ),
      h('div.card.card--tight',
        h('div.card__title', 'O que vem configurado'),
        h('ul', { style: { marginTop: '8px' } },
          h('li', 'Programa semanal híbrido: musculação, cardio e futebol'),
          h('li', 'Versão em casa de cada treino, com peso do corpo'),
          h('li', 'Fichas de exercício com ilustração e passo a passo'),
          h('li', 'Modo treino com cronômetro de descanso e progressão dupla'),
          h('li', 'Acompanhamento de dor articular e orientações médicas'),
        ),
      ),
      safetyNote('Este é um app de acompanhamento de treino. Ele não diagnostica, não prescreve tratamento e não substitui médico ou fisioterapeuta.'),
    ),
    h('button.btn.btn--primary.btn--lg.btn--block', { onClick: nav.next }, 'Começar'),
  ),

  /* ---------- 2. perfil ---------- */
  (data, nav) => {
    const name = textInput({ value: data.name, placeholder: 'Como quer ser chamado (opcional)' });
    const weight = stepper({ value: data.weightKg ?? 75, step: 0.5, min: 30, max: 250, unit: 'kg', decimals: 1 });
    const height = stepper({ value: data.heightM ?? 1.75, step: 0.01, min: 1.2, max: 2.3, unit: 'm', decimals: 2 });
    const months = stepper({ value: data.experienceMonths ?? 3, step: 1, min: 0, max: 600, unit: 'meses', decimals: 0 });

    return shell('Seu perfil', 'Serve para acompanhar sua evolução. Dá para mudar depois em Ajustes.', nav.progress,
      h('div.stack',
        h('div.field', h('label.field__label', 'Nome'), name),
        h('div.field', h('label.field__label', 'Peso atual'), weight),
        h('div.field', h('label.field__label', 'Altura'), height),
        h('div.field', h('label.field__label', 'Há quanto tempo treina de forma consistente'), months),
      ),
      h('div.btn-row',
        h('button.btn.btn--ghost', { onClick: nav.back }, 'Voltar'),
        h('button.btn.btn--primary', {
          onClick: () => {
            data.name = name.value;
            data.weightKg = weight.getValue();
            data.heightM = height.getValue();
            data.experienceMonths = months.getValue();
            nav.next();
          },
        }, 'Continuar'),
      ),
    );
  },

  /* ---------- 3. promessa e futebol ---------- */
  (data, nav) => {
    const minutes = stepper({ value: data.promiseMinutes, step: 5, min: 10, max: 180, unit: 'min', decimals: 0 });
    const thursday = yesNo({ value: data.thursdayFootball });
    const sunday = yesNo({ value: data.sundayFootball });

    return shell('Rotina', 'O app monta a semana em cima destas respostas.', nav.progress,
      h('div.stack',
        h('div.card.card--tight',
          h('div.card__title', '🔥 Promessa diária'),
          h('p.muted', { style: { fontSize: '13.5px', marginTop: '6px' } },
            'O app nunca programa um dia parado. Nos dias de recuperação entram caminhada, mobilidade ou cardio leve — e a sequência só zera se o dia terminar abaixo do seu mínimo.'),
          h('div.field', { style: { marginTop: '10px' } },
            h('label.field__label', 'Mínimo de exercício por dia'), minutes),
        ),
        h('div.field',
          h('label.field__label', 'Você joga futebol toda quinta-feira?'),
          thursday,
          h('div.field__hint', 'Se sim, quinta já aparece como dia de futebol, sem perguntar.'),
        ),
        h('div.field',
          h('label.field__label', 'E aos domingos, às vezes joga?'),
          sunday,
          h('div.field__hint', 'Se sim, o app pergunta no domingo e ajusta o treino de sábado para preservar as pernas na véspera.'),
        ),
      ),
      h('div.btn-row',
        h('button.btn.btn--ghost', { onClick: nav.back }, 'Voltar'),
        h('button.btn.btn--primary', {
          onClick: () => {
            data.promiseMinutes = minutes.getValue();
            data.thursdayFootball = thursday.getValue() !== false;
            data.sundayFootball = sunday.getValue() !== false;
            nav.next();
          },
        }, 'Continuar'),
      ),
    );
  },

  /* ---------- 4. limitação atual ---------- */
  (data, nav) => {
    const label = textInput({ value: data.conditionLabel, placeholder: 'Ex.: joelho esquerdo — tendão patelar' });
    const note = textArea({ value: data.conditionNote, placeholder: 'O que você sente, desde quando, o que já foi avaliado (opcional)', rows: 3 });
    const appointment = h('input.input', { type: 'date', value: data.nextAppointment });

    return shell('Alguma limitação hoje?', 'Se você tem alguma dor ou lesão em acompanhamento, o app monitora a evolução e evita incentivar aumento de carga em dias piores.', nav.progress,
      h('div.stack',
        h('div.field', h('label.field__label', 'Região / condição'), label,
          h('div.field__hint', 'Deixe em branco se não houver nada. Dá para cadastrar depois.')),
        h('div.field', h('label.field__label', 'Observações'), note),
        h('div.field', h('label.field__label', 'Próxima consulta (opcional)'), appointment),
        safetyNote('O app não diagnostica e não cria tratamento. Depois da consulta você registra em "Orientações médicas" o que o profissional liberou e o que pediu para evitar — e essas orientações passam a valer acima do plano padrão.'),
      ),
      h('div.btn-row',
        h('button.btn.btn--ghost', { onClick: nav.back }, 'Voltar'),
        h('button.btn.btn--primary', {
          onClick: () => {
            data.conditionLabel = label.value;
            data.conditionNote = note.value;
            data.nextAppointment = appointment.value;
            nav.next();
          },
        }, 'Continuar'),
      ),
    );
  },

  /* ---------- 5. suplementos ---------- */
  (data, nav) => {
    const chosen = new Map(data.supplements.map((s) => [s.id, s]));
    const brandInputs = new Map();

    const rows = SUPPLEMENT_SUGGESTIONS.map((sug) => {
      const check = h('input', { type: 'checkbox', checked: chosen.has(sug.id), style: { width: '22px', height: '22px' } });
      const brand = textInput({ value: chosen.get(sug.id)?.brand || '', placeholder: 'Marca (opcional)' });
      brandInputs.set(sug.id, { check, brand });
      return h('div.card.card--tight',
        h('div.switch-row',
          h('div.grow',
            h('div.list-item__title', sug.name),
            h('div.list-item__sub', sug.schedule),
          ),
          check,
        ),
        brand,
      );
    });

    return shell('Suplementação', 'Opcional — serve só para você ter o registro à mão.', nav.progress,
      h('div.stack',
        ...rows,
        safetyNote('O app é para treino natural: ele nunca recomenda esteroides, anabolizantes, SARMs, pró-hormonais ou "boosters" de testosterona.'),
      ),
      h('div.btn-row',
        h('button.btn.btn--ghost', { onClick: nav.back }, 'Voltar'),
        h('button.btn.btn--primary', {
          onClick: () => {
            data.supplements = SUPPLEMENT_SUGGESTIONS
              .filter((sug) => brandInputs.get(sug.id).check.checked)
              .map((sug) => ({ ...sug, brand: brandInputs.get(sug.id).brand.value.trim() }));
            nav.next();
          },
        }, 'Finalizar'),
      ),
    );
  },
];
