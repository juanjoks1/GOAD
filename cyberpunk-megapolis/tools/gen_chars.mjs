/**
 * Generates the two Survivor characters as skinned, Draco-compressed GLBs with
 * a 22-bone skeleton and 11 authored animation clips each.
 *
 * Every clip is written as per-bone quaternion tracks sampled at 20 fps from
 * pose functions. Scale tracks are never authored, and pelvis translation only
 * exists on the grounded locomotion clips -- the airborne/swing/roll clips are
 * driven entirely by the physics solver, so root motion would fight it.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../vendor/three/three.module.js';
import { mergeVertices } from '../vendor/three/jsm/utils/BufferGeometryUtils.js';
import { GLB, initDraco } from './lib/glb.mjs';
import { RNG } from './lib/rng.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'chars');
fs.mkdirSync(OUT, { recursive: true });
await initDraco();

/* ============================================================== skeleton */
/** name -> [x, y, z] rest position in bind space (character faces +Z) */
function skeletonFor(scale, hipW, shoulderW) {
  const S = (v) => v * scale;
  const B = {
    hips: [0, S(0.98), 0],
    spine: [0, S(1.10), 0],
    chest: [0, S(1.26), 0],
    neck: [0, S(1.47), 0],
    head: [0, S(1.57), 0],
    // Arms rest hanging, not in a T-pose. Every clip rotates the upper arm
    // about X to swing it forward and back and about Z to lift it outward,
    // which is only what those axes mean if the rest arm points down.
    shoulder_l: [hipW * 0.55, S(1.43), 0],
    upperarm_l: [shoulderW, S(1.40), 0],
    forearm_l: [shoulderW + S(0.045), S(1.113), S(0.012)],
    hand_l: [shoulderW + S(0.078), S(0.855), S(0.022)],
    shoulder_r: [-hipW * 0.55, S(1.43), 0],
    upperarm_r: [-shoulderW, S(1.40), 0],
    forearm_r: [-shoulderW - S(0.045), S(1.113), S(0.012)],
    hand_r: [-shoulderW - S(0.078), S(0.855), S(0.022)],
    thigh_l: [hipW, S(0.93), 0],
    shin_l: [hipW * 1.05, S(0.52), S(0.01)],
    foot_l: [hipW * 1.05, S(0.10), S(-0.02)],
    toe_l: [hipW * 1.05, S(0.03), S(0.13)],
    thigh_r: [-hipW, S(0.93), 0],
    shin_r: [-hipW * 1.05, S(0.52), S(0.01)],
    foot_r: [-hipW * 1.05, S(0.10), S(-0.02)],
    toe_r: [-hipW * 1.05, S(0.03), S(0.13)],
  };
  const PARENT = {
    hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
    shoulder_l: 'chest', upperarm_l: 'shoulder_l', forearm_l: 'upperarm_l', hand_l: 'forearm_l',
    shoulder_r: 'chest', upperarm_r: 'shoulder_r', forearm_r: 'upperarm_r', hand_r: 'forearm_r',
    thigh_l: 'hips', shin_l: 'thigh_l', foot_l: 'shin_l', toe_l: 'foot_l',
    thigh_r: 'hips', shin_r: 'thigh_r', foot_r: 'shin_r', toe_r: 'foot_r',
  };
  return { B, PARENT, names: Object.keys(B) };
}

/** bone segments used for skin weighting: [a, b, boneName] */
function segments(B, PARENT) {
  const segs = [];
  for (const [name, parent] of Object.entries(PARENT)) {
    if (!parent) continue;
    segs.push({ a: new THREE.Vector3(...B[parent]), b: new THREE.Vector3(...B[name]), bone: parent, child: name });
  }
  // tips so extremities are covered
  segs.push({ a: new THREE.Vector3(...B.head), b: new THREE.Vector3(B.head[0], B.head[1] + 0.22, B.head[2]), bone: 'head', child: 'head' });
  segs.push({ a: new THREE.Vector3(...B.hand_l), b: new THREE.Vector3(B.hand_l[0] + 0.012, B.hand_l[1] - 0.115, B.hand_l[2] + 0.01), bone: 'hand_l', child: 'hand_l' });
  segs.push({ a: new THREE.Vector3(...B.hand_r), b: new THREE.Vector3(B.hand_r[0] - 0.012, B.hand_r[1] - 0.115, B.hand_r[2] + 0.01), bone: 'hand_r', child: 'hand_r' });
  segs.push({ a: new THREE.Vector3(...B.toe_l), b: new THREE.Vector3(B.toe_l[0], B.toe_l[1], B.toe_l[2] + 0.08), bone: 'toe_l', child: 'toe_l' });
  segs.push({ a: new THREE.Vector3(...B.toe_r), b: new THREE.Vector3(B.toe_r[0], B.toe_r[1], B.toe_r[2] + 0.08), bone: 'toe_r', child: 'toe_r' });
  return segs;
}

