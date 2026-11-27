// Colocación determinista de árboles, arbustos, juncos, hierba y postes.
// Puro: la escena construye las mallas a partir de estas listas y la física crea sus colisiones.
import { createRng } from '../core/rng.js';
import { distToPolyline } from '../core/math.js';
import { HUT, PATH, SPAWN, WORLD, ditchCenterZ, BRIDGE } from './layout.js';
import { heightAt, PUDDLES, puddleAt } from './terrain.js';

const TAU = Math.PI * 2;

function farFrom(list, x, z, minDist) {
  for (const o of list) if (Math.hypot(o.x - x, o.z - z) < minDist) return false;
  return true;
}

function randomPointInDisc(rng, radius) {
  const a = rng.next() * TAU;
  const d = Math.sqrt(rng.next()) * radius;
  return { x: WORLD.centerX + Math.cos(a) * d, z: WORLD.centerZ + Math.sin(a) * d };
}

const hutDist = (x, z) => Math.hypot(x - HUT.x, z - HUT.z);
const ditchDist = (x, z) => Math.abs(z - ditchCenterZ(x));
const inPuddle = (x, z, margin = 0) => PUDDLES.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + margin);

function makeTree(rng, x, z, kind) {
  const base = { x, z, y: heightAt(x, z), kind, rotation: rng.next() * TAU, seed: rng.int(1, 1e6) };
  if (kind === 'willow') {
    return { ...base, height: rng.range(6.5, 9.5), radius: rng.range(0.22, 0.32), leanX: rng.spread(0.12), leanZ: rng.spread(0.12) };
  }
  if (kind === 'snag') {
    return { ...base, height: rng.range(4, 8.5), radius: rng.range(0.1, 0.16), leanX: rng.spread(0.1), leanZ: rng.spread(0.1) };
  }
  return { ...base, height: rng.range(9, 14.5), radius: rng.range(0.11, 0.17), leanX: rng.spread(0.05), leanZ: rng.spread(0.05) };
}

/** Árboles: abedules altos y delgados, sauces junto al agua y algunos troncos secos. */
export const TREES = (() => {
  const rng = createRng(2005);
  const trees = [];
  // Algunos a mano junto al inicio: al despertar se ven los troncos subiendo hacia el cielo.
  const handPlaced = [
    [-3.6, 36.2, 'birch'],
    [4.6, 31.4, 'birch'],
    [-1.4, 39.8, 'willow'],
    [5.9, 37.9, 'birch'],
    [-4.8, 29.6, 'snag'],
    [3.2, 40.5, 'birch'],
  ];
  for (const [x, z, kind] of handPlaced) trees.push(makeTree(rng, x, z, kind));

  for (let i = 0; i < 4000 && trees.length < 280; i++) {
    const { x, z } = randomPointInDisc(rng, WORLD.vegetationRadius);
    if (hutDist(x, z) < HUT.clearingRadius) continue;
    if (distToPolyline(x, z, PATH) < 3.0) continue;
    const dd = ditchDist(x, z);
    if (dd < 3.4) continue;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4) continue;
    if (inPuddle(x, z, 1)) continue;
    if (!farFrom(trees, x, z, 3.4)) continue;
    let kind = 'birch';
    if (dd < 10 && rng.chance(0.6)) kind = 'willow';
    else if (rng.chance(0.12)) kind = 'snag';
    else if (rng.chance(0.22)) kind = 'willow';
    trees.push(makeTree(rng, x, z, kind));
  }
  return trees;
})();

/** Arbustos bajos (sin colisión). */
export const BUSHES = (() => {
  const rng = createRng(3003);
  const list = [];
  for (let i = 0; i < 5000 && list.length < 240; i++) {
    const { x, z } = randomPointInDisc(rng, WORLD.vegetationRadius - 6);
    const hd = hutDist(x, z);
    if (hd < 7.8) continue;
    if (distToPolyline(x, z, PATH) < 2.0) continue;
    if (ditchDist(x, z) < 2.6) continue;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 2.5) continue;
    if (inPuddle(x, z, 0.3)) continue;
    if (!farFrom(list, x, z, 1.5)) continue;
    // Más densos en el borde del claro: el claro se siente "rodeado".
    if (hd > HUT.clearingRadius + 6 && rng.chance(0.35)) continue;
    list.push({ x, z, y: heightAt(x, z), height: rng.range(0.7, 1.6), width: rng.range(1.0, 2.1), rotation: rng.next() * TAU, seed: rng.int(1, 1e6) });
  }
  return list;
})();

/** Matas de juncos en las orillas de la zanja y alrededor de los charcos. */
export const REEDS = (() => {
  const rng = createRng(4242);
  const list = [];
  for (let i = 0; i < 400 && list.length < 120; i++) {
    const x = rng.range(-70, 70);
    if (Math.abs(x - BRIDGE.x) < 2.4) continue;
    const side = rng.chance(0.5) ? 1 : -1;
    const z = ditchCenterZ(x) + side * rng.range(0.9, 2.7);
    if (Math.hypot(x - WORLD.centerX, z - WORLD.centerZ) > WORLD.vegetationRadius) continue;
    list.push({ x, z, y: heightAt(x, z), height: rng.range(1.0, 2.1), rotation: rng.next() * TAU, seed: rng.int(1, 1e6) });
  }
  for (const p of PUDDLES) {
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const a = rng.next() * TAU;
      const x = p.x + Math.cos(a) * p.r * 1.05;
      const z = p.z + Math.sin(a) * p.r * 1.05;
      if (distToPolyline(x, z, PATH) < 1.2) continue;
      list.push({ x, z, y: heightAt(x, z), height: rng.range(0.8, 1.6), rotation: rng.next() * TAU, seed: rng.int(1, 1e6) });
    }
  }
  return list;
})();

