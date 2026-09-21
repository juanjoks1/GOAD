import { chromium } from 'playwright';
import { serve, CHROME, LAUNCH_ARGS } from './server.mjs';
const { server, port } = await serve();
const b = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
const page = await b.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message.split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 160)); });
await page.goto(`http://127.0.0.1:${port}/?perf=0&quality=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.stats.phase === "menu"', null, { timeout: 120000 });
await page.click('.char[data-char="man"]');
await page.click('#enter');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);

const run = (code) => page.evaluate(code);

console.log('--- land on the street first ---');
console.log(JSON.stringify(await run(`(() => {
  const g = window.__game;
  g.player.spawn(new g.THREE.Vector3(0, 12, 40), new g.THREE.Vector3(0,0,0), 'air');
  g.testInput.clear(); g.testInput.look(Math.PI, -0.05);
  const t = g.simulate(3);
  return { states: t.states, teleports: t.teleports, end: { s: t.end.state, y: t.end.heightM, pos: t.end.pos, safe: t.end.safePoints } };
})()`)));

console.log('--- ground run + sprint ---');
console.log(JSON.stringify(await run(`(() => {
  const g = window.__game;
  g.testInput.hold('KeyW'); g.testInput.hold('ShiftLeft');
  const t = g.simulate(2.5);
  return { states: t.states, maxSpeed: +t.maxSpeed.toFixed(2), teleports: t.teleports, end: { s: t.end.state, kmh: t.end.speedKmh, pos: t.end.pos, safe: t.end.safePoints } };
})()`)));

console.log('--- jump then hold Space to web ---');
console.log(JSON.stringify(await run(`(() => {
  const g = window.__game;
  g.testInput.tap('Space');
  const a = g.simulate(0.4);
  g.testInput.hold('Space');
  const t = g.simulate(4.5);
  return { statesA: a.states, states: t.states, maxSpeed: +t.maxSpeed.toFixed(2), teleports: t.teleports, maxJump: +t.maxJump.toFixed(2),
    anchor: g.player.hasAnchor, rope: +g.player.rope.toFixed(1), hand: g.player.webHand,
    tried: g.player.debug.anchorsTried, rejected: g.player.debug.anchorRejected,
    end: { s: t.end.state, kmh: t.end.speedKmh, y: t.end.heightM } };
})()`)));

console.log('--- pump / steer / reel, then release ---');
console.log(JSON.stringify(await run(`(() => {
  const g = window.__game;
  g.testInput.hold('KeyW'); g.testInput.hold('KeyD');
  const t1 = g.simulate(1.6);
  g.testInput.release('KeyD'); g.testInput.hold('ShiftLeft');
  const t2 = g.simulate(1.0);
  const before = { rope: +g.player.rope.toFixed(1), v: +g.player.vel.length().toFixed(1), y: +g.player.pos.y.toFixed(1) };
  g.testInput.release('Space');
  const t3 = g.simulate(1.6);
  return { swing: t1.states, reel: t2.states, after: t3.states, before,
    afterRelease: { s: g.player.state, v: +g.player.vel.length().toFixed(1), vy: +g.player.vel.y.toFixed(1), y: +g.player.pos.y.toFixed(1) },
    teleports: t1.teleports + t2.teleports + t3.teleports, maxSpeed: +Math.max(t1.maxSpeed, t2.maxSpeed, t3.maxSpeed).toFixed(2) };
})()`)));

console.log('--- dive, then chain another web ---');
console.log(JSON.stringify(await run(`(() => {
  const g = window.__game;
  g.testInput.release('KeyW'); g.testInput.release('ShiftLeft'); g.testInput.release('Space');
  g.testInput.tap('Space'); g.simulate(0.4); g.testInput.tap('KeyS');
  const d = g.simulate(0.8);
  const diving = g.player.dive;
  g.testInput.hold('Space');
  const t = g.simulate(3.0);
  return { dive: diving, states: t.states, anchor: g.player.hasAnchor, teleports: t.teleports,
    maxSpeed: +t.maxSpeed.toFixed(2), end: { s: t.end.state, kmh: t.end.speedKmh, y: t.end.heightM } };
})()`)));

console.log('--- long soak: 60 s of continuous swinging ---');
console.log(JSON.stringify(await run(`(() => {
  const g = window.__game;
  g.testInput.clear(); g.testInput.hold('KeyW');
  g.testInput.tap('Space'); g.simulate(0.3); g.testInput.hold('Space');
  let teleports = 0, maxSpeed = 0; const states = new Set(); let attaches = 0, wasAnchored = false, minY = 1e9;
  for (let i = 0; i < 12; i++) {
    const t = g.simulate(5);
    minY = Math.min(minY, t.minY);
    // if we ended up back on the street, jump again and keep going
    if (g.player.state === 'ground') { g.testInput.release('Space'); g.simulate(0.15); g.testInput.tap('Space'); g.simulate(0.3); g.testInput.hold('Space'); }
    teleports += t.teleports; maxSpeed = Math.max(maxSpeed, t.maxSpeed);
    t.states.forEach(s => states.add(s));
    if (g.player.hasAnchor && !wasAnchored) attaches++;
    wasAnchored = g.player.hasAnchor;
    if (i % 3 === 2) { g.testInput.release('Space'); g.simulate(0.5); g.testInput.hold('Space'); }
  }
  return { states: [...states], teleports, maxSpeed: +maxSpeed.toFixed(2), attaches, minY: Math.round(minY),
    pos: g.player.pos.toArray().map(v => Math.round(v)), safe: g.player.safePoints.length,
    y: Math.round(g.player.pos.y) };
})()`)));

await b.close(); server.close();