const _v = new THREE.Vector3(), _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function distToSegment(p, a, b) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const t = Math.max(0, Math.min(1, _ap.dot(_ab) / Math.max(1e-6, _ab.lengthSq())));
  _v.copy(a).addScaledVector(_ab, t);
  return p.distanceTo(_v);
}

/** 4 influences per vertex, weighted by inverse distance to the bone segment */
function skinWeights(positions, segs, boneIndexOf, falloff = 2.6) {
  const n = positions.length / 3;
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const scored = [];
  for (let i = 0; i < n; i++) {
    p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    scored.length = 0;
    for (const s of segs) {
      const d = distToSegment(p, s.a, s.b);
      scored.push({ bone: s.bone, w: 1 / Math.pow(d + 0.035, falloff) });
    }
    // fold duplicate bones (a bone may own several segments)
    const byBone = new Map();
    for (const s of scored) byBone.set(s.bone, Math.max(byBone.get(s.bone) || 0, s.w));
    const top = [...byBone.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, b) => a + b[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      joints[i * 4 + k] = top[k] ? boneIndexOf[top[k][0]] : 0;
      weights[i * 4 + k] = top[k] ? top[k][1] / sum : 0;
    }
  }
  return { joints, weights };
}

/* ================================================================ shapes */
function tube(points, radii, radial = 8, squash = 1) {
  const pos = [], idx = [];
  // tolerate a shorter radii list than the point list
  const R = (i) => radii[Math.min(i, radii.length - 1)];
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    dir.subVectors(next, prev).normalize();
    if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
    t1.crossVectors(dir, up); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize();
    t2.crossVectors(dir, t1).normalize();
    for (let r = 0; r < radial; r++) {
      const a = (r / radial) * Math.PI * 2;
      const rr = R(i);
      pos.push(
        p.x + t1.x * Math.cos(a) * rr + t2.x * Math.sin(a) * rr * squash,
        p.y + t1.y * Math.cos(a) * rr + t2.y * Math.sin(a) * rr * squash,
        p.z + t1.z * Math.cos(a) * rr + t2.z * Math.sin(a) * rr * squash,
      );
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (let r = 0; r < radial; r++) {
      const a = i * radial + r, b = i * radial + (r + 1) % radial;
      const c = (i + 1) * radial + r, d = (i + 1) * radial + (r + 1) % radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  // caps
  const capStart = pos.length / 3;
  pos.push(points[0].x, points[0].y, points[0].z);
  const capEnd = pos.length / 3;
  const last = points[points.length - 1];
  pos.push(last.x, last.y, last.z);
  for (let r = 0; r < radial; r++) {
    idx.push(capStart, (r + 1) % radial, r);
    const o = (points.length - 1) * radial;
    idx.push(capEnd, o + r, o + (r + 1) % radial);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function lerpPts(a, b, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(new THREE.Vector3().lerpVectors(a, b, i / n));
  return out;
}
function chain(bones, B, subdiv = 3) {
  const pts = [];
  for (let i = 0; i < bones.length - 1; i++) {
    const a = new THREE.Vector3(...B[bones[i]]), b = new THREE.Vector3(...B[bones[i + 1]]);
    const seg = lerpPts(a, b, subdiv);
    pts.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return pts;
}

/** simple uv: cylindrical around Y for bodies, planar for boxes */
function autoUV(g, scale = 1.6) {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv[i * 2] = (Math.atan2(z, x) / Math.PI * 0.5 + 0.5) * scale;
    uv[i * 2 + 1] = y * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function boxAt(w, h, d, t, r = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(r[0]); g.rotateY(r[1]); g.rotateZ(r[2]);
  g.translate(t[0], t[1], t[2]);
  return g;
}
function sphereAt(r, t, seg = 10, sc = [1, 1, 1]) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(5, seg >> 1));
  g.scale(sc[0], sc[1], sc[2]);
  g.translate(t[0], t[1], t[2]);
  return g;
}

/* ============================================================ animations */
const D2R = Math.PI / 180;
const qx = (d) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), d * D2R);
const qy = (d) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d * D2R);
const qz = (d) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), d * D2R);
const qe = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D2R, y * D2R, z * D2R, 'XYZ'));

