// La choza circular: troncos y paja por fuera; por dentro, concreto gastado con arcada ciega,
// piso de hexágonos y una espiral pintada frente a la escalera que baja.
import * as THREE from 'three';
import { HUT, FLOOR_Y, STAIRS, DOOR_GAP_ANGLE, inStairOpening } from '../../world/layout.js';
import { withRepeat } from '../../textures/library.js';
import { bake, merge, transform } from '../builders.js';
import { HUT_LIGHTS } from './lighting.js';

const X = HUT.x;
const Z = HUT.z;
const GROUND = HUT.groundHeight;
const WALL_TOP = GROUND + HUT.wallHeight;
const DOOR_TOP = FLOOR_Y + HUT.doorHeight;
const ROOF_BASE = WALL_TOP - HUT.roofHeight * (1 - HUT.outerRadius / HUT.roofRadius);
const APEX = ROOF_BASE + HUT.roofHeight;

function flipNormals(geo) {
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return geo;
}

/** Segmento de cilindro abierto entre dos alturas (coordenadas del mundo). */
function wallRing(radius, y0, y1, thetaStart, thetaLength, radial, heightSegs = 1) {
  const g = new THREE.CylinderGeometry(radius, radius, y1 - y0, radial, heightSegs, true, thetaStart, thetaLength);
  g.translate(X, (y0 + y1) / 2, Z);
  return g;
}

/** Piso: rejilla de 0.25 m dentro del círculo, sin la abertura de la escalera. UV en metros. */
function floorGeometry() {
  const cell = 0.25;
  const R = 3.98;
  const n = Math.ceil(R / cell);
  const positions = [];
  const uvs = [];
  const indices = [];
  const map = new Map();
  const vertex = (vx, vz) => {
    const key = `${vx.toFixed(3)},${vz.toFixed(3)}`;
    if (map.has(key)) return map.get(key);
    let x = vx;
    let z = vz;
    const r = Math.hypot(x, z);
    if (r > R) {
      x *= R / r;
      z *= R / r;
    }
    positions.push(X + x, FLOOR_Y, Z + z);
    uvs.push((X + x) / 1.6, -(Z + z) / 1.387);
    map.set(key, positions.length / 3 - 1);
    return map.get(key);
  };
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const x0 = i * cell;
      const z0 = j * cell;
      const cx = x0 + cell / 2;
      const cz = z0 + cell / 2;
      if (Math.hypot(cx, cz) > R || inStairOpening(cx, cz)) continue;
      const a = vertex(x0, z0);
      const b = vertex(x0 + cell, z0);
      const c = vertex(x0, z0 + cell);
      const d = vertex(x0 + cell, z0 + cell);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(indices);
  return geo;
}

function bakedMaterial(map, extra = {}) {
  return new THREE.MeshBasicMaterial({ map, vertexColors: true, ...extra });
}

