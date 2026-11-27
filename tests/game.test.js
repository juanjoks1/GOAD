import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update } from '../src/game.js';
import { parseWorld } from '../src/world.js';
import { tileCenter } from '../src/logic.js';
import { TAPE_PLAY_TIME } from '../src/config.js';
import { TAPES } from '../src/content.js';

const NO_INPUT = { up: false, down: false, left: false, right: false, interact: false, aimAngle: 0 };
const input = (over = {}) => ({ ...NO_INPUT, ...over });

// Partida nueva con la Señal lejos (sin amenaza) y la linterna apuntando al este.
function freshGame() {
  const w = parseWorld();
  const g = createGame(w);
  g.entity.x = tileCenter(w.entity).x;
  g.entity.y = tileCenter(w.entity).y;
  return g;
}

test('createGame empieza jugando, con señal completa y sin cintas', () => {
  const g = freshGame();
  assert.equal(g.status, 'playing');
  assert.equal(g.signal, 1);
  assert.equal(g.taken.size, 0);
  assert.equal(g.exitOpen, false);
});

test('sin entrada el jugador no se mueve', () => {
  const g = freshGame();
  const before = { x: g.player.x, y: g.player.y };
  update(g, input({ aimAngle: 0 }), 0.1);
  assert.deepEqual({ x: g.player.x, y: g.player.y }, before);
});

test('mantener la tecla derecha mueve al jugador a la derecha', () => {
  const g = freshGame();
  const x0 = g.player.x;
  update(g, input({ right: true }), 0.2);
  assert.ok(g.player.x > x0);
});

test('pasar sobre una cinta la recoge', () => {
  const g = freshGame();
  g.player = { ...tileCenter(g.world.tapes[0]), angle: 0 };
  update(g, input(), 0.016);
  assert.ok(g.taken.has(0));
});

test('reproducir una cinta en el VCR la marca como reproducida', () => {
  const g = freshGame();
  g.taken.add(0);
  // Colocar al jugador junto al VCR y mirar hacia otro lado para no ser visto
  g.player = { ...tileCenter({ x: g.world.vcr.x + 1, y: g.world.vcr.y }), angle: Math.PI };
  update(g, input({ interact: true, aimAngle: Math.PI }), 0.016);
  assert.ok(g.playing, 'debería empezar a reproducirse');

  // Avanzar el tiempo de reproducción; la Señal está lejos, no debería alcanzarnos
  for (let i = 0; i < Math.ceil(TAPE_PLAY_TIME / 0.1) + 2; i++) {
    update(g, input({ aimAngle: Math.PI }), 0.1);
  }
  assert.equal(g.playing, null);
  assert.ok(g.played.has(0));
});

test('no se puede reproducir una cinta si la Señal está muy cerca', () => {
  const g = freshGame();
  g.taken.add(0);
  const vcrSpot = tileCenter({ x: g.world.vcr.x + 1, y: g.world.vcr.y });
  g.player = { ...vcrSpot, angle: Math.PI };
  g.entity = { ...g.entity, x: vcrSpot.x, y: vcrSpot.y + 40 }; // a 40 px: dentro de SENSE_RANGE
  update(g, input({ interact: true, aimAngle: Math.PI }), 0.016);
  assert.equal(g.playing, null);
});

test('reproducir las tres cintas abre la salida', () => {
  const g = freshGame();
  g.played = new Set([0, 1]);
  g.taken = new Set([0, 1, 2]);
  g.playing = { idx: 2, t: TAPE_PLAY_TIME - 0.01 };
  g.player = { ...tileCenter({ x: g.world.vcr.x + 1, y: g.world.vcr.y }), angle: Math.PI };
  update(g, input({ aimAngle: Math.PI }), 0.1);
  assert.equal(g.played.size, TAPES.length);
  assert.equal(g.exitOpen, true);
});

test('llegar a la salida abierta gana la partida', () => {
  const g = freshGame();
  g.exitOpen = true;
  g.player = { ...tileCenter(g.world.exit), angle: 0 };
  update(g, input(), 0.016);
  assert.equal(g.status, 'won');
});

test('si la Señal te toca, pierdes', () => {
  const g = freshGame();
  g.player = { ...tileCenter({ x: 2, y: 2 }), angle: 0 };
  g.entity = { x: g.player.x, y: g.player.y, path: [], repath: 0, lit: false };
  update(g, input(), 0.016);
  assert.equal(g.status, 'dead');
  assert.equal(g.endTitle, 'SEÑAL PERDIDA');
});

test('la Señal no se mueve mientras la miras con la linterna', () => {
  const g = freshGame();
  // Señal a 3 casillas al este del jugador, dentro del cono
  g.player = { ...tileCenter({ x: 5, y: 11 }), angle: 0 };
  const c = tileCenter({ x: 8, y: 11 });
  g.entity = { x: c.x, y: c.y, path: [], repath: 0, lit: false };
  const x0 = g.entity.x;
  update(g, input({ aimAngle: 0 }), 0.5);
  assert.equal(g.entity.lit, true);
  assert.equal(g.entity.x, x0);
});

test('update no hace nada si la partida ya terminó', () => {
  const g = freshGame();
  g.status = 'dead';
  const x0 = g.player.x;
  update(g, input({ right: true }), 0.5);
  assert.equal(g.player.x, x0);
});
