// Genera (una sola vez) todas las texturas procedurales del juego.
// Para iterar una textura: edita su generador en este directorio y recarga; Vite recarga al guardar.
import { toTexture } from './canvas.js';
import { mudCanvas } from './ground.js';
import { birchBarkCanvas, darkBarkCanvas, postWoodCanvas, plankCanvas, hutLogsCanvas } from './wood.js';
import { willowLeavesCanvas, birchLeavesCanvas, bushCanvas, reedsCanvas, grassCanvas } from './foliage.js';
import { thatchCanvas, thatchFringeCanvas } from './thatch.js';
import { hexFloorCanvas, archWallCanvas, dampWallCanvas, wetFloorCanvas } from './concrete.js';
import { spiralCanvas, restrictedSignCanvas } from './symbols.js';
import { metalDoorCanvas, steelCanvas } from './metal.js';
import { cloudsCanvas, waterNoiseCanvas, glowCanvas } from './sky.js';
import { grinnerCanvas, stalkerCanvas, watcherCanvas, percherCanvas } from './entities.js';

export function createTextureLibrary() {
  return {
    mud: toTexture(mudCanvas()),
    birchBark: toTexture(birchBarkCanvas()),
    darkBark: toTexture(darkBarkCanvas()),
    postWood: toTexture(postWoodCanvas()),
    plank: toTexture(plankCanvas()),
    hutLogs: toTexture(hutLogsCanvas()),
    willowLeaves: toTexture(willowLeavesCanvas(), { wrap: false }),
    birchLeaves: toTexture(birchLeavesCanvas(), { wrap: false }),
    bush: toTexture(bushCanvas(), { wrap: false }),
    reeds: toTexture(reedsCanvas(), { wrap: false }),
    grass: toTexture(grassCanvas(), { wrap: false }),
    thatch: toTexture(thatchCanvas()),
    thatchFringe: toTexture(thatchFringeCanvas()),
    hexFloor: toTexture(hexFloorCanvas()),
    archWall: toTexture(archWallCanvas()),
    dampWall: toTexture(dampWallCanvas()),
    wetFloor: toTexture(wetFloorCanvas()),
    spiral: toTexture(spiralCanvas(), { wrap: false }),
    sign: toTexture(restrictedSignCanvas(), { wrap: false }),
    metalDoor: toTexture(metalDoorCanvas(), { wrap: false }),
    steel: toTexture(steelCanvas()),
    clouds: toTexture(cloudsCanvas()),
    waterNoise: toTexture(waterNoiseCanvas(), { mag: 'linear', min: 'linear-mipmap' }),
    glow: toTexture(glowCanvas(), { wrap: false }),
    grinner: toTexture(grinnerCanvas(), { wrap: false }),
    stalker: toTexture(stalkerCanvas(), { wrap: false }),
    watcher: toTexture(watcherCanvas(), { wrap: false }),
    percher: toTexture(percherCanvas(), { wrap: false }),
  };
}

/** Copia de una textura con otra repetición (comparte la imagen en GPU). */
export function withRepeat(texture, rx, ry) {
  const t = texture.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
