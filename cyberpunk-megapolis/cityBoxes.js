/**
 * World collision for the city.
 *
 * Every placement contributes one world-space AABB, indexed in a 100 m
 * spatial-hash grid. AABBs are used ONLY for broad phase, camera obstruction
 * and web-anchor candidate scoring. Anything that pushes the player, anchors a
 * web or lands a zip is then confirmed against real triangles, so an L-shaped
 * building or a walkway spanning open air can never produce an invisible wall.
 */
import * as THREE from 'three';

const CELL = 100;

/* ------------------------------------------------------------------ flags */
export const F_COLLIDE = 1 << 0;
export const F_PLATFORM = 1 << 1;   // walkable top surface (roads, slabs, roofs)
export const F_DECAL = 1 << 2;      // never collides, never anchors
export const F_SAFETY = 1 << 3;     // safety floor: walkable, but no web anchors
export const F_AWNING = 1 << 4;     // low overhang: must not pull the player up
export const F_ANCHOR = 1 << 5;     // valid web-anchor / zip target surface
export const F_BUILDING = 1 << 6;

export class CityBoxes {
  constructor(capacity = 1) {
    this.n = 0;
    this.cap = Math.max(1, capacity);
    this.min = new Float32Array(this.cap * 3);
    this.max = new Float32Array(this.cap * 3);
    this.mat = new Float32Array(this.cap * 16);
    this.inv = new Float32Array(this.cap * 16);
    this.prefab = new Int32Array(this.cap);
    this.flags = new Uint8Array(this.cap);
    this.cells = new Map();          // "cx,cz" -> Int32Array of instance ids
    this._cellLists = new Map();
    this.tri = [];                   // prefabIdx -> [{pos:Float32Array, idx:Uint32Array}]
    this._mark = new Int32Array(this.cap);
    this._stamp = 0;
    this._m4 = new THREE.Matrix4();
    this.stats = { rays: 0, triTests: 0 };
  }

  _grow(need) {
    if (need <= this.cap) return;
    const cap = Math.max(need, Math.ceil(this.cap * 1.7));
    const cp = (src, stride, Type) => { const d = new Type(cap * stride); d.set(src); return d; };
    this.min = cp(this.min, 3, Float32Array);
    this.max = cp(this.max, 3, Float32Array);
    this.mat = cp(this.mat, 16, Float32Array);
    this.inv = cp(this.inv, 16, Float32Array);
    this.prefab = cp(this.prefab, 1, Int32Array);
    this.flags = cp(this.flags, 1, Uint8Array);
    this._mark = new Int32Array(cap);
    this.cap = cap;
  }

  setTriangles(prefabIdx, prims) { this.tri[prefabIdx] = prims; }

  /** matrix: THREE.Matrix4 in world space; box: local-space THREE.Box3 */
  add(prefabIdx, matrix, localBox, flags) {
    this._grow(this.n + 1);
    const i = this.n++;
    // transform the 8 corners to get a tight world AABB
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity;
    const e = matrix.elements;
    for (let c = 0; c < 8; c++) {
      const lx = (c & 1) ? localBox.max.x : localBox.min.x;
      const ly = (c & 2) ? localBox.max.y : localBox.min.y;
      const lz = (c & 4) ? localBox.max.z : localBox.min.z;
      const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
      const y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
      const z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      if (x < ax) ax = x; if (y < ay) ay = y; if (z < az) az = z;
      if (x > bx) bx = x; if (y > by) by = y; if (z > bz) bz = z;
    }
    this.min[i * 3] = ax; this.min[i * 3 + 1] = ay; this.min[i * 3 + 2] = az;
    this.max[i * 3] = bx; this.max[i * 3 + 1] = by; this.max[i * 3 + 2] = bz;
    this.mat.set(e, i * 16);
    this._m4.copy(matrix).invert();
    this.inv.set(this._m4.elements, i * 16);
    this.prefab[i] = prefabIdx;
    this.flags[i] = flags;
    return i;
  }

