// Física mínima de personaje: superficies caminables (alturas), colisionadores verticales
// (círculos y segmentos en el plano XZ con rango de altura) y bloqueadores (zonas prohibidas).
// Puro y genérico: cada escena describe su mundo y este módulo lo resuelve.

/**
 * @typedef {{ type: string, contains: (x:number, z:number) => boolean, height: (x:number, z:number) => number }} Surface
 * @typedef {{ kind: 'circle', x:number, z:number, r:number, yMin:number, yMax:number }} CircleCollider
 * @typedef {{ kind: 'segment', ax:number, az:number, bx:number, bz:number, yMin:number, yMax:number }} SegmentCollider
 */

export function createPhysicsWorld({ surfaces = [], colliders = [], blockers = [] } = {}) {
  return { surfaces, colliders, blockers };
}

/** Superficie más alta bajo (x, z) que se pueda alcanzar desde la altura y (subiendo como mucho stepUp). */
export function groundAt(world, x, z, y, stepUp) {
  let best = null;
  for (const s of world.surfaces) {
    if (!s.contains(x, z)) continue;
    const h = s.height(x, z);
    if (h <= y + stepUp && (best === null || h > best.height)) best = { height: h, surface: s };
  }
  return best;
}

export function isBlocked(world, x, z, y) {
  for (const b of world.blockers) if (b(x, z, y)) return true;
  return false;
}

/** Empuja `pos` fuera de los colisionadores que se cruzan con el cuerpo [bodyMin, bodyMax]. */
export function resolveCollisions(world, pos, radius, bodyMin, bodyMax, iterations = 3) {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const c of world.colliders) {
      if (bodyMax <= c.yMin || bodyMin >= c.yMax) continue;
      if (c.kind === 'circle') {
        let dx = pos.x - c.x;
        let dz = pos.z - c.z;
        let d = Math.hypot(dx, dz);
        const min = radius + c.r;
        if (d >= min) continue;
        if (d < 1e-6) {
          dx = 1;
          dz = 0;
          d = 1;
        }
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
        moved = true;
      } else {
        const abx = c.bx - c.ax;
        const abz = c.bz - c.az;
        const len2 = abx * abx + abz * abz;
        let t = len2 === 0 ? 0 : ((pos.x - c.ax) * abx + (pos.z - c.az) * abz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = c.ax + abx * t;
        const pz = c.az + abz * t;
        let dx = pos.x - px;
        let dz = pos.z - pz;
        let d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d < 1e-6) {
          // Justo sobre la línea: empuja por la normal del segmento.
          const len = Math.sqrt(len2) || 1;
          dx = -abz / len;
          dz = abx / len;
          d = 1;
        }
        pos.x = px + (dx / d) * radius;
        pos.z = pz + (dz / d) * radius;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return pos;
}

/**
 * Mueve al personaje (dx, dz) respetando colisiones, suelo y bloqueos.
 * `state` = { x, y, z, vy, grounded, surface } se modifica en el sitio. Devuelve `state`.
 */
export function moveCharacter(world, state, dx, dz, opts) {
  const { radius, height, stepUp, snapDown, gravity, dt } = opts;
  const attempt = (nx, nz) => {
    const p = { x: nx, z: nz };
    resolveCollisions(world, p, radius, state.y + 0.05, state.y + height);
    const g = groundAt(world, p.x, p.z, state.y, stepUp);
    if (!g || isBlocked(world, p.x, p.z, state.y)) return null;
    return { x: p.x, z: p.z, ground: g };
  };

  const result =
    attempt(state.x + dx, state.z + dz) ||
    (dx !== 0 ? attempt(state.x + dx, state.z) : null) ||
    (dz !== 0 ? attempt(state.x, state.z + dz) : null) ||
    attempt(state.x, state.z);

  let ground;
  if (result) {
    state.x = result.x;
    state.z = result.z;
    ground = result.ground;
  } else {
    ground = groundAt(world, state.x, state.z, state.y, stepUp);
  }

  if (!ground) {
    state.vy -= gravity * dt;
    state.y += state.vy * dt;
    state.grounded = false;
    return state;
  }

  state.surface = ground.surface.type;
  state.surfaceRef = ground.surface;
  if (ground.height >= state.y) {
    state.y = ground.height;
    state.vy = 0;
    state.grounded = true;
  } else if (state.grounded && state.y - ground.height <= snapDown) {
    state.y = ground.height;
    state.vy = 0;
  } else {
    state.vy -= gravity * dt;
    state.y += state.vy * dt;
    if (state.y <= ground.height) {
      state.y = ground.height;
      state.vy = 0;
      state.grounded = true;
    } else {
      state.grounded = false;
    }
  }
  return state;
}

/** Tipo de superficie para los pasos ('mud', 'water', 'wood', 'concrete'...). */
export function footstepSurface(state) {
  const s = state.surfaceRef;
  if (s && s.typeAt) return s.typeAt(state.x, state.z);
  return state.surface || 'mud';
}
