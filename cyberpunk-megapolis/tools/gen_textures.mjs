/**
 * Generates every texture the city and characters use, as WebP with a PNG
 * fallback, plus data/textures_webp.json describing which files exist in which
 * format and what colour space / packing the runtime must apply.
 *
 * Everything here is synthesised from noise -- no third-party image assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { RNG, fbm, noise2 } from './lib/rng.mjs';

const OUT = path.resolve(import.meta.dirname, '../textures');
const DATA = path.resolve(import.meta.dirname, '../data');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

const manifest = [];

/* ----------------------------------------------------------------- canvas */
class Img {
  constructor(w, h, channels = 3) {
    this.w = w; this.h = h; this.c = channels;
    this.d = new Float32Array(w * h * channels);
  }
  set(x, y, r, g, b, a = 1) {
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * this.c;
    this.d[i] = r; if (this.c > 1) this.d[i + 1] = g; if (this.c > 2) this.d[i + 2] = b;
    if (this.c > 3) this.d[i + 3] = a;
  }
  get(x, y) {
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * this.c;
    return [this.d[i], this.d[i + 1] ?? 0, this.d[i + 2] ?? 0, this.c > 3 ? this.d[i + 3] : 1];
  }
  fillRect(x0, y0, w, h, r, g, b, a = 1) {
    for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) this.set(x, y, r, g, b, a);
    }
  }
  mulRect(x0, y0, w, h, f) {
    for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
        const p = this.get(x, y); this.set(x, y, p[0] * f, p[1] * f, p[2] * f, p[3]);
      }
    }
  }
  each(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = fn(x, y, x / this.w, y / this.h, this.get(x, y));
      if (v) this.set(x, y, v[0], v[1], v[2], v.length > 3 ? v[3] : 1);
    }
  }
  toBytes() {
    const out = Buffer.alloc(this.w * this.h * this.c);
    for (let i = 0; i < this.d.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(this.d[i] * 255)));
    return out;
  }
}

async function write(name, img, { colorSpace = 'srgb', role = 'map', quality = 86, note = '' } = {}) {
  const raw = { width: img.w, height: img.h, channels: img.c };
  const bytes = img.toBytes();
  const webp = await sharp(bytes, { raw }).webp({ quality, alphaQuality: 92, effort: 5 }).toBuffer();
  const png = await sharp(bytes, { raw }).png({ compressionLevel: 9, palette: false }).toBuffer();
  fs.writeFileSync(path.join(OUT, name + '.webp'), webp);
  fs.writeFileSync(path.join(OUT, name + '.png'), png);
  manifest.push({
    name, webp: `${name}.webp`, png: `${name}.png`, size: [img.w, img.h],
    channels: img.c, colorSpace, role, note,
    bytes: { webp: webp.length, png: png.length },
  });
  console.log(`  ${name}  ${img.w}x${img.h}  webp ${(webp.length / 1024).toFixed(0)}k / png ${(png.length / 1024).toFixed(0)}k`);
}

/** height field -> tangent-space normal map (linear data, never sRGB) */
function normalFromHeight(hf, strength = 2.2) {
  const n = new Img(hf.w, hf.h, 3);
  const H = (x, y) => hf.get(x, y)[0];
  for (let y = 0; y < hf.h; y++) {
    for (let x = 0; x < hf.w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      n.set(x, y, nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5);
    }
  }
  return n;
}

/* ------------------------------------------------------------- generators */
function concrete(size, seed, base = 0.46, tint = [1, 0.99, 0.97]) {
  const img = new Img(size, size, 3);
  const h = new Img(size, size, 1);
  img.each((x, y, u, v) => {
    const grain = fbm(u, v, { octaves: 5, freq: 24, seed });
    const blot = fbm(u, v, { octaves: 3, freq: 4, seed: seed + 7 });
    const crack = Math.pow(1 - Math.abs(fbm(u, v, { octaves: 2, freq: 6, seed: seed + 31 }) - 0.5) * 2, 14);
    let l = base * (0.82 + grain * 0.30) * (0.88 + blot * 0.26) - crack * 0.16;
    l = Math.max(0.03, l);
    h.set(x, y, grain * 0.6 + blot * 0.4 - crack * 0.8);
    return [l * tint[0], l * tint[1], l * tint[2]];
  });
  return { img, h };
}

