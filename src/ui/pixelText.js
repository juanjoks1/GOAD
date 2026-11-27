// Texto pixelado: cada glifo se dibuja con la fuente monoespaciada del sistema y se binariza
// (sin antialias). Así todos los textos tienen el aspecto de un programa de 2005 a 640×480.

const FONT = '"DejaVu Sans Mono", "Lucida Console", Consolas, "Liberation Mono", "Courier New", monospace';
const glyphs = new Map();
const advances = new Map();
let measureCtx = null;

function measurer() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

function advance(ch, size) {
  const key = `${ch}|${size}`;
  if (!advances.has(key)) {
    const ctx = measurer();
    ctx.font = `${size}px ${FONT}`;
    advances.set(key, ctx.measureText(ch).width);
  }
  return advances.get(key);
}

function glyph(ch, size, color) {
  const key = `${ch}|${size}|${color}`;
  if (glyphs.has(key)) return glyphs.get(key);
  const w = Math.max(1, Math.ceil(advance(ch, size)) + 2);
  const h = Math.ceil(size * 1.35);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(ch, 0, Math.round(size * 0.12));
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 100 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  glyphs.set(key, canvas);
  return canvas;
}

export function textWidth(text, size = 16) {
  let w = 0;
  for (const ch of text) w += advance(ch, size);
  return Math.round(w);
}

/**
 * Dibuja texto pixelado. `y` es la parte superior de la línea.
 * @param {{ size?: number, color?: string, align?: 'left' | 'center' | 'right', shadow?: string }} o
 */
export function drawText(ctx, text, x, y, o = {}) {
  const size = o.size ?? 16;
  const color = o.color ?? '#c4c8bc';
  let cx = x;
  if (o.align === 'center') cx = x - textWidth(text, size) / 2;
  else if (o.align === 'right') cx = x - textWidth(text, size);
  cx = Math.round(cx);
  let pen = 0;
  for (const ch of text) {
    if (ch !== ' ') {
      if (o.shadow) ctx.drawImage(glyph(ch, size, o.shadow), Math.round(cx + pen) + 1, Math.round(y) + 1);
      ctx.drawImage(glyph(ch, size, color), Math.round(cx + pen), Math.round(y));
    }
    pen += advance(ch, size);
  }
}
