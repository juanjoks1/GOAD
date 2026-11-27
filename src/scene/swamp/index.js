// Escena 1: el pantano, la choza y el pasillo subterráneo.
// Una escena es un objeto con: scene (THREE.Scene), physics, spawn, interactables, update() y dispose().
import * as THREE from 'three';
import { ATMOSPHERE } from '../../config.js';
import { clamp } from '../../core/math.js';
import { SPAWN, HUT, FLOOR_Y, CORRIDOR, CORRIDOR_Y, METAL_DOOR_WORLD, BRIDGE, STAIRS, stairHeightAt } from '../../world/layout.js';
import { heightAt } from '../../world/terrain.js';
import { createSwampPhysics } from '../../world/swampPhysics.js';
import { interiorFactor, doorProximity, HUT_ZONE_LEVEL } from '../../world/zones.js';
import { PROMPT_DOOR, PROMPT_DOOR_TOUCH } from '../../content/texts.js';
import { createSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createVegetation } from './vegetation.js';
import { createProps } from './props.js';
import { createHut } from './hut.js';
import { createUnderground } from './underground.js';

/** Identificador de la escena que se cargará al cruzar la puerta metálica (todavía no existe). */
export const NEXT_LEVEL_ID = 'subterraneo-2';

const fogExterior = new THREE.Color(ATMOSPHERE.exterior.fogColor);
const fogHut = new THREE.Color(ATMOSPHERE.hut.fogColor);
const fogUnder = new THREE.Color(ATMOSPHERE.underground.fogColor);

/** Puntos de inicio para depurar (?spawn=...). */
export const DEBUG_SPAWNS = {
  inicio: { x: SPAWN.x, y: heightAt(SPAWN.x, SPAWN.z), z: SPAWN.z, yaw: SPAWN.yaw, pitch: 0 },
  puente: { x: BRIDGE.x + 0.2, y: heightAt(0.2, BRIDGE.z + 6), z: BRIDGE.z + 6, yaw: 0, pitch: -0.05 },
  claro: { x: HUT.x + 1.5, y: heightAt(1.5, HUT.z + 11), z: HUT.z + 11, yaw: 0.1, pitch: 0.05 },
  choza: { x: HUT.x + 0.4, y: FLOOR_Y, z: HUT.z + 3.2, yaw: 0.05, pitch: -0.32 },
  escalera: { x: HUT.x, y: stairHeightAt(-1.5), z: HUT.z - 1.5, yaw: 0, pitch: -0.25 },
  pasillo: { x: HUT.x, y: CORRIDOR_Y, z: HUT.z + STAIRS.zBottom - 1, yaw: 0, pitch: 0 },
  puerta: { x: HUT.x + 0.1, y: CORRIDOR_Y, z: HUT.z + CORRIDOR.zEnd + 1.6, yaw: 0, pitch: -0.05 },
};

export function createSwampLevel({ textures, timeUniform }) {
  const scene = new THREE.Scene();
  scene.background = fogExterior.clone();
  scene.fog = new THREE.FogExp2(fogExterior.clone(), ATMOSPHERE.exterior.fogDensity);

  const hemi = new THREE.HemisphereLight(ATMOSPHERE.hemiSky, ATMOSPHERE.hemiGround, ATMOSPHERE.hemiIntensity);
  const sun = new THREE.DirectionalLight(ATMOSPHERE.sunColor, ATMOSPHERE.sunIntensity);
  sun.position.set(...ATMOSPHERE.sunDirection);
  scene.add(hemi, sun);

  const underground = createUnderground(textures);
  scene.add(
    createSky(textures, timeUniform),
    createTerrain(textures),
    createWater(textures, timeUniform),
    createVegetation(textures, timeUniform),
    createProps(textures),
    createHut(textures),
    underground.group,
  );

  const physics = createSwampPhysics();
  let zone = 0;

  return {
    id: 'pantano',
    scene,
    physics,
    spawn: { x: SPAWN.x, y: heightAt(SPAWN.x, SPAWN.z), z: SPAWN.z, yaw: SPAWN.yaw, pitch: 0 },
    debugSpawns: DEBUG_SPAWNS,
    interactables: [
      {
        id: 'puerta-metalica',
        position: METAL_DOOR_WORLD,
        prompt: PROMPT_DOOR,
        promptTouch: PROMPT_DOOR_TOUCH,
        action: { type: 'exit', to: NEXT_LEVEL_ID, sound: 'metal-door' },
      },
    ],
    get zone() {
      return zone;
    },

    /** Zona actual y proximidad a la puerta para el audio. */
    sample(position) {
      return {
        zone: interiorFactor(position.x, position.y, position.z),
        door: doorProximity(position.x, position.y, position.z),
      };
    },

    update(dt, time, position) {
      underground.update(time);
      // La niebla cambia con la zona: gris verdosa afuera, casi negra bajo tierra.
      const target = interiorFactor(position.x, position.y, position.z);
      zone += (target - zone) * clamp(dt * 3, 0, 1);
      const fog = scene.fog;
      if (zone <= HUT_ZONE_LEVEL) {
        const t = zone / HUT_ZONE_LEVEL;
        fog.color.copy(fogExterior).lerp(fogHut, t * 0.6);
        fog.density = ATMOSPHERE.exterior.fogDensity + (ATMOSPHERE.hut.fogDensity - ATMOSPHERE.exterior.fogDensity) * t;
      } else {
        const t = (zone - HUT_ZONE_LEVEL) / (1 - HUT_ZONE_LEVEL);
        fog.color.copy(fogExterior).lerp(fogHut, 0.6).lerp(fogUnder, t);
        fog.density = ATMOSPHERE.hut.fogDensity + (ATMOSPHERE.underground.fogDensity - ATMOSPHERE.hut.fogDensity) * t;
      }
      scene.background.copy(fog.color);
    },

    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    },
  };
}

