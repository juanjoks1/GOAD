// Lógica pura (sin DOM ni canvas): se puede probar con `npm test`.
import {
  TILE,
  PLAYER_RADIUS,
  FLASHLIGHT_RANGE,
  FLASHLIGHT_FOV,
  SIGNAL_DRAIN,
  SIGNAL_RECOVER,
  SIGNAL_LOOK_DRAIN,
} from './config.js';
import { isSolid } from './world.js';

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Casilla (entera) donde está un punto en píxeles.
export const tileOf = (p) => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });

// Centro en píxeles de una casilla.
export const tileCenter = (t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });

// ¿Hay pared en algún punto de un círculo de radio r centrado en (px, py)?
export function collidesWithWall(world, px, py, r, exitOpen = false) {
  const minTx = Math.floor((px - r) / TILE);
  const maxTx = Math.floor((px + r) / TILE);
  const minTy = Math.floor((py - r) / TILE);
  const maxTy = Math.floor((py + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (isSolid(world, tx, ty, exitOpen)) return true;
    }
  }
  return false;
}

// Mueve un punto eje por eje, deteniéndose contra las paredes.
export function moveWithCollision(world, pos, dx, dy, r = PLAYER_RADIUS, exitOpen = false) {
  let { x, y } = pos;
  if (!collidesWithWall(world, x + dx, y, r, exitOpen)) x += dx;
  if (!collidesWithWall(world, x, y + dy, r, exitOpen)) y += dy;
  return { x, y };
}

// ¿Está `target` dentro del cono de la linterna de `from` apuntando a `angle`?
export function isInView(from, angle, target, range = FLASHLIGHT_RANGE, fov = FLASHLIGHT_FOV) {
  if (dist(from, target) > range) return false;
  const toTarget = Math.atan2(target.y - from.y, target.x - from.x);
  const diff = Math.atan2(Math.sin(toTarget - angle), Math.cos(toTarget - angle));
  return Math.abs(diff) <= fov / 2;
}

// Actualiza la señal (1 = clara, 0 = perdida). Cerca de la entidad cae;
// lejos se recupera; mirarla también la degrada un poco.
export function updateSignal(signal, dt, { near, lit }) {
  let rate = near ? -SIGNAL_DRAIN : SIGNAL_RECOVER;
  if (lit) rate -= SIGNAL_LOOK_DRAIN;
  return clamp(signal + rate * dt, 0, 1);
}

// 3725 -> "01:02:05"
export function formatTimestamp(seconds) {
  const s = Math.floor(seconds);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