  /** build the spatial hash; call once after all instances are added */
  build() {
    const buckets = new Map();
    for (let i = 0; i < this.n; i++) {
      if (!(this.flags[i] & F_COLLIDE)) continue;
      const x0 = Math.floor(this.min[i * 3] / CELL), x1 = Math.floor(this.max[i * 3] / CELL);
      const z0 = Math.floor(this.min[i * 3 + 2] / CELL), z1 = Math.floor(this.max[i * 3 + 2] / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = cx * 100003 + cz;
          let list = buckets.get(k);
          if (!list) buckets.set(k, list = []);
          list.push(i);
        }
      }
    }
    this.cells = new Map();
    for (const [k, list] of buckets) this.cells.set(k, Int32Array.from(list));
    this.cellCount = this.cells.size;
    return this;
  }

  _cell(cx, cz) { return this.cells.get(cx * 100003 + cz); }

  /* ------------------------------------------------------------ broad phase */
  /** instance ids whose AABB overlaps the given world box */
  queryBox(ax, ay, az, bx, by, bz, out) {
    out.length = 0;
    const stamp = ++this._stamp;
    const x0 = Math.floor(ax / CELL), x1 = Math.floor(bx / CELL);
    const z0 = Math.floor(az / CELL), z1 = Math.floor(bz / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this._cell(cx, cz);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (this._mark[i] === stamp) continue;
          this._mark[i] = stamp;
          if (this.max[i * 3] < ax || this.min[i * 3] > bx) continue;
          if (this.max[i * 3 + 1] < ay || this.min[i * 3 + 1] > by) continue;
          if (this.max[i * 3 + 2] < az || this.min[i * 3 + 2] > bz) continue;
          out.push(i);
        }
      }
    }
    return out;
  }

  /** instance ids in the cells a ray passes through (2D DDA over XZ) */
  queryRay(ox, oy, oz, dx, dy, dz, maxDist, out) {
    out.length = 0;
    const stamp = ++this._stamp;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const cxe = Math.floor(ex / CELL), cze = Math.floor(ez / CELL);
    const yMin = Math.min(oy, oy + dy * maxDist) - 0.5;
    const yMax = Math.max(oy, oy + dy * maxDist) + 0.5;
    const stepX = Math.sign(cxe - cx), stepZ = Math.sign(cze - cz);
    let guard = 0;
    const push = (gx, gz) => {
      for (let a = -0; a <= 0; a++) {
        const list = this._cell(gx, gz);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (this._mark[i] === stamp) continue;
          this._mark[i] = stamp;
          if (this.max[i * 3 + 1] < yMin || this.min[i * 3 + 1] > yMax) continue;
          out.push(i);
        }
      }
    };
    // walk the cells between start and end, plus the immediate neighbours so a
    // ray grazing a cell border cannot miss geometry
    const n = Math.abs(cxe - cx) + Math.abs(cze - cz);
    push(cx, cz);
    if (n === 0) { push(cx + 1, cz); push(cx - 1, cz); push(cx, cz + 1); push(cx, cz - 1); return out; }
    const tdx = dx !== 0 ? Math.abs(CELL / (dx * maxDist)) : Infinity;
    const tdz = dz !== 0 ? Math.abs(CELL / (dz * maxDist)) : Infinity;
    let tx = dx !== 0 ? Math.abs(((stepX > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL)) / (Math.abs(dx) * maxDist)) : Infinity;
    let tz = dz !== 0 ? Math.abs(((stepZ > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL)) / (Math.abs(dz) * maxDist)) : Infinity;
    while (guard++ < 96 && (cx !== cxe || cz !== cze)) {
      if (tx < tz) { cx += stepX; tx += tdx; } else { cz += stepZ; tz += tdz; }
      push(cx, cz);
      if (tx > 1 && tz > 1) break;
    }
    return out;
  }

  /* -------------------------------------------------------------- raycast */
  /**
   * Real-geometry ray test. Returns null or
   * { dist, px, py, pz, nx, ny, nz, inst, flags }.
   * `mask` requires those flag bits; `reject` excludes them.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, { mask = 0, reject = F_DECAL, ignoreBackfaces = false } = {}) {
    this.stats.rays++;
    const cands = this._cands || (this._cands = []);
    this.queryRay(ox, oy, oz, dx, dy, dz, maxDist, cands);
    let best = maxDist, hit = null;
    for (let c = 0; c < cands.length; c++) {
      const i = cands[c];
      const f = this.flags[i];
      if (mask && (f & mask) !== mask) continue;
      if (f & reject) continue;
      // slab test against the world AABB first
      const t = this._slab(i, ox, oy, oz, dx, dy, dz, best);
      if (t < 0) continue;
      const prims = this.tri[this.prefab[i]];
      if (!prims) continue;
      const inv = this.inv, o = i * 16;
      // transform ray into local space
      const lox = inv[o] * ox + inv[o + 4] * oy + inv[o + 8] * oz + inv[o + 12];
      const loy = inv[o + 1] * ox + inv[o + 5] * oy + inv[o + 9] * oz + inv[o + 13];
      const loz = inv[o + 2] * ox + inv[o + 6] * oy + inv[o + 10] * oz + inv[o + 14];
      const ldx = inv[o] * dx + inv[o + 4] * dy + inv[o + 8] * dz;
      const ldy = inv[o + 1] * dx + inv[o + 5] * dy + inv[o + 9] * dz;
      const ldz = inv[o + 2] * dx + inv[o + 6] * dy + inv[o + 10] * dz;
      const scale = Math.hypot(ldx, ldy, ldz) || 1;
      const ndx = ldx / scale, ndy = ldy / scale, ndz = ldz / scale;
      for (let p = 0; p < prims.length; p++) {
        const { pos, idx } = prims[p];
        this.stats.triTests += idx.length / 3;
        for (let k = 0; k < idx.length; k += 3) {
          const a = idx[k] * 3, b = idx[k + 1] * 3, cc = idx[k + 2] * 3;
          const t0 = this._tri(pos, a, b, cc, lox, loy, loz, ndx, ndy, ndz, best * scale, ignoreBackfaces);
          if (t0 >= 0) {
            const world = t0 / scale;
            if (world < best) {
              best = world;
              hit = hit || {};
              hit.dist = world;
              hit.inst = i;
              hit.flags = f;
              // local hit point + geometric normal, brought back to world space
              const lx = lox + ndx * t0, ly = loy + ndy * t0, lz = loz + ndz * t0;
              const m = this.mat;
              hit.px = m[o] * lx + m[o + 4] * ly + m[o + 8] * lz + m[o + 12];
              hit.py = m[o + 1] * lx + m[o + 5] * ly + m[o + 9] * lz + m[o + 13];
              hit.pz = m[o + 2] * lx + m[o + 6] * ly + m[o + 10] * lz + m[o + 14];
              const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
              const e2x = pos[cc] - pos[a], e2y = pos[cc + 1] - pos[a + 1], e2z = pos[cc + 2] - pos[a + 2];
              let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
              const wnx = m[o] * nx + m[o + 4] * ny + m[o + 8] * nz;
              const wny = m[o + 1] * nx + m[o + 5] * ny + m[o + 9] * nz;
              const wnz = m[o + 2] * nx + m[o + 6] * ny + m[o + 10] * nz;
              const nl = Math.hypot(wnx, wny, wnz) || 1;
              hit.nx = wnx / nl; hit.ny = wny / nl; hit.nz = wnz / nl;
              if (hit.nx * dx + hit.ny * dy + hit.nz * dz > 0) { hit.nx *= -1; hit.ny *= -1; hit.nz *= -1; }
            }
          }
        }
      }
    }
    return hit;
  }

  _slab(i, ox, oy, oz, dx, dy, dz, maxT) {
    const o = i * 3;
    let tmin = 0, tmax = maxT;
    for (let a = 0; a < 3; a++) {
      const od = a === 0 ? ox : a === 1 ? oy : oz;
      const dd = a === 0 ? dx : a === 1 ? dy : dz;
      const lo = this.min[o + a], hi = this.max[o + a];
      if (Math.abs(dd) < 1e-9) { if (od < lo || od > hi) return -1; continue; }
      let t1 = (lo - od) / dd, t2 = (hi - od) / dd;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    return tmin;
  }

  /** Möller–Trumbore */
  _tri(p, a, b, c, ox, oy, oz, dx, dy, dz, maxT, cull) {
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (cull ? det < 1e-9 : Math.abs(det) < 1e-9) return -1;
    const invDet = 1 / det;
    const sx = ox - p[a], sy = oy - p[a + 1], sz = oz - p[a + 2];
    const u = (sx * hx + sy * hy + sz * hz) * invDet;
    if (u < -1e-6 || u > 1 + 1e-6) return -1;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * invDet;
    if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    return (t > 1e-5 && t < maxT) ? t : -1;
  }

  /* --------------------------------------------------------- convenience */
  /** downward probe; returns hit or null */
  groundAt(x, y, z, depth = 6, opts) {
    return this.raycast(x, y, z, 0, -1, 0, depth, opts || { reject: F_DECAL });
  }

  /** AABB-only segment test; used for camera obstruction (cheap, conservative) */
  segmentHitsBox(ax, ay, az, bx, by, bz, pad = 0.2) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return 0;
    const nx = dx / len, ny = dy / len, nz = dz / len;
    const cands = this._cands2 || (this._cands2 = []);
    this.queryRay(ax, ay, az, nx, ny, nz, len, cands);
    let best = -1;
    for (let c = 0; c < cands.length; c++) {
      const i = cands[c];
      if (this.flags[i] & (F_DECAL | F_SAFETY)) continue;
      const o = i * 3;
      // inflate by pad so the camera never clips a wall's skin
      const savedMin = [this.min[o], this.min[o + 1], this.min[o + 2]];
      const savedMax = [this.max[o], this.max[o + 1], this.max[o + 2]];
      this.min[o] -= pad; this.min[o + 1] -= pad; this.min[o + 2] -= pad;
      this.max[o] += pad; this.max[o + 1] += pad; this.max[o + 2] += pad;
      const t = this._slab(i, ax, ay, az, nx, ny, nz, len);
      this.min[o] = savedMin[0]; this.min[o + 1] = savedMin[1]; this.min[o + 2] = savedMin[2];
      this.max[o] = savedMax[0]; this.max[o + 1] = savedMax[1]; this.max[o + 2] = savedMax[2];
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best < 0 ? 0 : best / len;    // 0 = clear, else fraction along the segment
  }

  /**
   * Broad-phase web-anchor candidates: high surfaces in front of / above the
   * player. Returns scored candidates; the caller confirms with a real ray.
   */
  anchorCandidates(px, py, pz, fx, fy, fz, radius, minAbove, out) {
    out.length = 0;
    const cands = this._cands3 || (this._cands3 = []);
    this.queryBox(px - radius, py - 10, pz - radius, px + radius, py + radius, pz + radius, cands);
    const fh = Math.hypot(fx, fz) || 1e-3;
    // Aim a little above where the camera looks. Aiming at the top of the box
    // instead would put a 200 m tower's anchor 200 m up and out of range, which
    // is exactly how a dense skyline ends up with nothing to grab.
    const aimUp = Math.max(0.35, fy / fh + 0.55);
    for (let c = 0; c < cands.length; c++) {
      const i = cands[c];
      const f = this.flags[i];
      if (!(f & F_ANCHOR)) continue;              // safety floors and decals excluded
      const o = i * 3;
      const topY = this.max[o + 1];
      if (topY < py + minAbove) continue;
      const cxm = (this.min[o] + this.max[o]) * 0.5;
      const czm = (this.min[o + 2] + this.max[o + 2]) * 0.5;
      const horiz = Math.hypot(cxm - px, czm - pz);
      if (horiz > radius) continue;

      // walk out along the look direction to this box, then clamp onto it
      const reach = Math.min(horiz, radius);
      const ax = Math.min(Math.max(px + fx * reach, this.min[o] + 0.4), this.max[o] - 0.4);
      const az = Math.min(Math.max(pz + fz * reach, this.min[o + 2] + 0.4), this.max[o + 2] - 0.4);
      const flat = Math.hypot(ax - px, az - pz);
      // the highest point still inside the search sphere at this distance
      const headroom = Math.sqrt(Math.max(0, radius * radius - flat * flat));
      let ay = py + aimUp * Math.max(flat, 4);
      if (ay > topY - 0.35) ay = topY - 0.35;
      if (ay > py + headroom * 0.94) ay = py + headroom * 0.94;
      if (ay < py + minAbove) continue;           // nothing high enough on this box

      const vx = ax - px, vy = ay - py, vz = az - pz;
      const d = Math.hypot(vx, vy, vz);
      if (d < 6 || d > radius) continue;
      const align = (vx * fx + vy * fy + vz * fz) / (d || 1);
      if (align < 0.12) continue;
      // a zip wants the rooftop edge nearest the player, not the web's aim point
      const ex = Math.min(Math.max(px, this.min[o] + 0.5), this.max[o] - 0.5);
      const ez = Math.min(Math.max(pz, this.min[o + 2] + 0.5), this.max[o + 2] - 0.5);
      const evx = ex - px, evy = topY - py, evz = ez - pz;
      const ed = Math.hypot(evx, evy, evz) || 1;
      const alignEdge = (evx * fx + evy * fy + evz * fz) / ed;
      // score: height gained, how well it matches where we are looking, distance
      const heightScore = Math.min(Math.max((ay - py) / 60, 0), 1.6);
      const distScore = 1 - Math.abs(d - radius * 0.55) / radius;
      const score = heightScore * 1.5 + align * 1.9 + distScore * 0.9 + ((f & F_BUILDING) ? 0.5 : 0);
      out.push({ i, ax, ay, az, ex, ez, topY, edgeDist: ed, d, align, alignEdge, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  dispose() {
    this.cells.clear();
    this.tri.length = 0;
    this.n = 0;
  }
}
