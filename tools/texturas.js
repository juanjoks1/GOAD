// Galería de texturas para iterar sin entrar al juego: npm run dev y abre /tools/texturas.html
// Cada textura se muestra repetida 2×2 para revisar que no tenga costuras.
import { mudCanvas } from '../src/textures/ground.js';
import { birchBarkCanvas, darkBarkCanvas, postWoodCanvas, plankCanvas, hutLogsCanvas } from '../src/textures/wood.js';
import { willowLeavesCanvas, birchLeavesCanvas, bushCanvas, reedsCanvas, grassCanvas } from '../src/textures/foliage.js';
import { thatchCanvas, thatchFringeCanvas } from '../src/textures/thatch.js';
import { hexFloorCanvas, archWallCanvas, dampWallCanvas, wetFloorCanvas } from '../src/textures/concrete.js';
import { spiralCanvas, restrictedSignCanvas } from '../src/textures/symbols.js';
import { metalDoorCanvas, steelCanvas } from '../src/textures/metal.js';
import { cloudsCanvas, waterNoiseCanvas, glowCanvas } from '../src/textures/sky.js';
import { grinnerCanvas, stalkerCanvas, watcherCanvas, percherCanvas } from '../src/textures/entities.js';

const textures = {
  grinnerCanvas, stalkerCanvas, watcherCanvas, percherCanvas,
  mudCanvas, birchBarkCanvas, darkBarkCanvas, postWoodCanvas, plankCanvas, hutLogsCanvas,
  willowLeavesCanvas, birchLeavesCanvas, bushCanvas, reedsCanvas, grassCanvas,
  thatchCanvas, thatchFringeCanvas, hexFloorCanvas, archWallCanvas, dampWallCanvas, wetFloorCanvas,
  spiralCanvas, restrictedSignCanvas, metalDoorCanvas, steelCanvas, cloudsCanvas, waterNoiseCanvas, glowCanvas,
};

const grid = document.getElementById('grid');
for (const [name, make] of Object.entries(textures)) {
  const src = make();
  const tiled = document.createElement('canvas');
  tiled.width = src.width * 2;
  tiled.height = src.height * 2;
  const ctx = tiled.getContext('2d');
  for (const x of [0, src.width]) for (const y of [0, src.height]) ctx.drawImage(src, x, y);
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = `${name.replace('Canvas', '')}  ${src.width}×${src.height}`;
  fig.append(tiled, cap);
  grid.append(fig);
}
