/**
 * Projeto Casamento — 8 semanas.
 *  - card no Início com semana atual e os indicadores do tronco;
 *  - tela /projeto com a evolução completa;
 *  - configuração (data de início e data do casamento), salva só no aparelho.
 */

import { h } from '../../core/dom.js';
import { navigate, refresh } from '../../core/router.js';
import { today, formatDate, num, signed } from '../../core/format.js';
import { projectOverview, saveProject, PRINCIPLES, PROJECT_WEEKS } from '../../logic/project.js';
import { page, topbar, sectionTitle, safetyNote, emptyState } from '../shell.js';
import { openSheet } from '../components/sheet.js';
import { lineChart } from '../components/chart.js';
import { toastOk } from '../components/toast.js';

/* ---------------------------- card do Início ---------------------------- */

export async function projectCard(date = today()) {
  const ov = await projectOverview(date);
  if (!ov.project?.startDate) {
    if (ov.project?.active === false) return null;
    return h('section.card.card--accent',
      h('div.card__title', '💍 Projeto Casamento — 8 semanas'),
      h('p.muted', { style: { fontSize: '13.5px', marginTop: '6px' } },
        'Marque o início para o app acompanhar a semana do projeto e os indicadores do tronco: supinos, puxada, remada, desenvolvimento, medidas e fotos.'),
      h('button.btn.btn--primary.btn--block.mt', { onClick: () => openProjectSheet(ov.project) }, 'Configurar o projeto'),
    );
  }
  if (ov.project.active === false) return null;
  const st = ov.status;

  return h('section.card.clickable.project-card', { onClick: () => navigate('/projeto') },
    h('div.row.row--between',
      h('div',
        h('div.card__title', `💍 ${ov.project.name || 'Projeto Casamento'}`),
        h('div.card__sub', st.ended
          ? 'As 8 semanas terminaram — veja o antes e depois'
          : `Semana ${st.week} de ${st.weeks}${st.daysLeft >= 0 ? ` · faltam ${st.daysLeft} dia${st.daysLeft === 1 ? '' : 's'}` : ''}`),
      ),
      h('span.muted', '›'),
    ),
    h('div.bar', { style: { marginTop: '10px' } }, h('div.bar__fill', { style: { width: `${st.pct}%` } })),

    h('div.lift-grid', { style: { marginTop: '12px' } },
      ...ov.lifts.map((l) => h('div.lift',
        h('div.lift__label', l.label),
        h('div.lift__value', l.latest ? `${num(l.latest.top, 1)} kg` : '—'),
        h('div', { class: `lift__delta ${deltaClass(l.delta)}` }, l.delta == null ? 'sem registro' : l.delta === 0 ? 'igual ao início' : `${signed(l.delta, 1)} kg`),
      )),
    ),

    h('div.lift-grid', { style: { marginTop: '8px' } },
      measureTile('Peito', ov.measures.chest),
      measureTile('Braço', ov.measures.arm),
      measureTile(ov.measures.abdomenIsWaist ? 'Cintura' : 'Abdômen', ov.measures.abdomen, true),
    ),

    ov.photoDue
      ? h('div.safety.safety--info', { style: { marginTop: '10px' } },
        `📸 ${ov.lastPhoto ? 'Já faz 2 semanas da última foto' : 'Sem fotos ainda'}: frente, costas e perfil, mesma luz e mesmo lugar.`)
      : null,
  );
}

function measureTile(label, m, lowerIsBetter = false) {
  return h('div.lift',
    h('div.lift__label', label),
    h('div.lift__value', m ? `${num(m.latest, 1)} cm` : '—'),
    h('div', { class: `lift__delta ${m ? deltaClass(lowerIsBetter ? -m.delta : m.delta) : ''}` },
      m ? (m.delta === 0 ? 'igual ao início' : `${signed(m.delta, 1)} cm`) : 'sem medida'),
  );
}

function deltaClass(d) {
  if (d == null || d === 0) return 'delta-flat';
  return d > 0 ? 'delta-up' : 'delta-down';
}

