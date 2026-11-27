// Altura del terreno del pantano. Función pura: la usan la malla, la física y la colocación.
import { fbm2D } from '../core/noise.js';
import { createRng } from '../core/rng.js';
import { lerp, smoothstep, distToPolyline } from '../core/math.js';
import { DITCH, ditchCenterZ, HUT, PATH, SPAWN, WORLD, BRIDGE } from './layout.js';

/** Ondulación natural del barro, sin zanja ni charcos. Rango aproximado [-0.8, 0.8]. */
export function baseHeight(x, z) {
  const broad = fbm2D(x * 0.03, z * 0.03, { seed: 11, octaves: 3 });
  const detail = fbm2D(x * 0.22, z * 0.22, { seed: 23, octaves: 2 });
  return (broad - 0.5) * 1.5 + (detail - 0.5) * 0.18;
}

/** Charcos: depresiones planas con una película de agua encima. */
export const PUDDLES = generatePuddles();

function generatePuddles() {
  const fixed = [
    [0.9, 27.6, 1.6],
    [-0.6, 19.0, 1.3],
    [1.3, -1.5, 1.8],
    [1.6, -11.0, 1.4],
    [-0.4, -20.2, 1.05],
  ];
  const list = fixed.map(([x, z, r]) => ({ x, z, r }));
  const rng = createRng(91);
  for (let i = 0; i < 200 && list.length < 30; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next()) * (WORLD.radius - 4);
    const x = WORLD.centerX + Math.cos(a) * d;
    const z = WORLD.centerZ + Math.sin(a) * d;
    const r = rng.range(0.9, 2.6);
    if (Math.abs(z - ditchCenterZ(x)) < 7 + r) continue;
    if (Math.hypot(x - HUT.x, z - HUT.z) < HUT.moundRadius + r) continue;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 3 + r) continue;
    if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < BRIDGE.halfLength + 4) continue;
    if (list.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 1.5)) continue;
    list.push({ x, z, r });
  }
  for (const p of list) p.floor = baseHeight(p.x, p.z) - 0.1;
  return list;
}

/** Altura final del terreno en (x, z). */
export function heightAt(x, z) {
  let h = baseHeight(x, z);

  // Sendero: el barro pisado queda un poco hundido.
  const dp = distToPolyline(x, z, PATH);
  if (dp < 1.4) h -= 0.06 * smoothstep(1.4, 0.2, dp);

  // Zanja.
  const dz = Math.abs(z - ditchCenterZ(x));
  if (dz < DITCH.halfWidth) h = lerp(h, DITCH.bottom, smoothstep(DITCH.halfWidth, DITCH.halfWidth * 0.3, dz));

  // Montículo aplanado de la choza.
  const dh = Math.hypot(x - HUT.x, z - HUT.z);
  if (dh < HUT.moundRadius) h = lerp(h, HUT.groundHeight, smoothstep(HUT.moundRadius, HUT.flatRadius, dh));

  // Charcos.
  for (const p of PUDDLES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.3) h = lerp(h, p.floor, smoothstep(p.r * 1.3, p.r * 0.45, d));
  }
  return h;
}

/** Cuánto charco hay en (x, z): 0 seco, 1 centro del charco. */
export function puddleAt(x, z) {
  let w = 0;
  for (const p of PUDDLES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) w = Math.max(w, smoothstep(p.r, p.r * 0.55, d));
  }
  return w;
}

/** Altura de la cubierta del puente: por encima del terreno en ambas orillas. */
export const BRIDGE_DECK_Y = (() => {
  let maxH = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const z = BRIDGE.z - BRIDGE.halfLength + (i / 40) * BRIDGE.halfLength * 2;
    for (const dx of [-BRIDGE.halfWidth, 0, BRIDGE.halfWidth]) maxH = Math.max(maxH, heightAt(BRIDGE.x + dx, z));
  }
  return maxH + 0.14;
})();
