/**
 * Player physics: a fixed state machine (ground | air | swing | wallrun | zip)
 * integrated with semi-implicit Euler and a dt clamped to 50 ms. Nothing here
 * adds a constant to the position per frame -- every state writes velocity and
 * the integrator moves the body, so speed stays continuous across transitions.
 *
 * AABBs are broad phase only. Wall pushback, web anchors and zip targets are all
 * confirmed against real triangles before they affect the player.
 */
import * as THREE from 'three';
import { F_DECAL, F_SAFETY, F_AWNING, F_ANCHOR } from './cityBoxes.js';

export const TUNING = {
  walkSpeed: 8.5,
  sprintSpeed: 14,
  jumpSpeed: 13,
  jumpSprintBonus: 1.5,
  gravityAir: 30,
  gravitySwing: 26,
  gravityDive: 38,
  airAccel: 14,
  airMaxSpeed: 17,
  maxSpeed: 68,
  groundDamp: 12,
  coyote: 0.12,

  radius: 0.42,
  height: 1.7,
  stepHeight: 0.5,

  webSearchRadius: 110,
  webMinAbove: 7,
  webMinDist: 6,
  webHoldDelay: 0.18,
  webCandidates: 10,
  ropeFactor: 0.96,
  ropeMin: 3.5,
  ropeCorrectionRate: 28,
  pumpForce: 16,
  steerForce: 9,
  reelSpeed: 12,
  releaseUpMul: 1.22,
  releaseUpCap: 34,
  releaseHorizMul: 1.045,

  zipRange: 115,
  zipAlign: 0.80,
  zipSpeed: 40,
  zipMaxTime: 1.6,
  zipArrive: 3,
  zipExitUp: 5.5,

  wallEnterSpeed: 3.5,
  wallMinVY: -14,
  wallMaxTime: 1.15,
  wallGravity: 9,
  wallPush: 11,
  wallJumpUp: 11.5,
  wallJumpFwd: 4,

  reentryHeight: 430,
  softLandImpact: 5,
  rollImpact: 15,
  safeInterval: 0.5,
  voidY: -80,
  voidFastY: -32,
};

const UP = new THREE.Vector3(0, 1, 0);
const FOOT_PROBES = [[0, 0], [0, 0.72], [0, -0.72], [0.72, 0], [-0.72, 0]];

export class Player {
  constructor(boxes, events = {}) {
    this.boxes = boxes;
    this.ev = events;
    this.pos = new THREE.Vector3(0, 6, 40);
    this.vel = new THREE.Vector3();
    this.state = 'air';
    this.facing = 0;                 // yaw the body is turned to
    this.grounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.airTime = 0;
    this.coyote = 0;
    this.dive = false;
    this.sprinting = false;

    this.anchor = new THREE.Vector3();
    this.hasAnchor = false;
    this.rope = 0;
    this.webHand = 'r';
    this.swingTime = 0;

    this.wallNormal = new THREE.Vector3();
    this.wallTime = 0;

    this.zipTarget = new THREE.Vector3();
    this.zipTime = 0;

    this.landTimer = 0;
    this.landKind = null;
    this.lastImpact = 0;

    this.safePoints = [];
    this._safeClock = 0;
    this.recovering = false;
    this.recoverTimer = 0;
    this._recoverTarget = null;

    this._sweepPhase = 0;
    this._sweepAcc = 0;
    this._cands = [];
    this._overlap = [];
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this.debug = { anchorsTried: 0, anchorRejected: 0, sweepHits: 0, zipRejected: 0,
      wallTries: 0, wallRejectNy: 0, wallRejectVy: 0, wallRejectNoInput: 0, wallRejectDot: 0 };
  }

  /* ------------------------------------------------------------- lifecycle */
  spawn(pos, vel = new THREE.Vector3(), state = 'air') {
    this.pos.copy(pos);
    this.vel.copy(vel);
    this.state = state;
    this.grounded = state === 'ground';
    this.hasAnchor = false;
    this.dive = false;
    this.airTime = 0;
    this.landTimer = 0;
    this.landKind = null;
    this.wallTime = 0;
    this.zipTime = 0;
  }

