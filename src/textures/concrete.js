// Concreto del interior: piso de hexágonos, muro con arcada ciega, muros húmedos del pasillo y piso mojado.
import { createRng } from '../core/rng.js';
import { hash2 } from '../core/noise.js';
import { lerp, smoothstep, mod } from '../core/math.js';
import { paint, posterize, tileNoise, ctx2d, rgb } from './canvas.js';

/** Tono base de concreto gastado (0–255) con poros. */
function concreteTone(x, y, W, H, seed, base = 112) {
  const n = tileNoise(x, y, W, H, 5, seed, 4);
  const pores = tileNoise(x, y, W, H, 48, seed + 1, 1);
  let v = base - 26 + n * 52;
  if (pores < 0.13) v *= 0.84;
  return v;
}

/** Manchas de humedad que escurren desde arriba (0 = seco, 1 = muy manchado). */
function dampStreak(x, y, W, H, seed) {
  const col = tileNoise(x, 0, W, H, 24, seed, 2, 1);
  const len = 0.25 + col * 0.9;
  const fall = smoothstep(len, 0, y / H) * smoothstep(0.52, 0.72, col);
  const blot = smoothstep(0.58, 0.75, tileNoise(x, y, W, H, 4, seed + 3, 3));
  return Math.min(1, fall * 0.8 + blot * 0.5);
}

/** Moho y barro que suben desde el suelo. */
function groundGrime(y, H, x, W, seed) {
  const n = tileNoise(x, y, W, H, 8, seed, 3);
  return smoothstep(0.74, 1.0, y / H + (n - 0.5) * 0.2);
}

/**
 * Piso de baldosas hexagonales. El lienzo mide 128 × 111 para que la rejilla se repita sin costura.
 * Proporción del mundo recomendada: 1.6 m × 1.387 m por repetición.
 */
export function hexFloorCanvas(seed = 151) {
  const W = 128;
  const H = 111;
  const S = 1; // radio del hexágono en unidades de dominio
  const PX = 3 * S * 2;
  const PY = Math.sqrt(3) * S * 3;
  const unit = PX / W; // unidades de dominio por píxel
  const inradius = (Math.sqrt(3) / 2) * S;
  const hexAt = (X, Y) => {
    const q = ((2 / 3) * X) / S;
    const r = ((-1 / 3) * X + (Math.sqrt(3) / 3) * Y) / S;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(-q - r);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs + q + r);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    const cx = S * 1.5 * rq;
    const cy = S * Math.sqrt(3) * (rr + rq / 2);
    const dx = Math.abs(X - cx);
    const dy = Math.abs(Y - cy);
    const m = Math.max(dy, dx * (Math.sqrt(3) / 2) + dy / 2);
    return { cx, cy, edge: (inradius - m) / unit };
  };
  return posterize(
    paint(W, H, (x, y, o) => {
      const X = (x + 0.5) * unit;
      const Y = (y + 0.5) * (PY / H);
      const { cx, cy, edge } = hexAt(X, Y);
      const id = hash2(Math.round(mod(cx, PX) * 10), Math.round(mod(cy, PY) * 10), seed);
      let v = concreteTone(x, y, W, H, seed, 104) * (0.88 + id * 0.22);
      // desgaste en los bordes de cada baldosa
      v *= 0.78 + 0.22 * smoothstep(0.5, 3.0, edge);
      // juntas
      if (edge < 1.1) v = 40 + id * 10;
      // mugre y manchas grandes
      const stain = smoothstep(0.55, 0.72, tileNoise(x, y, W, H, 3, seed + 9, 3));
      v *= 1 - stain * 0.35;
      o[0] = v * 0.98;
      o[1] = v * 0.99;
      o[2] = v * 0.94;
    }),
  );
}

/**
 * Muro interior de la choza: concreto con una arcada ciega (dos arcos por repetición),
 * manchas de humedad que escurren y moho junto al piso.
 */
