/** Ajustes: perfil, descansos, dados e informações do app. */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { storageEstimate, requestPersistence } from '../../core/db.js';
import { pickFile } from '../../core/util.js';
import { formatDate, num } from '../../core/format.js';
import { exportJSON, exportCSV, importBackup, CSV_EXPORTS } from '../../logic/backup.js';
import { page, topbar, sectionTitle, menuRow, safetyNote } from '../shell.js';
import { openSheet, confirmSheet, formSheet } from '../components/sheet.js';
import { stepper } from '../components/inputs.js';
import { toastOk, toastError, toast } from '../components/toast.js';

export async function settingsView() {
  const [profile, settings, estimate] = await Promise.all([
    store.profile.get(), store.settings.get(), storageEstimate(),
  ]);

  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;

  return page(
    topbar({ title: 'Ajustes', showBack: true }),

    /* perfil */
    h('div.card',
      h('div.row.row--between',
        h('div.card__title', 'Perfil'),
        h('button.btn.btn--sm.btn--ghost', { onClick: () => editProfile(profile) }, 'Editar'),
      ),
      h('div.stack.stack--sm', { style: { marginTop: '10px' } },
        row('Nome', profile?.name || '—'),
        row('Peso', profile?.weightKg ? `${num(profile.weightKg, 1)} kg` : '—'),
        row('Altura', profile?.heightM ? `${num(profile.heightM, 2)} m` : '—'),
        row('Experiência', profile?.experienceMonths != null ? `${profile.experienceMonths} meses de treino consistente` : '—'),
        row('Abordagem', '100% natural — sem esteroides ou similares'),
        row('Promessa diária', `${profile?.promiseMinutes || 30} minutos`),
        row('Futebol', [
          profile?.football?.thursdayFixed ? 'quinta fixo' : null,
          profile?.football?.sundayOptional ? 'domingo opcional' : null,
        ].filter(Boolean).join(' · ') || 'sem futebol programado'),
        row('Condição em acompanhamento', profile?.conditions?.[0]?.label || 'nenhuma'),
      ),
    ),

    /* treino */
    h('div.card',
      h('div.card__title', 'Treino'),
      h('div.stack', { style: { marginTop: '12px' } },
        h('div.field',
          h('label.field__label', 'Descanso — exercícios compostos'),
          stepper({
            value: settings?.restCompoundSec ?? 150, step: 15, min: 30, max: 300, unit: 'seg', decimals: 0,
            onChange: (v) => store.settings.save({ restCompoundSec: v }),
          }),
        ),
        h('div.field',
          h('label.field__label', 'Descanso — isoladores'),
          stepper({
            value: settings?.restIsolationSec ?? 75, step: 15, min: 30, max: 240, unit: 'seg', decimals: 0,
            onChange: (v) => store.settings.save({ restIsolationSec: v }),
          }),
        ),
        h('div.grid-2',
          h('div.field',
            h('label.field__label', 'Incremento de carga'),
            stepper({
              value: settings?.weightIncrementKg ?? 2.5, step: 0.5, min: 0.5, max: 10, unit: 'kg', decimals: 1,
              onChange: (v) => store.settings.save({ weightIncrementKg: v }),
            }),
          ),
          h('div.field',
            h('label.field__label', 'Incremento isoladores'),
            stepper({
              value: settings?.smallIncrementKg ?? 1, step: 0.5, min: 0.5, max: 5, unit: 'kg', decimals: 1,
              onChange: (v) => store.settings.save({ smallIncrementKg: v }),
            }),
          ),
        ),
        toggle('Iniciar descanso automaticamente', settings?.restAutoStart !== false, (v) => store.settings.save({ restAutoStart: v })),
        toggle('Perguntar recuperação antes do treino', settings?.askRecoveryBeforeWorkout !== false, (v) => store.settings.save({ askRecoveryBeforeWorkout: v })),
        toggle('Perguntar do joelho antes de pernas/futebol', settings?.askKneeBeforeLegsAndFootball !== false, (v) => store.settings.save({ askKneeBeforeLegsAndFootball: v })),
        toggle('Manter a tela acesa durante o treino', settings?.keepScreenAwake !== false, (v) => store.settings.save({ keepScreenAwake: v })),
        toggle('Sons de cronômetro', settings?.soundEnabled !== false, (v) => store.settings.save({ soundEnabled: v })),
      ),
    ),

    /* dados */
    h('div.stack.stack--sm',
      sectionTitle('Meus dados'),
      menuRow({ icon: '⤓', title: 'Exportar backup completo (JSON)', sub: 'Tudo: treinos, séries, joelho, medidas, fotos', onClick: async () => { await exportJSON(); toastOk('Backup exportado'); } }),
      menuRow({ icon: '📄', title: 'Exportar CSV', sub: 'Séries, cardio, futebol, joelho, medidas…', onClick: openCsvSheet }),
      menuRow({ icon: '⤒', title: 'Importar backup', sub: 'Restaurar de um arquivo JSON', onClick: doImport }),
      h('div.card.card--tight',
        h('div.card__title', 'Armazenamento'),
        h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } },
          estimate?.usage != null
            ? `${(estimate.usage / 1024 / 1024).toFixed(1)} MB usados de ${(estimate.quota / 1024 / 1024).toFixed(0)} MB disponíveis.`
            : 'Sem informação de uso neste navegador.'),
        h('p.muted', { style: { fontSize: '13px' } },
          persisted
            ? '✅ Armazenamento persistente concedido: o navegador não vai descartar seus dados automaticamente.'
            : '⚠️ Armazenamento persistente ainda não concedido. Instale o app na tela de início e faça backups regulares.'),
        !persisted
          ? h('button.btn.btn--sm.btn--ghost.mt', {
            onClick: async () => {
              const ok = await requestPersistence();
              toast(ok ? 'Armazenamento persistente concedido' : 'O navegador não concedeu — continue exportando backups');
              refresh();
            },
          }, 'Solicitar persistência')
          : null,
      ),
    ),

    /* app */
    h('div.stack.stack--sm',
      sectionTitle('Aplicativo'),
      h('div.card.card--tight',
        h('div.card__title', installed ? 'Instalado na tela de início ✅' : 'Instalar no iPhone'),
        h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } },
          installed
            ? 'O app está rodando em modo standalone, com suporte offline.'
            : 'No Safari: toque em Compartilhar (⬆️) → "Adicionar à Tela de Início". O app abre em tela cheia e funciona offline.'),
      ),
      menuRow({ icon: '🔄', title: 'Recarregar app', sub: 'Buscar atualizações', onClick: () => location.reload() }),
    ),

    safetyNote('Este aplicativo é uma ferramenta de acompanhamento de treino. Ele não diagnostica, não prescreve medicamento e não substitui médico ou fisioterapeuta.'),

    h('div.card.card--danger',
      h('div.card__title', 'Zona de risco'),
      h('button.btn.btn--danger.btn--block.mt', {
        onClick: async () => {
          const ok = await confirmSheet({
            title: 'Apagar TODO o histórico?',
            message: 'Isso remove treinos, séries, cardio, futebol, joelho, medidas e fotos deste dispositivo. Exporte um backup antes.',
            confirmLabel: 'Apagar tudo',
            danger: true,
          });
          if (!ok) return;
          const { deleteDatabase } = await import('../../core/db.js');
          await deleteDatabase();
          location.reload();
        },
      }, 'Apagar todos os dados'),
    ),
  );
}