/** Matas de hierba seca, pequeñas y abundantes. */
export const GRASS = (() => {
  const rng = createRng(777);
  const list = [];
  for (let i = 0; i < 3000 && list.length < 1100; i++) {
    const { x, z } = randomPointInDisc(rng, WORLD.radius + 12);
    if (hutDist(x, z) < HUT.outerRadius + 0.5) continue;
    if (distToPolyline(x, z, PATH) < 0.7) continue;
    if (ditchDist(x, z) < 1.7) continue;
    if (puddleAt(x, z) > 0.15) continue;
    list.push({ x, z, y: heightAt(x, z), height: rng.range(0.25, 0.6), rotation: rng.next() * TAU, seed: rng.int(1, 1e6) });
  }
  return list;
})();

function makePost(rng, x, z, { minH, maxH, lean, tipChance = 0.3 }) {
  return {
    x,
    z,
    y: heightAt(x, z),
    height: rng.range(minH, maxH),
    radius: rng.range(0.07, 0.12),
    leanX: rng.spread(lean),
    leanZ: rng.spread(lean),
    rotation: rng.next() * TAU,
    tip: rng.chance(tipChance),
    seed: rng.int(1, 1e6),
  };
}

/** Anillo de postes verticales alrededor de la choza, con un hueco frente a la puerta. */
export const HUT_POSTS = (() => {
  const rng = createRng(606);
  const { radius, count, entranceHalfAngle } = HUT.postRing;
  const posts = [];
  for (let i = 0; i < count; i++) {
    let theta = (i / count) * TAU;
    if (theta > Math.PI) theta -= TAU;
    if (Math.abs(theta) < entranceHalfAngle) continue;
    const r = radius + rng.spread(0.15);
    const x = HUT.x + Math.sin(theta) * r;
    const z = HUT.z + Math.cos(theta) * r;
    const post = makePost(rng, x, z, { minH: 1.7, maxH: 2.8, lean: 0.04, tipChance: 0.55 });
    post.radius = rng.range(0.09, 0.14);
    posts.push(post);
  }
  return posts;
})();

/** Restos de una cerca: postes inclinados a un lado del sendero. `line` agrupa los que llevan alambre. */
export const FENCE_POSTS = (() => {
  const rng = createRng(1984);
  const posts = [];
  const addAlong = (fromIdx, toIdx, side, spacing, skipChance, lean, line) => {
    let carry = 0;
    for (let i = fromIdx; i < toIdx; i++) {
      const [ax, az] = PATH[i];
      const [bx, bz] = PATH[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / len;
      const tz = (bz - az) / len;
      // Normal izquierda respecto al sentido de avance.
      const nx = tz * side;
      const nz = -tx * side;
      for (let s = carry; s < len; s += spacing) {
        const x = ax + tx * s + nx * 2.4 + rng.spread(0.25);
        const z = az + tz * s + nz * 2.4 + rng.spread(0.25);
        carry = s + spacing - len;
        if (ditchDist(x, z) < 3.6) continue;
        if (rng.chance(skipChance)) continue;
        posts.push({ ...makePost(rng, x, z, { minH: 1.0, maxH: 1.6, lean, tipChance: 0 }), line, order: posts.length });
      }
    }
  };
  addAlong(0, 3, 1, 2.3, 0.15, 0.32, 0);
  addAlong(4, 7, -1, 2.6, 0.3, 0.4, 1);
  return posts;
})();

/** Postes sueltos, clavados al azar en el lodo, y algunos dentro de la zanja. */
export const LOOSE_POSTS = (() => {
  const rng = createRng(1313);
  const posts = [];
  for (let i = 0; i < 600 && posts.length < 22; i++) {
    const { x, z } = randomPointInDisc(rng, WORLD.radius);
    if (hutDist(x, z) < 8.5) continue;
    if (distToPolyline(x, z, PATH) < 1.6) continue;
    if (ditchDist(x, z) < 2.0) continue;
    if (inPuddle(x, z, 0.2)) continue;
    if (!farFrom(posts, x, z, 4)) continue;
    posts.push(makePost(rng, x, z, { minH: 0.8, maxH: 2.1, lean: 0.45, tipChance: 0.2 }));
  }
  return posts;
})();

/** Postes viejos que asoman del agua de la zanja (sin colisión: el agua ya bloquea el paso). */
export const DITCH_POSTS = (() => {
  const rng = createRng(5150);
  const posts = [];
  for (let i = 0; i < 60 && posts.length < 7; i++) {
    const x = rng.range(-16, 16);
    if (Math.abs(x - BRIDGE.x) < 2.2) continue;
    const z = ditchCenterZ(x) + rng.spread(1.0);
    if (!farFrom(posts, x, z, 2.5)) continue;
    posts.push(makePost(rng, x, z, { minH: 1.3, maxH: 2.4, lean: 0.35, tipChance: 0 }));
  }
  return posts;
})();