  highAltitudeReentry(aimYaw = 0) {
    const from = this.safePoints.length ? this.nearestSafe() : new THREE.Vector3(0, 0, 40);
    const p = new THREE.Vector3(from.x, TUNING.reentryHeight, from.z + 60);
    const v = new THREE.Vector3(Math.sin(aimYaw) * -6, -10, Math.cos(aimYaw) * -6);
    this.spawn(p, v, 'air');
    this.facing = aimYaw;
    this.ev.onReentry?.();
  }

  nearestSafe() {
    let best = null, bd = Infinity;
    for (const s of this.safePoints) {
      const d = s.distanceToSquared(this.pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best || new THREE.Vector3(0, 3.2, 40);
  }

  /* ============================================================== update */
  update(dtRaw, input, cam) {
    const dt = Math.min(dtRaw, 0.05);
    if (dt <= 0) return;

    // camera basis on the horizontal plane
    this._fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).normalize();
    this._right.set(this._fwd.z, 0, -this._fwd.x);

    if (this.landTimer > 0) this.landTimer = Math.max(0, this.landTimer - dt);

    switch (this.state) {
      case 'ground': this._ground(dt, input); break;
      case 'air': this._air(dt, input, cam); break;
      case 'swing': this._swing(dt, input, cam); break;
      case 'wallrun': this._wallrun(dt, input); break;
      case 'zip': this._zip(dt, input); break;
    }

    // global speed clamp -- no state may manufacture unbounded speed
    const sp = this.vel.length();
    if (sp > TUNING.maxSpeed) this.vel.multiplyScalar(TUNING.maxSpeed / sp);

    this._faceVelocity(dt);
    this._trackSafe(dt);
    this._checkVoid(dt);
  }

  /* --------------------------------------------------------------- ground */
  _ground(dt, input) {
    const axis = input.moveAxis();
    this.sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
    const target = this._tmp.set(0, 0, 0)
      .addScaledVector(this._fwd, -axis.z)
      .addScaledVector(this._right, axis.x);
    const wanted = (this.sprinting ? TUNING.sprintSpeed : TUNING.walkSpeed) * (target.lengthSq() > 0 ? 1 : 0);
    if (target.lengthSq() > 0) target.normalize().multiplyScalar(wanted);

    // exponential damping toward the target horizontal velocity
    const k = 1 - Math.exp(-TUNING.groundDamp * dt);
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.z += (target.z - this.vel.z) * k;
    this.vel.y = Math.min(this.vel.y, 0);

    if (input.pressed('Space')) {
      this.vel.y = TUNING.jumpSpeed + (this.sprinting ? TUNING.jumpSprintBonus : 0);
      this.grounded = false;
      this.coyote = 0;
      this.state = 'air';
      this.airTime = 0;
      this.ev.onJump?.(this.sprinting);
      this._integrate(dt);
      return;
    }

    const prevY = this.pos.y;
    this._integrate(dt);
    this._collideHorizontal(dt, input);

    const g = this._probeGround(prevY, dt);
    if (g) {
      this.pos.y = g.y;
      this.vel.y = 0;
      this.groundNormal.set(g.nx, g.ny, g.nz);
      this.coyote = TUNING.coyote;
      this.grounded = true;
    } else {
      // only leave the ground once the supporting surface is actually gone;
      // the coyote window keeps rooftop edges from stuttering
      this.coyote -= dt;
      if (this.coyote <= 0) {
        this.grounded = false;
        this.state = 'air';
        this.airTime = 0;
      }
    }
  }

  /* ------------------------------------------------------------------ air */
  _air(dt, input, cam) {
    this.airTime += dt;
    const axis = input.moveAxis();
    const accel = this._tmp.set(0, 0, 0)
      .addScaledVector(this._fwd, -axis.z)
      .addScaledVector(this._right, axis.x);
    if (accel.lengthSq() > 0) {
      accel.normalize().multiplyScalar(TUNING.airAccel);
      const horiz = this._tmp2.set(this.vel.x, 0, this.vel.z);
      const cap = Math.max(TUNING.airMaxSpeed, horiz.length());
      this.vel.x += accel.x * dt;
      this.vel.z += accel.z * dt;
      const h2 = Math.hypot(this.vel.x, this.vel.z);
      if (h2 > cap) { this.vel.x *= cap / h2; this.vel.z *= cap / h2; }
    }

    // dive
    if (input.pressed('KeyS') && this.vel.y < 0.5) { this.dive = true; this.ev.onDive?.(); }
    if (this.vel.y > 1) this.dive = false;
    const g = this.dive ? TUNING.gravityDive : TUNING.gravityAir;
    this.vel.y -= g * dt;
    const drag = this.dive ? 0.0006 : 0.0016;
    const sp = this.vel.length();
    this.vel.multiplyScalar(Math.max(0, 1 - drag * sp * dt));

    // web attach: hold Space once genuinely airborne
    if (input.down('Space') && this.airTime > TUNING.webHoldDelay && !this.hasAnchor) {
      if (this._tryAttach(cam)) return;
    }
    if (this._tryZip(input, cam)) return;

    const prevY = this.pos.y;
    this._integrate(dt);
    const wall = this._collideHorizontal(dt, input);
    if (wall && this._wantWallrun(wall, input)) {
      this.state = 'wallrun';
      this.wallNormal.set(wall.nx, wall.ny, wall.nz);
      this.wallTime = 0;
      this.dive = false;
      this.ev.onWallrun?.();
      return;
    }

    const gp = this._probeGround(prevY, dt);
    if (gp && this.vel.y <= 0) this._land(gp);
  }

  _land(g) {
    const impact = -this.vel.y;
    this.pos.y = g.y;
    this.groundNormal.set(g.nx, g.ny, g.nz);
    this.lastImpact = impact;
    // keep part of the horizontal momentum so a fast landing still flows
    const keep = impact > TUNING.rollImpact ? 0.72 : impact > TUNING.softLandImpact ? 0.86 : 0.95;
    this.vel.x *= keep; this.vel.z *= keep;
    this.vel.y = 0;
    this.grounded = true;
    this.state = 'ground';
    this.coyote = TUNING.coyote;
    this.dive = false;
    this.hasAnchor = false;
    if (impact > TUNING.rollImpact) { this.landKind = 'roll'; this.landTimer = 1.15; }
    else if (impact > TUNING.softLandImpact) { this.landKind = 'soft'; this.landTimer = 0.45; }
    else { this.landKind = null; this.landTimer = 0; }
    this.ev.onLand?.(impact, this.landKind);
  }

  /* ---------------------------------------------------------------- swing */
  _tryAttach(cam) {
    // blend where the camera looks with where we are actually going, so a fast
    // swing chains forward instead of snapping to whatever is behind us
    const speed = this.vel.length();
    const look = this._tmp.set(
      -Math.sin(cam.yaw) * Math.cos(cam.pitch),
      Math.sin(cam.pitch),
      -Math.cos(cam.yaw) * Math.cos(cam.pitch),
    ).normalize();
    if (speed > 18) {
      const w = Math.min(0.45, (speed - 18) / 60);
      look.lerp(this._tmp2.copy(this.vel).normalize(), w).normalize();
    }
    // looking up lifts the reachable band a long way
    const pitchBoost = 1 + Math.max(0, cam.pitch) * 1.9;
    const radius = TUNING.webSearchRadius;
    const list = this.boxes.anchorCandidates(
      this.pos.x, this.pos.y + 1.3, this.pos.z,
      look.x, look.y, look.z,
      radius, TUNING.webMinAbove, this._cands,
    );
    this.debug.anchorsTried = list.length;
    const limit = Math.min(TUNING.webCandidates, list.length);
    for (let i = 0; i < limit; i++) {
      const c = list[i];
      if (c.ay < this.pos.y + TUNING.webMinAbove) continue;
      if (c.d < TUNING.webMinDist || c.d > radius * pitchBoost) continue;
      const ox = this.pos.x, oy = this.pos.y + 1.3, oz = this.pos.z;
      const dx = c.ax - ox, dy = c.ay - oy, dz = c.az - oz;
      const len = Math.hypot(dx, dy, dz);
      // The first real-geometry hit along the ray decides. That hit is the
      // anchor: aiming at a point inside the block and demanding the ray reach
      // it would reject every facade, because the wall is what a web grabs.
      const hit = this.boxes.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len + 4, { reject: F_DECAL | F_SAFETY });
      if (!hit) { this.debug.anchorRejected++; continue; }
      if (!(hit.flags & F_ANCHOR)) { this.debug.anchorRejected++; continue; }        // a car or a lamp got in the way
      if (hit.py < this.pos.y + TUNING.webMinAbove) { this.debug.anchorRejected++; continue; }
      if (hit.dist < TUNING.webMinDist || hit.dist > TUNING.webSearchRadius * pitchBoost) { this.debug.anchorRejected++; continue; }
      if (this._attach(hit.px, hit.py, hit.pz)) return true;
      this.debug.anchorRejected++;
    }
    return false;
  }

