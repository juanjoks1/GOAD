import { chromium } from 'playwright';
import { serve, CHROME, LAUNCH_ARGS } from './server.mjs';

const { server, port } = await serve();
const b = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], warnings = [], logs = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors.push('CONSOLE ERROR: ' + t);
  else if (m.type() === 'warning') warnings.push(t);
  else logs.push(t);
});
await page.goto(`http://127.0.0.1:${port}/?perf=1&quality=high`, { waitUntil: 'domcontentloaded' });

const t0 = Date.now();
try {
  await page.waitForFunction('window.__game && window.__game.phase === "menu"', null, { timeout: 120000 });
} catch (e) {
  console.log('!! never reached menu');
}
console.log('menu after', ((Date.now() - t0) / 1000).toFixed(1), 's');
console.log('loader text:', await page.textContent('#ld-count').catch(() => 'n/a'));
console.log('stats at menu:', JSON.stringify(await page.evaluate('window.__game.stats'), null, 1));

await page.click('.char[data-char="man"]');
await page.click('#enter');
await page.waitForTimeout(400);
// dismiss the controls card
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
console.log('stats in play:', JSON.stringify(await page.evaluate('window.__game.stats'), null, 1));
await page.screenshot({ path: '/tmp/shot_play.png' });
await page.waitForTimeout(3000);
console.log('after 3s more:', JSON.stringify(await page.evaluate('window.__game.stats'), null, 1));
await page.screenshot({ path: '/tmp/shot_play2.png' });

console.log('\nERRORS (' + errors.length + '):');
errors.slice(0, 14).forEach((e) => console.log('  ' + e.split('\n').slice(0, 3).join(' | ')));
console.log('\nWARNINGS (' + warnings.length + '):');
[...new Set(warnings)].slice(0, 10).forEach((w) => console.log('  ' + w.slice(0, 200)));
console.log('\nLOGS:');
logs.slice(0, 10).forEach((l) => console.log('  ' + l.slice(0, 260)));
await b.close(); server.close();
