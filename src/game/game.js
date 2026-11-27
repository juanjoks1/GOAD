// Bucle principal y estados del juego:
//   cargando → intro (texto shareware) → despertar (fundido mirando al cielo) → jugando ⇄ pausa
//   → saliendo (puerta metálica, fundido a negro) → siguiente escena o pantalla final.
import * as THREE from 'three';
import { RENDER, INTRO, INTERACT, TRANSITION } from '../config.js';
import { lerp, smoothstep } from '../core/math.js';
import { createRetroRenderer, fitViewport } from '../core/renderer.js';
import { createInput } from '../core/input.js';
import { createOverlay, totalChars } from '../ui/overlay.js';
import { createAudioDirector } from '../audio/director.js';
import { createPlayer } from '../player/controller.js';
import { createTextureLibrary } from '../textures/library.js';
import { LEVELS, FIRST_LEVEL } from '../scene/registry.js';
import { INTRO_LINES } from '../content/texts.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * @param {{ viewport: HTMLElement, glCanvas: HTMLCanvasElement, uiCanvas: HTMLCanvasElement, scanlines: HTMLElement,
 *           options: { skipIntro?: boolean, spawn?: string | null } }} dom
 */
export async function startGame({ viewport, glCanvas, uiCanvas, scanlines, options = {} }) {
  fitViewport(viewport, scanlines);
  window.addEventListener('resize', () => fitViewport(viewport, scanlines));

  const retro = createRetroRenderer(glCanvas);
  const overlay = createOverlay(uiCanvas);
  const input = createInput(glCanvas);
  const audio = createAudioDirector();
  const camera = new THREE.PerspectiveCamera(RENDER.fov, 4 / 3, RENDER.near, RENDER.far);
  const timeUniform = { value: 0 };
  const player = createPlayer(camera);

  overlay.loading(0.1);
  await nextFrame();
  const textures = createTextureLibrary();
  overlay.loading(0.5);
  await nextFrame();
  let level = LEVELS[FIRST_LEVEL]({ textures, timeUniform });
  overlay.loading(0.9);
  await nextFrame();

  let spawn = (options.spawn && level.debugSpawns?.[options.spawn]) || level.spawn;
  player.place(spawn, level.physics);
  retro.warmUp(level.scene, camera);

  const game = { mode: 'intro', modeTime: 0, clock: 0, typed: 0, wakeTime: 0, resumeMode: 'playing', exitTo: null };
  const setMode = (mode) => {
    game.mode = mode;
    game.modeTime = 0;
  };

  function beginWaking() {
    audio.start();
    input.requestLock();
    game.wakeTime = 0;
    player.setLook(spawn.yaw, INTRO.startPitch);
    setMode('waking');
  }

  function advanceIntro() {
    if (game.typed < totalChars(INTRO_LINES)) game.typed = Infinity;
    else beginWaking();
  }

  if (options.skipIntro) {
    retro.fade = 1;
    setMode('playing');
  }

  input.onClick(() => {
    if (game.mode === 'intro') advanceIntro();
    else if (game.mode === 'paused') input.requestLock();
    else if (game.mode === 'playing' && !input.locked) {
      audio.start();
      input.requestLock();
    }
  });
  input.onLockChange((locked) => {
    if (!locked && (game.mode === 'playing' || game.mode === 'waking')) {
      game.resumeMode = game.mode;
      setMode('paused');
      audio.duck(true);
    } else if (locked && game.mode === 'paused') {
      setMode(game.resumeMode);
      audio.duck(false);
    }
  });

  const forward = new THREE.Vector3();
  function lookTarget() {
    const eye = player.eye();
    camera.getWorldDirection(forward);
    for (const it of level.interactables) {
      const dx = it.position.x - eye.x;
      const dy = it.position.y - eye.y;
      const dz = it.position.z - eye.z;
      if (Math.hypot(dx, dz) > INTERACT.distance || Math.abs(dy) > 1.6) continue;
      const d = Math.hypot(dx, dy, dz);
      if ((forward.x * dx + forward.y * dy + forward.z * dz) / d > INTERACT.facing) return it;
    }
    return null;
  }

  function use(it) {
    if (it.action.type !== 'exit') return;
    if (it.action.sound === 'metal-door') audio.playMetalDoor();
    audio.fadeOut(2.6, 2.4);
    game.exitTo = it.action.to;
    setMode('exiting');
  }

  /** Gancho para la siguiente escena: si está registrada en src/scene/registry.js, se carga. */
  function arrive(id) {
    if (!LEVELS[id]) {
      game.typed = 0;
      setMode('ended');
      return;
    }
    level.dispose();
    level = LEVELS[id]({ textures, timeUniform });
    spawn = level.spawn;
    player.place(spawn, level.physics);
    retro.warmUp(level.scene, camera);
    setMode('arriving');
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(RENDER.maxDelta, (now - last) / 1000);
    last = now;
    game.clock += dt;
    game.modeTime += dt;
    timeUniform.value = game.clock;
    const mouse = input.takeMouse();

    switch (game.mode) {
      case 'intro': {
        game.typed += dt * INTRO.typeSpeed;
        retro.fade = 0;
        overlay.intro(Math.floor(Math.min(game.typed, 1e6)), game.clock);
        if (input.consume('Enter') || input.consume('Space')) advanceIntro();
        break;
      }
      case 'waking': {
        game.wakeTime += dt;
        const w = game.wakeTime;
        retro.fade = smoothstep(INTRO.blackHold, INTRO.blackHold + INTRO.fadeDuration, w);
        const downStart = INTRO.blackHold + INTRO.lookUpHold;
        const k = smoothstep(downStart, downStart + INTRO.lookDownDuration, w);
        player.setLook(spawn.yaw + Math.sin(w * 0.3) * 0.04 * (1 - k), lerp(INTRO.startPitch, spawn.pitch ?? 0, k));
        if (w < 0.9) overlay.intro(Infinity, game.clock, 1 - w / 0.9);
        else overlay.clear();
        if (k >= 1) setMode('playing');
        break;
      }
      case 'arriving': {
        retro.fade = smoothstep(0.5, 3.5, game.modeTime);
        overlay.clear();
        if (game.modeTime > 3.5) setMode('playing');
        break;
      }
      case 'playing': {
        retro.fade = 1;
        player.look(mouse.x, mouse.y);
        player.update(dt, input.axes(), (step) => audio.footstep(step.surface, step.side));
        const target = lookTarget();
        if (target) overlay.prompt(target.prompt);
        else overlay.clear();
        if (target && input.consume('KeyE')) use(target);
        break;
      }
      case 'paused':
        overlay.pause(game.clock);
        break;
      case 'exiting': {
        overlay.clear();
        const t = game.modeTime;
        retro.fade = 1 - smoothstep(TRANSITION.doorFadeDelay, TRANSITION.doorFadeDelay + TRANSITION.doorFadeDuration, t);
        if (t > 5.4) arrive(game.exitTo);
        break;
      }
      case 'ended': {
        retro.fade = 0;
        game.typed += dt * INTRO.typeSpeed * 0.7;
        overlay.end(Math.floor(game.typed), game.clock);
        if (input.consume('KeyR')) window.location.reload();
        break;
      }
      default:
        break;
    }

    const feet = player.state;
    level.update(dt, game.clock, feet);
    const sample = level.sample(feet);
    audio.update(game.clock, sample.zone, sample.door);
    retro.render(level.scene, camera, game.clock);
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    player,
    camera,
    audio,
    get level() {
      return level;
    },
    get mode() {
      return game.mode;
    },
    setMode,
    /** Para depurar: teletransporta a un punto de `level.debugSpawns`. */
    teleport(name) {
      const s = level.debugSpawns?.[name];
      if (s) player.place(s, level.physics);
    },
  };
}
