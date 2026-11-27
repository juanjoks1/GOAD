// Efectos puntuales. Por ahora: la puerta metálica (pestillo, chirrido de bisagra y golpe pesado).
import { noiseBurst, tone } from './noise.js';

/** Devuelve la duración aproximada (s). */
export function playMetalDoor(ctx, out, reverbSend, noise) {
  const t0 = ctx.currentTime + 0.05;
  const bus = ctx.createGain();
  bus.gain.value = 0.9;
  bus.connect(out);
  const send = ctx.createGain();
  send.gain.value = 0.9;
  bus.connect(send).connect(reverbSend);

  // Pestillo: chasquido metálico y dos resonancias.
  noiseBurst(ctx, noise.white, bus, t0, { type: 'bandpass', freq: 3200, Q: 2, duration: 0.05, gain: 0.5 });
  tone(ctx, bus, t0, { freq: 1870, duration: 0.3, gain: 0.08 });
  tone(ctx, bus, t0, { freq: 2960, duration: 0.22, gain: 0.05 });
  noiseBurst(ctx, noise.white, bus, t0 + 0.13, { type: 'lowpass', freq: 900, Q: 1, duration: 0.09, gain: 0.45 });
  tone(ctx, bus, t0 + 0.13, { freq: 220, freqEnd: 170, duration: 0.12, gain: 0.25 });

  // Bisagra: diente de sierra grave con afinación errática, por dos resonancias estrechas.
  const cs = t0 + 0.4;
  const cd = 1.5;
  const curve = new Float32Array(64);
  let f = 70;
  for (let i = 0; i < curve.length; i++) {
    f = Math.min(100, Math.max(58, f + (Math.random() * 2 - 1) * 6));
    curve[i] = f;
  }
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueCurveAtTime(curve, cs, cd);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, cs);
  env.gain.linearRampToValueAtTime(0.22, cs + 0.25);
  env.gain.setValueAtTime(0.2, cs + cd - 0.3);
  env.gain.exponentialRampToValueAtTime(0.0001, cs + cd);
  for (const [freq, q, g] of [
    [720, 9, 1],
    [1450, 12, 0.6],
  ]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const gg = ctx.createGain();
    gg.gain.value = g;
    osc.connect(bp).connect(gg).connect(env);
  }
  env.connect(bus);
  osc.start(cs);
  osc.stop(cs + cd + 0.1);
  noiseBurst(ctx, noise.white, bus, cs, { type: 'bandpass', freq: 1100, Q: 4, duration: cd, gain: 0.05, attack: 0.3 });

  // Golpe: la puerta se cierra detrás de ti.
  const b = cs + cd + 0.25;
  tone(ctx, bus, b, { freq: 48, freqEnd: 36, duration: 1.6, gain: 0.7, attack: 0.004 });
  noiseBurst(ctx, noise.white, bus, b, { type: 'lowpass', freq: 280, Q: 0.7, duration: 0.7, gain: 0.55 });
  for (const [freq, g] of [
    [212, 0.06],
    [377, 0.05],
    [611, 0.035],
    [893, 0.02],
  ]) {
    tone(ctx, bus, b, { freq, duration: 1.8, gain: g });
  }
  setTimeout(() => {
    bus.disconnect();
    send.disconnect();
  }, (b - ctx.currentTime + 5) * 1000);
  return b - t0 + 1.8;
}
