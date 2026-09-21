/**
 * Prefab template library. Every entry is a small local-space model that the
 * scene generator places many times; UVs are baked in metres so a material's
 * uvScale decides texture density regardless of which prefab uses it.
 *
 * Categories match the GLB split: Background, Car, Combined_Building, Decals,
 * Environment, Facade_Details, Metro, Modules, Street.
 */
import { Part, box, cyl, sphere, plane, cone, torus, prism, xf, projectUV, THREE } from './geom.mjs';
import { RNG } from './rng.mjs';

const TOWER_FACADES = ['facade_tower_a', 'facade_tower_b', 'facade_tower_c', 'facade_tower_d'];
const RES_FACADES = ['facade_res_a', 'facade_res_b', 'facade_res_c'];
const GLASS_FACADES = ['facade_glass_a', 'facade_glass_b'];
const SLUM_FACADES = ['facade_slum_a', 'facade_slum_b'];
const NEONS = ['neon_pink', 'neon_cyan', 'neon_red', 'neon_white', 'neon_purple', 'neon_green', 'neon_orange', 'neon_blue'];
const CONCRETES = ['concrete_a', 'concrete_b', 'concrete_c', 'concrete_d'];

/** add a box whose UVs are projected in metres */
function pbox(part, mat, w, h, d, t = [0, 0, 0], r = [0, 0, 0]) {
  const g = xf(box(w, h, d), { t, r });
  part.add(mat, projectUV(g, 1));
  return part;
}
function pcyl(part, mat, rt, rb, h, seg, t = [0, 0, 0], r = [0, 0, 0]) {
  const g = xf(cyl(rt, rb, h, seg), { t, r });
  part.add(mat, projectUV(g, 1));
  return part;
}

/* ===================================================== Combined_Building */

/** parapet ring on top of a w x d roof at height y */
function parapet(part, mat, w, d, y, h = 0.9, t = 0.28) {
  pbox(part, mat, w, h, t, [0, y + h / 2, d / 2 - t / 2]);
  pbox(part, mat, w, h, t, [0, y + h / 2, -d / 2 + t / 2]);
  pbox(part, mat, t, h, d - t * 2, [w / 2 - t / 2, y + h / 2, 0]);
  pbox(part, mat, t, h, d - t * 2, [-w / 2 + t / 2, y + h / 2, 0]);
}

/** ground-floor shopfront band: glazing, glow strip, awnings */
function shopfront(part, rng, w, d, h = 4.2) {
  pbox(part, 'concrete_dark', w, 0.5, d, [0, h, 0]);
  for (const [sx, sz, sw, rot] of [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
    if (!rng.chance(0.82)) continue;
    const inset = 0.16;
    pbox(part, 'glass_shop', sw * 0.9, h - 1.2, 0.1, [sx * (1 - inset / 3), (h - 1.2) / 2 + 0.3, sz * (1 - inset / 3)], [0, rot, 0]);
    pbox(part, 'shop_glow', sw * 0.82, 0.18, 0.14, [sx, h - 0.75, sz], [0, rot, 0]);
    if (rng.chance(0.5)) {
      const aw = rng.pick(['awning_a', 'awning_b', 'awning_c', 'awning_d']);
      pbox(part, aw, sw * 0.5, 0.08, 1.5, [sx + (rot ? 0 : rng.range(-w * 0.2, w * 0.2)), h - 0.45, sz * 1.05], [rot ? 0 : -0.24, rot, rot ? -0.24 : 0]);
    }
  }
}

/** vertical neon accent strips up the corners */
function neonStrips(part, rng, w, d, h, count = 2) {
  for (let i = 0; i < count; i++) {
    const col = rng.pick(NEONS);
    const side = rng.int(0, 3);
    const y0 = rng.range(6, Math.max(8, h * 0.35));
    const len = rng.range(h * 0.2, h * 0.62);
    const t = [
      side === 0 ? w / 2 + 0.12 : side === 1 ? -w / 2 - 0.12 : rng.range(-w * 0.4, w * 0.4),
      Math.min(h - 2, y0 + len / 2),
      side === 2 ? d / 2 + 0.12 : side === 3 ? -d / 2 - 0.12 : rng.range(-d * 0.4, d * 0.4),
    ];
    pbox(part, col, side < 2 ? 0.18 : 0.5, Math.min(len, h - y0 - 1), side < 2 ? 0.5 : 0.18, t);
  }
}

function buildingTower(rng, w, d, h, facade) {
  const p = new Part();
  const concrete = rng.pick(CONCRETES);
  const podium = Math.min(h * 0.18, rng.range(8, 20));
  pbox(p, concrete, w, podium, d, [0, podium / 2, 0]);
  pbox(p, 'concrete_dark', w + 0.5, 0.5, d + 0.5, [0, podium, 0]);
  shopfront(p, rng, w + 0.04, d + 0.04);

  // the first tier keeps the full footprint, so anything attached below
  // `wallUpTo` is guaranteed to sit on a real wall rather than float in the gap
  // a setback would leave.
  let cw = w, cd = d, y = podium;
  let wallUpTo = podium;
  const tiers = rng.int(2, 4);
  const remain = h - podium;
  for (let i = 0; i < tiers; i++) {
    const seg = Math.min(remain - (y - podium), i === tiers - 1 ? remain - (y - podium) : remain / tiers * rng.range(0.9, 1.3));
    if (seg <= 1) break;
    pbox(p, facade, cw, seg, cd, [0, y + seg / 2, 0]);
    // floor slab bands read as storeys from a distance
    pbox(p, concrete, cw + 0.22, 0.3, cd + 0.22, [0, y + seg, 0]);
    y += seg;
    if (i === 0) wallUpTo = y;
    cw *= rng.range(0.82, 0.95); cd *= rng.range(0.82, 0.95);
  }
  parapet(p, concrete, cw + 0.3, cd + 0.3, y, rng.range(0.8, 1.4));
  pbox(p, 'roof_gravel', cw, 0.2, cd, [0, y + 0.1, 0]);
  // mechanical crown + mast + aviation light
  if (rng.chance(0.75)) {
    const mw = cw * rng.range(0.35, 0.6), mh = rng.range(3, 8);
    pbox(p, 'metal_b', mw, mh, mw, [0, y + mh / 2 + 0.2, 0]);
    pcyl(p, 'antenna_metal', 0.12, 0.2, rng.range(6, 18), 6, [0, y + mh + rng.range(3, 9), 0]);
    pbox(p, 'light_red', 0.5, 0.5, 0.5, [0, y + mh + rng.range(6, 18), 0]);
  }
  neonStrips(p, rng, w, d, h, rng.int(1, 3));
  return { part: p, size: [w, h, d], tags: ['building', 'tower'], roofY: y, footprint: [cw, cd], wallUpTo };
}

function buildingSlab(rng, w, d, h, facade) {
  const p = new Part();
  const concrete = rng.pick(CONCRETES);
  pbox(p, concrete, w, 5, d, [0, 2.5, 0]);
  shopfront(p, rng, w + 0.04, d + 0.04);
  pbox(p, facade, w, h - 5, d, [0, (h - 5) / 2 + 5, 0]);
  // service core sticking out of one side
  const core = rng.range(0.16, 0.3);
  pbox(p, concrete, w * core, h * rng.range(0.9, 1.04), d * 0.35, [w * (0.5 - core / 2) * rng.sign(), h * 0.5, -d * 0.32]);
  for (let i = 1; i <= Math.floor((h - 8) / 14); i++) {
    pbox(p, concrete, w + 0.3, 0.35, d + 0.3, [0, 5 + i * 14, 0]);
  }
  parapet(p, concrete, w + 0.3, d + 0.3, h, 1.1);
  pbox(p, 'roof_gravel', w, 0.2, d, [0, h + 0.1, 0]);
  neonStrips(p, rng, w, d, h, rng.int(1, 4));
  return { part: p, size: [w, h, d], tags: ['building', 'slab'], roofY: h, footprint: [w, d], wallUpTo: h };
}

function buildingResidential(rng, w, d, h, facade) {
  const p = new Part();
  const wall = rng.pick(['brick_a', 'brick_b', 'plaster_a', 'plaster_b']);
  pbox(p, wall, w, 4.2, d, [0, 2.1, 0]);
  shopfront(p, rng, w + 0.04, d + 0.04, 4.2);
  pbox(p, facade, w, h - 4.2, d, [0, (h - 4.2) / 2 + 4.2, 0]);
  // balconies
  const floors = Math.floor((h - 6) / 3.2);
  for (let f = 1; f < floors; f++) {
    if (!rng.chance(0.55)) continue;
    const y = 4.2 + f * 3.2;
    const side = rng.int(0, 1) ? 1 : -1;
    pbox(p, 'concrete_b', w * rng.range(0.3, 0.8), 0.18, 1.3, [rng.range(-w * 0.25, w * 0.25), y, side * (d / 2 + 0.6)]);
    pbox(p, 'grate_metal', w * rng.range(0.3, 0.8), 1.0, 0.06, [rng.range(-w * 0.25, w * 0.25), y + 0.55, side * (d / 2 + 1.2)]);
    if (rng.chance(0.3)) pbox(p, rng.pick(['awning_a', 'awning_b', 'awning_c']), 1.6, 0.9, 0.05, [rng.range(-w * 0.3, w * 0.3), y + 0.7, side * (d / 2 + 1.25)]);
  }
  parapet(p, wall, w + 0.2, d + 0.2, h, 0.85);
  pbox(p, 'roof_gravel', w, 0.2, d, [0, h + 0.1, 0]);
  neonStrips(p, rng, w, d, h, rng.int(0, 2));
  return { part: p, size: [w, h, d], tags: ['building', 'residential'], roofY: h, footprint: [w, d], wallUpTo: h };
}

function buildingCorner(rng, w, d, h, facade) {
  const p = new Part();
  const c = Math.min(w, d) * 0.3;
  const outline = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2 - c], [w / 2 - c, d / 2], [-w / 2, d / 2]];
  const body = prism(outline, h - 4.5);
  p.add(facade, projectUV(xf(body, { t: [0, 4.5, 0] }), 1));
  const base = prism(outline, 4.5);
  p.add(rng.pick(CONCRETES), projectUV(base, 1));
  shopfront(p, rng, w + 0.04, d + 0.04, 4.5);
  pbox(p, 'roof_gravel', w * 0.98, 0.22, d * 0.98, [0, h + 0.11, 0]);
  parapet(p, rng.pick(CONCRETES), w, d, h, 1.0);
  neonStrips(p, rng, w, d, h, rng.int(1, 3));
  return { part: p, size: [w, h, d], tags: ['building', 'corner'], roofY: h, footprint: [w * 0.95, d * 0.95], wallUpTo: h };
}

