// Ayudantes de geometría low-poly: troncos, tarjetas de follaje, transformaciones y fusión.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeVertexColors } from './bake.js';

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/**
 * Tubo cónico a lo largo de una polilínea (tronco, rama, poste).
 * @param {number[][]} points  [[x, y, z], ...]
 * @param {number[]} radii     radio en cada punto
 */
export function tubeGeometry(points, radii, { sides = 6, vScale = 1, uRepeat = 1 } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let length = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const p = new THREE.Vector3(...points[i]);
    const a = new THREE.Vector3(...points[Math.max(0, i - 1)]);
    const b = new THREE.Vector3(...points[Math.min(points.length - 1, i + 1)]);
    dir.subVectors(b, a).normalize();
    if (i > 0) length += p.distanceTo(new THREE.Vector3(...points[i - 1]));
    // base ortonormal alrededor de la dirección
    side.crossVectors(Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, dir).normalize();
    fwd.crossVectors(dir, side).normalize();
    for (let s = 0; s <= sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const nx = side.x * Math.cos(ang) + fwd.x * Math.sin(ang);
      const ny = side.y * Math.cos(ang) + fwd.y * Math.sin(ang);
      const nz = side.z * Math.cos(ang) + fwd.z * Math.sin(ang);
      positions.push(p.x + nx * radii[i], p.y + ny * radii[i], p.z + nz * radii[i]);
      normals.push(nx, ny, nz);
      uvs.push((s / sides) * uRepeat, length * vScale);
    }
  }
  const ring = sides + 1;
  for (let i = 0; i < points.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * ring + s;
      const b = a + ring;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/** Plano vertical (en XY) con pivote en la base (pivot = 0), el centro (0.5) o arriba (1). */
export function cardGeometry(width, height, pivot = 0) {
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height * (0.5 - pivot), 0);
  return geo;
}

/** Varias tarjetas cruzadas alrededor del eje Y. */
export function crossedCards(width, height, count = 2, pivot = 0) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const g = cardGeometry(width, height, pivot);
    g.rotateY((i / count) * Math.PI);
    parts.push(g);
  }
  return merge(parts);
}

/** Aplica posición, rotación (Euler XYZ) y escala a la geometría (en el sitio). */
export function transform(geo, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], order = 'XYZ' } = {}) {
  tmpEuler.set(rotation[0], rotation[1], rotation[2], order);
  tmpQuat.setFromEuler(tmpEuler);
  tmpMatrix.compose(new THREE.Vector3(...position), tmpQuat, new THREE.Vector3(...scale));
  geo.applyMatrix4(tmpMatrix);
  return geo;
}

/** Atributo de color por vértice: constante o calculado con fn(x, y, z) → [r, g, b]. */
export function setColors(geo, colorOrFn) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = typeof colorOrFn === 'function' ? colorOrFn(pos.getX(i), pos.getY(i), pos.getZ(i), i) : colorOrFn;
    arr[i * 3] = c[0];
    arr[i * 3 + 1] = c[1];
    arr[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Atributo flotante por vértice calculado con fn(x, y, z, i). */
export function setFloatAttribute(geo, name, fn) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) arr[i] = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i);
  geo.setAttribute(name, new THREE.BufferAttribute(arr, 1));
  return geo;
}

/** Reemplaza todas las normales por una dirección (follaje iluminado de forma uniforme). */
export function setNormals(geo, fn) {
  const pos = geo.attributes.position;
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const r = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    v.set(r[0], r[1], r[2]).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return geo;
}

/** Fusiona geometrías (todas deben tener los mismos atributos). */
export function merge(geos) {
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
}

/** Hornea luz en la geometría (ya en coordenadas del mundo) y la guarda como color de vértice. */
export function bake(geo, options) {
  const colors = bakeVertexColors(geo.attributes.position.array, geo.attributes.normal.array, options);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Plano subdividido con la cara mirando a +Z, en el plano XY. */
export function gridPlane(width, height, cell = 0.3) {
  return new THREE.PlaneGeometry(width, height, Math.max(1, Math.round(width / cell)), Math.max(1, Math.round(height / cell)));
}