function asphalt(size, seed) {
  const img = new Img(size, size, 3);
  const h = new Img(size, size, 1);
  img.each((x, y, u, v) => {
    const agg = fbm(u, v, { octaves: 5, freq: 40, seed });
    const patch = fbm(u, v, { octaves: 3, freq: 5, seed: seed + 3 });
    const l = 0.115 * (0.6 + agg * 0.9) * (0.85 + patch * 0.35);
    h.set(x, y, agg);
    return [l, l * 1.01, l * 1.06];
  });
  return { img, h };
}

/**
 * Facade albedo + matching emissive window map. One tile covers `metres`
 * metres of wall so the window grid lines up across every building.
 */
function facade(size, seed, opts) {
  const { cols, rows, winW, winH, panel, glass, frame, emisPalette, litChance, metres } = opts;
  const rng = new RNG(seed);
  const alb = new Img(size, size, 3);
  const emi = new Img(size, size, 3);
  const hf = new Img(size, size, 1);
  // panel base
  alb.each((x, y, u, v) => {
    const g = fbm(u, v, { octaves: 4, freq: 18, seed });
    const seam = (Math.abs((v * rows * 2) % 1 - 0.5) > 0.47 || Math.abs((u * cols * 2) % 1 - 0.5) > 0.47) ? 0.72 : 1;
    const l = panel * (0.86 + g * 0.28) * seam;
    hf.set(x, y, g * 0.35 + (seam < 1 ? -0.5 : 0));
    return [l, l * 0.99, l * 1.02];
  });
  emi.each(() => [0, 0, 0]);
  const cw = size / cols, ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * cw + cw * (1 - winW) / 2, y0 = r * ch + ch * (1 - winH) / 2;
      const w = cw * winW, h = ch * winH;
      // recessed dark glass
      alb.fillRect(x0, y0, w, h, glass[0], glass[1], glass[2]);
      // frame
      alb.fillRect(x0 - 1, y0 - 1, w + 2, 1.5, frame[0], frame[1], frame[2]);
      alb.fillRect(x0 - 1, y0 + h, w + 2, 1.5, frame[0], frame[1], frame[2]);
      alb.fillRect(x0 - 1, y0 - 1, 1.5, h + 2, frame[0], frame[1], frame[2]);
      alb.fillRect(x0 + w, y0 - 1, 1.5, h + 2, frame[0], frame[1], frame[2]);
      for (let y = Math.floor(y0); y < y0 + h; y++) for (let x = Math.floor(x0); x < x0 + w; x++) hf.set(x, y, -0.7);
      if (rng.chance(litChance)) {
        const col = rng.pick(emisPalette);
        const gain = rng.range(0.55, 1.0);
        const inset = rng.chance(0.4) ? 0.12 : 0;
        for (let y = Math.floor(y0 + h * inset); y < y0 + h * (1 - inset); y++) {
          for (let x = Math.floor(x0 + w * inset); x < x0 + w * (1 - inset); x++) {
            const fall = 0.82 + 0.18 * noise2(x * 0.3, y * 0.3, size, seed + 9);
            emi.set(x, y, col[0] * gain * fall, col[1] * gain * fall, col[2] * gain * fall);
          }
        }
        // blinds / occupancy silhouettes
        if (rng.chance(0.45)) {
          const bands = rng.int(2, 5);
          for (let b = 0; b < bands; b++) {
            const by = y0 + h * (b + 0.5) / bands;
            emi.mulRect(x0, by, w, Math.max(1, h / bands * 0.3), rng.range(0.25, 0.6));
          }
        }
      }
    }
  }
  return { alb, emi, hf, metres };
}