  _attach(x, y, z) {
    const d = Math.hypot(x - this.pos.x, y - this.pos.y, z - this.pos.z);
    // Keep the bottom of the arc above the street we are actually swinging
    // over. If the anchor sits so low that the rope would have to be cut to a
    // stub, it is not worth swinging from -- reject it and try the next
    // candidate rather than yanking the player up to the anchor.
    const street = this._streetLevel(this.pos.x, this.pos.z);
    const maxRope = y - (street + 3.0);
    if (maxRope < Math.max(TUNING.ropeMin, d * 0.5)) return false;
    this.anchor.set(x, y, z);
    this.hasAnchor = true;
    this.rope = Math.min(Math.max(TUNING.ropeMin, d * TUNING.ropeFactor), maxRope);
    this.state = 'swing';
    this.swingTime = 0;
    this.dive = false;
    // pick the hand from the cross product of anchor direction and travel
    const a = this._tmp.subVectors(this.anchor, this.pos).setY(0);
    const v = this._tmp2.set(this.vel.x, 0, this.vel.z);
    if (v.lengthSq() < 0.5) v.copy(this._fwd);
    this.webHand = (a.x * v.z - a.z * v.x) > 0 ? 'l' : 'r';
    this.ev.onWeb?.(this.anchor, this.webHand, this.rope);
    return true;
  }

