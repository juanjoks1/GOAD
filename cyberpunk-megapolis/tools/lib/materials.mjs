/**
 * The city material catalogue. Written to data/materials.json; the runtime
 * turns each entry into a MeshStandardMaterial, resolving textures through
 * data/textures_webp.json (WebP first, PNG fallback) and applying the right
 * colour space per channel.
 *
 * `ms` names a Unity-style MetallicSmoothness texture: the runtime maps
 * R -> metalness and (1 - A) -> roughness.
 */

export function buildMaterials() {
  const M = {};
  const add = (name, def) => { M[name] = def; return name; };

  /* ---------------------------------------------------------- concrete/stone */
  const concreteTints = { a: '#b9bab6', b: '#8e8f8c', c: '#a6a09a', d: '#6f7173' };
  for (const [k, color] of Object.entries(concreteTints)) {
    add(`concrete_${k}`, {
      map: 'concrete', normalMap: 'concrete_n', metallicSmoothness: 'concrete_ms',
      color, roughness: 0.94, metalness: 0, uvScale: 0.2, normalScale: 0.7,
    });
  }
  add('concrete_dark', { map: 'concrete_dark', normalMap: 'concrete_n', color: '#6a6c70', roughness: 0.96, uvScale: 0.22, normalScale: 0.6 });
  add('podium_concrete', { map: 'concrete', normalMap: 'concrete_n', color: '#8c8d8a', roughness: 0.95, uvScale: 0.16, normalScale: 0.5, note: 'auto-generated foundation podiums under floating buildings' });
  add('safety_floor', { map: 'concrete', normalMap: 'concrete_n', color: '#7f7d79', roughness: 0.97, uvScale: 0.1, normalScale: 0.4, note: 'visible safety floor for unfinished blocks' });
  add('sidewalk_a', { map: 'sidewalk', normalMap: 'concrete_n', color: '#9b9a95', roughness: 0.93, uvScale: 0.28, normalScale: 0.5 });
  add('sidewalk_b', { map: 'sidewalk', color: '#7d7c78', roughness: 0.95, uvScale: 0.28 });
  add('asphalt_a', { map: 'asphalt', normalMap: 'asphalt_n', color: '#8f929a', roughness: 0.88, uvScale: 0.14, normalScale: 0.45 });
  add('asphalt_wet', { map: 'asphalt', normalMap: 'asphalt_n', color: '#7f848f', roughness: 0.55, metalness: 0.12, uvScale: 0.14, normalScale: 0.6 });
  add('brick_a', { map: 'brick', normalMap: 'brick_n', color: '#b08a77', roughness: 0.93, uvScale: 0.3, normalScale: 0.8 });
  add('brick_b', { map: 'brick', normalMap: 'brick_n', color: '#8a7568', roughness: 0.94, uvScale: 0.3, normalScale: 0.8 });
  add('plaster_a', { map: 'plaster', color: '#a9a49b', roughness: 0.95, uvScale: 0.26 });
  add('plaster_b', { map: 'plaster', color: '#7e7a72', roughness: 0.96, uvScale: 0.26 });
  add('tile_metro', { map: 'tile_metro', normalMap: 'tile_metro_n', color: '#b6b8b4', roughness: 0.72, uvScale: 0.35, normalScale: 0.6 });
  add('roof_gravel', { map: 'roof_gravel', color: '#8d8b86', roughness: 0.97, uvScale: 0.3 });

  /* -------------------------------------------------------------- facades */
  const facades = [
    ['facade_tower', ['#a8adb6', '#8d939c', '#b9b3ad', '#787f8a'], 12, 1.7],
    ['facade_res', ['#a89f95', '#8e8579', '#9aa0a4'], 10, 1.7],
    ['facade_glass', ['#93a3b5', '#7d8fa4'], 14, 1.5],
    ['facade_slum', ['#9a8f82', '#7d7468'], 8, 1.6],
  ];
  for (const [base, tints, metres, emis] of facades) {
    tints.forEach((color, i) => {
      const suffix = String.fromCharCode(97 + i);
      const def = {
        map: base, emissiveMap: base + '_emis', emissive: '#ffffff', emissiveIntensity: emis,
        color, roughness: 0.82, metalness: 0.04, uvScale: 1 / metres,
        note: `one texture tile = ${metres} m of wall`,
      };
      if (base === 'facade_tower' || base === 'facade_slum') { def.normalMap = base + '_n'; def.normalScale = 0.55; }
      if (base === 'facade_glass') { def.metallicSmoothness = 'facade_glass_ms'; def.roughness = 0.28; def.metalness = 0.55; }
      add(`${base}_${suffix}`, def);
    });
  }

  /* --------------------------------------------------------------- metals */
  add('metal_a', { map: 'metal_panel', normalMap: 'metal_panel_n', metallicSmoothness: 'metal_ms', color: '#9ca1a6', roughness: 0.5, metalness: 0.8, uvScale: 0.5, normalScale: 0.9 });
  add('metal_b', { map: 'metal_panel', normalMap: 'metal_panel_n', metallicSmoothness: 'metal_ms', color: '#6d7276', roughness: 0.62, metalness: 0.78, uvScale: 0.5, normalScale: 0.9 });
  add('metal_c', { map: 'metal_panel', metallicSmoothness: 'metal_ms', color: '#c2c8cc', roughness: 0.34, metalness: 0.9, uvScale: 0.6 });
  add('metal_rust_a', { map: 'metal_rust', normalMap: 'metal_panel_n', color: '#9a7a62', roughness: 0.8, metalness: 0.45, uvScale: 0.45, normalScale: 0.8 });
  add('metal_rust_b', { map: 'metal_rust', color: '#6f5a4c', roughness: 0.88, metalness: 0.35, uvScale: 0.45 });
  add('pipe_metal', { map: 'metal_panel', metallicSmoothness: 'metal_ms', color: '#8b9095', roughness: 0.45, metalness: 0.85, uvScale: 1.1 });
  add('rail_steel', { color: '#b7bdc2', roughness: 0.3, metalness: 0.95 });
  add('sleeper_concrete', { map: 'concrete_dark', color: '#7a7c7e', roughness: 0.95, uvScale: 0.5 });
  add('catenary', { color: '#2b2e33', roughness: 0.6, metalness: 0.6 });
  add('antenna_metal', { color: '#a7adb2', roughness: 0.4, metalness: 0.9 });
  add('grate_metal', { map: 'metal_panel', color: '#5d6367', roughness: 0.7, metalness: 0.7, uvScale: 1.4 });

  /* ----------------------------------------------------------------- misc */
  add('glass_dark', { color: '#1b2430', roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.42, note: 'windows / shopfront glazing' });
  add('glass_shop', { color: '#28323f', roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.5 });
  add('plastic_dark', { color: '#23262b', roughness: 0.55, metalness: 0.08 });
  add('rubber_tyre', { color: '#141518', roughness: 0.9 });
  add('wood_a', { map: 'plaster', color: '#7b5c41', roughness: 0.9, uvScale: 0.5 });
  ['#d8354f', '#2f8fbf', '#d9a22c', '#31a06a'].forEach((c, i) => add(`awning_${String.fromCharCode(97 + i)}`, { color: c, roughness: 0.8, side: 'double' }));
  add('cloth_white', { color: '#cfd2cc', roughness: 0.85, side: 'double', note: 'laundry lines strung between the slum blocks' });

  /* ---------------------------------------------------------- neon lights */
  const neons = {
    neon_pink: '#ff4fd8', neon_cyan: '#42e8ff', neon_red: '#ff2f3c', neon_white: '#fff4e8',
    neon_purple: '#9b5cff', neon_green: '#49ff9e', neon_orange: '#ff9a2e', neon_blue: '#4a7bff',
  };
  for (const [name, color] of Object.entries(neons)) {
    add(name, { color: '#0a0a0c', emissive: color, emissiveIntensity: 3.4, roughness: 0.4, bloom: true });
  }
  add('neon_bars_a', { emissiveMap: 'neon_bars', emissive: '#ffffff', emissiveIntensity: 2.8, color: '#0b0b0d', roughness: 0.5, uvScale: 1, bloom: true });
  add('light_warm', { color: '#141210', emissive: '#ffb469', emissiveIntensity: 3.0, bloom: true });
  add('light_white', { color: '#121314', emissive: '#e8f2ff', emissiveIntensity: 3.6, bloom: true });
  add('light_red', { color: '#140d0e', emissive: '#ff2b33', emissiveIntensity: 3.2, bloom: true });
  add('light_amber', { color: '#141008', emissive: '#ffa02a', emissiveIntensity: 2.8, bloom: true });
  add('shop_glow', { color: '#15120f', emissive: '#ffc979', emissiveIntensity: 2.2, bloom: true });

  /* ------------------------------------------- runtime-drawn signs and ads */
  for (let i = 1; i <= 8; i++) {
    add(`ad_screen_${i}`, {
      canvas: `ad${i}`, emissive: '#ffffff', emissiveIntensity: 1.55, color: '#101013',
      roughness: 0.55, bloom: true, note: 'billboard drawn at runtime into a canvas (JP/EN/numeric signage)',
    });
  }
  for (let i = 1; i <= 6; i++) {
    add(`sign_plate_${i}`, { canvas: `sign${i}`, emissive: '#ffffff', emissiveIntensity: 1.8, color: '#0f1012', roughness: 0.5, bloom: true });
  }

  /* -------------------------------------------------------------- vehicles */
  ['#1f2b3a', '#6b1f26', '#22333a', '#c9c9cc', '#2c2f36', '#3e2a44'].forEach((c, i) =>
    add(`car_body_${String.fromCharCode(97 + i)}`, { color: c, roughness: 0.32, metalness: 0.62 }));
  add('car_glass', { color: '#10161e', roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.6 });
  add('car_light_front', { color: '#1a1a1a', emissive: '#fff0d0', emissiveIntensity: 3.4, bloom: true });
  add('car_light_rear', { color: '#1a1010', emissive: '#ff2222', emissiveIntensity: 3.0, bloom: true });

  /* ------------------------------------------------ atmosphere / distance */
  add('cloud_billboard', { map: 'cloud_puff', transparent: true, opacity: 0.32, depthWrite: false, roughness: 1, unlit: true, note: 'camera-facing billboard, never a solid slab' });
  add('silhouette_a', { color: '#3a3644', roughness: 1, unlit: false, note: 'distant skyline, fog does the work' });
  add('silhouette_b', { color: '#2f2d3c' });
  add('silhouette_c', { color: '#474156' });
  add('water_dark', { color: '#1a222c', roughness: 0.15, metalness: 0.5 });

  /* --------------------------------------------------------------- decals */
  add('decal_road_lines', { map: 'road_lines', transparent: true, alphaTest: 0.35, roughness: 0.9, uvScale: 1, polygonOffset: true, note: 'alphaTest so it never writes a grey quad' });
  add('decal_grime', { map: 'grime_decal', transparent: true, alphaTest: 0.08, opacity: 0.8, roughness: 0.95, polygonOffset: true });

  return M;
}

