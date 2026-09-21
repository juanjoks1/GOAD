/**
 * CYBERPUNK MEGAPOLIS — Web-Swing Edition
 *
 * Boot, render pipeline and the phase machine that ties the loader, the menu,
 * gameplay and pause together.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { AssetLoader, supportsWebP, buildRenderGroupMaterials, prewarm, BUILD } from './src/assets.js';
import { buildCity } from './src/city.js';
import { SkyDome, PRESETS } from './src/sky.js';
import { QualityManager, TIERS } from './src/quality.js';
import { UI } from './src/ui.js';
import { TouchControls, isTouchDevice } from './src/touch.js';
import { CityBoxes } from './cityBoxes.js';
import { Input } from './input.js';
import { Player, TUNING } from './player.js';
import { CharacterController } from './controller.js';
import { CameraRig } from './cameraRig.js';

const params = new URLSearchParams(location.search);
const SHOW_PERF = params.get('perf') !== '0';
const FORCED_TIER = params.get('quality');
const BOOT_TIMEOUT = 30000;

const app = {
  phase: 'loading',
  ready: false,
  cityReady: false,
  charsReady: false,
  raf: 0,
  running: false,
  lastTime: 0,
  frames: 0,
  fpsClock: 0,
  lockEverAcquired: false,
  startedOnce: false,
  disposed: false,
};
window.__game = app;                        // acceptance tests read this

/* ============================================================ capabilities */
const canvas = document.getElementById('gl');
let gl = null;
try {
  gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
} catch { /* handled below */ }

const ui = new UI({
  onSelect: (id) => { app.selected = id; },
  onStart: (which) => onStartRequest(which),
  onResume: () => resume(),
  onRetry: () => location.reload(),
});
ui.showPerf(SHOW_PERF);
ui.el.perf.hidden = !SHOW_PERF;

if (!gl) {
  ui.compat('无法启动 WEBGL2 UNAVAILABLE',
    '此浏览器没有可用的 WebGL2 上下文，无法运行本作。请使用最新版本的 Chrome、Edge 或 Safari。This browser has no usable WebGL2 context. Please use an up-to-date Chrome, Edge or Safari.');
  ui.el.loader.hidden = true;
  throw new Error('WebGL2 unavailable');
}

const caps = {
  halfFloat: !!gl.getExtension('EXT_color_buffer_half_float'),
  multiDraw: !!gl.getExtension('WEBGL_multi_draw'),
  maxSamples: gl.getParameter(gl.MAX_SAMPLES) || 0,
  maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
};
const IS_TOUCH = isTouchDevice();
const detected = QualityManager.detect(gl, { touch: IS_TOUCH });
const quality = new QualityManager(FORCED_TIER && TIERS[FORCED_TIER] ? FORCED_TIER : detected.tier, {
  onChange: (tier) => applyQuality(tier, true),
});
if (FORCED_TIER) quality.auto = false;

const compatNotes = [];
if (!caps.halfFloat) compatNotes.push('缺少 HalfFloat 渲染目标，已关闭 Bloom · HalfFloat render targets unavailable, bloom disabled');
if (caps.maxSamples < 2) compatNotes.push('不支持多重采样，已关闭 MSAA · multisampling unsupported, MSAA disabled');
if (!caps.multiDraw) compatNotes.push('缺少 WEBGL_multi_draw，已降低细节距离 · WEBGL_multi_draw missing, detail distance reduced');
if (detected.tier !== 'high' && !IS_TOUCH) compatNotes.push(`检测到 ${detected.reason}，已使用 ${TIERS[quality.tier].label} 画质 · detected ${detected.reason}, using ${TIERS[quality.tier].label}`);
if (compatNotes.length) {
  ui.compat('兼容性提示 COMPATIBILITY', compatNotes.join('\n'));
}
if (!caps.multiDraw) {
  for (const t of Object.values(TIERS)) { t.detailDistance *= 0.62; t.structureDistance *= 0.75; }
}

/* ================================================================ renderer */
const renderer = new THREE.WebGLRenderer({
  canvas, context: gl, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIERS[quality.tier].dpr));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.3, 9000);
camera.position.set(0, 400, 200);

