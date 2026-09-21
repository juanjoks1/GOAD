import { chromium } from 'playwright';
import { serve, CHROME, LAUNCH_ARGS } from './server.mjs';
const { server, port } = await serve();
const b = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const q = process.argv[2] || 'high';
await page.goto(`http://127.0.0.1:${port}/?perf=1&quality=${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.stats.phase === "menu"', null, { timeout: 150000 });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/s_menu.png' });
await page.click('.char[data-char="girl"]');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/s_menu_sel.png' });
await page.click('#enter');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.evaluate(() => { document.getElementById('compat').hidden = true; });

async function shot(name, setup, sim = 2.2) {
  await page.evaluate(([code, s]) => {
    const g = window.__game;
    // eslint-disable-next-line no-new-func
    new Function('g', 'THREE', code)(g, g.THREE);
    g.simulate(s);
  }, [setup, sim]);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `/tmp/s_${name}.png` });
  const s = await page.evaluate('window.__game.stats');
  console.log(name.padEnd(12), 'draw', s.drawCalls, 'tris', s.triangles, 'state', s.state, 'y', s.heightM);
}

await shot('street', `g.player.spawn(new THREE.Vector3(0,6,40), new THREE.Vector3(), 'ground');
  g.testInput.clear(); g.testInput.look(Math.PI, 0.0);`);
await shot('street2', `g.player.spawn(new THREE.Vector3(60,6,-140), new THREE.Vector3(), 'ground');
  g.testInput.look(0.5, 0.06);`);
await shot('roof', `g.player.spawn(new THREE.Vector3(-348,150,-232), new THREE.Vector3(), 'air');
  g.testInput.look(2.4, -0.10);`, 3.0);
await shot('slums', `g.player.spawn(new THREE.Vector3(812,30,696), new THREE.Vector3(), 'air');
  g.testInput.look(1.2, -0.05);`, 3.0);
await shot('metro', `g.player.spawn(new THREE.Vector3(686,-16,-724), new THREE.Vector3(), 'air');
  g.testInput.look(0.0, 0.05);`, 3.0);
await shot('aerial', `g.player.spawn(new THREE.Vector3(0,420,120), new THREE.Vector3(0,-2,-6), 'air');
  g.testInput.look(Math.PI, -0.5);`, 1.0);
await page.evaluate(() => window.__game.cycleTime());
await shot('night', `g.player.spawn(new THREE.Vector3(0,6,40), new THREE.Vector3(), 'ground'); g.testInput.look(Math.PI, 0.04);`);
await page.evaluate(() => window.__game.cycleTime());
await shot('day', `g.player.spawn(new THREE.Vector3(0,6,40), new THREE.Vector3(), 'ground'); g.testInput.look(Math.PI, 0.04);`);
console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await b.close(); server.close();
