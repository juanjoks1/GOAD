// Entidades: máquinas de estado puras (sin Three.js ni DOM).
// Cada fotograma reciben la vista del jugador y devuelven qué dibujar, cuánta interferencia
// meter en la imagen, cuánta luz queda en el subterráneo y qué sonidos disparar.
//
//   El Alto       pantano      reaparece entre la niebla, cada vez más cerca, solo cuando no lo miras
//   La Aguja      techo        agazapada sobre la choza; si la miras o te acercas, huye trepando
//   El Sombrero   choza        de pie en un rincón; si lo miras se esfuma y te espera al pie de la escalera
//   El Sonriente  pasillo      asoma al fondo; al acercarte se apaga la luz y aparece frente a tu cara
import { createRng } from '../core/rng.js';
import { smoothstep, distToSegment } from '../core/math.js';
import { ENTITIES } from '../config.js';
import { HUT, FLOOR_Y, STAIRS, CORRIDOR, CORRIDOR_Y, WORLD, DITCH, HUT_APEX, ditchCenterZ, roofHeightAt, toHutLocal } from './layout.js';
import { heightAt } from './terrain.js';
import { TREES } from './placement.js';
import { isUnderground } from './zones.js';

/** Tamaño de cada recorte en metros (ancho × alto). El pie del recorte está en (x, y, z). */
export const ENTITY_SIZES = {
  stalker: { width: 2.0, height: 8.0 },
  percher: { width: 4.2, height: 3.15 },
  watcher: { width: 1.6, height: 2.4 },
  grinner: { width: 1.25, height: 2.5 },
};

/** Fracción de la altura del Sonriente donde está su cara (para el susto). */
const GRINNER_FACE = 0.86;

/** Coseno del ángulo entre la mirada y la dirección hacia `p`. */
export function viewCos(eye, forward, p) {
  const dx = p.x - eye.x;
  const dy = p.y - eye.y;
  const dz = p.z - eye.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-6) return 1;
  const fl = Math.hypot(forward.x, forward.y, forward.z) || 1;
  return (dx * forward.x + dy * forward.y + dz * forward.z) / (d * fl);
}

const center = (s, kind) => ({ x: s.x, y: s.y + ENTITY_SIZES[kind].height * 0.5, z: s.z });
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hutDistance = (p) => Math.hypot(p.x - HUT.x, p.z - HUT.z);

export function createEntityState(seed = 13) {
  const percherR = Math.hypot(-0.6, 1.3);
  return {
    rng: createRng(seed),
    burst: 0, // interferencia breve al desaparecer algo
    stalker: { visible: false, x: 0, y: 0, z: 0, distance: ENTITIES.stalker.startDistance, nextMove: 0, seen: 0 },
    percher: { phase: 'hidden', t: 0, seen: 0, x: HUT.x - 0.6, y: roofHeightAt(percherR) - 0.35, z: HUT.z + 1.3 },
    watcher: { phase: 'hidden', t: 0, seen: 0, x: HUT.x - 2.3, y: FLOOR_Y, z: HUT.z - 2.5 },
    // Asoma desde el muro derecho: la mitad del recorte queda detrás del concreto.
    grinner: { phase: 'hidden', t: 0, x: HUT.x + 0.55, y: CORRIDOR_Y, z: HUT.z + ENTITIES.grinner.peekZ },
  };
}

/** Punto para que El Alto reaparezca: a `distance` del jugador y fuera de su vista. */
export function pickStalkerSpot(rng, feet, forward, distance) {
  const yaw = Math.atan2(forward.x, forward.z);
  for (let i = 0; i < 24; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    const a = yaw + side * rng.range(0.9, 1.6 + i * 0.05);
    const x = feet.x + Math.sin(a) * distance;
    const z = feet.z + Math.cos(a) * distance;
    if (Math.hypot(x - WORLD.centerX, z - WORLD.centerZ) > WORLD.vegetationRadius) continue;
    if (hutDistance({ x, z }) < HUT.clearingRadius) continue;
    if (Math.abs(z - ditchCenterZ(x)) < DITCH.halfWidth + 0.5) continue;
    if (TREES.some((t) => Math.hypot(t.x - x, t.z - z) < t.radius + 1.2)) continue;
    // Que se vea: ningún tronco ni copa de sauce entre el jugador y él.
    const blocked = TREES.some((t) => {
      if (Math.hypot(t.x - feet.x, t.z - feet.z) > distance) return false;
      const reach = t.kind === 'willow' ? 2.6 : t.radius + 0.6;
      return distToSegment(t.x, t.z, feet.x, feet.z, x, z) < reach;
    });
    if (blocked) continue;
    return { x, z };
  }
  return null;
}

