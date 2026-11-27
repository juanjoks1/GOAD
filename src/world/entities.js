// Entidades cazadoras: máquinas de estado puras (sin Three.js ni DOM).
// Cada fotograma reciben al jugador y devuelven qué dibujar, cuánta interferencia meter,
// cuánta luz queda en el pasillo, qué sonidos disparar y si te atraparon.
//
// Ciclo de cada una:  quieta ─(te ve)→ alerta (grita) → persecución ─(te pierde)→ búsqueda → regreso
//                                         └─(la cruz)→ repelida → se esfuma y se calma un rato
// Te ven si estás en su territorio, a su alcance y sin nada en medio. Defensas:
//   · no mirarlas: si las miras corren más (y te ven desde más lejos); si no, van lentas
//   · esconderte: agachado entre arbustos o juncos casi no te ven; árboles y paredes tapan la vista
//   · salir de su territorio: El Alto no entra al claro, la Aguja no entra a la choza, el del
//     Sombrero no baja la escalera, el Sonriente no sale del pasillo
//   · la cruz: levántala apuntándoles y las repele (se gasta)
//   · correr: con aguante limitado, y hace ruido
import { createRng } from '../core/rng.js';
import { smoothstep, distToSegment } from '../core/math.js';
import { ENTITIES, CROSS } from '../config.js';
import {
  HUT, FLOOR_Y, STAIRS, CORRIDOR, CORRIDOR_Y, WORLD, DITCH, HUT_APEX, HUT_WALL_TOP,
  ditchCenterZ, roofHeightAt, toHutLocal,
} from './layout.js';
import { heightAt } from './terrain.js';
import { TREES, BUSHES, REEDS } from './placement.js';
import { isUnderground } from './zones.js';
import { resolveCollisions } from './physics.js';

/** Tamaño de cada recorte en metros (ancho × alto). El pie del recorte está en (x, y, z). */
export const ENTITY_SIZES = {
  stalker: { width: 2.0, height: 8.0 },
  percher: { width: 4.2, height: 3.15 },
  watcher: { width: 1.6, height: 2.4 },
  grinner: { width: 1.25, height: 2.5 },
};

export const KINDS = Object.keys(ENTITY_SIZES);

/** Fracción de la altura de cada recorte donde está la cara (para ponerla frente a la cámara). */
export const FACE_HEIGHT = { stalker: 0.94, percher: 0.6, watcher: 0.75, grinner: 0.86 };

const ACTIVE_MODES = new Set(['alert', 'chase', 'search']);

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

const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hutDistance = (p) => Math.hypot(p.x - HUT.x, p.z - HUT.z);
const center = (e) => ({ x: e.x, y: e.y + ENTITY_SIZES[e.kind].height * 0.5, z: e.z });

// --- Dónde está el jugador -----------------------------------------------------------------------

/** 'exterior' | 'hut' | 'stairs' | 'corridor' */
export function playerPlace(p) {
  const { lx, lz } = toHutLocal(p.x, p.z);
  if (isUnderground(p.x, p.y, p.z)) return lz < CORRIDOR.zStart ? 'corridor' : 'stairs';
  if (Math.hypot(lx, lz) < HUT.outerRadius && p.y > FLOOR_Y - 0.3) return 'hut';
  return 'exterior';
}

/** ¿Hay arbustos o juncos donde esconderse en (x, z)? */
export function inCover(x, z) {
  for (const b of BUSHES) if (Math.hypot(b.x - x, b.z - z) < b.width * 0.55 + 0.3) return true;
  for (const r of REEDS) if (Math.hypot(r.x - x, r.z - z) < 0.9) return true;
  return false;
}

// --- Territorios ---------------------------------------------------------------------------------

function clampRadial(e, cx, cz, min, max) {
  const dx = e.x - cx;
  const dz = e.z - cz;
  const d = Math.hypot(dx, dz) || 1e-6;
  const k = Math.min(max, Math.max(min, d)) / d;
  e.x = cx + dx * k;
  e.z = cz + dz * k;
}

