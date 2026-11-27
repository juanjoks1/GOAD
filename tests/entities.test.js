import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEntityState, stepEntities, viewCos, pickStalkerSpot, resetAfterCatch, exteriorLineClear, playerPlace,
} from '../src/world/entities.js';
import { createRng } from '../src/core/rng.js';
import { ENTITIES, CROSS } from '../src/config.js';
import { heightAt } from '../src/world/terrain.js';
import { BUSHES } from '../src/world/placement.js';
import { HUT, FLOOR_Y, CORRIDOR_Y, STAIRS, stairHeightAt } from '../src/world/layout.js';
import { createSwampPhysics } from '../src/world/swampPhysics.js';
import { CHECKPOINTS, reachCheckpoint } from '../src/world/checkpoints.js';

const EYE = 1.62;
const DT = 1 / 30;
const world = createSwampPhysics();

/** Entrada para stepEntities: jugador en (x, y, z) mirando hacia `look` (un punto o un vector `dir`). */
function input(feet, { look = null, dir = { x: 0, y: 0, z: -1 }, time = 0, ...rest } = {}) {
  const eye = { x: feet.x, y: feet.y + EYE, z: feet.z };
  const forward = look ? { x: look.x - eye.x, y: look.y - eye.y, z: look.z - eye.z } : dir;
  return { time, dt: DT, feet, eye, forward, world, ...rest };
}

const awayFrom = (feet, p) => ({ x: feet.x - p.x, y: 0, z: feet.z - p.z });
const at = (x, z, y = heightAt(x, z)) => ({ x, y, z });

/** Corre `seconds` segundos con la misma entrada; devuelve la última salida y los sonidos. */
function run(st, seconds, make, t0 = 0) {
  let out;
  const sounds = [];
  for (let t = 0; t < seconds; t += DT) {
    out = stepEntities(st, make(t0 + t));
    sounds.push(...out.sounds);
    if (out.caught) break;
  }
  return { out, sounds };
}

test('viewCos: de frente 1, de espaldas -1', () => {
  const eye = { x: 0, y: 0, z: 0 };
  assert.ok(Math.abs(viewCos(eye, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -5 }) - 1) < 1e-9);
  assert.ok(Math.abs(viewCos(eye, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 5 }) + 1) < 1e-9);
});

test('mientras merodea, El Alto reaparece fuera de la vista y con vista libre', () => {
  const rng = createRng(3);
  const feet = at(0, 18);
  const forward = { x: 0, y: 0, z: -1 };
  for (let i = 0; i < 20; i++) {
    const spot = pickStalkerSpot(rng, feet, forward, 24);
    assert.ok(spot);
    assert.ok(viewCos({ x: feet.x, y: 1.6, z: feet.z }, forward, { x: spot.x, y: 1.6, z: spot.z }) < ENTITIES.viewCos);
    assert.ok(exteriorLineClear(spot, feet));
  }
});

test('el del Sombrero te ve al entrar, grita, te persigue y te atrapa si te quedas quieto', () => {
  const st = createEntityState();
  const feet = { x: HUT.x + 1.5, y: FLOOR_Y, z: HUT.z + 2.5 };
  const w = st.entities.watcher;
  const { out, sounds } = run(st, 12, (t) => input(feet, { dir: { x: 0, y: 0, z: 1 }, time: t }));
  assert.ok(sounds.includes('alert:watcher'));
  assert.equal(out.caught, 'watcher');
  assert.ok(Math.hypot(w.x - feet.x, w.z - feet.z) < ENTITIES.catchDistance + 0.05);
});

test('mirarla la acelera; no mirarla la frena', () => {
  const covered = (lookAtIt) => {
    const st = createEntityState();
    const feet = { x: HUT.x + 1.6, y: FLOOR_Y, z: HUT.z + 2.8 };
    const w = st.entities.watcher;
    run(st, ENTITIES.watcher.alert + 0.1, (t) => input(feet, { look: { x: w.x, y: w.y + 1.2, z: w.z }, time: t }));
    assert.equal(w.mode, 'chase');
    const start = { x: w.x, z: w.z };
    run(st, 1, (t) => input(feet, lookAtIt ? { look: { x: w.x, y: w.y + 1.2, z: w.z }, time: 5 + t } : { dir: awayFrom(feet, w), time: 5 + t }));
    return Math.hypot(w.x - start.x, w.z - start.z);
  };
  const looking = covered(true);
  const ignoring = covered(false);
  assert.ok(looking > ignoring * 1.6, `mirando ${looking.toFixed(2)} m vs sin mirar ${ignoring.toFixed(2)} m`);
});

test('la cruz repele a la entidad y la calma un rato', () => {
  const st = createEntityState();
  const feet = { x: HUT.x + 1.6, y: FLOOR_Y, z: HUT.z + 2.8 };
  const w = st.entities.watcher;
  const lookW = (t, cross) => input(feet, { look: { x: w.x, y: w.y + 1.2, z: w.z }, time: t, crossHeld: cross });
  run(st, ENTITIES.watcher.alert + 0.2, (t) => lookW(t, false));
  assert.equal(w.mode, 'chase');
  const { sounds } = run(st, 0.2, (t) => lookW(2 + t, true), 0);
  assert.ok(sounds.includes('repel:watcher'));
  assert.equal(w.mode, 'repelled');
  const { out } = run(st, 2, (t) => lookW(2.2 + t, false));
  assert.equal(w.mode, 'idle');
  assert.equal(out.caught, null);
  // Calmada: aunque estés delante, no te persigue enseguida.
  run(st, 2, (t) => lookW(4.5 + t, false));
  assert.equal(w.mode, 'idle');
});

