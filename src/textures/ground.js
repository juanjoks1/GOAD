// Barro del pantano: base oscura, manchas húmedas, motas de musgo, piedritas y ramitas.
import { createRng } from '../core/rng.js';
import { lerp, smoothstep } from '../core/math.js';
import { paint, posterize, tileNoise, drawWrapped, ctx2d, rgb } from './canvas.js';

export function mudCanvas(seed = 17) {
  const W = 128;
  const H = 128;
  const canvas = paint(W, H, (x, y, o) => {
    const n = tileNoise(x, y, W, H, 6, seed, 4);
    const m = tileNoise(x, y, W, H, 3, seed + 1, 3);
    const f = tileNoise(x, y, W, H, 32, seed + 2, 1);
    const mossN = tileNoise(x, y, W, H, 8, seed + 3, 3);
    let r = 44 + n * 46;
    let g = 37 + n * 37;
    let b = 27 + n * 24;
    const wet = smoothstep(0.46, 0.3, m);
    r *= 1 - 0.32 * wet;
    g *= 1 - 0.28 * wet;
    b *= 1 - 0.2 * wet;
    const moss = smoothstep(0.6, 0.74, mossN) * 0.75;
    r = lerp(r, 50, moss);
    g = lerp(g, 60, moss);
    b = lerp(b, 29, moss);
    const k = (f - 0.5) * 18;
    o[0] = r + k;
    o[1] = g + k;
    o[2] = b + k * 0.8;
  });
  const ctx = ctx2d(canvas);
  const rng = createRng(seed + 99);
  // Piedritas.
  for (let i = 0; i < 70; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    const v = rng.range(70, 100);
    ctx.fillStyle = rgb(v, v * 0.92, v * 0.8);
    ctx.fillRect(x, y, rng.chance(0.3) ? 2 : 1, 1);
    ctx.fillStyle = rgb(25, 20, 15);
    ctx.fillRect(x, y + 1, 1, 1);
  }
  // Ramitas y raíces.
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(6, 18);
    const tone = rng.range(18, 34);
    drawWrapped(canvas, (ox, oy) => {
      ctx.strokeStyle = rgb(tone * 1.2, tone, tone * 0.7);
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  return posterize(canvas);
}
