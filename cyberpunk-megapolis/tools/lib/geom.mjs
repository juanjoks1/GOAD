/**
 * Geometry helpers for the offline generators. Builds prefab template meshes
 * out of three.js primitives, groups them per material and converts the result
 * into the flat attribute arrays our GLB writer consumes.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries, mergeVertices } from '../../vendor/three/jsm/utils/BufferGeometryUtils.js';

export { THREE };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/* ------------------------------------------------------------- primitives */
export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rt, rb, h, seg = 10, open = false) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); }
export function sphere(r, seg = 8) { return new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)); }
export function plane(w, h) { return new THREE.PlaneGeometry(w, h); }
export function cone(r, h, seg = 8) { return new THREE.ConeGeometry(r, h, seg); }
export function torus(r, t, seg = 8, rings = 12) { return new THREE.TorusGeometry(r, t, seg, rings); }

/** Extruded convex/concave outline (points in XZ), height along +Y. */
export function prism(points, h) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, h, 0);
  return g;
}

/* ------------------------------------------------------------- transforms */
export function xf(g, { t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(t[0], t[1], t[2]), _q, new THREE.Vector3(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  return g;
}

/**
 * Triplanar projection of UVs at a fixed world scale. Fixes the UV-density
 * degradation the source city assets show on very large horizontal triangles:
 * concrete tiles at a constant density instead of stretched texels.
 */
export function projectUV(g, scale = 0.25, offset = [0, 0]) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor ? nor.getX(i) : 0), ny = Math.abs(nor ? nor.getY(i) : 1), nz = Math.abs(nor ? nor.getZ(i) : 0);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u * scale + offset[0];
    uv[i * 2 + 1] = v * scale + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Remap existing UVs into a sub-rectangle of an atlas. */
export function uvRect(g, [u0, v0, u1, v1]) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

/** Scale UVs so a tiling texture repeats per metre instead of per face. */
export function uvScale(g, sx, sy = sx) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return g;
}

/* ---------------------------------------------------------------- builder */
/** Accumulates geometry per material name for one prefab. */
export class Part {
  constructor() { this.groups = new Map(); }
  add(material, g) {
    if (!g.index) g = mergeVertices(g, 1e-4);
    if (!g.attributes.uv) projectUV(g, 0.25);
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    return this;
  }
  /** merge another Part's contents, optionally transformed */
  addPart(other, tr) {
    for (const [mat, list] of other.groups) {
      for (const g of list) this.add(mat, tr ? xf(g.clone(), tr) : g.clone());
    }
    return this;
  }
  isEmpty() { return this.groups.size === 0; }
  /** -> [{material, position, normal, uv, index}] ready for GLB.mesh() */
  toPrims() {
    const prims = [];
    for (const [material, list] of this.groups) {
      const clean = list.map((g) => {
        const c = g.clone();
        for (const k of Object.keys(c.attributes)) {
          if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
        }
        if (!c.attributes.normal) c.computeVertexNormals();
        return c;
      });
      let merged = clean.length === 1 ? clean[0] : mergeGeometries(clean, false);
      merged = mergeVertices(merged, 1e-4);
      prims.push({
        material,
        position: new Float32Array(merged.attributes.position.array),
        normal: new Float32Array(merged.attributes.normal.array),
        uv: new Float32Array(merged.attributes.uv.array),
        index: new Uint32Array(merged.index.array),
      });
    }
    return prims;
  }
  bounds() {
    const bb = new THREE.Box3();
    for (const list of this.groups.values()) {
      for (const g of list) { g.computeBoundingBox(); bb.union(g.boundingBox); }
    }
    return bb.isEmpty() ? new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()) : bb;
  }
  triCount() {
    let n = 0;
    for (const list of this.groups.values()) for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    return n;
  }
}

export { mergeGeometries, mergeVertices };
