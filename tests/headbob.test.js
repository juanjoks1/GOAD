import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceStepPhase, stepsBetween, bobOffset } from '../src/player/headbob.js';

test('un paso por cada largo de zancada/2', () => {
  let phase = 0.01;
  let steps = 0;
  for (let i = 0; i < 1000; i++) {
    const next = advanceStepPhase(phase, 0.01, 0.75);
    steps += stepsBetween(phase, next);
    phase = next;
  }
  // 10 m recorridos / 0.75 m por paso ≈ 13 pasos.
  assert.equal(steps, 13);
});

test('la cabeza está más baja al apoyar el pie y el balanceo se apaga al detenerse', () => {
  const amp = { amplitudeY: 0.04, amplitudeX: 0.02, roll: 0.01 };
  assert.ok(bobOffset(Math.PI, 1, amp).y < bobOffset(Math.PI * 1.5, 1, amp).y);
  const still = bobOffset(1.2, 0, amp);
  assert.equal(still.x, 0);
  assert.equal(still.roll, 0);
});