/* ---------------------------- tela /projeto ---------------------------- */

export async function projectView() {
  const ov = await projectOverview(today());
  if (!ov.status) {
    return page(
      topbar({ title: 'Projeto Casamento', showBack: true, backTo: '/' }),
      emptyState('💍', 'O projeto ainda não foi configurado.',
        h('button.btn.btn--primary', { onClick: () => openProjectSheet(ov.project) }, 'Configurar')),
    );
  }
  const st = ov.status;

  return page(
    topbar({
      eyebrow: `Semana ${st.week} de ${st.weeks}`,
      title: ov.project.name || 'Projeto Casamento',
      showBack: true,
      backTo: '/',
      actions: [h('button.iconbtn', { onClick: () => openProjectSheet(ov.project), 'aria-label': 'Configurar' }, '⚙️')],
    }),

    h('div.card',
      h('div.row.row--between',
        h('div',
          h('div.stat__label', 'Início'),
          h('div.stat__value', { style: { fontSize: '18px' } }, formatDate(ov.project.startDate, 'full')),
        ),
        h('div', { style: { textAlign: 'right' } },
          h('div.stat__label', ov.project.eventDate ? 'Casamento' : 'Fim das 8 semanas'),
          h('div.stat__value', { style: { fontSize: '18px' } }, formatDate(ov.project.eventDate || st.end, 'full')),
        ),
      ),
      h('div.bar', { style: { marginTop: '12px' } }, h('div.bar__fill', { style: { width: `${st.pct}%` } })),
      h('p.muted', { style: { fontSize: '13px', marginTop: '8px' } },
        st.ended ? 'Projeto concluído.' : `${st.daysLeft} dia(s) restantes.`),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Prioridade estética: tronco'),
      h('div.card.card--tight',
        ...[
          ['Peitoral', 'volume, com ênfase na parte superior e central'],
          ['Costas', 'largura e espessura — a silhueta em V'],
          ['Ombros', 'deltoides laterais e posteriores para largura visual'],
          ['Braços', 'bíceps e tríceps proporcionais'],
          ['Abdômen', 'força do core + redução gradual da gordura total'],
        ].map(([k, v]) => h('div.report-line', h('span', k), h('span.report-line__v', { style: { textAlign: 'right' } }, v))),
      ),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Exercícios-chave'),
      ...ov.lifts.map((l) => h('div.card',
        h('div.row.row--between',
          h('div.card__title', l.label),
          h('span', { class: `pill ${l.delta > 0 ? 'pill--ok' : ''}` },
            l.delta == null ? 'sem registro' : `${num(l.base.top, 1)} → ${num(l.latest.top, 1)} kg`),
        ),
        l.series.length > 1
          ? lineChart({ points: l.series.map((x) => ({ date: x.date, value: Math.round(x.best * 10) / 10 })), color: 'volt', formatValue: (v) => String(Math.round(v)) })
          : h('p.muted', { style: { fontSize: '13px', marginTop: '6px' } }, l.latest ? 'Registre mais sessões para ver a curva.' : 'Ainda não há séries registradas neste exercício.'),
        l.series.length > 1 ? h('div.list-item__sub', 'Curva: 1RM estimado por sessão (carga × repetições), que mostra força mesmo quando a carga fica igual e as repetições sobem.') : null,
      )),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Volume da semana (séries efetivas)'),
      h('div.card.card--tight',
        ...ov.targets.map((t) => {
          const done = ov.weekSets[t.group] || 0;
          const plan = ov.planned[t.group] || 0;
          const pct = Math.min(100, Math.round((done / t.max) * 100));
          return h('div', { style: { marginBottom: '10px' } },
            h('div.row.row--between',
              h('span', t.group),
              h('span.list-item__sub', `${done} feitas · programa ${plan} · ref. ${t.min}–${t.max}`),
            ),
            h('div.bar', { style: { marginTop: '4px' } }, h(`div.bar__fill${done >= t.min ? '' : '.bar__fill--flame'}`, { style: { width: `${pct}%` } })),
          );
        }),
        h('p.muted', { style: { fontSize: '12.5px' } },
          'Referência inicial, ajustada por desempenho e recuperação. Série efetiva = série de trabalho perto da falha (RIR até 3); aquecimento não conta. Volume indireto (ex.: tríceps no supino) não entra nesta conta.'),
      ),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Medidas'),
      measureCard('Peito', ov.measures.chest, 'cm'),
      measureCard('Braço (média dos lados)', ov.measures.arm, 'cm'),
      measureCard(ov.measures.abdomenIsWaist ? 'Cintura' : 'Circunferência abdominal', ov.measures.abdomen, 'cm', true),
      measureCard('Peso', ov.measures.weight, 'kg'),
      h('button.btn.btn--ghost.btn--block', { onClick: () => navigate('/fisico') }, 'Registrar medidas'),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Fotos comparativas'),
      h('div.grid-3',
        ...ov.poses.map((p) => h('div.photo-tile',
          p.latest ? h('img', { src: p.latest.photo, alt: p.label }) : h('div.photo-tile__empty', '📷'),
          h('div.lift__label', p.label),
          h('div.list-item__sub', p.count ? `${p.count} foto(s)` : 'nenhuma'),
        )),
      ),
      ov.photoDue ? safetyNote('Hora de novas fotos: frente, costas e perfil. Mesma luz, mesmo lugar, mesma hora do dia — senão a comparação engana.', 'info') : null,
      h('button.btn.btn--ghost.btn--block', { onClick: () => navigate('/fisico') }, 'Abrir antes × agora'),
    ),

    h('div.stack.stack--sm',
      sectionTitle('Princípios do projeto'),
      ...PRINCIPLES.map((t) => h('p.muted', { style: { fontSize: '13.5px' } }, `• ${t}`)),
    ),

    safetyNote('O joelho não é ignorado em nome da estética: os dias de pernas seguem com o fortalecimento progressivo e o app trava a progressão quando os sinais pedem.', ''),
  );
}

