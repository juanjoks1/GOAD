// Drone subterráneo: osciladores graves, levemente desafinados entre sí, con filtro que respira.
// También el zumbido eléctrico junto a la puerta y las gotas que caen en el pasillo.
import { AUDIO } from '../config.js';
import { tone } from './noise.js';

export function createDrone(ctx, out, reverbSend) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 240;
  filter.Q.value = 3.5;
  const body = ctx.createGain();
  body.gain.value = AUDIO.droneVolume * 0.75;
  filter.connect(body).connect(out);

  // Respiración: el volumen sube y baja muy lento.
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.11;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = AUDIO.droneVolume * 0.25;
  breath.connect(breathDepth).connect(body.gain);
  breath.start();

  // El filtro se abre y se cierra.
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 0.055;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 110;
  sweep.connect(sweepDepth).connect(filter.frequency);
  sweep.start();

  // Afinación deliberadamente imperfecta (cents) y un vaivén lento de afinación.
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 0.031;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = 9;
  wobble.connect(wobbleDepth);
  wobble.start();
  const voices = [
    { f: 41.2, detune: 0, wave: 'sine', gain: 0.5 },
    { f: 55, detune: -7, wave: 'sawtooth', gain: 0.2 },
    { f: 55, detune: 9, wave: 'sawtooth', gain: 0.2 },
    { f: 82.41, detune: -19, wave: 'triangle', gain: 0.28, wobble: true },
    { f: 110, detune: 14, wave: 'sine', gain: 0.22, wobble: true },
    { f: 164.8, detune: -27, wave: 'triangle', gain: 0.07 },
  ];
  for (const v of voices) {
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.value = v.f;
    osc.detune.value = v.detune;
    if (v.wobble) wobbleDepth.connect(osc.detune);
    const g = ctx.createGain();
    g.gain.value = v.gain;
    osc.connect(g).connect(filter);
    osc.start();
  }
  // Un poco de drone en la reverb para que llene el pasillo.
  const send = ctx.createGain();
  send.gain.value = 0.25;
  body.connect(send).connect(reverbSend);

  // Zumbido de red eléctrica (60 Hz) cerca de la puerta: lo moderno, fuera de lugar.
  const hum = ctx.createGain();
  hum.gain.value = 0;
  const humLP = ctx.createBiquadFilter();
  humLP.type = 'lowpass';
  humLP.frequency.value = 420;
  humLP.connect(hum).connect(out);
  for (const [f, wave, g] of [
    [60, 'sine', 0.6],
    [120, 'square', 0.12],
    [180, 'sine', 0.15],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = f;
    const gg = ctx.createGain();
    gg.gain.value = g;
    osc.connect(gg).connect(humLP);
    osc.start();
  }

  // Gotas.
  const drips = ctx.createGain();
  drips.gain.value = 0.5;
  drips.connect(out);
  const dripSend = ctx.createGain();
  dripSend.gain.value = 1.4;
  drips.connect(dripSend).connect(reverbSend);
  let nextDrip = ctx.currentTime + 2;

  function drip(t) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(drips);
    const f = 1700 + Math.random() * 1200;
    tone(ctx, pan, t, { freq: f, freqEnd: f * 0.55, duration: 0.09, gain: 0.07 + Math.random() * 0.05, attack: 0.002 });
    setTimeout(() => pan.disconnect(), 500);
  }

  return {
    update(zone, doorProximity) {
      const t = ctx.currentTime;
      hum.gain.setTargetAtTime(AUDIO.humVolume * doorProximity * doorProximity, t, 0.3);
      if (zone > 0.6 && t > nextDrip) {
        drip(t + 0.02);
        nextDrip = t + 1.2 + Math.random() * 3.8;
      }
    },
  };
}
