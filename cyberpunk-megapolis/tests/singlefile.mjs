/** Opens dist/cyberpunk-megapolis.html over file:// exactly as a phone would. */
import { chromium, devices } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const file = path.resolve(import.meta.dirname, '../dist/cyberpunk-megapolis.html');
if (!fs.existsSync(file)) { console.error('run: node tools/build_single.mjs'); process.exit(1); }

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? '  ok  ' : ' FAIL '} ${n}${d !== undefined ? '  ' + JSON.stringify(d) : ''}`); };

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ ...devices['Pixel 5 landscape'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [], reqFails = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CERR ' + m.text()); });
page.on('requestfailed', (r) => reqFails.push(r.url().slice(0, 80)));

console.log(`opening file://${file}  (${(fs.statSync(file).size / 1048576).toFixed(2)} MB)`);
const t0 = Date.now();
await page.goto('file://' + file, { waitUntil: 'domcontentloaded' });
check('page has origin null (true file:// load)', await page.evaluate('location.protocol') === 'file:');

await page.waitForFunction('window.__game && window.__game.stats.phase === "menu"', null, { timeout: 240000 });
const secs = +((Date.now() - t0) / 1000).toFixed(1);
check('reaches the menu from file:// with no server', true, { seconds: secs });

const s = await page.evaluate('window.__game.stats');
check('city built entirely from inlined assets', s.city && s.city.placements > 25000, s.city?.placements);
check('coordinate conversion still validates', s.city.validation.ok);
check('no failed network requests', reqFails.length === 0, reqFails.slice(0, 3));
check('touch mode active', await page.evaluate('window.__game.isTouch'));

await page.tap('.char[data-char="man"]');
await page.tap('#enter');
await page.waitForTimeout(250);
await page.tap('#controls-close');
await page.waitForTimeout(400);
check('gameplay starts', (await page.evaluate('window.__game.stats.phase')) === 'playing');
check('touch overlay visible', !(await page.isHidden('#touch')));

const play = await page.evaluate(`(() => {
  const g = window.__game, T = g.THREE;
  g.testInput.clear(); g.testInput.look(Math.PI, 0.05);
  g.player.spawn(new T.Vector3(0, 30, 40), new T.Vector3(0, 2, 14), 'air');
  g.testInput.hold('Space');
  const t = g.simulate(6);
  return { states: t.states, teleports: t.teleports, maxSpeed: +t.maxSpeed.toFixed(1),
    anchored: g.player.hasAnchor, char: g.controller.stats };
})()`);
check('web swinging works in the single file', play.states.includes('swing'), play.states);
check('character rig loaded (21 bones, 10 clips)', play.char.bones === 21 && play.char.clips === 10, play.char);
check('no teleports', play.teleports === 0);

await page.screenshot({ path: '/tmp/single_file.png' });
check('no errors from the file:// run', errs.length === 0, errs.slice(0, 4));

console.log(`\n${fails === 0 ? 'SINGLE-FILE BUILD OK' : fails + ' CHECKS FAILED'}`);
await browser.close();
process.exit(fails ? 1 : 0);
