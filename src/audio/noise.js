// Buffers de ruido (blanco, rosa, marrón) y fuentes en bucle. Base de todo el sonido procedural.

export function createNoiseBuffers(ctx, seconds = 4) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const make = (fill) => {
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    fill(buffer.getChannelData(0));
    return buffer;
  };
  const white = make((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  // Rosa: filtro de Paul Kellet.
  const pink = make((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  });
  // Marrón: ruido integrado (grave, como viento lejano).
  const brown = make((d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  });
  return { white, pink, brown };
}

export function loopSource(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start(0, Math.random() * buffer.duration);
  return src;
}

/** Respuesta al impulso sintética: cola oscura y un eco aleteante de pasillo estrecho. */
export function createImpulse(ctx, seconds) {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const buffer = ctx.createBuffer(2, length, sr);
  const flutter = Math.round(0.0087 * sr); // ida y vuelta entre muros a 1.5 m
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      const env = Math.exp((-6.9 * t) / seconds);
      const a = 0.85 - 0.72 * (t / seconds);
      y += a * (Math.random() * 2 - 1 - y);
      let v = y * env;
      if (t < 0.35 && i % flutter === ch * 7) v += 0.6 * Math.exp(-t * 9);
      d[i] = i < sr * 0.012 ? v * (i / (sr * 0.012)) : v;
    }
  }
  return buffer;
}

/** Ráfaga de ruido filtrado con envolvente. Devuelve la duración. */
export function noiseBurst(ctx, buffer, dest, t, o) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? 'bandpass';
  filter.Q.value = o.Q ?? 1;
  filter.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.duration * 0.85);
  const env = ctx.createGain();
  const attack = o.attack ?? 0.004;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(o.gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
  src.connect(filter).connect(env).connect(dest);
  src.start(t, Math.random() * (buffer.duration - o.duration - 0.1), o.duration + 0.05);
  src.onended = () => env.disconnect();
  return o.duration;
}

/** Tono corto con caída de frecuencia opcional. */
export function tone(ctx, dest, t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.wave ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.003));
  env.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
  osc.connect(env).connect(dest);
  osc.start(t);
  osc.stop(t + o.duration + 0.05);
  osc.onended = () => env.disconnect();
}
