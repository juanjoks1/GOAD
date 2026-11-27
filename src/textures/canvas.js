// Utilidades para pintar texturas procedurales en <canvas> y convertirlas en texturas de Three.js.
// Todas las texturas son pequeñas (32–256 px), con semilla fija y sin archivos externos.
import * as THREE from 'three';
import { fbm2D } from '../core/noise.js';
import { TEXTURES } from '../config.js';

export function createCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export const ctx2d = (canvas) => canvas.getContext('2d', { willReadFrequently: true });

/** Pinta píxel a píxel. `fn(x, y, out)` escribe out = [r, g, b, a] en 0–255. */
export function paint(w, h, fn) {
  const canvas = createCanvas(w, h);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[3] = 255;
      fn(x, y, out);
      const i = (y * w + x) * 4;
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Modifica los píxeles existentes. `fn(x, y, px)` recibe y modifica px = [r, g, b, a]. */
export function shade(canvas, fn) {
  const ctx = ctx2d(canvas);
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const px = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[0] = d[i];
      px[1] = d[i + 1];
      px[2] = d[i + 2];
      px[3] = d[i + 3];
      fn(x, y, px);
      d[i] = px[0];
      d[i + 1] = px[1];
      d[i + 2] = px[2];
      d[i + 3] = px[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Reduce la profundidad de color (aspecto de textura de 2005 comprimida y sucia). */
export function posterize(canvas, levels = TEXTURES.posterizeLevels) {
  const step = 255 / (levels - 1);
  return shade(canvas, (x, y, p) => {
    p[0] = Math.round(p[0] / step) * step;
    p[1] = Math.round(p[1] / step) * step;
    p[2] = Math.round(p[2] / step) * step;
  });
}

/**
 * Alfa binario (recorte duro para alphaTest) y "sangrado" de color en los píxeles transparentes,
 * para que los mipmaps no oscurezcan los bordes de las hojas.
 */
export function cutout(canvas, bleed = [60, 70, 40], threshold = 110) {
  return shade(canvas, (x, y, p) => {
    if (p[3] >= threshold) {
      p[3] = 255;
    } else {
      p[0] = bleed[0];
      p[1] = bleed[1];
      p[2] = bleed[2];
      p[3] = 0;
    }
  });
}

/** Dibuja algo repetido en los 9 desplazamientos para que respete el borde de una textura repetible. */
export function drawWrapped(canvas, draw) {
  const { width: w, height: h } = canvas;
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) draw(ox, oy);
}

/** Ruido fBm repetible en una textura de w × h con `cells` celdas por lado. */
export function tileNoise(x, y, w, h, cells, seed = 0, octaves = 4, cellsY = cells) {
  return fbm2D((x / w) * cells, (y / h) * cellsY, { seed, octaves, period: cells, periodY: cellsY });
}

export const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

const FILTERS = {
  nearest: THREE.NearestFilter,
  linear: THREE.LinearFilter,
  'nearest-mipmap': THREE.NearestMipmapLinearFilter,
  'linear-mipmap': THREE.LinearMipmapLinearFilter,
};

/** Convierte un canvas en textura con el filtrado retro configurado. */
export function toTexture(canvas, { repeat = [1, 1], wrap = true, mag = TEXTURES.magFilter, min = TEXTURES.minFilter } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.magFilter = FILTERS[mag];
  tex.minFilter = FILTERS[min];
  tex.generateMipmaps = min.endsWith('mipmap');
  tex.anisotropy = 1;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