function metalPanel(size, seed, rust = 0) {
  const img = new Img(size, size, 3);
  const h = new Img(size, size, 1);
  img.each((x, y, u, v) => {
    const corr = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 16);
    const grime = fbm(u, v, { octaves: 5, freq: 16, seed });
    const r0 = Math.pow(fbm(u, v, { octaves: 4, freq: 7, seed: seed + 21 }), 2.2) * rust;
    let l = 0.30 * (0.7 + corr * 0.45) * (0.8 + grime * 0.4);
    h.set(x, y, corr * 0.7 + grime * 0.3);
    return [l * (1 + r0 * 1.7), l * (1 - r0 * 0.15), l * (1 - r0 * 0.45)];
  });
  return { img, h };
}

/** Unity-style MetallicSmoothness: R = metalness, A = smoothness. */
function metallicSmoothness(size, seed, metal, smooth, variance = 0.18) {
  const img = new Img(size, size, 4);
  img.each((x, y, u, v) => {
    const n = fbm(u, v, { octaves: 4, freq: 12, seed });
    const m = Math.max(0, Math.min(1, metal + (n - 0.5) * variance));
    const s = Math.max(0, Math.min(1, smooth + (n - 0.5) * variance * 1.6));
    return [m, 0, 0, s];
  });
  return img;
}

/* ------------------------------------------------------------------- main */
console.log('textures:');

// concrete family
{
  const { img, h } = concrete(1024, 11, 0.44);
  await write('concrete', img, { role: 'albedo', note: 'planar-projected city concrete' });
  await write('concrete_n', normalFromHeight(h, 1.7), { colorSpace: 'linear', role: 'normal' });
  await write('concrete_ms', metallicSmoothness(512, 12, 0.0, 0.22), { colorSpace: 'linear', role: 'metallicSmoothness', note: 'R=metal A=smoothness' });
}
{
  const { img } = concrete(512, 23, 0.26, [1, 0.98, 1.02]);
  await write('concrete_dark', img, { role: 'albedo' });
}
{
  const { img } = concrete(512, 41, 0.52, [1.02, 0.99, 0.94]);
  await write('sidewalk', img, { role: 'albedo', note: 'paving slabs' });
}
{
  const { img, h } = asphalt(512, 57);
  await write('asphalt', img, { role: 'albedo' });
  await write('asphalt_n', normalFromHeight(h, 1.1), { colorSpace: 'linear', role: 'normal' });
}

// facades + emissive windows
const facadeDefs = [
  ['facade_tower', { cols: 6, rows: 6, winW: 0.62, winH: 0.55, panel: 0.175, glass: [0.035, 0.042, 0.055], frame: [0.16, 0.17, 0.19], emisPalette: [[1.0, 0.72, 0.36], [1.0, 0.80, 0.46], [0.86, 0.92, 1.0], [1.0, 0.62, 0.30]], litChance: 0.46, metres: 12 }],
  ['facade_res', { cols: 8, rows: 8, winW: 0.50, winH: 0.44, panel: 0.200, glass: [0.03, 0.033, 0.04], frame: [0.19, 0.18, 0.17], emisPalette: [[1.0, 0.68, 0.30], [1.0, 0.75, 0.40], [1.0, 0.55, 0.26], [0.55, 0.85, 1.0]], litChance: 0.58, metres: 10 }],
  ['facade_glass', { cols: 5, rows: 10, winW: 0.88, winH: 0.82, panel: 0.125, glass: [0.045, 0.055, 0.075], frame: [0.12, 0.13, 0.15], emisPalette: [[0.72, 0.9, 1.0], [0.9, 0.95, 1.0], [1.0, 0.78, 0.44]], litChance: 0.34, metres: 14 }],
  ['facade_slum', { cols: 10, rows: 10, winW: 0.42, winH: 0.38, panel: 0.215, glass: [0.028, 0.03, 0.032], frame: [0.22, 0.2, 0.17], emisPalette: [[1.0, 0.6, 0.24], [1.0, 0.7, 0.34], [1.0, 0.36, 0.30]], litChance: 0.62, metres: 8 }],
];
const facadeMeta = {};
for (const [name, opts] of facadeDefs) {
  const { alb, emi, hf, metres } = facade(1024, name.length * 977 + 13, opts);
  await write(name, alb, { role: 'albedo', note: `tile = ${metres}m` });
  await write(name + '_emis', emi, { role: 'emissive', note: 'warm window lights' });
  if (name === 'facade_tower' || name === 'facade_slum') {
    await write(name + '_n', normalFromHeight(hf, 1.3), { colorSpace: 'linear', role: 'normal' });
  }
  facadeMeta[name] = { metres, cols: opts.cols, rows: opts.rows };
}

