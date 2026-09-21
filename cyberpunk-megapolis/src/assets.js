/**
 * Asset pipeline: a single THREE.LoadingManager drives the loader UI, textures
 * resolve WebP first with a PNG fallback, colour spaces are applied per
 * channel, Unity MetallicSmoothness maps are repacked into glTF ORM layout,
 * and the 41 render-group materials are built once and shared.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const BUILD = 'BUILD 2026.09.21';

/* ------------------------------------------------------------- webp probe */
let webpOK = null;
export async function supportsWebP() {
  if (webpOK !== null) return webpOK;
  webpOK = await new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img.width === 2 && img.height === 2);
    img.onerror = () => res(false);
    img.src = 'data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoCAAIAAsBMJaACdLoAA5gA/u5DH+5sc4twV/9tD/9aH/60P+lAAA==';
  });
  return webpOK;
}

/* ============================================================ AssetLoader */
export class AssetLoader {
  constructor({ onProgress, onError } = {}) {
    this.manager = new THREE.LoadingManager();
    this.loaded = 0;
    this.total = 0;
    this.errors = [];
    this.started = new Set();
    this._onProgress = onProgress || (() => {});
    this._onError = onError || (() => {});

    this.extraLoaded = 0;
    this.extraTotal = 0;
    // itemStart / onProgress / onLoad are the real signals -- no fake timer ever
    // advances this bar.
    this.manager.onStart = (url, loaded, total) => { this._mLoaded = loaded; this._mTotal = total; this._emit(); };
    this.manager.onProgress = (url, loaded, total) => { this._mLoaded = loaded; this._mTotal = total; this._emit(); };
    this.manager.onLoad = () => { this._emit(); };
    this._mLoaded = 0;
    this._mTotal = 0;
    // The single-file build serves every asset from an inlined data-URI map so
    // the page works straight off a phone's filesystem, with no server.
    const inline = globalThis.__INLINE_ASSETS;
    if (inline) {
      this.manager.setURLModifier((url) => {
        const key = String(url).replace(/^\.?\//, '');
        return inline[key] || inline['./' + key] || url;
      });
    }

    this.manager.onError = (url) => {
      const short = String(url).split('/').slice(-2).join('/');
      this.errors.push(short);
      this._onError(short);
      this._emit();
    };

    this.gltf = new GLTFLoader(this.manager);
    this.draco = new DRACOLoader(this.manager).setDecoderPath('./vendor/draco/gltf/');
    this.gltf.setDRACOLoader(this.draco);
    this.tex = new THREE.TextureLoader(this.manager);
    this.file = new THREE.FileLoader(this.manager);
    this.file.setResponseType('json');
  }
  _emit() {
    this.loaded = this._mLoaded + this.extraLoaded;
    this.total = Math.max(this._mTotal + this.extraTotal, this.loaded);
    this._onProgress(this.loaded, this.total, this.errors);
  }

  json(url) { return this.file.loadAsync(url); }

  /** register extra queue items so the bar reflects work three.js can't see */
  reserve(n) { this.extraTotal += n; this._emit(); }
  complete(n = 1) { this.extraLoaded += n; this._emit(); }

  loadGLB(url) { return this.gltf.loadAsync(url); }

  dispose() { this.draco.dispose(); }
}

/* ================================================================ textures */
const _texCache = new Map();

/**
 * Loads a texture by manifest name, preferring WebP. `role` decides colour
 * space: albedo/emissive get sRGB, data maps (normal, metallicSmoothness) stay
 * linear -- getting this backwards is the classic washed-out-normals bug.
 */
export async function loadTexture(loader, manifest, name, { srgb, repeat = 1, aniso = 8 } = {}) {
  const key = `${name}|${srgb ? 's' : 'l'}|${repeat}`;
  if (_texCache.has(key)) return _texCache.get(key);
  const entry = manifest.byName.get(name);
  if (!entry) throw new Error(`texture not in manifest: ${name}`);
  const useWebP = manifest.webp;
  const primary = `./textures/${useWebP ? entry.webp : entry.png}`;
  const fallback = `./textures/${entry.png}`;

  let tex;
  try {
    tex = await loader.tex.loadAsync(primary);
  } catch (e) {
    if (primary === fallback) throw e;
    console.warn(`[assets] ${primary} failed, falling back to PNG`);
    tex = await loader.tex.loadAsync(fallback);
  }
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.name = name;
  tex.needsUpdate = true;
  _texCache.set(key, tex);
  return tex;
}

/**
 * Unity MetallicSmoothness -> glTF ORM. Unity packs metalness in R and
 * smoothness in A; three.js wants roughness in G and metalness in B of one
 * texture. We repack on a canvas, inverting the alpha channel.
 */
export async function repackMetallicSmoothness(loader, manifest, name, repeat) {
  const key = `orm|${name}|${repeat}`;
  if (_texCache.has(key)) return _texCache.get(key);
  const entry = manifest.byName.get(name);
  const url = `./textures/${manifest.webp ? entry.webp : entry.png}`;
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => {
      const j = new Image();
      j.onload = () => res(j);
      j.onerror = rej;
      j.src = `./textures/${entry.png}`;
    };
    i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const metal = p[i];                 // Unity R = metallic
    const smooth = p[i + 3];            // Unity A = smoothness
    p[i] = 255;                         // R = ambient occlusion (unused -> white)
    p[i + 1] = 255 - smooth;            // G = roughness = 1 - smoothness
    p[i + 2] = metal;                   // B = metalness
    p[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.name = name + '_orm';
  tex.needsUpdate = true;
  _texCache.set(key, tex);
  return tex;
}

/* ====================================================== runtime signage */
const JP = ['新宿', '電気', '未来', '夜景', '通信', '鉄道', '食堂', '超電導', '無限', '営業中', '大安売', '拉麺', '居酒屋', '株式会社', '警告', '出口'];
const KANA = ['サイバー', 'メガロ', 'ネオン', 'トウキョウ', 'デンキ', 'シティ', 'ムゲン', 'カブキ'];
const EN = ['MEGAPOLIS', 'NEO CORE', 'HYPERLOOP', 'SYNTH FUEL', 'DATA WARD', 'ORBITAL', 'NEON WARD', 'NIGHT MARKET', 'RAMEN 24H', 'SKYLINE', 'GRID 07', 'ARCADE'];
const NUM = ['24H', '88', '01', '404', '1-9-3', '¥980', '2099', 'B2F', 'NO.7'];
const NEON = ['#ff4fd8', '#42e8ff', '#ff2f3c', '#ffe9c9', '#9b5cff', '#49ff9e', '#ff9a2e', '#4a7bff'];

function hashRnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

/** Draws a neon advertisement / sign plate into a canvas texture. */
export function makeSignTexture(kind, index, size = 512) {
  const r = hashRnd(index * 9176 + kind.length * 31 + 7);
  const w = kind === 'ad' ? size : size;
  const h = kind === 'ad' ? size : Math.round(size / 2);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const accent = NEON[Math.floor(r() * NEON.length)];
  const accent2 = NEON[Math.floor(r() * NEON.length)];

  // backdrop
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0a0b12');
  grad.addColorStop(1, r() < 0.5 ? '#170c1c' : '#0b1420');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // colour wash
  g.globalAlpha = 0.20 + r() * 0.2;
  g.fillStyle = accent;
  g.beginPath();
  g.ellipse(w * r(), h * r(), w * 0.5, h * 0.42, r() * 3, 0, 6.3);
  g.fill();
  g.globalAlpha = 1;

  // frame
  g.strokeStyle = accent;
  g.lineWidth = Math.max(2, w * 0.012);
  g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);

  const fam = `'Geist Mono', 'WenQuanYi Zen Hei', 'Noto Sans CJK SC', monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  const layout = Math.floor(r() * 3);
  const jp = JP[Math.floor(r() * JP.length)];
  const kana = KANA[Math.floor(r() * KANA.length)];
  const en = EN[Math.floor(r() * EN.length)];
  const num = NUM[Math.floor(r() * NUM.length)];

  const glow = (fn, color, blur) => {
    g.save(); g.shadowColor = color; g.shadowBlur = blur; g.fillStyle = color; fn(); g.restore();
  };

  if (layout === 0) {
    glow(() => { g.font = `700 ${h * 0.30}px ${fam}`; g.fillText(jp, w / 2, h * 0.34); }, accent, h * 0.12);
    glow(() => { g.font = `300 ${h * 0.11}px ${fam}`; g.fillText(en, w / 2, h * 0.60); }, '#eaf4ff', h * 0.05);
    glow(() => { g.font = `500 ${h * 0.13}px ${fam}`; g.fillText(num, w / 2, h * 0.80); }, accent2, h * 0.08);
  } else if (layout === 1) {
    glow(() => { g.font = `500 ${h * 0.14}px ${fam}`; g.fillText(kana, w / 2, h * 0.24); }, accent2, h * 0.07);
    glow(() => { g.font = `700 ${h * 0.20}px ${fam}`; g.fillText(en, w / 2, h * 0.50); }, '#f4faff', h * 0.09);
    glow(() => { g.font = `700 ${h * 0.24}px ${fam}`; g.fillText(jp, w / 2, h * 0.78); }, accent, h * 0.13);
  } else {
    // vertical Japanese column + english sidebar
    const chars = [...jp, ...kana.slice(0, 2)];
    glow(() => {
      g.font = `700 ${h * 0.155}px ${fam}`;
      chars.forEach((ch, i) => g.fillText(ch, w * 0.30, h * (0.16 + i * 0.16)));
    }, accent, h * 0.1);
    g.save();
    g.translate(w * 0.72, h * 0.5); g.rotate(Math.PI / 2);
    glow(() => { g.font = `300 ${h * 0.12}px ${fam}`; g.fillText(en, 0, 0); }, '#e8f2ff', h * 0.05);
    g.restore();
    glow(() => { g.font = `500 ${h * 0.12}px ${fam}`; g.fillText(num, w * 0.88, h * 0.88); }, accent2, h * 0.06);
  }

  // scanlines + grain so the panels read as screens
  g.globalAlpha = 0.10;
  g.fillStyle = '#000';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.6);
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.name = `${kind}${index}`;
  tex.needsUpdate = true;
  return tex;
}

/** Camouflage pattern for the male character's jacket. */
export function makeCamoTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#5c6448';
  g.fillRect(0, 0, size, size);
  const cols = ['#414a34', '#6d7355', '#2f3527', '#7c8163'];
  const r = hashRnd(90210);
  for (let i = 0; i < 150; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.beginPath();
    const x = r() * size, y = r() * size, rad = 8 + r() * 26;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rr = rad * (0.6 + r() * 0.7);
      g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.name = 'camo';
  return tex;
}

/* ====================================================== material factory */
/** Patch so the per-instance / per-vertex colour drives emissive, not diffuse. */
function patchEmissiveFromColor(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;',
    );
  };
  mat.customProgramCacheKey = () => 'emissiveFromColor';
}

export async function buildRenderGroupMaterials(loader, materialsDoc, texManifest, quality) {
  const out = new Map();
  const groups = materialsDoc.renderGroups;
  const aniso = quality.anisotropy;
  for (const [name, def] of Object.entries(groups)) {
    const params = {
      color: 0xffffff,
      roughness: def.roughness != null ? def.roughness : 0.9,
      metalness: def.metalness != null ? def.metalness : 0,
      vertexColors: true,
    };
    const repeat = def.uvScale != null ? def.uvScale : 1;

    if (def.canvas) {
      const kind = def.canvas.startsWith('ad') ? 'ad' : 'sign';
      const idx = parseInt(def.canvas.replace(/\D+/g, ''), 10);
      const tex = makeSignTexture(kind, idx, kind === 'ad' ? 512 : 512);
      params.map = tex;
      params.emissiveMap = tex;
      params.emissive = 0xffffff;
      params.emissiveIntensity = def.emissiveIntensity || 1.5;
      loader.complete();
    } else {
      if (def.map) params.map = await loadTexture(loader, texManifest, def.map, { srgb: true, repeat, aniso });
      if (def.emissiveMap) {
        params.emissiveMap = await loadTexture(loader, texManifest, def.emissiveMap, { srgb: true, repeat, aniso });
        params.emissive = 0xffffff;
        params.emissiveIntensity = def.emissiveIntensity || 2;
      }
      if (def.normalMap && quality.normalMaps) {
        params.normalMap = await loadTexture(loader, texManifest, def.normalMap, { srgb: false, repeat, aniso });
        params.normalScale = new THREE.Vector2(def.normalScale || 1, def.normalScale || 1);
      }
      if (def.metallicSmoothness && quality.ormMaps) {
        const orm = await repackMetallicSmoothness(loader, texManifest, def.metallicSmoothness, repeat);
        params.metalnessMap = orm;
        params.roughnessMap = orm;
      }
    }

    if (def.emissiveFromVertexColor) {
      params.color = 0x0b0b0d;
      params.emissive = 0xffffff;
      params.emissiveIntensity = def.emissiveIntensity || 3.2;
    }
    if (def.transparent) { params.transparent = true; params.opacity = def.opacity != null ? def.opacity : 1; }
    if (def.alphaTest) { params.alphaTest = def.alphaTest; params.transparent = false; }
    if (def.depthWrite === false) params.depthWrite = false;
    if (def.side === 'double') params.side = THREE.DoubleSide;
    if (def.polygonOffset) { params.polygonOffset = true; params.polygonOffsetFactor = -2; params.polygonOffsetUnits = -2; }

    const mat = new THREE.MeshStandardMaterial(params);
    mat.name = name;
    if (def.emissiveFromVertexColor) patchEmissiveFromColor(mat);
    if (def.unlit) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = params.map || null; mat.emissiveIntensity = 0.85; }
    mat.userData.bloom = !!def.bloom;
    mat.userData.def = def;
    out.set(name, mat);
  }
  return out;
}

/** Character materials, one MeshStandardMaterial per category (24 of them). */
export function buildCharacterMaterials(charDefs, camoTex) {
  const out = new Map();
  for (const [name, def] of Object.entries(charDefs)) {
    const p = {
      color: new THREE.Color(def.color || '#ffffff'),
      roughness: def.roughness != null ? def.roughness : 0.8,
      metalness: def.metalness != null ? def.metalness : 0,
    };
    if (def.emissive) { p.emissive = new THREE.Color(def.emissive); p.emissiveIntensity = def.emissiveIntensity || 1; }
    if (def.transparent) { p.transparent = true; p.opacity = def.opacity != null ? def.opacity : 1; }
    if (def.depthWrite === false) p.depthWrite = false;
    if (def.camo && camoTex) { p.map = camoTex; p.color = new THREE.Color(0xffffff); }
    const m = new THREE.MeshStandardMaterial(p);
    m.name = name;
    out.set(name, m);
  }
  return out;
}

/* ============================================================= GLB hygiene */
/**
 * Source city assets ship LOD1+ and collider shells. We drop them so nothing
 * z-fights and no grey collision hull is ever visible.
 */
const JUNK = /(_LOD[1-9]|LOD[1-9]_|collider|collision|UCX_|_ref$|proxy)/i;
export function harvestPrefabMeshes(gltf) {
  const byName = new Map();
  let dropped = 0;
  for (const node of gltf.scene.children) {
    if (JUNK.test(node.name)) { dropped++; continue; }
    const prims = [];
    const visit = (o) => {
      if (o.isMesh) {
        if (JUNK.test(o.name) || JUNK.test(o.material?.name || '')) { dropped++; return; }
        prims.push({ geometry: o.geometry, material: o.material?.name || 'concrete_a' });
      }
      o.children.forEach(visit);
    };
    visit(node);
    if (prims.length) byName.set(node.name, prims);
  }
  return { byName, dropped };
}

/** Warm textures + programs so the first high-altitude dive doesn't stutter. */
export function prewarm(renderer, scene, camera, materials) {
  for (const m of materials) {
    for (const k of ['map', 'emissiveMap', 'normalMap', 'metalnessMap', 'roughnessMap']) {
      if (m[k]) renderer.initTexture(m[k]);
    }
  }
  renderer.compile(scene, camera);
}