const sky = new SkyDome(renderer, scene);

/* ------------------------------------------------------------- composer */
let composer = null, bloomPass = null, renderPass = null;
function buildComposer(tier) {
  if (composer) { composer.dispose?.(); composer = null; }
  if (!tier.bloom || !caps.halfFloat) { bloomPass = null; renderPass = null; return; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const samples = Math.min(tier.msaa, caps.maxSamples);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
    samples: samples > 1 ? samples : 0,
    depthBuffer: true,
  });
  composer = new EffectComposer(renderer, rt);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const p = PRESETS[sky.preset];
  bloomPass = new UnrealBloomPass(size.clone(), p.bloom.strength * tier.bloomScale, p.bloom.radius, p.bloom.threshold);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.setSize(window.innerWidth, window.innerHeight);
}
buildComposer(TIERS[quality.tier]);

/* ============================================================ game objects */
const boxes = new CityBoxes(40000);
const input = new Input(canvas, {
  onPointerLockChange: (locked) => {
    if (IS_TOUCH) return;                       // touch play never uses pointer lock
    if (locked) { app.lockEverAcquired = true; if (app.phase === 'paused') ui.setPhase('playing'), (app.phase = 'playing'); }
    else if (app.phase === 'playing' && app.lockEverAcquired) pause();
  },
  onEscape: () => { if (app.phase === 'playing') pause(); },
});
input.touchMode = IS_TOUCH;
const touch = IS_TOUCH ? new TouchControls(input, { onPause: () => pause() }) : null;
app.isTouch = IS_TOUCH;
const player = new Player(boxes, {
  onLand: (impact, kind) => { if (kind === 'roll') ui.notice('翻滚落地 · LANDING ROLL', 1200); },
  onWeb: () => { },
  onZipFail: () => ui.notice('没有可用的屋顶目标 · NO ROOFTOP IN VIEW', 1400),
  onReentry: () => { ui.flash(380); ui.notice('重新进入城市 · RE-ENTER THE CITY', 2200); },
  onRecover: () => { ui.fadeOut(300); ui.notice('已回到最近的安全点 · RETURNED TO THE NEAREST SAFE POINT', 2400); },
  onRecoverReentry: () => { ui.fadeOut(260); },
  onRecovered: () => { ui.fadeIn(340); },
});
let controller = null;
const rig = new CameraRig(camera, boxes);
rig.setMenu(new THREE.Vector3(0, 0, 40));

/* ================================================================== boot */
let city = null;
let charGltf = { man: null, girl: null };
let charDoc = null;
let bootError = null;

const loader = new AssetLoader({
  onProgress: (l, t, e) => ui.progress(l, t, e),
  onError: (url) => console.warn('[assets] failed:', url),
});

async function boot() {
  const [prefabDoc, sceneDoc, materialsDoc, texDoc, characters] = await Promise.all([
    loader.json('./data/prefabs.json'),
    loader.json('./data/scene.json'),
    loader.json('./data/materials.json'),
    loader.json('./data/textures_webp.json'),
    loader.json('./data/characters.json'),
  ]);
  charDoc = characters;

  const webp = await supportsWebP();
  const texManifest = { webp, byName: new Map(texDoc.textures.map((t) => [t.name, t])) };
  if (!webp) console.warn('[assets] WebP unsupported, using PNG fallbacks');

  const tier = TIERS[quality.tier];
  const canvasGroups = Object.values(materialsDoc.renderGroups).filter((g) => g.canvas).length;
  loader.reserve(canvasGroups + 2);

  const materials = await buildRenderGroupMaterials(loader, materialsDoc, texManifest, tier);
  app.materials = materials;

  // priority: the characters and the menu's sky first, then the city
  controller = new CharacterController(scene, { charMaterials: materialsDoc.character });
  for (const c of characters.characters) {
    charGltf[c.id] = await loader.loadGLB('./' + c.file);
  }
  app.charsReady = true;
  loader.complete();

  city = await buildCity({
    loader, scene, materials, prefabDoc, sceneDoc, materialsDoc,
    quality: tier, boxes, notify: (m) => ui.notice(m, 3000),
  });
  app.cityReady = true;
  loader.complete();

  applyQuality(tier, false);
  prewarm(renderer, scene, camera, [...materials.values()]);
  return { prefabDoc, sceneDoc, materialsDoc };
}