// metals
{
  const { img, h } = metalPanel(512, 71, 0.0);
  await write('metal_panel', img, { role: 'albedo' });
  await write('metal_panel_n', normalFromHeight(h, 2.6), { colorSpace: 'linear', role: 'normal' });
  await write('metal_ms', metallicSmoothness(512, 72, 0.85, 0.55), { colorSpace: 'linear', role: 'metallicSmoothness', note: 'R=metal A=smoothness' });
}
{
  const { img } = metalPanel(512, 83, 1.0);
  await write('metal_rust', img, { role: 'albedo' });
}
await write('facade_glass_ms', metallicSmoothness(512, 91, 0.6, 0.86), { colorSpace: 'linear', role: 'metallicSmoothness', note: 'R=metal A=smoothness' });

// metro tiles / roof gravel / brick / plaster
{
  const img = new Img(512, 512, 3);
  const h = new Img(512, 512, 1);
  img.each((x, y, u, v) => {
    const tx = Math.floor(u * 16), ty = Math.floor(v * 16);
    const edge = (Math.abs((u * 16) % 1 - 0.5) > 0.44 || Math.abs((v * 16) % 1 - 0.5) > 0.44);
    const t = noise2(tx, ty, 16, 5);
    const grime = fbm(u, v, { octaves: 4, freq: 9, seed: 6 });
    const l = (edge ? 0.10 : 0.33 + t * 0.10) * (0.78 + grime * 0.4);
    h.set(x, y, edge ? -0.6 : 0.2 + t * 0.1);
    return [l * 1.02, l, l * 0.97];
  });
  await write('tile_metro', img, { role: 'albedo' });
  await write('tile_metro_n', normalFromHeight(h, 1.4), { colorSpace: 'linear', role: 'normal' });
}
{
  const img = new Img(512, 512, 3);
  img.each((x, y, u, v) => {
    const g = fbm(u, v, { octaves: 6, freq: 48, seed: 13 });
    const l = 0.20 * (0.55 + g * 1.1);
    return [l * 1.04, l, l * 0.94];
  });
  await write('roof_gravel', img, { role: 'albedo' });
}
{
  const img = new Img(512, 512, 3);
  const h = new Img(512, 512, 1);
  const rng = new RNG(1234);
  img.each((x, y, u, v) => {
    const row = Math.floor(v * 24);
    const off = (row % 2) * 0.5;
    const bu = (u * 12 + off) % 1, bv = (v * 24) % 1;
    const mortar = bu < 0.06 || bu > 0.94 || bv < 0.10 || bv > 0.90;
    const t = noise2(Math.floor(u * 12 + off), row, 12, 17);
    const l = mortar ? 0.20 : 0.20 + t * 0.11;
    h.set(x, y, mortar ? -0.8 : 0.3);
    return mortar ? [l, l * 0.99, l * 0.96] : [l * 1.25, l * 0.86, l * 0.74];
  });
  await write('brick', img, { role: 'albedo' });
  await write('brick_n', normalFromHeight(h, 1.8), { colorSpace: 'linear', role: 'normal' });
}
{
  const img = new Img(512, 512, 3);
  img.each((x, y, u, v) => {
    const g = fbm(u, v, { octaves: 5, freq: 14, seed: 19 });
    const stain = Math.pow(fbm(u, v, { octaves: 4, freq: 5, seed: 29 }), 2.6);
    const l = 0.38 * (0.8 + g * 0.35) * (1 - stain * 0.55);
    return [l * 1.03, l * 0.99, l * 0.93];
  });
  await write('plaster', img, { role: 'albedo' });
}