/** 24 character material categories shared by both Survivor characters. */
export function buildCharacterMaterials() {
  const M = {};
  const add = (n, d) => { M[n] = d; };
  add('char_skin', { color: '#c79a78', roughness: 0.62, metalness: 0.0 });
  add('char_skin_dark', { color: '#a97a5c', roughness: 0.64 });
  add('char_eye_white', { color: '#e9e9ea', roughness: 0.28 });
  add('char_eye_iris', { color: '#2a3c46', roughness: 0.18, metalness: 0.05 });
  add('char_cornea', { color: '#ffffff', roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.22, depthWrite: false, note: 'corneal transparency' });
  add('char_hair', { color: '#1d1a19', roughness: 0.52 });
  add('char_hair_light', { color: '#4a3527', roughness: 0.55 });
  add('char_jacket_camo', { color: '#5c6448', roughness: 0.84, camo: true, note: 'camouflage jacket - runtime canvas camo pattern' });
  add('char_jacket_trim', { color: '#33372a', roughness: 0.8 });
  add('char_vest', { color: '#2f3237', roughness: 0.74 });
  add('char_vest_pouch', { color: '#3c4046', roughness: 0.78 });
  add('char_vest_buckle', { color: '#9aa0a6', roughness: 0.35, metalness: 0.85 });
  add('char_pants_grey', { color: '#a9a8a4', roughness: 0.86 });
  add('char_pants_dark', { color: '#4c4f55', roughness: 0.86 });
  add('char_boots', { color: '#211f1e', roughness: 0.68 });
  add('char_boot_sole', { color: '#141414', roughness: 0.9 });
  add('char_gloves', { color: '#2a2b2e', roughness: 0.7 });
  add('char_cap', { color: '#b8343f', roughness: 0.76, note: 'baseball cap' });
  add('char_cap_brim', { color: '#8d2831', roughness: 0.74 });
  add('char_backpack', { color: '#3a4250', roughness: 0.8, note: 'backpack' });
  add('char_backpack_strap', { color: '#23262c', roughness: 0.82 });
  add('char_shirt', { color: '#d8d4cb', roughness: 0.84 });
  add('char_belt', { color: '#26231f', roughness: 0.7 });
  add('char_web_fiber', { color: '#e8ecf0', emissive: '#c8d6e4', emissiveIntensity: 0.22, roughness: 0.55, note: 'web strand fibre' });
  return M;
}