/** reach: ¿puede alcanzar al jugador ahí? · clamp: mantiene a la entidad dentro de su zona. */
export const TERRITORY = {
  stalker: {
    reach: (place, p) => place === 'exterior' && hutDistance(p) > HUT.clearingRadius + 1,
    clamp(e) {
      clampRadial(e, HUT.x, HUT.z, HUT.clearingRadius + 1, Infinity);
      clampRadial(e, WORLD.centerX, WORLD.centerZ, 0, WORLD.vegetationRadius);
      e.y = heightAt(e.x, e.z) - 0.15;
    },
  },
  percher: {
    reach: (place, p) => place === 'exterior' && hutDistance(p) < ENTITIES.percher.territory,
    clamp(e) {
      clampRadial(e, HUT.x, HUT.z, HUT.outerRadius + 0.7, ENTITIES.percher.territory);
      e.y = heightAt(e.x, e.z) - 0.1;
    },
  },
  watcher: {
    reach: (place) => place === 'hut',
    clamp(e) {
      clampRadial(e, HUT.x, HUT.z, 0, HUT.innerRadius - 0.45);
      const { lx, lz } = toHutLocal(e.x, e.z);
      // No pisa la abertura de la escalera.
      if (Math.abs(lx) < 1.05 && lz > STAIRS.openingEnd - 0.3 && lz < STAIRS.zTop + 0.3) e.x = HUT.x + Math.sign(lx || 1) * 1.05;
      e.y = FLOOR_Y;
    },
  },
  grinner: {
    reach: (place, p) => place === 'corridor' || (place === 'stairs' && toHutLocal(p.x, p.z).lz < STAIRS.openingEnd),
    clamp(e) {
      const { lx, lz } = toHutLocal(e.x, e.z);
      e.x = HUT.x + Math.max(-0.35, Math.min(0.35, lx));
      e.z = HUT.z + Math.max(CORRIDOR.zEnd + 0.5, Math.min(CORRIDOR.zStart - 0.2, lz));
      e.y = CORRIDOR_Y;
    },
  },
};

// --- Línea de visión -----------------------------------------------------------------------------

/** Afuera: troncos, copas de sauce y la choza tapan la vista. */
export function exteriorLineClear(a, b, { ignoreHut = false } = {}) {
  for (const t of TREES) {
    const reach = t.kind === 'willow' ? 2.2 : t.radius + 0.35;
    if (distToSegment(t.x, t.z, a.x, a.z, b.x, b.z) >= reach) continue;
    // Un árbol pegado a cualquiera de los dos no tapa.
    if (Math.hypot(t.x - a.x, t.z - a.z) > 1.5 && Math.hypot(t.x - b.x, t.z - b.z) > 1.5) return false;
  }
  if (!ignoreHut && distToSegment(HUT.x, HUT.z, a.x, a.z, b.x, b.z) < HUT.outerRadius - 0.3) return false;
  return true;
}

function lineOfSight(e, p, place) {
  switch (e.kind) {
    case 'stalker':
    case 'percher':
      return place === 'exterior' && exteriorLineClear(e, p, { ignoreHut: e.y > HUT_WALL_TOP });
    case 'watcher':
      return place === 'hut' || (place === 'stairs' && toHutLocal(p.x, p.z).lz > STAIRS.openingEnd);
    case 'grinner':
      return place === 'corridor' || place === 'stairs';
    default:
      return false;
  }
}

// --- Estado --------------------------------------------------------------------------------------

const PERCH = (() => {
  const x = HUT.x - 0.6;
  const z = HUT.z + 1.3;
  return { x, y: roofHeightAt(Math.hypot(x - HUT.x, z - HUT.z)) - 0.35, z };
})();
const WATCHER_HOME = { x: HUT.x - 2.3, y: FLOOR_Y, z: HUT.z - 2.5 };
const GRINNER_HOME = { x: HUT.x, y: CORRIDOR_Y, z: HUT.z + ENTITIES.grinner.homeZ };
const GRINNER_PEEK = { x: HUT.x + 0.55, y: CORRIDOR_Y, z: HUT.z + ENTITIES.grinner.peekZ };