function vanish(state, out) {
  state.burst = 1;
  out.sounds.push('vanish');
}

function stepStalker(state, inp, out) {
  const S = ENTITIES.stalker;
  const s = state.stalker;
  const { feet, eye, forward, time, dt, zone } = inp;
  const active = zone < 0.05 && feet.z < S.startZ && hutDistance(feet) > S.stopHutDistance;
  const d = flatDist(s, feet);
  const seen = s.visible && d < S.maxSeenDistance && viewCos(eye, forward, center(s, 'stalker')) > ENTITIES.viewCos;

  if (seen) {
    s.seen += dt;
    out.interference = Math.max(out.interference, 0.15 + 0.45 * smoothstep(S.maxSeenDistance, S.minDistance, d));
    if (s.seen > S.stareLimit || d < S.vanishDistance) {
      s.visible = false;
      s.seen = 0;
      s.nextMove = time + state.rng.range(...S.cooldown);
      vanish(state, out);
    }
  } else {
    s.seen = Math.max(0, s.seen - dt * 0.5);
    if (!active) {
      s.visible = false;
    } else if (time >= s.nextMove) {
      // Solo se mueve cuando no lo ves.
      const spot = pickStalkerSpot(state.rng, feet, forward, s.distance);
      if (spot) {
        s.x = spot.x;
        s.z = spot.z;
        s.y = heightAt(spot.x, spot.z) - 0.15;
        s.visible = true;
        s.distance = Math.max(S.minDistance, s.distance - S.approach);
        s.nextMove = time + state.rng.range(...S.moveEvery);
      }
    }
  }
  out.sprites.stalker = { visible: s.visible, x: s.x, y: s.y, z: s.z };
}

function stepPercher(state, inp, out) {
  const P = ENTITIES.percher;
  const s = state.percher;
  const { feet, eye, forward, dt, zone } = inp;
  const hd = hutDistance(feet);

  if (s.phase === 'hidden' && zone < 0.05 && hd < P.triggerDistance && hd > P.fleeDistance) {
    s.phase = 'perched';
  } else if (s.phase === 'perched') {
    const seen = zone < 0.05 && viewCos(eye, forward, center(s, 'percher')) > ENTITIES.viewCos;
    if (seen) {
      s.seen += dt;
      out.interference = Math.max(out.interference, 0.3);
    }
    if (s.seen > P.stareLimit || hd < P.fleeDistance) {
      s.phase = 'fleeing';
      s.t = 0;
      s.from = { x: s.x, y: s.y, z: s.z };
      out.sounds.push('skitter');
    }
  } else if (s.phase === 'fleeing') {
    // Trepa hasta la punta del techo y baja por detrás de la choza.
    s.t += dt;
    const k = Math.min(1, s.t / P.fleeDuration);
    const a = s.from;
    const b = { x: HUT.x, y: HUT_APEX - 0.6, z: HUT.z };
    const c = { x: HUT.x + 0.8, y: roofHeightAt(HUT.roofRadius) - 1.6, z: HUT.z - HUT.roofRadius - 0.6 };
    const u = 1 - k;
    s.x = u * u * a.x + 2 * u * k * b.x + k * k * c.x;
    s.y = u * u * a.y + 2 * u * k * b.y + k * k * c.y;
    s.z = u * u * a.z + 2 * u * k * b.z + k * k * c.z;
    out.interference = Math.max(out.interference, 0.25);
    if (k >= 1) s.phase = 'gone';
  }
  const visible = s.phase === 'perched' || s.phase === 'fleeing';
  out.sprites.percher = { visible, x: s.x, y: s.y, z: s.z };
}

