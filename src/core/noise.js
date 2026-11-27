// Ruido de valor 2D y fBm. Puro y determinista. Con `period` > 0 el ruido es periódico
// (repetible sin costuras), lo que permite texturas que se repiten sin que se note el borde.
import { mod } from './math.js';

/** Hash entero → [0, 1]. */
export function hash2(ix, iy, seed = 0) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Ruido de valor suave en [0, 1]. `periodY` permite periodos distintos por eje. */
export function valueNoise2D(x, y, seed = 0, period = 0, periodY = period) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const u = fade(x - x0);
  const v = fade(y - y0);
  let ax = x0;
  let ay = y0;
  let bx = x0 + 1;
  let by = y0 + 1;
  if (period > 0) {
    ax = mod(ax, period);
    bx = mod(bx, period);
  }
  if (periodY > 0) {
    ay = mod(ay, periodY);
    by = mod(by, periodY);
  }
  const a = hash2(ax, ay, seed);
  const b = hash2(bx, ay, seed);
  const c = hash2(ax, by, seed);
  const d = hash2(bx, by, seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}

/**
 * Ruido fractal (suma de octavas) normalizado a [0, 1].
 * Si `period` es un entero > 0 y lacunarity = 2, el resultado se repite cada `period` unidades.
 */
export function fbm2D(x, y, { seed = 0, octaves = 4, lacunarity = 2, gain = 0.5, period = 0, periodY = period } = {}) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 1013, period > 0 ? period * freq : 0, periodY > 0 ? periodY * freq : 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