/**
 * Pose functions return { boneName: Quaternion } plus optional hips offset.
 * `t` runs 0..1 over the clip.
 */
const POSES = {
  idle: (t) => {
    const b = Math.sin(t * Math.PI * 2);
    return {
      pose: {
        hips: qe(0, Math.sin(t * Math.PI * 2) * 1.5, 0),
        spine: qe(1.5 + b * 1.0, 0, 0),
        chest: qe(-1 - b * 1.2, Math.sin(t * Math.PI * 2 + 1) * 1.2, 0),
        neck: qe(2, 0, 0), head: qe(-1.5 + b * 1.2, Math.sin(t * Math.PI * 2 * 0.7) * 3, 0),
        upperarm_l: qe(4 + b * 1.6, 0, -6), forearm_l: qe(-16 - b * 2, 0, 0),
        upperarm_r: qe(4 - b * 1.6, 0, 6), forearm_r: qe(-16 + b * 2, 0, 0),
        thigh_l: qe(-1, 0, 0), shin_l: qe(3, 0, 0), foot_l: qe(-2, 0, 0),
        thigh_r: qe(-1, 0, 0), shin_r: qe(3, 0, 0), foot_r: qe(-2, 0, 0),
      },
      hips: [0, b * 0.004, 0],
    };
  },
  walk: (t) => {
    const a = t * Math.PI * 2;
    const L = Math.sin(a), R = Math.sin(a + Math.PI);
    const bend = (s) => Math.max(0, -s);
    return {
      pose: {
        hips: qe(2, L * 4, 0),
        spine: qe(3, -L * 3, 0), chest: qe(1, L * 4, 0), neck: qe(1, 0, 0), head: qe(-2, -L * 2, 0),
        upperarm_l: qe(-R * 26 + 6, 0, -8), forearm_l: qe(-26 - bend(R) * 22, 0, 0),
        upperarm_r: qe(-L * 26 + 6, 0, 8), forearm_r: qe(-26 - bend(L) * 22, 0, 0),
        thigh_l: qe(L * 26, 0, 0), shin_l: qe(-bend(L) * 46 - 6, 0, 0), foot_l: qe(bend(L) * 16 + 4, 0, 0),
        thigh_r: qe(R * 26, 0, 0), shin_r: qe(-bend(R) * 46 - 6, 0, 0), foot_r: qe(bend(R) * 16 + 4, 0, 0),
      },
      hips: [0, Math.abs(Math.cos(a)) * 0.022 - 0.011, 0],
    };
  },
  run: (t) => {
    const a = t * Math.PI * 2;
    const L = Math.sin(a), R = Math.sin(a + Math.PI);
    const bend = (s) => Math.max(0, -s);
    return {
      pose: {
        hips: qe(9, L * 7, 0),
        spine: qe(6, -L * 6, 0), chest: qe(3, L * 8, 0), neck: qe(-4, 0, 0), head: qe(-6, -L * 3, 0),
        upperarm_l: qe(-R * 48 + 10, 0, -14), forearm_l: qe(-82 - bend(R) * 20, 0, 0),
        upperarm_r: qe(-L * 48 + 10, 0, 14), forearm_r: qe(-82 - bend(L) * 20, 0, 0),
        thigh_l: qe(L * 46 + 6, 0, 0), shin_l: qe(-bend(L) * 78 - 14 - Math.max(0, L) * 30, 0, 0), foot_l: qe(bend(L) * 24 + 8, 0, 0),
        thigh_r: qe(R * 46 + 6, 0, 0), shin_r: qe(-bend(R) * 78 - 14 - Math.max(0, R) * 30, 0, 0), foot_r: qe(bend(R) * 24 + 8, 0, 0),
      },
      hips: [0, Math.abs(Math.cos(a)) * 0.07 - 0.03, 0],
    };
  },
  jumpFromRun: (t) => {
    const crouch = Math.sin(Math.min(1, t * 2.4) * Math.PI) * (t < 0.42 ? 1 : 0);
    const ext = Math.max(0, (t - 0.38) / 0.62);
    return {
      pose: {
        hips: qe(14 - ext * 16, 0, 0), spine: qe(8 - ext * 10, 0, 0), chest: qe(4 - ext * 6, 0, 0),
        neck: qe(-4, 0, 0), head: qe(-8 + ext * 6, 0, 0),
        upperarm_l: qe(-40 - ext * 90, 0, -20), forearm_l: qe(-60 + ext * 30, 0, 0),
        upperarm_r: qe(-40 - ext * 90, 0, 20), forearm_r: qe(-60 + ext * 30, 0, 0),
        thigh_l: qe(46 * crouch + 30 - ext * 46, 0, 0), shin_l: qe(-70 * crouch - 30 + ext * 24, 0, 0), foot_l: qe(22 * crouch + 8, 0, 0),
        thigh_r: qe(30 * crouch + 10 - ext * 26, 0, 0), shin_r: qe(-52 * crouch - 20 + ext * 14, 0, 0), foot_r: qe(16 * crouch + 6, 0, 0),
      },
    };
  },
  jumpLoop: (t) => {
    const b = Math.sin(t * Math.PI * 2);
    return {
      pose: {
        hips: qe(-6, b * 3, 0), spine: qe(-4, 0, 0), chest: qe(-3, b * 4, 0), neck: qe(2, 0, 0), head: qe(4, b * 3, 0),
        upperarm_l: qe(-126 + b * 8, 0, -26), forearm_l: qe(-34, 0, 0),
        upperarm_r: qe(-126 - b * 8, 0, 26), forearm_r: qe(-34, 0, 0),
        thigh_l: qe(34 + b * 8, 0, 0), shin_l: qe(-62 - b * 10, 0, 0), foot_l: qe(16, 0, 0),
        thigh_r: qe(16 - b * 8, 0, 0), shin_r: qe(-40 + b * 10, 0, 0), foot_r: qe(10, 0, 0),
      },
    };
  },
  fall: (t) => {
    const b = Math.sin(t * Math.PI * 2), c = Math.cos(t * Math.PI * 2 * 0.8);
    return {
      pose: {
        hips: qe(-14, b * 5, 0), spine: qe(-8, 0, c * 3), chest: qe(-6, b * 6, 0), neck: qe(6, 0, 0), head: qe(10, b * 4, 0),
        upperarm_l: qe(-104 + b * 12, -14, -54), forearm_l: qe(-22 + b * 10, 0, 0),
        upperarm_r: qe(-104 - b * 12, 14, 54), forearm_r: qe(-22 - b * 10, 0, 0),
        thigh_l: qe(22 + b * 10, 0, -10), shin_l: qe(-40 - c * 12, 0, 0), foot_l: qe(10, 0, 0),
        thigh_r: qe(10 - b * 10, 0, 10), shin_r: qe(-26 + c * 12, 0, 0), foot_r: qe(8, 0, 0),
      },
    };
  },
  softLanding: (t) => {
    const k = Math.sin(Math.min(1, t * 1.6) * Math.PI);
    return {
      pose: {
        hips: qe(16 * k, 0, 0), spine: qe(10 * k, 0, 0), chest: qe(6 * k, 0, 0), neck: qe(-6 * k, 0, 0), head: qe(-8 * k, 0, 0),
        upperarm_l: qe(-26 - 30 * k, 0, -18 - 10 * k), forearm_l: qe(-40 - 24 * k, 0, 0),
        upperarm_r: qe(-26 - 30 * k, 0, 18 + 10 * k), forearm_r: qe(-40 - 24 * k, 0, 0),
        thigh_l: qe(48 * k + 4, 0, -4), shin_l: qe(-76 * k - 8, 0, 0), foot_l: qe(28 * k + 4, 0, 0),
        thigh_r: qe(44 * k + 4, 0, 4), shin_r: qe(-72 * k - 8, 0, 0), foot_r: qe(26 * k + 4, 0, 0),
      },
    };
  },
  landRoll: (t) => {
    const spin = t < 0.75 ? (t / 0.75) * 360 : 360;
    const tuck = Math.sin(Math.min(1, t / 0.75) * Math.PI);
    const rec = Math.max(0, (t - 0.75) / 0.25);
    return {
      pose: {
        hips: qe(spin, 0, 0),
        spine: qe(34 * tuck, 0, 0), chest: qe(26 * tuck, 0, 0), neck: qe(20 * tuck, 0, 0), head: qe(18 * tuck, 0, 0),
        upperarm_l: qe(-70 - 50 * tuck, 0, -34), forearm_l: qe(-90 - 30 * tuck, 0, 0),
        upperarm_r: qe(-70 - 50 * tuck, 0, 34), forearm_r: qe(-90 - 30 * tuck, 0, 0),
        thigh_l: qe(86 * tuck + 10 - rec * 60, 0, -6), shin_l: qe(-104 * tuck - 10 + rec * 70, 0, 0), foot_l: qe(30 * tuck, 0, 0),
        thigh_r: qe(70 * tuck + 8 - rec * 50, 0, 6), shin_r: qe(-96 * tuck - 8 + rec * 64, 0, 0), foot_r: qe(26 * tuck, 0, 0),
      },
    };
  },
  swingLoop: (t) => {
    const b = Math.sin(t * Math.PI * 2), c = Math.cos(t * Math.PI * 2);
    return {
      pose: {
        hips: qe(-24 + b * 6, c * 8, b * 4),
        spine: qe(-10 + b * 4, -c * 5, 0), chest: qe(-12, c * 6, 0), neck: qe(10, 0, 0), head: qe(14 + b * 4, c * 5, 0),
        // right arm holds the strand overhead, left arm trails
        upperarm_r: qe(-162 + b * 6, 0, 16), forearm_r: qe(-12 + b * 5, 0, 0),
        upperarm_l: qe(-58 + b * 14, -10, -44), forearm_l: qe(-34 - b * 12, 0, 0),
        thigh_l: qe(36 + b * 14, 0, -8), shin_l: qe(-58 - b * 16, 0, 0), foot_l: qe(16, 0, 0),
        thigh_r: qe(14 - b * 12, 0, 8), shin_r: qe(-34 + b * 14, 0, 0), foot_r: qe(12, 0, 0),
      },
    };
  },
  swingRelease: (t) => {
    const e = Math.min(1, t * 1.7);
    return {
      pose: {
        hips: qe(-20 + e * 26, 0, 0), spine: qe(-8 + e * 12, 0, 0), chest: qe(-8 + e * 10, 0, 0), neck: qe(6 - e * 8, 0, 0), head: qe(10 - e * 12, 0, 0),
        upperarm_r: qe(-160 + e * 44, 0, 16 + e * 30), forearm_r: qe(-12 - e * 16, 0, 0),
        upperarm_l: qe(-60 - e * 30, 0, -44 - e * 24), forearm_l: qe(-30 - e * 14, 0, 0),
        thigh_l: qe(34 - e * 20, 0, -8), shin_l: qe(-54 + e * 26, 0, 0), foot_l: qe(14, 0, 0),
        thigh_r: qe(16 - e * 10, 0, 8), shin_r: qe(-32 + e * 16, 0, 0), foot_r: qe(10, 0, 0),
      },
    };
  },
};

