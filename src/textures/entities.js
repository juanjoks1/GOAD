// Entidades: recortes pintados a mano (procedurales), con grano de foto vieja.
// Diseños propios inspirados en el terror analógico: figuras flacas, ojos enormes, siluetas imposibles.
// Se ven como recortes pegados en el mundo, a propósito.
import { createRng } from '../core/rng.js';
import { fbm2D } from '../core/noise.js';
import { createCanvas, ctx2d, shade, cutout, posterize, rgb } from './canvas.js';

/** Trazo cónico a lo largo de una polilínea: brazos, patas, cuellos. */
function limb(ctx, points, r0, r1, color) {
  ctx.fillStyle = color;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  let done = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    for (let s = 0; s <= len; s += 0.5) {
      const t = (done + s) / total;
      const r = r0 + (r1 - r0) * t;
      ctx.beginPath();
      ctx.arc(ax + ((bx - ax) * s) / len, ay + ((by - ay) * s) / len, Math.max(0.5, r), 0, Math.PI * 2);
      ctx.fill();
    }
    done += len;
  }
}

/** Polígono relleno con bordes temblorosos. */
function blob(ctx, rng, points, color, jitter = 1.2) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = x + rng.spread(jitter);
    const py = y + rng.spread(jitter);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
}

/** Línea fina irregular (pelos, espinas, costillas). */
function scribble(ctx, rng, x0, y0, x1, y1, color, wobble = 1, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    ctx.lineTo(x0 + (x1 - x0) * t + rng.spread(wobble), y0 + (y1 - y0) * t + rng.spread(wobble));
  }
  ctx.stroke();
}

/**
 * Convierte el dibujo en "foto mala": barrido de movimiento, desenfoque, luz lateral que recorta
 * el borde izquierdo, grano y alfa recortado en duro.
 */
function photograph(canvas, seed, { grain = 22, blur = 0.7, tint = [1, 0.97, 0.92], smear = 0, rim = 30, dissolve = null } = {}) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = ctx2d(canvas);
  if (smear) {
    const ghost = createCanvas(W, H);
    ctx2d(ghost).drawImage(canvas, 0, 0);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(ghost, smear, 0);
    ctx.drawImage(ghost, -smear * 0.5, 1);
    ctx.globalAlpha = 1;
  }
  const soft = createCanvas(W, H);
  const sctx = ctx2d(soft);
  sctx.filter = `blur(${blur}px)`;
  sctx.drawImage(canvas, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(soft, 0, 0);

  const alpha = ctx.getImageData(0, 0, W, H).data;
  const a = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : alpha[(y * W + x) * 4 + 3]);
  const rng = createRng(seed);
  shade(canvas, (x, y, p) => {
    if (p[3] < 8) return;
    let n = (rng.next() - 0.5) * grain + (fbm2D(x * 0.08, y * 0.08, { seed, octaves: 2 }) - 0.5) * grain;
    // Luz que llega de la izquierda: el borde izquierdo brilla, el derecho se hunde.
    if (a(x - 3, y) < 100) n += rim;
    else if (a(x - 6, y) < 100) n += rim * 0.4;
    if (a(x + 3, y) < 100) n -= rim * 0.3;
    p[0] = Math.max(0, Math.min(255, (p[0] + n) * tint[0]));
    p[1] = Math.max(0, Math.min(255, (p[1] + n) * tint[1]));
    p[2] = Math.max(0, Math.min(255, (p[2] + n) * tint[2]));
    if (dissolve) {
      const f = Math.max(0, (y - dissolve.from) / (dissolve.to - dissolve.from));
      if (f > 0 && fbm2D(x * 0.12, y * 0.12, { seed: seed + 5, octaves: 3 }) < f * 0.9) p[3] = 0;
    }
  });
  return posterize(cutout(canvas, [20, 18, 16], 120), 40);
}

