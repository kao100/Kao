/**
 * FORTALECIMENTO DO JOELHO (/joelho/fortalecimento) e
 * RELATÓRIO SEMANAL DO JOELHO (/joelho/relatorio, com exportação em PDF).
 *
 * O fortalecimento não é um treino paralelo: ele mora nos dias de pernas.
 * Esta tela mostra o que da sua semana já é fortalecimento, como cada
 * exercício está respondendo, e a biblioteca de opções para quando o
 * profissional orientar alguma mudança.
 */

import { h, svgFromString } from '../../core/dom.js';
import { navigate } from '../../core/router.js';
import * as store from '../../core/store.js';
import { today, formatDate, addDays, weekDates } from '../../core/format.js';
import { EXERCISES, KNEE_ROLES, kneeInfo } from '../../data/exercises.js';
import { illustration } from '../../data/illustrations.js';
import { kneeStatus, PAIN_LOCATIONS } from '../../logic/knee.js';
import { evaluateKneeExercise, roleSets, weeklyKneeReport } from '../../logic/knee-strength.js';
import { page, topbar, sectionTitle, safetyNote, emptyState } from '../shell.js';
import { toast } from '../components/toast.js';
import { PdfDoc, deliverPdf } from '../../core/pdf.js';

const STATUS_PILL = {
  progress: ['pill--ok', 'pode progredir'],
  hold: ['pill--warn', 'manter'],
  info: ['', 'falta registro'],
  reduce: ['pill--danger', 'manter ou reduzir'],
  blocked: ['pill--danger', 'não liberado'],
  new: ['', 'sem histórico'],
};

export async function kneeStrengthView() {
  const date = today();
  const dates = weekDates(date);
  const [knee, guidance, templates, exMap, roles] = await Promise.all([
    kneeStatus(date),
    store.activeMedicalGuidance(),
    store.templates.all(),
    store.exercises.map(),
    roleSets(dates[0], dates[6]),
  ]);

  // o que dos seus treinos é fortalecimento do joelho
  const inProgram = new Map();
  for (const tpl of templates.filter((t) => !t.archived && t.mode !== 'home')) {
    for (const it of tpl.items || []) {
      if (!kneeInfo(it.exerciseId)) continue;
      if (!inProgram.has(it.exerciseId)) inProgram.set(it.exerciseId, { item: it, days: [] });
      inProgram.get(it.exerciseId).days.push(tpl.name);
    }
  }
  const evaluations = await Promise.all([...inProgram.entries()].map(async ([id, v]) => ({
    id,
    ex: exMap.get(id),
    days: v.days,
    ev: await evaluateKneeExercise(id, { item: v.item, knee, guidance }),
  })));

  const strengthening = guidance?.strengthening || {};

  return page(
    topbar({ eyebrow: 'Joelho esquerdo · tendão patelar', title: 'Fortalecimento do joelho', showBack: true, backTo: '/joelho' }),

    h('div.card',
      h('div.card__title', 'Como funciona'),
      h('p.muted', { style: { fontSize: '13.5px', marginTop: '6px' } },
        'O fortalecimento já está dentro dos seus dias de pernas (terça e sábado) — não é um treino a mais, para não duplicar volume. A cada série você registra carga, repetições, amplitude e dor; ao fim do exercício, como o joelho respondeu; e no dia seguinte, como acordou.'),
      h('p.muted', { style: { fontSize: '13.5px' } },
        'A progressão é uma variável por vez — primeiro repetições, depois amplitude, por último carga — e só quando a sessão anterior foi sem dor e o joelho acordou bem. Nunca carga, volume e amplitude juntos.'),
      knee.level !== 'ok' ? safetyNote(knee.reason, knee.level === 'caution' ? 'danger' : '') : null,
      knee.stopProgression ? safetyNote('Progressão interrompida: procure seu ortopedista/fisioterapeuta antes de voltar a aumentar.', 'danger') : null,
    ),

    h('div.card',
      h('div.row.row--between',
        h('div.card__title', 'Orientação profissional'),
        h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate('/medico') }, guidance ? 'Atualizar' : 'Cadastrar'),
      ),
      guidance
        ? h('div.stack.stack--sm', { style: { marginTop: '8px' } },
          h('div.list-item__sub', `${formatDate(guidance.date, 'full')} · ${guidance.professional || 'profissional'}`),
          h('div.report-line', h('span', 'Progressão de carga'), h('span.report-line__v', { no: 'não liberada', yes: 'liberada', '': 'não informado' }[strengthening.allowProgression || ''])),
          strengthening.frequency ? h('div.report-line', h('span', 'Frequência'), h('span.report-line__v', strengthening.frequency)) : null,
          strengthening.romNotes ? h('div.report-line', h('span', 'Amplitude / carga'), h('span.report-line__v', strengthening.romNotes)) : null,
          strengthening.footballReturn ? h('div.report-line', h('span', 'Futebol'), h('span.report-line__v', strengthening.footballReturn)) : null,
        )
        : h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } },
          'Sem orientação cadastrada. Os exercícios marcados "sujeito à avaliação" continuam sinalizados até você registrar o que o profissional liberou.'),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Esta semana, por grupo'),
      h('div.grid-2', ...Object.entries(KNEE_ROLES).map(([key, r]) => h('div.stat',
        h('div.stat__label', `${r.icon} ${r.label}`),
        h('div.stat__value', String(roles[key] || 0)),
        h('div.stat__sub', 'séries feitas'),
      ))),
      h('p.muted', { style: { fontSize: '12.5px' } }, 'Contado das séries que você registrou — é por isso que o app não sugere um bloco de joelho por fora: o volume já está aqui.'),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Seus exercícios de fortalecimento'),
      evaluations.length
        ? h('div.list', ...evaluations.map(({ id, ex, days, ev }) => {
          const [cls, label] = STATUS_PILL[ev.status] || STATUS_PILL.new;
          return h('div.list-item.clickable', { onClick: () => navigate(`/progresso/${id}`) },
            h('div.list-item__thumb', svgFromString(illustration(ex?.illustration, { athlete: true }))),
            h('div.grow',
              h('div.list-item__title', ex?.namePt || id),
              h('div.list-item__sub', `${KNEE_ROLES[kneeInfo(id).role].label} · ${days.join(', ')}`),
              h('div.list-item__sub', { style: { marginTop: '4px' } }, `${ev.title}: ${ev.message}`),
            ),
            h(`span.pill.${cls || 'pill'}`, label),
          );
        }))
        : emptyState('🦵', 'Nenhum exercício de fortalecimento no programa.'),
    ),

    librarySection(exMap, guidance),

    safetyNote('O app acompanha e organiza — não prescreve protocolo de reabilitação. Exercícios, amplitude, carga, séries e frequência dependem da avaliação profissional e da resposta do seu joelho. Melhora dos sintomas não é alta.', 'info'),
  );
}

