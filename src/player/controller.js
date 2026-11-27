// Jugador en primera persona: caminata lenta con inercia, mirada con ratón y balanceo de cámara.
// Los pasos se emiten sincronizados con el balanceo (un paso cada vez que la cabeza baja).
import { PLAYER, HEADBOB } from '../config.js';
import { clamp, damp } from '../core/math.js';
import { moveCharacter, footstepSurface } from '../world/physics.js';
import { advanceStepPhase, stepsBetween, bobOffset } from './headbob.js';

export function createPlayer(camera) {
  const state = { x: 0, y: 0, z: 0, vy: 0, grounded: true, surface: 'mud', surfaceRef: null };
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
     */
    update(dt, axes, onStep) {
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
      const speed = PLAYER.walkSpeed * (surface === 'water' ? PLAYER.waterSpeedFactor : 1);
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
          onStep?.({ surface: footstepSurface(state), side: stepCount % 2 ? -1 : 1 });
        }
      }
      const walking = clamp(moved / dt / PLAYER.walkSpeed, 0, 1);
      bobWeight += (walking - bobWeight) * damp(HEADBOB.fadeRate, dt);
      eyeY += (state.y + PLAYER.eyeHeight - eyeY) * damp(PLAYER.eyeSmoothing, dt);
      applyCamera();
    },

    /** Coloca la cámara sin mover al jugador (secuencia inicial). */
    refresh() {
      applyCamera();
    },
  };
}
