// Agua: la zanja (una franja curva) y los charcos (discos que se apoyan sobre el barro).
import * as THREE from 'three';
import vertexShader from '../../shaders/water.vert.glsl?raw';
import fragmentShader from '../../shaders/water.frag.glsl?raw';
import { DITCH, WORLD, HUT, CORRIDOR, CORRIDOR_Y, ditchCenterZ } from '../../world/layout.js';
import { heightAt, PUDDLES } from '../../world/terrain.js';

function waterMaterial(textures, timeUniform, { deep, reflect, mud, sheen }) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDeep: { value: new THREE.Color(...deep) },
        uReflect: { value: new THREE.Color(...reflect) },
        uMud: { value: new THREE.Color(...mud) },
        uSheen: { value: sheen },
        uNoise: { value: textures.waterNoise },
      },
    ]),
    vertexShader,
    fragmentShader,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // UniformsUtils.merge clona los valores: el tiempo se comparte después.
  material.uniforms.uTime = timeUniform;
  return material;
}

/** Disco en coordenadas polares; `heightFn(x, z)` da la altura de cada vértice. */
function discGeometry(cx, cz, radius, heightFn, rings = 4, sectors = 20) {
  const positions = [];
  const edges = [];
  const indices = [];
  positions.push(cx, heightFn(cx, cz), cz);
  edges.push(0);
  for (let r = 1; r <= rings; r++) {
    const rr = (r / rings) * radius;
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      positions.push(x, heightFn(x, z), z);
      edges.push(r / rings);
    }
  }
  for (let s = 0; s < sectors; s++) indices.push(0, 1 + ((s + 1) % sectors), 1 + s);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * sectors;
    const b0 = 1 + r * sectors;
    for (let s = 0; s < sectors; s++) {
      const s1 = (s + 1) % sectors;
      indices.push(a0 + s, a0 + s1, b0 + s, b0 + s, a0 + s1, b0 + s1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('edge', new THREE.Float32BufferAttribute(edges, 1));
  geo.setIndex(indices);
  return geo;
}

function mergeSimple(geos) {
  // Fusión manual (solo position + edge + índice).
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const edge = new Float32Array(vCount);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    edge.set(g.attributes.edge.array, vo);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function createWater(textures, timeUniform) {
  const group = new THREE.Group();
  group.name = 'agua';

  // Zanja: franja que sigue la curva del cauce.
  const span = WORLD.terrainSize;
  const strip = new THREE.PlaneGeometry(span, DITCH.halfWidth * 2.2, 120, 1);
  strip.rotateX(-Math.PI / 2);
  const sp = strip.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i) + WORLD.centerX;
    sp.setXYZ(i, x, DITCH.waterLevel, ditchCenterZ(x) + sp.getZ(i));
  }
  strip.setAttribute('edge', new THREE.Float32BufferAttribute(new Float32Array(sp.count), 1));
  strip.deleteAttribute('normal');
  strip.deleteAttribute('uv');
  const ditchMat = waterMaterial(textures, timeUniform, { deep: [0.1, 0.11, 0.075], reflect: [0.4, 0.43, 0.38], mud: [0.16, 0.14, 0.1], sheen: 0.04 });
  group.add(new THREE.Mesh(strip, ditchMat));

  // Charcos sobre el barro.
  const puddles = mergeSimple(PUDDLES.map((p) => discGeometry(p.x, p.z, p.r, (x, z) => heightAt(x, z) + 0.03)));
  const puddleMat = waterMaterial(textures, timeUniform, { deep: [0.06, 0.065, 0.05], reflect: [0.45, 0.48, 0.42], mud: [0.15, 0.125, 0.09], sheen: 0.05 });
  group.add(new THREE.Mesh(puddles, puddleMat));

  // Charcos del pasillo subterráneo.
  const under = mergeSimple(
    CORRIDOR.puddles.map((p) => discGeometry(HUT.x + p.x, HUT.z + p.z, p.r, () => CORRIDOR_Y + 0.006, 3, 16)),
  );
  const underMat = waterMaterial(textures, timeUniform, { deep: [0.015, 0.017, 0.016], reflect: [0.17, 0.17, 0.15], mud: [0.05, 0.05, 0.045], sheen: 0.03 });
  group.add(new THREE.Mesh(under, underMat));
  return group;
}
