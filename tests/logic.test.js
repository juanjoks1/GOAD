import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, FLASHLIGHT_FOV, SIGNAL_DRAIN, SIGNAL_RECOVER } from '../src/config.js';
import {
  clamp,
  tileOf,
  tileCenter,
  moveWithCollision,
  isInView,
  updateSignal,
  formatTimestamp,
} from '../src/logic.js';
import { parseWorld } from '../src/world.js';

test('clamp limita el valor al rango', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-3, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});

test('tileOf y tileCenter son inversos aproximados', () => {
  const c = tileCenter({ x: 3, y: 7 });
  assert.deepEqual(tileOf(c), { x: 3, y: 7 });
});

test('moveWithCollision avanza en espacio libre', () => {
  const w = parseWorld();
  const start = tileCenter(w.player); // casilla (1,1), con pared a la izquierda
  const moved = moveWithCollision(w, start, 5, 0);
  assert.equal(moved.x, start.x + 5);
});

test('moveWithCollision se detiene contra una pared', () => {
  const w = parseWorld();
  const start = tileCenter(w.player); // pegado a la pared izquierda del mapa
  const moved = moveWithCollision(w, start, -50, 0);
  assert.equal(moved.x, start.x);
});

test('isInView detecta un objetivo justo delante, dentro del alcance', () => {
  assert.equal(isInView({ x: 0, y: 0 }, 0, { x: 100, y: 0 }), true);
});

test('isInView no detecta un objetivo a la espalda', () => {
  assert.equal(isInView({ x: 0, y: 0 }, 0, { x: -100, y: 0 }), false);
});

test('isInView no detecta un objetivo fuera de alcance', () => {
  assert.equal(isInView({ x: 0, y: 0 }, 0, { x: 10000, y: 0 }), false);
});

test('isInView respeta el borde del cono', () => {
  const edge = FLASHLIGHT_FOV / 2;
  const inside = { x: 100 * Math.cos(edge * 0.9), y: 100 * Math.sin(edge * 0.9) };
  const outside = { x: 100 * Math.cos(edge * 1.2), y: 100 * Math.sin(edge * 1.2) };
  assert.equal(isInView({ x: 0, y: 0 }, 0, inside), true);
  assert.equal(isInView({ x: 0, y: 0 }, 0, outside), false);
});

test('la señal cae cerca de la Señal y se recupera lejos', () => {
  const down = updateSignal(1, 1, { near: true, lit: false });
  assert.ok(Math.abs(down - (1 - SIGNAL_DRAIN)) < 1e-9);
  assert.equal(updateSignal(0.5, 1, { near: false, lit: false }), 0.5 + SIGNAL_RECOVER);
});

test('mirar a la Señal degrada la señal aunque esté lejos', () => {
  assert.ok(updateSignal(0.5, 1, { near: false, lit: true }) < 0.5 + SIGNAL_RECOVER);
});

test('la señal nunca sale de [0, 1]', () => {
  assert.equal(updateSignal(1, 100, { near: false, lit: false }), 1);
  assert.equal(updateSignal(0, 100, { near: true, lit: true }), 0);
});

test('formatTimestamp da HH:MM:SS', () => {
  assert.equal(formatTimestamp(0), '00:00:00');
  assert.equal(formatTimestamp(3725), '01:02:05');
  assert.equal(formatTimestamp(59.9), '00:00:59');
});
