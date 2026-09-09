/**
 * Bipes curtos para o cronômetro de descanso e as trocas de fase do cardio.
 * Usa WebAudio (funciona no iOS depois de qualquer toque na tela).
 */

let ctx = null;
let unlocked = false;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** O iOS exige um gesto do usuário para liberar o áudio. */
export function unlockAudio() {
  if (unlocked) return;
  const c = context();
  if (!c) return;
  c.resume?.();
  const osc = c.createOscillator();
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.01);
  unlocked = true;
}

function tone(freq, duration = 0.12, when = 0, volume = 0.25) {
  const c = context();
  if (!c) return;
  c.resume?.();
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function beepTick() { tone(660, 0.07, 0, 0.14); }
export function beepDone() { tone(880, 0.15, 0); tone(1320, 0.2, 0.14); }
export function beepPhase() { tone(520, 0.14, 0); tone(780, 0.14, 0.16); tone(1040, 0.22, 0.32); }
export function beepFinish() {
  tone(660, 0.14, 0); tone(880, 0.14, 0.15); tone(1100, 0.3, 0.3);
}

/** Mantém a tela acesa durante o treino/cardio quando o navegador permite. */
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on) {
      if (!wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* sem suporte (Safari antigo) — segue normalmente */ }
}