function makeEntity(kind, home, extra = {}) {
  return {
    kind,
    mode: 'idle',
    x: home.x,
    y: home.y,
    z: home.z,
    home,
    t: 0,
    calmUntil: 0,
    lastSeen: null,
    lost: 0,
    unreachable: 0,
    visible: true,
    ...extra,
  };
}

export function createEntityState(seed = 13) {
  return {
    rng: createRng(seed),
    burst: 0,
    cross: { level: 1, active: false, broken: false },
    entities: {
      stalker: makeEntity('stalker', { x: 0, y: 0, z: 0 }, { mode: 'dormant', visible: false, distance: ENTITIES.stalker.startDistance, nextMove: 0 }),
      percher: makeEntity('percher', PERCH),
      watcher: makeEntity('watcher', WATCHER_HOME),
      grinner: makeEntity('grinner', GRINNER_HOME, { mode: 'script', script: 'waiting', visible: false, x: GRINNER_PEEK.x, z: GRINNER_PEEK.z }),
    },
  };
}

/** Tras atraparte: todas vuelven a casa y se calman unos segundos. */
export function resetAfterCatch(state, time) {
  for (const e of Object.values(state.entities)) {
    if (e.mode === 'script' || e.mode === 'dormant') continue;
    goHome(e);
    e.calmUntil = time + 4;
  }
  const st = state.entities.stalker;
  if (st.mode !== 'dormant') {
    st.visible = false;
    st.distance = ENTITIES.stalker.startDistance;
    st.nextMove = time + 4;
  }
  state.cross.level = 1;
  state.cross.broken = false;
}

function goHome(e) {
  e.mode = 'idle';
  e.t = 0;
  e.lost = 0;
  e.unreachable = 0;
  e.lastSeen = null;
  if (e.kind === 'stalker') {
    e.visible = false;
    return;
  }
  e.x = e.home.x;
  e.y = e.home.y;
  e.z = e.home.z;
  e.visible = true;
}

// --- Movimiento ----------------------------------------------------------------------------------

function moveToward(e, target, speed, dt, world) {
  const dx = target.x - e.x;
  const dz = target.z - e.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-3) {
    const step = Math.min(d, speed * dt);
    e.x += (dx / d) * step;
    e.z += (dz / d) * step;
  }
  if (world && (e.kind === 'stalker' || e.kind === 'percher')) resolveCollisions(world, e, 0.35, e.y + 0.2, e.y + 1.8, 2);
  TERRITORY[e.kind].clamp(e);
}

/** Punto para que El Alto reaparezca mientras merodea: a `distance` y fuera de tu vista. */
export function pickStalkerSpot(rng, feet, forward, distance) {
  const yaw = Math.atan2(forward.x, forward.z);
  for (let i = 0; i < 24; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    const a = yaw + side * rng.range(0.9, 1.6 + i * 0.05);
    const x = feet.x + Math.sin(a) * distance;
    const z = feet.z + Math.cos(a) * distance;
    if (Math.hypot(x - WORLD.centerX, z - WORLD.centerZ) > WORLD.vegetationRadius) continue;
    if (hutDistance({ x, z }) < HUT.clearingRadius + 1) continue;
    if (Math.abs(z - ditchCenterZ(x)) < DITCH.halfWidth + 0.5) continue;
    if (TREES.some((t) => Math.hypot(t.x - x, t.z - z) < t.radius + 1.2)) continue;
    if (!exteriorLineClear({ x, z }, feet)) continue;
    return { x, z };
  }
  return null;
}

// --- Percepción ----------------------------------------------------------------------------------

function senses(e, inp, place, looking) {
  if (inp.time < e.calmUntil) return false;
  if (!TERRITORY[e.kind].reach(place, inp.feet)) return false;
  const C = ENTITIES[e.kind];
  const d = flatDist(e, inp.feet);
  let range = C.detect;
  if (inp.crouched && place === 'exterior' && inCover(inp.feet.x, inp.feet.z)) range = Math.min(range, ENTITIES.coverDetect);
  else if (inp.crouched) range *= ENTITIES.crouchDetect;
  if (looking) range *= ENTITIES.lookDetect;
  if (d <= range && lineOfSight(e, inp.feet, place)) return true;
  return Boolean(inp.sprinting && d < ENTITIES.sprintNoise);
}

