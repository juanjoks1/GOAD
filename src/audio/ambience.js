// Ambiente exterior del pantano: viento húmedo, siseo de hojas, cigarras, grillos y ranas lejanas.
// Todo sintetizado; sin archivos de audio.
import { valueNoise2D } from '../core/noise.js';
import { loopSource } from './noise.js';
import { AUDIO } from '../config.js';

function panner(ctx, pan) {
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  return p;
}

export function createSwampAmbience(ctx, out, noise) {
  const now = ctx.currentTime;
  const level = AUDIO.ambienceVolume;
  const insects = AUDIO.insectsVolume;

  // Viento grave (ruido marrón filtrado), con ráfagas lentas.
  const wind = ctx.createGain();
  wind.gain.value = 0;
  const windLP = ctx.createBiquadFilter();
  windLP.type = 'lowpass';
  windLP.frequency.value = 420;
  windLP.Q.value = 0.6;
  const windPan = panner(ctx, 0);
  loopSource(ctx, noise.brown).connect(windLP).connect(wind).connect(windPan).connect(out);

  // Siseo húmedo (hojas, juncos, agua): ruido rosa en banda media.
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  const hissBP = ctx.createBiquadFilter();
  hissBP.type = 'bandpass';
  hissBP.frequency.value = 1500;
  hissBP.Q.value = 0.5;
  const hissPan = panner(ctx, 0.2);
  loopSource(ctx, noise.pink).connect(hissBP).connect(hiss).connect(hissPan).connect(out);

  // Cigarras: banda estrecha aguda con trémolo rápido y crecidas lentas.
  const cicadaBP = ctx.createBiquadFilter();
  cicadaBP.type = 'bandpass';
  cicadaBP.frequency.value = 5300;
  cicadaBP.Q.value = 9;
  const tremolo = ctx.createGain();
  tremolo.gain.value = 0.5;
  const tremLfo = ctx.createOscillator();
  tremLfo.frequency.value = 47;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.5;
  tremLfo.connect(tremDepth).connect(tremolo.gain);
  tremLfo.start();
  const cicada = ctx.createGain();
  cicada.gain.value = 0;
  loopSource(ctx, noise.white).connect(cicadaBP).connect(tremolo).connect(cicada).connect(panner(ctx, -0.35)).connect(out);

  // Grillos: portadora aguda, modulada en pulsos y recortada en chirridos programados.
  const crickets = [4300, 4650, 4980, 4450].map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 28 + i * 4.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const chirp = ctx.createGain();
    chirp.gain.value = 0;
    osc.connect(am).connect(chirp).connect(panner(ctx, [-0.7, 0.55, -0.2, 0.85][i])).connect(out);
    osc.start();
    lfo.start();
    return {
      chirp,
      next: now + 1 + Math.random() * 2,
      period: 0.48 + i * 0.13 + Math.random() * 0.1,
      length: 0.1 + Math.random() * 0.06,
      volume: insects * (0.35 + Math.random() * 0.35),
      restUntil: 0,
    };
  });

  let nextFrog = now + 5 + Math.random() * 6;
  function croakSeries(t) {
    const count = 2 + Math.floor(Math.random() * 3);
    const base = 95 + Math.random() * 50;
    const pan = Math.random() * 1.6 - 0.8;
    const dest = ctx.createGain();
    dest.gain.value = level * 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900; // lejana
    dest.connect(lp).connect(panner(ctx, pan)).connect(out);
    for (let k = 0; k < count; k++) {
      const s = t + k * (0.3 + Math.random() * 0.12);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 1.15, s);
      osc.frequency.exponentialRampToValueAtTime(base, s + 0.16);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 480;
      bp.Q.value = 3;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, s);
      env.gain.linearRampToValueAtTime(1, s + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      const pulse = ctx.createGain();
      pulse.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 24;
      const d = ctx.createGain();
      d.gain.value = 0.5;
      lfo.connect(d).connect(pulse.gain);
      osc.connect(bp).connect(pulse).connect(env).connect(dest);
      osc.start(s);
      lfo.start(s);
      osc.stop(s + 0.25);
      lfo.stop(s + 0.25);
    }
  }

  return {
    /** Llamar ~10 veces por segundo. */
    update(time) {
      const t = ctx.currentTime;
      const gust = valueNoise2D(time * 0.09, 0.5, 3) * 0.7 + valueNoise2D(time * 0.31, 2.5, 4) * 0.3;
      wind.gain.setTargetAtTime(level * (0.35 + 0.65 * gust), t, 0.4);
      windLP.frequency.setTargetAtTime(300 + gust * 380, t, 0.5);
      windPan.pan.setTargetAtTime((valueNoise2D(time * 0.05, 7.5, 5) - 0.5) * 1.2, t, 0.8);
      hiss.gain.setTargetAtTime(level * 0.18 * (0.3 + 0.7 * gust), t, 0.5);
      const swell = valueNoise2D(time * 0.04, 9.5, 6);
      cicada.gain.setTargetAtTime(insects * 0.22 * Math.max(0, swell - 0.25), t, 1.2);

      for (const c of crickets) {
        while (c.next < t + 0.35) {
          if (c.next >= c.restUntil) {
            const s = Math.max(c.next, t + 0.01);
            c.chirp.gain.setValueAtTime(0, s);
            c.chirp.gain.linearRampToValueAtTime(c.volume, s + 0.012);
            c.chirp.gain.setValueAtTime(c.volume, s + c.length - 0.015);
            c.chirp.gain.linearRampToValueAtTime(0, s + c.length);
          }
          c.next += c.period * (0.95 + Math.random() * 0.1);
          if (Math.random() < 0.012) c.restUntil = c.next + 3 + Math.random() * 6; // se calla un rato
        }
      }

      if (t > nextFrog) {
        croakSeries(t + 0.05);
        nextFrog = t + 7 + Math.random() * 12;
      }
    },
  };
}
