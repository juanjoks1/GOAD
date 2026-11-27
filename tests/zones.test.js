import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interiorFactor, doorProximity, HUT_ZONE_LEVEL } from '../src/world/zones.js';
import { heightAt } from '../src/world/terrain.js';
import { SPAWN, HUT, FLOOR_Y, CORRIDOR_Y, CORRIDOR, stairHeightAt } from '../src/world/layout.js';

test('afuera la zona es 0', () => {
  assert.equal(interiorFactor(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z), 0);
});

test('dentro de la choza la zona es la de la choza', () => {
  assert.ok(Math.abs(interiorFactor(HUT.x, FLOOR_Y, HUT.z + 2) - HUT_ZONE_LEVEL) < 1e-6);
});

test('la zona crece al bajar la escalera y llega a 1 en el pasillo', () => {
  let prev = HUT_ZONE_LEVEL;
  for (let lz = 0.5; lz > -5.5; lz -= 0.5) {
    const z = HUT.z + lz;
    const v = interiorFactor(HUT.x, stairHeightAt(lz), z);
    assert.ok(v >= prev - 1e-9, `lz=${lz}`);
    prev = v;
  }
  assert.equal(interiorFactor(HUT.x, CORRIDOR_Y, HUT.z - 15), 1);
});

test('sobre el pasillo, en la superficie, sigue siendo exterior', () => {
  const z = HUT.z - 15;
  assert.equal(interiorFactor(HUT.x, heightAt(HUT.x, z), z), 0);
});

test('la proximidad a la puerta crece al acercarse', () => {
  const far = doorProximity(HUT.x, CORRIDOR_Y, HUT.z - 8);
  const near = doorProximity(HUT.x, CORRIDOR_Y, HUT.z + CORRIDOR.zEnd + 1);
  assert.ok(near > far);
  assert.ok(near > 0.8);
});

import { zoneMix } from '../src/audio/director.js';

test('el audio cruza del pantano al drone según la zona', () => {
  const out = zoneMix(0);
  const hut = zoneMix(HUT_ZONE_LEVEL);
  const under = zoneMix(1);
  assert.equal(out.exterior, 1);
  assert.equal(out.interior, 0);
  assert.ok(hut.exterior < 1 && hut.exterior > 0.4, 'en la choza el exterior se oye apagado');
  assert.ok(hut.muffle < out.muffle);
  assert.equal(under.exterior, 0);
  assert.equal(under.interior, 1);
  assert.ok(under.reverb > out.reverb);
});