/** Anillo irregular (ojos): puntos alrededor de un círculo con radio tembloroso. */
function roughRing(ctx, rng, cx, cy, r, width, color) {
  ctx.fillStyle = color;
  for (let t = 0; t < Math.PI * 2; t += 0.05) {
    const rr = r + rng.spread(0.6);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Piel moteada sobre lo ya dibujado (solo donde hay pintura). */
function mottle(canvas, seed, light, amount) {
  shade(canvas, (x, y, p) => {
    if (p[3] < 8) return;
    const n = fbm2D(x * 0.09, y * 0.06, { seed, octaves: 3 });
    const k = Math.max(0, (n - 0.5) * 2) * amount;
    p[0] += (light[0] - p[0]) * k;
    p[1] += (light[1] - p[1]) * k;
    p[2] += (light[2] - p[2]) * k;
  });
}

/**
 * El Sonriente: encorvado y flaquísimo, brazos que casi tocan el suelo, cabeza ladeada,
 * ojos redondos hundidos y una sonrisa torcida que no cabe en la cara. 128 × 256 px (≈ 1.25 × 2.5 m).
 */
export function grinnerCanvas(seed = 666) {
  const W = 128;
  const H = 256;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  const skin = rgb(36, 30, 27);

  // Piernas con rodillas huesudas.
  limb(ctx, [[56, 148], [52, 200], [55, 256]], 6, 3.5, skin);
  limb(ctx, [[70, 148], [76, 202], [74, 256]], 6, 3.5, skin);
  for (const [x, y] of [[52, 200], [76, 202]]) {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Torso encorvado hacia adelante.
  blob(ctx, rng, [[46, 90], [58, 80], [84, 84], [80, 118], [74, 152], [52, 152], [48, 124]], skin, 1.6);
  // Brazos larguísimos con codos marcados y garras.
  limb(ctx, [[48, 90], [38, 148], [34, 196], [30, 228]], 5, 2.8, skin);
  limb(ctx, [[82, 88], [96, 146], [100, 194], [106, 224]], 5, 2.8, skin);
  for (const [hx, hy, dir] of [[30, 228, -1], [106, 224, 1]]) {
    for (let f = -2; f <= 1; f++) {
      limb(ctx, [[hx, hy], [hx + dir * (f + 1) * 2.5, hy + 12], [hx + dir * (f + 1) * 3.5 + dir * 2, hy + 22 + Math.abs(f) * 2]], 1.6, 0.4, skin);
    }
  }
  // Cuello largo que avanza hacia la cabeza.
  limb(ctx, [[64, 86], [68, 68], [76, 54]], 6, 4.5, skin);
  mottle(canvas, seed + 1, [84, 74, 66], 0.55);
  // Costillas.
  for (let i = 0; i < 7; i++) {
    const y = 94 + i * 7.5;
    scribble(ctx, rng, 50 + i * 0.8, y, 64, y + 3.5, rgb(96, 86, 76), 0.6);
    scribble(ctx, rng, 66, y + 3.5, 79 - i * 0.8, y, rgb(96, 86, 76), 0.6);
  }

  // Cabeza ladeada, abollada por arriba.
  ctx.save();
  ctx.translate(76, 36);
  ctx.rotate(-0.42);
  ctx.fillStyle = rgb(44, 38, 34);
  ctx.beginPath();
  ctx.ellipse(0, 0, 21, 27, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(rng.spread(10), rng.range(-22, -12), rng.range(5, 8), 0, Math.PI * 2);
    ctx.fill();
  }
  // Cuencas hundidas y ojos de anillo blanco, uno más grande y más bajo.
  const eyes = [
    [-9, -6, 7.5],
    [9, -9, 6.3],
  ];
  for (const [ex, ey, r] of eyes) {
    ctx.fillStyle = rgb(14, 11, 10);
    ctx.beginPath();
    ctx.arc(ex, ey, r + 3, 0, Math.PI * 2);
    ctx.fill();
    roughRing(ctx, rng, ex, ey, r - 1, 3.2, rgb(228, 222, 206));
    ctx.fillStyle = rgb(8, 6, 6);
    ctx.beginPath();
    ctx.arc(ex + 0.8, ey + 0.5, r - 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(246, 242, 232);
    ctx.fillRect(ex - 0.5, ey - 1, 2, 2);
  }
  // Sonrisa torcida y abierta: boca negra, dientes separados, un lado más alto.
  ctx.fillStyle = rgb(14, 3, 3);
  ctx.beginPath();
  ctx.moveTo(-22, 6);
  ctx.quadraticCurveTo(-1, 42, 24, 1);
  ctx.quadraticCurveTo(0, 12, -22, 6);
  ctx.fill();
  const mouth = (t, depth) => {
    const x = -22 + 46 * t;
    const base = 6 + (1 - 6) * t;
    return [x, base + Math.sin(t * Math.PI) * depth];
  };
  for (let t = 0.06; t < 0.95; t += 0.075) {
    if (rng.chance(0.1)) continue; // diente que falta
    const tone = rng.range(196, 232);
    ctx.fillStyle = rgb(tone, tone * 0.95, tone * 0.8);
    const [xt, yt] = mouth(t, 6);
    ctx.fillRect(xt, yt + 0.5, 2.3, 3.5 + rng.range(0, 2.5));
    const [xb, yb] = mouth(t + 0.03, 20);
    ctx.fillRect(xb, yb - 5 - rng.range(0, 2), 2.3, 4 + rng.range(0, 1.5));
  }
  ctx.restore();

  return photograph(canvas, seed, { grain: 28, blur: 0.5, tint: [1.03, 0.95, 0.88], smear: 1, rim: 30 });
}

/**
 * El Alto: columna negra de siete metros erizada de espinas, con una cabeza roja sin rasgos claros.
 * 96 × 384 px (≈ 1.8 × 7.2 m).
 */
export function stalkerCanvas(seed = 777) {
  const W = 96;
  const H = 384;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);

  // Cuerpo: tela negra que cae, un poco ondulada.
  const left = [];
  const right = [];
  for (let y = 62; y <= H; y += 8) {
    const t = (y - 62) / (H - 62);
    const half = 8 + t * 13 + Math.sin(y * 0.05) * 2;
    const cx = 52 - t * 6 + Math.sin(y * 0.021) * 3;
    left.push([cx - half, y]);
    right.unshift([cx + half, y]);
  }
  blob(ctx, rng, [...left, ...right], rgb(10, 9, 9), 1.5);
  // Pliegues.
  for (let i = 0; i < 9; i++) {
    const x = rng.range(36, 60);
    scribble(ctx, rng, x, rng.range(80, 200), x + rng.spread(4), H - rng.range(0, 40), rgb(28, 26, 25), 1.2);
  }
  // Espinas: cónicas, gruesas en la base, apuntando hacia afuera y un poco hacia arriba.
  for (let i = 0; i < 54; i++) {
    const y = rng.range(50, H - 24);
    const t = (y - 62) / (H - 62);
    const side = rng.chance(0.5) ? -1 : 1;
    const x0 = 52 - t * 6 + side * (6 + t * 11);
    const len = rng.range(8, 26);
    const ang = rng.range(-0.7, 0.35);
    const tx = x0 + side * Math.cos(ang) * len;
    const ty = y + Math.sin(ang) * len;
    limb(ctx, [[x0, y], [tx, ty]], rng.range(1.2, 2.2), 0.3, rgb(8, 7, 7));
  }
  // Cabeza roja, abultada, con agujeros.
  ctx.fillStyle = rgb(112, 32, 24);
  ctx.beginPath();
  ctx.ellipse(54, 42, 16, 19, 0.15, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = rgb(70 + rng.range(-10, 30), 18, 14);
    ctx.beginPath();
    ctx.arc(54 + rng.spread(10), 42 + rng.spread(12), rng.range(2, 5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgb(16, 4, 4);
  ctx.fillRect(46, 36, 5, 4);
  ctx.fillRect(58, 35, 5, 4);
  ctx.fillRect(52, 47, 3, 9);
  // Corona de espinas sobre la cabeza.
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + rng.spread(1.4);
    scribble(ctx, rng, 54 + Math.cos(a) * 14, 42 + Math.sin(a) * 17, 54 + Math.cos(a) * 30, 42 + Math.sin(a) * 33, rgb(10, 8, 8), 0.4);
  }

  return photograph(canvas, seed, { grain: 20, blur: 0.5, rim: 22 });
}

/**
 * El del Sombrero: silueta negra con un ala plana y anchísima en lugar de cabeza, y dos ojos
 * que brillan en la oscuridad. 128 × 192 px (≈ 1.6 × 2.4 m).
 */
export function watcherCanvas(seed = 888) {
  const W = 128;
  const H = 192;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  const black = rgb(5, 5, 5);

  // Hombros caídos, torso y brazos colgando, separados del cuerpo.
  blob(ctx, rng, [[42, 90], [52, 80], [76, 80], [86, 90], [84, 192], [44, 192]], black, 1.8);
  limb(ctx, [[44, 88], [36, 130], [34, 172]], 6, 4.5, black);
  limb(ctx, [[84, 88], [92, 130], [95, 172]], 6, 4.5, black);
  limb(ctx, [[64, 82], [64, 66]], 6, 6, black);
  ctx.fillStyle = black;
  ctx.beginPath();
  ctx.ellipse(64, 60, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ala plana y anchísima, levemente inclinada, con copa baja.
  ctx.beginPath();
  ctx.ellipse(64, 47, 62, 6.5, -0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(64, 41, 17, 8, -0.04, 0, Math.PI * 2);
  ctx.fill();
  // Ojos que brillan, con halo.
  for (const [ex, ey] of [[57, 60], [72, 59]]) {
    for (const [r, a] of [[9, 0.14], [6.5, 0.26]]) {
      ctx.fillStyle = `rgba(255,255,248,${a})`;
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
    }
    roughRing(ctx, rng, ex, ey, 3.6, 2.4, rgb(252, 252, 246));
    ctx.fillStyle = rgb(4, 4, 4);
    ctx.fillRect(ex - 1, ey - 1, 2.5, 2.5);
  }
  return photograph(canvas, seed, { grain: 18, blur: 0.6, tint: [1, 1, 1], rim: 10, dissolve: { from: 120, to: 192 } });
}

/**
 * La Aguja: capucha cónica rayada, una cara pálida y diminuta, cuello anillado y patas de araña.
 * 256 × 192 px (≈ 3.4 × 2.55 m).
 */
export function percherCanvas(seed = 999) {
  const W = 256;
  const H = 192;
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  const rng = createRng(seed);
  const ink = rgb(12, 10, 9);

  // Patas: rodillas altas y puntas en el suelo.
  const legs = [
    [[96, 132], [44, 96], [8, 190]],
    [[100, 136], [70, 84], [52, 190]],
    [[110, 136], [150, 92], [118, 190]],
    [[116, 134], [190, 86], [206, 190]],
    [[112, 138], [222, 104], [250, 190]],
    [[94, 140], [24, 128], [30, 190]],
  ];
  for (const l of legs) {
    limb(ctx, l, 5, 2, ink);
    // pelos
    for (let k = 0; k < 4; k++) {
      const s = rng.next();
      const seg = s < 0.5 ? [l[0], l[1]] : [l[1], l[2]];
      const t = rng.next();
      const x = seg[0][0] + (seg[1][0] - seg[0][0]) * t;
      const y = seg[0][1] + (seg[1][1] - seg[0][1]) * t;
      scribble(ctx, rng, x, y, x + rng.spread(10), y + rng.range(-12, 4), rgb(30, 26, 22), 1.5);
    }
  }
  // Cuerpo encorvado.
  blob(ctx, rng, [[78, 118], [104, 108], [122, 122], [118, 146], [90, 150], [74, 138]], ink);
  // Cuello anillado.
  limb(ctx, [[96, 116], [108, 96], [118, 82]], 5, 4, ink);
  for (let i = 0; i < 5; i++) scribble(ctx, rng, 103 + i * 3, 108 - i * 5, 112 + i * 3, 110 - i * 5, rgb(170, 162, 150), 0.3);
  // Capucha cónica, inclinada.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(100, 74);
  ctx.lineTo(176, 2);
  ctx.lineTo(140, 80);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(120, 78, 21, 14, -0.25, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    scribble(ctx, rng, 104 + t * 66, 70 - t * 64, 138 + t * 34, 76 - t * 70, rgb(48, 44, 40), 0.4);
  }
  // Cara pálida, pequeña, con ojos de punto.
  ctx.fillStyle = rgb(200, 190, 168);
  ctx.beginPath();
  ctx.ellipse(118, 82, 12, 9, -0.25, 0, Math.PI * 2);
  ctx.fill();
  // Ojos hundidos y una boca que es solo una línea.
  ctx.fillStyle = rgb(24, 18, 16);
  ctx.fillRect(110, 79, 5, 3);
  ctx.fillRect(121, 76, 5, 3);
  ctx.fillStyle = rgb(90, 80, 70);
  ctx.fillRect(110, 82, 5, 1);
  ctx.fillRect(121, 79, 5, 1);
  ctx.fillStyle = rgb(24, 18, 16);
  ctx.fillRect(117, 81, 1, 5);
  ctx.fillRect(113, 88, 8, 1);

  return photograph(canvas, seed, { grain: 22, blur: 0.5, tint: [1, 0.98, 0.94], rim: 18 });
}