// --- Comportamiento ------------------------------------------------------------------------------

function alert(state, e, inp, out) {
  e.mode = 'alert';
  e.t = 0;
  e.lost = 0;
  e.unreachable = 0;
  e.visible = true;
  e.lastSeen = { x: inp.feet.x, z: inp.feet.z };
  e.from = { x: e.x, y: e.y, z: e.z };
  out.sounds.push(`alert:${e.kind}`);
  state.burst = Math.max(state.burst, 0.6);
}

function stepStalkerIdle(state, e, inp, looking) {
  const S = ENTITIES.stalker;
  if (e.mode === 'dormant') {
    if (inp.feet.z < S.startZ && playerPlace(inp.feet) === 'exterior') {
      e.mode = 'idle';
      e.nextMove = inp.time;
    } else return;
  }
  // Merodea: reaparece cada vez más cerca, solo cuando no lo miras.
  if (!looking && inp.time >= e.nextMove && TERRITORY.stalker.reach(playerPlace(inp.feet), inp.feet)) {
    const spot = pickStalkerSpot(state.rng, inp.feet, inp.forward, e.distance);
    if (spot) {
      e.x = spot.x;
      e.z = spot.z;
      e.y = heightAt(spot.x, spot.z) - 0.15;
      e.visible = true;
      e.distance = Math.max(S.minDistance, e.distance - S.approach);
      e.nextMove = inp.time + state.rng.range(...S.moveEvery);
    }
  }
}

function stepGrinnerScript(e, inp, place, out) {
  const G = ENTITIES.grinner;
  const { lz } = toHutLocal(inp.feet.x, inp.feet.z);
  let light = 1;
  if (e.script === 'waiting' && place === 'corridor') {
    e.script = 'peeking';
    e.visible = true;
    e.t = 0;
  } else if (e.script === 'peeking') {
    if (lz < G.triggerZ) {
      e.script = 'blackout';
      e.t = 0;
      e.visible = false;
      out.sounds.push('lights-off');
    }
  } else if (e.script === 'blackout') {
    light = 0.03;
    if (e.t > G.blackout) {
      // La luz vuelve y está frente a tu cara.
      e.script = 'scare';
      e.t = 0;
      placeInFace(e, inp.eye, inp.forward, G.scareDistance);
      e.visible = true;
      out.sounds.push('sting');
    }
  } else if (e.script === 'scare') {
    if (e.t > G.scare) {
      e.script = 'aftermath';
      e.t = 0;
      e.visible = false;
      out.sounds.push('lights-off');
    }
  } else if (e.script === 'aftermath') {
    light = 0.03;
    if (e.t > G.aftermath) {
      // Se va a esperar junto a la puerta. Ahora sí, caza.
      out.sounds.push('lights-on');
      goHome(e);
      e.calmUntil = inp.time + 2.5;
      e.t = 0;
    }
  }
  if (e.script === 'scare') {
    light = flicker(e.t * 0.5 + 0.7);
    out.interference = Math.max(out.interference, e.t < 0.12 ? 1 : 0.5);
  }
  return light;
}

/** Coloca la cara de la entidad frente a los ojos del jugador. */
export function placeInFace(e, eye, forward, distance) {
  const fl = Math.hypot(forward.x, forward.z) || 1;
  e.x = eye.x + (forward.x / fl) * distance;
  e.z = eye.z + (forward.z / fl) * distance;
  e.y = eye.y - ENTITY_SIZES[e.kind].height * FACE_HEIGHT[e.kind];
}

/** Parpadeo de bombillas al volver la luz (determinista). */
export function flicker(t) {
  if (t > 0.6) return 1;
  return Math.sin(t * 70) + Math.sin(t * 23) > 0.3 ? 1 : 0.08;
}

