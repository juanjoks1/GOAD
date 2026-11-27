// Vegetación retro: troncos low-poly y tarjetas de follaje con recorte alfa, fusionadas por material.
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';
import { smoothstep } from '../../core/math.js';
import { TREES, BUSHES, REEDS, GRASS } from '../../world/placement.js';
import { tubeGeometry, cardGeometry, transform, setColors, setFloatAttribute, setNormals, merge } from '../builders.js';
import { addWindSway } from '../../shaders/patches.js';

const BARK_METERS = 1.6;

function foliageMaterial(map, timeUniform, strength) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
  return addWindSway(m, timeUniform, strength);
}

/** Tronco: base manchada de barro, tono variable. */
function trunkColors(geo, groundY, tone) {
  return setColors(geo, (x, y) => {
    const k = (0.45 + 0.55 * smoothstep(0.1, 1.3, y - groundY)) * tone;
    return [k, k * 0.98, k * 0.93];
  });
}

/**
 * Tarjeta de follaje ya transformada, con color, normales "redondeadas" y peso de viento.
 * `swayFn(fracY)` recibe la altura relativa del vértice en la tarjeta (0 abajo, 1 arriba).
 */
function leafCard({ width, height, pivot, position, rotation, tint, outward, swayFn }) {
  const g = cardGeometry(width, height, pivot);
  setFloatAttribute(g, 'sway', (x, y) => swayFn((y + height * pivot) / height));
  transform(g, { position, rotation, order: 'YXZ' });
  setColors(g, tint);
  setNormals(g, () => [outward[0] * 0.6, 1.0, outward[1] * 0.6]);
  return g;
}

function tintFrom(rng, base = 1, spread = 0.14) {
  const k = base + rng.spread(spread);
  return [k * (1 + rng.spread(0.05)), k, k * (1 + rng.spread(0.06))];
}

function trunkPoints(t, rng, count, heightFrac, bend = 0.12) {
  const pts = [];
  const bx = rng.spread(bend);
  const bz = rng.spread(bend);
  for (let i = 0; i <= count; i++) {
    const s = (i / count) * heightFrac;
    const curve = Math.sin(s * Math.PI);
    pts.push([
      t.x + t.leanX * t.height * s + bx * curve * t.height * 0.1,
      t.y - 0.3 + s * t.height,
      t.z + t.leanZ * t.height * s + bz * curve * t.height * 0.1,
    ]);
  }
  return pts;
}

const pointAt = (pts, s) => {
  const f = s * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  return pts[i].map((v, j) => v + (pts[i + 1][j] - v) * k);
};

function buildBirch(t, out) {
  const rng = createRng(t.seed);
  const pts = trunkPoints(t, rng, 6, 1, 0.1);
  const radii = pts.map((_, i) => t.radius * (1.3 - (i / (pts.length - 1)) * 1.08));
  out.birchTrunks.push(trunkColors(tubeGeometry(pts, radii, { sides: 6, vScale: 1 / BARK_METERS }), t.y, rng.range(0.85, 1.05)));

  // Ramas finas.
  const branchEnds = [];
  const nb = rng.int(3, 5);
  for (let b = 0; b < nb; b++) {
    const s = rng.range(0.45, 0.88);
    const p = pointAt(pts, s);
    const a = t.rotation + (b / nb) * Math.PI * 2 + rng.spread(0.5);
    const len = rng.range(0.9, 2.0) * (1.1 - s * 0.5);
    const end = [p[0] + Math.cos(a) * len, p[1] + len * rng.range(0.5, 0.9), p[2] + Math.sin(a) * len];
    const mid = [(p[0] + end[0]) / 2, (p[1] + end[1]) / 2 + 0.1, (p[2] + end[2]) / 2];
    out.birchTrunks.push(trunkColors(tubeGeometry([p, mid, end], [0.035, 0.022, 0.008], { sides: 4, vScale: 1 / BARK_METERS }), t.y, 0.9));
    branchEnds.push({ p: end, a });
  }

  // Copa rala: tarjetas alrededor de la parte alta del tronco y en las puntas de las ramas.
  const crown = [];
  const nc = rng.int(7, 11);
  for (let k = 0; k < nc; k++) {
    const s = rng.range(0.55, 1.0);
    const p = pointAt(pts, s);
    const a = rng.next() * Math.PI * 2;
    const d = rng.range(0.2, 1.1) * (1.25 - s * 0.6);
    crown.push({ p: [p[0] + Math.cos(a) * d, p[1] + rng.spread(0.3), p[2] + Math.sin(a) * d], a });
  }
  for (const be of branchEnds) crown.push(be);
  for (const c of crown) {
    const size = rng.range(1.3, 2.3);
    out.leafCards.push(
      leafCard({
        width: size,
        height: size,
        pivot: 0.5,
        position: c.p,
        rotation: [rng.spread(0.35), c.a + rng.spread(0.6), rng.spread(0.25)],
        tint: tintFrom(rng, 0.95),
        outward: [Math.cos(c.a), Math.sin(c.a)],
        swayFn: (f) => 0.45 + 0.55 * f,
      }),
    );
  }
}

