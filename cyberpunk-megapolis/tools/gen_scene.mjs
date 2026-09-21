/**
 * Lays out the city and writes data/scene.json + data/sign_fixes.json.
 *
 * Placements are authored in SOURCE space (the left-handed space a Unity ->
 * Blender -> glTF export lands in). The runtime converts every placement with
 * position (-x, y, z), quaternion (x, -y, -z, w), scale unchanged, and checks
 * the landmark table below to prove the whole city was not mirrored.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RNG } from './lib/rng.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const prefabDoc = JSON.parse(fs.readFileSync(path.join(DATA, 'prefabs.json'), 'utf8'));
const P = prefabDoc.prefabs;
const rng = new RNG(0x5EEDCAFE);

/* ------------------------------------------------------------- prefab sets */
const byTag = (tag, cat) => Object.entries(P)
  .filter(([id, d]) => d.tags.includes(tag) && (!cat || d.cat === cat))
  .map(([id]) => id);

const SETS = {
  tower: byTag('tower'), slab: byTag('slab'), res: byTag('residential'),
  corner: byTag('corner'), slum: byTag('slum'), industrial: byTag('industrial'),
  parking: byTag('parking'),
  ac: byTag('ac'), pipe: byTag('pipe', 'Facade_Details'), balcony: byTag('balcony'),
  facadeSign: byTag('sign', 'Facade_Details'), neonFacade: byTag('neon'),
  escape: byTag('escape'), awning: byTag('awning'), ledge: byTag('ledge'),
  roofMod: byTag('roof', 'Modules'), billboard: byTag('billboard'),
  platform: byTag('platform', 'Modules'), scaffold: byTag('scaffold'),
  railing: byTag('railing'), ladderMod: byTag('ladder', 'Modules'),
  road: byTag('road'), sidewalk: byTag('sidewalk'), lamp: byTag('lamp'),
  traffic: byTag('traffic'), vending: byTag('vending'), stall: byTag('stall'),
  streetProp: byTag('prop', 'Street'), kiosk: byTag('kiosk'), pole: byTag('pole'),
  fence: byTag('fence', 'Street'), pillar: byTag('pillar'), elevated: byTag('elevated'),
  metroEntry: byTag('metro-entry'), streetSign: byTag('sign', 'Street'),
  blockGround: byTag('ground', 'Street'),
  rail: byTag('rail'), metroPlatform: byTag('platform', 'Metro'),
  metroColumn: byTag('column'), tunnel: byTag('tunnel'), canopy: byTag('canopy'),
  train: byTag('train'), escalator: byTag('escalator'), metroProp: byTag('prop', 'Metro'),
  metroWall: byTag('wall', 'Metro'), metroLight: byTag('light', 'Metro'),
  car: byTag('car'), decal: byTag('decal'), cloud: byTag('cloud'),
  bridge: byTag('bridge', 'Environment'), pylon: byTag('pylon'), tree: byTag('tree'),
  stack: byTag('stack'), gantry: byTag('gantry'), hoarding: byTag('hoarding'),
  safety: byTag('safety'), podium: byTag('podium'), rubble: byTag('rubble'),
  background: byTag('background'), walkway: byTag('bridge', 'Modules'),
  stairsMod: byTag('stairs', 'Modules'), crates: Object.keys(P).filter((k) => k.includes('Modules/crates')),
  water: byTag('water'),
};
for (const [k, v] of Object.entries(SETS)) if (!v.length) throw new Error(`empty prefab set: ${k}`);

const ids = Object.keys(P);
const idIndex = new Map(ids.map((id, i) => [id, i]));

/* ------------------------------------------------------------- tile palette
 * Draw calls are bounded by how many distinct prefab/material combinations
 * appear inside one render tile, so every tile gets a small deterministic
 * palette instead of drawing from the whole 621-prefab library. The city still
 * reads as varied because neighbouring tiles roll different palettes.
 */