function librarySection(exMap, guidance) {
  const allowed = new Set(guidance?.allowedExerciseIds || []);
  const forbidden = new Set(guidance?.forbiddenExerciseIds || []);
  const byRole = {};
  for (const ex of EXERCISES) {
    const info = kneeInfo(ex.id);
    if (!info) continue;
    (byRole[info.role] ||= []).push(exMap.get(ex.id) || ex);
  }
  return h('div.stack.stack--sm',
    sectionTitle('Biblioteca de fortalecimento'),
    h('p.muted', { style: { fontSize: '13px', marginTop: '-4px' } },
      'Toque para ver como identificar o aparelho, executar e registrar. Para usar um exercício, troque no modo treino ou edite o programa — de preferência depois de conversar com o profissional.'),
    ...Object.entries(KNEE_ROLES).map(([role, r]) => (byRole[role]?.length
      ? h('div.card.card--tight',
        h('div.card__title', `${r.icon} ${r.label}`),
        role === 'iso' ? h('p.muted', { style: { fontSize: '12.5px', marginTop: '4px' } }, 'Ficam disponíveis para uso conforme orientação médica ou fisioterapêutica. O app não os coloca no programa sozinho.') : null,
        h('div.list', { style: { marginTop: '8px' } }, ...byRole[role].map((ex) => h('div.list-item.clickable', { onClick: () => navigate(`/exercicio/${ex.id}`) },
          h('div.list-item__thumb', svgFromString(illustration(ex.illustration, { athlete: true }))),
          h('div.grow',
            h('div.list-item__title', ex.namePt),
            h('div.list-item__sub', [ex.type === 'bodyweight' ? 'peso corporal' : ex.type === 'cable' ? 'polia' : 'máquina', kneeInfo(ex.id).load === 'isometric' ? 'isométrico' : 'carga progressiva'].join(' · ')),
          ),
          forbidden.has(ex.id) ? h('span.pill.pill--danger', 'evitar')
            : allowed.has(ex.id) ? h('span.pill.pill--ok', 'liberado')
              : ex.needsMedicalReview ? h('span.pill.pill--warn', 'avaliar') : null,
        ))),
      )
      : null)),
  );
}