function stepHunter(state, e, inp, place, out) {
  const C = ENTITIES[e.kind];
  const { feet, eye, forward, dt, time, world } = inp;
  e.t += dt;
  const d = flatDist(e, feet);
  const los = e.visible && lineOfSight(e, feet, place);
  const facing = viewCos(eye, forward, center(e));
  const looking = los && facing > ENTITIES.viewCos;

  // La cruz las repele si las apuntas.
  if (state.cross.active && los && facing > CROSS.cos && d < CROSS.range && (ACTIVE_MODES.has(e.mode) || e.mode === 'idle')) {
    if (e.mode !== 'idle' || time >= e.calmUntil) {
      e.mode = 'repelled';
      e.t = 0;
      out.sounds.push(`repel:${e.kind}`);
      state.burst = Math.max(state.burst, 0.8);
    }
  }

  switch (e.mode) {
    case 'dormant':
    case 'idle':
      if (e.kind === 'stalker') stepStalkerIdle(state, e, inp, looking);
      if (e.mode === 'idle' && e.visible && senses(e, inp, place, looking)) alert(state, e, inp, out);
      if (looking) out.interference = Math.max(out.interference, 0.2);
      break;

    case 'alert': {
      // Se queda quieta y grita. La Aguja salta del techo hacia ti.
      if (e.kind === 'percher' && e.from.y > HUT_WALL_TOP) {
        const k = Math.min(1, e.t / C.alert);
        const a = Math.atan2(feet.x - HUT.x, feet.z - HUT.z);
        const lx = HUT.x + Math.sin(a) * (HUT.outerRadius + 1.0);
        const lzz = HUT.z + Math.cos(a) * (HUT.outerRadius + 1.0);
        const ly = heightAt(lx, lzz) - 0.1;
        e.x = e.from.x + (lx - e.from.x) * k;
        e.z = e.from.z + (lzz - e.from.z) * k;
        e.y = e.from.y + (ly - e.from.y) * k * k + Math.sin(k * Math.PI) * 0.6;
      }
      out.interference = Math.max(out.interference, 0.6);
      if (e.t > C.alert) {
        e.mode = 'chase';
        e.t = 0;
      }
      break;
    }

    case 'chase': {
      if (senses(e, inp, place, looking)) {
        e.lastSeen = { x: feet.x, z: feet.z };
        e.lost = 0;
      } else {
        e.lost += dt;
      }
      e.unreachable = TERRITORY[e.kind].reach(place, feet) ? 0 : e.unreachable + dt;
      const speed = C.speed * (looking ? ENTITIES.lookBoost : ENTITIES.ignoreFactor);
      moveToward(e, e.lastSeen, speed, dt, world);
      if (flatDist(e, feet) < ENTITIES.catchDistance && TERRITORY[e.kind].reach(place, feet)) out.caught = e.kind;
      if (e.lost > C.loseTime || e.unreachable > ENTITIES.unreachableGiveUp) {
        e.mode = 'search';
        e.t = 0;
      }
      out.interference = Math.max(out.interference, (looking ? 0.35 : 0.15) + 0.5 * smoothstep(14, 2, d));
      break;
    }

    case 'search': {
      // Da vueltas donde te vio por última vez.
      const ang = e.t * 1.7;
      const target = { x: e.lastSeen.x + Math.cos(ang) * 2, z: e.lastSeen.z + Math.sin(ang) * 2 };
      moveToward(e, target, C.speed * 0.5, dt, world);
      if (senses(e, inp, place, looking)) {
        e.mode = 'chase';
        e.t = 0;
        e.lost = 0;
        e.lastSeen = { x: feet.x, z: feet.z };
        out.sounds.push(`alert:${e.kind}`);
      } else if (e.t > C.searchTime) {
        e.mode = 'return';
        e.t = 0;
      }
      break;
    }

    case 'return':
      // Vuelve a su sitio en cuanto dejas de mirarla.
      if (!looking) {
        goHome(e);
        e.calmUntil = time + 2;
      } else {
        moveToward(e, e.home, C.speed * 0.4, dt, world);
      }
      break;

    case 'repelled': {
      // Retrocede chillando y se esfuma.
      const dx = e.x - feet.x;
      const dz = e.z - feet.z;
      const dd = Math.hypot(dx, dz) || 1;
      moveToward(e, { x: e.x + (dx / dd) * 5, z: e.z + (dz / dd) * 5 }, C.repelSpeed, dt, world);
      out.interference = Math.max(out.interference, 0.7);
      if (e.t > C.repelTime) {
        goHome(e);
        e.calmUntil = time + C.calm;
        if (e.kind === 'grinner') {
          // Reaparece detrás de ti, del lado de la escalera: el camino a la puerta queda libre.
          const { lz } = toHutLocal(feet.x, feet.z);
          e.x = HUT.x;
          e.z = HUT.z + Math.min(CORRIDOR.zStart - 0.2, lz + 9);
          TERRITORY.grinner.clamp(e);
        }
        out.sounds.push('vanish');
        state.burst = 1;
      }
      break;
    }
    default:
      break;
  }

  if (ACTIVE_MODES.has(e.mode)) out.threat = Math.max(out.threat, smoothstep(26, 1.5, flatDist(e, feet)));
  out.voices[e.kind] = { active: ACTIVE_MODES.has(e.mode), x: e.x, y: e.y + ENTITY_SIZES[e.kind].height * 0.6, z: e.z };
  out.sprites[e.kind] = {
    visible: e.visible,
    x: e.x,
    y: e.y,
    z: e.z,
    moving: e.mode === 'chase' || e.mode === 'search' || e.mode === 'repelled',
    flash: false,
    mode: e.mode,
  };
}