const TILE = 900;
const palCache = new Map();
function pal(x, z, key, pool, n) {
  const tk = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
  const ck = tk + '|' + key;
  let v = palCache.get(ck);
  if (!v) {
    const r = new RNG(hashStr(ck));
    const src = pool.slice();
    r.shuffle(src);
    v = src.slice(0, Math.min(n, src.length));
    palCache.set(ck, v);
  }
  return v;
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* -------------------------------------------------------------- placements */
const simple = [];   // [prefabIdx, x, y, z, yawDeg, scale]
const full = [];     // [prefabIdx, x, y, z, qx, qy, qz, qw, sx, sy, sz]
const groups = { base: 0, platformProps: 0, strip: 0 };
const r2 = (v) => Math.round(v * 100) / 100;

function place(id, x, y, z, yawDeg = 0, scale = 1, group = 'base') {
  if (!idIndex.has(id)) throw new Error('unknown prefab ' + id);
  simple.push([idIndex.get(id), r2(x), r2(y), r2(z), Math.round(yawDeg * 10) / 10, Math.round(scale * 1000) / 1000]);
  groups[group]++;
  return simple.length - 1;
}
function placeFull(id, x, y, z, q, s, group = 'base') {
  full.push([idIndex.get(id), r2(x), r2(y), r2(z),
    ...q.map((v) => Math.round(v * 10000) / 10000), ...s.map((v) => Math.round(v * 1000) / 1000)]);
  groups[group]++;
  return full.length - 1;
}

/* --------------------------------------------------------------- city grid */
const BLOCK = 92;        // block footprint
const STREET = 24;       // street width
const PITCH = BLOCK + STREET;
const HALF = 11;         // grid runs -HALF..HALF  => 23 x 23 blocks, ~2.7 km
const CITY_RADIUS = (HALF + 0.5) * PITCH;

/** occupied building footprints, for facade/roof attachment and web anchors */
const buildings = [];

const DISTRICTS = [
  { name: 'downtown', cx: 3, cz: -2, r: 3.2 },
  { name: 'midtown', cx: -1, cz: 3, r: 3.6 },
  { name: 'slums', cx: -7, cz: 6, r: 3.0 },
  { name: 'industrial', cx: 7, cz: 7, r: 2.6 },
  { name: 'metro', cx: -6, cz: -5, r: 2.8 },
];
function districtOf(i, j) {
  let best = 'residential', bestD = Infinity;
  for (const d of DISTRICTS) {
    const dist = Math.hypot(i - d.cx, j - d.cz) / d.r;
    if (dist < 1 && dist < bestD) { bestD = dist; best = d.name; }
  }
  return best;
}

/** true when a footprint overlaps the open metro trench, which must stay open */
function overMetro(x, z, half) {
  return Math.abs(x - METRO.x) < METRO.width / 2 + half
    && z > METRO.z0 - 60 - half && z < METRO.z1 + 60 + half;
}

/* ------------------------------------------------------- street furniture */
function streetGrid() {
  for (let i = -HALF; i <= HALF; i++) {
    for (let j = -HALF; j <= HALF; j++) {
      const cx = i * PITCH, cz = j * PITCH;
      // the block's own ground, unless the metro trench cuts through here
      if (!overMetro(cx, cz, BLOCK / 2)) {
        place(pal(cx, cz, 'ground', SETS.blockGround, 1)[0], cx, 0, cz, 0, 1);
      }
      const roadPal = pal(cx, cz, 'road', SETS.road.filter((r) => P[r].size[0] >= 18), 1);
      const linePal = pal(cx, cz, 'line', SETS.decal.filter((d) => d.includes('road_lines')), 1);
      // roadway along +Z between this block and the next
      const roadZ = cz + BLOCK / 2 + STREET / 2;
      if (j < HALF) {
        place(roadPal[0], cx, 0, roadZ, 90, 1);
        place(linePal[0], cx, 0.03, roadZ, 90, 1);
      }
      const roadX = cx + BLOCK / 2 + STREET / 2;
      if (i < HALF) {
        place(roadPal[0], roadX, 0, cz, 0, 1);
        place(linePal[0], roadX, 0.03, cz, 0, 1);
      }
      if (i < HALF && j < HALF) place(rng.pick(SETS.road.filter((r) => r.includes('intersection'))), roadX, 0, roadZ, 0, 1);
      // sidewalks hugging the block
      const swPal = pal(cx, cz, 'sw', SETS.sidewalk.filter((s) => P[s].size[2] >= 80), 1);
      for (const [sx, sz, yaw] of [[0, BLOCK / 2 + 2.4, 90], [0, -BLOCK / 2 - 2.4, 90], [BLOCK / 2 + 2.4, 0, 0], [-BLOCK / 2 - 2.4, 0, 0]]) {
        place(swPal[0], cx + sx, 0, cz + sz, yaw, 1);
      }
      // corner lamps, lights, crossings
      const dist = districtOf(i, j);
      const lampSet = dist === 'slums' ? SETS.lamp.filter((l) => l.includes('lamp_a')) : SETS.lamp;
      for (const [lx, lz] of [[BLOCK / 2 + 3, BLOCK / 2 + 3], [-BLOCK / 2 - 3, BLOCK / 2 + 3]]) {
        if (rng.chance(0.85)) place(rng.pick(pal(cx, cz, 'lamp', lampSet, 2)), cx + lx, 0.28, cz + lz, rng.pick([0, 90, 180, 270]), 1);
      }
      if (rng.chance(0.3)) place(rng.pick(SETS.traffic), cx + BLOCK / 2 + 4, 0.28, cz + BLOCK / 2 + 4, rng.pick([0, 90, 180, 270]), 1);
      if (rng.chance(0.5)) place(rng.pick(SETS.decal.filter((d) => d.includes('crosswalk'))), cx + BLOCK / 2 + STREET / 2, 0.04, cz + BLOCK / 2 + 3, 0, 1);
      // pavement clutter
      const clutter = dist === 'slums' ? 7 : dist === 'downtown' ? 5 : 4;
      for (let k = 0; k < clutter; k++) {
        const edge = rng.int(0, 3);
        const t = rng.range(-BLOCK / 2 + 4, BLOCK / 2 - 4);
        const off = BLOCK / 2 + rng.range(1.2, 3.6);
        const px = edge === 0 ? cx + t : edge === 1 ? cx + t : cx + off, pz = edge === 0 ? cz + off : edge === 1 ? cz - off : cz + t;
        const x = edge < 2 ? px : (edge === 2 ? cx + off : cx - off);
        const z = edge < 2 ? (edge === 0 ? cz + off : cz - off) : cz + t;
        const yaw = edge === 0 ? 180 : edge === 1 ? 0 : edge === 2 ? 270 : 90;
        const poolAll = dist === 'slums'
          ? [...SETS.stall, ...SETS.streetProp, ...SETS.vending, ...SETS.crates, ...SETS.fence]
          : dist === 'downtown' ? [...SETS.vending, ...SETS.streetProp, ...SETS.kiosk, ...SETS.streetSign]
            : [...SETS.vending, ...SETS.streetProp, ...SETS.stall, ...SETS.kiosk, ...SETS.pole];
        place(rng.pick(pal(x, z, 'street', poolAll, 12)), x, 0.28, z, yaw + rng.range(-4, 4), rng.range(0.9, 1.12));
      }
      // parked / driving traffic
      const cars = dist === 'downtown' ? 4 : dist === 'industrial' ? 2 : 3;
      const carPal = pal(cx, cz, 'car', SETS.car, 4);
      for (let k = 0; k < cars; k++) {
        const alongZ = rng.chance(0.5);
        const lane = rng.pick([-1, 1]) * rng.range(3.5, 8.5);
        if (alongZ) place(rng.pick(carPal), cx + BLOCK / 2 + STREET / 2 + lane, 0.02, cz + rng.range(-BLOCK / 2, BLOCK / 2), rng.chance(0.5) ? 0 : 180, 1);
        else place(rng.pick(carPal), cx + rng.range(-BLOCK / 2, BLOCK / 2), 0.02, cz + BLOCK / 2 + STREET / 2 + lane, rng.chance(0.5) ? 90 : 270, 1);
      }
      if (rng.chance(0.3)) place(rng.pick(SETS.decal.filter((d) => d.includes('stain') || d.includes('puddle'))), cx + rng.range(-BLOCK / 2, BLOCK / 2), 0.035, cz + rng.range(-BLOCK / 2, BLOCK / 2), rng.range(0, 360), rng.range(0.8, 1.6));
    }
  }
}

/* ------------------------------------------------------------- block fills */
function fitBuildings(i, j, dist) {
  const cx = i * PITCH, cz = j * PITCH;
  let pool, count;
  switch (dist) {
    case 'downtown': pool = [...SETS.tower, ...SETS.tower, ...SETS.slab, ...SETS.corner]; count = rng.int(2, 4); break;
    case 'midtown': pool = [...SETS.slab, ...SETS.corner, ...SETS.tower, ...SETS.res]; count = rng.int(3, 5); break;
    case 'slums': pool = [...SETS.slum, ...SETS.slum, ...SETS.res.filter((r) => P[r].size[1] < 34)]; count = rng.int(6, 10); break;
    case 'industrial': pool = [...SETS.industrial, ...SETS.parking, ...SETS.slab.filter((s) => P[s].size[1] < 70)]; count = rng.int(2, 4); break;
    case 'metro': pool = [...SETS.res, ...SETS.slab, ...SETS.parking, ...SETS.corner]; count = rng.int(3, 5); break;
    default: pool = [...SETS.res, ...SETS.res, ...SETS.corner, ...SETS.slum]; count = rng.int(4, 7);
  }
  // simple shelf packing inside the block
  pool = pal(cx, cz, 'bld', pool, 12);
  const taken = [];
  const fits = (x, z, w, d) => {
    if (Math.abs(x) + w / 2 > BLOCK / 2 - 1 || Math.abs(z) + d / 2 > BLOCK / 2 - 1) return false;
    return !taken.some((t) => Math.abs(t.x - x) < (t.w + w) / 2 + 1.5 && Math.abs(t.z - z) < (t.d + d) / 2 + 1.5);
  };
  let attempts = 0;
  while (taken.length < count && attempts < count * 14) {
    attempts++;
    const id = rng.pick(pool);
    const pf = P[id];
    const yaw = rng.pick([0, 90, 180, 270]);
    const w = yaw % 180 === 0 ? pf.size[0] : pf.size[2];
    const d = yaw % 180 === 0 ? pf.size[2] : pf.size[0];
    if (w > BLOCK - 4 || d > BLOCK - 4) continue;
    // prefer the block edge so streets stay walled
    const ex = rng.chance(0.75) ? rng.pick([-1, 1]) * (BLOCK / 2 - w / 2 - rng.range(0.5, 3)) : rng.range(-BLOCK / 2 + w / 2, BLOCK / 2 - w / 2);
    const ez = rng.chance(0.75) ? rng.pick([-1, 1]) * (BLOCK / 2 - d / 2 - rng.range(0.5, 3)) : rng.range(-BLOCK / 2 + d / 2, BLOCK / 2 - d / 2);
    if (!fits(ex, ez, w, d)) continue;
    taken.push({ x: ex, z: ez, w, d, id, yaw });
    place(id, cx + ex, 0, cz + ez, yaw, 1);
    buildings.push({
      id, x: cx + ex, z: cz + ez, yaw, w, d,
      // above wallUpTo a tower steps back, so nothing may be attached there
      wallUpTo: pf.wallUpTo != null ? pf.wallUpTo : (pf.roofY != null ? pf.roofY : pf.size[1]),
      top: pf.roofY != null ? pf.roofY : pf.size[1],
      roofW: pf.footprint ? (yaw % 180 === 0 ? pf.footprint[0] : pf.footprint[1]) : w * 0.9,
      roofD: pf.footprint ? (yaw % 180 === 0 ? pf.footprint[1] : pf.footprint[0]) : d * 0.9,
      dist, i, j,
    });
  }
  // yard clutter in the leftover space
  for (let k = 0; k < (dist === 'slums' ? 5 : 2); k++) {
    const x = cx + rng.range(-BLOCK / 2 + 4, BLOCK / 2 - 4), z = cz + rng.range(-BLOCK / 2 + 4, BLOCK / 2 - 4);
    if (taken.some((t) => Math.abs(cx + t.x - x) < t.w / 2 + 2 && Math.abs(cz + t.z - z) < t.d / 2 + 2)) continue;
    const pool2 = dist === 'slums' ? [...SETS.crates, ...SETS.rubble, ...SETS.scaffold, ...SETS.tree]
      : dist === 'industrial' ? [...SETS.crates, ...SETS.rubble, ...SETS.hoarding] : [...SETS.tree, ...SETS.crates, ...SETS.rubble];
    place(rng.pick(pool2), x, 0.28, z, rng.range(0, 360), rng.range(0.9, 1.3));
  }
}

/* ------------------------------------------------------- facade + roof kit */
function dressBuildings() {
  for (const b of buildings) {
    const tall = b.top > 40;
    // ---- walls
    const details = b.dist === 'slums' ? rng.int(2, 5) : tall ? rng.int(2, 5) : rng.int(2, 3);
    for (let k = 0; k < details; k++) {
      const side = rng.int(0, 3);              // 0:+Z 1:-Z 2:+X 3:-X
      const nx = side === 2 ? 1 : side === 3 ? -1 : 0;
      const nz = side === 0 ? 1 : side === 1 ? -1 : 0;
      const halfAlong = (side < 2 ? b.w : b.d) / 2;
      const halfOut = (side < 2 ? b.d : b.w) / 2;
      const along = rng.range(-halfAlong + 1.5, halfAlong - 1.5);
      const yawOut = side === 0 ? 0 : side === 1 ? 180 : side === 2 ? 90 : 270;
      let pool, y;
      const roll = rng.f();
      const ceil = Math.max(5, b.wallUpTo - 2);
      if (roll < 0.26) { pool = SETS.ac; y = rng.range(3, Math.max(4, Math.min(b.top - 3, ceil))); }
      else if (roll < 0.40) { pool = SETS.pipe; y = 0.3; }
      else if (roll < 0.52) { pool = SETS.balcony; y = rng.range(6, Math.max(7, Math.min(b.top - 4, ceil))); }
      else if (roll < 0.66) { pool = b.dist === 'downtown' ? SETS.facadeSign : SETS.neonFacade; y = rng.range(4, Math.max(6, Math.min(b.top * 0.8, ceil))); }
      else if (roll < 0.69) { pool = SETS.escape; y = 4.2; }
      else if (roll < 0.84) { pool = SETS.awning; y = rng.range(3.4, 4.6); }
      else if (roll < 0.92) { pool = SETS.ledge; y = rng.range(6, Math.max(8, Math.min(b.top * 0.6, ceil))); }
      else { pool = Object.keys(P).filter((k) => k.startsWith('Decals/wall_grime')); y = rng.range(2, Math.max(4, Math.min(b.top * 0.7, ceil))); }
      const id = rng.pick(pal(b.x, b.z, 'facade', pool, 3));
      const pf = P[id];
      if (y + pf.size[1] > b.wallUpTo - 0.5) continue;      // would hang off a setback
      if (pf.size[1] > b.top - y) continue;
      const out = halfOut + (pf.size[2] || 0.4) * 0.5 - 0.05;
      place(id, b.x + nx * out, y, b.z + nz * out, yawOut, 1);
    }
    // ---- big building advertisements, snapped to a real facade plane
    if ((b.dist === 'downtown' || b.dist === 'midtown' || b.dist === 'slums') && b.top > 26 && rng.chance(0.42)) {
      const side = rng.int(0, 3);
      const nx = side === 2 ? 1 : side === 3 ? -1 : 0, nz = side === 0 ? 1 : side === 1 ? -1 : 0;
      const halfOut = (side < 2 ? b.d : b.w) / 2;
      const halfAlong = (side < 2 ? b.w : b.d) / 2;
      const pool = Object.keys(P).filter((k) => k.startsWith('Decals/ad_flat') || k.startsWith('Facade_Details/wall_ad'));
      const id = rng.pick(pool);
      const pf = P[id];
      const adCeil = b.wallUpTo - pf.size[1] / 2 - 1.5;
      if (pf.size[0] < halfAlong * 2 - 1 && adCeil > pf.size[1] / 2 + 8) {
        const y = rng.range(pf.size[1] / 2 + 8, adCeil);
        const yawOut = side === 0 ? 0 : side === 1 ? 180 : side === 2 ? 90 : 270;
        const wanted = halfOut + rng.range(1.2, 5.0);            // as authored: floating off the wall
        const snapped = halfOut + (pf.size[2] || 0.2) * 0.5 + 0.06; // snapped onto the facade
        signFixes.push({
          prefab: id, building: b.id, side,
          from: [r2(b.x + nx * wanted), r2(y), r2(b.z + nz * wanted)],
          to: [r2(b.x + nx * snapped), r2(y), r2(b.z + nz * snapped)],
          gap: r2(wanted - snapped), reason: 'floating advertisement snapped to nearest real facade',
        });
        place(id, b.x + nx * snapped, y, b.z + nz * snapped, yawOut, 1);
      }
    }
    // ---- roofs
    const roofBudget = b.dist === 'slums' ? rng.int(1, 2) : b.top > 90 ? rng.int(2, 4) : rng.int(1, 3);
    for (let k = 0; k < roofBudget; k++) {
      const pool = rng.f() < 0.5 ? SETS.roofMod
        : rng.f() < 0.5 ? Object.keys(P).filter((x) => x.startsWith('Modules/water_tank') || x.startsWith('Modules/cooling') || x.startsWith('Modules/vent_stack'))
          : Object.keys(P).filter((x) => x.startsWith('Modules/stair_hut') || x.startsWith('Modules/coop') || x.startsWith('Modules/solar') || x.startsWith('Environment/roof_garden') || x.startsWith('Environment/chimneys'));
      const id = rng.pick(pal(b.x, b.z, 'roof', pool, 4));
      const pf = P[id];
      const rx = rng.range(-b.roofW / 2 + pf.size[0] / 2, b.roofW / 2 - pf.size[0] / 2);
      const rz = rng.range(-b.roofD / 2 + pf.size[2] / 2, b.roofD / 2 - pf.size[2] / 2);
      if (!isFinite(rx) || !isFinite(rz)) continue;
      place(id, b.x + rx, b.top + 0.2, b.z + rz, rng.pick([0, 90, 180, 270]), 1, 'platformProps');
    }
    // rooftop billboards + antennas on the taller stock
    if (b.top > 34 && rng.chance(0.3)) {
      const id = rng.pick(pal(b.x, b.z, 'bb', SETS.billboard, 2));
      const pf = P[id];
      if (pf.size[0] < b.roofW - 2) {
        place(id, b.x + rng.range(-2, 2), b.top + 0.2, b.z + rng.range(-b.roofD / 2 + pf.size[2], b.roofD / 2 - pf.size[2]), rng.pick([0, 90, 180, 270]), 1, 'platformProps');
      }
    }
    if (b.top > 60 && rng.chance(0.4)) {
      place(rng.pick(pal(b.x, b.z, 'ant', Object.keys(P).filter((k) => k.startsWith('Facade_Details/antenna') || k.startsWith('Facade_Details/satellite')), 2)),
        b.x + rng.range(-b.roofW / 3, b.roofW / 3), b.top + 0.3, b.z + rng.range(-b.roofD / 3, b.roofD / 3), rng.range(0, 360), 1, 'platformProps');
    }
    // parapet railing so rooftops read as traversable
    if (rng.chance(0.22)) {
      const id = rng.pick(pal(b.x, b.z, 'rail', SETS.railing.filter((r) => P[r].size[0] <= b.roofW), 2));
      if (id) place(id, b.x, b.top + 0.25, b.z + b.roofD / 2 - 0.4, 0, 1, 'platformProps');
    }
  }
}
const signFixes = [];

/* -------------------------------------------- slum platforms and walkways */
function slumWalkways() {
  const slumBuildings = buildings.filter((b) => b.dist === 'slums' && b.top > 8);
  for (const b of slumBuildings) {
    // side platforms hanging off the stack
    for (let k = 0; k < rng.int(1, 3); k++) {
      const side = rng.int(0, 3);
      const nx = side === 2 ? 1 : side === 3 ? -1 : 0, nz = side === 0 ? 1 : side === 1 ? -1 : 0;
      const halfOut = (side < 2 ? b.d : b.w) / 2;
      const id = rng.pick(SETS.platform.filter((p) => P[p].size[0] <= 16));
      const pf = P[id];
      const y = rng.range(3.5, Math.max(4, b.top - 2));
      place(id, b.x + nx * (halfOut + pf.size[2] / 2), y, b.z + nz * (halfOut + pf.size[2] / 2), side === 0 ? 0 : side === 1 ? 180 : side === 2 ? 90 : 270, 1, 'platformProps');
      if (rng.chance(0.6)) {
        const rid = rng.pick(SETS.railing.filter((r) => P[r].size[0] <= pf.size[0]));
        if (rid) place(rid, b.x + nx * (halfOut + pf.size[2]), y + 0.05, b.z + nz * (halfOut + pf.size[2]), side === 0 ? 0 : side === 1 ? 180 : side === 2 ? 90 : 270, 1, 'platformProps');
      }
      if (rng.chance(0.45)) place(rng.pick(SETS.ladderMod), b.x + nx * (halfOut + 0.4), Math.max(0.5, y - 5), b.z + nz * (halfOut + 0.4), 0, 1, 'platformProps');
    }
    // bridges to a nearby neighbour
    const near = slumBuildings.filter((o) => o !== b && Math.abs(o.top - b.top) < 5 && Math.hypot(o.x - b.x, o.z - b.z) < 36 && Math.hypot(o.x - b.x, o.z - b.z) > 10);
    if (near.length && rng.chance(0.4)) {
      const o = rng.pick(near);
      const dx = o.x - b.x, dz = o.z - b.z;
      const dist = Math.hypot(dx, dz);
      const id = rng.pick(SETS.walkway.filter((w) => Math.abs(P[w].size[0] - dist) < 9)) || SETS.walkway[0];
      const yaw = Math.atan2(dx, dz) * 180 / Math.PI + 90;
      place(id, (b.x + o.x) / 2, Math.min(b.top, o.top) - 0.5, (b.z + o.z) / 2, yaw, 1, 'platformProps');
    }
    if (rng.chance(0.35)) place(rng.pick(SETS.stairsMod), b.x + rng.range(-b.w / 2, b.w / 2), rng.range(0.3, 4), b.z + b.d / 2 + 2, rng.pick([0, 180]), 1, 'platformProps');
  }
  // free-standing scaffold towers + market strips between the shacks
  for (let k = 0; k < 130; k++) {
    const d = DISTRICTS.find((x) => x.name === 'slums');
    const i = d.cx + rng.range(-d.r, d.r), j = d.cz + rng.range(-d.r, d.r);
    const x = i * PITCH + rng.range(-BLOCK / 2, BLOCK / 2), z = j * PITCH + rng.range(-BLOCK / 2, BLOCK / 2);
    place(rng.pick(pal(x, z, 'slumfill', [...SETS.scaffold, ...SETS.crates, ...SETS.stall, ...SETS.hoarding], 5)), x, 0.28, z, rng.range(0, 360), rng.range(0.9, 1.2), 'platformProps');
  }
}

/* ---------------------------------------------------------- metro district */
const METRO = { x: -6 * PITCH, z0: -9 * PITCH, z1: -1 * PITCH, bottom: -26, platformTop: -20.2, width: 40 };
function metroDistrict() {
  const { x, z0, z1, bottom, platformTop } = METRO;
  const len = z1 - z0;
  // trench walls + floor, cut through the street grid
  for (let z = z0; z < z1; z += 24) {
    place(rng.pick(SETS.metroWall), x - METRO.width / 2, bottom, z + 12, 0, 1);
    place(rng.pick(SETS.metroWall), x + METRO.width / 2, bottom, z + 12, 180, 1);
    place('Environment/safety_floor_70x60', x, bottom, z + 12, 0, 1);
    if (z % 48 === 0) place(rng.pick(SETS.metroLight), x - METRO.width / 2 + 1, bottom + 6, z + 12, 0, 1);
  }
  // two tracks + platforms
  for (const lane of [-9, 9]) {
    for (let z = z0; z < z1; z += 80) {
      place(rng.pick(SETS.rail.filter((r) => P[r].size[2] === 80)), x + lane, bottom + 0.3, z + 40, 90 + 90, 1);
    }
  }
  for (let z = z0 + 40; z < z1 - 40; z += 80) {
    place(rng.pick(SETS.metroPlatform.filter((p) => P[p].size[2] === 80)), x, platformTop, z + 40, 0, 1);
    place(rng.pick(SETS.canopy), x, platformTop + 0.1, z + 40, 0, 1);
    for (let k = 0; k < 4; k++) place(rng.pick(SETS.metroColumn), x + rng.range(-3, 3), platformTop, z + rng.range(4, 76), 0, 1);
    if (rng.chance(0.7)) place(rng.pick(SETS.metroProp), x + rng.range(-2, 2), platformTop, z + rng.range(10, 70), rng.pick([0, 180]), 1);
    if (rng.chance(0.55)) place(rng.pick(SETS.train), x + rng.pick([-9, 9]), bottom + 0.6, z + rng.range(20, 60), 0, 1);
  }
  // tunnel mouths at both ends
  for (const [zz, yaw] of [[z0 - 40, 0], [z1 + 40, 0]]) {
    place(rng.pick(SETS.tunnel.filter((t) => P[t].size[2] === 80)), x, bottom, zz, yaw, 1);
  }
  // stairs / escalators from street level down to the platform
  const stairZ = [z0 + 120, z0 + 300, z1 - 160];
  for (const sz of stairZ) {
    place(rng.pick(SETS.metroEntry), x + METRO.width / 2 + 6, 0.3, sz, 270, 1);
    // stepped descent: stacked stair flights hugging the trench wall
    let y = -1.2;
    while (y > platformTop + 4) {
      const id = rng.pick(SETS.stairsMod.filter((s) => P[s].size[1] >= 4));
      const pf = P[id];
      place(id, x + METRO.width / 2 - 3, y - pf.size[1], sz + rng.range(-1, 1), 0, 1);
      place('Modules/platform_8x6', x + METRO.width / 2 - 3, y - pf.size[1], sz + pf.size[2] / 2 + 3, 0, 1, 'platformProps');
      y -= pf.size[1];
    }
    place(rng.pick(SETS.escalator), x + METRO.width / 2 - 8, platformTop, sz + 14, 0, 1);
  }
  // elevated section carrying the line out of the district
  for (let z = z1 + 80; z < z1 + 420; z += 80) {
    place(rng.pick(SETS.rail.filter((r) => P[r].size[2] === 80)), x, 22, z, 180, 1);
    place(rng.pick(SETS.pillar.filter((p) => P[p].size[1] > 20)), x, 0.3, z - 40, 0, 1);
    place(rng.pick(SETS.pillar.filter((p) => P[p].size[1] > 20)), x, 0.3, z, 0, 1);
  }
}

/* -------------------------------------------------------- elevated highway */
function elevatedHighway() {
  const y = 22;
  // one N-S run and one E-W run, crossing near downtown
  const runs = [
    { along: 'z', fixed: 2 * PITCH + STREET / 2, from: -HALF * PITCH, to: HALF * PITCH },
    { along: 'x', fixed: -3 * PITCH - STREET / 2, from: -HALF * PITCH, to: HALF * PITCH },
  ];
  for (const run of runs) {
    for (let t = run.from; t < run.to; t += 80) {
      const id = rng.pick(SETS.elevated.filter((e) => P[e].size[2] === 80));
      if (run.along === 'z') {
        place(id, run.fixed, y, t + 40, 0, 1);
        place(rng.pick(SETS.pillar.filter((p) => P[p].size[1] > 20)), run.fixed, 0.3, t, 0, 1);
      } else {
        place(id, t + 40, y, run.fixed, 90, 1);
        place(rng.pick(SETS.pillar.filter((p) => P[p].size[1] > 20)), t, 0.3, run.fixed, 0, 1);
      }
      if (rng.chance(0.25)) {
        const gid = rng.pick(SETS.gantry);
        if (run.along === 'z') place(gid, run.fixed, y + 0.3, t + 40, 0, 1, 'platformProps');
        else place(gid, t + 40, y + 0.3, run.fixed, 90, 1, 'platformProps');
      }
      if (rng.chance(0.5)) {
        const cid = rng.pick(SETS.car);
        if (run.along === 'z') place(cid, run.fixed + rng.range(-5, 5), y + 0.05, t + rng.range(0, 80), rng.chance(0.5) ? 0 : 180, 1);
        else place(cid, t + rng.range(0, 80), y + 0.05, run.fixed + rng.range(-5, 5), rng.chance(0.5) ? 90 : 270, 1);
      }
    }
  }
  // river crossing + bridges on the industrial edge
  for (let k = 0; k < 6; k++) {
    place(rng.pick(SETS.bridge), 8 * PITCH, 14, (k - 3) * 140, 90, 1, 'strip');
    place(rng.pick(SETS.water), 8 * PITCH, 0.05, (k - 3) * 140, 0, 1, 'strip');
  }
}

/**
 * A coarse safety floor under the whole city, well below street level. It
 * catches anything that leaves the finished blocks -- the ring of filler
 * buildings, the gaps at the city edge -- without ever being a web anchor, so
 * a strand can never attach to empty space above it.
 */
function globalSafetyFloor() {
  const TILE_M = 400;
  const reach = CITY_RADIUS + 900;
  let n = 0;
  for (let x = -reach; x <= reach; x += TILE_M) {
    for (let z = -reach; z <= reach; z += TILE_M) {
      if (overMetro(x, z, TILE_M / 2)) continue;
      place('Environment/safety_floor_400x400', x, -0.62, z, 0, 1, 'strip');
      n++;
    }
  }
  return n;
}

/* ----------------------------------------------- unfinished blocks + fixes */
function safetyAndPodiums() {
  const unfinished = [];
  for (let i = -HALF; i <= HALF; i++) {
    for (let j = -HALF; j <= HALF; j++) {
      if (districtOf(i, j) === 'metro' && Math.abs(i * PITCH - METRO.x) < METRO.width) continue;
      if (rng.chance(0.06)) unfinished.push([i, j]);
    }
  }
  for (const [i, j] of unfinished) {
    const cx = i * PITCH, cz = j * PITCH;
    place('Environment/safety_floor_70x60', cx, 0.02, cz, 0, 1.3);
    for (let k = 0; k < 3; k++) place(rng.pick(SETS.rubble), cx + rng.range(-30, 30), 0.1, cz + rng.range(-25, 25), rng.range(0, 360), rng.range(1, 1.8));
    if (rng.chance(0.6)) place(rng.pick(SETS.fence.filter((f) => P[f].size[0] > 12)), cx, 0.3, cz + 34, 0, 1);
  }
  // podiums under anything that would otherwise float (slum platforms sit high
  // on purpose; buildings must always reach the ground)
  let podiums = 0;
  for (const b of buildings) {
    const groundY = 0;
    if (b.dist === 'slums' && rng.chance(0.12)) {
      // deliberately raised shack -> generate a foundation podium beneath it
      const lift = rng.range(1.5, 4.5);
      place('Environment/podium_12', b.x, lift, b.z, 0, 1, 'strip');
      podiums++;
    }
    void groundY;
  }
  return { unfinished: unfinished.length, podiums };
}

/* ------------------------------------------------------- background + sky */
function backgroundRing() {
  // dense strip of low filler right outside the playable grid so the city
  // never just stops at a hard edge
  for (let k = 0; k < 700; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = CITY_RADIUS + rng.range(20, 620);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const id = rng.pick(pal(x, z, 'strip', [...SETS.res, ...SETS.slum, ...SETS.slab.filter((s) => P[s].size[1] < 70), ...SETS.industrial], 8));
    place(id, x, 0, z, rng.pick([0, 90, 180, 270]), 1, 'strip');
  }
  // far skyline silhouettes, swallowed by fog
  for (let k = 0; k < 820; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = CITY_RADIUS + rng.range(500, 2600);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    place(rng.pick(pal(bx, bz, 'sky', SETS.background, 6)), bx, rng.range(-6, 0), bz, rng.pick([0, 45, 90, 135, 180]), rng.range(0.8, 1.9), 'strip');
  }
  // landmark verticals: stacks, pylons, gantries on the horizon
  for (let k = 0; k < 90; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = CITY_RADIUS + rng.range(120, 1500);
    place(rng.pick([...SETS.stack, ...SETS.pylon]), Math.cos(a) * r, 0, Math.sin(a) * r, rng.range(0, 360), rng.range(0.9, 1.6), 'strip');
  }
  // camera-facing cloud billboards, low opacity
  for (let k = 0; k < 210; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(400, 4200);
    place(rng.pick(SETS.cloud), Math.cos(a) * r, rng.range(260, 900), Math.sin(a) * r, 0, rng.range(0.7, 1.5), 'strip');  // clouds are one prefab family, cheap
  }
}

/* ------------------------------------------- start point: dressed-up street */
function startArea() {
  // the spawn street gets extra neon, stalls and traffic so the first frame
  // matches the reference's density
  for (let k = 0; k < 150; k++) {
    const x = rng.range(-150, 150), z = rng.range(-150, 150);
    const pool = [...SETS.stall, ...SETS.vending, ...SETS.kiosk, ...SETS.streetProp, ...SETS.streetSign, ...SETS.pole];
    place(rng.pick(pal(x, z, 'start', pool, 14)), x, 0.28, z, rng.range(0, 360), rng.range(0.95, 1.15));
  }
  for (let k = 0; k < 40; k++) {
    place(rng.pick(pal(0, 0, 'car', SETS.car, 4)), rng.range(-160, 160), 0.02, rng.range(-160, 160), rng.pick([0, 90, 180, 270]), 1);
  }
  for (let k = 0; k < 28; k++) {
    place(rng.pick(pal(0, 0, 'hoard', SETS.hoarding, 3)), rng.range(-180, 180), 0.3, rng.range(-180, 180), rng.range(0, 360), 1);
  }
}

/* -------------------------------------------------------------------- run */
console.log('laying out city...');
streetGrid();
for (let i = -HALF; i <= HALF; i++) for (let j = -HALF; j <= HALF; j++) fitBuildings(i, j, districtOf(i, j));
dressBuildings();
slumWalkways();
metroDistrict();
elevatedHighway();
const sp = safetyAndPodiums();
sp.globalSafetyTiles = globalSafetyFloor();
startArea();
backgroundRing();

/* -------------------------------------------------- landmarks (validation) */
const toWorld = (p) => [-p[0], p[1], p[2]];
const landmarks = {
  street_start: { source: [0, 3.2, 40], label: 'Street-level starting point', labelZh: 'Street level start' },
  metro_district: { source: [METRO.x + 10, METRO.platformTop + 2, METRO.z0 + 320], label: 'Metro district platform', labelZh: 'Metro district' },
  slums: { source: [-7 * PITCH, 26, 6 * PITCH], label: 'Slum rooftops', labelZh: 'Slums' },
  skyscrapers: { source: [3 * PITCH, 150, -2 * PITCH], label: 'Skyscraper district', labelZh: 'Skyscraper district' },
  city_aerial: { source: [0, 398, 0], label: 'Full-city aerial view', labelZh: 'City aerial' },
};
for (const k of Object.keys(landmarks)) landmarks[k].world = toWorld(landmarks[k].source).map(r2);
// a road-direction probe: the +Z street in front of spawn must stay +Z after
// conversion, and its X must flip sign. The runtime asserts both.
const roadProbe = { source: [PITCH / 2 + BLOCK / 2, 0, 0], world: toWorld([PITCH / 2 + BLOCK / 2, 0, 0]).map(r2) };

const doc = {
  note: 'Placements are in SOURCE space. Convert with position (-x, y, z), quaternion (x, -y, -z, w), scale unchanged.',
  space: 'source-left-handed',
  conversion: { position: '(-x, y, z)', quaternion: '(x, -y, -z, w)', scale: 'unchanged' },
  grid: { block: BLOCK, street: STREET, pitch: PITCH, half: HALF, cityRadius: r2(CITY_RADIUS) },
  tileSize: TILE,
  metro: METRO,
  districts: DISTRICTS,
  landmarks, roadProbe,
  counts: { ...groups, buildings: buildings.length, total: simple.length + full.length, ...sp },
  prefabIds: ids,
  simpleColumns: ['prefab', 'x', 'y', 'z', 'yawDeg', 'scale'],
  fullColumns: ['prefab', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'sx', 'sy', 'sz'],
  simple, full,
};
fs.writeFileSync(path.join(DATA, 'scene.json'), JSON.stringify(doc));
fs.writeFileSync(path.join(DATA, 'sign_fixes.json'), JSON.stringify({
  note: 'Advertisements the generator found floating off their host facade, with the corrected transform already applied in scene.json. The runtime re-checks the gap and logs any that drift.',
  tolerance: 0.25, fixes: signFixes,
}, null, 1));

const size = fs.statSync(path.join(DATA, 'scene.json')).size;
console.log(`  buildings        ${buildings.length}`);
console.log(`  base placements  ${groups.base}`);
console.log(`  platform props   ${groups.platformProps}`);
console.log(`  strip fillers    ${groups.strip}`);
console.log(`  sign fixes       ${signFixes.length}`);
console.log(`  TOTAL            ${simple.length + full.length} placements, scene.json ${(size / 1048576).toFixed(2)} MB`);
