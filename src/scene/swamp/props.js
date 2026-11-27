// Postes de madera inclinados, restos de alambre y el puente de tablones sobre la zanja.
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';
import { smoothstep } from '../../core/math.js';
import { BRIDGE, DITCH } from '../../world/layout.js';
import { heightAt, BRIDGE_DECK_Y } from '../../world/terrain.js';
import { HUT_POSTS, FENCE_POSTS, LOOSE_POSTS, DITCH_POSTS } from '../../world/placement.js';
import { tubeGeometry, transform, setColors, merge } from '../builders.js';

const WOOD_METERS = 1.2;
const SINK = 0.35; // cuánto se entierra cada poste en el lodo

/** Matriz de inclinación de un poste alrededor de su base. */
function postMatrix(p) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.leanX, p.rotation, p.leanZ, 'YXZ'));
  m.compose(new THREE.Vector3(p.x, p.y - SINK, p.z), q, new THREE.Vector3(1, 1, 1));
  return m;
}

/** Punto superior (mundo) de un poste, para colgar alambre. */
function postTop(p, below = 0.12) {
  return new THREE.Vector3(0, p.height + SINK - below, 0).applyMatrix4(postMatrix(p));
}

function postGeometry(p, waterLine = null) {
  const h = p.height + SINK;
  const pts = [[0, 0, 0], [0, h * 0.5, 0], [0, h, 0]];
  const radii = [p.radius * 1.05, p.radius, p.radius * 0.92];
  if (p.tip) {
    pts.push([0, h + p.radius * 2.2, 0]);
    radii.push(0.005);
  }
  const g = tubeGeometry(pts, radii, { sides: 6, vScale: 1 / WOOD_METERS });
  g.applyMatrix4(postMatrix(p));
  const rng = createRng(p.seed);
  const tone = rng.range(0.75, 1.05);
  const ground = waterLine ?? p.y;
  setColors(g, (x, y) => {
    const k = (0.42 + 0.58 * smoothstep(ground - 0.05, ground + 0.5, y)) * tone;
    return [k, k * 0.97, k * 0.9];
  });
  return g;
}

/** Alambre viejo entre postes de la cerca: algunos tramos rotos o colgando. */
function wireGeometry() {
  const rng = createRng(77);
  const verts = [];
  const byLine = new Map();
  for (const p of FENCE_POSTS) {
    if (!byLine.has(p.line)) byLine.set(p.line, []);
    byLine.get(p.line).push(p);
  }
  const addCurve = (a, b, sag) => {
    const n = 8;
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const pt = a.clone().lerp(b, t);
      pt.y -= Math.sin(t * Math.PI) * sag;
      verts.push(prev.x, prev.y, prev.z, pt.x, pt.y, pt.z);
      prev = pt;
    }
  };
  for (const posts of byLine.values()) {
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i];
      const b = posts[i + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 3.4) continue;
      const roll = rng.next();
      if (roll < 0.25) continue; // tramo perdido
      const ta = postTop(a);
      const tb = postTop(b);
      if (roll < 0.45) {
        // roto: cuelga desde un poste hasta el barro
        const end = ta.clone().lerp(tb, 0.55);
        end.y = heightAt(end.x, end.z) + 0.02;
        addCurve(ta, end, 0.12);
      } else {
        addCurve(ta, tb, rng.range(0.1, 0.25));
        if (rng.chance(0.5)) addCurve(ta.clone().setY(ta.y - 0.4), tb.clone().setY(tb.y - 0.4), rng.range(0.15, 0.3));
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geo;
}

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