test('la cruz se gasta, se rompe y se recarga', () => {
  const st = createEntityState();
  const feet = at(0, 30);
  const held = (t) => input(feet, { time: t, crossHeld: true });
  const { sounds } = run(st, 1 / CROSS.drain + 0.5, held);
  assert.ok(sounds.includes('cross-broken'));
  let out = stepEntities(st, held(10));
  assert.equal(out.cross.active, false, 'rota no funciona');
  run(st, CROSS.rearm / CROSS.recharge + 0.5, (t) => input(feet, { time: 20 + t }));
  out = stepEntities(st, held(40));
  assert.equal(out.cross.active, true, 'recargada vuelve a funcionar');
});

test('agachado entre arbustos no te ve; de pie, sí', () => {
  // Busca un arbusto al descubierto con vista libre hacia un punto a 10 m.
  let found = null;
  for (const b of BUSHES) {
    if (Math.hypot(b.x - HUT.x, b.z - HUT.z) < 30) continue;
    for (let a = 0; a < 6.28 && !found; a += 0.4) {
      const p = { x: b.x + Math.sin(a) * 10, z: b.z + Math.cos(a) * 10 };
      if (Math.hypot(p.x - HUT.x, p.z - HUT.z) < 20) continue;
      if (exteriorLineClear(p, b)) found = { bush: b, spot: p };
    }
    if (found) break;
  }
  assert.ok(found, 'no hay arbusto de prueba');
  const check = (crouched) => {
    const st = createEntityState();
    const s = st.entities.stalker;
    Object.assign(s, { mode: 'idle', visible: true, x: found.spot.x, z: found.spot.z, y: heightAt(found.spot.x, found.spot.z), nextMove: 1e9 });
    const feet = at(found.bush.x, found.bush.z);
    run(st, 0.5, (t) => input(feet, { dir: awayFrom(feet, s), time: t, crouched }));
    return s.mode;
  };
  assert.equal(check(true), 'idle');
  assert.equal(check(false), 'alert');
});

test('El Alto no entra al claro: dentro de la choza estás a salvo de él', () => {
  const st = createEntityState();
  const s = st.entities.stalker;
  Object.assign(s, { mode: 'chase', visible: true, x: HUT.x, z: HUT.z + 22, y: 0, lastSeen: { x: HUT.x, z: HUT.z + 2 } });
  st.entities.watcher.calmUntil = Infinity; // aquí solo probamos a El Alto
  const feet = { x: HUT.x, y: FLOOR_Y, z: HUT.z + 2 };
  assert.equal(playerPlace(feet), 'hut');
  const { out } = run(st, 20, (t) => input(feet, { dir: { x: 0, y: 0, z: -1 }, time: t }));
  assert.equal(out.caught, null);
  assert.ok(Math.hypot(s.x - HUT.x, s.z - HUT.z) >= HUT.clearingRadius + 0.9);
  assert.notEqual(s.mode, 'chase', 'debería rendirse');
});

test('El Sonriente: apagón, susto en la cara y después te caza desde la puerta', () => {
  const st = createEntityState();
  const g = st.entities.grinner;
  const fwd = { x: 0, y: 0, z: -1 };
  const feetAt = (lz) => ({ x: HUT.x, y: CORRIDOR_Y, z: HUT.z + lz });
  let out = stepEntities(st, input(feetAt(STAIRS.zBottom - 1), { dir: fwd, time: 0 }));
  assert.ok(out.sprites.grinner.visible, 'asoma al fondo');
  const lz = ENTITIES.grinner.triggerZ - 0.2;
  const res = run(st, 4, (t) => input(feetAt(lz), { dir: { x: 0, y: 0, z: 1 }, time: 0.1 + t }));
  assert.ok(res.sounds.includes('lights-off'));
  assert.ok(res.sounds.includes('sting'));
  assert.equal(g.mode, 'idle');
  assert.ok(Math.abs(g.z - (HUT.z + ENTITIES.grinner.homeZ)) < 0.01, 'espera junto a la puerta');
  // Tras calmarse, te ve y viene.
  const chase = run(st, 4, (t) => input(feetAt(lz), { dir: { x: 0, y: 0, z: 1 }, time: 5 + t }));
  assert.ok(chase.sounds.includes('alert:grinner'));
  assert.ok(['alert', 'chase'].includes(g.mode));
});

test('tras atraparte, las entidades vuelven a su sitio', () => {
  const st = createEntityState();
  const w = st.entities.watcher;
  Object.assign(w, { mode: 'chase', x: HUT.x + 1, z: HUT.z + 1, lastSeen: { x: 0, z: 0 } });
  resetAfterCatch(st, 10);
  assert.equal(w.mode, 'idle');
  assert.equal(w.x, w.home.x);
  assert.ok(w.calmUntil > 10);
});

test('los puntos de control solo avanzan', () => {
  let i = 0;
  for (const c of CHECKPOINTS) i = reachCheckpoint(i, c);
  assert.equal(i, CHECKPOINTS.length - 1);
  assert.equal(reachCheckpoint(i, CHECKPOINTS[0]), i);
  // La escalera no cuenta como "pasillo".
  assert.equal(reachCheckpoint(3, { x: HUT.x, y: stairHeightAt(-1), z: HUT.z - 1 }), 3);
});
