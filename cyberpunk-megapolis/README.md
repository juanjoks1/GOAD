# CYBERPUNK MEGAPOLIS — Web-Swing Edition

A third-person cyberpunk city web-swinging game that runs directly in the
browser. No build step, no framework, no runtime CDN: serve the folder with any
static file server and open it.

```bash
cd cyberpunk-megapolis
python3 -m http.server 8080      # or: npx serve, or: npm run serve
# open http://127.0.0.1:8080/
```

### On a phone

Two ways, both supported:

**1. One file, no server.** `dist/cyberpunk-megapolis.html` is the entire game —
scripts, models, textures and fonts inlined — in a single 8.5 MB HTML file.
Copy it to the phone, open it from Downloads, and it runs off `file://` with no
server at all. Rebuild it with `node tools/build_single.mjs`.

**2. Over your Wi-Fi.** Run `npm run serve` on a computer on the same network
and open `http://<computer-ip>:8080/` on the phone. This is the better option
if you are iterating, since nothing has to be rebuilt.

Touch controls appear automatically on a touch device: the **left half** of the
screen is a floating stick that follows your thumb, the **right half** is a
look-drag surface, and the buttons on the right are 蛛丝 WEB (tap to jump, hold
to fire and hold a web), 冲刺 SPRINT, 俯冲 DIVE and 飞索 ZIP, with 重入 / 时段 /
暂停 along the top. Landscape is strongly preferred — portrait says so. Phones
start on the `mobile` quality tier (DPR 1, no shadows, shorter detail distance);
the watchdog climbs if the device turns out to be fast.

WASD move · mouse look · **Space** tap to jump, hold in the air to fire and hold
a web, release to let go · **W** pump at the bottom of a swing · **A/D** steer ·
**Shift** sprint / reel in · **S** dive · **E** or right mouse zip to a rooftop ·
**R** re-enter from altitude · **T** time of day · **Esc** pause.

Query parameters: `?perf=0` hides the developer overlay,
`?quality=mobile|low|medium|high` pins a quality tier instead of auto-detecting.

---

## What is here

```
index.html  styles.css  main.js          entry point, render pipeline, phase machine
player.js                                physics state machine (ground/air/swing/wallrun/zip)
controller.js                            skinned character, animation state machine, web strand
cameraRig.js                             cinematic third-person camera
input.js                                 keys, edges, pointer lock, yaw/pitch
cityBoxes.js                             100 m spatial hash + real-geometry raycaster
src/       assets.js city.js sky.js ui.js quality.js touch.js
dist/      cyberpunk-megapolis.html  (single-file build, runs from file://)
data/      materials.json prefabs.json scales.json scene.json
           sign_fixes.json fbx_mat_order.json textures_webp.json characters.json
glb/       Background Car Combined_Building Decals Environment
           Facade_Details Metro Modules Street   (Draco-compressed)
chars/     survival_man.glb survival_girl.glb    (skinned, Draco, 10 clips each)
textures/  32 textures as WebP + PNG fallback
fonts/     Geist Mono (SIL OFL)
vendor/    three.js r169 + GLTFLoader, DRACOLoader, BufferGeometryUtils,
           EffectComposer, RenderPass, UnrealBloomPass, OutputPass, Draco decoder
tools/     offline asset generators (never needed to run the game)
tests/     Playwright acceptance suite
```

## Assets

The reference site's own city, character and texture assets were not reachable
from this environment and are not license-clear to redistribute, so **every
asset here is generated from scratch** by the scripts in `tools/` and is
original work under this repository's licence. The generators are deterministic
— same seed, same city — and everything they produce is committed, so the game
needs no build step:

```bash
npm install          # only for the generators + tests
npm run gen          # textures -> prefabs -> scene -> characters
npm run build:single # dist/cyberpunk-megapolis.html
```

| | count |
|---|---|
| prefab templates | 625 across 9 Draco GLB categories |
| material categories → GPU render groups | 93 → 41 |
| placements | ~31 000 (2 750 buildings, ~7 700 platform props, ~2 000 strip fillers) |
| unique geometry | ~83 k triangles (instanced, so the city costs ~2.6 M drawn) |
| character | 21 bones, 24 material categories, 10 authored clips |
| textures | 32, WebP with PNG fallback, ~0.6 MB of WebP |

