/**
 * Character rig: skinned character, animation state machine and the web strand.
 *
 * Clip hygiene runs on load -- scale tracks are dropped outright, and position
 * tracks are dropped for every bone except the pelvis, with the pelvis itself
 * stripped on the airborne / swing / roll clips so authored root motion can
 * never fight the physics solver for the character's world position.
 *
 * The strand is not a Line: six thin cylinders follow a quadratic Bezier from
 * the correct hand bone to the anchor, sagging by 0.6 + slack * 14 so it hangs
 * while slack and straightens under tension.
 */
import * as THREE from 'three';
import { buildCharacterMaterials, makeCamoTexture } from './src/assets.js';

const FADE = { fast: 0.08, normal: 0.16, slow: 0.3 };
const NO_PELVIS_MOTION = new Set(['JumpLoop', 'FallingLoop', 'SwingLoop', 'SwingRelease', 'LandingRoll']);

export const STATE_LABEL = {
  ground: '地面', air: '空中', swing: '摆荡', wallrun: '跑墙', zip: '飞索',
};

/* ------------------------------------------------------------ clip hygiene */
function cleanClip(clip) {
  const keep = [];
  for (const track of clip.tracks) {
    const [boneName, prop] = track.name.split('.');
    if (prop === 'scale') continue;                                  // never wanted
    if (prop === 'position') {
      if (boneName !== 'hips') continue;                             // only the pelvis may translate
      if (NO_PELVIS_MOTION.has(clip.name)) continue;                 // physics owns these
      // a position track that never changes is dead weight
      const v = track.values;
      let moves = false;
      for (let i = 3; i < v.length; i++) if (Math.abs(v[i] - v[i % 3]) > 1e-4) { moves = true; break; }
      if (!moves) continue;
    }
    keep.push(track);
  }
  clip.tracks = keep;
  return clip;
}

export class CharacterController {
  constructor(scene, { charMaterials }) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'character';
    scene.add(this.root);
    this.charMaterialDefs = charMaterials;
    this.camo = makeCamoTexture();
    this.materials = buildCharacterMaterials(charMaterials, this.camo);
    this.mixer = null;
    this.actions = new Map();
    this.current = null;
    this.bones = new Map();
    this.meshes = [];
    this.ready = false;
    this._fadeLeft = 0;
    this.stats = { clips: 0, bones: 0, materials: 0, droppedTracks: 0 };