function buildingSlumStack(rng, w, d, h) {
  const p = new Part();
  let y = 0;
  const walls = ['brick_a', 'brick_b', 'plaster_a', 'plaster_b', 'metal_rust_a', 'metal_rust_b'];
  while (y < h - 1) {
    const fh = rng.range(2.6, 3.6);
    const fw = w * rng.range(0.78, 1.0), fd = d * rng.range(0.78, 1.0);
    const ox = rng.range(-w * 0.12, w * 0.12), oz = rng.range(-d * 0.12, d * 0.12);
    pbox(p, rng.pick(walls), fw, fh, fd, [ox, y + fh / 2, oz]);
    if (rng.chance(0.7)) pbox(p, rng.pick(SLUM_FACADES), fw * 0.99, fh * 0.9, fd * 1.002, [ox, y + fh / 2, oz]);
    if (rng.chance(0.45)) pbox(p, 'metal_rust_b', fw * 1.2, 0.12, 1.4, [ox, y + fh, oz + fd / 2 + 0.6], [rng.range(-0.12, 0.12), 0, 0]);
    if (rng.chance(0.4)) pbox(p, rng.pick(NEONS), 0.16, rng.range(1.2, 2.4), 0.4, [ox + fw / 2 + 0.1, y + fh * 0.6, oz + rng.range(-fd * 0.3, fd * 0.3)]);
    y += fh;
  }
  pbox(p, 'metal_rust_a', w * 1.05, 0.14, d * 1.05, [0, y, 0], [0, 0, rng.range(-0.03, 0.03)]);
  return { part: p, size: [w, y, d], tags: ['building', 'slum'], roofY: y, footprint: [w * 0.9, d * 0.9], wallUpTo: y * 0.8 };
}

function buildingWarehouse(rng, w, d, h) {
  const p = new Part();
  pbox(p, 'metal_rust_a', w, h, d, [0, h / 2, 0]);
  pbox(p, 'concrete_d', w + 0.4, 1.2, d + 0.4, [0, 0.6, 0]);
  // sawtooth roof
  const n = Math.max(2, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    pbox(p, 'metal_b', w / n, 1.8, d, [x, h + 0.9, 0], [0, 0, 0.22]);
    pbox(p, 'glass_dark', w / n * 0.8, 1.2, d * 0.98, [x + w / n * 0.3, h + 1.3, 0], [0, 0, 0.22]);
  }
  pbox(p, 'light_white', w * 0.6, 0.3, 0.3, [0, h * 0.75, d / 2 + 0.2]);
  return { part: p, size: [w, h + 2, d], tags: ['building', 'industrial'], roofY: h, footprint: [w, d], wallUpTo: h };
}

function buildingParking(rng, w, d, h) {
  const p = new Part();
  const decks = Math.max(3, Math.round(h / 3.4));
  for (let i = 0; i < decks; i++) {
    const y = i * 3.4;
    pbox(p, 'concrete_b', w, 0.35, d, [0, y, 0]);
    // open sides with bands
    pbox(p, 'concrete_d', w, 1.0, 0.3, [0, y + 1.2, d / 2]);
    pbox(p, 'concrete_d', w, 1.0, 0.3, [0, y + 1.2, -d / 2]);
    pbox(p, 'concrete_d', 0.3, 1.0, d, [w / 2, y + 1.2, 0]);
    pbox(p, 'concrete_d', 0.3, 1.0, d, [-w / 2, y + 1.2, 0]);
    if (i % 2 === 0) pbox(p, 'light_white', w * 0.7, 0.12, 0.12, [0, y + 2.9, 0]);
  }
  pbox(p, 'concrete_b', w, 0.4, d, [0, decks * 3.4, 0]);
  pbox(p, 'concrete_a', 1.6, decks * 3.4, 1.6, [w / 2 - 1.2, decks * 1.7, -d / 2 + 1.2]);
  return { part: p, size: [w, decks * 3.4, d], tags: ['building', 'parking'], roofY: decks * 3.4, footprint: [w, d], wallUpTo: decks * 3.4 };
}

/* ======================================================= Facade_Details */

function acUnit(rng, s = 1) {
  const p = new Part();
  pbox(p, 'metal_a', 1.1 * s, 0.85 * s, 0.7 * s, [0, 0.425 * s, 0]);
  pbox(p, 'grate_metal', 0.85 * s, 0.6 * s, 0.05, [0, 0.45 * s, 0.37 * s]);
  pbox(p, 'metal_b', 1.2 * s, 0.1, 0.12, [0, 0.02, 0.1]);
  return { part: p, size: [1.2 * s, 0.9 * s, 0.8 * s], tags: ['facade', 'ac'], anchor: 'wall' };
}
function acBank(rng, n = 3) {
  const p = new Part();
  for (let i = 0; i < n; i++) {
    const y = i * 1.0;
    pbox(p, 'metal_a', 1.1, 0.85, 0.7, [0, y + 0.42, 0]);
    pbox(p, 'grate_metal', 0.85, 0.6, 0.05, [0, y + 0.45, 0.37]);
  }
  pbox(p, 'pipe_metal', 0.08, n * 1.0, 0.08, [0.6, n * 0.5, -0.2]);
  return { part: p, size: [1.2, n, 0.8], tags: ['facade', 'ac'], anchor: 'wall' };
}
function pipeRun(rng, len, vertical = true, n = 2) {
  const p = new Part();
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 0.32;
    if (vertical) pcyl(p, 'pipe_metal', 0.11, 0.11, len, 8, [off, len / 2, 0]);
    else pcyl(p, 'pipe_metal', 0.11, 0.11, len, 8, [0, off, 0], [0, 0, Math.PI / 2]);
    for (let b = 1; b < Math.floor(len / 3); b++) {
      const t = vertical ? [off, b * 3, -0.12] : [-len / 2 + b * 3, off, -0.12];
      pbox(p, 'metal_b', vertical ? 0.3 : 0.12, vertical ? 0.12 : 0.3, 0.2, t);
    }
  }
  return { part: p, size: vertical ? [0.5, len, 0.4] : [len, 0.5, 0.4], tags: ['facade', 'pipe'], anchor: 'wall' };
}
function balcony(rng, w) {
  const p = new Part();
  pbox(p, 'concrete_b', w, 0.16, 1.4, [0, 0, 0.7]);
  pbox(p, 'grate_metal', w, 1.05, 0.05, [0, 0.55, 1.38]);
  if (rng.chance(0.5)) pbox(p, 'plastic_dark', 0.5, 0.6, 0.5, [rng.range(-w * 0.3, w * 0.3), 0.38, 0.6]);
  return { part: p, size: [w, 1.2, 1.5], tags: ['facade', 'balcony'], anchor: 'wall' };
}
function wallSign(rng, w, h, mat) {
  const p = new Part();
  pbox(p, 'metal_b', w + 0.2, h + 0.2, 0.18, [0, 0, 0]);
  pbox(p, mat, w, h, 0.08, [0, 0, 0.14]);
  return { part: p, size: [w, h, 0.3], tags: ['facade', 'sign'], anchor: 'wall' };
}
function neonVertical(rng, h) {
  const p = new Part();
  const col = rng.pick(NEONS);
  pbox(p, 'metal_b', 0.9, h, 0.16, [0, 0, 0]);
  pbox(p, col, 0.72, h - 0.3, 0.1, [0, 0, 0.13]);
  pbox(p, rng.pick(NEONS), 0.2, h - 0.3, 0.06, [0.42, 0, 0.16]);
  pbox(p, 'metal_a', 0.2, 0.2, 0.7, [0, h / 2 - 0.4, -0.4]);
  return { part: p, size: [1.0, h, 0.7], tags: ['facade', 'neon', 'sign'], anchor: 'wall' };
}
function neonHorizontal(rng, w) {
  const p = new Part();
  pbox(p, 'metal_b', w, 1.3, 0.16, [0, 0, 0]);
  pbox(p, rng.pick(NEONS), w - 0.2, 0.9, 0.1, [0, 0.1, 0.14]);
  pbox(p, rng.pick(NEONS), w * 0.8, 0.12, 0.08, [0, -0.45, 0.15]);
  return { part: p, size: [w, 1.4, 0.4], tags: ['facade', 'neon', 'sign'], anchor: 'wall' };
}
function fireEscape(rng, floors) {
  const p = new Part();
  for (let i = 0; i < floors; i++) {
    const y = i * 3.2;
    pbox(p, 'grate_metal', 2.6, 0.1, 1.2, [0, y, 0.6]);
    pbox(p, 'grate_metal', 2.6, 0.95, 0.05, [0, y + 0.5, 1.18]);
    if (i === 0) { pbox(p, 'metal_rust_b', 0.1, floors * 3.2, 0.1, [1.3, floors * 1.6, 1.1]); pbox(p, 'metal_rust_b', 0.1, floors * 3.2, 0.1, [-1.3, floors * 1.6, 1.1]); }
    if (i < floors - 1) pbox(p, 'grate_metal', 0.9, 0.08, 3.3, [0.8, y + 1.6, 0.6], [0.78, 0, 0]);
  }
  return { part: p, size: [2.8, floors * 3.2, 1.4], tags: ['facade', 'escape'], anchor: 'wall', climbable: true };
}
function drainpipe(rng, h) {
  const p = new Part();
  pcyl(p, 'metal_rust_b', 0.09, 0.09, h, 7, [0, h / 2, 0]);
  for (let b = 1; b < h / 4; b++) pbox(p, 'metal_b', 0.26, 0.1, 0.16, [0, b * 4, -0.1]);
  return { part: p, size: [0.3, h, 0.3], tags: ['facade', 'pipe'], anchor: 'wall' };
}
function cableBundle(rng, len) {
  const p = new Part();
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const sag = rng.range(0.6, 2.0);
    const seg = 4;
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg, t1 = (s + 1) / seg;
      const y0 = -4 * sag * t0 * (1 - t0), y1 = -4 * sag * t1 * (1 - t1);
      const x0 = t0 * len, x1 = t1 * len;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const l = Math.hypot(x1 - x0, y1 - y0);
      pcyl(p, 'catenary', 0.035, 0.035, l, 4, [mx - len / 2, my + (i - n / 2) * 0.1, (i % 3) * 0.12], [0, 0, Math.PI / 2 - Math.atan2(y1 - y0, x1 - x0)]);
    }
  }
  return { part: p, size: [len, 2.5, 0.5], tags: ['facade', 'cable'], collide: false };
}
function wallLight(rng) {
  const p = new Part();
  pbox(p, 'metal_b', 0.28, 0.2, 0.4, [0, 0, 0.2]);
  pbox(p, rng.pick(['light_warm', 'light_white', 'light_amber']), 0.22, 0.12, 0.1, [0, -0.08, 0.38]);
  return { part: p, size: [0.3, 0.3, 0.5], tags: ['facade', 'light'], anchor: 'wall', collide: false };
}
function windowBox(rng) {
  const p = new Part();
  pbox(p, 'concrete_b', 1.0, 0.3, 0.35, [0, 0, 0.18]);
  pbox(p, 'plastic_dark', 0.9, 0.25, 0.25, [0, 0.2, 0.18]);
  return { part: p, size: [1, 0.5, 0.4], tags: ['facade'], anchor: 'wall', collide: false };
}
function laundryLine(rng, len) {
  const p = new Part();
  pcyl(p, 'catenary', 0.02, 0.02, len, 4, [0, 0, 0], [0, 0, Math.PI / 2]);
  const n = rng.int(3, 7);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    pbox(p, rng.pick(['awning_a', 'awning_b', 'awning_c', 'awning_d', 'cloth_white']), rng.range(0.4, 0.8), rng.range(0.5, 1.0), 0.03, [x, -rng.range(0.3, 0.6), 0]);
  }
  return { part: p, size: [len, 1.4, 0.2], tags: ['facade'], collide: false };
}

/* ============================================================== Modules */

