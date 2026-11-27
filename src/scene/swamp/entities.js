// Dibuja las entidades: recortes que giran hacia la cámara, con fallas de cinta.
// Toda la lógica (cuándo aparecen, adónde van) está en src/world/entities.js.
import * as THREE from 'three';
import vertexShader from '../../shaders/entity.vert.glsl?raw';
import fragmentShader from '../../shaders/entity.frag.glsl?raw';
import { ENTITIES } from '../../config.js';
import { createEntityState, stepEntities, ENTITY_SIZES } from '../../world/entities.js';

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
    meshes[kind] = { mesh, opacity: 0 };
  }

  return {
    group,
    /** Estado de las entidades (para depurar desde window.__cienaga.level.entities). */
    state,
    /**
     * @param {{ time, dt, zone, feet, eye, forward }} view
     * @returns {{ interference: number, lightLevel: number, sounds: string[] }}
     */
    update(view) {
      const out = stepEntities(state, view);
      for (const [kind, s] of Object.entries(out.sprites)) {
        const m = meshes[kind];
        // Aparecen y se van con un fundido de trama muy corto (salvo el susto, que es de golpe).
        const target = s.visible ? 1 : 0;
        const rate = kind === 'grinner' ? 30 : 6;
        m.opacity += Math.sign(target - m.opacity) * Math.min(Math.abs(target - m.opacity), view.dt * rate);
        m.mesh.visible = m.opacity > 0.01;
        if (!m.mesh.visible) continue;
        m.mesh.position.set(s.x, s.y, s.z);
        m.mesh.rotation.y = Math.atan2(view.eye.x - s.x, view.eye.z - s.z);
        const u = m.mesh.material.uniforms;
        u.uOpacity.value = m.opacity;
        u.uGlitch.value = 0.06 + out.interference * 0.4;
        // En el susto la cara se ve como bajo un flash; si no, depende de la luz del pasillo.
        u.uBrightness.value = s.flash ? 1.7 : BRIGHTNESS[kind] * (kind === 'grinner' ? out.lightLevel : 1);
      }
      return { interference: out.interference, lightLevel: out.lightLevel, sounds: out.sounds };
    },
  };
}
