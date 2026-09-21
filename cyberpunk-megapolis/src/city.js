/**
 * Builds the city from data/prefabs.json + data/scene.json.
 *
 * Placements are authored in source (left-handed) space; every one goes through
 * the documented conversion -- position (-x, y, z), quaternion (x, -y, -z, w),
 * scale unchanged -- and the landmark table is re-derived afterwards so a
 * mirrored city or a back-to-front character is caught at load, not by eye.
 *
 * Rendering uses one BatchedMesh per (tile, render group, LOD class): geometry
 * is stored once per tile no matter how many times a prefab repeats, per-batch
 * frustum culling happens at object level, and tints ride along as per-instance
 * colours. That keeps the whole city inside a few hundred draw calls.
 */
import * as THREE from 'three';
import { harvestPrefabMeshes } from './assets.js';
import { F_COLLIDE, F_PLATFORM, F_DECAL, F_SAFETY, F_AWNING, F_ANCHOR, F_BUILDING } from '../cityBoxes.js';

const CATEGORIES = ['Combined_Building', 'Street', 'Facade_Details', 'Modules', 'Metro', 'Car', 'Decals', 'Environment', 'Background'];

/* --------------------------------------------- source -> world conversion */
export const CONVERSION = {
  position: (x, y, z, out) => out.set(-x, y, z),
  quaternion: (q, out) => out.set(q.x, -q.y, -q.z, q.w),
  scale: (s, out) => out.copy(s),
};

const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);

function sourceToWorld(x, y, z, quat, scale, outMatrix) {
  CONVERSION.position(x, y, z, _p);
  CONVERSION.quaternion(quat, _qw);
  CONVERSION.scale(scale, _s);
  return outMatrix.compose(_p, _qw, _s);
}

/* ------------------------------------------------------------------ flags */
function flagsFor(def) {
  let f = 0;
  const tags = def.tags || [];
  if (def.decal) return F_DECAL;
  if (def.collide) f |= F_COLLIDE;
  if (def.platform) f |= F_PLATFORM;
  if (def.safetyFloor) f |= F_SAFETY | F_COLLIDE | F_PLATFORM;
  if (def.awning) f |= F_AWNING;
  if (tags.includes('building')) f |= F_BUILDING;
  // web anchors / zip targets: real structures only. Safety floors are
  // deliberately excluded so a web can never grab empty air, and so are
  // decals, clouds and the cosmetic background skyline.
  // A web must grab a building or a comparable structure. Without the height
  // floor the nearest street lamp wins the search and the swing collapses into
  // a 3.5 m rope at pavement level.
  const structural = tags.includes('building') || tags.includes('elevated') || tags.includes('bridge')
    || tags.includes('pylon') || tags.includes('stack') || tags.includes('pillar')
    || tags.includes('gantry') || tags.includes('billboard') || tags.includes('scaffold');
  const anchorable = (f & F_COLLIDE) && !(f & F_SAFETY)
    && !tags.includes('cloud') && !tags.includes('background')
    && (structural || def.size[1] >= 9);
  if (anchorable) f |= F_ANCHOR;
  return f;
}

function lodClassOf(def) {
  const tags = def.tags || [];
  const big = Math.max(def.size[0], def.size[1], def.size[2]) >= 11;
  if (tags.includes('building') || tags.includes('road') || tags.includes('sidewalk')
    || tags.includes('elevated') || tags.includes('background') || big) return 'structure';
  return 'detail';
}

