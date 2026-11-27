// Símbolos y letreros: la espiral pintada frente a la escalera y el letrero de la puerta.
import { createRng } from '../core/rng.js';
import { fbm2D } from '../core/noise.js';
import { createCanvas, ctx2d, cutout, shade, rgb } from './canvas.js';

/** Espiral pintada a mano con pigmento óxido, gastada por las pisadas. */
export function spiralCanvas(seed = 191) {
  const W = 128;
  const H = 128;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  const turns = 3.4;
  const maxR = 56;
  ctx.lineCap = 'round';
  let prev = null;
  for (let t = 0; t <= 1; t += 0.0025) {
    const a = t * turns * Math.PI * 2;
    const r = 3 + t * maxR + Math.sin(a * 3) * 0.8;
    const x = W / 2 + Math.cos(a) * r + rng.spread(0.35);
    const y = H / 2 + Math.sin(a) * r + rng.spread(0.35);
    if (prev) {
      ctx.strokeStyle = rgb(96 + rng.spread(10), 34 + rng.spread(6), 24);
      ctx.lineWidth = 3.2 + Math.sin(t * 40) * 0.8 + t * 1.5;
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    prev = [x, y];
  }
  // Salpicaduras.
  for (let i = 0; i < 18; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(10, 60);
    ctx.fillStyle = rgb(90, 32, 22);
    ctx.fillRect(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d, rng.int(1, 2), rng.int(1, 2));
  }
  // Desgaste: se pierde pintura donde más se pisa.
  shade(canvas, (x, y, p) => {
    const n = fbm2D(x * 0.09, y * 0.09, { seed, octaves: 3 });
    if (n < 0.42) p[3] = 0;
    else p[3] *= Math.min(1, (n - 0.42) * 6);
  });
  return cutout(canvas, [90, 34, 24], 90);
}

/** Letrero institucional: franja roja y texto negro. */
export function restrictedSignCanvas() {
  const W = 96;
  const H = 60;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = rgb(196, 196, 186);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgb(150, 30, 26);
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = rgb(30, 30, 30);
  ctx.fillRect(0, H - 2, W, 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px "DejaVu Sans Mono", "Lucida Console", "Courier New", monospace';
  ctx.fillStyle = rgb(225, 225, 215);
  ctx.fillText('ATENCIÓN', W / 2, 10);
  ctx.fillStyle = rgb(24, 24, 24);
  ctx.fillText('ACCESO', W / 2, 30);
  ctx.fillText('RESTRINGIDO', W / 2, 44);
  // Texto sin antialias: umbral duro.
  shade(canvas, (x, y, p) => {
    const v = (p[0] + p[1] + p[2]) / 3;
    if (y > 20 && y < H - 3) {
      const ink = v < 110;
      p[0] = p[1] = p[2] = ink ? 24 : 196;
      if (!ink) p[2] = 186;
    }
  });
  // Suciedad.
  shade(canvas, (x, y, p) => {
    const n = fbm2D(x * 0.08, y * 0.08, { seed: 7, octaves: 3 });
    const k = 0.75 + n * 0.3;
    p[0] *= k;
    p[1] *= k;
    p[2] *= k * 0.96;
  });
  return canvas;
}