let menuEntered = false;
async function proceedToMenu(reason) {
  if (menuEntered) return;
  menuEntered = true;
  console.info(`[boot] entering menu (${reason})`, app.cityReady ? city.stats : 'city still loading');
  if (!app.cityReady) {
    ui.notice('部分场景仍在加载 · some scenery is still loading', 3200);
  }
  await ui.hideLoader();
  ui.setPhase('menu');
  app.phase = 'menu';
  app.ready = true;
  startLoop();
}

const watchdog = setTimeout(() => {
  if (!menuEntered) {
    console.warn('[boot] 30s fail-safe fired; going to the menu with what loaded');
    ui.compat('加载超时 LOADING TIMED OUT',
      '部分资源在 30 秒内没有加载完成，已先进入菜单，剩余资源会在后台继续加载。Some assets did not finish loading within 30 seconds; the menu opened anyway and the rest keeps loading in the background.');
    proceedToMenu('30s fail-safe');
  }
}, BOOT_TIMEOUT);

boot().then(() => {
  clearTimeout(watchdog);
  proceedToMenu('assets complete');
}).catch((err) => {
  clearTimeout(watchdog);
  bootError = err;
  console.error('[boot] failed', err);
  ui.el.loader.hidden = true;
  ui.fatal('资源加载失败，无法进入游戏。Asset loading failed, the game cannot start.', String(err && err.stack || err));
});

/* ============================================================== gameplay */
function onStartRequest(which) {
  if (which === 'controls-dismissed') { enterPlay(); return; }
  if (app.startedOnce && app.phase !== 'menu') return;
  if (!app.selected) return;
  if (!app.charsReady) { ui.notice('角色仍在加载 · character still loading', 2000); ui.setPhase('menu'); app.phase = 'menu'; return; }

  const gltf = charGltf[app.selected];
  const stats = controller.load(gltf);
  console.info('[character]', app.selected, stats);

  // spawn high above the detailed main street and fall in, so the opening reads
  // as one continuous shot: aerial menu -> high-altitude dive -> free traversal
  const start = city?.landmarks?.street_start?.world || [0, 3.2, 40];
  player.safePoints.length = 0;
  player.spawn(
    new THREE.Vector3(start[0], TUNING.reentryHeight, start[2] + 70),
    new THREE.Vector3(0, -7, -9),
    'air',
  );
  player.facing = Math.PI;
  input.yaw = Math.PI;
  input.pitch = -0.36;
  rig.beginTransition(1.5);

  app.startedOnce = true;
  if (!ui.controlsSeen) { ui.showControls(); app.phase = 'controls'; }
  else enterPlay();
}

function enterPlay() {
  ui.setPhase('playing');
  app.phase = 'playing';
  input.enabled = true;
  if (IS_TOUCH) {
    touch.show(true);
    ui.notice('按住「蛛丝」发射并保持 · HOLD WEB TO SWING', 3000);
  } else {
    input.requestLock();
    ui.notice('按住空格发射蛛丝 · HOLD SPACE TO FIRE A WEB', 2600);
  }
}

function pause() {
  if (app.phase !== 'playing') return;
  ui.setPhase('paused');
  app.phase = 'paused';
  input.clear();
  touch?.show(false);
  if (!IS_TOUCH) input.exitLock();
}

function resume() {
  if (app.phase !== 'paused') return;
  ui.setPhase('playing');
  app.phase = 'playing';
  if (IS_TOUCH) touch.show(true);
  else input.requestLock();
}

/* ================================================================== loop */
function startLoop() {
  if (app.running) return;                   // exactly one loop, ever
  app.running = true;
  app.lastTime = performance.now();
  app.raf = requestAnimationFrame(frame);
}

const _camPos = new THREE.Vector3();
let drawCalls = 0, triangles = 0;