function stepWatcher(state, inp, out) {
  const Wt = ENTITIES.watcher;
  const s = state.watcher;
  const { feet, eye, forward, dt } = inp;
  const { lx, lz } = toHutLocal(feet.x, feet.z);
  const insideHut = Math.hypot(lx, lz) < HUT.innerRadius && feet.y > FLOOR_Y - 0.3;

  if (s.phase === 'hidden' && hutDistance(feet) < HUT.outerRadius + Wt.appearDistance) {
    s.phase = 'standing';
  } else if (s.phase === 'standing') {
    const seen = insideHut && viewCos(eye, forward, center(s, 'watcher')) > ENTITIES.viewCos;
    if (seen) {
      s.seen += dt;
      out.interference = Math.max(out.interference, 0.35);
    }
    if ((insideHut && flatDist(s, feet) < Wt.vanishDistance) || s.seen > Wt.stareLimit) {
      // Se esfuma… y te espera abajo, mirando hacia arriba.
      s.phase = 'below';
      s.seen = 0;
      s.x = HUT.x;
      s.y = CORRIDOR_Y;
      s.z = HUT.z + STAIRS.zBottom - 1.0;
      vanish(state, out);
    }
  } else if (s.phase === 'below') {
    // Solo se le ve desde la choza (mirando por la abertura) o desde la escalera.
    const nearStairs = Math.hypot(lx, lz) < HUT.innerRadius || isUnderground(feet.x, feet.y, feet.z);
    const seen = nearStairs && viewCos(eye, forward, center(s, 'watcher')) > ENTITIES.viewCos;
    if (seen) {
      s.seen += dt;
      out.interference = Math.max(out.interference, 0.3);
    }
    if (feet.y < FLOOR_Y - Wt.belowVanishDepth || s.seen > Wt.belowStareLimit) {
      s.phase = 'gone';
      vanish(state, out);
    }
  }
  const visible = s.phase === 'standing' || s.phase === 'below';
  out.sprites.watcher = { visible, x: s.x, y: s.y, z: s.z };
}

/** Parpadeo de bombillas al volver la luz (determinista). */
export function flicker(t) {
  if (t > 0.6) return 1;
  return Math.sin(t * 70) + Math.sin(t * 23) > 0.3 ? 1 : 0.08;
}

function stepGrinner(state, inp, out) {
  const G = ENTITIES.grinner;
  const s = state.grinner;
  const { feet, eye, forward, dt } = inp;
  const { lz } = toHutLocal(feet.x, feet.z);
  const under = isUnderground(feet.x, feet.y, feet.z);
  s.t += dt;
  let light = 1;

  if (s.phase === 'hidden' && under && lz < CORRIDOR.zStart - 0.3) {
    s.phase = 'peeking';
    s.t = 0;
  } else if (s.phase === 'peeking') {
    if (viewCos(eye, forward, center(s, 'grinner')) > ENTITIES.viewCos) out.interference = Math.max(out.interference, 0.25);
    if (lz < G.triggerZ) {
      s.phase = 'blackout';
      s.t = 0;
      out.sounds.push('lights-off');
    }
  } else if (s.phase === 'blackout') {
    light = 0.03;
    if (s.t > G.blackout) {
      // La luz vuelve y está frente a tu cara.
      s.phase = 'scare';
      s.t = 0;
      const fl = Math.hypot(forward.x, forward.z) || 1;
      const fx = forward.x / fl;
      const fz = forward.z / fl;
      const halfW = CORRIDOR.halfWidth - 0.3;
      s.x = Math.max(HUT.x - halfW, Math.min(HUT.x + halfW, eye.x + fx * G.scareDistance));
      s.z = eye.z + fz * G.scareDistance;
      s.y = eye.y - ENTITY_SIZES.grinner.height * GRINNER_FACE;
      out.sounds.push('sting');
    }
  } else if (s.phase === 'scare') {
    if (s.t > G.scare) {
      s.phase = 'aftermath';
      s.t = 0;
      out.sounds.push('lights-off');
    }
  } else if (s.phase === 'aftermath') {
    light = 0.03;
    if (s.t > G.aftermath) {
      s.phase = 'gone';
      s.t = 0;
      out.sounds.push('lights-on');
    }
  } else if (s.phase === 'gone') {
    light = flicker(s.t);
  }
  if (s.phase === 'scare') {
    light = flicker(s.t * 0.5 + 0.7);
    // Un golpe de interferencia al aparecer; luego baja para que se le vea bien la cara.
    out.interference = s.t < 0.12 ? 1 : 0.5;
  }
  out.lightLevel = light;
  const visible = s.phase === 'peeking' || s.phase === 'scare';
  out.sprites.grinner = { visible, x: s.x, y: s.y, z: s.z, flash: s.phase === 'scare' };
}

/**
 * Avanza todas las entidades.
 * @param {ReturnType<typeof createEntityState>} state
 * @param {{ time: number, dt: number, zone: number, feet: {x,y,z}, eye: {x,y,z}, forward: {x,y,z} }} inp
 * @returns {{ sprites: Record<string, {visible: boolean, x: number, y: number, z: number}>, interference: number, lightLevel: number, sounds: string[] }}
 */
export function stepEntities(state, inp) {
  const out = { sprites: {}, interference: 0, lightLevel: 1, sounds: [] };
  stepStalker(state, inp, out);
  stepPercher(state, inp, out);
  stepWatcher(state, inp, out);
  stepGrinner(state, inp, out);
  state.burst = Math.max(0, state.burst - inp.dt * 2.5);
  out.interference = Math.min(1, Math.max(out.interference, state.burst));
  return out;
}
