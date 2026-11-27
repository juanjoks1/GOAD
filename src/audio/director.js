// Director de audio: crea el contexto, los buses y mezcla según la zona.
//   exterior (pantano) ──► filtro "apagado" ──┐
//   interior (drone, gotas, zumbido) ─────────┼─► master ─► filtro lo-fi ─► compresor ─► salida
//   efectos (pasos, puerta) ──────────────────┘        ▲
//   envío de reverb ─► convolución ─► retorno ─────────┘
import { AUDIO } from '../config.js';
import { smoothstep } from '../core/math.js';
import { createNoiseBuffers, createImpulse } from './noise.js';
import { createSwampAmbience } from './ambience.js';
import { createDrone } from './drone.js';
import { createFootsteps } from './footsteps.js';
import { playMetalDoor } from './sfx.js';
import { createScareSounds } from './scares.js';
import { createEntityVoices } from './voices.js';

/** Mezcla por zona (0 exterior, 0.3 choza, 1 subterráneo). Pura: también la usan las pruebas. */
export function zoneMix(zone) {
  const exterior = (1 - smoothstep(0.3, 0.85, zone)) * (1 - 0.35 * smoothstep(0, 0.3, zone));
  const muffle = 14000 * Math.pow(380 / 14000, smoothstep(0, 0.65, zone));
  const interior = smoothstep(0.12, 1, zone);
  const reverb = 0.04 + 0.55 * smoothstep(0.3, 0.9, zone);
  const footstepWet = 0.05 + 0.6 * smoothstep(0.2, 0.9, zone);
  return { exterior, muffle, interior, reverb, footstepWet };
}

export function createAudioDirector() {
  let ctx = null;
  let n = null;
  let lastUpdate = 0;
  let lastVoices = 0;
  let zone = 0;
  let ducked = false;

  function build() {
    const master = ctx.createGain();
    master.gain.value = 0;
    const lofi = ctx.createBiquadFilter();
    lofi.type = 'lowpass';
    lofi.frequency.value = AUDIO.lofiCutoff;
    lofi.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(lofi).connect(comp).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulse(ctx, AUDIO.reverbSeconds);
    const reverbSend = ctx.createGain();
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.04;
    reverbSend.connect(reverb).connect(reverbReturn).connect(master);

    const exteriorBus = ctx.createGain();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 14000;
    muffle.Q.value = 0.4;
    exteriorBus.connect(muffle).connect(master);

    const interiorBus = ctx.createGain();
    interiorBus.gain.value = 0;
    interiorBus.connect(master);

    const sfxBus = ctx.createGain();
    sfxBus.connect(master);

    const noise = createNoiseBuffers(ctx);
    n = {
      master,
      reverbSend,
      reverbReturn,
      exteriorBus,
      muffle,
      interiorBus,
      sfxBus,
      noise,
      ambience: createSwampAmbience(ctx, exteriorBus, noise),
      drone: createDrone(ctx, interiorBus, reverbSend),
      footsteps: createFootsteps(ctx, sfxBus, reverbSend, noise),
      scares: createScareSounds(ctx, sfxBus, reverbSend, noise),
      voices: createEntityVoices(ctx, sfxBus, reverbSend, noise),
    };
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(AUDIO.masterVolume, ctx.currentTime + 4);
  }

  return {
    get started() {
      return ctx !== null;
    },

    /** Debe llamarse desde un gesto del usuario (clic o tecla). */
    start() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        build();
      }
      if (ctx.state === 'suspended') ctx.resume();
    },

    update(time, zoneValue, doorProximity) {
      zone = zoneValue;
      if (!ctx || time - lastUpdate < 0.1) return;
      lastUpdate = time;
      const t = ctx.currentTime;
      const mix = zoneMix(zone);
      n.exteriorBus.gain.setTargetAtTime(mix.exterior, t, 0.6);
      n.muffle.frequency.setTargetAtTime(mix.muffle, t, 0.6);
      n.interiorBus.gain.setTargetAtTime(mix.interior, t, 0.9);
      n.reverbReturn.gain.setTargetAtTime(mix.reverb, t, 0.6);
      n.ambience.update(time);
      n.drone.update(zone, doorProximity);
    },

    footstep(surface, side, intensity = 1) {
      if (!ctx) return;
      n.footsteps.play(surface, side, intensity, zoneMix(zone).footstepWet);
    },

    /** Sonido de una entidad: 'alert:<tipo>', 'repel:<tipo>', 'cross-up', 'vanish', 'lights-off', 'sting'… */
    playScare(name) {
      if (!ctx) return;
      if (!n.voices.play(name)) n.scares.play(name);
    },

    /**
     * Voces posicionales de las entidades, latidos y jadeo.
     * @param {{ voices: object, threat: number }} fx  salida de las entidades
     * @param {{ eye, forward }} listener
     * @param {number} exhaustion  0..1
     */
    updateEntities(time, fx, listener, exhaustion) {
      if (!ctx || time - lastVoices < 0.05) return;
      lastVoices = time;
      n.voices.setThreat(fx.threat ?? 0);
      n.voices.setExhaustion(exhaustion);
      n.voices.update(fx.voices, listener);
    },

    /** Estática y retumbo que acompañan a la interferencia visual (0..1). */
    setInterference(v) {
      if (ctx) n.scares.setInterference(v);
    },

    playMetalDoor() {
      if (!ctx) return 0;
      return playMetalDoor(ctx, n.sfxBus, n.reverbSend, n.noise);
    },

    /** Detiene todo el audio (app en segundo plano). */
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
    },

    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    /** Baja el volumen en pausa (el pantano sigue sonando, más lejos). */
    duck(on) {
      if (!ctx || on === ducked) return;
      ducked = on;
      n.master.gain.setTargetAtTime(AUDIO.masterVolume * (on ? 0.35 : 1), ctx.currentTime, 0.3);
    },

    /** Nivel RMS de la salida (0..1). Solo para depurar: ¿está sonando algo? */
    debugLevel() {
      if (!ctx) return 0;
      if (!n.analyser) {
        n.analyser = ctx.createAnalyser();
        n.analyser.fftSize = 2048;
        n.master.connect(n.analyser);
      }
      const data = new Float32Array(n.analyser.fftSize);
      n.analyser.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);
    },

    fadeOut(seconds, delay = 0) {
      if (!ctx) return;
      const t = ctx.currentTime + delay;
      n.master.gain.cancelScheduledValues(t);
      n.master.gain.setValueAtTime(n.master.gain.value, t);
      n.master.gain.linearRampToValueAtTime(0, t + seconds);
    },
  };
}
