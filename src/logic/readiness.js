/**
 * Check-in rápido de recuperação (opcional, antes do treino).
 *
 * Gera apenas uma indicação prática de como conduzir a sessão.
 * Não é avaliação médica nem diagnóstico.
 */

export const READINESS = {
  green: { key: 'green', emoji: '🟢', label: 'Pronto para treinar', accent: 'ok' },
  yellow: { key: 'yellow', emoji: '🟡', label: 'Atenção à recuperação', accent: 'warn' },
  red: { key: 'red', emoji: '🔴', label: 'Considere reduzir a intensidade', accent: 'danger' },
};

/**
 * @param {object} input {sleep, energy, soreness, motivation, knee}
 *  sleep/energy/motivation: 1 (ruim) a 5 (ótimo)
 *  soreness: 1 (sem dor muscular) a 5 (muita dor muscular)
 *  knee: 0 a 10
 */
export function evaluateReadiness(input) {
  const sleep = clampScale(input.sleep);
  const energy = clampScale(input.energy);
  const motivation = clampScale(input.motivation);
  const soreness = clampScale(input.soreness);
  const knee = Number(input.knee ?? 0);

  const score = sleep + energy + motivation + (6 - soreness); // 4 a 20
  const reasons = [];

  let verdict = READINESS.green;

  if (score <= 10) { verdict = READINESS.red; reasons.push('Sono, energia e dor muscular indicam recuperação incompleta.'); }
  else if (score <= 14) { verdict = READINESS.yellow; reasons.push('Recuperação parcial.'); }

  if (soreness >= 5) {
    verdict = worst(verdict, READINESS.yellow);
    reasons.push('Dor muscular alta: considere reduzir o volume ou trocar a ênfase do dia.');
  }
  if (sleep <= 2) {
    verdict = worst(verdict, READINESS.yellow);
    reasons.push('Noite de sono ruim: mantenha a carga e evite tentar recorde hoje.');
  }
  if (knee >= 5) {
    verdict = READINESS.red;
    reasons.push('Dor importante no joelho registrada — priorize exercícios sem dor e converse com seu ortopedista/fisioterapeuta.');
  } else if (knee >= 3) {
    verdict = worst(verdict, READINESS.yellow);
    reasons.push('Joelho com dor perceptível: evite aumentar carga em exercícios que exigem o tendão patelar.');
  }

  const advice = {
    green: 'Pode seguir o treino como planejado, mantendo RIR 1–2 na maior parte das séries.',
    yellow: 'Mantenha as cargas, capriche na técnica e não force repetições extras hoje.',
    red: 'Reduza séries/carga, priorize o que não dói e considere trocar por cardio leve ou mobilidade — sem perder os 30 minutos do dia.',
  }[verdict.key];

  return { ...verdict, score, reasons, advice };
}

function clampScale(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

function worst(a, b) {
  const order = { green: 0, yellow: 1, red: 2 };
  return order[a.key] >= order[b.key] ? a : b;
}
