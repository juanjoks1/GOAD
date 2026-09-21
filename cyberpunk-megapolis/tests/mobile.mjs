/** Phone emulation: touch controls, orientation handling and mobile quality. */
import { chromium, devices } from 'playwright';
import { serve, CHROME, LAUNCH_ARGS } from './server.mjs';

const { server, port } = await serve();
const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
const ctx = await browser.newContext({
  ...devices['Pixel 5 landscape'],
  hasTouch: true, isMobile: true,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CERR ' + m.text()); });

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? '  ok  ' : ' FAIL '} ${n}${d !== undefined ? '  ' + JSON.stringify(d) : ''}`); };

await page.goto(`http://127.0.0.1:${port}/?perf=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.stats.phase === "menu"', null, { timeout: 180000 });

const env = await page.evaluate(`(() => ({
  touch: window.__game.isTouch, tier: window.__game.quality.tier,
  coarse: matchMedia('(pointer: coarse)').matches,
  vw: innerWidth, vh: innerHeight, dpr: window.__game.renderer.getPixelRatio(),
}))()`);
check('touch device detected', env.touch, env);
check('mobile quality tier selected', env.tier === 'mobile', env.tier);
check('pixel ratio capped at 1 on mobile', env.dpr <= 1.01, env.dpr);
check('menu note tells the player touch works', /触屏|横屏/.test(await page.textContent('#touch-note')));

await page.tap('.char[data-char="girl"]');
await page.waitForTimeout(150);
check('tapping selects a character', (await page.getAttribute('.char[data-char="girl"]', 'aria-checked')) === 'true');
check('ENTER GAME enabled after a tap', !(await page.isDisabled('#enter')));
await page.tap('#enter');
await page.waitForTimeout(250);
await page.tap('#controls-close');
await page.waitForTimeout(300);

check('touch overlay is visible in gameplay', !(await page.isHidden('#touch')));
check('no pointer lock was requested on touch', await page.evaluate('document.pointerLockElement === null'));
const btns = await page.$$eval('#touch [data-key]', (n) => n.map((b) => b.dataset.key));
check('all action buttons are present', ['Space', 'ShiftLeft', 'KeyS', 'KeyE', 'KeyR', 'KeyT', '__pause'].every((k) => btns.includes(k)), btns);

// the stick
await page.evaluate(`(() => { const g = window.__game, T = g.THREE;
  g.player.spawn(new T.Vector3(0, 6, 40), new T.Vector3(), 'ground'); g.testInput.clear(); g.simulate(1); })()`);
const box = await page.evaluate('({ w: innerWidth, h: innerHeight })');
await page.touchscreen.tap(box.w * 0.2, box.h * 0.7);       // wake the stick zone
const stick = await page.evaluate(`(async () => {
  const g = window.__game;
  const zone = document.querySelector('.t-left');
  const r = zone.getBoundingClientRect();
  const cx = r.left + r.width * 0.4, cy = r.top + r.height * 0.7;
  const send = (type, x, y, id = 1) => zone.dispatchEvent(new PointerEvent(type, {
    pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true, buttons: 1 }));
  send('pointerdown', cx, cy);
  send('pointermove', cx, cy - 70);
  const axis = g.input.moveAxis();
  const stickVisible = !document.querySelector('.t-stick').hidden;
  const before = g.player.pos.clone();
  g.simulate(1.2);
  const moved = before.distanceTo(g.player.pos);
  send('pointerup', cx, cy - 70);
  const axisAfter = g.input.moveAxis();
  return { axis, stickVisible, moved: +moved.toFixed(2), axisAfter, state: g.player.state };
})()`);
check('stick appears under the thumb', stick.stickVisible);
check('stick produces a forward axis', Math.abs(stick.axis.z) > 0.5, stick.axis);
check('stick actually moves the player', stick.moved > 3, stick);
check('releasing the stick stops the player', stick.axisAfter.x === 0 && stick.axisAfter.z === 0, stick.axisAfter);

// look drag
const look = await page.evaluate(`(() => {
  const g = window.__game;
  const zone = document.querySelector('.t-right');
  const r = zone.getBoundingClientRect();
  const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.5;
  const send = (type, x, y) => zone.dispatchEvent(new PointerEvent(type, {
    pointerId: 2, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true, buttons: 1 }));
  const yaw0 = g.input.yaw, pitch0 = g.input.pitch;
  send('pointerdown', cx, cy);
  send('pointermove', cx + 120, cy - 40);
  send('pointerup', cx + 120, cy - 40);
  return { dYaw: +(g.input.yaw - yaw0).toFixed(3), dPitch: +(g.input.pitch - pitch0).toFixed(3) };
})()`);
check('look drag turns the camera', Math.abs(look.dYaw) > 0.1, look);
check('look drag pitches the camera', Math.abs(look.dPitch) > 0.05, look);

// web button
const web = await page.evaluate(`(() => {
  const g = window.__game, T = g.THREE;
  g.testInput.clear();
  g.testInput.look(Math.PI, 0.05);
  g.player.spawn(new T.Vector3(0, 14, 40), new T.Vector3(0, 4, 12), 'air');
  const btn = document.querySelector('.t-btn.t-web');
  btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, bubbles: true, pointerType: 'touch' }));
  const held = g.input.down('Space');
  const t = g.simulate(5);
  const swung = t.states.includes('swing');
  btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true, pointerType: 'touch' }));
  const released = g.input.down('Space');
  return { held, swung, released, states: t.states, lit: btn.classList.contains('on') === false };
})()`);
check('WEB button holds the Space key down', web.held);
check('WEB button fires a real web', web.swung, web.states);
check('releasing the WEB button clears the key', !web.released);

// pause button
const pauseTap = await page.evaluate(`(() => {
  const btn = document.querySelector('.t-mini[data-key="__pause"]');
  const r = btn.getBoundingClientRect();
  btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true, pointerType: 'touch',
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true, pointerType: 'touch' }));
  return { phase: window.__game.stats.phase, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width)] };
})()`);
await page.waitForTimeout(250);
check('pause button pauses', (await page.evaluate('window.__game.stats.phase')) === 'paused', pauseTap);
check('touch overlay hides while paused', await page.isHidden('#touch'));
await page.evaluate(`document.getElementById('pause').click()`);
await page.waitForTimeout(250);
check('tapping the overlay resumes', (await page.evaluate('window.__game.stats.phase')) === 'playing');
check('touch overlay returns on resume', !(await page.isHidden('#touch')));

await page.screenshot({ path: '/tmp/m_land.png' });

// portrait
await page.setViewportSize({ width: 412, height: 830 });

await page.waitForTimeout(500);
const portrait = await page.evaluate(`(() => ({
  hint: document.getElementById('touch-note').textContent,
  cls: document.body.className,
  aspect: +window.__game.camera.aspect.toFixed(3),
  noScroll: document.documentElement.scrollWidth <= innerWidth,
  hudVisible: !document.getElementById('hud').hidden,
}))()`);
check('portrait asks for landscape', /横屏|landscape/.test(portrait.hint), portrait.hint);
check('portrait keeps the camera aspect correct', Math.abs(portrait.aspect - 412 / 830) < 0.02, portrait.aspect);
check('no horizontal scroll in portrait', portrait.noScroll);
check('HUD still present in portrait', portrait.hudVisible);
await page.screenshot({ path: '/tmp/m_portrait.png' });

const s = await page.evaluate('window.__game.stats');
console.log('\nmobile stats:', JSON.stringify({ tier: s.quality, draw: s.drawCalls, tris: s.triangles, state: s.state }));
check('no errors in the mobile pass', errs.length === 0, errs.slice(0, 3));

console.log(`\n${fails === 0 ? 'ALL MOBILE CHECKS PASSED' : fails + ' MOBILE CHECKS FAILED'}`);
await browser.close(); server.close();
process.exit(fails ? 1 : 0);