function stepCross(state, inp, out) {
  const cr = state.cross;
  const wasActive = cr.active;
  if (cr.broken && cr.level >= CROSS.rearm) cr.broken = false;
  cr.active = Boolean(inp.crossHeld) && !cr.broken && cr.level > 0;
  if (cr.active) {
    cr.level -= CROSS.drain * inp.dt;
    if (cr.level <= 0) {
      cr.level = 0;
      cr.broken = true;
      cr.active = false;
      out.sounds.push('cross-broken');
    }
  } else {
    cr.level = Math.min(1, cr.level + CROSS.recharge * inp.dt);
  }
  if (cr.active && !wasActive) out.sounds.push('cross-up');
  out.cross = { level: cr.level, active: cr.active, broken: cr.broken };
}

/**
 * Avanza todas las entidades.
 * @param {ReturnType<typeof createEntityState>} state
 * @param {{ time: number, dt: number, feet: {x,y,z}, eye: {x,y,z}, forward: {x,y,z},
 *           crouched?: boolean, sprinting?: boolean, crossHeld?: boolean, world?: object }} inp
 */
export function stepEntities(state, inp) {
  const out = {
    sprites: {},
    voices: {},
    interference: 0,
    lightLevel: 1,
    threat: 0,
    sounds: [],
    caught: null,
    cross: null,
  };
  const place = playerPlace(inp.feet);
  stepCross(state, inp, out);

  for (const e of Object.values(state.entities)) {
    if (e.mode === 'script') {
      e.t += inp.dt;
      out.lightLevel = stepGrinnerScript(e, inp, place, out);
      out.sprites[e.kind] = { visible: e.visible, x: e.x, y: e.y, z: e.z, moving: false, flash: e.script === 'scare', mode: 'script' };
      out.voices[e.kind] = { active: false, x: e.x, y: e.y, z: e.z };
      continue;
    }
    stepHunter(state, e, inp, place, out);
  }
  // Luces del pasillo: parpadean un momento después del susto.
  const g = state.entities.grinner;
  if (g.mode !== 'script' && g.t < 0.7 && g.mode === 'idle') out.lightLevel = Math.min(out.lightLevel, flicker(g.t));

  state.burst = Math.max(0, state.burst - inp.dt * 2.5);
  out.interference = Math.min(1, Math.max(out.interference, state.burst));
  return out;
}
