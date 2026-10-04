// Звук и вибрация при добавлении записей.

export let sharedAudioCtx = null;

export function playBeep(freq = 880, durationMs = 90) {
  try {
    if (!sharedAudioCtx) sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (e) { /* no audio available */ }
}

export function playVibrate(pattern = 40) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* not supported */ }
}