const CLIPS = [
  { name: 'Idle', pose: 'idle', dur: 3.2, loop: true, rootMotion: true },
  { name: 'WalkForward', pose: 'walk', dur: 1.04, loop: true, rootMotion: true },
  { name: 'RunForward', pose: 'run', dur: 0.64, loop: true, rootMotion: true },
  { name: 'JumpFromRun', pose: 'jumpFromRun', dur: 0.5, loop: false },
  { name: 'JumpLoop', pose: 'jumpLoop', dur: 0.9, loop: true },
  { name: 'FallingLoop', pose: 'fall', dur: 1.1, loop: true },
  { name: 'SoftLanding', pose: 'softLanding', dur: 0.45, loop: false },
  { name: 'LandingRoll', pose: 'landRoll', dur: 1.15, loop: false },
  { name: 'SwingLoop', pose: 'swingLoop', dur: 1.25, loop: true },
  { name: 'SwingRelease', pose: 'swingRelease', dur: 0.5, loop: false },
];

const FPS = 20;
function buildClip(clip, boneNodeIndex, hipsRest) {
  const frames = Math.max(2, Math.round(clip.dur * FPS) + (clip.loop ? 1 : 1));
  const times = new Float32Array(frames);
  const rot = {}, hipsPos = [];
  for (let f = 0; f < frames; f++) {
    const t = clip.loop ? (f % (frames - 1)) / (frames - 1) : f / (frames - 1);
    times[f] = (f / (frames - 1)) * clip.dur;
    const { pose, hips } = POSES[clip.pose](t);
    for (const [bone, q] of Object.entries(pose)) {
      (rot[bone] = rot[bone] || []).push(q.x, q.y, q.z, q.w);
    }
    // glTF translation tracks are absolute local transforms, so the authored
    // bob is added to the bind-pose pelvis position.
    if (clip.rootMotion && hips) hipsPos.push(hipsRest[0] + hips[0], hipsRest[1] + hips[1], hipsRest[2] + hips[2]);
  }
  const channels = [];
  for (const [bone, vals] of Object.entries(rot)) {
    channels.push({ node: boneNodeIndex[bone], path: 'rotation', times, values: new Float32Array(vals) });
  }
  // pelvis translation only on the grounded clips; nothing else gets position
  // or scale tracks, so the physics solver always owns world placement.
  if (hipsPos.length) channels.push({ node: boneNodeIndex.hips, path: 'translation', times, values: new Float32Array(hipsPos) });
  return channels;
}