function roofEquip(rng, seedScale = 1) {
  const p = new Part();
  const n = rng.int(2, 5);
  for (let i = 0; i < n; i++) {
    const w = rng.range(1.2, 3.4) * seedScale, h = rng.range(0.8, 2.2) * seedScale, d = rng.range(1.2, 2.8) * seedScale;
    const x = rng.range(-4, 4) * seedScale, z = rng.range(-4, 4) * seedScale;
    pbox(p, rng.pick(['metal_a', 'metal_b', 'metal_rust_a']), w, h, d, [x, h / 2, z]);
    if (rng.chance(0.45)) pcyl(p, 'metal_c', w * 0.3, w * 0.3, 0.2, 8, [x, h + 0.1, z]);
    if (rng.chance(0.4)) pcyl(p, 'pipe_metal', 0.1, 0.1, rng.range(1, 3), 6, [x + w * 0.4, h + 1, z]);
  }
  if (rng.chance(0.5)) pbox(p, 'light_red', 0.4, 0.4, 0.4, [rng.range(-3, 3), 2.4, rng.range(-3, 3)]);
  return { part: p, size: [10 * seedScale, 3 * seedScale, 10 * seedScale], tags: ['module', 'roof'], anchor: 'roof' };
}
function stairHut(rng) {
  const p = new Part();
  pbox(p, 'concrete_b', 3.4, 2.8, 3.0, [0, 1.4, 0]);
  pbox(p, 'concrete_dark', 3.7, 0.2, 3.3, [0, 2.9, 0]);
  pbox(p, 'metal_b', 1.1, 2.1, 0.1, [0, 1.05, 1.52]);
  pbox(p, 'light_warm', 0.5, 0.12, 0.1, [0, 2.3, 1.55]);
  return { part: p, size: [3.7, 3, 3.3], tags: ['module', 'roof'], anchor: 'roof' };
}
function coolingTower(rng, s = 1) {
  const p = new Part();
  pcyl(p, 'metal_b', 1.6 * s, 1.8 * s, 3.2 * s, 12, [0, 1.6 * s, 0]);
  pcyl(p, 'grate_metal', 1.5 * s, 1.5 * s, 0.4 * s, 12, [0, 3.4 * s, 0]);
  pbox(p, 'metal_a', 0.6 * s, 0.9 * s, 0.6 * s, [1.6 * s, 0.45 * s, 0]);
  return { part: p, size: [3.8 * s, 3.8 * s, 3.8 * s], tags: ['module', 'roof'], anchor: 'roof' };
}
function billboardFrame(rng, w, h, mat) {
  const p = new Part();
  pbox(p, 'metal_b', w + 0.5, h + 0.5, 0.3, [0, h / 2 + 1.2, 0]);
  pbox(p, mat, w, h, 0.12, [0, h / 2 + 1.2, 0.22]);
  pbox(p, 'metal_rust_b', 0.35, h * 0.5 + 1.2, 0.35, [-w * 0.3, (h * 0.5 + 1.2) / 2, -0.4]);
  pbox(p, 'metal_rust_b', 0.35, h * 0.5 + 1.2, 0.35, [w * 0.3, (h * 0.5 + 1.2) / 2, -0.4]);
  pbox(p, 'metal_b', w * 0.8, 0.14, 0.9, [0, 0.9, 0.7]);
  for (let i = 0; i < 4; i++) pbox(p, 'light_white', 0.22, 0.16, 0.16, [-w * 0.35 + i * w * 0.23, 1.0, 1.1]);
  return { part: p, size: [w + 1, h + 1.6, 1.4], tags: ['module', 'ad', 'billboard'], anchor: 'roof' };
}
function catwalk(rng, len) {
  const p = new Part();
  pbox(p, 'grate_metal', len, 0.12, 1.5, [0, 0, 0]);
  pbox(p, 'grate_metal', len, 1.0, 0.06, [0, 0.55, 0.74]);
  pbox(p, 'grate_metal', len, 1.0, 0.06, [0, 0.55, -0.74]);
  for (let i = 0; i <= Math.floor(len / 4); i++) pbox(p, 'metal_rust_b', 0.14, 1.0, 0.14, [-len / 2 + i * 4, 0.5, 0.74]);
  return { part: p, size: [len, 1.2, 1.6], tags: ['module', 'platform'], platform: true };
}
function ladder(rng, h) {
  const p = new Part();
  pcyl(p, 'metal_rust_b', 0.05, 0.05, h, 5, [-0.28, h / 2, 0]);
  pcyl(p, 'metal_rust_b', 0.05, 0.05, h, 5, [0.28, h / 2, 0]);
  for (let i = 0; i < h / 0.55; i++) pcyl(p, 'metal_rust_b', 0.035, 0.035, 0.56, 4, [0, i * 0.55 + 0.28, 0], [0, 0, Math.PI / 2]);
  return { part: p, size: [0.7, h, 0.2], tags: ['module', 'ladder'], collide: false };
}
function railing(rng, len, mat = 'grate_metal') {
  const p = new Part();
  pbox(p, mat, len, 0.08, 0.08, [0, 1.05, 0]);
  pbox(p, mat, len, 0.06, 0.06, [0, 0.55, 0]);
  for (let i = 0; i <= Math.floor(len / 2); i++) pbox(p, mat, 0.08, 1.1, 0.08, [-len / 2 + i * 2, 0.55, 0]);
  return { part: p, size: [len, 1.15, 0.15], tags: ['module', 'railing'], collide: false };
}
function platformSlab(rng, w, d, thick = 0.4, mat = 'concrete_b') {
  const p = new Part();
  pbox(p, mat, w, thick, d, [0, -thick / 2, 0]);
  pbox(p, 'metal_rust_b', w, 0.1, 0.1, [0, -thick - 0.05, d / 2 - 0.1]);
  pbox(p, 'metal_rust_b', w, 0.1, 0.1, [0, -thick - 0.05, -d / 2 + 0.1]);
  return { part: p, size: [w, thick, d], tags: ['module', 'platform'], platform: true };
}
function scaffold(rng, w, h, d) {
  const p = new Part();
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    pcyl(p, 'metal_rust_b', 0.07, 0.07, h, 6, [x, h / 2, z]);
  }
  for (let lvl = 1; lvl * 3.3 < h; lvl++) {
    const y = lvl * 3.3;
    pbox(p, 'wood_a', w, 0.1, d, [0, y, 0]);
    pbox(p, 'metal_rust_b', w, 0.06, 0.06, [0, y + 1.0, d / 2]);
    pbox(p, 'metal_rust_b', w, 0.06, 0.06, [0, y + 1.0, -d / 2]);
  }
  if (rng.chance(0.5)) pbox(p, rng.pick(['awning_a', 'awning_b']), w, h * 0.6, 0.04, [0, h * 0.5, d / 2 + 0.1]);
  return { part: p, size: [w, h, d], tags: ['module', 'scaffold'], platform: true };
}
function walkwayBridge(rng, len) {
  const p = new Part();
  pbox(p, 'grate_metal', len, 0.16, 2.0, [0, 0, 0]);
  pbox(p, 'metal_b', len, 1.1, 0.08, [0, 0.6, 1.0]);
  pbox(p, 'metal_b', len, 1.1, 0.08, [0, 0.6, -1.0]);
  for (let i = 0; i <= Math.floor(len / 5); i++) {
    pbox(p, 'metal_rust_b', 0.14, 1.2, 0.14, [-len / 2 + i * 5, 0.6, 1.0]);
    pbox(p, 'metal_rust_b', 0.14, 1.2, 0.14, [-len / 2 + i * 5, 0.6, -1.0]);
  }
  if (rng.chance(0.6)) pbox(p, rng.pick(NEONS), len * 0.9, 0.1, 0.1, [0, -0.16, 0.9]);
  return { part: p, size: [len, 1.3, 2.1], tags: ['module', 'platform', 'bridge'], platform: true };
}
function stairFlight(rng, rise, run) {
  const p = new Part();
  const steps = Math.max(4, Math.round(rise / 0.22));
  for (let i = 0; i < steps; i++) {
    pbox(p, 'concrete_b', 1.6, 0.2, run / steps + 0.06, [0, i * (rise / steps) + 0.1, -run / 2 + (i + 0.5) * (run / steps)]);
  }
  pbox(p, 'grate_metal', 0.06, 1.0, run, [0.8, rise * 0.5 + 0.6, 0], [-Math.atan2(rise, run), 0, 0]);
  return { part: p, size: [1.7, rise, run], tags: ['module', 'stairs'], platform: true };
}
function waterTank(rng, s = 1) {
  const p = new Part();
  pcyl(p, 'wood_a', 1.5 * s, 1.5 * s, 2.6 * s, 9, [0, 3.4 * s, 0]);
  
  pbox(p, 'metal_rust_b', 0.14, 2.2 * s, 0.14, [1.0 * s, 1.1 * s, 1.0 * s]);
  pbox(p, 'metal_rust_b', 0.14, 2.2 * s, 0.14, [-1.0 * s, 1.1 * s, 1.0 * s]);
  pbox(p, 'metal_rust_b', 0.14, 2.2 * s, 0.14, [1.0 * s, 1.1 * s, -1.0 * s]);
  pbox(p, 'metal_rust_b', 0.14, 2.2 * s, 0.14, [-1.0 * s, 1.1 * s, -1.0 * s]);
  p.add('metal_rust_a', projectUV(xf(cone(1.6 * s, 0.8 * s, 9), { t: [0, 4.5 * s, 0] }), 1));
  return { part: p, size: [3.2 * s, 5 * s, 3.2 * s], tags: ['module', 'roof', 'tank'], anchor: 'roof' };
}
function crateStack(rng) {
  const p = new Part();
  const n = rng.int(2, 6);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.7, 1.3);
    pbox(p, rng.pick(['wood_a', 'plastic_dark', 'metal_rust_a']), s, s, s, [rng.range(-0.8, 0.8), i * s * 0.9 + s / 2, rng.range(-0.8, 0.8)], [0, rng.range(-0.5, 0.5), 0]);
  }
  return { part: p, size: [2.4, n * 1.1, 2.4], tags: ['module', 'prop'] };
}
function helipad(rng) {
  const p = new Part();
  pcyl(p, 'concrete_dark', 6, 6, 0.3, 20, [0, 0.15, 0]);
  pcyl(p, 'light_white', 5.4, 5.4, 0.06, 20, [0, 0.33, 0]);
  pcyl(p, 'concrete_b', 5.0, 5.0, 0.08, 20, [0, 0.36, 0]);
  for (let i = 0; i < 8; i++) pbox(p, 'light_red', 0.3, 0.14, 0.3, [Math.cos(i / 8 * 6.283) * 5.7, 0.4, Math.sin(i / 8 * 6.283) * 5.7]);
  return { part: p, size: [12, 0.5, 12], tags: ['module', 'roof'], anchor: 'roof', platform: true };
}
function ventStack(rng, h) {
  const p = new Part();
  pcyl(p, 'metal_b', 0.45, 0.5, h, 10, [0, h / 2, 0]);
  pcyl(p, 'metal_a', 0.6, 0.6, 0.25, 10, [0, h, 0]);
  pbox(p, 'metal_rust_b', 0.14, h * 0.6, 0.14, [0.6, h * 0.3, 0]);
  return { part: p, size: [1.2, h + 0.4, 1.2], tags: ['module', 'roof'], anchor: 'roof' };
}

