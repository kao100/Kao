/**
 * Alimentação.
 *
 * O que a tela precisa acertar, porque é onde apps de dieta perdem o usuário:
 * registrar tem que ser rápido. Então a água entra em um toque, o alimento
 * entra por busca com medida caseira (nada de balança) e o que você come todo
 * dia fica a um toque de distância em "de novo".
 *
 * O app acompanha; não prescreve. As metas são referências calculadas do seu
 * peso, editáveis, e não substituem nutricionista.
 */

import { h } from '../../core/dom.js';
import { refresh } from '../../core/router.js';
import * as store from '../../core/store.js';
import { uid } from '../../core/util.js';
import { today, formatDate, num, addDays } from '../../core/format.js';
import { page, topbar, sectionTitle, emptyState, safetyNote } from '../shell.js';
import { openSheet, confirmSheet, formSheet } from '../components/sheet.js';
import { toastOk, toast } from '../components/toast.js';
import { macrosFor, FOOD_GROUPS } from '../../data/foods.js';
import {
  targetsFor, dayTotals, recentDays, averageOfLogged,
  MEAL_SLOTS, mealLabel, slotForNow, PROTEIN_RANGE,
} from '../../logic/nutrition.js';

/** Copos rápidos de água. */
const WATER_STEPS = [
  { ml: 250, label: 'Copo', icon: '🥛' },
  { ml: 500, label: 'Garrafa', icon: '💧' },
  { ml: 1000, label: '1 litro', icon: '🚰' },
];

export async function foodView({ query }) {
  const date = query.data || today();
  const isToday = date === today();

  const [targets, totals, series] = await Promise.all([
    targetsFor(date), dayTotals(date), recentDays(14, date),
  ]);

  const byMeal = new Map(MEAL_SLOTS.map((s) => [s.id, []]));
  for (const m of totals.meals) {
    if (!byMeal.has(m.meal)) byMeal.set(m.meal, []);
    byMeal.get(m.meal).push(m);
  }

  const avgProtein = averageOfLogged(series, 'protein');

  return page(
    topbar({
      eyebrow: isToday ? 'Hoje' : formatDate(date, 'full'),
      title: 'Alimentação',
      actions: [h('button.iconbtn', { onClick: () => openAddFood(date), 'aria-label': 'Adicionar alimento' }, '＋')],
    }),

    /* ---------- navegação entre dias ---------- */
    h('div.row.row--between', { style: { marginBottom: '4px' } },
      h('button.btn.btn--sm.btn--ghost', { onClick: () => go(addDays(date, -1)) }, '‹ dia anterior'),
      isToday
        ? h('span.pill.pill--volt', 'hoje')
        : h('button.btn.btn--sm.btn--ghost', { onClick: () => go(today()) }, 'ir para hoje ›'),
    ),

    /* ---------- água ---------- */
    waterCard(date, totals.waterMl, targets.water),

    /* ---------- proteína (o número que mais importa aqui) ---------- */
    proteinCard(totals.protein, targets),

    /* ---------- calorias e demais macros ---------- */
    h('div.card',
      h('div.row.row--between',
        h('div.card__title', 'Resto do dia'),
        targets.kcal.value
          ? h('span.list-item__sub', `meta ${targets.kcal.value} kcal`)
          : h('button.btn.btn--sm.btn--ghost', { onClick: () => editTargets() }, 'definir meta'),
      ),
      h('div.grid-2', { style: { marginTop: '10px' } },
        stat('Calorias', totals.kcal ? String(totals.kcal) : '—', targets.kcal.value ? `de ${targets.kcal.value}` : 'sem meta definida'),
        stat('Carboidrato', totals.carbs ? `${totals.carbs} g` : '—', 'energia do treino'),
        stat('Gordura', totals.fat ? `${totals.fat} g` : '—', ''),
        stat('Itens', String(totals.itemCount), totals.itemCount === 1 ? 'registro hoje' : 'registros hoje'),
      ),
    ),

    /* ---------- refeições ---------- */
    h('div.stack.stack--sm',
      sectionTitle('Refeições'),
      ...MEAL_SLOTS.map((slot) => {
        const items = byMeal.get(slot.id) || [];
        if (!items.length && !isToday) return null;
        const p = Math.round(items.reduce((s, i) => s + (Number(i.protein) || 0), 0));
        const k = Math.round(items.reduce((s, i) => s + (Number(i.kcal) || 0), 0));
        return h('div.card.card--tight',
          h('div.row.row--between',
            h('div',
              h('div.list-item__title', `${slot.icon} ${slot.label}`),
              h('div.list-item__sub', items.length ? `${k} kcal · ${p} g de proteína` : 'nada registrado'),
            ),
            h('button.btn.btn--sm.btn--ghost', { onClick: () => openAddFood(date, slot.id) }, '＋'),
          ),
          items.length
            ? h('div.stack.stack--sm', { style: { marginTop: '8px' } },
              ...items.map((item) => h('button.list-item', {
                style: { width: '100%', textAlign: 'left', background: 'none', border: 'none' },
                onClick: () => openEditEntry(item),
              },
              h('div.grow',
                h('div.list-item__title', item.name),
                h('div.list-item__sub', `${item.portionLabel || `${item.grams} g`} · ${item.kcal} kcal · P ${num(item.protein, 1)} g`),
              ),
              h('span.list-item__sub', '›'),
              )),
            )
            : null,
        );
      }).filter(Boolean),
    ),

    /* ---------- tendência ---------- */
    series.some((d) => d.itemCount > 0)
      ? h('div.card',
        h('div.card__title', 'Proteína nos últimos 14 dias'),
        h('div.list-item__sub', { style: { marginBottom: '10px' } },
          avgProtein != null
            ? `Média de ${avgProtein} g nos dias que você registrou. Dia sem registro não entra na conta — em branco quer dizer desconhecido, não zero.`
            : 'Sem registros ainda.'),
        proteinBars(series, targets.protein.value),
      )
      : null,

    h('div.btn-row',
      h('button.btn.btn--primary.btn--block', { onClick: () => openAddFood(date) }, '＋ Adicionar alimento'),
    ),
    h('div.btn-row',
      h('button.btn.btn--ghost.btn--block', { onClick: () => editTargets() }, '🎯 Minhas metas'),
      h('button.btn.btn--ghost.btn--block', { onClick: () => openFoodTable() }, '📖 Tabela de alimentos'),
    ),

    safetyNote('Os valores dos alimentos são de referência, não do rótulo da marca que você comprou, e as metas são estimativas a partir do seu peso. Isto é acompanhamento, não uma dieta: para um plano alimentar individual, procure um nutricionista.'),
  );
}