function measureCard(label, m, unit, lowerIsBetter = false) {
  return h('div.card.card--tight',
    h('div.row.row--between',
      h('div.card__title', label),
      m ? h('span', { class: `pill ${deltaClass(lowerIsBetter ? -m.delta : m.delta) === 'delta-up' ? 'pill--ok' : ''}` },
        `${num(m.base, 1)} → ${num(m.latest, 1)} ${unit}`) : h('span.pill', 'sem registro'),
    ),
    m && m.series.length > 1
      ? lineChart({ points: m.series, color: lowerIsBetter ? 'ball' : 'volt', formatValue: (v) => num(v, 1), height: 110 })
      : null,
  );
}

/* ---------------------------- configuração ---------------------------- */

export function openProjectSheet(existing = null) {
  openSheet({
    title: 'Projeto Casamento',
    content: (close) => {
      const name = h('input.input', { placeholder: 'Projeto Casamento' });
      name.value = existing?.name || 'Projeto Casamento';
      const start = h('input.input', { type: 'date', value: existing?.startDate || today() });
      const event = h('input.input', { type: 'date', value: existing?.eventDate || '' });
      return h('div.stack',
        h('div.field', h('label.field__label', 'Nome'), name),
        h('div.field', h('label.field__label', `Início das ${PROJECT_WEEKS} semanas`), start),
        h('div.field', h('label.field__label', 'Data do casamento (opcional)'), event,
          h('div.field__hint', 'Fica só neste aparelho. Usada para a contagem regressiva.')),
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            await saveProject({ name: name.value || 'Projeto Casamento', startDate: start.value || today(), eventDate: event.value || null, active: true });
            close();
            toastOk('Projeto salvo');
            refresh();
          },
        }, 'Salvar'),
        existing?.startDate
          ? h('button.btn.btn--quiet.btn--block', {
            onClick: async () => { await saveProject({ active: false }); close(); refresh(); },
          }, 'Ocultar o projeto do Início')
          : null,
      );
    },
  });
}
