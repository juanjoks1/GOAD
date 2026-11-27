// Dibujo en canvas: mundo, oscuridad con linterna, la Señal y la estática.
// Solo usa la API de canvas; no cambia el estado del juego.
import { TILE, FLASHLIGHT_RANGE, FLASHLIGHT_FOV, AMBIENT_RADIUS } from './config.js';

const COLORS = {
  wall: '#2b2521',
  wallEdge: '#3f362e',
  floor: '#171512',
  door: '#5a4422',
  vcr: '#2f2f3a',
  vcrLed: '#7dff7d',
  tape: '#e8d88a',
  exitLocked: '#6b1717',
  exitOpen: '#2f7a3a',
};

let lightLayer = null;
let lightCtx = null;

// Dibuja un fotograma completo del juego (sin la estática, que se dibuja aparte).
export function render(ctx, canvas, game, time) {
  const w = canvas.width;
  const h = canvas.height;
  const camX = Math.round(game.player.x - w / 2);
  const camY = Math.round(game.player.y - h / 2);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(-camX, -camY);
  drawWorld(ctx, game, camX, camY, w, h);
  drawEntity(ctx, game.entity, time);
  ctx.restore();

  applyDarkness(ctx, w, h, game);
}

// Estática: más densa cuanto menor es la señal. `noise` va de 0 a 1.
export function drawStatic(ctx, canvas, noise, time) {
  if (noise <= 0.02) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#fff';
  const count = Math.floor(noise * 900);
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.08 + Math.random() * 0.3 * noise;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;

  // Banda de tracking que sube por la pantalla
  const bandY = ((time * 140) % (h + 120)) - 60;
  const g = ctx.createLinearGradient(0, bandY - 30, 0, bandY + 30);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, `rgba(255,255,255,${(0.18 * noise).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, bandY - 30, w, 60);
}

function drawWorld(ctx, game, camX, camY, w, h) {
  const world = game.world;
  const tx0 = Math.max(0, Math.floor(camX / TILE));
  const tx1 = Math.min(world.width - 1, Math.floor((camX + w) / TILE));
  const ty0 = Math.max(0, Math.floor(camY / TILE));
  const ty1 = Math.min(world.height - 1, Math.floor((camY + h) / TILE));

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const c = world.grid[ty][tx];
      const x = tx * TILE;
      const y = ty * TILE;

      if (c === '#') {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = COLORS.wallEdge;
        ctx.fillRect(x, y, TILE, 3);
        continue;
      }

      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(x, y, TILE, TILE);

      if (c === '+') {
        ctx.fillStyle = COLORS.door;
        ctx.fillRect(x + 2, y, TILE - 4, TILE);
      } else if (c === 'V') {
        ctx.fillStyle = COLORS.vcr;
        ctx.fillRect(x + 3, y + 6, TILE - 6, TILE - 10);
        ctx.fillStyle = COLORS.vcrLed;
        ctx.fillRect(x + 6, y + 10, 3, 3);
      } else if (c === 'X') {
        ctx.fillStyle = game.exitOpen ? COLORS.exitOpen : COLORS.exitLocked;
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  // Cintas pendientes de recoger
  world.tapes.forEach((t, i) => {
    if (game.taken.has(i)) return;
    const x = t.x * TILE;
    const y = t.y * TILE;
    ctx.fillStyle = COLORS.tape;
    ctx.fillRect(x + 8, y + 10, 16, 11);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 11, y + 13, 10, 5);
  });
}

// La Señal: figura alta con cabeza de televisor (estática en la pantalla).
function drawEntity(ctx, ent, time) {
  const glitch = Math.sin(time * 40) > 0.8 ? (Math.random() - 0.5) * 6 : 0;
  const x = ent.x + glitch;
  const y = ent.y;

  ctx.fillStyle = '#050505';
  ctx.fillRect(x - 7, y - 18, 14, 34);          // cuerpo
  ctx.fillRect(x - 9, y - 40, 18, 16);          // carcasa del televisor

  // Pantalla con ruido
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(x - 6, y - 38, 12, 12);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#222';
    ctx.fillRect(x - 6 + Math.random() * 11, y - 38 + Math.random() * 11, 2, 2);
  }
}

// Oscurece todo y "recorta" la luz de la linterna y la luz tenue alrededor del jugador.
function applyDarkness(ctx, w, h, game) {
  if (!lightLayer) {
    lightLayer = document.createElement('canvas');
    lightCtx = lightLayer.getContext('2d');
  }
  if (lightLayer.width !== w || lightLayer.height !== h) {
    lightLayer.width = w;
    lightLayer.height = h;
  }

  const L = lightCtx;
  const cx = w / 2;
  const cy = h / 2;
  const a = game.player.angle;

  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = 'source-over';
  L.fillStyle = 'rgba(0,0,0,0.97)';
  L.fillRect(0, 0, w, h);

  L.globalCompositeOperation = 'destination-out';

  const ambient = L.createRadialGradient(cx, cy, 0, cx, cy, AMBIENT_RADIUS);
  ambient.addColorStop(0, 'rgba(0,0,0,1)');
  ambient.addColorStop(1, 'rgba(0,0,0,0)');
  L.fillStyle = ambient;
  L.beginPath();
  L.arc(cx, cy, AMBIENT_RADIUS, 0, Math.PI * 2);
  L.fill();

  const beam = L.createRadialGradient(cx, cy, 0, cx, cy, FLASHLIGHT_RANGE);
  beam.addColorStop(0, 'rgba(0,0,0,1)');
  beam.addColorStop(0.7, 'rgba(0,0,0,0.85)');
  beam.addColorStop(1, 'rgba(0,0,0,0)');
  L.fillStyle = beam;
  L.beginPath();
  L.moveTo(cx, cy);
  L.arc(cx, cy, FLASHLIGHT_RANGE, a - FLASHLIGHT_FOV / 2, a + FLASHLIGHT_FOV / 2);
  L.closePath();
  L.fill();

  L.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightLayer, 0, 0);
}
