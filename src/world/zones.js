// Zonas acústicas y de atmósfera. Un único número continuo describe "qué tan adentro" está el jugador:
//   0   = exterior del pantano
//   0.3 = dentro de la choza
//   1   = al fondo de la escalera y en el pasillo subterráneo
// Audio (crossfade) y niebla lo usan para interpolar.
import { clamp, smoothstep } from '../core/math.js';
import { HUT, FLOOR_Y, STAIRS, CORRIDOR, METAL_DOOR_WORLD, toHutLocal } from './layout.js';
import { heightAt } from './terrain.js';

export const HUT_ZONE_LEVEL = 0.3;

/** ¿El punto está en la escalera o el pasillo, bajo tierra? */
export function isUnderground(x, y, z) {
  const { lx, lz } = toHutLocal(x, z);
  if (Math.abs(lx) > STAIRS.halfWidth + 0.3) return false;
  if (lz > STAIRS.zTop || lz < CORRIDOR.zEnd - 1) return false;
  if (Math.hypot(lx, lz) < HUT.innerRadius) return y < FLOOR_Y - 0.02;
  return y < heightAt(x, z) - 1.2;
}

export function interiorFactor(x, y, z) {
  const { lx, lz } = toHutLocal(x, z);
  const r = Math.hypot(lx, lz);
  const hut = HUT_ZONE_LEVEL * smoothstep(HUT.outerRadius + 0.6, HUT.innerRadius - 0.8, r);
  if (!isUnderground(x, y, z)) return hut;
  const depth = clamp((FLOOR_Y - y) / STAIRS.depth, 0, 1);
  return Math.max(hut, HUT_ZONE_LEVEL + (1 - HUT_ZONE_LEVEL) * depth);
}

/** 0 lejos, 1 frente a la puerta metálica (solo bajo tierra). Sirve para el zumbido eléctrico. */
export function doorProximity(x, y, z, range = 12) {
  if (!isUnderground(x, y, z)) return 0;
  const d = Math.hypot(x - METAL_DOOR_WORLD.x, z - METAL_DOOR_WORLD.z);
  return clamp(1 - d / range, 0, 1);
}