export function archWallCanvas(seed = 161) {
  const W = 128;
  const H = 128;
  const archW = W / 2;
  const spring = 70; // línea de arranque de los arcos
  const radius = 24;
  const raised = (x, y) => {
    const lx = mod(x, archW);
    if (y < 26) return 1; // franja lisa superior
    if (y < 30) return 0.4; // moldura
    if (lx < 6 || lx > archW - 7) return 1; // pilastras
    if (y > spring) return 0; // interior del arco
    const dx = lx - archW / 2;
    const dy = y - spring;
    return Math.hypot(dx, dy * 1.05) > radius ? 1 : 0;
  };
  return posterize(
    paint(W, H, (x, y, o) => {
      const h = raised(x, y);
      const emboss = raised(x - 1, y - 1) - raised(x + 1, y + 1);
      let v = concreteTone(x, y, W, H, seed, 118);
      if (h < 0.5) v *= 0.68; // fondo del arco, en sombra
      v += emboss * 22;
      const damp = dampStreak(x, y, W, H, seed + 4);
      v *= 1 - damp * 0.4;
      const grime = groundGrime(y, H, x, W, seed + 6);
      let r = v;
      let g = v;
      let b = v * 0.95;
      r = lerp(r, 34, grime * 0.8);
      g = lerp(g, 40, grime * 0.8);
      b = lerp(b, 30, grime * 0.8);
      o[0] = r;
      o[1] = g;
      o[2] = b;
    }),
  );
}

/** Muro del pasillo: concreto de encofrado (tablas horizontales), agujeros de amarre, humedad y moho. */
export function dampWallCanvas(seed = 171) {
  const W = 128;
  const H = 128;
  const boards = 4;
  const boardH = H / boards;
  const canvas = paint(W, H, (x, y, o) => {
    const board = Math.floor(y / boardH);
    const ly = y - board * boardH;
    let v = concreteTone(x, y, W, H, seed, 98) * (0.92 + hash2(board, 0, seed) * 0.14);
    const grain = tileNoise(x, y, W, H, 2, seed + board, 2, 16);
    v += (grain - 0.5) * 14;
    if (ly < 1) v *= 0.62;
    else if (ly < 2) v *= 1.08;
    const damp = dampStreak(x, y, W, H, seed + 2);
    v *= 1 - damp * 0.45;
    const efflo = smoothstep(0.7, 0.8, tileNoise(x, y, W, H, 6, seed + 8, 3)) * (1 - damp);
    v = lerp(v, 150, efflo * 0.5);
    const grime = groundGrime(y, H, x, W, seed + 3);
    o[0] = lerp(v * 0.96, 26, grime * 0.85);
    o[1] = lerp(v, 33, grime * 0.85);
    o[2] = lerp(v * 0.97, 26, grime * 0.85);
  });
  const ctx = ctx2d(canvas);
  for (const x of [20, 84]) {
    for (let b = 0; b < boards; b++) {
      const y = b * boardH + boardH / 2;
      ctx.fillStyle = rgb(22, 22, 20);
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = rgb(70, 40, 28); // óxido que escurre
      ctx.fillRect(x, y + 2, 1, 4 + ((x + b * 7) % 6));
    }
  }
  return posterize(canvas);
}

/** Piso del pasillo: concreto oscuro y mojado, con manchas, una grieta y restos de barro. */
export function wetFloorCanvas(seed = 181) {
  const W = 128;
  const H = 128;
  const canvas = paint(W, H, (x, y, o) => {
    let v = concreteTone(x, y, W, H, seed, 82);
    const wet = smoothstep(0.45, 0.62, tileNoise(x, y, W, H, 3, seed + 5, 3));
    v *= 1 - wet * 0.35;
    const mud = smoothstep(0.66, 0.78, tileNoise(x, y, W, H, 6, seed + 7, 3));
    o[0] = lerp(v, 58, mud * 0.6);
    o[1] = lerp(v, 50, mud * 0.6);
    o[2] = lerp(v * 0.95, 36, mud * 0.6);
  });
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  let x = rng.range(20, 100);
  ctx.fillStyle = rgb(26, 26, 24);
  for (let y = 0; y < H; y++) {
    x += rng.spread(1.1);
    ctx.fillRect(x | 0, y, 1, 1);
  }
  return posterize(canvas);
}
