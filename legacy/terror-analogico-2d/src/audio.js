// Audio mínimo: un siseo de estática en bucle cuyo volumen sigue la señal.
// Debe iniciarse desde un gesto del usuario (p. ej. una tecla), por la política de los navegadores.

let audioCtx = null;
let gain = null;

export function startAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      gain = audioCtx.createGain();
      gain.gain.value = 0.02;
      src.connect(gain).connect(audioCtx.destination);
      src.start();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (err) {
    // Sin audio el juego sigue funcionando.
    console.warn('Audio no disponible:', err);
  }
}

// level: 0 (señal limpia) a 1 (estática total)
export function setNoise(level) {
  if (!gain) return;
  gain.gain.setTargetAtTime(0.02 + level * 0.12, audioCtx.currentTime, 0.1);
}

export function stopAudio() {
  if (!gain) return;
  gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
}