function go(date) {
  location.hash = `#/alimentacao?data=${date}`;
}

/* ------------------------------------------------------------------ */
/* Cartões                                                             */
/* ------------------------------------------------------------------ */

function waterCard(date, ml, target) {
  const goal = target.value || 2500;
  const pct = Math.min(100, Math.round((ml / goal) * 100));
  const glasses = Math.round(ml / 250);

  return h('div.card',
    h('div.row.row--between',
      h('div.card__title', '💧 Água'),
      h('div.list-item__sub', `${num(ml / 1000, 2)} L de ${num(goal / 1000, 1)} L`),
    ),
    h('div.bar', { style: { marginTop: '10px' } },
      h('div.bar__fill', { style: { width: `${pct}%`, background: 'var(--cardio, #4aa3df)' } })),
    h('div.list-item__sub', { style: { marginTop: '6px' } },
      glasses ? `${glasses} copo${glasses === 1 ? '' : 's'} de 250 ml` : 'Nada ainda hoje',
      target.source === 'weight' && target.trainingHours
        ? ` · meta já inclui o treino de hoje`
        : ''),
    h('div.btn-row.mt',
      ...WATER_STEPS.map((s) => h('button.btn.btn--sm.btn--ghost', {
        onClick: async () => {
          await store.nutritionDay.addWater(date, s.ml);
          toast(`+${s.ml} ml`);
          refresh();
        },
      }, `${s.icon} ${s.label}`)),
      ml > 0
        ? h('button.btn.btn--sm.btn--ghost', {
          onClick: async () => { await store.nutritionDay.addWater(date, -250); refresh(); },
          'aria-label': 'Tirar um copo',
        }, '−')
        : null,
    ),
  );
}

