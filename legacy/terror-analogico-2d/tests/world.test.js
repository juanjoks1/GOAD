import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_ROWS, parseWorld, isSolid } from '../src/world.js';
import { TAPES } from '../src/content.js';

const ALL = MAP_ROWS.join('');
const count = (ch) => ALL.split(ch).length - 1;

test('todas las filas del mapa miden lo mismo', () => {
  const widths = new Set(MAP_ROWS.map((r) => r.length));
  assert.equal(widths.size, 1, `anchos distintos: ${[...widths]}`);
});

test('el mapa tiene exactamente una S, E, V y X', () => {
  for (const ch of ['S', 'E', 'V', 'X']) assert.equal(count(ch), 1, `esperaba 1 "${ch}"`);
});

test('hay tantas cintas (T) como entradas en content.js', () => {
  assert.equal(count('T'), TAPES.length);
});

test('solo se usan caracteres conocidos', () => {
  for (const ch of new Set(ALL)) {
    assert.ok('#.+SEVTX'.includes(ch), `carácter desconocido "${ch}"`);
  }
});

test('parseWorld expone posiciones de jugador, Señal, VCR, salida y cintas', () => {
  const w = parseWorld();
  assert.ok(w.player && w.entity && w.vcr && w.exit);
  assert.equal(w.tapes.length, TAPES.length);
  assert.equal(w.grid[w.player.y][w.player.x], 'S');
  assert.equal(w.grid[w.exit.y][w.exit.x], 'X');
});

test('la salida es sólida hasta que se abre', () => {
  const w = parseWorld();
  assert.equal(isSolid(w, w.exit.x, w.exit.y, false), true);
  assert.equal(isSolid(w, w.exit.x, w.exit.y, true), false);
});

test('fuera del mapa todo es sólido', () => {
  const w = parseWorld();
  assert.equal(isSolid(w, -1, 0), true);
  assert.equal(isSolid(w, w.width, 0), true);
});