export function createHut(textures) {
  const group = new THREE.Group();
  group.name = 'choza';
  const gapHalf = DOOR_GAP_ANGLE / 2;
  const wallStart = gapHalf;
  const wallSpan = Math.PI * 2 - DOOR_GAP_ANGLE;

  // --- Exterior -------------------------------------------------------------------------------
  const logs = withRepeat(textures.hutLogs, 10, 1);
  const outer = merge([
    wallRing(HUT.outerRadius, GROUND - 0.1, WALL_TOP, wallStart, wallSpan, 32),
    // dintel sobre la puerta
    wallRing(HUT.outerRadius, DOOR_TOP, WALL_TOP, -gapHalf, DOOR_GAP_ANGLE, 3),
  ]);
  group.add(new THREE.Mesh(outer, new THREE.MeshLambertMaterial({ map: logs })));

  // Jambas, dintel de madera y umbral de concreto.
  const rm = (HUT.outerRadius + HUT.innerRadius) / 2;
  const frame = [];
  for (const t of [gapHalf, -gapHalf]) {
    const g = new THREE.BoxGeometry(0.14, HUT.doorHeight + 0.05, HUT.outerRadius - HUT.innerRadius + 0.08);
    transform(g, { position: [X + Math.sin(t) * rm, FLOOR_Y + HUT.doorHeight / 2, Z + Math.cos(t) * rm], rotation: [0, t, 0] });
    frame.push(g);
  }
  const lintel = new THREE.BoxGeometry(HUT.doorWidth + 0.3, 0.13, 0.3);
  transform(lintel, { position: [X, DOOR_TOP + 0.06, Z + rm] });
  frame.push(lintel);
  group.add(new THREE.Mesh(merge(frame), new THREE.MeshLambertMaterial({ map: textures.postWood, color: 0xb0a898 })));

  const sill = new THREE.BoxGeometry(HUT.doorWidth, FLOOR_Y - GROUND + 0.06, 0.36);
  transform(sill, { position: [X, (FLOOR_Y + GROUND) / 2 - 0.03, Z + HUT.outerRadius - 0.1] });
  group.add(new THREE.Mesh(sill, new THREE.MeshLambertMaterial({ map: textures.wetFloor, color: 0x9a9a92 })));

  // Techo de paja, fleco del alero y remate.
  const roof = new THREE.ConeGeometry(HUT.roofRadius, HUT.roofHeight, 24, 3, true);
  roof.translate(X, ROOF_BASE + HUT.roofHeight / 2, Z);
  group.add(new THREE.Mesh(roof, new THREE.MeshLambertMaterial({ map: withRepeat(textures.thatch, 12, 3) })));

  const fringe = new THREE.CylinderGeometry(HUT.roofRadius - 0.06, HUT.roofRadius + 0.12, 0.5, 48, 1, true);
  fringe.translate(X, ROOF_BASE - 0.13, Z);
  group.add(
    new THREE.Mesh(
      fringe,
      new THREE.MeshLambertMaterial({ map: withRepeat(textures.thatchFringe, 14, 1), alphaTest: 0.5, side: THREE.DoubleSide }),
    ),
  );
  const knot = new THREE.CylinderGeometry(0.1, 0.3, 0.55, 8, 1);
  knot.translate(X, APEX - 0.05, Z);
  const stick = new THREE.CylinderGeometry(0.03, 0.04, 0.9, 5, 1);
  transform(stick, { position: [X + 0.05, APEX + 0.35, Z], rotation: [0.08, 0, 0.12] });
  group.add(new THREE.Mesh(merge([knot, stick]), new THREE.MeshLambertMaterial({ map: textures.darkBark })));

  // --- Interior (luz horneada) -----------------------------------------------------------------
  const innerTop = WALL_TOP + 0.25; // atraviesa el techo para no dejar rendijas
  const inner = merge([
    wallRing(HUT.innerRadius, FLOOR_Y - 0.02, innerTop, wallStart, wallSpan, 64, 8),
    wallRing(HUT.innerRadius, DOOR_TOP, innerTop, -gapHalf, DOOR_GAP_ANGLE, 4, 2),
  ]);
  flipNormals(inner);
  bake(inner, HUT_LIGHTS);
  group.add(new THREE.Mesh(inner, bakedMaterial(withRepeat(textures.archWall, 10, 1), { side: THREE.BackSide })));

  const roofInner = new THREE.ConeGeometry(HUT.roofRadius - 0.02, HUT.roofHeight, 32, 6, true);
  roofInner.translate(X, ROOF_BASE + HUT.roofHeight / 2 - 0.03, Z);
  flipNormals(roofInner);
  bake(roofInner, { ...HUT_LIGHTS, tint: [0.55, 0.52, 0.48] });
  group.add(new THREE.Mesh(roofInner, bakedMaterial(withRepeat(textures.thatch, 12, 3), { side: THREE.BackSide })));

  // Vigas del techo hacia el vértice.
  const rafters = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.31;
    const r0 = HUT.innerRadius - 0.05;
    const p0 = new THREE.Vector3(X + Math.sin(a) * r0, WALL_TOP - 0.02, Z + Math.cos(a) * r0);
    const p1 = new THREE.Vector3(X, APEX - 0.35, Z);
    const len = p0.distanceTo(p1);
    const g = new THREE.BoxGeometry(0.09, 0.09, len, 1, 1, 6);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p1.clone().sub(p0).normalize());
    g.applyQuaternion(q);
    g.translate(mid.x, mid.y, mid.z);
    rafters.push(g);
  }
  const rafterGeo = merge(rafters);
  bake(rafterGeo, { ...HUT_LIGHTS, tint: [0.6, 0.55, 0.5] });
  group.add(new THREE.Mesh(rafterGeo, bakedMaterial(textures.darkBark)));

  // Piso de baldosas hexagonales.
  const floor = floorGeometry();
  bake(floor, HUT_LIGHTS);
  group.add(new THREE.Mesh(floor, bakedMaterial(textures.hexFloor)));

  // Espiral pintada frente a la escalera.
  const spiral = new THREE.PlaneGeometry(1.5, 1.5, 6, 6);
  spiral.rotateX(-Math.PI / 2);
  spiral.rotateY(0.4);
  spiral.translate(X, FLOOR_Y + 0.004, Z + 2.35);
  bake(spiral, HUT_LIGHTS);
  group.add(
    new THREE.Mesh(
      spiral,
      bakedMaterial(textures.spiral, { alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    ),
  );

  // Parapetos de concreto alrededor de la abertura.
  const hw = STAIRS.halfWidth;
  const pLen = STAIRS.zTop - (STAIRS.openingEnd - 0.16);
  const parapets = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.16, 0.9, pLen, 1, 3, 12);
    g.translate(X + s * (hw + 0.08), FLOOR_Y + 0.45, Z + (STAIRS.zTop + STAIRS.openingEnd - 0.16) / 2);
    parapets.push(g);
  }
  const north = new THREE.BoxGeometry(hw * 2 + 0.32, 0.9, 0.16, 6, 3, 1);
  north.translate(X, FLOOR_Y + 0.45, Z + STAIRS.openingEnd - 0.08);
  parapets.push(north);
  const parapetGeo = merge(parapets);
  bake(parapetGeo, HUT_LIGHTS);
  group.add(new THREE.Mesh(parapetGeo, bakedMaterial(textures.dampWall)));

  return group;
}