function frame(now) {
  app.raf = requestAnimationFrame(frame);
  const dtRaw = Math.min((now - app.lastTime) / 1000, 0.25);
  app.lastTime = now;
  const dt = Math.min(dtRaw, 0.05);
  if (document.hidden) return;                // cheap idle while backgrounded

  quality.sample(dtRaw);

  if (app.phase === 'menu' || app.phase === 'controls') {
    rig.updateMenu(dt);
  } else if (app.phase === 'playing') {
    player.update(dt, input, { yaw: input.yaw, pitch: input.pitch });
    controller?.update(dt, player);
    rig.update(dt, player, input, controller);
    ui.hud(player);

    if (input.pressed('KeyT')) cycleTime();
    if (input.pressed('KeyR')) player.highAltitudeReentry(input.yaw);
  } else if (app.phase === 'paused') {
    // physics is frozen; the sky keeps drifting so the pause still feels alive
  }

  sky.update(app.phase === 'paused' ? 0 : dt, camera.position);
  if (app.cityReady) {
    _camPos.copy(camera.position);
    city.updateLOD(_camPos, TIERS[quality.tier]);
    city.updateClouds(_camPos);
  }

  renderer.info.reset();
  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
  drawCalls = renderer.info.render.calls;
  triangles = renderer.info.render.triangles;

  input.endFrame();

  app.frames++;
  app.fpsClock += dtRaw;
  if (app.fpsClock >= 0.5) {
    const fps = Math.round(app.frames / app.fpsClock);
    app.fps = fps;
    app.drawCalls = drawCalls;
    app.triangles = triangles;
    if (SHOW_PERF) ui.perf(`${fps} fps · draw ${drawCalls} · ${TIERS[quality.tier].label} · ${BUILD}`);
    app.frames = 0;
    app.fpsClock = 0;
  }
}

/* ------------------------------------------------------------ time of day */
function cycleTime() {
  const { name, preset } = sky.next({ renderer, bloomPass, quality: TIERS[quality.tier] });
  ui.notice(preset.label, 1600);
  app.timeOfDay = name;
}
app.cycleTime = cycleTime;

/* -------------------------------------------------------------- quality */
function applyQuality(tier, notify) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.dpr));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = tier.shadows > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sky.setShadows(tier.shadows, tier.shadowRange);
  if (controller) for (const m of controller.meshes) m.castShadow = tier.shadows > 0;
  if (app.cityReady) city.setShadows(tier.shadows > 0);
  buildComposer(tier);
  sky.apply(sky.preset, { renderer, bloomPass, quality: tier });
  if (notify) ui.notice(`画质 · QUALITY ${tier.label}`, 1800);
  app.qualityName = tier.name;   // app.quality stays the QualityManager
}
app.setQuality = (t) => { quality.auto = false; quality.set(t); };

/* ---------------------------------------------------------------- resize */
let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIERS[quality.tier].dpr));
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setSize(w, h);
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      bloomPass?.setSize(size.x, size.y);
    }
  }, 60);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

/* ------------------------------------------------------ pause on inactivity */
document.addEventListener('visibilitychange', () => { if (document.hidden && app.phase === 'playing') pause(); });
window.addEventListener('blur', () => { if (app.phase === 'playing') pause(); });
canvas.addEventListener('click', () => {
  if (app.phase === 'paused') resume();
  else if (!IS_TOUCH && app.phase === 'playing' && !input.locked) input.requestLock();
});

/* ---------------------------------------------------------- error handling */
window.addEventListener('error', (e) => {
  console.error('[error]', e.error || e.message);
  if (app.phase !== 'fatal' && e.error) ui.fatal('运行时出错。A runtime error occurred.', String(e.error.stack || e.error));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason);
  if (app.phase !== 'fatal') ui.fatal('异步任务出错。An async task failed.', String(e.reason && e.reason.stack || e.reason));
});
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  cancelAnimationFrame(app.raf);
  app.running = false;
  ui.fatal('WebGL 上下文丢失，请重试。The WebGL context was lost. Please retry.', 'webglcontextlost');
});
canvas.addEventListener('webglcontextrestored', () => { location.reload(); });

