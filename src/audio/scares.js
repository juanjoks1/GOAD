// Sonidos de las entidades: estática que crece cuando algo está cerca, y golpes puntuales
// (desaparición, patas que corren, apagón, el chillido del susto). Todo sintetizado.
import { AUDIO } from '../config.js';
import { loopSource, noiseBurst, tone } from './noise.js';

/** Curva de distorsión dura para el chillido. */
function distortionCurve(amount = 40) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

export function createScareSounds(ctx, out, reverbSend, noise) {
  // Capa continua de "presencia": siseo agudo y retumbo grave que siguen a la interferencia.
  const hissHP = ctx.createBiquadFilter();
  hissHP.type = 'highpass';
  hissHP.frequency.value = 2600;
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  loopSource(ctx, noise.white).connect(hissHP).connect(hiss).connect(out);
  const rumbleLP = ctx.createBiquadFilter();
  rumbleLP.type = 'lowpass';
  rumbleLP.frequency.value = 90;
  const rumble = ctx.createGain();
  rumble.gain.value = 0;
  loopSource(ctx, noise.brown).connect(rumbleLP).connect(rumble).connect(out);

  const W = noise.white;
  const sounds = {
    vanish() {
      const t = ctx.currentTime + 0.01;
      noiseBurst(ctx, W, out, t, { type: 'bandpass', freq: 3200, Q: 0.6, duration: 0.45, gain: 0.35, attack: 0.005 });
      noiseBurst(ctx, W, out, t + 0.05, { type: 'bandpass', freq: 900, Q: 1.5, duration: 0.3, gain: 0.25 });
      tone(ctx, out, t, { wave: 'square', freq: 61, duration: 0.25, gain: 0.08 });
    },
    skitter() {
      const t0 = ctx.currentTime + 0.01;
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(-0.4, t0);
      pan.pan.linearRampToValueAtTime(0.5, t0 + 1.0);
      pan.connect(out);
      let t = t0;
      for (let i = 0; i < 26; i++) {
        t += 0.025 + Math.random() * 0.045;
        noiseBurst(ctx, W, pan, t, { type: 'bandpass', freq: 2500 + Math.random() * 2500, Q: 4, duration: 0.025, gain: 0.25 + Math.random() * 0.2 });
      }
      setTimeout(() => pan.disconnect(), 2000);
    },
    'lights-off'() {
      const t = ctx.currentTime + 0.01;
      noiseBurst(ctx, W, out, t, { type: 'lowpass', freq: 700, Q: 1, duration: 0.07, gain: 0.5 });
      tone(ctx, out, t, { freq: 95, freqEnd: 45, duration: 0.18, gain: 0.35 });
      tone(ctx, out, t, { wave: 'square', freq: 120, duration: 0.12, gain: 0.05 });
    },
    'lights-on'() {
      const t = ctx.currentTime + 0.01;
      for (let i = 0; i < 4; i++) tone(ctx, out, t + i * 0.09 + Math.random() * 0.04, { wave: 'square', freq: 120, duration: 0.05, gain: 0.05 });
    },
    sting() {
      // Chillido distorsionado + golpe grave + ruido a todo volumen. Dura ~1 s.
      const t = ctx.currentTime + 0.005;
      const bus = ctx.createGain();
      bus.gain.value = AUDIO.scareVolume;
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(60);
      shaper.connect(bus).connect(out);
      const send = ctx.createGain();
      send.gain.value = 0.6;
      bus.connect(send).connect(reverbSend);
      for (const [f0, f1, det] of [
        [320, 980, 0],
        [330, 1010, 23],
        [480, 1320, -31],
      ]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.value = det;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(f1, t + 0.25);
        osc.frequency.exponentialRampToValueAtTime(f1 * 0.7, t + 0.9);
        const vib = ctx.createOscillator();
        vib.frequency.value = 17;
        const vibDepth = ctx.createGain();
        vibDepth.gain.value = 60;
        vib.connect(vibDepth).connect(osc.frequency);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.35, t + 0.02);
        env.gain.setValueAtTime(0.3, t + 0.6);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        osc.connect(env).connect(shaper);
        osc.start(t);
        vib.start(t);
        osc.stop(t + 1.05);
        vib.stop(t + 1.05);
      }
      noiseBurst(ctx, W, shaper, t, { type: 'bandpass', freq: 2000, Q: 0.4, duration: 0.9, gain: 0.6, attack: 0.003 });
      tone(ctx, bus, t, { freq: 55, freqEnd: 30, duration: 0.9, gain: 0.9 });
      setTimeout(() => {
        bus.disconnect();
        send.disconnect();
      }, 2500);
    },
  };

  return {
    play(name) {
      sounds[name]?.();
    },
    setInterference(v) {
      const t = ctx.currentTime;
      hiss.gain.setTargetAtTime(v * v * 0.09, t, 0.08);
      rumble.gain.setTargetAtTime(v * 0.6, t, 0.15);
    },
  };
}
