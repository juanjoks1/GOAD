// Mundo físico del pantano: qué se pisa, contra qué se choca y por dónde no se pasa.
import { createPhysicsWorld } from './physics.js';
import {
  HUT, FLOOR_Y, STAIRS, CORRIDOR, CORRIDOR_Y, BRIDGE, DITCH, WORLD, DOOR_GAP_ANGLE,
  ditchCenterZ, onBridge, inStairOpening, stairHeightAt, toHutLocal,
} from './layout.js';
import { heightAt, puddleAt, BRIDGE_DECK_Y } from './terrain.js';
import { TREES, HUT_POSTS, FENCE_POSTS, LOOSE_POSTS } from './placement.js';

const inCorridorPuddle = (lx, lz) => CORRIDOR.puddles.some((p) => Math.hypot(lx - p.x, lz - p.z) < p.r * 0.85);

function surfaces() {
  return [
    {
      id: 'terreno',
      type: 'mud',
      contains: (x, z) => {
        const { lx, lz } = toHutLocal(x, z);
        return Math.hypot(lx, lz) >= HUT.outerRadius;
      },
      height: heightAt,
      typeAt: (x, z) => (puddleAt(x, z) > 0.5 ? 'water' : 'mud'),
    },
    {
      id: 'piso-choza',
      type: 'concrete',
      contains: (x, z) => {
        const { lx, lz } = toHutLocal(x, z);
        return Math.hypot(lx, lz) < HUT.outerRadius && !inStairOpening(lx, lz);
      },
      height: () => FLOOR_Y,
    },
    {
      id: 'escalera',
      type: 'concrete',
      contains: (x, z) => {
        const { lx, lz } = toHutLocal(x, z);
        return Math.abs(lx) < STAIRS.halfWidth && lz <= STAIRS.zTop && lz >= STAIRS.zBottom;
      },
      height: (x, z) => stairHeightAt(z - HUT.z),
    },
    {
      id: 'pasillo',
      type: 'concrete',
      contains: (x, z) => {
        const { lx, lz } = toHutLocal(x, z);
        return Math.abs(lx) < CORRIDOR.halfWidth && lz < CORRIDOR.zStart && lz >= CORRIDOR.zEnd - 0.5;
      },
      height: () => CORRIDOR_Y,
      typeAt: (x, z) => {
        const { lx, lz } = toHutLocal(x, z);
        return inCorridorPuddle(lx, lz) ? 'concrete-wet' : 'concrete';
      },
    },
    {
      id: 'puente',
      type: 'wood',
      contains: onBridge,
      height: () => BRIDGE_DECK_Y,
    },
  ];
}

function segment(ax, az, bx, bz, yMin, yMax) {
  return { kind: 'segment', ax, az, bx, bz, yMin, yMax };
}

function hutWallColliders() {
  const out = [];
  const yMin = HUT.groundHeight - 0.3; // no baja hasta la escalera que pasa por debajo
  const yMax = HUT.groundHeight + HUT.wallHeight;
  const start = DOOR_GAP_ANGLE / 2;
  const span = Math.PI * 2 - DOOR_GAP_ANGLE;
  const n = 32;
  for (const r of [HUT.outerRadius, HUT.innerRadius]) {
    for (let i = 0; i < n; i++) {
      const t0 = start + (span * i) / n;
      const t1 = start + (span * (i + 1)) / n;
      out.push(segment(
        HUT.x + Math.sin(t0) * r, HUT.z + Math.cos(t0) * r,
        HUT.x + Math.sin(t1) * r, HUT.z + Math.cos(t1) * r,
        yMin, yMax,
      ));
    }
  }
  // Jambas de la puerta.
  for (const t of [start, -start]) {
    out.push(segment(
      HUT.x + Math.sin(t) * HUT.innerRadius, HUT.z + Math.cos(t) * HUT.innerRadius,
      HUT.x + Math.sin(t) * HUT.outerRadius, HUT.z + Math.cos(t) * HUT.outerRadius,
      yMin, yMax,
    ));
  }
  return out;
}

function undergroundColliders() {
  const out = [];
  const X = HUT.x;
  const Z = HUT.z;
  const hw = STAIRS.halfWidth;
  const low = CORRIDOR_Y - 1;
  // Parapetos alrededor de la abertura (solo sobre el piso).
  const px = hw + 0.08;
  const pEnd = STAIRS.openingEnd - 0.08;
  for (const s of [-1, 1]) out.push(segment(X + s * px, Z + STAIRS.zTop, X + s * px, Z + pEnd, FLOOR_Y - 0.05, FLOOR_Y + 0.9));
  out.push(segment(X - px - 0.08, Z + pEnd, X + px + 0.08, Z + pEnd, FLOOR_Y - 0.05, FLOOR_Y + 0.9));
  // Muros de la escalera y del pasillo (bajo el piso).
  for (const s of [-1, 1]) {
    out.push(segment(X + s * hw, Z + STAIRS.zTop, X + s * hw, Z + STAIRS.zBottom, low, FLOOR_Y - 0.05));
    out.push(segment(X + s * CORRIDOR.halfWidth, Z + CORRIDOR.zStart, X + s * CORRIDOR.halfWidth, Z + CORRIDOR.zEnd, low, CORRIDOR_Y + 3));
  }
  // Muro del fondo con la puerta metálica (cerrada).
  out.push(segment(X - CORRIDOR.halfWidth, Z + CORRIDOR.zEnd, X + CORRIDOR.halfWidth, Z + CORRIDOR.zEnd, low, CORRIDOR_Y + 3));
  return out;
}

function propColliders() {
  const out = [];
  for (const t of TREES) out.push({ kind: 'circle', x: t.x, z: t.z, r: t.radius + 0.06, yMin: t.y - 0.5, yMax: t.y + 40 });
  for (const p of [...HUT_POSTS, ...FENCE_POSTS, ...LOOSE_POSTS]) {
    out.push({ kind: 'circle', x: p.x, z: p.z, r: p.radius + 0.04, yMin: p.y - 0.5, yMax: p.y + p.height });
  }
  // Pasamanos del puente.
  const rx = BRIDGE.x + BRIDGE.railX;
  for (const oz of BRIDGE.railPosts) out.push({ kind: 'circle', x: rx, z: BRIDGE.z + oz, r: 0.08, yMin: BRIDGE_DECK_Y - 3, yMax: BRIDGE_DECK_Y + 1.2 });
  out.push(segment(rx, BRIDGE.z + BRIDGE.railPosts[0], rx, BRIDGE.z + BRIDGE.railBreak, BRIDGE_DECK_Y - 3, BRIDGE_DECK_Y + 1.1));
  return out;
}

function blockers() {
  return [
    // Agua de la zanja (salvo sobre el puente).
    (x, z) => Math.abs(z - ditchCenterZ(x)) < DITCH.blockedHalfWidth && !onBridge(x, z),
    // Borde del mundo.
    (x, z) => Math.hypot(x - WORLD.centerX, z - WORLD.centerZ) > WORLD.radius,
  ];
}

export function createSwampPhysics() {
  return createPhysicsWorld({
    surfaces: surfaces(),
    colliders: [...hutWallColliders(), ...undergroundColliders(), ...propColliders()],
    blockers: blockers(),
  });
}