    /* ---- web strand ------------------------------------------------- */
    const fiberDef = charMaterials.char_web_fiber;
    this.fiber = new THREE.MeshStandardMaterial({
      color: new THREE.Color(fiberDef.color),
      emissive: new THREE.Color(fiberDef.emissive),
      emissiveIntensity: fiberDef.emissiveIntensity,
      roughness: fiberDef.roughness,
    });
    const seg = new THREE.CylinderGeometry(0.028, 0.028, 1, 6, 1, true);
    seg.translate(0, 0.5, 0);                          // grow from the origin upward
    this.SEGMENTS = 6;
    this.web = new THREE.InstancedMesh(seg, this.fiber, this.SEGMENTS);
    this.web.frustumCulled = false;
    this.web.visible = false;
    this.web.name = 'webStrand';
    scene.add(this.web);
    this._wm = new THREE.Matrix4();
    this._wq = new THREE.Quaternion();
    this._wa = new THREE.Vector3();
    this._wb = new THREE.Vector3();
    this._wc = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._handPos = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._pm = new THREE.Matrix4();
  }

  /** attach a loaded character GLB */
  load(gltf) {
    this.clear();
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        o.castShadow = false;
        const name = o.material?.name;
        const m = this.materials.get(name);
        if (m) o.material = m;
        else console.warn('[controller] no character material for', name);
        this.meshes.push(o);
      }
      if (o.isBone) this.bones.set(o.name, o);
    });
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    let dropped = 0;
    for (const raw of gltf.animations) {
      const before = raw.tracks.length;
      const clip = cleanClip(raw);
      dropped += before - clip.tracks.length;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(0);
      if (clip.name === 'SoftLanding' || clip.name === 'LandingRoll' || clip.name === 'JumpFromRun' || clip.name === 'SwingRelease') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
      this.actions.set(clip.name, action);
    }
    // Sprint reuses the run cycle sped up, exactly as specified
    const run = this.actions.get('RunForward');
    this.sprintScale = 1.3;
    this.stats = {
      clips: this.actions.size, bones: this.bones.size,
      materials: new Set(this.meshes.map((m) => m.material.name)).size,
      droppedTracks: dropped,
      hasRun: !!run,
    };
    this.ready = true;
    this._setState('Idle', 0);
    return this.stats;
  }

  clear() {
    if (this.model) {
      this.root.remove(this.model);
      this.model.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    }
    this.mixer?.stopAllAction();
    this.actions.clear();
    this.bones.clear();
    this.meshes.length = 0;
    this.model = null;
    this.mixer = null;
    this.current = null;
    this.ready = false;
  }

  /* --------------------------------------------------------- state machine */
  /**
   * Crossfades between clips. Every action is created paused at weight 0, so a
   * zero-length fade must set the weight outright -- scheduling a 0 s fadeIn
   * leaves the action at weight 0 and the character frozen in its bind pose.
   */
  _setState(name, fade = FADE.normal, timeScale = 1) {
    const next = this.actions.get(name);
    if (!next) return;
    next.setEffectiveTimeScale(timeScale);

    if (this.current === name) {
      // repair a weight that never arrived (a fade interrupted by a state flip)
      if (this._fadeLeft <= 0 && next.getEffectiveWeight() < 0.999) next.setEffectiveWeight(1);
      return;
    }

    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset();
    next.enabled = true;
    next.play();
    next.setEffectiveWeight(1);
    if (fade > 0 && prev) {
      next.fadeIn(fade);
      prev.fadeOut(fade);
      this._fadeLeft = fade;
    } else {
      if (prev) prev.setEffectiveWeight(0);
      this._fadeLeft = 0;
    }
    this.current = name;
  }

  /** choose the clip from the physics state, exactly on the documented bands */
  pickClip(player) {
    if (player.landTimer > 0 && player.landKind === 'roll') return ['LandingRoll', FADE.fast, 1];
    if (player.landTimer > 0 && player.landKind === 'soft') return ['SoftLanding', FADE.fast, 1];
    switch (player.state) {
      case 'ground': {
        const s = Math.hypot(player.vel.x, player.vel.z);
        if (s < 0.6) return ['Idle', FADE.slow, 1];
        if (s < 6) return ['WalkForward', FADE.normal, THREE.MathUtils.clamp(s / 4.2, 0.65, 1.5)];
        if (s < 11) return ['RunForward', FADE.normal, THREE.MathUtils.clamp(s / 8.5, 0.7, 1.35)];
        return ['RunForward', FADE.normal, this.sprintScale];           // sprint
      }
      case 'swing': return ['SwingLoop', FADE.normal, 1];
      case 'zip': return ['FallingLoop', FADE.normal, 1.1];
      case 'wallrun': return ['FallingLoop', FADE.fast, 1.25];
      case 'air':
      default:
        if (player.releaseTimer > 0) return ['SwingRelease', FADE.fast, 1];
        return player.vel.y > 0.5
          ? ['JumpLoop', FADE.fast, 1]
          : ['FallingLoop', FADE.normal, player.dive ? 1.35 : 1];
    }
  }

  /* ------------------------------------------------------------- per frame */
  update(dt, player) {
    if (!this.ready) return;
    if (player.releaseTimer > 0) player.releaseTimer = Math.max(0, player.releaseTimer - dt);
    if (this._fadeLeft > 0) this._fadeLeft -= dt;

    const [clip, fade, ts] = this.pickClip(player);
    this._setState(clip, fade, ts);
    this.mixer.update(dt);

    this.root.position.copy(player.pos);
    this.root.rotation.y = player.facing;
    this.root.updateMatrixWorld(true);

    if (player.state === 'swing' && player.hasAnchor) {
      if (player.webHand === 'l') this._mirrorArms();
      this._aimArm(player.webHand, player.anchor);
      this._drawWeb(player);
    } else {
      this.web.visible = false;
    }
  }

  /** mirror the two arms so a left-handed swing doesn't reach with the right */
  _mirrorArms() {
    for (const pair of [['upperarm_l', 'upperarm_r'], ['forearm_l', 'forearm_r']]) {
      const a = this.bones.get(pair[0]), b = this.bones.get(pair[1]);
      if (!a || !b) continue;
      this._tmpQ.copy(a.quaternion);
      a.quaternion.set(b.quaternion.x, -b.quaternion.y, -b.quaternion.z, b.quaternion.w);
      b.quaternion.set(this._tmpQ.x, -this._tmpQ.y, -this._tmpQ.z, this._tmpQ.w);
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * Points the web arm at the anchor: the bone's rest direction (towards its
   * child) is rotated onto the direction of the target in the parent's frame.
   */
  _aimArm(hand, target) {
    for (const [bone, child] of [[`upperarm_${hand}`, `forearm_${hand}`], [`forearm_${hand}`, `hand_${hand}`]]) {
      const b = this.bones.get(bone), c = this.bones.get(child);
      if (!b || !c || !b.parent) continue;
      const rest = this._tmpV.copy(c.position).normalize();
      this._pm.copy(b.parent.matrixWorld).invert();
      const want = this._tmpV2.copy(target).applyMatrix4(this._pm).sub(b.position);
      if (want.lengthSq() < 1e-6) continue;
      want.normalize();
      // blend towards the aim so the clip still reads through the pose
      this._tmpQ.setFromUnitVectors(rest, want);
      b.quaternion.slerp(this._tmpQ, bone.startsWith('upperarm') ? 0.85 : 0.55);
      b.updateMatrixWorld(true);
    }
    this.root.updateMatrixWorld(true);
  }

  /** six cylinders along a quadratic Bezier, sagging with the rope's slack */
  _drawWeb(player) {
    const hand = this.bones.get(`hand_${player.webHand}`) || this.bones.get('hand_r');
    if (!hand) { this.web.visible = false; return; }
    hand.getWorldPosition(this._handPos);
    const a = this._wa.copy(this._handPos);
    const c = this._wc.copy(player.anchor);
    const dist = a.distanceTo(c);
    const slack = Math.max(0, 1 - dist / Math.max(0.001, player.rope));
    const sag = 0.6 + slack * 14;
    const b = this._wb.addVectors(a, c).multiplyScalar(0.5);
    b.y -= sag;

    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    for (let i = 0; i < this.SEGMENTS; i++) {
      const t0 = i / this.SEGMENTS, t1 = (i + 1) / this.SEGMENTS;
      bezier(a, b, c, t0, p0);
      bezier(a, b, c, t1, p1);
      const dir = this._tmpV.subVectors(p1, p0);
      const len = dir.length() || 1e-4;
      dir.multiplyScalar(1 / len);
      this._wq.setFromUnitVectors(this._up, dir);
      // taper slightly towards the anchor so it reads as a fibre, not a pipe
      const thin = 1 - i * 0.06;
      this._wm.compose(p0, this._wq, this._tmpV2.set(thin, len, thin));
      this.web.setMatrixAt(i, this._wm);
    }
    this.web.instanceMatrix.needsUpdate = true;
    this.web.visible = true;
  }

  /** world position of the character's head, for the camera rig */
  headPosition(out) {
    const head = this.bones.get('head');
    if (head) return head.getWorldPosition(out);
    return out.copy(this.root.position).setY(this.root.position.y + 1.6);
  }

  dispose() {
    this.clear();
    this.web.geometry.dispose();
    this.fiber.dispose();
    this.camo.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.scene.remove(this.root, this.web);
  }
}

function bezier(a, b, c, t, out) {
  const it = 1 - t;
  out.set(
    it * it * a.x + 2 * it * t * b.x + t * t * c.x,
    it * it * a.y + 2 * it * t * b.y + t * t * c.y,
    it * it * a.z + 2 * it * t * b.z + t * t * c.z,
  );
  return out;
}
