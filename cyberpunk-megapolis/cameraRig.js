/**
 * Cinematic third-person camera.
 *
 * The rig orbits an observation point above the character's head, leads the
 * motion by velocity * 0.16, pulls in the moment an AABB segment test says a
 * wall is in the way and eases back out afterwards, rolls with lateral velocity
 * and widens its FOV with speed. Every value is damped -- nothing snaps.
 */
import * as THREE from 'three';

export const CAM = {
  eyeAboveHead: 1.35,
  lookAhead: 0.16,
  lookAheadMax: 4.5,
  lookAheadDamp: 6.0,
  distBase: 4.2,
  distMax: 7.8,
  distSwingBonus: 1.1,
  distMin: 1.7,
  pullInRate: 34,          // immediate when a wall appears
  pushOutRate: 3.2,        // slow once it clears
  fovBase: 62,
  fovMax: 79,
  fovDive: 6,
  fovDamp: 3.4,
  rollMax: 0.10,
  rollDamp: 3.0,
  alignRate: 0.85,         // rad/s of gentle yaw auto-align during swing / zip
  menuRadius: 190,
  menuHeight: 398,
  menuSpeed: 0.035,
  transition: 1.5,
};

const smoothstep = (t) => t * t * (3 - 2 * t);

export class CameraRig {
  constructor(camera, boxes) {
    this.camera = camera;
    this.boxes = boxes;
    this.mode = 'menu';
    this.look = new THREE.Vector3();
    this.lookSmoothed = new THREE.Vector3();
    this.dist = CAM.distBase;
    this.fov = CAM.fovBase;
    this.roll = 0;
    this.menuAngle = 0.6;
    this.menuCenter = new THREE.Vector3(0, 0, 0);

    this._t = { active: false, time: 0, dur: CAM.transition, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion(), fromFov: 75 };
    this._pos = new THREE.Vector3();
    this._want = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);
    this._initialised = false;
  }

  /* ----------------------------------------------------------------- menu */
  setMenu(center) {
    this.mode = 'menu';
    this.menuCenter.copy(center);
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
  }

  updateMenu(dt) {
    this.menuAngle += dt * CAM.menuSpeed;
    const r = CAM.menuRadius;
    this.camera.position.set(
      this.menuCenter.x + Math.cos(this.menuAngle) * r,
      CAM.menuHeight,
      this.menuCenter.z + Math.sin(this.menuAngle) * r,
    );
    this._tmp.set(this.menuCenter.x, CAM.menuHeight - 165, this.menuCenter.z);
    this.camera.lookAt(this._tmp);
  }

  /** capture the aerial pose and hand over to the follow camera */
  beginTransition(dur = CAM.transition) {
    this._t.active = true;
    this._t.time = 0;
    this._t.dur = dur;
    this._t.fromPos.copy(this.camera.position);
    this._t.fromQuat.copy(this.camera.quaternion);
    this._t.fromFov = this.camera.fov;
    this.mode = 'follow';
  }

  /* --------------------------------------------------------------- follow */
  update(dt, player, input, controller) {
    if (this.mode === 'menu') { this.updateMenu(dt); return; }

    // ---- observation point: above the head, led by velocity
    if (controller?.ready) controller.headPosition(this._eye);
    else this._eye.copy(player.pos).setY(player.pos.y + 1.6);
    this._eye.y += CAM.eyeAboveHead;

    this.look.copy(player.vel).multiplyScalar(CAM.lookAhead);
    const la = this.look.length();
    if (la > CAM.lookAheadMax) this.look.multiplyScalar(CAM.lookAheadMax / la);
    if (!this._initialised) { this.lookSmoothed.copy(this.look); this._initialised = true; }
    const lk = 1 - Math.exp(-CAM.lookAheadDamp * dt);
    this.lookSmoothed.lerp(this.look, lk);
    const target = this._tmp.copy(this._eye).add(this.lookSmoothed);

    // ---- gentle yaw auto-align while swinging or zipping
    if (player.state === 'swing' || player.state === 'zip') {
      const h = Math.hypot(player.vel.x, player.vel.z);
      if (h > 4) {
        const wantYaw = Math.atan2(-player.vel.x, -player.vel.z);
        let diff = wantYaw - input.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        input.yaw += THREE.MathUtils.clamp(diff, -CAM.alignRate * dt, CAM.alignRate * dt);
      }
    }

    // ---- desired distance: speed pushes it out, swing adds a little more
    const speed = player.vel.length();
    let wantDist = CAM.distBase + THREE.MathUtils.clamp(speed / 34, 0, 1) * (CAM.distMax - CAM.distBase);
    if (player.state === 'swing') wantDist += CAM.distSwingBonus;
    if (player.dive) wantDist += 1.4;

    // ---- orbit offset from yaw/pitch
    const cp = Math.cos(input.pitch), sp = Math.sin(input.pitch);
    const dirX = Math.sin(input.yaw) * cp;
    const dirY = -sp;
    const dirZ = Math.cos(input.yaw) * cp;

    // ---- obstruction: AABB segment test, shortened to the first contact
    const maxDist = wantDist;
    const bx = target.x + dirX * maxDist, by = target.y + dirY * maxDist, bz = target.z + dirZ * maxDist;
    const frac = this.boxes.segmentHitsBox(target.x, target.y, target.z, bx, by, bz, 0.35);
    const allowed = frac > 0 ? Math.max(CAM.distMin, maxDist * frac - 0.25) : maxDist;

    // pull in immediately, ease back out
    if (allowed < this.dist) this.dist += (allowed - this.dist) * Math.min(1, CAM.pullInRate * dt);
    else this.dist += (allowed - this.dist) * Math.min(1, CAM.pushOutRate * dt);
    this.dist = THREE.MathUtils.clamp(this.dist, CAM.distMin, CAM.distMax + 2);

    this._want.set(target.x + dirX * this.dist, target.y + dirY * this.dist, target.z + dirZ * this.dist);

    // ---- roll from lateral velocity
    const right = this._q.setFromAxisAngle(this._up, input.yaw);
    const rx = Math.cos(input.yaw), rz = -Math.sin(input.yaw);
    const lateral = player.vel.x * rx + player.vel.z * rz;
    const wantRoll = THREE.MathUtils.clamp(-lateral / 40, -CAM.rollMax, CAM.rollMax);
    this.roll += (wantRoll - this.roll) * Math.min(1, CAM.rollDamp * dt);

    // ---- FOV from speed
    let wantFov = CAM.fovBase + THREE.MathUtils.clamp((speed - 8) / 48, 0, 1) * (CAM.fovMax - CAM.fovBase);
    if (player.dive) wantFov += CAM.fovDive;
    this.fov += (wantFov - this.fov) * Math.min(1, CAM.fovDamp * dt);

    // ---- compose, then blend through the opening transition
    this._m.lookAt(this._want, target, this._up);
    this._q.setFromRotationMatrix(this._m);
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll);
    this._q.multiply(rollQ);

    if (this._t.active) {
      this._t.time += dt;
      const k = smoothstep(THREE.MathUtils.clamp(this._t.time / this._t.dur, 0, 1));
      this.camera.position.lerpVectors(this._t.fromPos, this._want, k);
      this.camera.quaternion.slerpQuaternions(this._t.fromQuat, this._q, k);
      this.camera.fov = THREE.MathUtils.lerp(this._t.fromFov, this.fov, k);
      if (k >= 1) this._t.active = false;
    } else {
      this.camera.position.copy(this._want);
      this.camera.quaternion.copy(this._q);
      this.camera.fov = this.fov;
    }
    this.camera.updateProjectionMatrix();
  }
}
