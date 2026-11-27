// Voces de las entidades: todo sintetizado, feo a propósito (terror analógico).
// Cada entidad tiene un canal posicional (paneo + volumen por distancia) por donde salen:
//   · su grito al verte ('alert:<tipo>')
//   · su ruido continuo mientras te persigue (pasos, patas, respiración, risitas)
//   · su chillido al ser repelida ('repel:<tipo>')
// Además: latidos que se aceleran cuando algo te persigue, jadeo al quedarte sin aire, y los
// sonidos de la cruz.
import { AUDIO } from '../config.js';
import { loopSource, noiseBurst, tone } from './noise.js';

const KINDS = ['stalker', 'percher', 'watcher', 'grinner'];

/** Curva de distorsión dura. */
export function distortionCurve(amount = 40) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

/** Cuantiza la amplitud (suena a muestra de 4 bits, como un contestador roto). */
function crushCurve(levels = 6) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

/** Formantes de vocales (Hz, Q, ganancia). */
const VOWELS = {
  a: [[800, 8, 1], [1250, 10, 0.6], [2600, 12, 0.25]],
  e: [[420, 8, 1], [2000, 12, 0.5], [2600, 12, 0.3]],
  i: [[300, 8, 1], [2300, 14, 0.5], [3000, 14, 0.25]],
  o: [[500, 8, 1], [850, 10, 0.6], [2400, 12, 0.15]],
  u: [[330, 8, 1], [800, 10, 0.4], [2300, 12, 0.1]],
};

function formants(ctx, input, dest, vowel) {
  const sum = ctx.createGain();
  for (const [f, q, g] of VOWELS[vowel]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const gg = ctx.createGain();
    gg.gain.value = g * 3;
    input.connect(bp).connect(gg).connect(sum);
  }
  sum.connect(dest);
  return sum;
}

/** Modulación en anillo: multiplica la señal por una onda (voz metálica, inhumana). */
function ringMod(ctx, dest, freq, t, stop) {
  const ring = ctx.createGain();
  ring.gain.value = 0;
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  osc.connect(ring.gain);
  osc.start(t);
  osc.stop(stop);
  ring.connect(dest);
  return ring;
}

function envelope(ctx, t, peak, attack, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return g;
}

function cleanupLater(nodes, seconds) {
  setTimeout(() => nodes.forEach((n) => n.disconnect()), seconds * 1000 + 300);
}