function proteinCard(grams, targets) {
  const t = targets.protein;
  const goal = t.value;
  const pct = goal ? Math.min(100, Math.round((grams / goal) * 100)) : 0;
  const hit = goal && grams >= goal;

  return h('div.card',
    h('div.row.row--between',
      h('div.card__title', '🥩 Proteína'),
      hit ? h('span.pill.pill--volt', 'meta batida') : null,
    ),
    h('div.stat__value', { style: { fontSize: '32px', marginTop: '4px' } },
      goal ? `${grams} / ${goal} g` : `${grams} g`),
    goal
      ? h('div.bar', { style: { marginTop: '8px' } },
        h('div.bar__fill', { style: { width: `${pct}%` } }))
      : null,
    h('div.list-item__sub', { style: { marginTop: '8px' } },
      t.source === 'custom'
        ? 'Meta definida por você.'
        : t.source === 'weight'
          ? `Referência para hipertrofia: ${PROTEIN_RANGE[0]}–${PROTEIN_RANGE[1]} g por kg, ou ${t.range[0]}–${t.range[1]} g para os seus ${num(targets.weight, 1)} kg. A meta usa o piso da faixa.`
          : 'Registre seu peso em Ajustes para o app calcular uma referência.'),
  );
}

function proteinBars(series, goal) {
  const max = Math.max(goal || 0, ...series.map((d) => d.protein), 1);
  return h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '3px', height: '90px' } },
    ...series.map((d) => {
      const hgt = Math.round((d.protein / max) * 100);
      const met = goal && d.protein >= goal;
      return h('div', {
        style: { flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' },
        title: `${formatDate(d.date, 'full')}: ${d.protein} g`,
      },
      // dia sem registro fica como um traço apagado, não como barra zerada:
      // a série tem que se ler como 14 dias, e "não anotei" não é "comi zero"
      h('div', {
        style: d.itemCount
          ? {
            height: `${Math.max(hgt, 3)}%`,
            minHeight: '3px',
            borderRadius: '3px 3px 0 0',
            background: met ? 'var(--volt, #c8f560)' : 'var(--text-3, #7a7a7a)',
          }
          : {
            height: '2px',
            borderRadius: '2px',
            background: 'var(--line-soft, #2a2a2a)',
          },
      }));
    }),
  );
}

function stat(label, value, sub) {
  return h('div.stat', h('div.stat__label', label), h('div.stat__value', value), sub ? h('div.stat__sub', sub) : null);
}

/* ------------------------------------------------------------------ */
/* Registrar um alimento                                               */
/* ------------------------------------------------------------------ */

async function openAddFood(date, mealId = null) {
  const meal = mealId || slotForNow();
  const [allFoods, recent] = await Promise.all([store.foods.search(''), recentEntries()]);

  openSheet({
    title: 'O que você comeu?',
    content: (close) => {
      const results = h('div.stack.stack--sm');
      const input = h('input.input', { type: 'search', placeholder: 'Buscar: frango, arroz, whey, ovo…', autofocus: true });

      const render = (list, heading) => {
        results.textContent = '';
        if (heading) results.appendChild(h('div.list-item__sub', heading));
        if (!list.length) {
          results.appendChild(h('p.muted', 'Nada encontrado. Use "Novo alimento" abaixo para cadastrar com os números do rótulo.'));
          return;
        }
        for (const fd of list.slice(0, 40)) {
          results.appendChild(h('button.list-item', {
            style: { width: '100%', textAlign: 'left', background: 'none', border: 'none' },
            onClick: () => { close(); openPortionSheet(fd, date, meal); },
          },
          h('div.grow',
            h('div.list-item__title', fd.name),
            h('div.list-item__sub', `${fd.kcal} kcal · P ${fd.protein} g por ${fd.per}`),
          ),
          h('span.list-item__sub', '›'),
          ));
        }
      };

      input.addEventListener('input', async () => {
        const q = input.value.trim();
        if (!q) { render(recent.length ? recent : allFoods, recent.length ? 'Você registrou recentemente' : null); return; }
        render(await store.foods.search(q));
      });

      render(recent.length ? recent : allFoods, recent.length ? 'Você registrou recentemente' : null);

      return h('div.stack',
        h('div.field',
          h('label.field__label', `Refeição: ${mealLabel(meal)}`),
          input,
        ),
        results,
        h('button.btn.btn--ghost.btn--block', {
          onClick: () => { close(); openCustomFood(date, meal); },
        }, '＋ Novo alimento (do rótulo)'),
      );
    },
  });
}