/* =============================================================== Street */

function roadSegment(rng, w, len) {
  const p = new Part();
  pbox(p, rng.chance(0.3) ? 'asphalt_wet' : 'asphalt_a', w, 0.3, len, [0, -0.15, 0]);
  return { part: p, size: [w, 0.3, len], tags: ['street', 'road'], platform: true };
}
function sidewalkSegment(rng, w, len) {
  const p = new Part();
  pbox(p, 'sidewalk_a', w, 0.28, len, [0, 0.14, 0]);
  pbox(p, 'concrete_d', 0.22, 0.34, len, [w / 2 - 0.11, 0.17, 0]);
  return { part: p, size: [w, 0.3, len], tags: ['street', 'sidewalk'], platform: true };
}
function streetLamp(rng, h, style = 0) {
  const p = new Part();
  pcyl(p, 'metal_b', 0.1, 0.16, h, 6, [0, h / 2, 0]);
  if (style === 0) {
    pcyl(p, 'metal_b', 0.08, 0.08, 1.6, 6, [0.8, h, 0], [0, 0, Math.PI / 2]);
    pbox(p, 'light_warm', 0.5, 0.18, 0.28, [1.5, h - 0.1, 0]);
  } else {
    pbox(p, 'light_white', 0.4, 0.2, 0.4, [0, h + 0.1, 0]);
    pcyl(p, 'metal_b', 0.3, 0.3, 0.1, 8, [0, h + 0.25, 0]);
  }
  if (rng.chance(0.4)) pbox(p, rng.pick(NEONS), 0.35, 1.2, 0.08, [0.2, h * 0.62, 0]);
  if (rng.chance(0.3)) pbox(p, 'sign_plate_1', 0.9, 0.35, 0.05, [0.5, h * 0.75, 0]);
  return { part: p, size: [2, h + 0.4, 0.6], tags: ['street', 'lamp'] };
}
function trafficLight(rng) {
  const p = new Part();
  pcyl(p, 'metal_b', 0.11, 0.15, 5.2, 8, [0, 2.6, 0]);
  pcyl(p, 'metal_b', 0.09, 0.09, 2.4, 6, [1.2, 5.2, 0], [0, 0, Math.PI / 2]);
  pbox(p, 'plastic_dark', 0.3, 0.9, 0.3, [2.3, 4.9, 0]);
  pbox(p, 'light_red', 0.16, 0.16, 0.06, [2.3, 5.2, 0.17]);
  pbox(p, 'light_amber', 0.16, 0.16, 0.06, [2.3, 4.9, 0.17]);
  pbox(p, 'light_white', 0.16, 0.16, 0.06, [2.3, 4.6, 0.17]);
  return { part: p, size: [2.6, 5.4, 0.5], tags: ['street', 'traffic'] };
}
function vendingMachine(rng, i) {
  const p = new Part();
  pbox(p, 'metal_a', 1.1, 1.9, 0.75, [0, 0.95, 0]);
  pbox(p, `ad_screen_${(i % 8) + 1}`, 0.95, 1.3, 0.06, [0, 1.15, 0.39]);
  pbox(p, rng.pick(NEONS), 1.0, 0.12, 0.08, [0, 1.88, 0.36]);
  pbox(p, 'plastic_dark', 0.9, 0.3, 0.1, [0, 0.32, 0.39]);
  return { part: p, size: [1.2, 2, 0.85], tags: ['street', 'vending'] };
}
function noodleStall(rng) {
  const p = new Part();
  pbox(p, 'metal_rust_a', 3.2, 1.1, 1.8, [0, 0.55, 0]);
  pbox(p, 'metal_a', 3.4, 0.1, 2.0, [0, 1.15, 0]);
  for (const x of [-1.5, 1.5]) { pcyl(p, 'metal_rust_b', 0.06, 0.06, 2.4, 5, [x, 1.2, -0.8]); pcyl(p, 'metal_rust_b', 0.06, 0.06, 2.4, 5, [x, 1.2, 0.8]); }
  pbox(p, rng.pick(['awning_a', 'awning_b', 'awning_c', 'awning_d']), 3.8, 0.08, 2.6, [0, 2.4, 0]);
  pbox(p, rng.pick(NEONS), 2.6, 0.5, 0.08, [0, 2.1, 1.2]);
  pbox(p, 'light_warm', 2.4, 0.1, 0.1, [0, 2.3, 0]);
  for (let i = 0; i < 3; i++) { pcyl(p, 'plastic_dark', 0.22, 0.2, 0.6, 7, [-1 + i, 0.3, 1.4]); }
  return { part: p, size: [3.9, 2.5, 2.7], tags: ['street', 'stall'] };
}
function dumpster(rng) {
  const p = new Part();
  pbox(p, rng.pick(['metal_rust_a', 'metal_rust_b']), 2.2, 1.2, 1.2, [0, 0.6, 0]);
  pbox(p, 'metal_b', 2.25, 0.1, 1.25, [0, 1.25, 0], [rng.range(-0.1, 0.1), 0, 0]);
  for (const x of [-0.9, 0.9]) pcyl(p, 'rubber_tyre', 0.15, 0.15, 0.1, 7, [x, 0.15, 0.5], [Math.PI / 2, 0, 0]);
  return { part: p, size: [2.3, 1.4, 1.3], tags: ['street', 'prop'] };
}
function barrier(rng, w) {
  const p = new Part();
  pbox(p, 'concrete_c', w, 0.9, 0.5, [0, 0.45, 0]);
  pbox(p, 'light_amber', 0.2, 0.12, 0.12, [0, 1.0, 0]);
  return { part: p, size: [w, 1.05, 0.6], tags: ['street', 'prop'] };
}
function utilityBox(rng, s) {
  const p = new Part();
  pbox(p, 'metal_a', 0.9 * s, 1.3 * s, 0.6 * s, [0, 0.65 * s, 0]);
  pbox(p, 'grate_metal', 0.7 * s, 0.4 * s, 0.04, [0, 0.95 * s, 0.31 * s]);
  pbox(p, 'decal_grime', 0.85 * s, 1.2 * s, 0.02, [0, 0.65 * s, -0.31 * s]);
  return { part: p, size: [1 * s, 1.4 * s, 0.7 * s], tags: ['street', 'prop'] };
}
function cablePole(rng, h) {
  const p = new Part();
  pcyl(p, 'wood_a', 0.16, 0.22, h, 7, [0, h / 2, 0]);
  for (let i = 0; i < 3; i++) pbox(p, 'wood_a', 2.2 - i * 0.4, 0.12, 0.12, [0, h - 0.6 - i * 0.9, 0]);
  for (let i = 0; i < 4; i++) pbox(p, 'plastic_dark', 0.14, 0.2, 0.14, [-0.9 + i * 0.6, h - 0.45, 0]);
  if (rng.chance(0.5)) pbox(p, 'metal_a', 0.6, 0.7, 0.6, [0.35, h * 0.55, 0]);
  return { part: p, size: [2.4, h, 0.6], tags: ['street', 'pole'] };
}
function phoneBooth(rng) {
  const p = new Part();
  pbox(p, 'metal_a', 1.0, 2.3, 1.0, [0, 1.15, 0]);
  pbox(p, 'glass_shop', 0.85, 1.7, 0.05, [0, 1.3, 0.5]);
  pbox(p, rng.pick(NEONS), 0.95, 0.22, 0.08, [0, 2.32, 0.42]);
  pbox(p, 'light_white', 0.6, 0.06, 0.6, [0, 2.2, 0]);
  return { part: p, size: [1.1, 2.4, 1.1], tags: ['street', 'prop'] };
}
function busStop(rng) {
  const p = new Part();
  pbox(p, 'metal_b', 4.2, 0.12, 1.6, [0, 2.6, 0]);
  for (const x of [-2, 2]) pcyl(p, 'metal_b', 0.08, 0.08, 2.6, 6, [x, 1.3, -0.7]);
  pbox(p, 'glass_shop', 4.0, 1.8, 0.06, [0, 1.5, -0.78]);
  pbox(p, `ad_screen_${rng.int(1, 8)}`, 1.1, 1.7, 0.08, [1.6, 1.5, 0.7]);
  pbox(p, 'wood_a', 3.2, 0.1, 0.45, [0, 0.55, 0]);
  pbox(p, 'light_white', 3.2, 0.08, 0.2, [0, 2.5, 0]);
  return { part: p, size: [4.4, 2.8, 1.8], tags: ['street', 'prop'] };
}
function fenceSegment(rng, len, h = 2.2) {
  const p = new Part();
  pbox(p, 'grate_metal', len, h, 0.06, [0, h / 2, 0]);
  for (let i = 0; i <= Math.floor(len / 2.5); i++) pbox(p, 'metal_rust_b', 0.1, h + 0.15, 0.1, [-len / 2 + i * 2.5, (h + 0.15) / 2, 0]);
  return { part: p, size: [len, h, 0.2], tags: ['street', 'fence'] };
}
function kiosk(rng, i) {
  const p = new Part();
  pbox(p, 'metal_a', 2.4, 2.6, 2.0, [0, 1.3, 0]);
  pbox(p, 'glass_shop', 2.0, 1.1, 0.06, [0, 1.6, 1.01]);
  pbox(p, `sign_plate_${(i % 6) + 1}`, 2.2, 0.55, 0.06, [0, 2.4, 1.02]);
  pbox(p, 'light_warm', 1.8, 0.1, 0.1, [0, 2.05, 1.0]);
  pbox(p, rng.pick(NEONS), 0.14, 2.2, 0.14, [1.22, 1.3, 1.0]);
  return { part: p, size: [2.5, 2.7, 2.1], tags: ['street', 'kiosk'] };
}
function overpassPillar(rng, h) {
  const p = new Part();
  pbox(p, 'concrete_b', 2.2, h, 2.2, [0, h / 2, 0]);
  pbox(p, 'concrete_d', 3.2, 0.6, 3.2, [0, h + 0.3, 0]);
  pbox(p, 'decal_grime', 2.25, h * 0.5, 0.02, [0, h * 0.3, 1.12]);
  return { part: p, size: [3.2, h + 0.6, 3.2], tags: ['street', 'pillar'] };
}
function elevatedRoad(rng, len, w = 14) {
  const p = new Part();
  pbox(p, 'asphalt_a', w, 0.45, len, [0, -0.22, 0]);
  pbox(p, 'concrete_b', w + 1.2, 0.9, len, [0, -0.85, 0]);
  pbox(p, 'concrete_c', 0.5, 1.2, len, [w / 2, 0.35, 0]);
  pbox(p, 'concrete_c', 0.5, 1.2, len, [-w / 2, 0.35, 0]);
  pbox(p, 'light_amber', 0.16, 0.1, len * 0.96, [w / 2 - 0.4, 0.95, 0]);
  pbox(p, 'light_amber', 0.16, 0.1, len * 0.96, [-w / 2 + 0.4, 0.95, 0]);
  return { part: p, size: [w + 1.2, 2.2, len], tags: ['street', 'elevated'], platform: true };
}
function stairsDown(rng) {
  const p = new Part();
  pbox(p, 'concrete_b', 4.0, 0.4, 1.2, [0, -0.2, -2.6]);
  for (let i = 0; i < 12; i++) pbox(p, 'concrete_b', 4.0, 0.22, 0.45, [0, -i * 0.22 - 0.11, -2 + i * 0.45]);
  pbox(p, 'grate_metal', 0.1, 1.1, 5.4, [2.0, -0.6, 0.6]);
  pbox(p, 'grate_metal', 0.1, 1.1, 5.4, [-2.0, -0.6, 0.6]);
  pbox(p, 'sign_plate_2', 2.0, 0.5, 0.06, [0, 0.9, -3.1]);
  return { part: p, size: [4.2, 3, 6], tags: ['street', 'metro-entry'], platform: true };
}