/* ================================================================= build */
export async function buildCity({
  loader, scene, materials, prefabDoc, sceneDoc, materialsDoc, quality, boxes, notify,
}) {
  const t0 = performance.now();
  const P = prefabDoc.prefabs;
  const matCat = materialsDoc.city;

  /* ---- 1. category GLBs ------------------------------------------------ */
  const prefabPrims = new Map();          // prefab name -> [{geometry, material}]
  let droppedJunk = 0;
  for (const cat of CATEGORIES) {
    const gltf = await loader.loadGLB(`./glb/${cat}.glb`);
    const { byName, dropped } = harvestPrefabMeshes(gltf);
    droppedJunk += dropped;
    for (const [name, prims] of byName) prefabPrims.set(`${cat}/${name}`, prims);
  }

  /* ---- 2. per-prefab metadata + triangle cache for collision ---------- */
  const ids = sceneDoc.prefabIds;
  const prefabInfo = ids.map((id, idx) => {
    const def = P[id];
    const prims = prefabPrims.get(id) || [];
    const localBox = new THREE.Box3(new THREE.Vector3(...def.min), new THREE.Vector3(...def.max));
    const flags = flagsFor(def);
    if (flags & F_COLLIDE) {
      boxes.setTriangles(idx, prims.map((p) => ({
        pos: p.geometry.attributes.position.array,
        idx: p.geometry.index.array,
      })));
    }
    return { id, def, prims, localBox, flags, lod: lodClassOf(def), group: def.groups, isCloud: (def.tags || []).includes('cloud') };
  });

  /* ---- 3. walk placements: convert, register collision, bucket by tile - */
  const TILE = sceneDoc.tileSize;
  const tiles = new Map();                 // "tx,tz" -> tile record
  const tileOf = (x, z) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
  const clouds = [];
  const buildingBoxes = new Map();         // tile key -> array of world boxes for far LOD
  let placementCount = 0;

  const getTile = (key) => {
    let t = tiles.get(key);
    if (!t) {
      const [tx, tz] = key.split(',').map(Number);
      t = {
        key, tx, tz,
        cx: (tx + 0.5) * TILE, cz: (tz + 0.5) * TILE,
        counts: new Map(),                 // `${group}|${lod}` -> {instances, geoms:Set}
        batches: new Map(),
        bounds: new THREE.Box3(),
        lodMesh: null,
      };
      tiles.set(key, t);
    }
    return t;
  };

  const rows = [];
  for (const r of sceneDoc.simple) {
    rows.push({ p: r[0], x: r[1], y: r[2], z: r[3], yaw: r[4], sx: r[5], sy: r[5], sz: r[5] });
  }
  for (const r of sceneDoc.full) {
    rows.push({ p: r[0], x: r[1], y: r[2], z: r[3], q: [r[4], r[5], r[6], r[7]], sx: r[8], sy: r[9], sz: r[10] });
  }

  // pass A: count so BatchedMesh capacities are exact
  const worldMatrices = new Float32Array(rows.length * 16);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const info = prefabInfo[r.p];
    if (!info) continue;
    if (r.q) _q.set(r.q[0], r.q[1], r.q[2], r.q[3]);
    else _q.setFromAxisAngle(_yAxis, r.yaw * Math.PI / 180);
    _s.set(r.sx, r.sy, r.sz);
    sourceToWorld(r.x, r.y, r.z, _q, _s, _m);
    worldMatrices.set(_m.elements, i * 16);

    if (info.flags & F_COLLIDE) boxes.add(r.p, _m, info.localBox, info.flags);

    if (info.isCloud) { clouds.push({ i, info }); continue; }
    const wx = -r.x, wz = r.z;
    const key = tileOf(wx, wz);
    const t = getTile(key);
    placementCount++;
    for (let gi = 0; gi < info.group.length; gi++) {
      const ck = `${info.group[gi]}|${info.lod}`;
      let c = t.counts.get(ck);
      if (!c) t.counts.set(ck, c = { instances: 0, geoms: new Map(), verts: 0, idx: 0 });
      c.instances++;
      const geo = info.prims[gi]?.geometry;
      if (geo && !c.geoms.has(geo)) {
        c.geoms.set(geo, true);
        c.verts += geo.attributes.position.count;
        c.idx += geo.index.count;
      }
    }
    if (info.flags & F_BUILDING) {
      const arr = buildingBoxes.get(key) || buildingBoxes.set(key, []).get(key);
      arr.push({ x: wx, z: wz, top: info.def.roofY != null ? info.def.roofY : info.def.size[1], w: info.def.size[0], d: info.def.size[2], yaw: -(r.yaw || 0) });
    }
    t.bounds.expandByPoint(new THREE.Vector3(wx, r.y, wz));
    t.bounds.expandByPoint(new THREE.Vector3(wx, r.y + info.def.size[1], wz));
  }

  /* ---- 4. allocate the batches --------------------------------------- */
  const root = new THREE.Group();
  root.name = 'city';
  const tintCache = new Map();
  const tintOf = (matName) => {
    let c = tintCache.get(matName);
    if (!c) tintCache.set(matName, c = new THREE.Color(matCat[matName]?.tint || '#ffffff').convertSRGBToLinear());
    return c;
  };

  let batchCount = 0;
  for (const t of tiles.values()) {
    t.structure = new THREE.Group();
    t.detail = new THREE.Group();
    t.structure.name = `tile_${t.key}_structure`;
    t.detail.name = `tile_${t.key}_detail`;
    for (const [ck, c] of t.counts) {
      const [group, lod] = ck.split('|');
      const mat = materials.get(group);
      if (!mat) continue;
      const bm = new THREE.BatchedMesh(c.instances, c.verts, c.idx, mat);
      bm.name = `${t.key}/${group}/${lod}`;
      bm.perObjectFrustumCulled = false;     // tiles are culled as whole objects
      bm.sortObjects = false;
      bm.castShadow = false;
      bm.receiveShadow = false;
      c.batch = bm;
      c.geomIds = new Map();
      (lod === 'structure' ? t.structure : t.detail).add(bm);
      batchCount++;
    }
    root.add(t.structure, t.detail);
  }

  /* ---- 5. fill instances --------------------------------------------- */
  const mtmp = new THREE.Matrix4();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const info = prefabInfo[r.p];
    if (!info || info.isCloud) continue;
    const key = tileOf(-r.x, r.z);
    const t = tiles.get(key);
    if (!t) continue;
    mtmp.fromArray(worldMatrices, i * 16);
    for (let gi = 0; gi < info.group.length; gi++) {
      const prim = info.prims[gi];
      if (!prim) continue;
      const ck = `${info.group[gi]}|${info.lod}`;
      const c = t.counts.get(ck);
      if (!c || !c.batch) continue;
      let gid = c.geomIds.get(prim.geometry);
      if (gid === undefined) {
        gid = c.batch.addGeometry(prim.geometry);
        c.geomIds.set(prim.geometry, gid);
      }
      const id = c.batch.addInstance(gid);
      c.batch.setMatrixAt(id, mtmp);
      c.batch.setColorAt(id, tintOf(prim.material));
    }
  }
  for (const t of tiles.values()) {
    for (const c of t.counts.values()) {
      if (!c.batch) continue;
      c.batch.computeBoundingBox();
      c.batch.computeBoundingSphere();
    }
  }

  /* ---- 6. far LOD: one batched box shell per tile --------------------- */
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const lodMat = materials.get('g_facade_tower');
  let lodInstances = 0;
  for (const t of tiles.values()) {
    const list = buildingBoxes.get(t.key);
    if (!list || !list.length || !lodMat) continue;
    const bm = new THREE.BatchedMesh(list.length, boxGeo.attributes.position.count, boxGeo.index.count, lodMat);
    bm.name = `${t.key}/farLOD`;
    bm.perObjectFrustumCulled = false;
    const gid = bm.addGeometry(boxGeo);
    const tint = tintOf('facade_tower_b');
    for (const b of list) {
      const id = bm.addInstance(gid);
      _p.set(b.x, b.top * 0.5, b.z);
      _qw.setFromAxisAngle(_yAxis, b.yaw * Math.PI / 180);
      _s.set(Math.max(4, b.w), Math.max(6, b.top), Math.max(4, b.d));
      bm.setMatrixAt(id, mtmp.compose(_p, _qw, _s));
      bm.setColorAt(id, tint);
      lodInstances++;
    }
    bm.computeBoundingBox();
    bm.computeBoundingSphere();
    bm.visible = false;
    t.lodMesh = bm;
    root.add(bm);
  }

  /* ---- 7. clouds: camera-facing billboards, never solid slabs --------- */
  let cloudBatch = null;
  const cloudData = [];
  if (clouds.length) {
    const mat = materials.get('g_cloud');
    let verts = 0, idxc = 0;
    const geoms = new Map();
    for (const { info } of clouds) {
      const g = info.prims[0]?.geometry;
      if (g && !geoms.has(g)) { geoms.set(g, true); verts += g.attributes.position.count; idxc += g.index.count; }
    }
    cloudBatch = new THREE.BatchedMesh(clouds.length, verts, idxc, mat);
    cloudBatch.name = 'clouds';
    cloudBatch.perObjectFrustumCulled = false;
    cloudBatch.frustumCulled = false;
    const gids = new Map();
    for (const { i, info } of clouds) {
      const g = info.prims[0]?.geometry;
      if (!g) continue;
      let gid = gids.get(g);
      if (gid === undefined) gids.set(g, gid = cloudBatch.addGeometry(g));
      const id = cloudBatch.addInstance(gid);
      mtmp.fromArray(worldMatrices, i * 16);
      const pos = new THREE.Vector3().setFromMatrixPosition(mtmp);
      const sc = new THREE.Vector3().setFromMatrixScale(mtmp);
      cloudData.push({ id, pos, scale: sc });
      cloudBatch.setMatrixAt(id, mtmp);
      cloudBatch.setColorAt(id, new THREE.Color(0xffffff));
    }
    root.add(cloudBatch);
  }

  boxes.build();
  scene.add(root);

  /* ---- 8. validate the coordinate conversion ------------------------- */
  const validation = validateConversion(sceneDoc);
  if (!validation.ok) {
    console.error('[city] coordinate conversion validation FAILED', validation);
    notify?.('坐标转换校验失败 · coordinate check failed');
  }

  /* ---- 9. verify the floating-advertisement snapping ----------------- */
  const signReport = await verifySignFixes(loader, boxes);

  const stats = {
    prefabs: prefabPrims.size,
    placements: placementCount + clouds.length,
    collisionInstances: boxes.n,
    hashCells: boxes.cellCount,
    tiles: tiles.size,
    batches: batchCount,
    farLodInstances: lodInstances,
    clouds: clouds.length,
    droppedJunk,
    buildMs: Math.round(performance.now() - t0),
    validation,
    signReport,
  };

  /* ---- 10. LOD update ------------------------------------------------ */
  const camPos = new THREE.Vector3();
  const tileList = [...tiles.values()];
  let lastKey = null;
  function updateLOD(cameraPosition, q) {
    camPos.copy(cameraPosition);
    const detailDist = q.detailDistance;
    const structDist = q.structureDistance;
    const cullDist = q.cullDistance;
    for (const t of tileList) {
      const d = Math.hypot(t.cx - camPos.x, t.cz - camPos.z);
      const near = d < detailDist;
      const mid = d < structDist;
      const far = d < cullDist;
      if (t.detail.visible !== near) t.detail.visible = near;
      if (t.structure.visible !== mid) t.structure.visible = mid;
      if (t.lodMesh) {
        const showLod = !mid && far;
        if (t.lodMesh.visible !== showLod) t.lodMesh.visible = showLod;
      }
    }
  }

  const _cm = new THREE.Matrix4();
  const _cq = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);
  const _look = new THREE.Vector3();
  function updateClouds(cameraPosition) {
    if (!cloudBatch) return;
    for (const c of cloudData) {
      _look.subVectors(cameraPosition, c.pos);
      _look.y *= 0.25;                                   // keep them mostly upright
      const yaw = Math.atan2(_look.x, _look.z);
      _cq.setFromAxisAngle(_up, yaw);
      cloudBatch.setMatrixAt(c.id, _cm.compose(c.pos, _cq, c.scale));
    }
  }

  function dispose() {
    root.traverse((o) => {
      if (o.isBatchedMesh) { o.dispose(); o.geometry?.dispose(); }
    });
    for (const prims of prefabPrims.values()) for (const p of prims) p.geometry.dispose();
    boxGeo.dispose();
    scene.remove(root);
    boxes.dispose();
  }

  /**
   * Shadows are a quality-tier knob, and the city only ever *receives* them.
   * Letting 30 000 placements cast would mean rendering the whole visible city
   * a second time into the shadow map -- it doubled draw calls and triangles
   * for almost nothing, because at dusk under heavy fog the sun contributes
   * very little contact detail. The character still casts, which is the part
   * that actually reads.
   */
  function setShadows(on) {
    for (const t of tileList) {
      for (const c of t.counts.values()) {
        if (!c.batch) continue;
        c.batch.castShadow = false;
        c.batch.receiveShadow = on;
      }
    }
  }

  return { root, tiles: tileList, stats, updateLOD, updateClouds, setShadows, dispose, landmarks: sceneDoc.landmarks, prefabInfo };
}