/** Puente: dos largueros, tablones gastados (uno falta, otro está roto), apoyos y un pasamanos roto. */
function bridgeParts() {
  const rng = createRng(4004);
  const planks = [];
  const beams = [];
  const posts = [];
  const deck = BRIDGE_DECK_Y;
  const len = BRIDGE.halfLength * 2;

  for (const sx of [-0.55, 0.55]) {
    const g = box(0.14, 0.18, len + 0.5);
    transform(g, { position: [BRIDGE.x + sx, deck - 0.12, BRIDGE.z], rotation: [rng.spread(0.01), 0, 0] });
    beams.push(setColors(g, [0.75, 0.72, 0.66]));
  }

  const pitch = 0.27;
  const count = Math.floor(len / pitch);
  for (let i = 0; i < count; i++) {
    if (i === 11) continue; // falta un tablón
    const z = BRIDGE.z - BRIDGE.halfLength + pitch * (i + 0.5);
    const broken = i === 17;
    const w = broken ? 0.95 : 1.62 + rng.spread(0.05);
    const g = box(w, 0.05, 0.22 + rng.spread(0.015));
    transform(g, {
      position: [BRIDGE.x + (broken ? -0.32 : rng.spread(0.05)), deck - 0.025 + rng.spread(0.012), z],
      rotation: [rng.spread(0.02), rng.spread(0.035), rng.spread(0.025)],
    });
    const k = rng.range(0.7, 1.05);
    const green = rng.chance(0.3) ? 1.08 : 1;
    planks.push(setColors(g, [k, k * green, k * 0.92]));
  }

  // Apoyos clavados en el agua y en las orillas.
  for (const oz of [-BRIDGE.halfLength + 0.25, -1.0, 1.0, BRIDGE.halfLength - 0.25]) {
    for (const sx of [-0.62, 0.62]) {
      const x = BRIDGE.x + sx;
      const z = BRIDGE.z + oz;
      const bottom = Math.min(heightAt(x, z), DITCH.waterLevel) - 0.4;
      const p = { x, z, y: bottom + SINK, height: deck - 0.05 - bottom - SINK, radius: 0.09, leanX: rng.spread(0.03), leanZ: rng.spread(0.03), rotation: 0, tip: false, seed: rng.int(1, 1e5) };
      posts.push(postGeometry(p, Math.max(DITCH.waterLevel, heightAt(x, z))));
    }
  }

  // Pasamanos (lado este): postes, travesaño y un tramo roto colgando.
  const rx = BRIDGE.x + BRIDGE.railX;
  BRIDGE.railPosts.forEach((oz, i) => {
    const lean = i === BRIDGE.railPosts.length - 1 ? 0.22 : rng.spread(0.04);
    const p = { x: rx, z: BRIDGE.z + oz, y: deck - 0.2, height: 1.15 + SINK - 0.15, radius: 0.065, leanX: rng.spread(0.03), leanZ: lean, rotation: 0, tip: false, seed: rng.int(1, 1e5) };
    posts.push(postGeometry(p, deck - 0.2));
  });
  const z0 = BRIDGE.z + BRIDGE.railPosts[0];
  const z1 = BRIDGE.z + BRIDGE.railBreak;
  const rail = box(0.06, 0.08, z1 - z0 + 0.1);
  transform(rail, { position: [rx, deck + 0.95, (z0 + z1) / 2] });
  beams.push(setColors(rail, [0.8, 0.78, 0.72]));
  const hanging = box(0.06, 0.07, 1.3);
  transform(hanging, { position: [rx + 0.02, deck + 0.68, z1 + 0.55], rotation: [-0.5, 0.05, 0] });
  beams.push(setColors(hanging, [0.7, 0.68, 0.62]));
  return { planks, beams, posts };
}

export function createProps(textures) {
  const group = new THREE.Group();
  group.name = 'postes-y-puente';
  const postMat = new THREE.MeshLambertMaterial({ map: textures.postWood, vertexColors: true });
  const plankMat = new THREE.MeshLambertMaterial({ map: textures.plank, vertexColors: true });

  const allPosts = [
    ...HUT_POSTS.map((p) => postGeometry(p)),
    ...FENCE_POSTS.map((p) => postGeometry(p)),
    ...LOOSE_POSTS.map((p) => postGeometry(p)),
    ...DITCH_POSTS.map((p) => postGeometry({ ...p, y: Math.min(p.y, DITCH.waterLevel) }, DITCH.waterLevel)),
  ];
  const bridge = bridgeParts();
  const posts = new THREE.Mesh(merge([...allPosts, ...bridge.posts]), postMat);
  posts.name = 'postes';
  group.add(posts);
  const wood = new THREE.Mesh(merge([...bridge.planks, ...bridge.beams]), plankMat);
  wood.name = 'puente';
  group.add(wood);

  const wire = new THREE.LineSegments(wireGeometry(), new THREE.LineBasicMaterial({ color: 0x24221d }));
  wire.name = 'alambre';
  group.add(wire);
  return group;
}
