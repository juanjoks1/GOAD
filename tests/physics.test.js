import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhysicsWorld, moveCharacter, resolveCollisions } from '../src/world/physics.js';
import { createSwampPhysics } from '../src/world/swampPhysics.js';
import { heightAt } from '../src/world/terrain.js';
import { SPAWN, PATH, HUT, FLOOR_Y, CORRIDOR_Y, CORRIDOR, BRIDGE, ditchCenterZ } from '../src/world/layout.js';

const OPTS = { radius: 0.28, height: 1.75, stepUp: 0.45, snapDown: 0.4, gravity: 9.8, dt: 1 / 60 };

function spawnState() {
  return { x: SPAWN.x, z: SPAWN.z, y: heightAt(SPAWN.x, SPAWN.z), vy: 0, grounded: true };
}

/** Camina en línea recta hacia (tx, tz). Devuelve true si llega. */
function walkTo(world, s, tx, tz, maxSeconds = 120) {
  const speed = 1.55;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const dx = tx - s.x;
    const dz = tz - s.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    const step = Math.min(d, speed / 60);
    moveCharacter(world, s, (dx / d) * step, (dz / d) * step, OPTS);
  }
  return false;
}

test('un círculo empuja hacia fuera al personaje', () => {
  const world = createPhysicsWorld({ colliders: [{ kind: 'circle', x: 0, z: 0, r: 1, yMin: -1, yMax: 3 }] });
  const p = resolveCollisions(world, { x: 0.5, z: 0 }, 0.3, 0, 1.7);
  assert.ok(Math.abs(p.x - 1.3) < 1e-6);
});

test('un colisionador fuera del rango de altura no bloquea', () => {
  const world = createPhysicsWorld({ colliders: [{ kind: 'circle', x: 0, z: 0, r: 1, yMin: 5, yMax: 6 }] });
  const p = resolveCollisions(world, { x: 0.5, z: 0 }, 0.3, 0, 1.7);
  assert.equal(p.x, 0.5);
});

test('se puede caminar del inicio a la puerta metálica', () => {
  const world = createSwampPhysics();
  const s = spawnState();
  const route = [
    ...PATH.slice(1),
    [HUT.x, HUT.z + 2.4], // sobre la espiral
    [HUT.x, HUT.z + 1.4], // borde de la escalera
    [HUT.x, HUT.z - 6.0], // pie de la escalera
    [HUT.x, HUT.z + CORRIDOR.zEnd + 0.6], // frente a la puerta
  ];
  for (const [x, z] of route) assert.ok(walkTo(world, s, x, z), `no llegó a (${x}, ${z}); quedó en (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
  assert.ok(Math.abs(s.y - CORRIDOR_Y) < 1e-6, `y=${s.y}`);
});

test('la zanja no se cruza fuera del puente', () => {
  const world = createSwampPhysics();
  const x = 12;
  const s = { x, z: ditchCenterZ(x) + 5, y: heightAt(x, ditchCenterZ(x) + 5), vy: 0, grounded: true };
  walkTo(world, s, x, ditchCenterZ(x) - 5, 20);
  assert.ok(s.z > ditchCenterZ(x), `cruzó el agua: z=${s.z}`);
});

test('el puente sí se cruza', () => {
  const world = createSwampPhysics();
  const z0 = BRIDGE.z + BRIDGE.halfLength + 1;
  const s = { x: BRIDGE.x, z: z0, y: heightAt(BRIDGE.x, z0), vy: 0, grounded: true };
  assert.ok(walkTo(world, s, BRIDGE.x, BRIDGE.z - BRIDGE.halfLength - 1));
  assert.equal(s.surface, 'mud');
});

test('el muro de la choza no se atraviesa', () => {
  const world = createSwampPhysics();
  const s = { x: HUT.x, z: HUT.z - 6, y: heightAt(HUT.x, HUT.z - 6), vy: 0, grounded: true };
  walkTo(world, s, HUT.x, HUT.z, 15);
  assert.ok(Math.hypot(s.x - HUT.x, s.z - HUT.z) > HUT.outerRadius, 'atravesó el muro trasero');
});

test('desde el piso de la choza no se cae por los lados de la abertura', () => {
  const world = createSwampPhysics();
  const s = { x: HUT.x + 2, z: HUT.z - 0.5, y: FLOOR_Y, vy: 0, grounded: true };
  walkTo(world, s, HUT.x - 2, HUT.z - 0.5, 10);
  assert.ok(Math.abs(s.y - FLOOR_Y) < 1e-6, `cayó a y=${s.y}`);
});
