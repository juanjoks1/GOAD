// Estado y reglas del juego. Sin DOM: el bucle de render y la entrada viven en main.js.
import {
  PLAYER_SPEED,
  PLAYER_RADIUS,
  ENTITY_SPEED,
  ENTITY_TOUCH_DIST,
  SENSE_RANGE,
  REPATH_INTERVAL,
  TAPE_PLAY_TIME,
  PICKUP_DIST,
  VCR_USE_DIST,
} from './config.js';
import { TAPES } from './content.js';
import { moveWithCollision, isInView, updateSignal, tileOf, tileCenter, dist } from './logic.js';
import { findPath } from './pathfind.js';

// Crea el estado inicial a partir de un mundo (ver parseWorld en world.js).
export function createGame(world) {
  const p = tileCenter(world.player);
  const e = tileCenter(world.entity);
  return {
    world,
    player: { x: p.x, y: p.y, angle: 0 },
    entity: { x: e.x, y: e.y, path: [], repath: 0, lit: false },
    signal: 1,                 // 1 = imagen clara, 0 = se pierde la señal
    taken: new Set(),          // índices de cintas recogidas (en orden de recogida)
    played: new Set(),         // índices de cintas ya reproducidas
    playing: null,             // { idx, t } cinta reproduciéndose ahora
    exitOpen: false,           // se abre al reproducir las 3 cintas
    elapsed: 0,                // segundos de grabación (REC)
    status: 'playing',         // 'playing' | 'dead' | 'won'
    endTitle: '',
    endMessage: '',
    message: '',               // aviso temporal (subtítulo)
    messageT: 0,
    prompt: '',                // indicación contextual (p. ej. "[E] Reproducir cinta")
  };
}

// Avanza el juego un paso. `input`: { up, down, left, right, interact, aimAngle }.
// Modifica `game` y lo devuelve.
export function update(game, input, dt) {
  if (game.status !== 'playing') return game;

  const w = game.world;
  const pl = game.player;
  const ent = game.entity;

  game.elapsed += dt;
  if (game.messageT > 0) {
    game.messageT -= dt;
    if (game.messageT <= 0) game.message = '';
  }

  // 1) Movimiento (bloqueado mientras se reproduce una cinta)
  let ix = 0;
  let iy = 0;
  if (!game.playing) {
    if (input.left) ix -= 1;
    if (input.right) ix += 1;
    if (input.up) iy -= 1;
    if (input.down) iy += 1;
  }
  if (ix && iy) {
    ix *= Math.SQRT1_2;
    iy *= Math.SQRT1_2;
  }
  const moved = moveWithCollision(w, pl, ix * PLAYER_SPEED * dt, iy * PLAYER_SPEED * dt, PLAYER_RADIUS, game.exitOpen);
  pl.x = moved.x;
  pl.y = moved.y;
  if (typeof input.aimAngle === 'number') pl.angle = input.aimAngle;

  // 2) Recoger cintas al pasar sobre ellas
  w.tapes.forEach((t, i) => {
    if (game.taken.has(i)) return;
    if (dist(pl, tileCenter(t)) < PICKUP_DIST) {
      game.taken.add(i);
      notify(game, `Cinta ${game.taken.size} recogida.`);
    }
  });

  // 3) La Señal: se mueve solo si NO la miras con la linterna
  const lit = isInView(pl, pl.angle, ent);
  ent.lit = lit;
  if (!lit) {
    ent.repath -= dt;
    if (ent.repath <= 0) {
      ent.path = findPath(w, tileOf(ent), tileOf(pl), game.exitOpen) || [];
      ent.repath = REPATH_INTERVAL;
    }
    stepEntity(ent, dt);
  }

  // 4) Señal y peligro
  const dEnt = dist(pl, ent);
  const near = dEnt < SENSE_RANGE;
  game.signal = updateSignal(game.signal, dt, { near, lit });
  if (dEnt < ENTITY_TOUCH_DIST) return die(game, 'La Señal te alcanzó.');
  if (game.signal <= 0) return die(game, 'Perdiste la señal.');

  // 5) VCR: reproducir cintas
  const carrying = [...game.taken].filter((i) => !game.played.has(i));
  const nearVcr = dist(pl, tileCenter(w.vcr)) < VCR_USE_DIST;
  game.prompt = '';

  if (game.playing) {
    game.playing.t += dt;
    if (game.playing.t >= TAPE_PLAY_TIME) finishTape(game);
  } else if (nearVcr && carrying.length === 0 && game.played.size < TAPES.length) {
    game.prompt = 'Necesitas una cinta';
  } else if (nearVcr && carrying.length > 0) {
    if (near) {
      game.prompt = 'La Señal está demasiado cerca para reproducir';
    } else {
      game.prompt = '[E] Reproducir cinta';
      if (input.interact) game.playing = { idx: carrying[0], t: 0 };
    }
  }

  // 6) Salida
  if (game.exitOpen && tileOf(pl).x === w.exit.x && tileOf(pl).y === w.exit.y) {
    game.status = 'won';
    game.endTitle = 'TRANSMISIÓN COMPLETA';
    game.endMessage = 'Subiste al transmisor. Abajo, la estática empieza a hablar con tu voz.';
  }

  return game;
}

// Mueve la entidad hacia la siguiente casilla de su ruta.
function stepEntity(ent, dt) {
  const target = ent.path[0];
  if (!target) return;
  const c = tileCenter(target);
  const dx = c.x - ent.x;
  const dy = c.y - ent.y;
  const d = Math.hypot(dx, dy);
  const step = ENTITY_SPEED * dt;
  if (d <= step) {
    ent.x = c.x;
    ent.y = c.y;
    ent.path.shift();
  } else {
    ent.x += (dx / d) * step;
    ent.y += (dy / d) * step;
  }
}

function finishTape(game) {
  const idx = game.playing.idx;
  game.played.add(idx);
  game.playing = null;
  notify(game, `Cinta ${idx + 1} reproducida.`, 3);
  if (game.played.size === TAPES.length) {
    game.exitOpen = true;
    notify(game, 'El transmisor se abrió. Ve a la salida.', 6);
  }
}

function notify(game, text, seconds = 2.5) {
  game.message = text;
  game.messageT = seconds;
}

function die(game, reason) {
  game.status = 'dead';
  game.endTitle = 'SEÑAL PERDIDA';
  game.endMessage = reason;
  return game;
}
