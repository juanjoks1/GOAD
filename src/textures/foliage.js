// Follaje con recorte alfa (alphaTest): sauce colgante, hojas de abedul, arbustos, juncos y hierba.
import { createRng } from '../core/rng.js';
import { createCanvas, ctx2d, cutout, posterize, rgb } from './canvas.js';

function leafColor(rng, base, spread = 18) {
  const k = rng.range(-spread, spread);
  return rgb(base[0] + k, base[1] + k * 1.1, base[2] + k * 0.6);
}

/** Cortina de ramas colgantes de sauce: hebras verticales con hojas pequeñas. */
export function willowLeavesCanvas(seed = 81) {
  const W = 128;
  const H = 128;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  for (let i = 0; i < 46; i++) {
    let x = rng.range(2, W - 2);
    const y0 = rng.range(0, 14);
    const len = rng.range(55, H - y0);
    const drift = rng.spread(0.18);
    const shade = rng.range(0.7, 1.15);
    for (let y = y0; y < y0 + len; y += 1) {
      x += drift + Math.sin(y * 0.08 + i) * 0.12;
      const t = (y - y0) / len;
      // tallo
      ctx.fillStyle = rgb(48 * shade, 52 * shade, 30 * shade);
      ctx.fillRect(x | 0, y | 0, 1, 1);
      // hojas alternas, menos densas hacia la punta
      if (rng.chance(0.55 - t * 0.25)) {
        const side = rng.chance(0.5) ? -1 : 1;
        ctx.fillStyle = leafColor(rng, [74 * shade, 88 * shade, 44 * shade], 14);
        ctx.fillRect((x + side * rng.int(1, 2)) | 0, y | 0, 2, rng.int(2, 3));
      }
    }
  }
  return posterize(cutout(canvas, [62, 74, 38]));
}

/** Copa de abedul: racimos de hojas pequeñas, amarillo verdoso apagado. */
export function birchLeavesCanvas(seed = 91) {
  const W = 128;
  const H = 128;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  const clusters = Array.from({ length: 9 }, () => ({ x: rng.range(22, W - 22), y: rng.range(22, H - 22), r: rng.range(12, 26) }));
  for (const c of clusters) {
    // ramitas
    ctx.strokeStyle = rgb(50, 44, 36);
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    for (let i = 0; i < 120; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * c.r;
      const x = c.x + Math.cos(a) * d;
      const y = c.y + Math.sin(a) * d * 0.8;
      ctx.fillStyle = leafColor(rng, [96, 104, 52], 22);
      ctx.fillRect(x | 0, y | 0, rng.int(2, 3), 2);
    }
  }
  return posterize(cutout(canvas, [86, 94, 48]));
}

/** Arbusto bajo y denso, con ramitas secas sobresaliendo. */
export function bushCanvas(seed = 101) {
  const W = 128;
  const H = 64;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  for (let i = 0; i < 900; i++) {
    const x = rng.range(4, W - 4);
    const top = 14 + Math.abs(x - W / 2) * 0.55 + rng.range(-8, 8);
    const y = rng.range(top, H);
    const depth = (y - top) / (H - top);
    ctx.fillStyle = leafColor(rng, [52 - depth * 18, 62 - depth * 20, 32 - depth * 10], 12);
    ctx.fillRect(x | 0, y | 0, rng.int(2, 3), 2);
  }
  ctx.strokeStyle = rgb(58, 46, 34);
  for (let i = 0; i < 10; i++) {
    const x = rng.range(20, W - 20);
    ctx.beginPath();
    ctx.moveTo(x, H - 10);
    ctx.lineTo(x + rng.spread(16), rng.range(2, 18));
    ctx.stroke();
  }
  return posterize(cutout(canvas, [44, 52, 28]));
}

/** Juncos y espadañas: hojas finas desde la base y algunas cabezas marrones. */
export function reedsCanvas(seed = 111) {
  const W = 64;
  const H = 128;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  for (let i = 0; i < 22; i++) {
    let x = rng.range(12, W - 12);
    const top = rng.range(6, 50);
    const bend = rng.spread(0.35);
    const tone = rng.range(0.75, 1.2);
    for (let y = H - 1; y > top; y--) {
      x += bend * ((H - y) / H) * 0.6;
      ctx.fillStyle = rgb(86 * tone, 92 * tone, 50 * tone);
      ctx.fillRect(x | 0, y, y > H - 40 ? 2 : 1, 1);
    }
    if (i % 5 === 0) {
      ctx.fillStyle = rgb(62, 40, 26);
      ctx.fillRect((x - 1) | 0, top | 0, 3, 11);
      ctx.fillStyle = rgb(40, 26, 18);
      ctx.fillRect((x + 1) | 0, (top + 2) | 0, 1, 8);
    }
  }
  return posterize(cutout(canvas, [80, 86, 46]));
}

/** Mata de hierba seca. */
export function grassCanvas(seed = 121) {
  const W = 64;
  const H = 32;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  for (let i = 0; i < 40; i++) {
    let x = rng.range(10, W - 10);
    const top = rng.range(2, 20);
    const bend = rng.spread(0.9);
    const dry = rng.next();
    for (let y = H - 1; y > top; y--) {
      x += bend * 0.08 * (H - y) * 0.1;
      ctx.fillStyle = rgb(96 + dry * 40, 94 + dry * 22, 50 + dry * 6);
      ctx.fillRect(x | 0, y, 1, 1);
    }
  }
  return posterize(cutout(canvas, [100, 96, 54]));
}
