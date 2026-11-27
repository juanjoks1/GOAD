// Luces horneadas (por vértice) del interior. Coordenadas del mundo.
// El exterior usa luces de Three.js (hemisférica + direccional, sin sombras).
import { HUT, FLOOR_Y, CORRIDOR, CORRIDOR_Y, STAIRS } from '../../world/layout.js';

const X = HUT.x;
const Z = HUT.z;

/** Interior de la choza: entra luz gris por la puerta y un resplandor frío sube por la escalera. */
export const HUT_LIGHTS = {
  ambient: [0.19, 0.195, 0.18],
  lights: [
    { position: [X, FLOOR_Y + 1.3, Z + HUT.outerRadius + 0.8], color: [0.75, 0.8, 0.7], intensity: 1.6, range: 9, wrap: 0.25, falloff: 1.4 },
    { position: [X, FLOOR_Y + 0.25, Z + HUT.innerRadius - 0.6], color: [0.42, 0.42, 0.37], intensity: 0.7, range: 3.6 },
    { position: [X, FLOOR_Y - 1.4, Z - 0.9], color: [0.4, 0.45, 0.5], intensity: 0.5, range: 3.2, wrap: 0.3 },
  ],
};

/** Escalera y pasillo: bombillas cálidas (una fundida), luz de emergencia fría y luz bajo la puerta. */
export const UNDERGROUND_LIGHTS = {
  ambient: [0.07, 0.075, 0.072],
  lights: [
    // Luz del día que cae por la abertura de la escalera.
    { position: [X, FLOOR_Y + 0.6, Z - 0.8], color: [0.6, 0.64, 0.58], intensity: 1.5, range: 6.5, wrap: 0.2, falloff: 1.5 },
    ...CORRIDOR.bulbs
      .filter((b) => b.on)
      .map((b) => ({ position: [X, CORRIDOR_Y + 1.95, Z + b.z], color: [1.0, 0.8, 0.52], intensity: 1.6, range: 6.0, wrap: 0.12, falloff: 1.6 })),
    { position: [X, CORRIDOR_Y + 2.08, Z + CORRIDOR.zEnd + 0.45], color: [0.7, 0.84, 1.0], intensity: 1.35, range: 5.5, wrap: 0.1, falloff: 1.8 },
    { position: [X, CORRIDOR_Y + 0.03, Z + CORRIDOR.zEnd + 0.08], color: [0.8, 0.9, 1.0], intensity: 0.95, range: 1.5, wrap: 0 },
  ],
};

/** Oscurece rincones: aristas entre muros, piso y techo del túnel. */
export function tunnelOcclusion(x, y, z) {
  const lz = z - Z;
  const edgeX = STAIRS.halfWidth - Math.abs(x - X);
  const floor = lz > STAIRS.zBottom ? FLOOR_Y - STAIRS.depth * ((STAIRS.zTop - lz) / (STAIRS.zTop - STAIRS.zBottom)) : CORRIDOR_Y;
  const ceil = (lz > STAIRS.zBottom ? floor : CORRIDOR_Y) + STAIRS.clearance;
  const d = [Math.abs(edgeX), Math.abs(y - floor), Math.abs(ceil - y)].sort((a, b) => a - b);
  const k = Math.min(1, d[1] / 0.4);
  return 0.62 + 0.38 * k * k * (3 - 2 * k);
}