/* ================================================================ Metro */

function railSegment(rng, len) {
  const p = new Part();
  for (const x of [-0.72, 0.72]) {
    pbox(p, 'rail_steel', 0.14, 0.16, len, [x, 0.08, 0]);
  }
  for (let i = 0; i < len / 1.4; i++) pbox(p, 'sleeper_concrete', 2.4, 0.16, 0.3, [0, -0.04, -len / 2 + i * 1.4 + 0.7]);
  pbox(p, 'concrete_d', 3.4, 0.3, len, [0, -0.25, 0]);
  return { part: p, size: [3.4, 0.4, len], tags: ['metro', 'rail'], platform: true };
}
function metroPlatform(rng, len, w = 6) {
  const p = new Part();
  pbox(p, 'tile_metro', w, 1.1, len, [0, -0.55, 0]);
  pbox(p, 'concrete_d', w, 0.15, len, [0, 0.07, 0]);
  pbox(p, 'light_amber', 0.2, 0.06, len * 0.98, [w / 2 - 0.3, 0.16, 0]);
  for (let i = 0; i < len / 8; i++) {
    pbox(p, 'light_white', w * 0.6, 0.12, 0.5, [0, 3.4, -len / 2 + i * 8 + 4]);
    pcyl(p, 'metal_b', 0.16, 0.16, 3.4, 8, [w / 2 - 0.8, 1.7, -len / 2 + i * 8 + 4]);
  }
  return { part: p, size: [w, 1.2, len], tags: ['metro', 'platform'], platform: true };
}
function metroColumn(rng, h) {
  const p = new Part();
  pbox(p, 'tile_metro', 0.9, h, 0.9, [0, h / 2, 0]);
  pbox(p, 'metal_b', 1.2, 0.3, 1.2, [0, h - 0.15, 0]);
  pbox(p, 'sign_plate_3', 0.85, 0.5, 0.05, [0, h * 0.7, 0.47]);
  return { part: p, size: [1.2, h, 1.2], tags: ['metro', 'column'] };
}
function tunnelArc(rng, len, r = 6) {
  const p = new Part();
  const seg = 9;
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    const am = (a0 + a1) / 2;
    const chord = 2 * r * Math.sin((a1 - a0) / 2);
    pbox(p, 'concrete_dark', 0.5, chord + 0.05, len, [Math.cos(am) * r, Math.sin(am) * r, 0], [0, 0, am - Math.PI / 2]);
  }
  pbox(p, 'concrete_dark', r * 2.2, 0.4, len, [0, -0.2, 0]);
  return { part: p, size: [r * 2.2, r, len], tags: ['metro', 'tunnel'], platform: true };
}
function stationCanopy(rng, len) {
  const p = new Part();
  pbox(p, 'metal_b', 9, 0.25, len, [0, 4.6, 0]);
  pbox(p, 'glass_dark', 8.4, 0.08, len * 0.96, [0, 4.45, 0]);
  for (let i = 0; i < len / 7; i++) {
    for (const x of [-4, 4]) pcyl(p, 'metal_b', 0.16, 0.2, 4.5, 8, [x, 2.25, -len / 2 + i * 7 + 3.5]);
  }
  pbox(p, 'light_white', 8, 0.1, 0.3, [0, 4.3, 0]);
  pbox(p, 'sign_plate_4', 5, 0.9, 0.08, [0, 5.3, 0]);
  return { part: p, size: [9, 5.8, len], tags: ['metro', 'canopy'], platform: true };
}
function trainCar(rng) {
  const p = new Part();
  pbox(p, 'metal_c', 2.9, 3.0, 17, [0, 1.9, 0]);
  pbox(p, 'glass_dark', 2.95, 1.1, 15, [0, 2.5, 0]);
  pbox(p, rng.pick(NEONS), 2.6, 0.14, 16, [0, 0.55, 0]);
  pbox(p, 'light_white', 1.6, 0.4, 0.2, [0, 2.2, 8.6]);
  pbox(p, 'plastic_dark', 2.6, 0.5, 16.5, [0, 0.3, 0]);
  return { part: p, size: [3, 3.6, 17], tags: ['metro', 'train'], platform: true };
}
function escalator(rng, rise) {
  const p = new Part();
  const run = rise * 1.9;
  pbox(p, 'metal_a', 2.2, 0.5, Math.hypot(rise, run), [0, rise / 2, 0], [-Math.atan2(rise, run), 0, 0]);
  pbox(p, 'glass_dark', 0.06, 1.0, Math.hypot(rise, run), [1.05, rise / 2 + 0.6, 0], [-Math.atan2(rise, run), 0, 0]);
  pbox(p, 'glass_dark', 0.06, 1.0, Math.hypot(rise, run), [-1.05, rise / 2 + 0.6, 0], [-Math.atan2(rise, run), 0, 0]);
  pbox(p, 'light_white', 1.8, 0.06, run * 0.9, [0, rise / 2 + 0.1, 0], [-Math.atan2(rise, run), 0, 0]);
  return { part: p, size: [2.3, rise, run], tags: ['metro', 'escalator'], platform: true };
}
function turnstile(rng) {
  const p = new Part();
  for (let i = 0; i < 3; i++) {
    pbox(p, 'metal_a', 0.35, 1.0, 1.4, [i * 1.2 - 1.2, 0.5, 0]);
    pbox(p, 'light_white', 0.2, 0.06, 0.2, [i * 1.2 - 1.2, 1.02, 0.4]);
  }
  return { part: p, size: [3.2, 1.1, 1.5], tags: ['metro', 'prop'] };
}
function tunnelLight(rng) {
  const p = new Part();
  pbox(p, 'metal_b', 0.3, 0.22, 1.4, [0, 0, 0]);
  pbox(p, 'light_warm', 0.2, 0.1, 1.2, [0, -0.13, 0]);
  return { part: p, size: [0.35, 0.3, 1.5], tags: ['metro', 'light'], collide: false };
}

/* ================================================================== Car */

function car(rng, kind, bodyMat) {
  const p = new Part();
  const L = { sedan: 4.4, taxi: 4.6, van: 5.2, truck: 7.4, bus: 10.5, bike: 2.0 }[kind] || 4.4;
  const W = kind === 'bike' ? 0.8 : kind === 'bus' || kind === 'truck' ? 2.5 : 1.9;
  const H = { sedan: 0.75, taxi: 0.8, van: 1.15, truck: 1.5, bus: 1.7, bike: 0.5 }[kind] || 0.8;
  if (kind === 'bike') {
    pbox(p, bodyMat, W, 0.5, L * 0.7, [0, 0.7, 0]);
    for (const z of [-0.7, 0.7]) pcyl(p, 'rubber_tyre', 0.34, 0.34, 0.14, 8, [0, 0.34, z], [0, 0, Math.PI / 2]);
    pbox(p, 'car_light_front', 0.2, 0.2, 0.1, [0, 0.9, 1.0]);
  } else {
    pbox(p, bodyMat, W, H, L, [0, H / 2 + 0.34, 0]);
    const cabinL = kind === 'truck' ? L * 0.34 : L * 0.56;
    const cabinZ = kind === 'truck' ? L * 0.3 : 0;
    pbox(p, bodyMat, W * 0.94, H * 0.72, cabinL, [0, H + 0.34 + H * 0.3, cabinZ]);
    pbox(p, 'car_glass', W * 0.96, H * 0.5, cabinL * 0.92, [0, H + 0.42 + H * 0.3, cabinZ]);
    pbox(p, 'car_light_front', W * 0.8, 0.2, 0.1, [0, H * 0.7 + 0.34, L / 2]);
    pbox(p, 'car_light_rear', W * 0.8, 0.16, 0.1, [0, H * 0.7 + 0.34, -L / 2]);
    const wheelZ = L * 0.32;
    for (const z of [-wheelZ, wheelZ]) for (const x of [-W / 2, W / 2]) {
      pcyl(p, 'rubber_tyre', 0.36, 0.36, 0.22, 8, [x, 0.36, z], [0, 0, Math.PI / 2]);
    }
    if (kind === 'taxi') pbox(p, 'light_amber', 0.7, 0.2, 0.3, [0, H * 1.75 + 0.42, cabinZ]);
    
  }
  return { part: p, size: [W + 0.4, kind === 'bike' ? 1.1 : H * 2.2, L], tags: ['car'] };
}

/* ============================================================= Decals */

function decalQuad(rng, w, h, mat, rot = 0) {
  const p = new Part();
  const g = plane(w, h);
  g.rotateX(-Math.PI / 2);
  if (rot) g.rotateY(rot);
  p.add(mat, projectUV(g, 1));
  return { part: p, size: [w, 0.02, h], tags: ['decal'], collide: false, decal: true };
}
function wallDecal(rng, w, h, mat) {
  const p = new Part();
  const g = plane(w, h);
  p.add(mat, projectUV(g, 1));
  return { part: p, size: [w, h, 0.02], tags: ['decal'], collide: false, decal: true };
}

/* ======================================================== Environment */