/** Alimentos usados nos últimos 30 dias, os mais frequentes primeiro. */
async function recentEntries() {
  const all = await store.meals.all();
  const since = addDays(today(), -30);
  const counts = new Map();
  for (const m of all) {
    if (m.date < since || !m.foodId) continue;
    counts.set(m.foodId, (counts.get(m.foodId) || 0) + 1);
  }
  if (!counts.size) return [];
  const foods = await store.foods.all();
  const map = new Map(foods.map((f) => [f.id, f]));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => map.get(id))
    .filter(Boolean)
    .slice(0, 12);
}

function openPortionSheet(food, date, meal) {
  openSheet({
    title: food.name,
    content: (close) => {
      const portions = food.portions?.length ? food.portions : [['100 g', 100]];
      let grams = portions[0][1];
      let label = portions[0][0];
      let count = 1;

      const preview = h('div.grid-2');
      const countLabel = h('div.stat__value', { style: { fontSize: '22px' } }, '1');

      const paint = () => {
        const total = grams * count;
        const m = macrosFor(food, total);
        countLabel.textContent = String(count);
        preview.textContent = '';
        preview.appendChild(stat('Calorias', String(m.kcal), `${Math.round(total)} g`));
        preview.appendChild(stat('Proteína', `${m.protein} g`, ''));
        preview.appendChild(stat('Carboidrato', `${m.carbs} g`, ''));
        preview.appendChild(stat('Gordura', `${m.fat} g`, ''));
      };

      const options = h('div.btn-row', { style: { flexWrap: 'wrap' } },
        ...portions.map(([lbl, g], i) => {
          const btn = h('button.btn.btn--sm', { class: i === 0 ? 'btn--primary' : 'btn--ghost' }, lbl);
          btn.addEventListener('click', () => {
            grams = g; label = lbl;
            [...options.children].forEach((c) => { c.className = 'btn btn--sm btn--ghost'; });
            btn.className = 'btn btn--sm btn--primary';
            paint();
          });
          return btn;
        }),
      );

      paint();

      return h('div.stack',
        h('div.field', h('label.field__label', 'Medida'), options),
        h('div.field',
          h('label.field__label', 'Quantas'),
          h('div.row', { style: { gap: '12px', alignItems: 'center' } },
            h('button.btn.btn--ghost', { onClick: () => { count = Math.max(0.5, count - 0.5); paint(); } }, '−'),
            countLabel,
            h('button.btn.btn--ghost', { onClick: () => { count += 0.5; paint(); } }, '＋'),
          ),
        ),
        preview,
        h('button.btn.btn--primary.btn--block', {
          onClick: async () => {
            const total = grams * count;
            const m = macrosFor(food, total);
            await store.meals.save({
              id: uid('meal'), date, meal, foodId: food.id, name: food.name,
              grams: Math.round(total), portionLabel: count === 1 ? label : `${count} × ${label}`,
              ...m,
            });
            close();
            toastOk(`${food.name} · ${m.protein} g de proteína`);
            refresh();
          },
        }, 'Registrar'),
      );
    },
  });
}

