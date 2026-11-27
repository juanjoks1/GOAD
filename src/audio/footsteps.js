// Pasos procedurales según la superficie: barro, agua, madera del puente y concreto.
import { AUDIO } from '../config.js';
import { noiseBurst, tone } from './noise.js';

const vary = (v, amount = 0.1) => v * (1 + (Math.random() * 2 - 1) * amount);

export function createFootsteps(ctx, out, reverbSend, noise) {
  const W = noise.white;

  const mud = (d, t) => {
    noiseBurst(ctx, W, d, t, { type: 'lowpass', freq: vary(700), freqEnd: 260, Q: 0.7, duration: vary(0.16), gain: 0.5 });
    noiseBurst(ctx, W, d, t + 0.01, { type: 'bandpass', freq: vary(1100), freqEnd: 420, Q: 2.2, duration: vary(0.12), gain: 0.3 });
    tone(ctx, d, t, { freq: vary(75), freqEnd: 45, duration: 0.09, gain: 0.3 });
    // el pie sale del lodo
    noiseBurst(ctx, W, d, t + vary(0.12), { type: 'bandpass', freq: vary(1500), freqEnd: 650, Q: 3, duration: 0.07, gain: 0.1 });
  };
  const water = (d, t) => {
    mud(d, t);
    noiseBurst(ctx, W, d, t + 0.005, { type: 'bandpass', freq: vary(1800), Q: 0.7, duration: vary(0.28), gain: 0.32, attack: 0.01 });
    noiseBurst(ctx, W, d, t + 0.03, { type: 'highpass', freq: 3200, Q: 0.5, duration: 0.15, gain: 0.07 });
  };
  const wood = (d, t) => {
    noiseBurst(ctx, W, d, t, { type: 'lowpass', freq: vary(1400), Q: 0.8, duration: 0.05, gain: 0.32 });
    tone(ctx, d, t, { freq: vary(170), freqEnd: 135, duration: vary(0.14), gain: 0.28 });
    noiseBurst(ctx, W, d, t, { type: 'bandpass', freq: vary(620), Q: 7, duration: 0.12, gain: 0.24 });
    if (Math.random() < 0.14) {
      // crujido de tablón
      const s = t + 0.04;
      tone(ctx, d, s, { wave: 'sawtooth', freq: vary(230, 0.2), freqEnd: vary(180, 0.2), duration: 0.32, gain: 0.03, attack: 0.08 });
    }
  };
  const concrete = (d, t) => {
    noiseBurst(ctx, W, d, t, { type: 'bandpass', freq: vary(2400), Q: 0.8, duration: vary(0.045), gain: 0.42 });
    tone(ctx, d, t, { freq: vary(130), freqEnd: 100, duration: 0.06, gain: 0.16 });
    noiseBurst(ctx, W, d, t + 0.004, { type: 'highpass', freq: 4200, Q: 0.5, duration: 0.03, gain: 0.05 });
  };
  const concreteWet = (d, t) => {
    concrete(d, t);
    noiseBurst(ctx, W, d, t + 0.006, { type: 'bandpass', freq: vary(2100), Q: 0.9, duration: 0.2, gain: 0.2, attack: 0.008 });
  };
  const kinds = { mud, water, wood, concrete, 'concrete-wet': concreteWet };

  return {
    /**
     * @param {string} surface  'mud' | 'water' | 'wood' | 'concrete' | 'concrete-wet'
     * @param {number} side     -1 izquierdo, 1 derecho
     * @param {number} wet      envío a reverberación (0..1)
     */
    play(surface, side, intensity = 1, wet = 0) {
      const t = ctx.currentTime + 0.005;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.12;
      const vol = ctx.createGain();
      vol.gain.value = AUDIO.footstepVolume * intensity * vary(1, 0.12);
      const send = ctx.createGain();
      send.gain.value = wet;
      vol.connect(pan).connect(out);
      vol.connect(send).connect(reverbSend);
      (kinds[surface] || mud)(vol, t);
      setTimeout(() => {
        vol.disconnect();
        send.disconnect();
        pan.disconnect();
      }, 900);
    },
  };
}