function cloudBillboard(rng, s) {
  const p = new Part();
  const g = plane(s, s * 0.55);
  p.add('cloud_billboard', projectUV(g, 1 / s));
  return { part: p, size: [s, s * 0.55, 0.1], tags: ['env', 'cloud'], collide: false, billboard: true };
}
function pylon(rng, h) {
  const p = new Part();
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    pcyl(p, 'antenna_metal', 0.12, 0.18, h, 5, [x * 0.5, h / 2, z * 0.5], [x > 0 ? -0.02 : 0.02, 0, z > 0 ? -0.02 : 0.02]);
  }
  for (let i = 1; i < h / 5; i++) {
    pbox(p, 'antenna_metal', 2.4, 0.1, 0.1, [0, i * 5, -1.2]);
    pbox(p, 'antenna_metal', 2.4, 0.1, 0.1, [0, i * 5, 1.2]);
    pbox(p, 'antenna_metal', 0.1, 0.1, 2.4, [-1.2, i * 5, 0]);
    pbox(p, 'antenna_metal', 0.1, 0.1, 2.4, [1.2, i * 5, 0]);
  }
  pbox(p, 'light_red', 0.4, 0.4, 0.4, [0, h + 0.3, 0]);
  return { part: p, size: [3, h + 0.6, 3], tags: ['env', 'pylon'] };
}
function bridgeSpan(rng, len) {
  const p = new Part();
  pbox(p, 'concrete_b', 12, 0.8, len, [0, -0.4, 0]);
  pbox(p, 'asphalt_a', 11, 0.2, len, [0, 0.1, 0]);
  for (let i = 0; i <= len / 10; i++) {
    const z = -len / 2 + i * 10;
    pbox(p, 'metal_b', 0.3, 7, 0.3, [5.6, 3.5, z]);
    pbox(p, 'metal_b', 0.3, 7, 0.3, [-5.6, 3.5, z]);
  }
  pbox(p, 'metal_b', 0.2, 0.2, len, [5.6, 7, 0]);
  pbox(p, 'metal_b', 0.2, 0.2, len, [-5.6, 7, 0]);
  pbox(p, 'light_amber', 0.2, 0.1, len * 0.98, [5.2, 0.4, 0]);
  return { part: p, size: [12, 7.5, len], tags: ['env', 'bridge'], platform: true };
}
function deadTree(rng) {
  const p = new Part();
  pcyl(p, 'wood_a', 0.16, 0.3, 4.5, 6, [0, 2.25, 0]);
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, 6.28);
    pcyl(p, 'wood_a', 0.05, 0.1, 2.0, 4, [Math.cos(a) * 0.6, 3.6 + rng.range(-0.5, 0.8), Math.sin(a) * 0.6], [rng.range(-0.7, 0.7), a, rng.range(-0.7, 0.7)]);
  }
  return { part: p, size: [2.4, 5, 2.4], tags: ['env', 'tree'] };
}
function smokestack(rng, h) {
  const p = new Part();
  pcyl(p, 'brick_b', 1.4, 2.2, h, 12, [0, h / 2, 0]);
  pcyl(p, 'metal_rust_b', 1.5, 1.5, 0.4, 12, [0, h, 0]);
  for (let i = 0; i < 3; i++) pbox(p, 'light_red', 0.3, 0.3, 0.3, [0, h * (0.5 + i * 0.2), 1.6]);
  return { part: p, size: [4.4, h + 0.4, 4.4], tags: ['env', 'stack'] };
}
function gantry(rng, w) {
  const p = new Part();
  pbox(p, 'metal_b', w, 0.5, 0.5, [0, 8, 0]);
  pbox(p, 'metal_b', w, 0.3, 0.3, [0, 7.2, 0]);
  for (const x of [-w / 2 + 0.5, w / 2 - 0.5]) pbox(p, 'metal_b', 0.45, 8, 0.45, [x, 4, 0]);
  for (let i = 0; i < 4; i++) pbox(p, `ad_screen_${rng.int(1, 8)}`, w * 0.2, 1.6, 0.1, [-w * 0.3 + i * w * 0.2, 6.4, 0.2]);
  pbox(p, 'light_white', w * 0.9, 0.12, 0.3, [0, 7.0, 0.3]);
  return { part: p, size: [w, 8.5, 1], tags: ['env', 'gantry'], platform: true };
}

/* ========================================================== Background */

function skylineSlab(rng, w, h, d, mat) {
  const p = new Part();
  const g = box(w, h, d);
  p.add(mat, projectUV(xf(g, { t: [0, h / 2, 0] }), 1));
  // a hint of window emission so the far skyline still reads as a city
  if (rng.chance(0.75)) {
    pbox(p, rng.pick(['facade_tower_a', 'facade_tower_b', 'facade_res_a']), w * 0.995, h * 0.96, d * 0.995, [0, h / 2, 0]);
  }
  if (rng.chance(0.4)) pbox(p, 'light_red', Math.min(4, w * 0.1), 1.5, Math.min(4, d * 0.1), [0, h + 0.8, 0]);
  return { part: p, size: [w, h, d], tags: ['background'], collide: false };
}

/* ====================================================== library assembly */