/* ------------------------------------------------------------------ */
/* Relatório semanal                                                    */
/* ------------------------------------------------------------------ */

export async function kneeReportView({ query }) {
  const ref = query.semana || today();
  const report = await weeklyKneeReport(ref);
  const prevWeek = addDays(report.from, -7);
  const nextWeek = addDays(report.from, 7);
  const s = report.symptoms;

  return page(
    topbar({
      eyebrow: `${formatDate(report.from, 'full')} – ${formatDate(report.to, 'full')}`,
      title: 'Relatório do joelho',
      showBack: true,
      backTo: '/joelho',
    }),

    h('div.btn-row',
      h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/joelho/relatorio?semana=${prevWeek}`) }, '‹ Semana anterior'),
      nextWeek <= today()
        ? h('button.btn.btn--sm.btn--ghost', { onClick: () => navigate(`/joelho/relatorio?semana=${nextWeek}`) }, 'Próxima ›')
        : null,
    ),

    h('button.btn.btn--primary.btn--block', { onClick: () => exportReportPdf(report) }, '📄 Exportar PDF para o profissional'),

    h('div.card',
      h('div.card__title', 'Resumo'),
      h('div.grid-2', { style: { marginTop: '10px' } },
        stat('Dias de perna', String(report.legDays)),
        stat('Séries de perna', String(report.totalSets)),
        stat('Volume total', `${report.totalVolume} kg`),
        stat('Futebol', `${report.football.length} jogo(s)`, report.footballMinutes ? `${report.footballMinutes} min` : ''),
        stat('Dor média', s.avgScore != null ? `${s.avgScore}/10` : '—', s.records ? `${s.records} registro(s)` : 'sem registros'),
        stat('Tendência', report.trend.direction === 'insufficient' ? '—' : report.trend.label, report.trend.recent != null ? `${report.trend.previous} → ${report.trend.recent}` : ''),
      ),
    ),

    h('div.card',
      h('div.card__title', 'Exercícios realizados'),
      report.exercises.length
        ? h('div.stack.stack--sm', { style: { marginTop: '10px' } }, ...report.exercises.map((e) => h('div',
          h('div.report-line', h('span', e.name), h('span.report-line__v', `${e.sets} séries · até ${e.topWeight} kg`)),
          h('div.list-item__sub', [e.role, `dor média ${e.avgPain} (pico ${e.maxPain})`, e.rom ? `amplitude ${e.rom.toLowerCase()}` : null, e.responses.length ? e.responses.join(', ') : null].filter(Boolean).join(' · ')),
        )))
        : emptyState('🦵', 'Nenhum exercício de perna registrado nesta semana.'),
    ),

    report.strength.length
      ? h('div.card',
        h('div.card__title', 'Evolução de força (6 semanas)'),
        h('div.stack.stack--sm', { style: { marginTop: '10px' } }, ...report.strength.map((r) => h('div.report-line',
          h('span', r.name),
          h('span.report-line__v', { class: r.delta > 0 ? 'delta-up' : r.delta < 0 ? 'delta-down' : 'delta-flat' }, `${r.from} → ${r.to} kg`),
        ))),
      )
      : null,

    h('div.card',
      h('div.card__title', 'Sintomas'),
      h('div.stack.stack--sm', { style: { marginTop: '10px' } },
        line('Dias com dor ≥ 3', s.daysWithPain3),
        line('Inchaço', s.swelling),
        line('Instabilidade', s.instability),
        line('Rigidez', s.stiffness),
        line('Dificuldade para caminhar/escadas', s.stairs),
        line('Exercícios "sem dor"', s.duringNone),
        line('Exercícios "dor aumentou"', s.duringWorse),
        line('Dia seguinte melhor', s.nextDayBetter),
        line('Dia seguinte pior', s.nextDayWorse),
        Object.keys(s.locations).length
          ? line('Local relatado', Object.entries(s.locations).map(([k, n]) => `${PAIN_LOCATIONS.find((l) => l.value === k)?.label || k} (${n})`).join(', '))
          : null,
      ),
    ),

    report.football.length
      ? h('div.card',
        h('div.card__title', 'Resposta após futebol'),
        h('div.stack.stack--sm', { style: { marginTop: '10px' } }, ...report.football.map((f) => h('div.report-line',
          h('span', formatDate(f.date, 'full')),
          h('span.report-line__v', `antes ${f.pre ?? '–'} · depois ${f.post ?? '–'} · dia seguinte ${f.nextDayScore ?? ({ better: 'melhor', same: 'igual', worse: 'pior' })[f.nextDay] ?? '–'}`),
        ))),
      )
      : null,

    h('div.card',
      h('div.card__title', 'Leitura dos registros'),
      ...(report.reading.length ? report.reading : ['Sem observações nesta semana.']).map((t) => h('p.muted', { style: { fontSize: '13.5px', marginTop: '6px' } }, t)),
    ),

    safetyNote('Este relatório organiza o que você registrou. Não é diagnóstico nem avaliação clínica — serve para apoiar a conversa com o ortopedista ou fisioterapeuta.', 'info'),
  );
}

function stat(label, value, sub = '') {
  return h('div.stat', h('div.stat__label', label), h('div.stat__value', { style: { fontSize: '20px' } }, value), sub ? h('div.stat__sub', sub) : null);
}

function line(label, value) {
  return h('div.report-line', h('span', label), h('span.report-line__v', String(value ?? 0)));
}

async function exportReportPdf(report) {
  try {
    const profile = await store.profile.get();
    const s = report.symptoms;
    const doc = new PdfDoc({
      title: `Relatorio semanal do joelho - ${report.from}`,
      footer: 'Kao Training - registro pessoal. Não é diagnóstico nem avaliação clínica.',
    });

    doc.text('RELATÓRIO SEMANAL — JOELHO ESQUERDO (TENDÃO PATELAR)', { size: 15, bold: true, gap: 2 });
    doc.text(`Semana de ${formatDate(report.from, 'full')} a ${formatDate(report.to, 'full')} · gerado em ${formatDate(today(), 'full')}${profile?.name ? ` · ${profile.name}` : ''}`, { size: 9.5, color: '#555555' });
    doc.text('Documento de acompanhamento gerado a partir dos registros do próprio paciente. Não é diagnóstico, não é prescrição e não substitui avaliação profissional.', { size: 9, color: '#8A4B00' });

    doc.heading('Resumo');
    doc.table([
      ['Indicador', 'Valor'],
      ['Dias com treino de pernas', String(report.legDays)],
      ['Séries de perna / volume total', `${report.totalSets} séries · ${report.totalVolume} kg`],
      ['Futebol', `${report.football.length} jogo(s) · ${report.footballMinutes} min`],
      ['Dor média / máxima (0–10)', s.avgScore != null ? `${s.avgScore} / ${s.maxScore}` : 'sem registros'],
      ['Tendência (2 sem. × 2 sem. anteriores)', report.trend.direction === 'insufficient' ? 'registros insuficientes' : `${report.trend.label} (${report.trend.previous} -> ${report.trend.recent})`],
      ['Situação no app', { ok: 'sem sinais de alerta', attention: 'atenção', caution: 'cautela' }[report.knee.level] + (report.knee.stopProgression ? ' · progressão interrompida' : '')],
    ], [0.5, 0.5]);

    doc.heading('Dor máxima registrada por dia');
    doc.bars(s.daily.map((d) => ({
      label: formatDate(d.date).slice(0, 5),
      value: d.max,
      color: d.max == null ? null : d.max >= 4 ? '#D64545' : d.max >= 2 ? '#E0A100' : '#2E9E6A',
    })));

    doc.heading('Exercícios realizados');
    doc.table([
      ['Exercício', 'Grupo', 'Séries', 'Cargas (kg)', 'Volume', 'Dor méd./pico', 'Amplitude / resposta'],
      ...report.exercises.map((e) => [
        e.name, e.role, String(e.sets),
        e.minWeight && e.minWeight !== e.topWeight ? `${e.minWeight}–${e.topWeight}` : String(e.topWeight),
        `${e.volume}`, `${e.avgPain} / ${e.maxPain}`,
        [e.rom, ...e.responses].filter(Boolean).join('; ') || '—',
      ]),
    ], [0.22, 0.14, 0.08, 0.12, 0.1, 0.12, 0.22], { size: 8 });
    if (!report.exercises.length) doc.text('Nenhum exercício de perna registrado nesta semana.', { size: 9.5 });

    if (report.strength.length) {
      doc.heading('Evolução de força (últimas 6 semanas)');
      doc.table([
        ['Exercício', 'Início', 'Atual', 'Variação', '1RM estimado'],
        ...report.strength.map((r) => [r.name, `${r.from} kg (${formatDate(r.fromDate)})`, `${r.to} kg (${formatDate(r.toDate)})`, `${r.delta > 0 ? '+' : ''}${r.delta} kg`, `${r.e1rmFrom} -> ${r.e1rmTo} kg`]),
      ], [0.3, 0.2, 0.2, 0.12, 0.18], { size: 8.5 });
    }

    doc.heading('Frequência de sintomas');
    doc.table([
      ['Sintoma', 'Ocorrências'],
      ['Dias com dor >= 3', String(s.daysWithPain3)],
      ['Inchaço', String(s.swelling)],
      ['Instabilidade', String(s.instability)],
      ['Rigidez', String(s.stiffness)],
      ['Dificuldade para caminhar / subir escadas', String(s.stairs)],
      ['Exercícios marcados "sem dor"', String(s.duringNone)],
      ['Exercícios marcados "dor aumentou"', String(s.duringWorse)],
      ['Joelho melhor no dia seguinte', String(s.nextDayBetter)],
      ['Joelho pior no dia seguinte', String(s.nextDayWorse)],
      ['Local relatado', Object.entries(s.locations).map(([k, n]) => `${PAIN_LOCATIONS.find((l) => l.value === k)?.label || k} (${n})`).join(', ') || '—'],
    ], [0.6, 0.4]);

    doc.heading('Resposta após futebol');
    if (report.football.length) {
      doc.table([
        ['Data', 'Duração', 'Dor antes', 'Dor depois', 'Dia seguinte'],
        ...report.football.map((f) => [formatDate(f.date, 'full'), f.minutes ? `${f.minutes} min` : '—', f.pre ?? '—', f.post ?? '—', f.nextDayScore ?? ({ better: 'melhor', same: 'igual', worse: 'pior' })[f.nextDay] ?? '—']),
      ], [0.28, 0.16, 0.18, 0.18, 0.2]);
    } else doc.text('Sem futebol registrado nesta semana.', { size: 9.5 });

    if (report.guidance) {
      doc.heading('Orientação profissional cadastrada no app');
      const g = report.guidance;
      doc.text(`${formatDate(g.date, 'full')} · ${g.professional || 'profissional não informado'}`, { size: 9.5 });
      if (g.diagnosis) doc.text(`Avaliação registrada: ${g.diagnosis}`, { size: 9.5 });
      if (g.limits) doc.text(`Limites: ${g.limits}`, { size: 9.5 });
      if (g.strengthening?.allowProgression) doc.text(`Progressão de carga: ${g.strengthening.allowProgression === 'no' ? 'não liberada' : 'liberada'}`, { size: 9.5 });
      if (g.strengthening?.frequency) doc.text(`Frequência do fortalecimento: ${g.strengthening.frequency}`, { size: 9.5 });
      if (g.strengthening?.romNotes) doc.text(`Amplitude / carga: ${g.strengthening.romNotes}`, { size: 9.5 });
    }

    doc.heading('Leitura dos registros (não diagnóstica)');
    for (const t of report.reading.length ? report.reading : ['Sem observações nesta semana.']) doc.text(`- ${t}`, { size: 9.5 });
    doc.spacer(6);
    doc.text('Perguntas para a consulta (sugestão): a carga atual dos exercícios está adequada? Posso progredir carga, amplitude ou volume — qual primeiro? Há exercício a evitar ou incluir? Como dosar o futebol na semana?', { size: 9.5, color: '#333333' });

    const result = await deliverPdf(doc.toBlob(), `relatorio-joelho-${report.from}.pdf`);
    if (result === 'downloaded') toast('PDF gerado.');
  } catch (err) {
    console.error(err);
    toast('Não foi possível gerar o PDF.', { type: 'warn' });
  }
}