export function createEntityVoices(ctx, out, reverbSend, noise) {
  const W = noise.white;
  const shaper = (amount) => {
    const s = ctx.createWaveShaper();
    s.curve = distortionCurve(amount);
    return s;
  };

  // Canal posicional por entidad.
  const channels = {};
  for (const kind of KINDS) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const send = ctx.createGain();
    send.gain.value = 0.35;
    gain.connect(pan).connect(out);
    gain.connect(send).connect(reverbSend);
    const loop = ctx.createGain(); // capa de persecución (se abre solo mientras te persigue)
    loop.gain.value = 0;
    loop.connect(gain);
    channels[kind] = { gain, pan, loop, active: false, next: 0, burst: 0 };
  }

  // Capas continuas de persecución.
  {
    // El Alto: gruñido grave y desafinado.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 6;
    lp.connect(channels.stalker.loop);
    for (const [f, d] of [[36, 0], [54, 19], [72.5, -27]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(lp);
      o.start();
    }
    // El del Sombrero: respiración húmeda que entra y sale.
    const breath = ctx.createGain();
    breath.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.42;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(breath.gain);
    lfo.start();
    formants(ctx, loopSource(ctx, noise.pink), breath, 'u');
    breath.connect(channels.watcher.loop);
  }

  /** Eventos que se repiten mientras persigue (se programan por adelantado). */
  const chaseTicks = {
    stalker(t) {
      // Pisadas enormes.
      tone(ctx, channels.stalker.loop, t, { freq: 52, freqEnd: 30, duration: 0.45, gain: 1.4 });
      noiseBurst(ctx, W, channels.stalker.loop, t, { type: 'lowpass', freq: 260, Q: 0.8, duration: 0.25, gain: 0.9 });
      return 0.72 + Math.random() * 0.12;
    },
    percher(t) {
      // Patas que corren: ráfagas de chasquidos.
      for (let i = 0; i < 4; i++) {
        noiseBurst(ctx, W, channels.percher.loop, t + i * 0.03 + Math.random() * 0.02, {
          type: 'bandpass', freq: 2200 + Math.random() * 3000, Q: 5, duration: 0.02, gain: 0.7,
        });
      }
      return 0.09 + Math.random() * 0.06;
    },
    watcher(t) {
      // Sílabas susurradas que no se entienden.
      const vowel = ['a', 'e', 'i', 'o', 'u'][Math.floor(Math.random() * 5)];
      const env = envelope(ctx, t, 0.9, 0.04, 0.08, 0.15);
      const src = ctx.createBufferSource();
      src.buffer = W;
      formants(ctx, src, env, vowel);
      env.connect(channels.watcher.loop);
      src.start(t, Math.random() * 2, 0.4);
      cleanupLater([env], 0.6);
      return 0.35 + Math.random() * 0.9;
    },
    grinner(t) {
      // Risitas: "ji-ji-ji" metálicas, en ráfagas.
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) syllable(channels.grinner.loop, t + i * 0.13, 230 - i * 8, 'i', 0.6);
      return 0.13 * n + 0.5 + Math.random() * 0.8;
    },
  };

  /** Una sílaba de voz sintética (pulso + formantes + anillo + distorsión). */
  function syllable(dest, t, f0, vowel, gain = 1, dur = 0.11) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 1.15, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
    const env = envelope(ctx, t, gain, 0.012, dur * 0.5, dur * 0.6);
    const dist = shaper(30);
    const ring = ringMod(ctx, dist, 63 + Math.random() * 20, t, t + dur + 0.2);
    formants(ctx, osc, ring, vowel);
    dist.connect(env).connect(dest);
    noiseBurst(ctx, W, env, t, { type: 'highpass', freq: 3000, Q: 0.5, duration: 0.05, gain: 0.3 });
    osc.start(t);
    osc.stop(t + dur + 0.2);
    cleanupLater([env, dist], dur + 0.5);
  }

  const alerts = {
    stalker(t) {
      // Sirena gruñida: dos dientes de sierra que suben y bajan por una "o" distorsionada.
      const dest = channels.stalker.gain;
      const env = envelope(ctx, t, 1.1, 0.35, 1.5, 0.9);
      const dist = shaper(18);
      const crush = ctx.createWaveShaper();
      crush.curve = crushCurve(5);
      for (const d of [0, 31]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = d;
        o.frequency.setValueAtTime(70, t);
        o.frequency.linearRampToValueAtTime(155, t + 1.0);
        o.frequency.linearRampToValueAtTime(95, t + 1.9);
        o.frequency.linearRampToValueAtTime(140, t + 2.6);
        formants(ctx, o, dist, 'o');
        o.start(t);
        o.stop(t + 2.9);
      }
      dist.connect(crush).connect(env).connect(dest);
      tone(ctx, dest, t, { freq: 42, freqEnd: 30, duration: 2.6, gain: 0.9, attack: 0.3 });
      for (let i = 0; i < 10; i++) noiseBurst(ctx, W, dest, t + Math.random() * 2.4, { type: 'bandpass', freq: 1200, Q: 2, duration: 0.05, gain: 0.5 });
      cleanupLater([env, dist, crush], 3.2);
    },
    percher(t) {
      // Chillido agudo con vibrato rapidísimo y una lluvia de chasquidos.
      const dest = channels.percher.gain;
      const env = envelope(ctx, t, 0.8, 0.02, 0.7, 0.35);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1700, t);
      o.frequency.exponentialRampToValueAtTime(3600, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(2400, t + 1.0);
      const vib = ctx.createOscillator();
      vib.frequency.value = 31;
      const vd = ctx.createGain();
      vd.gain.value = 260;
      vib.connect(vd).connect(o.frequency);
      const dist = shaper(25);
      o.connect(dist).connect(env).connect(dest);
      o.start(t);
      vib.start(t);
      o.stop(t + 1.1);
      vib.stop(t + 1.1);
      noiseBurst(ctx, W, dest, t, { type: 'bandpass', freq: 4200, Q: 1.5, duration: 0.9, gain: 0.4, attack: 0.02 });
      for (let i = 0; i < 24; i++) noiseBurst(ctx, W, dest, t + 0.9 + i * 0.025, { type: 'bandpass', freq: 3000 + Math.random() * 2500, Q: 5, duration: 0.02, gain: 0.8 });
      cleanupLater([env, dist], 1.8);
    },
    watcher(t) {
      // Susurro al revés: crece despacio y se corta de golpe, luego un chasquido de radio.
      const dest = channels.watcher.gain;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1.3, t + 1.5);
      env.gain.setValueAtTime(0.0001, t + 1.52);
      const src = ctx.createBufferSource();
      src.buffer = W;
      const vowels = ['a', 'o', 'i', 'e', 'u', 'a', 'i'];
      const bank = ctx.createGain();
      // Cambia de "vocal" muy rápido: parece que habla.
      vowels.forEach((v, i) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.setValueAtTime(1, t + i * 0.21);
        g.gain.setValueAtTime(0, t + (i + 1) * 0.21);
        formants(ctx, src, g, v);
        g.connect(bank);
      });
      bank.connect(env).connect(dest);
      src.start(t, 0, 1.6);
      noiseBurst(ctx, W, dest, t + 1.52, { type: 'highpass', freq: 1800, Q: 0.7, duration: 0.35, gain: 0.9, attack: 0.003 });
      tone(ctx, dest, t + 1.52, { wave: 'square', freq: 60, duration: 0.3, gain: 0.25 });
      cleanupLater([env, bank], 2.2);
    },
    grinner(t) {
      // Carcajada: "JA-JA-JA" que baja de tono, metálica y rota, y termina en chillido.
      const dest = channels.grinner.gain;
      for (let i = 0; i < 7; i++) syllable(dest, t + i * 0.16, 270 - i * 18, 'a', 1.1, 0.12);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const s = t + 7 * 0.16;
      o.frequency.setValueAtTime(600, s);
      o.frequency.exponentialRampToValueAtTime(1500, s + 0.4);
      const env = envelope(ctx, s, 0.6, 0.02, 0.3, 0.3);
      const dist = shaper(40);
      o.connect(dist).connect(env).connect(dest);
      o.start(s);
      o.stop(s + 0.7);
      cleanupLater([env, dist], 2.2);
    },
  };

  /** Chillido de dolor al ser repelida (común a todas, con su tono). */
  function repel(kind, t) {
    const dest = channels[kind].gain;
    const base = { stalker: 420, percher: 1600, watcher: 900, grinner: 1200 }[kind];
    const env = envelope(ctx, t, 1, 0.01, 0.4, 0.6);
    const dist = shaper(50);
    for (const det of [0, 37, -41]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.22, t + 1.0);
      o.connect(dist);
      o.start(t);
      o.stop(t + 1.05);
    }
    dist.connect(env).connect(dest);
    noiseBurst(ctx, W, dest, t, { type: 'bandpass', freq: 2400, Q: 0.6, duration: 0.8, gain: 0.6 });
    cleanupLater([env, dist], 1.6);
  }

  // Latido y jadeo.
  const heart = ctx.createGain();
  heart.gain.value = AUDIO.heartbeatVolume;
  heart.connect(out);
  let threat = 0;
  let nextBeat = 0;
  let exhaustion = 0;
  let nextBreath = 0;

  return {
    /** Sonidos puntuales: alert:*, repel:*, cross-up, cross-broken. */
    play(name) {
      const t = ctx.currentTime + 0.01;
      const [what, kind] = name.split(':');
      if (what === 'alert' && alerts[kind]) alerts[kind](t);
      else if (what === 'repel' && channels[kind]) repel(kind, t);
      else if (name === 'cross-up') {
        // Acorde grave y limpio, casi de órgano, con un brillo encima.
        for (const [f, d] of [[130.8, 0], [196, 4], [261.6, -3], [392, 6]]) tone(ctx, out, t, { freq: f * (1 + d / 1200), duration: 1.4, gain: 0.07, attack: 0.08 });
        noiseBurst(ctx, W, out, t, { type: 'highpass', freq: 6000, Q: 0.5, duration: 1.0, gain: 0.05, attack: 0.2 });
      } else if (name === 'cross-broken') {
        noiseBurst(ctx, W, out, t, { type: 'highpass', freq: 1500, Q: 0.7, duration: 0.12, gain: 0.6, attack: 0.002 });
        tone(ctx, out, t, { freq: 90, freqEnd: 40, duration: 0.3, gain: 0.5 });
        tone(ctx, out, t + 0.05, { freq: 600, freqEnd: 180, duration: 0.4, gain: 0.08 });
      } else return false;
      return true;
    },

    /**
     * @param {Record<string, {active: boolean, x: number, y: number, z: number}>} voices
     * @param {{ eye: {x,y,z}, forward: {x,y,z} }} listener
     */
    update(voices, listener) {
      const t = ctx.currentTime;
      const fl = Math.hypot(listener.forward.x, listener.forward.z) || 1;
      const fx = listener.forward.x / fl;
      const fz = listener.forward.z / fl;
      for (const kind of KINDS) {
        const v = voices?.[kind];
        const ch = channels[kind];
        if (!v) continue;
        const dx = v.x - listener.eye.x;
        const dz = v.z - listener.eye.z;
        const d = Math.hypot(dx, dz) || 1;
        // Paneo: derecha de la cámara = (−fz, fx).
        const pan = Math.max(-0.9, Math.min(0.9, (dx * -fz + dz * fx) / d));
        const near = Math.max(0, 1 - d / 45) ** 1.5;
        ch.pan.pan.setTargetAtTime(pan, t, 0.05);
        ch.gain.gain.setTargetAtTime(near * AUDIO.voiceVolume, t, 0.08);
        ch.loop.gain.setTargetAtTime(v.active ? 1 : 0, t, v.active ? 0.15 : 0.6);
        if (v.active && t + 0.3 > ch.next) ch.next = Math.max(t + 0.02, ch.next) + chaseTicks[kind](Math.max(t + 0.02, ch.next));
      }

      // Latidos: más rápidos y fuertes cuanto más cerca está lo que te persigue.
      if (threat > 0.04 && t + 0.3 > nextBeat) {
        const s = Math.max(t + 0.02, nextBeat);
        const g = 0.35 + threat * 0.9;
        tone(ctx, heart, s, { freq: 58, freqEnd: 38, duration: 0.14, gain: g });
        tone(ctx, heart, s + 0.17, { freq: 52, freqEnd: 34, duration: 0.16, gain: g * 0.7 });
        nextBeat = s + 1.05 - threat * 0.65;
      }
      // Jadeo al quedarte sin aire.
      if (exhaustion > 0.7 && t + 0.3 > nextBreath) {
        const s = Math.max(t + 0.02, nextBreath);
        const k = (exhaustion - 0.7) / 0.3;
        noiseBurst(ctx, W, out, s, { type: 'bandpass', freq: 1100, Q: 0.9, duration: 0.32, gain: 0.08 + 0.14 * k, attack: 0.12 });
        noiseBurst(ctx, W, out, s + 0.42, { type: 'bandpass', freq: 800, Q: 0.9, duration: 0.38, gain: 0.06 + 0.1 * k, attack: 0.05 });
        nextBreath = s + 0.95 - 0.25 * k;
      }
    },

    setThreat(v) {
      threat = v;
    },
    setExhaustion(v) {
      exhaustion = v;
    },
  };
}