export function buildPrefabs() {
  const cats = {
    Background: [], Car: [], Combined_Building: [], Decals: [], Environment: [],
    Facade_Details: [], Metro: [], Modules: [], Street: [],
  };
  let uid = 0;
  const push = (cat, name, def) => {
    cats[cat].push({ id: `${cat}/${name}`, index: uid++, name, ...def });
  };

  /* ---- Combined_Building: 132 prefabs across the size catalogue -------- */
  const rng = new RNG(20260921);
  const towerSizes = [[16, 70], [18, 96], [20, 128], [22, 160], [24, 196], [26, 240], [30, 118], [34, 150], [40, 92], [46, 66], [19, 212], [28, 174]];
  towerSizes.forEach(([w, h], i) => {
    for (let v = 0; v < 3; v++) {
      const facade = v === 0 ? rng.pick(GLASS_FACADES) : rng.pick(TOWER_FACADES);
      push('Combined_Building', `tower_${w}x${h}_${v}`, buildingTower(rng, w, w * rng.range(0.8, 1.15), h * rng.range(0.92, 1.08), facade));
    }
  });
  const slabSizes = [[24, 46], [30, 58], [36, 72], [44, 88], [52, 40], [60, 54], [28, 110], [34, 132]];
  slabSizes.forEach(([w, h]) => {
    for (let v = 0; v < 3; v++) push('Combined_Building', `slab_${w}x${h}_${v}`, buildingSlab(rng, w, w * rng.range(0.5, 0.8), h * rng.range(0.9, 1.1), rng.pick([...TOWER_FACADES, ...GLASS_FACADES])));
  });
  const resSizes = [[14, 18], [16, 24], [18, 30], [20, 38], [22, 46], [26, 28], [30, 34], [12, 22], [24, 56], [28, 64], [15, 42], [21, 26]];
  resSizes.forEach(([w, h]) => {
    for (let v = 0; v < 3; v++) push('Combined_Building', `res_${w}x${h}_${v}`, buildingResidential(rng, w, w * rng.range(0.7, 1.2), h * rng.range(0.9, 1.12), rng.pick(RES_FACADES)));
  });
  [[18, 34], [22, 44], [26, 58], [30, 76], [34, 96]].forEach(([w, h]) => {
    for (let v = 0; v < 2; v++) push('Combined_Building', `corner_${w}x${h}_${v}`, buildingCorner(rng, w, w * rng.range(0.85, 1.1), h * rng.range(0.9, 1.1), rng.pick([...TOWER_FACADES, ...RES_FACADES])));
  });
  [[8, 9], [10, 12], [12, 15], [9, 18], [11, 22], [14, 10], [7, 13], [13, 20]].forEach(([w, h]) => {
    for (let v = 0; v < 3; v++) push('Combined_Building', `slum_${w}x${h}_${v}`, buildingSlumStack(rng, w, w * rng.range(0.7, 1.2), h));
  });
  [[26, 9], [34, 12], [44, 14], [56, 11]].forEach(([w, h]) => {
    for (let v = 0; v < 2; v++) push('Combined_Building', `warehouse_${w}x${h}_${v}`, buildingWarehouse(rng, w, h, w * rng.range(0.55, 0.85)));
  });
  [[28, 17], [34, 24], [40, 31]].forEach(([w, h]) => {
    for (let v = 0; v < 2; v++) push('Combined_Building', `parking_${w}x${h}_${v}`, buildingParking(rng, w, w * rng.range(0.6, 0.9), h));
  });

  /* ---- Facade_Details: 88 ---------------------------------------------- */
  [0.8, 1.0, 1.3].forEach((s, i) => push('Facade_Details', `ac_unit_${i}`, acUnit(rng, s)));
  [2, 3, 4, 5].forEach((n) => push('Facade_Details', `ac_bank_${n}`, acBank(rng, n)));
  for (const len of [6, 10, 16, 24, 34]) { push('Facade_Details', `pipe_v_${len}`, pipeRun(rng, len, true, 2)); push('Facade_Details', `pipe_v3_${len}`, pipeRun(rng, len, true, 3)); }
  for (const len of [6, 10, 16]) push('Facade_Details', `pipe_h_${len}`, pipeRun(rng, len, false, 2));
  [2.4, 3.2, 4.4, 6.0].forEach((w) => push('Facade_Details', `balcony_${w}`, balcony(rng, w)));
  for (let i = 1; i <= 6; i++) push('Facade_Details', `wall_sign_s_${i}`, wallSign(rng, 2.2, 1.2, `sign_plate_${i}`));
  for (let i = 1; i <= 8; i++) push('Facade_Details', `wall_ad_${i}`, wallSign(rng, rng.range(5, 9), rng.range(3, 7), `ad_screen_${i}`));
  for (const h of [3, 5, 7, 9, 12]) push('Facade_Details', `neon_v_${h}`, neonVertical(rng, h));
  for (const w of [3, 5, 8, 12]) push('Facade_Details', `neon_h_${w}`, neonHorizontal(rng, w));
  for (const f of [3, 5, 7, 9]) push('Facade_Details', `fire_escape_${f}`, fireEscape(rng, f));
  for (const h of [8, 14, 22, 32]) push('Facade_Details', `drainpipe_${h}`, drainpipe(rng, h));
  for (const l of [14, 22, 32, 44]) push('Facade_Details', `cables_${l}`, cableBundle(rng, l));
  for (let i = 0; i < 3; i++) push('Facade_Details', `wall_light_${i}`, wallLight(rng));
  for (let i = 0; i < 3; i++) push('Facade_Details', `window_box_${i}`, windowBox(rng));
  for (const l of [4, 7, 10]) push('Facade_Details', `laundry_${l}`, laundryLine(rng, l));
  for (const s of [1, 1.4, 1.9]) push('Facade_Details', `vent_${s}`, ventStack(rng, 1.6 * s));
  for (let i = 0; i < 4; i++) {
    const p = new Part();
    pcyl(p, 'metal_a', 0.9, 0.9, 0.25, 12, [0, 0, 0], [Math.PI / 2 * 0.72, rng.range(-0.5, 0.5), 0]);
    pcyl(p, 'metal_b', 0.12, 0.12, 0.8, 6, [0, 0.1, 0.35]);
    pbox(p, 'metal_b', 0.3, 0.6, 0.3, [0, -0.6, 0]);
    push('Facade_Details', `satellite_${i}`, { part: p, size: [1.9, 1.6, 1.4], tags: ['facade'], anchor: 'wall', collide: false });
  }
  for (const h of [4, 7, 11]) {
    const p = new Part();
    pcyl(p, 'antenna_metal', 0.05, 0.09, h, 5, [0, h / 2, 0]);
    for (let i = 0; i < 4; i++) pbox(p, 'antenna_metal', 0.9 - i * 0.15, 0.04, 0.04, [0, h * (0.5 + i * 0.12), 0]);
    push('Facade_Details', `antenna_${h}`, { part: p, size: [1, h, 0.4], tags: ['facade'], anchor: 'roof', collide: false });
  }
  for (const w of [2.5, 4, 6, 9]) {
    const p = new Part();
    pbox(p, rng.pick(['awning_a', 'awning_b', 'awning_c', 'awning_d']), w, 0.1, 2.0, [0, 0, 1.0], [-0.26, 0, 0]);
    pbox(p, 'metal_rust_b', 0.08, 0.08, 2.0, [w / 2 - 0.1, -0.1, 1.0], [-0.26, 0, 0]);
    pbox(p, 'metal_rust_b', 0.08, 0.08, 2.0, [-w / 2 + 0.1, -0.1, 1.0], [-0.26, 0, 0]);
    push('Facade_Details', `awning_${w}`, { part: p, size: [w, 0.8, 2.2], tags: ['facade', 'awning'], anchor: 'wall', awning: true });
  }
  for (let i = 0; i < 5; i++) {
    const p = new Part();
    pbox(p, 'grate_metal', 1.4, 1.0, 0.1, [0, 0, 0]);
    pbox(p, 'metal_b', 1.6, 1.2, 0.08, [0, 0, -0.06]);
    push('Facade_Details', `vent_grille_${i}`, { part: p, size: [1.6, 1.2, 0.2], tags: ['facade'], anchor: 'wall', collide: false });
  }
  for (let i = 0; i < 5; i++) {
    const p = new Part();
    pbox(p, 'plastic_dark', 0.5, 0.7, 0.3, [0, 0, 0.15]);
    pcyl(p, 'catenary', 0.04, 0.04, 2.2, 4, [0.1, -1.4, 0.1]);
    push('Facade_Details', `conduit_box_${i}`, { part: p, size: [0.6, 2.6, 0.4], tags: ['facade'], anchor: 'wall', collide: false });
  }
  for (const h of [2.5, 4, 6]) {
    const p = new Part();
    pbox(p, 'concrete_b', 1.2, 0.3, h, [0, 0, h / 2]);
    pbox(p, 'concrete_d', 1.3, 0.12, 0.3, [0, 0.2, h]);
    push('Facade_Details', `ledge_${h}`, { part: p, size: [1.3, 0.4, h], tags: ['facade', 'ledge'], anchor: 'wall', platform: true });
  }

  /* ---- Modules: 88 ----------------------------------------------------- */
  for (let i = 0; i < 8; i++) push('Modules', `roof_equip_${i}`, roofEquip(rng, 0.7 + i * 0.12));
  for (let i = 0; i < 3; i++) push('Modules', `stair_hut_${i}`, stairHut(rng));
  for (const s of [0.8, 1.1, 1.5]) push('Modules', `cooling_${s}`, coolingTower(rng, s));
  for (let i = 1; i <= 8; i++) push('Modules', `billboard_${i}`, billboardFrame(rng, rng.range(9, 20), rng.range(5, 11), `ad_screen_${i}`));
  for (const l of [6, 10, 16, 24]) push('Modules', `catwalk_${l}`, catwalk(rng, l));
  for (const h of [4, 7, 11, 16]) push('Modules', `ladder_${h}`, ladder(rng, h));
  for (const l of [4, 8, 14, 20]) push('Modules', `railing_${l}`, railing(rng, l));
  for (const [w, d] of [[8, 6], [12, 8], [16, 10], [22, 14], [6, 4], [10, 20], [26, 18], [30, 24]]) {
    push('Modules', `platform_${w}x${d}`, platformSlab(rng, w, d, 0.45, rng.pick(['concrete_b', 'concrete_d', 'metal_rust_a'])));
  }
  for (const [w, h, d] of [[6, 8, 4], [8, 12, 5], [10, 18, 6], [5, 24, 4]]) push('Modules', `scaffold_${w}x${h}`, scaffold(rng, w, h, d));
  for (const l of [10, 16, 24, 34]) push('Modules', `walkway_${l}`, walkwayBridge(rng, l));
  for (const [r, run] of [[2.6, 4], [4, 6], [6, 9], [9, 13]]) push('Modules', `stairs_${r}`, stairFlight(rng, r, run));
  for (const s of [0.8, 1.1, 1.4]) push('Modules', `water_tank_${s}`, waterTank(rng, s));
  for (let i = 0; i < 5; i++) push('Modules', `crates_${i}`, crateStack(rng));
  push('Modules', 'helipad', helipad(rng));
  for (const h of [2, 3.5, 5]) push('Modules', `vent_stack_${h}`, ventStack(rng, h));
  for (let i = 0; i < 4; i++) {
    const p = new Part();
    pbox(p, 'metal_b', 3.2, 0.25, 2.2, [0, 0, 0]);
    pbox(p, 'plastic_dark', 3.0, 0.06, 2.0, [0, 0.16, 0]);
    push('Modules', `solar_${i}`, { part: p, size: [3.4, 0.5, 2.4], tags: ['module', 'roof'], anchor: 'roof', collide: false });
  }
  for (let i = 0; i < 4; i++) {
    const p = new Part();
    pbox(p, 'metal_rust_a', 2.4, 1.8, 1.6, [0, 0.9, 0]);
    pbox(p, 'grate_metal', 2.2, 1.4, 0.05, [0, 1.0, 0.82]);
    pbox(p, 'metal_rust_b', 2.6, 0.12, 1.8, [0, 1.85, 0], [0, 0, 0.06]);
    push('Modules', `coop_${i}`, { part: p, size: [2.6, 2, 1.8], tags: ['module', 'roof'], anchor: 'roof' });
  }
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    pbox(p, 'metal_b', 5.5, 0.2, 5.5, [0, 2.6, 0]);
    for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) pcyl(p, 'metal_b', 0.12, 0.12, 2.6, 6, [x, 1.3, z]);
    pbox(p, rng.pick(NEONS), 4.8, 0.12, 0.12, [0, 2.8, 2.6]);
    for (let t = 0; t < 3; t++) { pcyl(p, 'plastic_dark', 0.5, 0.45, 0.1, 10, [rng.range(-2, 2), 0.75, rng.range(-2, 2)]); }
    push('Modules', `roof_bar_${i}`, { part: p, size: [5.8, 3, 5.8], tags: ['module', 'roof'], anchor: 'roof', platform: true });
  }

  /* ---- Street: 96 ------------------------------------------------------ */
  for (const w of [10, 14, 18, 24]) for (const len of [40, 80]) push('Street', `road_${w}x${len}`, roadSegment(rng, w, len));
  for (const w of [3, 4.5, 6]) for (const len of [40, 80]) push('Street', `sidewalk_${w}x${len}`, sidewalkSegment(rng, w, len));
  for (const w of [18, 24]) {
    const p = new Part();
    pbox(p, 'asphalt_a', w, 0.3, w, [0, -0.15, 0]);
    push('Street', `intersection_${w}`, { part: p, size: [w, 0.3, w], tags: ['street', 'road'], platform: true });
  }
  // Ground for the inside of a city block. Without this the yards between
  // buildings are open holes and anything that walks into one falls out of
  // the world.
  for (const [w, mat] of [[92, 'concrete_c'], [92, 'asphalt_a'], [92, 'concrete_b']]) {
    const p = new Part();
    pbox(p, mat, w, 0.3, w, [0, -0.15, 0]);
    push('Street', `block_ground_${mat}`, { part: p, size: [w, 0.3, w], tags: ['street', 'ground'], platform: true });
  }
  for (const h of [5, 7, 9]) { push('Street', `lamp_a_${h}`, streetLamp(rng, h, 0)); push('Street', `lamp_b_${h}`, streetLamp(rng, h, 1)); }
  for (let i = 0; i < 2; i++) push('Street', `traffic_light_${i}`, trafficLight(rng));
  for (let i = 0; i < 8; i++) push('Street', `vending_${i}`, vendingMachine(rng, i));
  for (let i = 0; i < 4; i++) push('Street', `stall_${i}`, noodleStall(rng));
  for (let i = 0; i < 3; i++) push('Street', `dumpster_${i}`, dumpster(rng));
  for (const w of [2, 3.5, 6]) push('Street', `barrier_${w}`, barrier(rng, w));
  for (const s of [0.8, 1, 1.3]) push('Street', `utility_box_${s}`, utilityBox(rng, s));
  for (const h of [7, 9, 12]) push('Street', `cable_pole_${h}`, cablePole(rng, h));
  for (let i = 0; i < 2; i++) push('Street', `phone_booth_${i}`, phoneBooth(rng));
  for (let i = 0; i < 2; i++) push('Street', `bus_stop_${i}`, busStop(rng));
  for (const l of [4, 8, 14, 20]) push('Street', `fence_${l}`, fenceSegment(rng, l));
  for (let i = 0; i < 4; i++) push('Street', `kiosk_${i}`, kiosk(rng, i));
  for (const h of [8, 12, 17, 23]) push('Street', `pillar_${h}`, overpassPillar(rng, h));
  for (const l of [40, 60, 80]) { push('Street', `elevated_${l}`, elevatedRoad(rng, l, 14)); push('Street', `elevated_wide_${l}`, elevatedRoad(rng, l, 20)); }
  for (let i = 0; i < 3; i++) push('Street', `stairs_down_${i}`, stairsDown(rng));
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    pcyl(p, 'metal_b', 0.12, 0.14, 1.0, 8, [0, 0.5, 0]);
    pbox(p, 'light_amber', 0.16, 0.16, 0.16, [0, 1.05, 0]);
    push('Street', `bollard_${i}`, { part: p, size: [0.3, 1.1, 0.3], tags: ['street', 'prop'], collide: false });
  }
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    pbox(p, 'wood_a', 1.8, 0.1, 0.5, [0, 0.45, 0]);
    pbox(p, 'metal_rust_b', 0.1, 0.45, 0.45, [0.8, 0.22, 0]);
    pbox(p, 'metal_rust_b', 0.1, 0.45, 0.45, [-0.8, 0.22, 0]);
    push('Street', `bench_${i}`, { part: p, size: [1.9, 0.6, 0.6], tags: ['street', 'prop'] });
  }
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    pcyl(p, 'metal_rust_a', 0.35, 0.3, 1.0, 9, [0, 0.5, 0]);
    pcyl(p, 'metal_b', 0.37, 0.37, 0.08, 9, [0, 1.02, 0]);
    push('Street', `trash_${i}`, { part: p, size: [0.8, 1.1, 0.8], tags: ['street', 'prop'], collide: false });
  }
  for (const [w, h] of [[2.4, 3.6], [3.4, 5.2], [4.6, 7.0]]) {
    const p = new Part();
    pcyl(p, 'metal_b', 0.14, 0.18, h, 8, [0, h / 2, 0]);
    pbox(p, `ad_screen_${rng.int(1, 8)}`, w, h * 0.5, 0.14, [0, h * 0.72, 0]);
    pbox(p, 'metal_b', w + 0.2, h * 0.5 + 0.2, 0.2, [0, h * 0.72, -0.08]);
    push('Street', `sign_pole_${w}`, { part: p, size: [w + 0.4, h + 0.4, 0.6], tags: ['street', 'sign'] });
  }
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    pbox(p, 'concrete_c', 2.6, 0.9, 1.4, [0, 0.45, 0]);
    pbox(p, 'plaster_a', 2.2, 0.5, 1.0, [0, 1.1, 0]);
    for (let j = 0; j < 4; j++) pcyl(p, 'awning_d', 0.12, 0.1, 0.9, 5, [-0.8 + j * 0.55, 1.6, rng.range(-0.3, 0.3)]);
    push('Street', `planter_${i}`, { part: p, size: [2.7, 2.2, 1.5], tags: ['street', 'prop'] });
  }

  for (let i = 0; i < 4; i++) {
    const p = new Part();
    pbox(p, 'grate_metal', 1.0, 0.08, 0.6, [0, 0, 0]);
    push('Street', `gutter_grate_${i}`, { part: p, size: [1.0, 0.1, 0.6], tags: ['street', 'prop'], collide: false, decal: true });
  }
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    pcyl(p, 'light_red', 0.16, 0.2, 0.8, 8, [0, 0.4, 0]);
    pcyl(p, 'metal_b', 0.1, 0.1, 0.4, 6, [0.2, 0.6, 0], [0, 0, Math.PI / 2]);
    push('Street', `hydrant_${i}`, { part: p, size: [0.5, 0.9, 0.4], tags: ['street', 'prop'], collide: false });
  }
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    for (let j = 0; j < 4; j++) { pcyl(p, 'metal_b', 0.05, 0.05, 0.9, 5, [-0.9 + j * 0.6, 0.45, 0]); pcyl(p, 'metal_b', 0.05, 0.05, 0.6, 5, [-0.9 + j * 0.6, 0.9, 0], [Math.PI / 2, 0, 0]); }
    push('Street', `bike_rack_${i}`, { part: p, size: [2.0, 1.0, 0.7], tags: ['street', 'prop'], collide: false });
  }

  /* ---- Metro: 46 ------------------------------------------------------- */
  for (const l of [40, 80, 120]) push('Metro', `rail_${l}`, railSegment(rng, l));
  for (const l of [40, 80]) for (const w of [6, 9]) push('Metro', `platform_${l}x${w}`, metroPlatform(rng, l, w));
  for (const h of [5, 7, 9, 12]) push('Metro', `column_${h}`, metroColumn(rng, h));
  for (const l of [40, 80]) for (const r of [6, 8]) push('Metro', `tunnel_${l}x${r}`, tunnelArc(rng, l, r));
  for (const l of [30, 50, 70]) push('Metro', `canopy_${l}`, stationCanopy(rng, l));
  for (let i = 0; i < 3; i++) push('Metro', `train_${i}`, trainCar(rng));
  for (const r of [4, 6, 8]) push('Metro', `escalator_${r}`, escalator(rng, r));
  for (let i = 0; i < 2; i++) push('Metro', `turnstile_${i}`, turnstile(rng));
  for (let i = 0; i < 4; i++) push('Metro', `tunnel_light_${i}`, tunnelLight(rng));
  for (const r of [3, 5, 8, 12]) push('Metro', `stair_${r}`, stairFlight(rng, r, r * 1.5));
  for (let i = 0; i < 4; i++) {
    const p = new Part();
    pbox(p, 'tile_metro', 24, 8, 0.6, [0, 4, 0]);
    pbox(p, 'sign_plate_' + ((i % 6) + 1), 6, 1.6, 0.1, [rng.range(-6, 6), 5.5, 0.36]);
    pbox(p, 'light_white', 20, 0.16, 0.2, [0, 7.4, 0.35]);
    push('Metro', `tunnel_wall_${i}`, { part: p, size: [24, 8, 0.7], tags: ['metro', 'wall'] });
  }
  for (const h of [10, 16, 24]) {
    const p = new Part();
    pbox(p, 'concrete_dark', 5, h, 5, [0, h / 2, 0]);
    pbox(p, 'grate_metal', 4.4, 0.2, 4.4, [0, h, 0]);
    push('Metro', `vent_shaft_${h}`, { part: p, size: [5, h, 5], tags: ['metro', 'shaft'] });
  }
  for (let i = 0; i < 3; i++) {
    const p = new Part();
    pbox(p, 'metal_b', 0.4, 2.6, 0.4, [0, 1.3, 0]);
    pbox(p, 'light_red', 0.3, 0.3, 0.14, [0, 2.4, 0.2]);
    pbox(p, 'light_white', 0.3, 0.3, 0.14, [0, 2.0, 0.2]);
    push('Metro', `signal_${i}`, { part: p, size: [0.5, 2.8, 0.5], tags: ['metro', 'prop'] });
  }

  /* ---- Car: 16 --------------------------------------------------------- */
  const carBodies = ['car_body_a', 'car_body_b', 'car_body_c', 'car_body_d', 'car_body_e', 'car_body_f'];
  ['sedan', 'sedan', 'taxi', 'van', 'truck', 'bus', 'bike'].forEach((kind, i) => {
    push('Car', `${kind}_${i}`, car(rng, kind, carBodies[i % carBodies.length]));
  });
  carBodies.forEach((m, i) => push('Car', `sedan_c${i}`, car(rng, 'sedan', m)));
  push('Car', 'van_b', car(rng, 'van', 'car_body_c'));
  push('Car', 'truck_b', car(rng, 'truck', 'car_body_e'));
  push('Car', 'bike_b', car(rng, 'bike', 'car_body_a'));

  /* ---- Decals: 42 ------------------------------------------------------ */
  for (const [w, h] of [[8, 40], [10, 60], [14, 80], [18, 40]]) push('Decals', `road_lines_${w}x${h}`, decalQuad(rng, w, h, 'decal_road_lines'));
  for (let i = 0; i < 4; i++) push('Decals', `crosswalk_${i}`, decalQuad(rng, 12, 4 + i, 'decal_road_lines', Math.PI / 2));
  for (const s of [2, 3, 5, 8]) push('Decals', `stain_${s}`, decalQuad(rng, s, s, 'decal_grime'));
  for (const [w, h] of [[3, 5], [5, 8], [8, 12], [12, 18], [16, 26], [6, 14]]) push('Decals', `wall_grime_${w}x${h}`, wallDecal(rng, w, h, 'decal_grime'));
  for (let i = 1; i <= 6; i++) push('Decals', `plate_${i}`, wallDecal(rng, 3.5, 1.6, `sign_plate_${i}`));
  for (let i = 1; i <= 8; i++) push('Decals', `ad_flat_${i}`, wallDecal(rng, rng.range(7, 16), rng.range(4, 10), `ad_screen_${i}`));
  for (const s of [3, 5, 7]) push('Decals', `puddle_${s}`, decalQuad(rng, s, s * 0.7, 'decal_grime'));
  for (let i = 0; i < 3; i++) push('Decals', `hazard_${i}`, decalQuad(rng, 6, 1.2, 'decal_road_lines'));
  for (let i = 0; i < 4; i++) push('Decals', `arrow_${i}`, decalQuad(rng, 3, 6, 'decal_road_lines'));

  /* ---- Environment: 56 ------------------------------------------------- */
  for (const s of [60, 110, 180, 260, 360, 480]) push('Environment', `cloud_${s}`, cloudBillboard(rng, s));
  for (const s of [0.9, 1.2, 1.6]) push('Environment', `water_tank_env_${s}`, waterTank(rng, s));
  for (const l of [40, 60, 90, 130]) push('Environment', `bridge_${l}`, bridgeSpan(rng, l));
  for (const h of [22, 34, 48]) push('Environment', `pylon_${h}`, pylon(rng, h));
  for (let i = 0; i < 4; i++) push('Environment', `tree_${i}`, deadTree(rng));
  for (const h of [26, 38, 52]) push('Environment', `smokestack_${h}`, smokestack(rng, h));
  for (const w of [16, 24, 34]) push('Environment', `gantry_${w}`, gantry(rng, w));
  for (const l of [10, 18, 26]) push('Environment', `pipebridge_${l}`, (() => {
    const p = new Part();
    for (let i = 0; i < 3; i++) pcyl(p, 'pipe_metal', 0.3, 0.3, l, 8, [(i - 1) * 0.8, 0, 0], [0, 0, Math.PI / 2]);
    pbox(p, 'grate_metal', l, 0.1, 2.4, [0, -0.5, 0]);
    for (let i = 0; i <= l / 6; i++) pbox(p, 'metal_rust_b', 0.14, 1.4, 2.4, [-l / 2 + i * 6, -0.1, 0]);
    return { part: p, size: [l, 1.6, 2.6], tags: ['env', 'pipe'], platform: true };
  })());
  for (const [w, d] of [[30, 30], [50, 40], [70, 60], [400, 400]]) push('Environment', `safety_floor_${w}x${d}`, (() => {
    const p = new Part();
    pbox(p, 'safety_floor', w, 0.6, d, [0, -0.3, 0]);
    return { part: p, size: [w, 0.6, d], tags: ['env', 'safety'], platform: true, safetyFloor: true };
  })());
  for (const [w, d] of [[20, 20], [34, 26]]) push('Environment', `water_${w}x${d}`, (() => {
    const p = new Part();
    pbox(p, 'water_dark', w, 0.3, d, [0, -0.15, 0]);
    return { part: p, size: [w, 0.3, d], tags: ['env', 'water'], platform: true };
  })());
  for (const h of [12, 20, 30]) push('Environment', `podium_${h}`, (() => {
    const p = new Part();
    pbox(p, 'podium_concrete', 1, h, 1, [0, -h / 2, 0]);
    return { part: p, size: [1, h, 1], tags: ['env', 'podium'], scalable: true, note: 'auto foundation under floating buildings' };
  })());
  for (let i = 0; i < 6; i++) push('Environment', `rubble_${i}`, (() => {
    const p = new Part();
    for (let j = 0; j < rng.int(4, 9); j++) {
      pbox(p, rng.pick(['concrete_d', 'brick_b', 'metal_rust_b']), rng.range(0.4, 1.6), rng.range(0.3, 0.9), rng.range(0.4, 1.6),
        [rng.range(-2, 2), rng.range(0.1, 0.8), rng.range(-2, 2)], [rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4)]);
    }
    return { part: p, size: [5, 1.5, 5], tags: ['env', 'rubble'], collide: false };
  })());
  for (const w of [12, 20, 30, 44]) push('Environment', `hoarding_${w}`, (() => {
    const p = new Part();
    pbox(p, 'metal_rust_a', w, 3.0, 0.2, [0, 1.5, 0]);
    pbox(p, `ad_screen_${rng.int(1, 8)}`, w * 0.45, 2.2, 0.08, [-w * 0.2, 1.6, 0.16]);
    pbox(p, `ad_screen_${rng.int(1, 8)}`, w * 0.35, 2.0, 0.08, [w * 0.25, 1.5, 0.16]);
    for (let i = 0; i <= w / 4; i++) pbox(p, 'metal_rust_b', 0.14, 3.2, 0.5, [-w / 2 + i * 4, 1.6, -0.2]);
    return { part: p, size: [w, 3.2, 0.7], tags: ['env', 'hoarding'] };
  })());

  for (let i = 0; i < 5; i++) {
    const p = new Part();
    pbox(p, 'concrete_b', 6, 0.5, 4, [0, 0.25, 0]);
    for (let j = 0; j < rng.int(2, 4); j++) {
      pcyl(p, 'awning_d', rng.range(0.3, 0.7), rng.range(0.2, 0.5), rng.range(0.6, 1.6), 5, [rng.range(-2.5, 2.5), 0.9, rng.range(-1.5, 1.5)]);
    }
    push('Environment', `roof_garden_${i}`, { part: p, size: [6.2, 2.4, 4.2], tags: ['env', 'roof'], anchor: 'roof', platform: true });
  }
  for (let i = 0; i < 5; i++) {
    const p = new Part();
    for (let j = 0; j < rng.int(2, 5); j++) pcyl(p, 'brick_b', 0.35, 0.4, rng.range(1.4, 3.0), 8, [rng.range(-1.5, 1.5), rng.range(0.7, 1.5), rng.range(-1.5, 1.5)]);
    push('Environment', `chimneys_${i}`, { part: p, size: [3.5, 3.2, 3.5], tags: ['env', 'roof'], anchor: 'roof' });
  }

  /* ---- Background: 36 -------------------------------------------------- */
  const silhouettes = ['silhouette_a', 'silhouette_b', 'silhouette_c'];
  for (let i = 0; i < 48; i++) {
    const w = rng.range(30, 120), d = rng.range(30, 110), h = rng.range(60, 420);
    push('Background', `skyline_${i}`, skylineSlab(rng, w, h, d, silhouettes[i % 3]));
  }

  return cats;
}
