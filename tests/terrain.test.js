import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, PUDDLES, BRIDGE_DECK_Y } from '../src/world/terrain.js';
import { DITCH, HUT, BRIDGE, ditchCenterZ } from '../src/world/layout.js';

test('el terreno alrededor de la choza es plano', () => {
  for (let a = 0; a < Math.PI * 2; a += 0.3) {
    for (const r of [0, 2, 4.5, 6]) {
      const h = heightAt(HUT.x + Math.sin(a) * r, HUT.z + Math.cos(a) * r);
      assert.ok(Math.abs(h - HUT.groundHeight) < 1e-6, `h=${h} r=${r}`);
    }
  }
});

test('el centro de la zanja queda bajo el agua y las orillas por encima', () => {
  for (let x = -60; x <= 60; x += 3) {
    const zc = ditchCenterZ(x);
    assert.ok(heightAt(x, zc) < DITCH.waterLevel - 0.3, `x=${x}`);
    assert.ok(heightAt(x, zc + DITCH.halfWidth + 0.5) > DITCH.waterLevel + 0.05);
    assert.ok(heightAt(x, zc - DITCH.halfWidth - 0.5) > DITCH.waterLevel + 0.05);
  }
});

test('el puente queda por encima de ambas orillas', () => {
  for (const s of [-1, 1]) {
    assert.ok(BRIDGE_DECK_Y > heightAt(BRIDGE.x, BRIDGE.z + s * BRIDGE.halfLength));
  }
});

test('hay charcos y ninguno cae dentro de la zanja', () => {
  assert.ok(PUDDLES.length >= 10);
  for (const p of PUDDLES) assert.ok(Math.abs(p.z - ditchCenterZ(p.x)) > DITCH.halfWidth + p.r);
});

import { bakeVertexColors } from '../src/scene/bake.js';

test('la luz horneada ilumina más cerca de la luz y menos de espaldas', () => {
  const light = { position: [0, 2, 0], color: [1, 1, 1], intensity: 1, range: 5, wrap: 0 };
  const positions = [0, 0, 0, 3, 0, 0, 0, 0, 0];
  const normals = [0, 1, 0, 0, 1, 0, 0, -1, 0];
  const c = bakeVertexColors(positions, normals, { ambient: [0.1, 0.1, 0.1], lights: [light] });
  assert.ok(c[0] > c[3], 'cerca > lejos');
  assert.ok(Math.abs(c[6] - 0.1) < 1e-6, 'de espaldas solo recibe ambiente');
});
