// Jugador en primera persona: caminata lenta con inercia, mirada con ratón y balanceo de cámara.
// Los pasos se emiten sincronizados con el balanceo (un paso cada vez que la cabeza baja).
import { PLAYER, HEADBOB } from '../config.js';
import { clamp, damp } from '../core/math.js';
import { moveCharacter, footstepSurface } from '../world/physics.js';
import { advanceStepPhase, stepsBetween, bobOffset } from './headbob.js';

export function createPlayer(camera) {
  const state = { x: 0, y: 0, z: 0, vy: 0, grounded: true, surface: 'mud', surfaceRef: null, crouched: false, sprinting: false };
  let stamina = PLAYER.stamina;
  let exhausted = false;
  let eyeOffset = PLAYER.eyeHeight;
  let world = null;
  let yaw = 0;
  let pitch = 0;
  let vx = 0;
  let vz = 0;
  let phase = 0;
  let bobWeight = 0;
  let eyeY = 0;
  let stepCount = 0;
  const moveOpts = {
    radius: PLAYER.radius,
    height: PLAYER.height,
    stepUp: PLAYER.stepUp,
    snapDown: PLAYER.snapDown,
    gravity: PLAYER.gravity,
    dt: 0,
  };

  function applyCamera() {
    const bob = bobOffset(phase, bobWeight, HEADBOB);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    camera.position.set(state.x + rightX * bob.x, eyeY + bob.y, state.z + rightZ * bob.x);
    camera.rotation.set(pitch, yaw, bob.roll, 'YXZ');
  }

  return {
    state,
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    /** Posición de los ojos (sin balanceo). */
    eye() {
      return { x: state.x, y: eyeY, z: state.z };
    },

    place(spawn, physicsWorld) {
      world = physicsWorld;
      state.x = spawn.x;
      state.y = spawn.y;
      state.z = spawn.z;
      state.vy = 0;
      state.grounded = true;
      yaw = spawn.yaw ?? 0;
      pitch = spawn.pitch ?? 0;
      vx = vz = 0;
      state.crouched = false;
      state.sprinting = false;
      stamina = PLAYER.stamina;
      exhausted = false;
      eyeOffset = PLAYER.eyeHeight;
      eyeY = state.y + PLAYER.eyeHeight;
      bobWeight = 0;
      moveCharacter(world, state, 0, 0, { ...moveOpts, dt: 1 / 60 });
      eyeY = state.y + PLAYER.eyeHeight;
      applyCamera();
    },

    look(dx, dy) {
      yaw -= dx * PLAYER.mouseSensitivity;
      pitch = clamp(pitch - dy * PLAYER.mouseSensitivity, -PLAYER.pitchLimit, PLAYER.pitchLimit);
    },

    setLook(newYaw, newPitch) {
      yaw = newYaw;
      pitch = newPitch;
      applyCamera();
    },

    /**
     * @param {{ forward: number, strafe: number }} axes  entrada de movimiento (-1..1)
     * @param {(step: { surface: string, side: number }) => void} onStep
     * @param {{ sprint?: boolean, crouch?: boolean }} [mode]  correr / agachado
     */
    update(dt, axes, onStep, mode = {}) {
      state.crouched = Boolean(mode.crouch);
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      let f = axes.forward * (axes.forward < 0 ? PLAYER.backSpeedFactor : 1);
      let s = axes.strafe * PLAYER.strafeSpeedFactor;
      const len = Math.hypot(f, s);
      if (len > 1) {
        f /= len;
        s /= len;
      }
      const surface = footstepSurface(state);
      // Correr: solo hacia adelante, de pie y con aguante. Si te agotas, no corres hasta recuperarte.
      state.sprinting = Boolean(mode.sprint) && !state.crouched && !exhausted && axes.forward > 0.3;
      if (state.sprinting) {
        stamina -= dt;
        if (stamina <= 0) {
          stamina = 0;
          exhausted = true;
          state.sprinting = false;
        }
      } else {
        stamina = Math.min(PLAYER.stamina, stamina + PLAYER.staminaRegen * dt);
        if (exhausted && stamina >= PLAYER.stamina * PLAYER.staminaRearm) exhausted = false;
      }
      let speed = state.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      if (state.crouched) speed *= PLAYER.crouchSpeedFactor;
      if (surface === 'water') speed *= PLAYER.waterSpeedFactor;
      const tvx = (fwdX * f + rightX * s) * speed;
      const tvz = (fwdZ * f + rightZ * s) * speed;
      const a = damp(PLAYER.acceleration, dt);
      vx += (tvx - vx) * a;
      vz += (tvz - vz) * a;

      const px = state.x;
      const pz = state.z;
      moveOpts.dt = dt;
      moveCharacter(world, state, vx * dt, vz * dt, moveOpts);
      const moved = Math.hypot(state.x - px, state.z - pz);

      if (state.grounded && moved > 1e-5) {
        const prev = phase;
        phase = advanceStepPhase(phase, moved, HEADBOB.stepLength);
        const steps = stepsBetween(prev, phase);
        for (let i = 0; i < steps; i++) {
          stepCount++;
          const intensity = state.sprinting ? 1.45 : state.crouched ? 0.45 : 1;
          onStep?.({ surface: footstepSurface(state), side: stepCount % 2 ? -1 : 1, intensity });
        }
      }
      const walking = clamp(moved / dt / PLAYER.walkSpeed, 0, 1);
      bobWeight += (walking - bobWeight) * damp(HEADBOB.fadeRate, dt);
      eyeOffset += ((state.crouched ? PLAYER.crouchEye : PLAYER.eyeHeight) - eyeOffset) * damp(8, dt);
      eyeY += (state.y + eyeOffset - eyeY) * damp(PLAYER.eyeSmoothing, dt);
      applyCamera();
    },

    /** 0 = descansado, 1 = sin aliento (para el jadeo). */
    get exhaustion() {
      return exhausted ? 1 : 1 - stamina / PLAYER.stamina;
    },

    /** Coloca la cámara sin mover al jugador (secuencia inicial). */
    refresh() {
      applyCamera();
    },
  };
}
