import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valueNoise2D, fbm2D } from '../src/core/noise.js';
import { createRng } from '../src/core/rng.js';

test('el ruido es determinista y está en [0, 1]', () => {
  for (let i = 0; i < 500; i++) {
    const x = i * 0.37;
    const y = i * 0.11;
    const a = fbm2D(x, y, { seed: 3 });
    assert.equal(a, fbm2D(x, y, { seed: 3 }));
    assert.ok(a >= 0 && a <= 1);
  }
});

test('el ruido periódico se repite sin costura', () => {
  for (let i = 0; i < 50; i++) {
    const x = i * 0.29;
    const y = i * 0.17;
    assert.ok(Math.abs(valueNoise2D(x, y, 5, 8) - valueNoise2D(x + 8, y - 16, 5, 8)) < 1e-9);
    assert.ok(Math.abs(fbm2D(x, y, { period: 4 }) - fbm2D(x + 4, y + 4, { period: 4 })) < 1e-9);
  }
});

test('el RNG con semilla repite la misma secuencia', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});
