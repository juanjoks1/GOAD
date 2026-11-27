import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntityState, stepEntities, viewCos, pickStalkerSpot } from '../src/world/entities.js';
import { createRng } from '../src/core/rng.js';
import { ENTITIES } from '../src/config.js';
import { heightAt } from '../src/world/terrain.js';
import { HUT, FLOOR_Y, CORRIDOR_Y, STAIRS, stairHeightAt } from '../src/world/layout.js';
import { interiorFactor } from '../src/world/zones.js';

const EYE = 1.62;

/** Entrada para stepEntities con el jugador en (x, y, z) mirando hacia `forward`. */
function input(x, y, z, forward, time, dt = 1 / 30) {
  return {
    time,
    dt,
    zone: interiorFactor(x, y, z),
    feet: { x, y, z },
    eye: { x, y: y + EYE, z },
    forward,
  };
}

test('viewCos: de frente 1, de espaldas -1', () => {
  const eye = { x: 0, y: 0, z: 0 };
  assert.ok(Math.abs(viewCos(eye, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -5 }) - 1) < 1e-9);
  assert.ok(Math.abs(viewCos(eye, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 5 }) + 1) < 1e-9);
});

test('El Alto reaparece fuera de la vista del jugador', () => {
  const rng = createRng(3);
  const feet = { x: 0, y: 0, z: 18 };
  const forward = { x: 0, y: 0, z: -1 };
  for (let i = 0; i < 30; i++) {
    const spot = pickStalkerSpot(rng, feet, forward, 30);
    assert.ok(spot);
    const c = viewCos({ x: feet.x, y: 1.6, z: feet.z }, forward, { x: spot.x, y: 1.6, z: spot.z });
    assert.ok(c < ENTITIES.viewCos, `apareció a la vista (cos=${c.toFixed(2)})`);
  }
});

test('El Alto no se mueve mientras lo miras y desaparece si lo miras demasiado', () => {
  const st = createEntityState(5);
  const x = 0;
  const z = 18;
  const y = heightAt(x, z);
  let out = stepEntities(st, input(x, y, z, { x: 0, y: 0, z: -1 }, 0));
  assert.ok(out.sprites.stalker.visible, 'debería haber aparecido');
  const pos = { ...st.stalker };
  // Girar para mirarlo directamente.
  const dir = { x: pos.x - x, y: 0, z: pos.z - z };
  let t = 0;
  let vanished = false;
  for (let i = 0; i < 200; i++) {
    t += 1 / 30;
    out = stepEntities(st, input(x, y, z, dir, 100 + t));
    if (!out.sprites.stalker.visible) {
      vanished = true;
      break;
    }
    assert.equal(st.stalker.x, pos.x, 'se movió mientras lo mirabas');
    assert.ok(out.interference > 0, 'mirarlo debería meter interferencia');
  }
  assert.ok(vanished, 'debería desaparecer tras mirarlo un rato');
  assert.ok(out.sounds.includes('vanish'));
});

test('La Aguja huye al acercarte a la choza', () => {
  const st = createEntityState();
  const x = HUT.x;
  const away = { x: 0, y: 0, z: 1 }; // mirando hacia otro lado
  let out = stepEntities(st, input(x, heightAt(x, HUT.z + 15), HUT.z + 15, away, 0));
  assert.ok(out.sprites.percher.visible, 'debería estar sobre el techo');
  out = stepEntities(st, input(x, heightAt(x, HUT.z + 7), HUT.z + 7, away, 1));
  assert.ok(out.sounds.includes('skitter'));
  for (let i = 0; i < 60; i++) out = stepEntities(st, input(x, heightAt(x, HUT.z + 7), HUT.z + 7, away, 1 + i / 30));
  assert.equal(out.sprites.percher.visible, false);
});

test('El Sombrero se esfuma al mirarlo y espera al pie de la escalera', () => {
  const st = createEntityState();
  const feet = { x: HUT.x + 0.5, z: HUT.z + 2.5 };
  const target = st.watcher;
  const look = { x: target.x - feet.x, y: 0, z: target.z - feet.z };
  let out;
  for (let i = 0; i < 60; i++) out = stepEntities(st, input(feet.x, FLOOR_Y, feet.z, look, i / 30));
  assert.equal(st.watcher.phase, 'below');
  assert.ok(out.sprites.watcher.visible);
  assert.ok(st.watcher.y < FLOOR_Y - 3, 'debería estar abajo');
  // Al bajar la escalera, se va.
  const lz = -2.5;
  out = stepEntities(st, input(HUT.x, stairHeightAt(lz), HUT.z + lz, { x: 0, y: 0, z: -1 }, 5));
  assert.equal(out.sprites.watcher.visible, false);
});

test('El Sonriente: apagón, susto frente a la cara y la luz vuelve', () => {
  const st = createEntityState();
  const fwd = { x: 0, y: 0, z: -1 };
  let t = 0;
  const at = (lz) => {
    t += 1 / 30;
    return stepEntities(st, input(HUT.x, CORRIDOR_Y, HUT.z + lz, fwd, t));
  };
  let out = at(STAIRS.zBottom - 1);
  assert.ok(out.sprites.grinner.visible, 'asoma al fondo');
  out = at(ENTITIES.grinner.triggerZ - 0.2);
  assert.ok(out.sounds.includes('lights-off'));
  const sounds = [];
  let sawScare = false;
  for (let i = 0; i < 120; i++) {
    out = at(ENTITIES.grinner.triggerZ - 0.2);
    sounds.push(...out.sounds);
    if (st.grinner.phase === 'blackout') assert.ok(out.lightLevel < 0.1, 'a oscuras');
    if (st.grinner.phase === 'scare') {
      sawScare = true;
      const s = out.sprites.grinner;
      assert.ok(s.visible);
      const d = Math.hypot(s.x - HUT.x, s.z - (HUT.z + ENTITIES.grinner.triggerZ - 0.2));
      assert.ok(d < 1.3, `debería estar frente a la cara (d=${d.toFixed(2)})`);
      assert.ok(out.interference >= 0.5);
    }
  }
  assert.ok(sawScare);
  assert.ok(sounds.includes('sting'));
  assert.equal(st.grinner.phase, 'gone');
  assert.equal(out.lightLevel, 1);
  assert.equal(out.sprites.grinner.visible, false);
});