  _streetLevel(x, z) {
    const h = this.boxes.raycast(x, 1.5, z, 0, -1, 0, 60, { reject: F_DECAL });
    return h ? h.py : 0;
  }

  _swing(dt, input, cam) {
    this.swingTime += dt;
    if (!input.down('Space')) { this._release(); return; }

    const d = this._tmp.subVectors(this.pos, this.anchor);
    const len = d.length() || 1e-4;
    const rHat = this._tmp2.copy(d).multiplyScalar(1 / len);      // anchor -> player

    // gravity
    this.vel.y -= TUNING.gravitySwing * dt;

    // W pumps along the tangent, strongest at the bottom of the arc
    const bottom = Math.max(0, rHat.y * -1);                       // 1 at the lowest point
    if (input.down('KeyW')) {
      const tang = this._tangent(rHat);
      this.vel.addScaledVector(tang, TUNING.pumpForce * (0.35 + bottom * 0.65) * dt);
    }
    // A / D steer sideways
    const axis = input.moveAxis();
    if (axis.x !== 0) {
      const lateral = new THREE.Vector3().crossVectors(rHat, UP).normalize();
      if (lateral.lengthSq() > 0.01) this.vel.addScaledVector(lateral, TUNING.steerForce * axis.x * dt);
    }
    // Shift reels the rope in
    if (input.down('ShiftLeft') || input.down('ShiftRight')) {
      this.rope = Math.max(TUNING.ropeMin, this.rope - TUNING.reelSpeed * dt);
    }
    // drag grows with speed so the arcs settle instead of spiralling up
    const sp = this.vel.length();
    this.vel.multiplyScalar(Math.max(0, 1 - (0.0004 + sp * 0.00006) * sp * dt));

    const prevY = this.pos.y;
    this._integrate(dt);

    // hard spherical constraint, but never teleport: cap the correction
    const d2 = this._tmp.subVectors(this.pos, this.anchor);
    const l2 = d2.length() || 1e-4;
    if (l2 > this.rope) {
      const over = l2 - this.rope;
      const corr = Math.min(over, TUNING.ropeCorrectionRate * dt);
      this.pos.addScaledVector(d2, -corr / l2);
      // remove the outward radial component; this removes energy, never adds it
      const rh = this._tmp2.copy(d2).multiplyScalar(1 / l2);
      const radial = this.vel.dot(rh);
      if (radial > 0) this.vel.addScaledVector(rh, -radial);
    }

    this._collideHorizontal(dt, input);
    const g = this._probeGround(prevY, dt);
    if (g && this.vel.y <= 0) { this.hasAnchor = false; this._land(g); }
  }

