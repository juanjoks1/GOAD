// Puntos de control: si una entidad te atrapa, vuelves al último que alcanzaste.
import { CHECKPOINT_RADIUS } from '../config.js';
import { SPAWN, BRIDGE, HUT, FLOOR_Y, STAIRS, CORRIDOR_Y } from './layout.js';
import { heightAt } from './terrain.js';

const ground = (x, z) => ({ x, z, y: heightAt(x, z) });

/** En orden de avance. yaw 0 = mirando hacia el norte (−z). */
export const CHECKPOINTS = [
  { id: 'inicio', ...ground(SPAWN.x, SPAWN.z), yaw: SPAWN.yaw },
  { id: 'puente', ...ground(BRIDGE.x, BRIDGE.z - BRIDGE.halfLength - 1.2), yaw: 0 },
  { id: 'claro', ...ground(HUT.x + 1.2, HUT.z + 12), yaw: 0 },
  { id: 'choza', x: HUT.x, y: FLOOR_Y, z: HUT.z + STAIRS.zTop + 0.6, yaw: 0 },
  { id: 'pasillo', x: HUT.x, y: CORRIDOR_Y, z: HUT.z + STAIRS.zBottom - 0.8, yaw: 0 },
];

/** Índice del punto de control alcanzado (solo avanza). */
export function reachCheckpoint(current, feet) {
  let best = current;
  for (let i = current + 1; i < CHECKPOINTS.length; i++) {
    const c = CHECKPOINTS[i];
    if (Math.hypot(feet.x - c.x, feet.z - c.z) < CHECKPOINT_RADIUS && Math.abs(feet.y - c.y) < 1.5) best = i;
  }
  return best;
}