function buildWillow(t, out) {
  const rng = createRng(t.seed);
  const pts = trunkPoints(t, rng, 4, 0.55, 0.2);
  const radii = pts.map((_, i) => t.radius * (1.35 - (i / (pts.length - 1)) * 0.55));
  out.darkTrunks.push(trunkColors(tubeGeometry(pts, radii, { sides: 7, vScale: 1 / BARK_METERS }), t.y, rng.range(0.8, 1.0)));
  const top = pts[pts.length - 1];

  // Brazos principales que se abren hacia arriba.
  const crownPoints = [];
  const nl = rng.int(3, 4);
  for (let l = 0; l < nl; l++) {
    const a = t.rotation + (l / nl) * Math.PI * 2 + rng.spread(0.4);
    const len = t.height * rng.range(0.3, 0.42);
    const elev = rng.range(0.55, 0.95);
    const mid = [top[0] + Math.cos(a) * len * 0.45, top[1] + len * elev * 0.55, top[2] + Math.sin(a) * len * 0.45];
    const end = [top[0] + Math.cos(a) * len, top[1] + len * elev * 0.8, top[2] + Math.sin(a) * len];
    out.darkTrunks.push(
      trunkColors(tubeGeometry([top, mid, end], [t.radius * 0.6, t.radius * 0.35, t.radius * 0.12], { sides: 5, vScale: 1 / BARK_METERS }), t.y, 0.9),
    );
    crownPoints.push({ p: mid, a }, { p: end, a });
  }

  // Cortinas colgantes alrededor de la copa.
  const nh = rng.int(14, 20);
  for (let k = 0; k < nh; k++) {
    const c = crownPoints[k % crownPoints.length];
    const a = c.a + rng.spread(0.9);
    const d = rng.range(0.2, 1.3);
    const px = c.p[0] + Math.cos(a) * d;
    const pz = c.p[2] + Math.sin(a) * d;
    const py = c.p[1] + rng.range(0.1, 0.5);
    const h = Math.min(rng.range(2.6, 4.2), py - t.y - 0.35);
    out.willowCards.push(
      leafCard({
        width: rng.range(1.5, 2.4),
        height: h,
        pivot: 1,
        position: [px, py, pz],
        rotation: [rng.range(-0.18, 0.05), Math.atan2(Math.cos(a), Math.sin(a)) + rng.spread(0.5), rng.spread(0.08)],
        tint: tintFrom(rng, 0.92),
        outward: [Math.cos(a), Math.sin(a)],
        swayFn: (f) => 0.15 + 0.95 * (1 - f),
      }),
    );
  }
  // Masa superior de la copa.
  for (let k = 0; k < 4; k++) {
    const c = crownPoints[rng.int(0, crownPoints.length - 1)];
    const size = rng.range(1.8, 2.8);
    out.leafCards.push(
      leafCard({
        width: size,
        height: size,
        pivot: 0.5,
        position: [c.p[0], c.p[1] + 0.3, c.p[2]],
        rotation: [rng.range(-1.2, -0.7), c.a, 0],
        tint: tintFrom(rng, 0.7),
        outward: [Math.cos(c.a), Math.sin(c.a)],
        swayFn: () => 0.6,
      }),
    );
  }
}