/* ------------------------------------------------------------------ teardown */
function dispose() {
  if (app.disposed) return;
  app.disposed = true;
  cancelAnimationFrame(app.raf);
  app.running = false;
  window.removeEventListener('resize', onResize);
  input.dispose();
  touch?.dispose();
  controller?.dispose();
  city?.dispose();
  sky.dispose();
  loader.dispose();
  composer?.dispose?.();
  for (const m of (app.materials || new Map()).values()) {
    for (const k of ['map', 'emissiveMap', 'normalMap', 'metalnessMap', 'roughnessMap']) m[k]?.dispose();
    m.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
}
app.dispose = dispose;
window.addEventListener('pagehide', dispose);

/* ------------------------------------------------- deterministic sim hook */
/**
 * Advances physics, animation and the camera without rendering. Acceptance
 * tests use this so gameplay can be verified at a fixed timestep regardless of
 * how slowly the host happens to rasterise.
 */
const tapQueue = [];
app.testInput = {
  hold: (code) => { input.keys.add(code); },
  release: (code) => { input.keys.delete(code); },
  tap: (code) => { tapQueue.push(code); },
  rightClick: () => { tapQueue.push('__rmb'); },
  look: (yaw, pitch) => { if (yaw !== undefined) input.yaw = yaw; if (pitch !== undefined) input.pitch = pitch; },
  clear: () => { input.clear(); tapQueue.length = 0; },
};
app.simulate = (seconds, step = 1 / 60) => {
  const steps = Math.max(1, Math.round(seconds / step));
  const trace = { maxSpeed: 0, states: new Set(), teleports: 0, maxJump: 0, samples: [] };
  let prev = player.pos.clone();
  for (let i = 0; i < steps; i++) {
    const tap = tapQueue.shift();
    if (tap === '__rmb') input.mouseJust.right = true;
    else if (tap) { input.justPressed.add(tap); input.keys.add(tap); }
    player.update(step, input, { yaw: input.yaw, pitch: input.pitch });
    controller?.update(step, player);
    rig.update(step, player, input, controller);
    const moved = player.pos.distanceTo(prev);
    // a step longer than the speed cap allows means something teleported;
    // a deliberate fall recovery is not a teleport
    if (moved > TUNING.maxSpeed * step * 1.6 + 0.6 && !player.recovering) {
      trace.teleports++;
      trace.maxJump = Math.max(trace.maxJump, moved);
      trace.teleportAt = prev.toArray().map((v) => +v.toFixed(1));
    }
    if (player.recovering) trace.recoveries = (trace.recoveries || 0) + 1;
    if (player.pos.y < (trace.minY ?? Infinity)) { trace.minY = +player.pos.y.toFixed(1); trace.minYAt = player.pos.toArray().map((v) => Math.round(v)); }
    prev.copy(player.pos);
    trace.maxSpeed = Math.max(trace.maxSpeed, player.vel.length());
    trace.states.add(player.state);
    if (i % 10 === 0) trace.samples.push({ s: player.state, y: +player.pos.y.toFixed(1), v: +player.vel.length().toFixed(1) });
    if (tap && tap !== '__rmb') input.justPressed.delete(tap);
    input.endFrame();
  }
  trace.states = [...trace.states];
  trace.end = app.stats;
  return trace;
};

/* --------------------------------------------------- test / debug surface */
Object.assign(app, { THREE, renderer, scene, camera, input, player, rig, sky, ui, quality, boxes, caps, TUNING });
Object.defineProperty(app, 'controller', { get: () => controller });
Object.defineProperty(app, 'city', { get: () => city, configurable: true });
Object.defineProperty(app, 'stats', {
  get() {
    return {
      phase: app.phase, fps: app.fps, drawCalls: app.drawCalls, triangles: app.triangles,
      quality: quality.tier, timeOfDay: sky.preset, state: player.state,
      speedKmh: player.speedKmh, heightM: player.heightM,
      pos: player.pos.toArray().map((v) => +v.toFixed(2)),
      city: app.cityReady ? city.stats : null,
      character: controller?.stats || null,
      selected: app.selected || null,
      lockEverAcquired: app.lockEverAcquired,
      safePoints: player.safePoints.length,
      bootError: bootError ? String(bootError.message || bootError) : null,
    };
  },
});
console.info(`[CYBERPUNK MEGAPOLIS] ${BUILD} · renderer: ${detected.renderer} · tier ${quality.tier} · multiDraw ${caps.multiDraw} · touch ${IS_TOUCH}`);