async function openCustomFood(date, meal) {
  const data = await formSheet({
    title: 'Novo alimento',
    intro: 'Copie os números do rótulo. Ele fica salvo na sua tabela para as próximas vezes.',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', value: '' },
      { key: 'kcal', label: 'Calorias por 100 g', type: 'number', step: '1', value: '' },
      { key: 'protein', label: 'Proteína por 100 g', type: 'number', step: '0.1', value: '' },
      { key: 'carbs', label: 'Carboidrato por 100 g', type: 'number', step: '0.1', value: '' },
      { key: 'fat', label: 'Gordura por 100 g', type: 'number', step: '0.1', value: '' },
      { key: 'portionG', label: 'Peso de 1 porção (g)', type: 'number', step: '1', value: '100' },
    ],
  });
  if (!data?.name) return;
  const portionG = Number(data.portionG) || 100;
  const food = await store.foods.save({
    id: uid('fd'),
    name: data.name,
    group: 'pronto',
    per: '100 g',
    kcal: Number(data.kcal) || 0,
    protein: Number(data.protein) || 0,
    carbs: Number(data.carbs) || 0,
    fat: Number(data.fat) || 0,
    portions: [[`1 porção (${portionG} g)`, portionG], ['100 g', 100]],
    aliases: [],
    builtin: false,
  });
  toastOk('Alimento salvo na sua tabela');
  openPortionSheet(food, date, meal);
}

function openEditEntry(item) {
  openSheet({
    title: item.name,
    content: (close) => h('div.stack',
      h('div.grid-2',
        stat('Calorias', String(item.kcal), item.portionLabel || `${item.grams} g`),
        stat('Proteína', `${num(item.protein, 1)} g`, ''),
        stat('Carboidrato', `${num(item.carbs, 1)} g`, ''),
        stat('Gordura', `${num(item.fat, 1)} g`, ''),
      ),
      h('div.list-item__sub', `${mealLabel(item.meal)} · ${formatDate(item.date, 'full')}`),
      h('button.btn.btn--danger.btn--block', {
        onClick: async () => {
          await store.meals.remove(item.id);
          close();
          toastOk('Registro removido');
          refresh();
        },
      }, 'Remover este registro'),
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Metas e tabela                                                      */
/* ------------------------------------------------------------------ */

async function editTargets() {
  const [settings, targets] = await Promise.all([store.settings.get(), targetsFor()]);
  const cur = settings?.nutritionTargets || {};

  const data = await formSheet({
    title: 'Minhas metas',
    intro: 'Deixe em branco para o app calcular a partir do seu peso. O que você escrever aqui sempre ganha do calculado.',
    fields: [
      {
        key: 'protein',
        label: `Proteína por dia (g)${targets.protein.range ? ` — referência ${targets.protein.range[0]}–${targets.protein.range[1]}` : ''}`,
        type: 'number', step: '1', value: cur.protein ?? '',
      },
      { key: 'waterMl', label: 'Água por dia (ml)', type: 'number', step: '100', value: cur.waterMl ?? '' },
      { key: 'kcal', label: 'Calorias por dia (opcional)', type: 'number', step: '10', value: cur.kcal ?? '' },
    ],
  });
  if (!data) return;
  const clean = {};
  for (const k of ['protein', 'waterMl', 'kcal']) {
    const v = String(data[k] ?? '').trim();
    if (v !== '') clean[k] = Number(v);
  }
  await store.settings.save({ nutritionTargets: clean });
  toastOk('Metas salvas');
  refresh();
}

async function openFoodTable() {
  const foods = await store.foods.all();
  const byGroup = new Map(FOOD_GROUPS.map(([id]) => [id, []]));
  for (const f of foods) {
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group).push(f);
  }

  openSheet({
    title: `Tabela de alimentos (${foods.length})`,
    content: () => h('div.stack.stack--sm',
      h('p.muted', { style: { fontSize: '13px' } },
        'Valores por 100 g, de tabelas de composição de alimentos. São referência, não o rótulo da marca — quando tiver o rótulo em mãos, ele ganha.'),
      ...FOOD_GROUPS.map(([id, label]) => {
        const list = (byGroup.get(id) || []).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
        if (!list.length) return null;
        return h('div.card.card--tight',
          h('div.card__title', label),
          h('div.stack.stack--sm', { style: { marginTop: '6px' } },
            ...list.map((f) => h('div.report-line',
              h('span', f.name),
              h('span.report-line__v', `${f.kcal} kcal · P ${f.protein}`),
            )),
          ),
        );
      }).filter(Boolean),
    ),
  });
}
