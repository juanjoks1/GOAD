import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath } from '../src/pathfind.js';
import { parseWorld, isSolid } from '../src/world.js';

test('devuelve [] si el inicio y la meta son la misma casilla', () => {
  const w = parseWorld();
  assert.deepEqual(findPath(w, w.player, w.player), []);
});

test('encuentra un camino entre el inicio y el VCR (sin pasar por paredes)', () => {
  const w = parseWorld();
  const goal = { x: w.vcr.x + 1, y: w.vcr.y }; // casilla caminable junto al VCR
  const path = findPath(w, w.player, goal);
  assert.ok(Array.isArray(path) && path.length > 0);
  assert.deepEqual(path[path.length - 1], goal);
  for (const t of path) assert.equal(isSolid(w, t.x, t.y, false), false, `pasa por sólido en ${t.x},${t.y}`);
});

test('una meta sólida no es alcanzable', () => {
  const w = parseWorld();
  assert.equal(findPath(w, w.player, { x: 0, y: 0 }), null);
});

test('la salida solo es alcanzable cuando está abierta', () => {
  const w = parseWorld();
  const from = { x: w.exit.x - 1, y: w.exit.y };
  assert.equal(findPath(w, from, w.exit, false), null);
  const path = findPath(w, from, w.exit, true);
  assert.deepEqual(path[path.length - 1], w.exit);
});
