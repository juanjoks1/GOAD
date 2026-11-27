// Utilidades matemáticas puras. Sin DOM ni Three.js: se pueden usar desde las pruebas.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const mod = (n, m) => ((n % m) + m) % m;

/** smoothstep de GLSL. Acepta edge0 > edge1 (curva invertida). */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Suavizado exponencial independiente del framerate: factor para lerp con constante `rate` (1/s). */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Distancia del punto (px,pz) al segmento (ax,az)-(bx,bz) en el plano XZ. */
export function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** Distancia mínima de un punto a una polilínea [[x,z], ...]. */
export function distToPolyline(px, pz, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const d = distToSegment(px, pz, ax, az, bx, bz);
    if (d < best) best = d;
  }
  return best;
}