/* ================================================================ bodies */
function buildBody(kind) {
  const female = kind === 'girl';
  const scale = female ? 0.945 : 1.0;
  const hipW = female ? 0.095 : 0.105;
  const shoulderW = female ? 0.165 : 0.19;
  const { B, PARENT, names } = skeletonFor(scale, hipW, shoulderW);
  const segs = segments(B, PARENT);
  const parts = new Map();                       // material -> [geometry]
  const add = (mat, g) => { (parts.get(mat) || parts.set(mat, []).get(mat)).push(g); };

  const V = (n) => new THREE.Vector3(...B[n]);
  const S = (v) => v * scale;

  /* ---- skin: neck, forearms, hands, head */
  add('char_skin', tube(chain(['neck', 'head'], B, 2), [S(0.055), S(0.05), S(0.05)], 8));
  add('char_skin', sphereAt(S(0.108), [0, S(1.645), S(0.012)], 12, [0.92, 1.08, 1.0]));
  add('char_skin', boxAt(S(0.13), S(0.09), S(0.115), [0, S(1.585), S(0.055)]));     // jaw
  for (const s of ['l', 'r']) {
    const sgn = s === 'l' ? 1 : -1;
    add('char_skin', tube(chain([`forearm_${s}`, `hand_${s}`], B, 3), [S(0.045), S(0.04), S(0.036)], 7));
    add('char_skin', boxAt(S(0.055), S(0.105), S(0.085), [B[`hand_${s}`][0] + sgn * S(0.006), B[`hand_${s}`][1] - S(0.055), B[`hand_${s}`][2] + S(0.006)]));
  }
  /* ---- eyes with corneal transparency */
  for (const sgn of [1, -1]) {
    add('char_eye_white', sphereAt(S(0.019), [sgn * S(0.033), S(1.655), S(0.086)], 8));
    add('char_eye_iris', sphereAt(S(0.0095), [sgn * S(0.033), S(1.655), S(0.099)], 8));
    add('char_cornea', sphereAt(S(0.0215), [sgn * S(0.033), S(1.655), S(0.0885)], 8));
  }
  /* ---- hair */
  add(female ? 'char_hair_light' : 'char_hair', sphereAt(S(0.114), [0, S(1.662), S(0.004)], 12, [1.0, 0.86, 1.0]));
  if (female) {
    add('char_hair_light', tube([new THREE.Vector3(0, S(1.60), S(-0.09)), new THREE.Vector3(0, S(1.50), S(-0.13)), new THREE.Vector3(0, S(1.40), S(-0.12))], [S(0.055), S(0.05), S(0.03)], 8));
  }
  /* ---- torso: shirt base then jacket shell */
  add('char_shirt', tube(chain(['hips', 'spine', 'chest', 'neck'], B, 2), [S(0.135), S(0.14), S(0.152), S(0.148), S(0.125), S(0.09), S(0.07)].slice(0, 7), 10, 0.74));
  const jacketMat = female ? 'char_jacket_camo' : 'char_jacket_camo';
  add(jacketMat, tube(chain(['hips', 'spine', 'chest', 'neck'], B, 2), [S(0.152), S(0.158), S(0.168), S(0.164), S(0.14), S(0.10), S(0.075)].slice(0, 7), 12, 0.78));
  add('char_jacket_trim', tube(chain(['hips', 'spine'], B, 1), [S(0.156), S(0.16), S(0.158)], 12, 0.8));
  for (const s of ['l', 'r']) {
    add(jacketMat, tube(chain([`shoulder_${s}`, `upperarm_${s}`, `forearm_${s}`], B, 2), [S(0.072), S(0.07), S(0.066), S(0.06), S(0.054)], 8));
    add('char_gloves', boxAt(S(0.075), S(0.085), S(0.095), [B[`hand_${s}`][0], B[`hand_${s}`][1] - S(0.02), B[`hand_${s}`][2]]));
  }
  /* ---- tactical vest (male) / backpack + cap (female) */
  if (!female) {
    add('char_vest', boxAt(S(0.30), S(0.40), S(0.20), [0, S(1.18), 0]));
    add('char_vest', boxAt(S(0.26), S(0.10), S(0.235), [0, S(1.33), 0]));
    for (const sgn of [1, -1]) {
      add('char_vest_pouch', boxAt(S(0.085), S(0.10), S(0.07), [sgn * S(0.10), S(1.06), S(0.115)]));
      add('char_vest_pouch', boxAt(S(0.075), S(0.08), S(0.06), [sgn * S(0.13), S(1.20), S(0.10)]));
      add('char_vest_buckle', boxAt(S(0.045), S(0.035), S(0.03), [sgn * S(0.05), S(1.15), S(0.115)]));
    }
    add('char_vest_buckle', boxAt(S(0.05), S(0.04), S(0.03), [0, S(1.28), S(0.115)]));
  } else {
    add('char_cap', sphereAt(S(0.116), [0, S(1.676), S(0.004)], 10, [1.0, 0.62, 1.0]));
    add('char_cap_brim', boxAt(S(0.185), S(0.022), S(0.12), [0, S(1.652), S(0.115)], [-0.16, 0, 0]));
    add('char_backpack', boxAt(S(0.27), S(0.34), S(0.15), [0, S(1.2), S(-0.19)]));
    add('char_backpack', boxAt(S(0.2), S(0.12), S(0.1), [0, S(1.02), S(-0.2)]));
    for (const sgn of [1, -1]) {
      add('char_backpack_strap', boxAt(S(0.05), S(0.30), S(0.035), [sgn * S(0.095), S(1.24), S(0.115)], [0.12, 0, 0]));
    }
  }
  add('char_belt', tube(chain(['hips', 'spine'], B, 1), [S(0.148), S(0.152), S(0.15)].slice(0, 3), 12, 0.82));
  /* ---- legs */
  const pantsMat = female ? 'char_pants_dark' : 'char_pants_grey';
  for (const s of ['l', 'r']) {
    add(pantsMat, tube(chain([`thigh_${s}`, `shin_${s}`, `foot_${s}`], B, 3), [S(0.098), S(0.09), S(0.078), S(0.068), S(0.062), S(0.058), S(0.056)], 9));
    add('char_boots', tube(chain([`shin_${s}`, `foot_${s}`, `toe_${s}`], B, 2), [S(0.068), S(0.066), S(0.068), S(0.07), S(0.058)], 8));
    add('char_boots', boxAt(S(0.095), S(0.08), S(0.26), [B[`foot_${s}`][0], B[`foot_${s}`][1] - S(0.005), B[`foot_${s}`][2] + S(0.075)]));
    add('char_boot_sole', boxAt(S(0.10), S(0.03), S(0.27), [B[`foot_${s}`][0], B[`foot_${s}`][1] - S(0.05), B[`foot_${s}`][2] + S(0.075)]));
  }

  return { B, PARENT, names, segs, parts };
}

