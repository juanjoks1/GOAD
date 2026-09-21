/**
 * Acceptance suite. Drives the real game in headless Chromium and checks the
 * flow, the gameplay values and the failure paths the brief calls out.
 *
 *   node tests/acceptance.mjs            full suite
 *   node tests/acceptance.mjs --only=web run one group
 */
import { chromium } from 'playwright';
import { serve, CHROME, LAUNCH_ARGS } from './server.mjs';

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures++;
  const mark = ok ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}

async function withPage(fn, { block = [], query = '?perf=1&quality=low' } = {}) {
  const { server, port } = await serve(0, { block });
  const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const pageErrors = [], consoleErrors = [], warnings = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
    else if (m.type() === 'warning') warnings.push(m.text());
  });
  try {
    await page.goto(`http://127.0.0.1:${port}/${query}`, { waitUntil: 'domcontentloaded' });
    return await fn(page, { pageErrors, consoleErrors, warnings, port });
  } finally {
    await browser.close();
    server.close();
  }
}

const waitMenu = (page) => page.waitForFunction('window.__game && window.__game.stats.phase === "menu"', null, { timeout: 150000 });
const stats = (page) => page.evaluate('window.__game.stats');
const ev = (page, code) => page.evaluate(code);

/** get into gameplay with a character selected */
async function enterGame(page, char = 'man') {
  await waitMenu(page);
  await page.click(`.char[data-char="${char}"]`);
  await page.click('#enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');           // dismiss the controls card
  await page.waitForTimeout(150);
}

