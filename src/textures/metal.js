// La puerta metálica moderna (fuera de lugar) y acero genérico para marcos y herrajes.
import { createRng } from '../core/rng.js';
import { lerp, smoothstep } from '../core/math.js';
import { paint, posterize, tileNoise, ctx2d, rgb } from './canvas.js';

/** Puerta cortafuegos pintada: mirilla oscura, panel embutido, placa de patadas, rayones y una espiral rayada. */
export function metalDoorCanvas(seed = 201) {
  const W = 64;
  const H = 128;
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const canvas = paint(W, H, (x, y, o) => {
    const brush = tileNoise(x, y, W, H, 32, seed, 2, 2);
    const n = tileNoise(x, y, W, H, 4, seed + 1, 3);
    let r = 80 + n * 14 + (brush - 0.5) * 10;
    let g = 92 + n * 14 + (brush - 0.5) * 10;
    let b = 92 + n * 12 + (brush - 0.5) * 10;
    // Panel embutido.
    const px0 = 9;
    const px1 = 54;
    const py0 = 54;
    const py1 = 106;
    if ((x === px0 || y === py0) && inRect(x, y, px0, py0, px1, py1)) r = g = b = 52;
    if ((x === px1 || y === py1) && inRect(x, y, px0, py0, px1, py1)) r = g = b = 132;
    // Mirilla.
    if (inRect(x, y, 22, 12, 41, 44)) {
      const edge = x === 22 || x === 41 || y === 12 || y === 44;
      const refl = Math.abs(x - 22 - (44 - y) * 0.6) < 2 ? 14 : 0;
      r = edge ? 40 : 10 + refl;
      g = edge ? 44 : 12 + refl;
      b = edge ? 44 : 15 + refl;
    }
    // Placa de patadas (acero sin pintar).
    if (y >= 113 && y <= 125) {
      const v = 112 + n * 30 + (brush - 0.5) * 24;
      r = v;
      g = v;
      b = v * 0.97;
    }
    // Óxido y mugre en la parte baja.
    const rust = smoothstep(0.62, 0.78, tileNoise(x, y, W, H, 6, seed + 3, 3)) * smoothstep(0.7, 1.0, y / H);
    r = lerp(r, 92, rust * 0.8);
    g = lerp(g, 52, rust * 0.8);
    b = lerp(b, 34, rust * 0.8);
    // Más luz arriba (la lámpara de emergencia está sobre la puerta).
    const light = 1.08 - (y / H) * 0.22;
    o[0] = r * light;
    o[1] = g * light;
    o[2] = b * light;
  });
  const ctx = ctx2d(canvas);
  const rng = createRng(seed + 5);
  // Rayones finos.
  for (let i = 0; i < 26; i++) {
    let x = rng.range(4, W - 4);
    let y = rng.range(46, 112);
    const dx = rng.spread(1);
    const dy = rng.spread(0.6);
    const len = rng.int(3, 10);
    ctx.fillStyle = rgb(136, 146, 144);
    for (let k = 0; k < len; k++) {
      ctx.fillRect(x | 0, y | 0, 1, 1);
      x += dx;
      y += dy;
    }
  }
  // Espiral rayada en el metal, pequeña, a la altura de la mano.
  ctx.fillStyle = rgb(150, 158, 154);
  for (let t = 0; t < 1; t += 0.01) {
    const a = t * Math.PI * 2 * 2.6;
    const r = 0.6 + t * 6;
    ctx.fillRect((18 + Math.cos(a) * r) | 0, (66 + Math.sin(a) * r) | 0, 1, 1);
  }
  return posterize(canvas);
}

/** Acero gris para marcos, herrajes y tubería. */
export function steelCanvas(seed = 211) {
  const W = 32;
  const H = 32;
  return posterize(
    paint(W, H, (x, y, o) => {
      const n = tileNoise(x, y, W, H, 4, seed, 3);
      const rust = smoothstep(0.66, 0.8, tileNoise(x, y, W, H, 3, seed + 1, 3));
      const v = 88 + n * 36;
      o[0] = lerp(v, 90, rust * 0.7);
      o[1] = lerp(v, 54, rust * 0.7);
      o[2] = lerp(v * 0.98, 36, rust * 0.7);
    }),
  );
}