City density, the dusk palette, neon intensity, character silhouettes and the
movement pacing follow the brief; the individual models do not copy the
reference's assets because they could not be obtained.

## How it is put together

**Coordinate conversion.** `data/scene.json` stores placements in source
(left-handed) space. Every one is converted at load with position `(-x, y, z)`,
quaternion `(x, -y, -z, w)`, scale unchanged. `validateConversion()` re-derives
all five landmarks plus a road-direction probe and a yaw check, so a mirrored
city or a backwards character fails loudly at load instead of looking subtly
wrong. The acceptance suite asserts it.

**Rendering.** One `BatchedMesh` per (tile, render group, LOD class). Geometry is
stored once per tile however often a prefab repeats, tiles frustum-cull as whole
objects, and per-category tints ride along as per-instance colours — which is
why 93 material categories collapse to 41 GPU materials and the city renders in
roughly 250–430 draw calls. Beyond the structure distance each tile falls back
to a single batched box shell, and the far skyline is fog-bound silhouettes.

**Materials.** `data/materials.json` drives everything. `ms` entries are Unity
MetallicSmoothness maps: the runtime repacks R → metalness and (1 − A) →
roughness into glTF ORM layout on a canvas at load. Albedo and emissive are
tagged sRGB; normal and ORM maps stay linear. Prefab UVs are baked in metres and
a material's `uvScale` becomes `texture.repeat`, so texel density is constant
whatever prefab a material lands on.

**Collision.** World AABBs in a 100 m spatial hash are broad phase only. Wall
pushback, web anchors and zip targets are all confirmed against real triangles
(Möller–Trumbore in the instance's local space). Ground detection casts five
foot probes down from the *previous* frame's height, so a floor crossed inside
one frame at 60 m/s is still caught, and a surface only counts if the body
actually passed through it from above or it is a step within 0.5 m — which is
what stops the player being snapped onto an awning they are standing under.
Before any AABB pushback, two inward probes at knee and chest height test for
real geometry; if neither hits, the structure is hollow and the player passes
through instead of hitting an invisible wall.

**Animation.** Clips are cleaned on load: scale tracks are dropped outright,
position tracks are dropped for every bone except the pelvis, and the pelvis
itself is stripped on the airborne, swing and roll clips so authored root motion
never fights the solver. Sprint reuses the run cycle at 1.3× as specified. The
web strand is six thin cylinders along a quadratic Bézier from the correct hand
bone, sagging by `0.6 + slack × 14`.

## Known limitations

- **Shadows** are a quality-tier knob and are modest by design: the sun's shadow
  camera is a small box that follows the player. At dusk in a fog-heavy neon
  city they contribute little, so the low tier drops them entirely.
- **Touch is supported but landscape-only in practice.** Portrait fits the UI
  but leaves too little width to read the city, so the menu asks you to rotate.
- **`WEBGL_multi_draw`** makes `BatchedMesh` a single draw per batch. Without it
  three.js falls back to a per-range loop; the game detects this, says so in the
  compatibility notice and shortens the detail distance to compensate.
- The **30-second loader fail-safe** opens the menu with whatever finished. The
  remaining assets keep loading in the background.

## Tests

```bash
npm test                      # full acceptance suite
node tests/acceptance.mjs --only=web
node tests/play.mjs           # traversal probe with the deterministic sim hook
node tests/look.mjs high      # screenshots into /tmp
node tests/mobile.mjs         # phone emulation: touch, orientation, tiers
node tests/singlefile.mjs     # opens dist/*.html over file:// like a phone does
```

The suite drives the real game in headless Chromium: loader → menu → selection →
start, phase re-entry protection, keyboard handling, HUD values, R re-entry and
fall recovery, T preset cycling, pause/resume, resize, quality tiers and a
`.webp`-returns-404 run that must still reach the menu on PNG fallbacks. It
fails the run on any `pageerror` or console error. `tests/mobile.mjs` does the
same for touch, and `tests/singlefile.mjs` proves the one-file build really
works off `file://`.

Because headless Chromium rasterises in software at about 1 fps, gameplay is
verified through `window.__game.simulate(seconds)`, which advances physics,
animation and the camera at a fixed timestep without rendering.