function row(label, value) {
  return h('div.report-line', h('span', label), h('span.report-line__v', value));
}

function toggle(label, value, onChange) {
  const input = h('input', { type: 'checkbox', checked: value, style: { width: '22px', height: '22px' } });
  input.addEventListener('change', () => onChange(input.checked));
  return h('div.switch-row', h('div.grow', label), input);
}

async function editProfile(profile) {
  const data = await formSheet({
    title: 'Perfil',
    fields: [
      { key: 'name', label: 'Nome', value: profile?.name || '' },
      { key: 'weightKg', label: 'Peso (kg)', type: 'number', value: profile?.weightKg ?? '', step: '0.1' },
      { key: 'heightM', label: 'Altura (m)', type: 'number', value: profile?.heightM ?? '', step: '0.01' },
      { key: 'experienceMonths', label: 'Meses de treino', type: 'number', value: profile?.experienceMonths ?? '', step: '1' },
      { key: 'promiseMinutes', label: 'Minutos da promessa diária', type: 'number', value: profile?.promiseMinutes ?? 30, step: '5' },
      {
        key: 'conditionLabel',
        label: 'Condição em acompanhamento',
        value: profile?.conditions?.[0]?.label || '',
        placeholder: 'Ex.: joelho esquerdo — tendão patelar',
        hint: 'Deixe em branco se não houver nenhuma.',
      },
    ],
  });
  if (!data) return;
  const { conditionLabel, ...rest } = data;
  const current = profile?.conditions?.[0];
  const conditions = conditionLabel?.trim()
    ? [{ ...(current || { id: 'cond-1', status: 'em acompanhamento', note: '', followUp: '' }), label: conditionLabel.trim() }]
    : [];
  await store.profile.save({ ...rest, conditions });
  toastOk('Perfil atualizado');
  refresh();
}

function openCsvSheet() {
  openSheet({
    title: 'Exportar CSV',
    content: (close) => h('div.stack.stack--sm',
      ...CSV_EXPORTS.map((spec) => h('button.btn.btn--ghost.btn--block', {
        onClick: async () => {
          const ok = await exportCSV(spec.id);
          toast(ok ? `${spec.label} exportado` : `Sem dados de ${spec.label.toLowerCase()} ainda`);
        },
      }, spec.label)),
      h('button.btn.btn--quiet.btn--block', { onClick: () => close() }, 'Fechar'),
    ),
  });
}

async function doImport() {
  const file = await pickFile('application/json');
  if (!file) return;
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    const mode = await confirmSheet({
      title: 'Como importar?',
      message: 'OK substitui os dados atuais pelos do arquivo. Cancelar mescla (mantém o que já existe e adiciona o que vier).',
      confirmLabel: 'Substituir tudo',
      danger: true,
    });
    const counts = await importBackup(backup, mode ? 'replace' : 'merge');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    toastOk(`${total} registros importados`);
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    toastError(`Falha ao importar: ${err.message}`);
  }
}
