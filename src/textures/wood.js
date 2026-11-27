// Maderas y cortezas: abedul, corteza oscura de sauce, postes viejos, tablones y troncos de la choza.
import { createRng } from '../core/rng.js';
import { lerp, smoothstep } from '../core/math.js';
import { paint, posterize, tileNoise, ctx2d, rgb, drawWrapped } from './canvas.js';

/** Corteza de abedul: gris pálido con lenticelas horizontales oscuras y parches negros. */
export function birchBarkCanvas(seed = 31) {
  const W = 64;
  const H = 128;
  const canvas = paint(W, H, (x, y, o) => {
    const n = tileNoise(x, y, W, H, 4, seed, 3, 8);
    const blot = tileNoise(x, y, W, H, 4, seed + 1, 3, 6);
    let v = 160 + n * 50;
    const dark = smoothstep(0.66, 0.74, blot);
    v = lerp(v, 38, dark);
    o[0] = v * 1.0;
    o[1] = v * 0.99;
    o[2] = v * 0.93;
  });
  const ctx = ctx2d(canvas);
  const rng = createRng(seed + 7);
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, W);
    const y = rng.int(0, H - 1);
    const len = rng.range(3, 11);
    const t = rng.range(35, 70);
    drawWrapped(canvas, (ox, oy) => {
      ctx.fillStyle = rgb(t, t * 0.95, t * 0.9);
      ctx.fillRect(x + ox, y + oy, len, rng.chance(0.25) ? 2 : 1);
    });
  }
  return posterize(canvas);
}

/** Corteza oscura con surcos verticales (sauces y troncos secos). */
export function darkBarkCanvas(seed = 41) {
  const W = 64;
  const H = 128;
  return posterize(
    paint(W, H, (x, y, o) => {
      const furrow = tileNoise(x, y, W, H, 12, seed, 3, 2);
      const n = tileNoise(x, y, W, H, 4, seed + 1, 3, 8);
      const lichen = smoothstep(0.64, 0.75, tileNoise(x, y, W, H, 6, seed + 2, 3, 10));
      const ridge = smoothstep(0.35, 0.62, furrow);
      let r = 30 + ridge * 38 + n * 16;
      let g = 27 + ridge * 33 + n * 14;
      let b = 22 + ridge * 25 + n * 10;
      r = lerp(r, 92, lichen * 0.6);
      g = lerp(g, 100, lichen * 0.6);
      b = lerp(b, 78, lichen * 0.6);
      o[0] = r;
      o[1] = g;
      o[2] = b;
    }),
  );
}

/** Poste viejo: madera gris con veta vertical, grietas y base ennegrecida por el barro. */
export function postWoodCanvas(seed = 51) {
  const W = 32;
  const H = 128;
  const canvas = paint(W, H, (x, y, o) => {
    const grain = tileNoise(x, y, W, H, 8, seed, 2, 1);
    const n = tileNoise(x, y, W, H, 2, seed + 1, 3, 6);
    const ring = 0.5 + 0.5 * Math.sin((x / W) * Math.PI * 10 + grain * 8);
    let v = 70 + n * 40 + ring * 18;
    const rot = smoothstep(0.62, 0.72, tileNoise(x, y, W, H, 4, seed + 2, 3, 8));
    v = lerp(v, 38, rot * 0.7);
    o[0] = v * 1.02;
    o[1] = v * 0.95;
    o[2] = v * 0.82;
  });
  const ctx = ctx2d(canvas);
  const rng = createRng(seed + 3);
  for (let i = 0; i < 7; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    const len = rng.int(8, 40);
    ctx.fillStyle = rgb(24, 21, 17);
    for (let k = 0; k < len; k++) ctx.fillRect((x + Math.round(Math.sin(k * 0.3) * 0.8)) % W, (y + k) % H, 1, 1);
  }
  return posterize(canvas);
}

/** Tablones del puente: veta horizontal, bordes oscuros, agujeros de clavos y verdín. */
export function plankCanvas(seed = 61) {
  const W = 128;
  const H = 32;
  const canvas = paint(W, H, (x, y, o) => {
    const grain = tileNoise(x, y, W, H, 2, seed, 3, 8);
    const n = tileNoise(x, y, W, H, 8, seed + 1, 3, 2);
    const line = 0.5 + 0.5 * Math.sin((y / H) * Math.PI * 9 + grain * 10);
    let v = 62 + n * 34 + line * 16;
    const edge = Math.min(y, H - 1 - y);
    if (edge < 2) v *= 0.6;
    const moss = smoothstep(0.62, 0.75, tileNoise(x, y, W, H, 6, seed + 2, 3, 2));
    o[0] = lerp(v * 1.02, 48, moss * 0.6);
    o[1] = lerp(v * 0.94, 58, moss * 0.6);
    o[2] = lerp(v * 0.8, 32, moss * 0.6);
  });
  const ctx = ctx2d(canvas);
  for (const x of [6, 7, W - 9, W - 8]) {
    ctx.fillStyle = rgb(20, 16, 14);
    ctx.fillRect(x, 9, 2, 2);
    ctx.fillRect(x, H - 11, 2, 2);
    ctx.fillStyle = rgb(70, 40, 24);
    ctx.fillRect(x + 1, 11, 1, 3);
  }
  return posterize(canvas);
}

/** Pared exterior de la choza: troncos verticales irregulares con barro entre ellos y amarres. */
export function hutLogsCanvas(seed = 71) {
  const W = 128;
  const H = 128;
  const rng = createRng(seed);
  const logs = [];
  let x = 0;
  while (x < W) {
    const w = rng.int(12, 19);
    logs.push({ x0: x, w: Math.min(w, W - x), tone: rng.range(0.8, 1.15), seed: rng.int(1, 999) });
    x += w;
  }
  const canvas = paint(W, H, (px, py, o) => {
    const log = logs.find((l) => px >= l.x0 && px < l.x0 + l.w);
    const u = (px - log.x0 + 0.5) / log.w;
    const round = Math.sin(u * Math.PI);
    const n = tileNoise(px, py, W, H, 4, seed + log.seed, 3, 12);
    let r = (38 + n * 40) * log.tone * (0.55 + 0.45 * round);
    let g = (33 + n * 33) * log.tone * (0.55 + 0.45 * round);
    let b = (25 + n * 22) * log.tone * (0.55 + 0.45 * round);
    if (round < 0.25) {
      // barro seco entre troncos
      const d = tileNoise(px, py, W, H, 16, seed + 5, 2);
      r = 62 + d * 22;
      g = 52 + d * 18;
      b = 38 + d * 12;
    }
    // humedad que sube desde el suelo
    const damp = smoothstep(0.7, 1.0, py / H);
    o[0] = r * (1 - 0.45 * damp);
    o[1] = g * (1 - 0.35 * damp);
    o[2] = b * (1 - 0.35 * damp);
  });
  const ctx = ctx2d(canvas);
  // Amarres de fibra horizontales.
  for (const y of [30, 82]) {
    for (let px = 0; px < W; px++) {
      const wob = Math.round(Math.sin(px * 0.4) * 0.7);
      ctx.fillStyle = rgb(72 + (px % 3) * 6, 64, 42);
      ctx.fillRect(px, y + wob, 1, 3);
      ctx.fillStyle = rgb(25, 22, 16);
      ctx.fillRect(px, y + wob + 3, 1, 1);
    }
  }
  return posterize(canvas);
}