/**
 * Render groups. Draw calls are bounded by how many distinct GPU materials a
 * spatial chunk touches, so every material category is mapped onto a shared
 * render group: one MeshStandardMaterial with vertexColors, where each
 * category contributes its own tint through the colour attribute (and through
 * instanceColor on InstancedMeshes). Emissive groups get a two-line shader
 * patch so vColor drives emissive instead of diffuse.
 *
 * 92 material categories collapse to ~40 GPU materials this way.
 */
export const RENDER_GROUPS = {
  g_concrete: { map: 'concrete', normalMap: 'concrete_n', metallicSmoothness: 'concrete_ms', roughness: 0.94, uvScale: 0.2, normalScale: 0.7 },
  g_concrete_dark: { map: 'concrete_dark', normalMap: 'concrete_n', roughness: 0.95, uvScale: 0.22, normalScale: 0.6 },
  g_sidewalk: { map: 'sidewalk', normalMap: 'concrete_n', roughness: 0.93, uvScale: 0.28, normalScale: 0.5 },
  g_asphalt: { map: 'asphalt', normalMap: 'asphalt_n', roughness: 0.86, uvScale: 0.14, normalScale: 0.5 },
  g_brick: { map: 'brick', normalMap: 'brick_n', roughness: 0.93, uvScale: 0.3, normalScale: 0.8 },
  g_plaster: { map: 'plaster', roughness: 0.95, uvScale: 0.26 },
  g_tile_metro: { map: 'tile_metro', normalMap: 'tile_metro_n', roughness: 0.72, uvScale: 0.35, normalScale: 0.6 },
  g_roof_gravel: { map: 'roof_gravel', roughness: 0.97, uvScale: 0.3 },
  g_facade_tower: { map: 'facade_tower', emissiveMap: 'facade_tower_emis', normalMap: 'facade_tower_n', emissiveIntensity: 1.7, roughness: 0.82, metalness: 0.04, uvScale: 1 / 12, normalScale: 0.55 },
  g_facade_res: { map: 'facade_res', emissiveMap: 'facade_res_emis', emissiveIntensity: 1.7, roughness: 0.82, metalness: 0.04, uvScale: 1 / 10 },
  g_facade_glass: { map: 'facade_glass', emissiveMap: 'facade_glass_emis', metallicSmoothness: 'facade_glass_ms', emissiveIntensity: 1.5, roughness: 0.28, metalness: 0.55, uvScale: 1 / 14 },
  g_facade_slum: { map: 'facade_slum', emissiveMap: 'facade_slum_emis', normalMap: 'facade_slum_n', emissiveIntensity: 1.6, roughness: 0.84, uvScale: 1 / 8, normalScale: 0.55 },
  g_metal: { map: 'metal_panel', normalMap: 'metal_panel_n', metallicSmoothness: 'metal_ms', roughness: 0.5, metalness: 0.8, uvScale: 0.5, normalScale: 0.9 },
  g_metal_rust: { map: 'metal_rust', normalMap: 'metal_panel_n', roughness: 0.84, metalness: 0.4, uvScale: 0.45, normalScale: 0.8 },
  g_grate: { map: 'metal_panel', roughness: 0.7, metalness: 0.7, uvScale: 1.4 },
  g_painted: { roughness: 0.34, metalness: 0.72 },
  g_flatdark: { roughness: 0.62, metalness: 0.06 },
  g_wood: { map: 'plaster', roughness: 0.9, uvScale: 0.5 },
  g_fabric: { roughness: 0.8, side: 'double' },
  g_glass: { roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.5 },
  g_emissive: { emissiveFromVertexColor: true, emissiveIntensity: 3.2, roughness: 0.45, bloom: true },
  g_neon_bars: { emissiveMap: 'neon_bars', emissiveIntensity: 2.8, roughness: 0.5, bloom: true, emissiveFromVertexColor: true },
  g_cloud: { map: 'cloud_puff', transparent: true, opacity: 0.32, depthWrite: false, unlit: true },
  g_silhouette: { roughness: 1 },
  g_water: { roughness: 0.15, metalness: 0.5 },
  g_decal_lines: { map: 'road_lines', transparent: true, alphaTest: 0.35, roughness: 0.9, polygonOffset: true },
  g_decal_grime: { map: 'grime_decal', transparent: true, alphaTest: 0.08, opacity: 0.8, roughness: 0.95, polygonOffset: true },
};

