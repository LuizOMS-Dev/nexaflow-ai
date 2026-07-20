/**
 * Som de notificação in-app (Web Audio — sem arquivo externo).
 * Usado no sino, fila humana e eventos realtime.
 */

let lastPlayAt = 0;
const MIN_GAP_MS = 450;

/** Tom curto e perceptível (dois bipes leves). */
export function playNotificationSound(opts?: { force?: boolean }) {
  if (typeof window === "undefined") return;
  const nowMs = Date.now();
  if (!opts?.force && nowMs - lastPlayAt < MIN_GAP_MS) return;
  lastPlayAt = nowMs;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    gain.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, now);
    o1.connect(gain);
    o1.start(now);
    o1.stop(now + 0.11);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1174.66, now + 0.13);
    o2.connect(gain);
    o2.start(now + 0.13);
    o2.stop(now + 0.3);

    window.setTimeout(() => {
      void ctx.close().catch(() => null);
    }, 450);
  } catch {
    /* ignore — autoplay policies / browsers sem AudioContext */
  }
}

/**
 * Tenta “destravar” o AudioContext no primeiro gesto do usuário
 * (browsers bloqueiam autoplay de áudio até interação).
 */
export function primeNotificationAudio() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume().then(() => ctx.close()).catch(() => null);
  } catch {
    /* ignore */
  }
}
