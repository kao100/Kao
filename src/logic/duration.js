/**
 * Quanto tempo um treino leva.
 *
 * A conta é simples de propósito: série a série, tempo de execução mais o
 * descanso programado. Não tenta adivinhar fila na máquina nem conversa —
 * serve para você saber, antes de sair de casa, se o treino cabe no tempo que
 * você tem hoje.
 *
 * O descanso é o que mais pesa. Por isso, quando o treino não cabe, a sugestão
 * NÃO é cortar exercício: é encurtar o descanso dos isoladores, que custa pouco
 * em resultado. Cortar série é a última opção, e o app diz qual cortar.
 */

/** Segundos por repetição, na média de um treino controlado. */
const SEC_PER_REP = 3.5;
/** Transição entre exercícios: ajustar máquina, anotar, beber água. */
const SETUP_SEC_PER_EXERCISE = 60;

export function estimateItemSeconds(item) {
  const sets = item.sets || 0;
  const work = item.timeBased
    ? (item.durationSec || 30)
    : ((item.repMax || item.repMin || 10) * SEC_PER_REP);
  const rest = item.restSec ?? 90;
  // o último descanso do exercício vira a transição para o próximo
  return sets * work + Math.max(0, sets - 1) * rest + SETUP_SEC_PER_EXERCISE;
}

export function estimateTemplateMinutes(template) {
  const seconds = (template?.items || []).reduce((s, it) => s + estimateItemSeconds(it), 0);
  return Math.round(seconds / 60);
}

/** Minutos do bloco de cardio, se houver. */
export function cardioMinutes(plan) {
  return plan?.totalMin || 0;
}

/**
 * O treino cabe no tempo de hoje?
 * `budget` em minutos. Devolve também o que fazer se não couber.
 */
export function fitsBudget(template, budget, { cardioMin = 0 } = {}) {
  const strength = estimateTemplateMinutes(template);
  const total = strength + cardioMin;
  if (!budget || total <= budget) {
    return { total, strength, cardioMin, fits: true, over: 0, advice: null };
  }

  const over = total - budget;
  const items = template?.items || [];

  // 1) apertar o descanso dos isoladores (descanso curto) antes de mexer no resto
  const short = items.filter((it) => (it.restSec ?? 90) <= 75);
  const savedByRest = short.reduce((s, it) => s + Math.max(0, (it.sets || 1) - 1) * 15, 0);

  if (savedByRest >= over * 60) {
    return {
      total, strength, cardioMin, fits: false, over,
      advice: `Passa ${over} min do seu tempo. Tirando 15 s do descanso dos isoladores já resolve — em exercício pequeno, descanso curto quase não custa resultado.`,
    };
  }

  // 2) só então, indicar o corte de menor custo: a última série do último isolador
  const last = [...items].reverse().find((it) => (it.restSec ?? 90) <= 75 && (it.sets || 0) > 1);
  return {
    total, strength, cardioMin, fits: false, over,
    advice: last
      ? `Passa ${over} min do seu tempo. Encurte o descanso dos isoladores e, se ainda faltar, tire a última série do último exercício — nunca a do primeiro, que é o que mais rende.`
      : `Passa ${over} min do seu tempo. Encurte os descansos, ou faça o cardio em outro dia.`,
  };
}