function buildSnag(t, out) {
  const rng = createRng(t.seed);
  const pts = trunkPoints(t, rng, 4, 1, 0.25);
  const radii = pts.map((_, i) => t.radius * (1.3 - (i / (pts.length - 1)) * 0.75));
  out.darkTrunks.push(trunkColors(tubeGeometry(pts, radii, { sides: 6, vScale: 1 / BARK_METERS }), t.y, rng.range(0.7, 0.9)));
  const ns = rng.int(2, 4);
  for (let b = 0; b < ns; b++) {
    const p = pointAt(pts, rng.range(0.35, 0.85));
    const a = rng.next() * Math.PI * 2;
    const len = rng.range(0.4, 1.4);
    const end = [p[0] + Math.cos(a) * len, p[1] + len * rng.range(-0.1, 0.7), p[2] + Math.sin(a) * len];
    out.darkTrunks.push(trunkColors(tubeGeometry([p, end], [0.05, 0.015], { sides: 4, vScale: 1 / BARK_METERS }), t.y, 0.8));
  }
}

function groundCards(items, out, { cards, aspect, swayTop, tintBase }) {
  for (const it of items) {
    const rng = createRng(it.seed);
    const w = it.width ?? it.height * aspect;
    for (let c = 0; c < cards; c++) {
      out.push(
        leafCard({
          width: w * rng.range(0.85, 1.1),
          height: it.height * rng.range(0.85, 1.1),
          pivot: 0,
          position: [it.x + rng.spread(0.1), it.y - 0.05, it.z + rng.spread(0.1)],
          rotation: [rng.spread(0.12), it.rotation + (c / cards) * Math.PI, rng.spread(0.12)],
          tint: tintFrom(rng, tintBase, 0.16),
          outward: [Math.cos(it.rotation), Math.sin(it.rotation)],
          swayFn: (f) => f * f * swayTop,
        }),
      );
    }
  }
}

export function createVegetation(textures, timeUniform) {
  const parts = { birchTrunks: [], darkTrunks: [], leafCards: [], willowCards: [] };
  for (const t of TREES) {
    if (t.kind === 'birch') buildBirch(t, parts);
    else if (t.kind === 'willow') buildWillow(t, parts);
    else buildSnag(t, parts);
  }
  const bushes = [];
  const reeds = [];
  const grass = [];
  groundCards(BUSHES, bushes, { cards: 3, aspect: 2, swayTop: 0.35, tintBase: 0.95 });
  groundCards(REEDS, reeds, { cards: 3, aspect: 0.55, swayTop: 1.0, tintBase: 1.0 });
  groundCards(GRASS, grass, { cards: 2, aspect: 2, swayTop: 0.4, tintBase: 1.0 });

  const group = new THREE.Group();
  group.name = 'vegetacion';
  const add = (geos, material, name) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(merge(geos), material);
    mesh.name = name;
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  add(parts.birchTrunks, new THREE.MeshLambertMaterial({ map: textures.birchBark, vertexColors: true }), 'troncos-abedul');
  add(parts.darkTrunks, new THREE.MeshLambertMaterial({ map: textures.darkBark, vertexColors: true }), 'troncos-oscuros');
  add(parts.leafCards, foliageMaterial(textures.birchLeaves, timeUniform, 1), 'hojas');
  add(parts.willowCards, foliageMaterial(textures.willowLeaves, timeUniform, 1.4), 'sauces');
  add(bushes, foliageMaterial(textures.bush, timeUniform, 0.6), 'arbustos');
  add(reeds, foliageMaterial(textures.reeds, timeUniform, 0.9), 'juncos');
  add(grass, foliageMaterial(textures.grass, timeUniform, 0.5), 'hierba');
  return group;
}