  _tangent(rHat) {
    // tangent in the plane of the rope and the velocity, pointing with travel
    const t = new THREE.Vector3().copy(this.vel);
    t.addScaledVector(rHat, -t.dot(rHat));
    if (t.lengthSq() < 0.05) {
      t.copy(this._fwd);
      t.addScaledVector(rHat, -t.dot(rHat));
    }
    return t.normalize();
  }

  _release() {
    this.hasAnchor = false;
    if (this.vel.y > 0) this.vel.y = Math.min(this.vel.y * TUNING.releaseUpMul, TUNING.releaseUpCap);
    this.vel.x *= TUNING.releaseHorizMul;
    this.vel.z *= TUNING.releaseHorizMul;
    this.state = 'air';
    this.airTime = 0;
    this.releaseTimer = 0.5;
    this.ev.onRelease?.();
  }

  /* -------------------------------------------------------------- wallrun */
  _wantWallrun(wall, input) {
    const D = this.debug;
    D.wallTries++;
    if (Math.abs(wall.ny) > 0.42) { D.wallRejectNy++; return false; }   // must be a real side wall
    const into = wall.into != null ? wall.into : -(this.vel.x * wall.nx + this.vel.z * wall.nz);
    if (into < TUNING.wallEnterSpeed) { D.wallRejectInto = (D.wallRejectInto || 0) + 1; D.lastInto = +into.toFixed(2); return false; }
    if (this.vel.y < TUNING.wallMinVY) { D.wallRejectVy++; return false; }
    const axis = input.moveAxis();
    const want = this._tmp.set(0, 0, 0).addScaledVector(this._fwd, -axis.z).addScaledVector(this._right, axis.x);
    if (want.lengthSq() < 0.05) { D.wallRejectNoInput++; return false; }
    const dot = want.normalize().dot(this._tmp2.set(-wall.nx, 0, -wall.nz).normalize());
    if (dot <= 0.25) { D.wallRejectDot++; D.lastDot = +dot.toFixed(2); return false; }
    return true;
  }

  _wallrun(dt, input) {
    this.wallTime += dt;
    const axis = input.moveAxis();
    const want = this._tmp.set(0, 0, 0).addScaledVector(this._fwd, -axis.z).addScaledVector(this._right, axis.x);
    const holding = want.lengthSq() > 0.05
      && want.clone().normalize().dot(this._tmp2.set(-this.wallNormal.x, 0, -this.wallNormal.z).normalize()) > 0.1;

    if (input.pressed('Space')) {
      this.vel.x = this.wallNormal.x * TUNING.wallPush + this._fwd.x * TUNING.wallJumpFwd;
      this.vel.z = this.wallNormal.z * TUNING.wallPush + this._fwd.z * TUNING.wallJumpFwd;
      this.vel.y = TUNING.wallJumpUp;
      this.state = 'air';
      this.airTime = 0;
      this.ev.onWallJump?.();
      this._integrate(dt);
      return;
    }

    // run along the wall: keep the along-wall component, add a little lift
    const along = new THREE.Vector3(-this.wallNormal.z, 0, this.wallNormal.x);
    if (along.dot(this._tmp.set(this.vel.x, 0, this.vel.z)) < 0) along.multiplyScalar(-1);
    const speed = Math.max(9, Math.hypot(this.vel.x, this.vel.z));
    this.vel.x = along.x * speed;
    this.vel.z = along.z * speed;
    this.vel.y -= TUNING.wallGravity * dt;
    if (this.vel.y < 1.2) this.vel.y += 15 * dt;               // the boost that makes it read as a run
    // stay glued to the wall
    this.vel.addScaledVector(this.wallNormal, -3 * dt);

    const prevYW = this.pos.y;
    this._integrate(dt);
    const wall = this._collideHorizontal(dt, input);

    const lost = !wall || !holding || this.vel.y < TUNING.wallMinVY || this.wallTime > TUNING.wallMaxTime;
    if (lost) {
      this.state = 'air';
      this.airTime = 0;
      this.ev.onWallEnd?.();
      return;
    }
    this.wallNormal.set(wall.nx, wall.ny, wall.nz);
    const g = this._probeGround(prevYW, dt);
    if (g && this.vel.y <= 0) this._land(g);
  }

