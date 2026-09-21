/**
 * Builds the prefab GLBs (one per category, Draco-compressed) and the data
 * manifests that describe them: materials.json, prefabs.json, scales.json and
 * fbx_mat_order.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GLB, initDraco } from './lib/glb.mjs';
import { buildPrefabs } from './lib/prefabs.mjs';
import { buildMaterials, buildCharacterMaterials, assignRenderGroups } from './lib/materials.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const GLBDIR = path.join(ROOT, 'glb');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(GLBDIR, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

await initDraco();

console.log('building prefab library...');
const cats = buildPrefabs();
const materials = buildMaterials();
const charMaterials = buildCharacterMaterials();
const { groups: renderGroups, groupCount } = assignRenderGroups(materials);

const prefabIndex = {};          // id -> descriptor for the runtime
const matOrder = {};             // id -> ordered material slot names
const scales = {};               // id -> allowed placement scale policy
let totalTris = 0, totalPrefabs = 0;
const glbStats = {};
const missingMaterials = new Set();

for (const [cat, list] of Object.entries(cats)) {
  const glb = new GLB({ generator: `cyberpunk-megapolis/${cat}` });
  const nodes = [];
  for (const def of list) {
    const prims = def.part.toPrims();
    for (const p of prims) if (!materials[p.material] && !charMaterials[p.material]) missingMaterials.add(p.material);
    const bb = def.part.bounds();
    const tris = prims.reduce((a, p) => a + p.index.length / 3, 0);
    totalTris += tris; totalPrefabs++;
    const meshIdx = glb.mesh(def.name, prims, { draco: true });
    nodes.push(glb.node({ name: def.name, mesh: meshIdx }));
    prefabIndex[def.id] = {
      cat, name: def.name, tris,
      size: def.size.map((v) => +v.toFixed(3)),
      min: bb.min.toArray().map((v) => +v.toFixed(3)),
      max: bb.max.toArray().map((v) => +v.toFixed(3)),
      materials: prims.map((p) => p.material),
      groups: prims.map((p) => materials[p.material].group),
      tags: def.tags || [],
      anchor: def.anchor || 'ground',
      collide: def.collide !== false,
      platform: !!def.platform,
      decal: !!def.decal,
      billboard: !!def.billboard,
      awning: !!def.awning,
      roofY: def.roofY != null ? +def.roofY.toFixed(3) : undefined,
      wallUpTo: def.wallUpTo != null ? +def.wallUpTo.toFixed(3) : undefined,
      footprint: def.footprint ? def.footprint.map((v) => +v.toFixed(2)) : undefined,
      safetyFloor: !!def.safetyFloor,
      scalable: !!def.scalable,
    };
    matOrder[def.id] = prims.map((p) => p.material);
    // buildings keep scale 1 so the metre-space UVs stay at a constant texel
    // density; props may be scaled inside a modest range.
    const isBuilding = (def.tags || []).includes('building');
    scales[def.id] = isBuilding
      ? { uniform: [1, 1], nonUniform: false, reason: 'UVs baked in metres - scaling would change texel density' }
      : def.scalable ? { uniform: [0.5, 6], nonUniform: true }
        : { uniform: [0.85, 1.25], nonUniform: false };
  }
  glb.sceneNodes(nodes);
  const buf = glb.toBuffer();
  fs.writeFileSync(path.join(GLBDIR, `${cat}.glb`), buf);
  glbStats[cat] = { prefabs: list.length, bytes: buf.length };
  console.log(`  ${cat.padEnd(18)} ${String(list.length).padStart(4)} prefabs  ${(buf.length / 1048576).toFixed(2)} MB`);
}

if (missingMaterials.size) {
  console.error('MATERIALS MISSING FROM CATALOGUE:', [...missingMaterials].join(', '));
  process.exitCode = 1;
}

fs.writeFileSync(path.join(DATA, 'materials.json'), JSON.stringify({
  note: 'City + character material catalogue. `ms` is a Unity MetallicSmoothness map: R -> metalness, (1 - A) -> roughness. uvScale becomes texture.repeat because prefab UVs are baked in metres. Each category maps onto a renderGroup: one GPU material shared by every category in the group, tinted per category through vertex colours / instanceColor.',
  renderGroups, city: materials, character: charMaterials,
}, null, 1));

fs.writeFileSync(path.join(DATA, 'prefabs.json'), JSON.stringify({
  note: 'Prefab manifest. `cat` names the GLB file that holds the template mesh; the runtime instances it per placement from scene.json.',
  glb: glbStats, prefabs: prefabIndex,
}, null, 1));

fs.writeFileSync(path.join(DATA, 'scales.json'), JSON.stringify({
  note: 'Per-prefab placement scale policy used by the scene generator and validated at load.',
  scales,
}, null, 1));

fs.writeFileSync(path.join(DATA, 'fbx_mat_order.json'), JSON.stringify({
  note: 'Ordered material slots per prefab. The runtime resolves materials by GLB material NAME first and only falls back to this slot order, so a multi-material asset can never get facades painted with ground textures.',
  order: matOrder,
}, null, 1));

console.log(`\n${totalPrefabs} prefabs, ${(totalTris / 1000).toFixed(1)}k triangles of unique geometry`);
console.log(`materials: ${Object.keys(materials).length} city categories -> ${groupCount} GPU render groups, + ${Object.keys(charMaterials).length} character`);