const GROUP_OF = {
  concrete_a: 'g_concrete', concrete_b: 'g_concrete', concrete_c: 'g_concrete', concrete_d: 'g_concrete',
  podium_concrete: 'g_concrete', safety_floor: 'g_concrete',
  concrete_dark: 'g_concrete_dark', sleeper_concrete: 'g_concrete_dark',
  sidewalk_a: 'g_sidewalk', sidewalk_b: 'g_sidewalk',
  asphalt_a: 'g_asphalt', asphalt_wet: 'g_asphalt',
  brick_a: 'g_brick', brick_b: 'g_brick',
  plaster_a: 'g_plaster', plaster_b: 'g_plaster',
  tile_metro: 'g_tile_metro', roof_gravel: 'g_roof_gravel',
  metal_a: 'g_metal', metal_b: 'g_metal', metal_c: 'g_metal', pipe_metal: 'g_metal',
  metal_rust_a: 'g_metal_rust', metal_rust_b: 'g_metal_rust',
  grate_metal: 'g_grate',
  rail_steel: 'g_painted', antenna_metal: 'g_painted', catenary: 'g_painted',
  car_body_a: 'g_painted', car_body_b: 'g_painted', car_body_c: 'g_painted',
  car_body_d: 'g_painted', car_body_e: 'g_painted', car_body_f: 'g_painted',
  plastic_dark: 'g_flatdark', rubber_tyre: 'g_flatdark',
  wood_a: 'g_wood',
  awning_a: 'g_fabric', awning_b: 'g_fabric', awning_c: 'g_fabric', awning_d: 'g_fabric', cloth_white: 'g_fabric',
  glass_dark: 'g_glass', glass_shop: 'g_glass', car_glass: 'g_glass',
  neon_bars_a: 'g_neon_bars',
  cloud_billboard: 'g_cloud',
  silhouette_a: 'g_silhouette', silhouette_b: 'g_silhouette', silhouette_c: 'g_silhouette',
  water_dark: 'g_water',
  decal_road_lines: 'g_decal_lines', decal_grime: 'g_decal_grime',
};
for (const n of ['neon_pink', 'neon_cyan', 'neon_red', 'neon_white', 'neon_purple', 'neon_green', 'neon_orange', 'neon_blue',
  'light_warm', 'light_white', 'light_red', 'light_amber', 'shop_glow', 'car_light_front', 'car_light_rear']) GROUP_OF[n] = 'g_emissive';