  /* ------------------------------------------------------------------ zip */
  _tryZip(input, cam) {
    if (!(input.pressed('KeyE') || input.mouseJust.right)) return false;
    const look = this._tmp.set(
      -Math.sin(cam.yaw) * Math.cos(cam.pitch),
      Math.sin(cam.pitch),
      -Math.cos(cam.yaw) * Math.cos(cam.pitch),
    ).normalize();
    const list = this.boxes.anchorCandidates(
      this.pos.x, this.pos.y + 1.3, this.pos.z,
      look.x, look.y, look.z, TUNING.zipRange, 1.5, this._cands,
    );
    for (let i = 0; i < Math.min(14, list.length); i++) {
      const c = list[i];
      if ((c.alignEdge != null ? c.alignEdge : c.align) < TUNING.zipAlign) continue;
      // probe down onto the rooftop edge nearest the player, so the flight path
      // clears the facade instead of aiming at a point inside the block
      const roof = this.boxes.raycast(c.ex, c.topY + 4, c.ez, 0, -1, 0, 10, { reject: F_DECAL | F_SAFETY });
      if (!roof || roof.ny < 0.55) continue;
      // the path has to be clear
      const ox = this.pos.x, oy = this.pos.y + 1.3, oz = this.pos.z;
      const dx = roof.px - ox, dy = roof.py + 1.2 - oy, dz = roof.pz - oz;
      const len = Math.hypot(dx, dy, dz);
      if (len < 8) continue;
      const blocked = this.boxes.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len - 2.5, { reject: F_DECAL | F_SAFETY });
      if (blocked) { this.debug.zipRejected++; continue; }
      this.zipTarget.set(roof.px, roof.py + 1.1, roof.pz);
      this.state = 'zip';
      this.zipTime = 0;
      this.hasAnchor = false;
      this.dive = false;
      this.ev.onZip?.(this.zipTarget);
      return true;
    }
    this.debug.zipRejected++;
    this.ev.onZipFail?.();
    return false;
  }

  _zip(dt, input) {
    this.zipTime += dt;
    const d = this._tmp.subVectors(this.zipTarget, this.pos);
    const dist = d.length();
    if (dist < TUNING.zipArrive || this.zipTime > TUNING.zipMaxTime) {
      this.state = 'air';
      this.airTime = 0;
      this.vel.y = Math.max(this.vel.y, TUNING.zipExitUp);
      this.ev.onZipEnd?.();
      this._integrate(dt);
      return;
    }
    const speed = Math.max(TUNING.zipSpeed, this.vel.length() * 0.9);
    this.vel.copy(d).multiplyScalar(speed / dist);
    const prevYZ = this.pos.y;
    this._integrate(dt);
    const gz = this._probeGround(prevYZ, dt);
    if (gz && this.vel.y <= 0 && dist < 14) { this._land(gz); return; }
    // a zip should stop on contact rather than bore through a parapet
    const wall = this._collideHorizontal(dt, input);
    if (wall && Math.abs(wall.ny) < 0.5 && dist > 6) {
      this.state = 'air';
      this.airTime = 0;
      this.vel.y = Math.max(this.vel.y, TUNING.zipExitUp);
      this.ev.onZipEnd?.();
    }
  }

  /* ========================================================= integration */
  _integrate(dt) {
    // remember where the step started: the horizontal sweep has to be cast
    // from there, not from the position we just moved to
    this._preX = this.pos.x; this._preY = this.pos.y; this._preZ = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
  }

  /* --------------------------------------------------- ground probing */
  /**
   * Five foot probes (centre, front, back, left, right) cast down from the
   * previous frame's height so a floor crossed inside one frame is still
   * caught. Only surfaces the body actually passed through from above, or a
   * ledge within stepHeight, count as ground -- which is what stops the player
   * being snapped onto the roof of an awning they are standing under.
   */
  _probeGround(prevY, dt) {
    const r = TUNING.radius;
    const top = Math.max(prevY, this.pos.y) + TUNING.stepHeight + 0.05;
    const depth = (top - this.pos.y) + Math.max(0.35, -this.vel.y * dt + 0.25);
    let best = null;
    for (let i = 0; i < FOOT_PROBES.length; i++) {
      const ox = this.pos.x + FOOT_PROBES[i][0] * r;
      const oz = this.pos.z + FOOT_PROBES[i][1] * r;
      const hit = this.boxes.raycast(ox, top, oz, 0, -1, 0, depth, { reject: F_DECAL });
      if (!hit) continue;
      if (hit.ny < 0.55) continue;                       // too steep to stand on
      const surfaceY = hit.py;
      // must be reachable: either we crossed it this frame, or it is a small step
      const crossed = prevY + 1e-3 >= surfaceY - 0.02 && this.pos.y <= surfaceY + 0.06;
      const stepUp = this.grounded && surfaceY <= prevY + TUNING.stepHeight && surfaceY >= prevY - TUNING.stepHeight - 0.4;
      if (!crossed && !stepUp) continue;
      if ((hit.flags & F_AWNING) && surfaceY > prevY + TUNING.stepHeight) continue;
      if (!best || surfaceY > best.y) best = { y: surfaceY, nx: hit.nx, ny: hit.ny, nz: hit.nz, flags: hit.flags };
    }
    return best;
  }

  /* ---------------------------------------------------- horizontal sweep */
  /**
   * True swept test: the ray is cast from where the step *started*, along the
   * displacement, for the distance actually travelled plus the body radius.
   * Casting from the post-integration position instead would start the ray
   * inside the wall at speed and find nothing, which is how a body tunnels.
   *
   * Chest height every frame, alternating knee and head at 30 Hz so surface
   * seams and low obstacles are covered without three rays per frame.
   */
  _collideHorizontal(dt, input) {
    const r = TUNING.radius;
    const fromX = this._preX !== undefined ? this._preX : this.pos.x;
    const fromY = this._preY !== undefined ? this._preY : this.pos.y;
    const fromZ = this._preZ !== undefined ? this._preZ : this.pos.z;
    const mx = this.pos.x - fromX, mz = this.pos.z - fromZ;
    const travel = Math.hypot(mx, mz);
    if (travel < 1e-5) return this._depenetrate();
    const dx = mx / travel, dz = mz / travel;

    this._sweepAcc += dt;
    let alt = null;
    if (this._sweepAcc >= 1 / 30) {
      this._sweepAcc = 0;
      this._sweepPhase ^= 1;
      alt = this._sweepPhase ? 0.35 : 1.62;
    }
    const heights = alt === null ? [1.0] : [1.0, alt];

    let contact = null;
    for (const h of heights) {
      const hit = this.boxes.raycast(fromX, fromY + h, fromZ, dx, 0, dz, travel + r + 0.05, { reject: F_DECAL | F_SAFETY });
      if (!hit) continue;
      if (hit.dist > travel + r) continue;
      if (hit.ny > 0.7) continue;                     // a floor, not a wall
      if (!contact || hit.dist < contact.dist) contact = hit;
    }
    if (!contact) return this._depenetrate();

    this.debug.sweepHits++;
    // stop at the contact point, then strip the into-wall velocity. The
    // approach speed is recorded first: wall-run entry is judged on how hard we
    // hit the wall, and by this point that velocity is already gone.
    const stop = Math.max(0, contact.dist - r);
    this.pos.x = fromX + dx * stop;
    this.pos.z = fromZ + dz * stop;
    const into = this.vel.x * contact.nx + this.vel.z * contact.nz;
    contact.into = -into;
    contact.approach = travel / Math.max(dt, 1e-5);
    if (into < 0) { this.vel.x -= contact.nx * into; this.vel.z -= contact.nz * into; }
    return contact;
  }

  /**
   * Resting / grazing contact resolution.
   *
   * The AABB only nominates a suspect; the push itself is measured against real
   * triangles. Two inward probes at knee and chest height decide everything: if
   * neither hits, the structure is hollow (an L-shaped block, a walkway
   * spanning open air) and the player passes straight through instead of
   * meeting an invisible wall. If one does hit, the body is placed a radius
   * back from the real surface -- not from the bounding box, which can sit the
   * better part of a metre proud of the wall it encloses.
   */
  _depenetrate() {
    const r = TUNING.radius;
    const list = this.boxes.queryBox(
      this.pos.x - r, this.pos.y + 0.2, this.pos.z - r,
      this.pos.x + r, this.pos.y + TUNING.height, this.pos.z + r,
      this._overlap,
    );
    let best = null;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const f = this.boxes.flags[i];
      if (f & (F_DECAL | F_SAFETY)) continue;
      const o = i * 3;
      const minY = this.boxes.min[o + 1], maxY = this.boxes.max[o + 1];
      if (this.pos.y + TUNING.height < minY || this.pos.y + 0.2 > maxY) continue;
      const cx = (this.boxes.min[o] + this.boxes.max[o]) * 0.5;
      const cz = (this.boxes.min[o + 2] + this.boxes.max[o + 2]) * 0.5;
      let ix = cx - this.pos.x, iz = cz - this.pos.z;
      const il = Math.hypot(ix, iz);
      if (il < 1e-4) continue;
      ix /= il; iz /= il;
      // real-geometry probes at two heights
      const a = this.boxes.raycast(this.pos.x, this.pos.y + 0.35, this.pos.z, ix, 0, iz, r + 0.06, { reject: F_DECAL | F_SAFETY });
      const b = this.boxes.raycast(this.pos.x, this.pos.y + 1.2, this.pos.z, ix, 0, iz, r + 0.06, { reject: F_DECAL | F_SAFETY });
      const hit = (a && b) ? (a.dist < b.dist ? a : b) : (a || b);
      if (!hit) continue;                              // hollow: let the player pass
      if (hit.ny > 0.7) continue;                      // a floor, not a wall
      if (!best || hit.dist < best.dist) best = hit;
    }
    if (!best) return null;

    // place the body a radius back along the surface normal
    const push = r - best.dist;
    if (push > 0) {
      this.pos.x += best.nx * push;
      this.pos.z += best.nz * push;
    }
    const into = this.vel.x * best.nx + this.vel.z * best.nz;
    best.into = -into;
    best.approach = Math.hypot(this.vel.x, this.vel.z);
    if (into < 0) { this.vel.x -= best.nx * into; this.vel.z -= best.nz * into; }
    return best;
  }

  /* ------------------------------------------------------------- facing */
  _faceVelocity(dt) {
    const h = Math.hypot(this.vel.x, this.vel.z);
    if (h < 0.35) return;
    const want = Math.atan2(this.vel.x, this.vel.z);
    let diff = want - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const rate = this.state === 'ground' ? 11 : 6.5;
    this.facing += diff * Math.min(1, rate * dt);
  }

  /* -------------------------------------------- safe points + void guard */
  _trackSafe(dt) {
    if (this.state === 'ground' && this.grounded && Math.abs(this.vel.y) < 0.6) {
      this._safeClock += dt;
      if (this._safeClock >= TUNING.safeInterval) {
        this._safeClock = 0;
        const p = this.pos.clone();
        const last = this.safePoints[this.safePoints.length - 1];
        if (!last || last.distanceToSquared(p) > 400) {
          this.safePoints.push(p);
          if (this.safePoints.length > 24) this.safePoints.shift();
        }
      }
    } else {
      this._safeClock = 0;
    }
  }

  /**
   * Falling out of the world is recovered on a short, self-contained timer:
   * the body is frozen, the UI fades, and the reposition happens without
   * waiting on any promise -- so a slow frame or a paused tab can never leave
   * the player stuck in the void.
   *
   * The metro runs down to about y = -26 and unfinished blocks have a safety
   * floor, so neither of them trips this.
   */
  _checkVoid(dt) {
    if (this.recovering) {
      this.recoverTimer -= dt;
      this.vel.set(0, 0, 0);
      if (this.recoverTimer <= 0) {
        const t = this._recoverTarget;
        if (t) this.spawn(new THREE.Vector3(t.x, t.y + 1.2, t.z), new THREE.Vector3(), 'air');
        else this.highAltitudeReentry(this.facing);
        this.recovering = false;
        this._recoverTarget = null;
        this.ev.onRecovered?.();
      }
      return;
    }
    const fellOut = this.pos.y < TUNING.voidY || (this.pos.y < TUNING.voidFastY && this.vel.y < -25);
    if (!fellOut) return;
    this.recovering = true;
    this.recoverTimer = 0.34;
    this.hasAnchor = false;
    if (this.safePoints.length) {
      this._recoverTarget = this.nearestSafe();
      this.ev.onRecover?.(this._recoverTarget);
    } else {
      // never recorded a safe spot yet -- the only case that re-enters from
      // altitude, so the player is never randomly thrown into the sky
      this._recoverTarget = null;
      this.ev.onRecoverReentry?.();
    }
  }

  /* ---------------------------------------------------------------- info */
  get speedKmh() { return Math.round(this.vel.length() * 3.6); }
  get heightM() { return Math.max(0, Math.round(this.pos.y)); }
}