/* ================================================================== write */
const results = [];
for (const kind of ['man', 'girl']) {
  const { B, PARENT, names, segs, parts } = buildBody(kind);
  const glb = new GLB({ generator: `cyberpunk-megapolis/survival_${kind}` });

  // bone nodes, parented exactly as PARENT describes
  const boneNode = {}, boneIndexOf = {};
  names.forEach((n, i) => { boneIndexOf[n] = i; });
  // create in order so children exist before we set them
  const created = {};
  for (const n of names) {
    const parent = PARENT[n];
    const t = parent ? [B[n][0] - B[parent][0], B[n][1] - B[parent][1], B[n][2] - B[parent][2]] : B[n];
    created[n] = glb.node({ name: n, translation: t });
    boneNode[n] = created[n];
  }
  for (const n of names) {
    const kids = names.filter((k) => PARENT[k] === n).map((k) => created[k]);
    if (kids.length) glb.setNodeChildren(created[n], kids);
  }

  // inverse bind matrices = inverse of the bind-pose global transform
  const ibm = new Float32Array(names.length * 16);
  const m = new THREE.Matrix4();
  names.forEach((n, i) => {
    m.makeTranslation(B[n][0], B[n][1], B[n][2]).invert();
    ibm.set(m.elements, i * 16);
  });
  const skinIdx = glb.skin(names.map((n) => boneNode[n]), ibm, boneNode.hips);

  // primitives, one per character material
  const prims = [];
  let tris = 0;
  for (const [material, list] of parts) {
    let merged = list.length === 1 ? list[0] : (() => {
      const g = new THREE.BufferGeometry();
      const pos = [], nor = [], idx = [];
      let off = 0;
      for (const p of list) {
        const pp = p.attributes.position, nn = p.attributes.normal || (p.computeVertexNormals(), p.attributes.normal);
        for (let i = 0; i < pp.count; i++) { pos.push(pp.getX(i), pp.getY(i), pp.getZ(i)); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); }
        const ii = p.index ? p.index.array : null;
        if (ii) for (let i = 0; i < ii.length; i++) idx.push(ii[i] + off);
        else for (let i = 0; i < pp.count; i++) idx.push(i + off);
        off += pp.count;
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setIndex(idx);
      return g;
    })();
    if (!merged.attributes.normal) merged.computeVertexNormals();
    autoUV(merged, 1.6);
    merged = mergeVertices(merged, 1e-5);
    const position = new Float32Array(merged.attributes.position.array);
    const { joints, weights } = skinWeights(position, segs, boneIndexOf);
    prims.push({
      material, position,
      normal: new Float32Array(merged.attributes.normal.array),
      uv: new Float32Array(merged.attributes.uv.array),
      index: new Uint32Array(merged.index.array),
      joints, weights,
    });
    tris += merged.index.count / 3;
  }
  const meshIdx = glb.mesh(`survival_${kind}`, prims, { draco: true });
  const meshNode = glb.node({ name: `survival_${kind}_mesh`, mesh: meshIdx, skin: skinIdx });
  glb.sceneNodes([boneNode.hips, meshNode]);

  for (const clip of CLIPS) glb.animation(clip.name, buildClip(clip, boneNode, B.hips));

  const buf = glb.toBuffer();
  fs.writeFileSync(path.join(OUT, `survival_${kind}.glb`), buf);
  results.push({ kind, bytes: buf.length, tris, materials: prims.length, bones: names.length, clips: CLIPS.length });
  console.log(`  survival_${kind}.glb  ${(buf.length / 1024).toFixed(0)} KB  ${tris} tris  ${prims.length} materials  ${names.length} bones  ${CLIPS.length} clips`);
}

fs.writeFileSync(path.join(ROOT, 'data', 'characters.json'), JSON.stringify({
  note: 'Both characters share one 22-bone skeleton and the same clip names, so the animation state machine is character-agnostic.',
  clips: CLIPS.map((c) => ({ name: c.name, dur: c.dur, loop: c.loop, rootMotion: !!c.rootMotion })),
  characters: [
    { id: 'man', file: 'chars/survival_man.glb', code: 'RUNNER 01', name: 'SURVIVAL MAN', tags: 'camouflage jacket · tactical vest', height: 1.78 },
    { id: 'girl', file: 'chars/survival_girl.glb', code: 'RUNNER 02', name: 'SURVIVAL GIRL', tags: 'baseball cap · backpack', height: 1.68 },
  ],
  built: results,
}, null, 1));
console.log('characters written');
