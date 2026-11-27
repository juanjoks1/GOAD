// Paja del techo: hileras superpuestas de tallos secos, y un fleco recortado para el alero.
import { createRng } from '../core/rng.js';
import { createCanvas, ctx2d, cutout, posterize, rgb, drawWrapped } from './canvas.js';

function strawColor(rng, dark = 1) {
  const v = rng.range(62, 104) * dark;
  return rgb(v * 1.05, v * 0.92, v * 0.62);
}

export function thatchCanvas(seed = 131) {
  const W = 128;
  const H = 128;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  ctx.fillStyle = rgb(44, 38, 26);
  ctx.fillRect(0, 0, W, H);
  const rows = 6;
  const rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    for (let i = 0; i < 520; i++) {
      const x = rng.range(0, W);
      const y = y0 + rng.range(-4, rowH);
      const len = rng.range(6, 16);
      const slant = rng.spread(2);
      const dark = 0.55 + 0.45 * ((y - y0) / rowH);
      const color = strawColor(rng, dark);
      drawWrapped(canvas, (ox, oy) => {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + slant, y + oy + len);
        ctx.stroke();
      });
    }
    // sombra bajo cada hilera
    ctx.fillStyle = 'rgba(15,12,8,0.55)';
    ctx.fillRect(0, y0 + rowH - 2, W, 2);
  }
  return posterize(canvas);
}

/** Fleco del alero: tallos colgando con largos irregulares (alfa recortado). */
export function thatchFringeCanvas(seed = 141) {
  const W = 128;
  const H = 32;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  ctx.fillStyle = rgb(52, 44, 30);
  ctx.fillRect(0, 0, W, 10);
  for (let i = 0; i < 420; i++) {
    const x = rng.range(0, W);
    const len = rng.range(8, H);
    const color = strawColor(rng, rng.range(0.55, 0.9));
    const slant = rng.spread(1.5);
    drawWrapped(canvas, (ox) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + ox, 0);
      ctx.lineTo(x + ox + slant, len);
      ctx.stroke();
    });
  }
  return posterize(cutout(canvas, [70, 60, 40]));
}