for (const [b, fam] of [['facade_tower', 'g_facade_tower'], ['facade_res', 'g_facade_res'], ['facade_glass', 'g_facade_glass'], ['facade_slum', 'g_facade_slum']]) {
  for (const s of 'abcd') GROUP_OF[`${b}_${s}`] = fam;
}
// the canvas-drawn advertisements and sign plates keep their own materials --
// each carries different artwork, and there are only a few hundred placements.
for (let i = 1; i <= 8; i++) { RENDER_GROUPS[`g_ad_${i}`] = { canvas: `ad${i}`, emissiveIntensity: 1.55, roughness: 0.55, bloom: true, emissiveFromCanvas: true }; GROUP_OF[`ad_screen_${i}`] = `g_ad_${i}`; }
for (let i = 1; i <= 6; i++) { RENDER_GROUPS[`g_sign_${i}`] = { canvas: `sign${i}`, emissiveIntensity: 1.8, roughness: 0.5, bloom: true, emissiveFromCanvas: true }; GROUP_OF[`sign_plate_${i}`] = `g_sign_${i}`; }

/** Attach `group` + `tint` to every city material category. */
export function assignRenderGroups(materials) {
  const missing = [];
  for (const [name, def] of Object.entries(materials)) {
    const g = GROUP_OF[name];
    if (!g) { missing.push(name); continue; }
    def.group = g;
    // the tint the render group's vertex colours will carry
    def.tint = RENDER_GROUPS[g].emissiveFromVertexColor ? (def.emissive || def.color || '#ffffff') : (def.color || '#ffffff');
  }
  if (missing.length) throw new Error('materials with no render group: ' + missing.join(', '));
  return { groups: RENDER_GROUPS, groupCount: Object.keys(RENDER_GROUPS).length };
}
