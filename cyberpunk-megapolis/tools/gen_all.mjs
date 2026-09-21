/**
 * Regenerates every asset the game ships: textures, prefab GLBs, the scene
 * layout and the two characters. The game itself never runs this -- the output
 * is committed -- but it keeps the assets reproducible from source.
 *
 *   node tools/gen_all.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const here = import.meta.dirname;
const steps = ['gen_textures.mjs', 'gen_prefabs.mjs', 'gen_scene.mjs', 'gen_chars.mjs'];
for (const s of steps) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [path.join(here, s)], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`${s} failed`); process.exit(r.status || 1); }
}
console.log('\nall assets regenerated');