/* ------------------------------------------------------------ validation */
/**
 * Re-derives every landmark and the road-direction probe through the same
 * conversion the geometry used. If the city were mirrored or rotated, the road
 * probe's X sign or a landmark's position would disagree and we would know
 * before the player ever sees a backwards street.
 */
export function validateConversion(sceneDoc) {
  const out = { ok: true, landmarks: {}, roadProbe: null, notes: [] };
  const v = new THREE.Vector3();
  for (const [name, lm] of Object.entries(sceneDoc.landmarks)) {
    CONVERSION.position(lm.source[0], lm.source[1], lm.source[2], v);
    const want = lm.world;
    const err = Math.max(Math.abs(v.x - want[0]), Math.abs(v.y - want[1]), Math.abs(v.z - want[2]));
    out.landmarks[name] = { derived: v.toArray(), expected: want, err: +err.toFixed(4) };
    if (err > 0.02) { out.ok = false; out.notes.push(`landmark ${name} off by ${err.toFixed(3)} m`); }
  }
  const rp = sceneDoc.roadProbe;
  CONVERSION.position(rp.source[0], rp.source[1], rp.source[2], v);
  const xFlipped = Math.sign(v.x) === -Math.sign(rp.source[0]) || rp.source[0] === 0;
  const zKept = Math.sign(v.z) === Math.sign(rp.source[2]) || rp.source[2] === 0;
  out.roadProbe = { derived: v.toArray(), expected: rp.world, xFlipped, zKept };
  if (!xFlipped || !zKept) { out.ok = false; out.notes.push('road probe direction wrong: city may be mirrored'); }
  // a yaw-only source rotation must come out negated
  const qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3);
  const qw = new THREE.Quaternion();
  CONVERSION.quaternion(qs, qw);
  const yawOut = 2 * Math.atan2(qw.y, qw.w);
  out.yawCheck = { sourceYaw: 60, worldYaw: +(yawOut * 180 / Math.PI).toFixed(3) };
  if (Math.abs(out.yawCheck.worldYaw + 60) > 0.05) { out.ok = false; out.notes.push('yaw conversion wrong'); }
  return out;
}

/**
 * Confirms the generator's advertisement snapping actually lands on geometry:
 * each fix is probed inward against real triangles and the remaining gap is
 * reported. Anything that drifted is logged rather than silently floating.
 */
async function verifySignFixes(loader, boxes) {
  let doc;
  try { doc = await loader.json('./data/sign_fixes.json'); } catch { return { checked: 0, drifting: 0 }; }
  let drifting = 0, checked = 0;
  for (const fix of doc.fixes) {
    // sign_fixes.json is in source space like the rest of the scene, so the
    // probe has to go through the same conversion the geometry did
    const [sx, y, sz] = fix.to;
    const x = -sx, z = sz;
    // probe from the sign towards the wall it should be sitting on
    const dirs = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
    let found = false;
    for (const [dx, dy, dz] of dirs) {
      const h = boxes.raycast(x, y, z, dx, dy, dz, 2.0, { mask: 0, reject: F_DECAL });
      if (h) { found = true; break; }
    }
    checked++;
    if (!found) drifting++;
  }
  if (drifting) console.warn(`[city] ${drifting}/${checked} advertisements are not touching a facade`);
  return { checked, drifting, tolerance: doc.tolerance };
}