// emissive strips for neon
{
  const img = new Img(256, 256, 3);
  img.each((x, y, u, v) => {
    const band = Math.floor(v * 8);
    const cols = [[1, 0.31, 0.85], [0.25, 0.95, 1], [1, 0.22, 0.28], [1, 0.95, 0.85], [0.55, 0.35, 1], [0.3, 1, 0.62], [1, 0.66, 0.16], [0.95, 0.95, 1]];
    const c = cols[band % cols.length];
    const across = Math.abs((v * 8) % 1 - 0.5) * 2;
    const glow = Math.pow(1 - across, 1.6);
    const flick = 0.9 + 0.1 * noise2(u * 40, band, 40, 3);
    return [c[0] * glow * flick, c[1] * glow * flick, c[2] * glow * flick];
  });
  await write('neon_bars', img, { role: 'emissive' });
}

// decals with alpha
{
  const img = new Img(512, 512, 4);
  img.each((x, y, u, v) => {
    let a = 0, l = 0.85;
    // centre dashed line
    if (Math.abs(u - 0.5) < 0.012 && (v * 8) % 1 < 0.55) a = 1;
    // edge lines
    if (Math.abs(u - 0.06) < 0.010 || Math.abs(u - 0.94) < 0.010) a = 1;
    const wear = fbm(u, v, { octaves: 4, freq: 20, seed: 33 });
    a *= 0.35 + wear * 0.8;
    return [l, l * 0.95, l * 0.72, Math.min(1, a)];
  });
  await write('road_lines', img, { role: 'albedo-alpha', note: 'alphaTest decal' });
}
{
  const img = new Img(256, 256, 4);
  img.each((x, y, u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const n = fbm(u, v, { octaves: 4, freq: 6, seed: 47 });
    const a = Math.max(0, Math.pow(1 - r, 2.1) * (0.55 + n * 0.8));
    return [1, 0.98, 0.99, Math.min(1, a)];
  });
  await write('cloud_puff', img, { role: 'albedo-alpha', note: 'camera-facing cloud billboard' });
}
{
  const img = new Img(256, 256, 4);
  img.each((x, y, u, v) => {
    const n = Math.pow(fbm(u, v, { octaves: 5, freq: 8, seed: 53 }), 2.0);
    const streak = Math.pow(fbm(u, v * 0.25, { octaves: 4, freq: 10, seed: 59 }), 2.4);
    return [0.06, 0.055, 0.05, Math.min(0.85, n * 0.5 + streak * 0.7)];
  });
  await write('grime_decal', img, { role: 'albedo-alpha' });
}

/* ------------------------------------------------------------- write json */
const doc = {
  generated: new Date().toISOString().slice(0, 10),
  note: 'WebP is preferred; PNG is the fallback when Image/decode of WebP fails. colorSpace tells the runtime whether to tag SRGBColorSpace (albedo/emissive) or NoColorSpace (normal, metallicSmoothness, AO).',
  facades: facadeMeta,
  textures: manifest,
};
fs.writeFileSync(path.join(DATA, 'textures_webp.json'), JSON.stringify(doc, null, 1));
const total = manifest.reduce((a, m) => a + m.bytes.webp, 0);
console.log(`\n${manifest.length} textures, ${(total / 1048576).toFixed(2)} MB of WebP (+ PNG fallbacks)`);
