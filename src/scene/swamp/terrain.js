// Malla del terreno: rejilla desplazada por heightAt, coloreada por vértice (musgo, humedad, sendero).
import * as THREE from 'three';
import { fbm2D } from '../../core/noise.js';
import { lerp, smoothstep, distToPolyline } from '../../core/math.js';
import { WORLD, HUT, PATH, ditchCenterZ } from '../../world/layout.js';
import { heightAt, puddleAt } from '../../world/terrain.js';
import { addGroundHole } from '../../shaders/patches.js';

const TEXTURE_METERS = 3.2; // 128 px de barro cada 3.2 m

export function createTerrain(textures) {
  const size = WORLD.terrainSize;
  const segments = 152;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD.centerX, 0, WORLD.centerZ);

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    uv.setXY(i, x / TEXTURE_METERS, -z / TEXTURE_METERS);

    const moss = smoothstep(0.45, 0.68, fbm2D(x * 0.045, z * 0.045, { seed: 5, octaves: 3 }));
    const wetDitch = smoothstep(4.5, 1.5, Math.abs(z - ditchCenterZ(x)));
    const wetPuddle = Math.min(1, puddleAt(x, z) * 1.6 + smoothstep(0.0, 0.2, puddleAt(x, z)) * 0.3);
    const trodden = smoothstep(1.5, 0.3, distToPolyline(x, z, PATH));
    const dry = smoothstep(HUT.moundRadius, HUT.flatRadius, Math.hypot(x - HUT.x, z - HUT.z));
    const jitter = (fbm2D(x * 0.7, z * 0.7, { seed: 9, octaves: 1 }) - 0.5) * 0.12;

    let r = 1 + jitter;
    let g = 1 + jitter;
    let b = 1 + jitter;
    // Musgo: verde apagado.
    const m = moss * (1 - trodden) * 0.55;
    r = lerp(r, 0.8, m);
    g = lerp(g, 1.12, m);
    b = lerp(b, 0.72, m);
    // Humedad: más oscuro.
    const wet = Math.max(wetDitch * 0.45, wetPuddle * 0.5, trodden * 0.22);
    r *= 1 - wet;
    g *= 1 - wet * 0.95;
    b *= 1 - wet * 0.85;
    // El montículo de la choza está más seco y claro.
    r *= 1 + dry * 0.12;
    g *= 1 + dry * 0.1;
    b *= 1 + dry * 0.06;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({ map: textures.mud, vertexColors: true });
  addGroundHole(material, new THREE.Vector2(HUT.x, HUT.z), HUT.outerRadius - 0.05);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terreno';
  return mesh;
}