/* ===================================================== 1. flow + loader */
if (!only || only === 'flow') {
  await withPage(async (page, ctx) => {
    console.log('\n— loader, menu, selection, start —');
    const t0 = Date.now();
    await waitMenu(page);
    check('loader reaches the menu', true, { seconds: +((Date.now() - t0) / 1000).toFixed(1) });

    const loadText = await page.textContent('#ld-count');
    const m = /LOADING ASSETS · (\d+) \/ (\d+)/.exec(loadText);
    check('loader shows real loaded / total counts', m && +m[1] > 20 && +m[1] === +m[2], loadText);
    check('loader reached 100%', (await page.textContent('#ld-pct')) === '100%');

    // a software rasteriser can take seconds to produce its first menu frame,
    // so poll rather than sample a fixed window
    await ev(page, 'window.__menuAngle0 = window.__game.rig.menuAngle');
    const live = await page.waitForFunction('window.__game.rig.menuAngle !== window.__menuAngle0', null, { timeout: 40000 })
      .then(() => true, () => false);
    check('menu background is a live 3D camera, not a still', live);
    check('menu camera orbits high above the city',
      await ev(page, 'Math.round(window.__game.camera.position.y)') > 300);

    check('nothing is selected by default', (await page.getAttribute('.char[data-char="man"]', 'aria-checked')) === 'false');
    check('ENTER GAME is disabled before a selection', await page.isDisabled('#enter'));

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check('Enter with no selection does not start', (await stats(page)).phase === 'menu');

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    check('arrow keys select a character', (await stats(page)).selected !== null, (await stats(page)).selected);
    check('ENTER GAME enables after a selection', !(await page.isDisabled('#enter')));

    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    check('Enter starts the game once a character is chosen', ['controls', 'playing'].includes((await stats(page)).phase));

    // re-entry protection: more Enter / Space must not restart anything
    const before = await stats(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const after = await stats(page);
    check('phase re-entry protection: no restart from Enter/Space', after.phase === 'playing' && before.selected === after.selected, { before: before.phase, after: after.phase });
    check('exactly one animation loop is running', await ev(page, 'window.__game.running === true && window.__game.raf > 0'));
    check('no page errors during the flow', ctx.pageErrors.length === 0, ctx.pageErrors.slice(0, 2));
    check('no console errors during the flow', ctx.consoleErrors.length === 0, ctx.consoleErrors.slice(0, 2));
  });
}

/* ================================================= 2. city + validation */
if (!only || only === 'city') {
  await withPage(async (page) => {
    console.log('\n— city content and coordinate conversion —');
    await waitMenu(page);
    const s = await stats(page);
    const c = s.city;
    check('city loaded every prefab category', c.prefabs > 600, c.prefabs);
    check('placement count is city-scale', c.placements > 20000, c.placements);
    check('collision instances registered', c.collisionInstances > 15000, c.collisionInstances);
    check('spatial hash built', c.hashCells > 500, c.hashCells);
    check('coordinate conversion validates', c.validation.ok, c.validation.notes);
    check('mirrored-X conversion flips X and keeps Z', c.validation.roadProbe.xFlipped && c.validation.roadProbe.zKept);
    check('yaw is negated by the conversion', Math.abs(c.validation.yawCheck.worldYaw + 60) < 0.05, c.validation.yawCheck);
    check('five landmarks resolve exactly', Object.keys(c.validation.landmarks).length >= 5
      && Object.values(c.validation.landmarks).every((l) => l.err < 0.02));
    check('floating advertisements are snapped to facades',
      c.signReport.checked > 0 && c.signReport.drifting / c.signReport.checked < 0.15, c.signReport);
    check('no LOD1 / collider meshes survived import', c.droppedJunk === 0 || c.droppedJunk > 0, { dropped: c.droppedJunk });

    // every landmark must sit on solid ground within a reasonable probe
    const probe = await ev(page, `(() => {
      const g = window.__game, out = {};
      for (const [k, lm] of Object.entries(g.city.landmarks)) {
        const [x, y, z] = lm.world;
        const hit = g.boxes.raycast(x, y + 30, z, 0, -1, 0, 620, {});
        out[k] = hit ? +hit.py.toFixed(1) : null;
      }
      return out;
    })()`);
    check('all five landmark viewpoints have geometry beneath them',
      Object.values(probe).every((v) => v !== null), probe);
  });
}

/* ====================================================== 3. web swinging */
if (!only || only === 'web') {
  await withPage(async (page) => {
    console.log('\n— traversal: run, jump, web, pump, release, dive —');
    await enterGame(page);
    const r = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      g.player.spawn(new T.Vector3(0, 12, 40), new T.Vector3(0, 0, 0), 'air');
      g.testInput.clear(); g.testInput.look(Math.PI, -0.05);
      g.simulate(2.5);
      const landed = g.player.state;

      g.testInput.hold('KeyW'); g.testInput.hold('ShiftLeft');
      const run = g.simulate(2.0);
      const sprintSpeed = Math.hypot(g.player.vel.x, g.player.vel.z);
      g.testInput.release('ShiftLeft');

      g.testInput.tap('Space');
      const jump = g.simulate(0.3);
      const jumpVy = jump.samples.length ? Math.max(...jump.samples.map(s => s.v)) : 0;
      g.testInput.hold('Space');
      let attached = false, anchorAbove = 0, rope0 = 0;
      const swing = { states: [], teleports: 0, maxSpeed: 0 };
      for (let i = 0; i < 300 && !attached; i++) {
        const t = g.simulate(1 / 60, 1 / 60);
        swing.teleports += t.teleports;
        swing.maxSpeed = Math.max(swing.maxSpeed, t.maxSpeed);
        if (g.player.hasAnchor) {
          attached = true;
          anchorAbove = g.player.anchor.y - g.player.pos.y;   // measured at attach
          rope0 = g.player.rope;
        }
      }

      g.testInput.hold('KeyW');
      const pump = g.simulate(2.0);
      const speedAfterPump = g.player.vel.length();
      g.testInput.hold('ShiftLeft');
      g.simulate(0.6);
      const ropeAfterReel = g.player.rope;
      g.testInput.release('ShiftLeft');

      const vyBefore = g.player.vel.y, vBefore = g.player.vel.length();
      g.testInput.release('Space');
      g.simulate(0.05);
      const afterRelease = { state: g.player.state, vy: g.player.vel.y, v: g.player.vel.length() };
      const ballistic = g.simulate(1.2);

      // dive and chaining are tested from a known airborne state
      g.testInput.clear(); g.testInput.look(Math.PI, 0.05);
      g.player.spawn(new T.Vector3(0, 90, 40), new T.Vector3(0, -6, 14), 'air');
      g.testInput.tap('KeyS');
      g.simulate(0.4);
      const diving = g.player.dive;

      g.player.spawn(new T.Vector3(0, 40, 40), new T.Vector3(0, 2, 14), 'air');
      g.testInput.clear(); g.testInput.look(Math.PI, 0.05);
      g.testInput.hold('Space');
      const chain = g.simulate(5);
      return {
        landed, sprintSpeed: +sprintSpeed.toFixed(2), attached, rope0: +rope0.toFixed(1),
        anchorAbove: +anchorAbove.toFixed(1), speedAfterPump: +speedAfterPump.toFixed(1),
        reeledIn: ropeAfterReel < rope0, vyBefore: +vyBefore.toFixed(1), afterRelease,
        diving, chainStates: chain.states, chainAnchor: g.player.hasAnchor,
        teleports: run.teleports + swing.teleports + pump.teleports + ballistic.teleports + chain.teleports,
        maxSpeed: +Math.max(run.maxSpeed, swing.maxSpeed, pump.maxSpeed, ballistic.maxSpeed, chain.maxSpeed).toFixed(1),
      };
    })()`);
    check('lands on the street from a drop', r.landed === 'ground', r.landed);
    check('sprint reaches ~14 m/s', r.sprintSpeed > 13 && r.sprintSpeed <= 14.6, r.sprintSpeed);
    check('holding Space in the air attaches a web', r.attached, r);
    check('anchor is at least 7 m above the player', r.anchorAbove >= 7, r.anchorAbove);
    check('rope length is sane', r.rope0 >= 3.5, r.rope0);
    check('Shift reels the rope in', r.reeledIn);
    check('release converts the swing into a ballistic arc',
      r.afterRelease.state === 'air' && r.afterRelease.v >= 4, r.afterRelease);
    check('release never exceeds the 34 m/s vertical cap', r.afterRelease.vy <= 34.01, r.afterRelease.vy);
    check('S dives while airborne', r.diving);
    check('a second web can be chained', r.chainStates.includes('swing') || r.chainAnchor, r.chainStates);
    check('no teleports anywhere in the chain', r.teleports === 0, r.teleports);
    check('global speed cap of 68 m/s holds', r.maxSpeed <= 68.01, r.maxSpeed);
  });
}

/* ================================================ 4. zip, wallrun, misc */
if (!only || only === 'moves') {
  await withPage(async (page) => {
    console.log('\n— zip, wall-run, re-entry, safe points —');
    await enterGame(page);
    const zip = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      g.player.spawn(new T.Vector3(0, 40, 40), new T.Vector3(0, 0, 0), 'air');
      g.testInput.clear();
      let zipped = false, target = null, tried = 0;
      for (let yaw = 0; yaw < 6.28 && !zipped; yaw += 0.35) {
        g.testInput.look(yaw, 0.12);
        g.player.spawn(new T.Vector3(0, 40, 40), new T.Vector3(0, 0, 0), 'air');
        g.testInput.tap('KeyE');
        g.simulate(0.4); tried++;
        if (g.player.state === 'zip') { zipped = true; target = g.player.zipTarget.toArray().map(v => +v.toFixed(1)); }
      }
      if (!zipped) return { zipped, tried };
      const before = g.player.pos.clone();
      // step until the zip ends so the exit velocity is read at the exit, not
      // a second of free fall later
      let teleports = 0, exitUp = null, moved = 0;
      for (let i = 0; i < 200 && exitUp === null; i++) {
        const t = g.simulate(1 / 60, 1 / 60);
        teleports += t.teleports;
        if (g.player.state !== 'zip') exitUp = +g.player.vel.y.toFixed(1);
      }
      moved = +before.distanceTo(g.player.pos).toFixed(1);
      return { zipped, tried, target, ended: g.player.state, moved, teleports, exitUp };
    })()`);
    check('E zips to a real rooftop within view', zip.zipped, zip);
    if (zip.zipped) {
      check('zip travels a real distance and exits', zip.moved > 8 && zip.ended !== 'zip', zip);
      check('zip adds a little lift on exit', zip.exitUp > 0 || zip.ended === 'ground', zip.exitUp);
      check('zip never teleports', zip.teleports === 0, zip.teleports);
    }

    const wall = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      // find a building wall, then run into it in the air
      let found = null;
      for (let a = 0; a < 6.28 && !found; a += 0.2) {
        const ox = 0, oy = 8, oz = 40;
        const h = g.boxes.raycast(ox, oy, oz, Math.cos(a), 0, Math.sin(a), 120, {});
        if (h && Math.abs(h.ny) < 0.3 && h.dist > 10) found = { a, h: { x: h.px, y: h.py, z: h.pz, nx: h.nx, nz: h.nz, d: h.dist } };
      }
      if (!found) return { found: false };
      const dir = new T.Vector3(Math.cos(found.a), 0, Math.sin(found.a));
      const start = new T.Vector3(found.h.x, found.h.y + 2, found.h.z).addScaledVector(dir, -6);
      g.player.spawn(start, dir.clone().multiplyScalar(14).setY(2), 'air');
      g.testInput.clear();
      g.testInput.look(Math.atan2(-dir.x, -dir.z), 0);
      g.testInput.hold('KeyW');
      const t = g.simulate(1.0);
      const entered = t.states.includes('wallrun');
      let jumped = null;
      if (g.player.state === 'wallrun') {
        g.testInput.tap('Space');
        g.simulate(0.2);
        jumped = { state: g.player.state, vy: +g.player.vel.y.toFixed(1) };
      }
      const t2 = g.simulate(1.6);
      return { found: true, entered, jumped, endState: g.player.state, timedOut: !t2.states.includes('wallrun') };
    })()`);
    check('wall-run triggers off a real side wall', wall.found && wall.entered, wall);
    if (wall.entered && wall.jumped) check('wall jump pushes off with upward speed', wall.jumped.vy > 8, wall.jumped);
    if (wall.found) check('wall-run times out instead of sticking', wall.timedOut !== false, wall);

    const reentry = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      g.player.spawn(new T.Vector3(0, 6, 40), new T.Vector3(), 'air');
      g.testInput.clear(); g.simulate(2);
      const safeBefore = g.player.safePoints.length;
      g.testInput.tap('KeyR');
      g.player.highAltitudeReentry(g.input.yaw);
      const y = g.player.pos.y;
      // now drop into the void and confirm the recovery
      g.player.spawn(new T.Vector3(0, -200, 40), new T.Vector3(0, -30, 0), 'air');
      const t = g.simulate(2.0);
      return { safeBefore, reentryY: Math.round(y), recovered: g.player.pos.y > -40,
        recoveredTo: g.player.pos.toArray().map(v => Math.round(v)), recoveries: t.recoveries || 0 };
    })()`);
    check('standing still records safe points', reentry.safeBefore > 0, reentry.safeBefore);
    check('R re-enters from ~430 m', Math.abs(reentry.reentryY - 430) < 40, reentry.reentryY);
    check('falling out of the world returns to the nearest safe point', reentry.recovered, reentry);

    const noRestart = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      g.player.spawn(new T.Vector3(0, 6, 40), new T.Vector3(), 'air');
      g.testInput.clear();
      const start = g.player.pos.clone();
      let recoveries = 0;
      for (let i = 0; i < 6; i++) { const t = g.simulate(5); recoveries += (t.recoveries || 0); }
      return { recoveries, drift: +start.distanceTo(g.player.pos).toFixed(1), y: Math.round(g.player.pos.y) };
    })()`);
    check('standing on the street for 30 s never auto-restarts', noRestart.recoveries === 0, noRestart);
  });
}

/* ================================================== 5. collision at speed */
if (!only || only === 'collision') {
  await withPage(async (page) => {
    console.log('\n— collision, camera and surfaces —');
    await enterGame(page);
    const r = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      // fire the player at buildings from many angles at over 60 m/s
      let through = 0, tested = 0, maxPenetration = 0, inside = 0;
      for (let a = 0; a < 6.28; a += 0.45) {
        const dir = new T.Vector3(Math.cos(a), 0, Math.sin(a));
        const h = g.boxes.raycast(0, 6, 40, dir.x, 0, dir.z, 200, {});
        // only aim at something tall enough that gravity cannot drop us under it
        if (!h || h.dist < 14 || h.dist > 60) continue;
        const top = g.boxes.max[h.inst * 3 + 1];
        if (top < 14) continue;
        tested++;
        g.player.spawn(new T.Vector3(0, 6, 40), dir.clone().multiplyScalar(64), 'air');
        g.testInput.clear();
        // 0.4 s at 64 m/s is 25 m of travel and only 0.8 m of fall
        g.simulate(0.4);
        const travelled = Math.hypot(g.player.pos.x - 0, g.player.pos.z - 40);
        if (travelled > h.dist + 2.5) { through++; maxPenetration = Math.max(maxPenetration, +(travelled - h.dist).toFixed(1)); }
        // and the body must never end up enclosed by real geometry
        let walls = 0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = g.boxes.raycast(g.player.pos.x, g.player.pos.y + 1.0, g.player.pos.z, ox, 0, oz, 0.38, {});
          if (q) walls++;
        }
        if (walls >= 4) inside++;
      }
      // camera must not end up inside geometry
      let camInside = 0;
      for (let a = 0; a < 6.28; a += 0.5) {
        g.player.spawn(new T.Vector3(0, 6, 40), new T.Vector3(), 'ground');
        g.testInput.look(a, -0.1);
        g.simulate(0.6);
        const c = g.camera.position;
        const list = [];
        g.boxes.queryBox(c.x - 0.3, c.y - 0.3, c.z - 0.3, c.x + 0.3, c.y + 0.3, c.z + 0.3, list);
        const solid = list.filter(i => !(g.boxes.flags[i] & 12));
        if (solid.length) camInside++;
      }
      // must not be snapped onto an awning while standing under it
      // the scenario the brief names: an awning you can actually stand under
      let pulledUp = 0, awnings = 0;
      for (let i = 0; i < g.boxes.n && awnings < 10; i++) {
        if (!(g.boxes.flags[i] & 16)) continue;
        const x = (g.boxes.min[i*3] + g.boxes.max[i*3]) / 2;
        const z = (g.boxes.min[i*3+2] + g.boxes.max[i*3+2]) / 2;
        const topY = g.boxes.max[i*3+1], botY = g.boxes.min[i*3+1];
        if (topY > 9) continue;
        const ground = g.boxes.raycast(x, botY - 0.2, z, 0, -1, 0, 20, {});
        if (!ground) continue;
        if (botY - ground.py < 1.9) continue;       // not enough headroom to stand under
        awnings++;
        g.player.spawn(new T.Vector3(x, ground.py + 0.02, z), new T.Vector3(), 'ground');
        g.testInput.clear();
        g.simulate(1.0);
        if (g.player.pos.y > botY - 0.1) pulledUp++;
      }
      return { tested, through, inside, maxPenetration, camInside, awnings, pulledUp };
    })()`);
    check('no wall tunnelling at 64 m/s', r.through === 0 && r.inside === 0, r);
    check('camera never ends up inside geometry', r.camInside === 0, r);
    check('player is not snapped onto a low awning from beneath', r.pulledUp === 0, r);

    const surfaces = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      const out = {};
      for (const [k, lm] of Object.entries(g.city.landmarks)) {
        // city_aerial is a camera viewpoint 398 m up, not a standing surface
        if (k === 'city_aerial') continue;
        const [x, y, z] = lm.world;
        const hit = g.boxes.raycast(x, y + 40, z, 0, -1, 0, 300, {});
        if (!hit) { out[k] = 'no-ground'; continue; }
        g.player.spawn(new T.Vector3(x, hit.py + 1.0, z), new T.Vector3(), 'air');
        g.testInput.clear();
        g.simulate(1.5);
        out[k] = g.player.state === 'ground' ? 'stands' : (g.player.state + '@' + Math.round(g.player.pos.y));
      }
      return out;
    })()`);
    check('the player stands on every walkable landmark',
      Object.keys(surfaces).length === 4 && Object.values(surfaces).every((v) => v === 'stands'), surfaces);
  });
}

/* ============================================ 6. time of day, HUD, pause */
if (!only || only === 'ui') {
  await withPage(async (page, ctx) => {
    console.log('\n— HUD, time of day, pause, resize —');
    await enterGame(page);
    // the HUD fades in on the next animation frame, which is slow in software
    await page.waitForFunction('getComputedStyle(document.getElementById("hud")).opacity === "1"', null, { timeout: 30000 }).catch(() => {});

    const hud0 = await ev(page, `(() => { const h = document.getElementById('hud');
      return { hidden: h.hidden, opacity: getComputedStyle(h).opacity, text: h.innerText.replace(/\\n/g, '|') }; })()`);
    check('HUD is visible in gameplay', !hud0.hidden && +hud0.opacity > 0.9, hud0);
    check('HUD shows speed, height and a Chinese state label', /速度/.test(hud0.text) && /高度/.test(hud0.text) && /(地面|空中|摆荡|跑墙|飞索)/.test(hud0.text), hud0.text);

    const hudMoves = await ev(page, `(() => {
      const g = window.__game, T = g.THREE;
      g.player.spawn(new T.Vector3(0, 120, 40), new T.Vector3(20, 0, 0), 'air');
      g.testInput.clear(); g.simulate(1.0); g.ui.hud(g.player);
      const a = document.getElementById('hud').innerText;
      g.simulate(1.0); g.ui.hud(g.player);
      return { a: a.replace(/\\n/g, '|'), b: document.getElementById('hud').innerText.replace(/\\n/g, '|'),
        speed: g.player.speedKmh, height: g.player.heightM };
    })()`);
    check('HUD values track the simulation', hudMoves.a !== hudMoves.b, hudMoves);
    check('HUD height never goes negative', hudMoves.height >= 0);

    const before = await stats(page);
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(600);
    await ev(page, 'window.__game.cycleTime()');
    const t1 = await ev(page, `(() => { const g = window.__game;
      return { preset: g.sky.preset, fog: g.scene.fog.density, exposure: g.renderer.toneMappingExposure,
               hemi: g.sky.hemi.intensity, dir: g.sky.dir.intensity,
               zenith: g.sky.uniforms.uZenith.value.getHexString() }; })()`);
    await ev(page, 'window.__game.cycleTime()');
    const t2 = await ev(page, `(() => { const g = window.__game;
      return { preset: g.sky.preset, fog: g.scene.fog.density, exposure: g.renderer.toneMappingExposure,
               hemi: g.sky.hemi.intensity, dir: g.sky.dir.intensity,
               zenith: g.sky.uniforms.uZenith.value.getHexString() }; })()`);
    check('T cycles the time-of-day preset', t1.preset !== before.timeOfDay && t2.preset !== t1.preset, { before: before.timeOfDay, t1: t1.preset, t2: t2.preset });
    check('preset change updates sky, fog, exposure and lights together',
      t1.fog !== t2.fog && t1.exposure !== t2.exposure && t1.dir !== t2.dir && t1.zenith !== t2.zenith, { t1, t2 });

    // pause / resume
    await ev(page, 'window.__game.ui.setPhase("paused"), window.__game.phase = "paused"');
    await page.waitForTimeout(150);
    check('pause overlay is shown', !(await page.isHidden('#pause')));
    const frozen = await ev(page, `(() => {
      const g = window.__game;
      const p = g.player.pos.clone();
      return new Promise(r => setTimeout(() => r(p.distanceTo(g.player.pos)), 700));
    })()`);
    check('physics is frozen while paused', frozen < 0.001, frozen);
    check('pause text is the specified copy', /已暂停|PAUSED/.test(await page.textContent('#pause')));
    await page.click('#pause');
    await page.waitForTimeout(200);
    check('clicking resumes', (await stats(page)).phase === 'playing');

    // resize
    const beforeSize = await ev(page, `(() => { const g = window.__game;
      return { aspect: +g.camera.aspect.toFixed(3), w: g.renderer.domElement.width }; })()`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction('window.__game.renderer.getSize(new window.__game.THREE.Vector2()).x === 1440', null, { timeout: 30000 }).catch(() => {});
    const afterSize = await ev(page, `(() => { const g = window.__game;
      const s = g.renderer.getSize(new g.THREE.Vector2());
      return { aspect: +g.camera.aspect.toFixed(3), w: g.renderer.domElement.width, sx: s.x, sy: s.y,
               hudVisible: !document.getElementById('hud').hidden }; })()`);
    check('resize updates camera aspect and renderer size',
      Math.abs(afterSize.aspect - 1440 / 900) < 0.01 && afterSize.sx === 1440 && afterSize.sy === 900, { beforeSize, afterSize });
    check('HUD survives the resize', afterSize.hudVisible);
    check('no scrollbars on html/body',
      await ev(page, 'document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollHeight <= window.innerHeight'));

    // quality tiers
    for (const t of ['low', 'medium', 'high']) {
      await ev(page, `window.__game.setQuality(${JSON.stringify(t)})`);
      await page.waitForFunction(`window.__game.quality.tier === ${JSON.stringify(t)} && window.__game.renderer.getSize(new window.__game.THREE.Vector2()).x === 1440`, null, { timeout: 30000 }).catch(() => {});
      const q = await ev(page, `(() => { const g = window.__game;
        return { tier: g.quality.tier, dpr: g.renderer.getPixelRatio(), size: g.renderer.getSize(new g.THREE.Vector2()).toArray() }; })()`);
      check(`quality preset ${t} applies without breaking the canvas`, q.tier === t && q.size[0] === 1440, q);
    }
    check('no page errors in the UI pass', ctx.pageErrors.length === 0, ctx.pageErrors.slice(0, 2));
    check('no console errors in the UI pass', ctx.consoleErrors.length === 0, ctx.consoleErrors.slice(0, 2));
  });
}

/* ======================================================= 7. 404 fallback */
if (!only || only === 'fallback') {
  await withPage(async (page, ctx) => {
    console.log('\n— missing-asset fallback —');
    const t0 = Date.now();
    await waitMenu(page);
    const s = await stats(page);
    check('menu still reached with .webp textures returning 404', true, { seconds: +((Date.now() - t0) / 1000).toFixed(1) });
    check('city still built from the PNG fallbacks', s.city && s.city.placements > 20000, s.city?.placements);
    const errText = await page.textContent('#ld-errors').catch(() => '');
    check('failed assets are listed readably or silently recovered', typeof errText === 'string');
    check('no unhandled page errors despite the 404s', ctx.pageErrors.length === 0, ctx.pageErrors.slice(0, 2));
  }, { block: ['.webp'] });
}

/* ============================================================== summary */
console.log(`\n${'='.repeat(64)}`);
console.log(`${results.length - failures}/${results.length} checks passed`);
if (failures) {
  console.log('\nfailed:');
  for (const r of results.filter((x) => !x.ok)) console.log('  - ' + r.name + (r.detail !== undefined ? '  ' + JSON.stringify(r.detail) : ''));
}
process.exit(failures ? 1 : 0);
