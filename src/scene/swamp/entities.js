// Dibuja las entidades: recortes que giran hacia la cámara, con fallas de cinta.
// Mientras persiguen avanzan a saltos (como animación cuadro a cuadro). Toda la lógica está en
// src/world/entities.js.
import * as THREE from 'three';
import vertexShader from '../../shaders/entity.vert.glsl?raw';
import fragmentShader from '../../shaders/entity.frag.glsl?raw';
import { ENTITIES } from '../../config.js';
import { createEntityState, stepEntities, resetAfterCatch, placeInFace, ENTITY_SIZES } from '../../world/entities.js';

/** Brillo de cada entidad según dónde vive (las texturas ya son oscuras). */
const BRIGHTNESS = { stalker: 0.9, percher: 0.95, watcher: 0.6, grinner: 1.0 };
/** Cuánto atraviesan la niebla (1 = como el resto del mundo). */
const FOG_SCALE = { stalker: ENTITIES.stalker.fogScale, percher: 0.8, watcher: 1, grinner: 0.55 };

function entityMaterial(map, timeUniform, fogScale) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: map },
        uGlitch: { value: 0 },
        uBrightness: { value: 1 },
        uOpacity: { value: 1 },
        uFogScale: { value: fogScale },
      },
    ]),
    vertexShader,
    fragmentShader,
    fog: true,
    side: THREE.DoubleSide,
  });
  material.uniforms.uTime = timeUniform;
  return material;
}

export function createEntities(textures, timeUniform) {
  const group = new THREE.Group();
  group.name = 'entidades';
  const state = createEntityState();
  const meshes = {};
  for (const kind of Object.keys(ENTITY_SIZES)) {
    const { width, height } = ENTITY_SIZES[kind];
    const geo = new THREE.PlaneGeometry(width, height);
    geo.translate(0, height / 2, 0); // pie del recorte en el origen
    const mesh = new THREE.Mesh(geo, entityMaterial(textures[kind], timeUniform, FOG_SCALE[kind]));
    mesh.name = kind;
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes[kind] = { mesh, opacity: 0, shown: null, nextFrame: 0 };
  }
  let caught = null; // { kind } mientras su cara llena la pantalla

  return {
    group,
    /** Estado de las entidades (para depurar desde window.__cienaga.level.entities). */
    state,

    /** La entidad que te atrapó se planta frente a la cámara. */
    showCaught(kind) {
      caught = { kind };
    },

    /** Tras volver a un punto de control. */
    reset(time) {
      caught = null;
      resetAfterCatch(state, time);
    },

    /**
     * @param {{ time, dt, zone, feet, eye, forward, crouched, sprinting, crossHeld, world, frozen }} view
     */
    update(view) {
      const out = view.frozen ? null : stepEntities(state, view);
      const sprites = out ? out.sprites : {};
      for (const kind of Object.keys(meshes)) {
        const m = meshes[kind];
        const u = m.mesh.material.uniforms;
        if (caught) {
          // Su cara, a un metro de la tuya, iluminada como por un flash.
          m.mesh.visible = caught.kind === kind;
          if (!m.mesh.visible) continue;
          const p = { kind };
          placeInFace(p, view.eye, view.forward, 0.9);
          m.mesh.position.set(p.x, p.y, p.z);
          m.mesh.rotation.y = Math.atan2(view.eye.x - p.x, view.eye.z - p.z);
          u.uOpacity.value = 1;
          u.uGlitch.value = 0.35 + Math.random() * 0.3;
          u.uBrightness.value = 1.8;
          continue;
        }
        const s = sprites[kind];
        if (!s) continue;
        const target = s.visible ? 1 : 0;
        const rate = kind === 'grinner' ? 30 : 6;
        m.opacity += Math.sign(target - m.opacity) * Math.min(Math.abs(target - m.opacity), view.dt * rate);
        m.mesh.visible = m.opacity > 0.01;
        if (!m.mesh.visible) {
          m.shown = null;
          continue;
        }
        // Cuadro a cuadro mientras se mueve: la posición dibujada salta cada `stutter` segundos.
        if (!m.shown || !s.moving || view.time >= m.nextFrame) {
          m.shown = { x: s.x, y: s.y, z: s.z };
          m.nextFrame = view.time + ENTITIES.stutter * (0.7 + Math.random() * 0.6);
        }
        m.mesh.position.set(m.shown.x, m.shown.y, m.shown.z);
        m.mesh.rotation.y = Math.atan2(view.eye.x - m.shown.x, view.eye.z - m.shown.z);
        u.uOpacity.value = m.opacity;
        u.uGlitch.value = 0.06 + out.interference * 0.4 + (s.moving ? 0.15 : 0);
        // En el susto la cara se ve como bajo un flash; si no, depende de la luz del pasillo.
        u.uBrightness.value = s.flash ? 1.7 : BRIGHTNESS[kind] * (kind === 'grinner' ? out.lightLevel : 1);
      }
      if (!out) return { interference: caught ? 1 : 0, lightLevel: 1, sounds: [], voices: {}, threat: 0, caught: null, cross: null };
      return out;
    },
  };
}
