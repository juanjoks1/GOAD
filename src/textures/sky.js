// Nubes para el domo del cielo, ruido para el agua y un halo con bandas para las bombillas.
import { smoothstep } from '../core/math.js';
import { createCanvas, ctx2d, paint, tileNoise } from './canvas.js';

/** Capa de nubes repetible (densidad en escala de grises). */
export function cloudsCanvas(seed = 221) {
  const W = 256;
  const H = 128;
  return paint(W, H, (x, y, o) => {
    const n = tileNoise(x, y, W, H, 6, seed, 5, 3);
    const d = tileNoise(x, y, W, H, 12, seed + 1, 3, 6);
    const v = smoothstep(0.35, 0.75, n * 0.8 + d * 0.2) * 255;
    o[0] = o[1] = o[2] = v;
  });
}

/** Ruido suave repetible para ondas y brillos del agua. */
export function waterNoiseCanvas(seed = 231) {
  const W = 64;
  const H = 64;
  return paint(W, H, (x, y, o) => {
    const v = tileNoise(x, y, W, H, 4, seed, 4) * 255;
    o[0] = o[1] = o[2] = v;
  });
}

/** Halo radial con escalones (como un sprite de 2005). */
export function glowCanvas() {
  const S = 32;
  const canvas = createCanvas(S, S);
  const ctx = ctx2d(canvas);
  const steps = [
    [16, 0.12],
    [12, 0.22],
    [8, 0.42],
    [4.5, 0.75],
    [2.2, 1.0],
  ];
  for (const [r, a] of steps) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
