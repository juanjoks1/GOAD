// Capa 2D (640×480, pixelada) encima del 3D: pantalla inicial, pausa, avisos y final.
import { RENDER } from '../config.js';
import {
  INTRO_HEADER, INTRO_PROMPT, INTRO_PROMPT_TOUCH, INTRO_FOOTER, LOADING, introLines,
  PAUSE_TITLE, PAUSE_PROMPT, PAUSE_PROMPT_TOUCH, PAUSE_HELP, PAUSE_HELP_TOUCH, PAUSE_TIPS,
  END_LINES, END_PROMPT, END_PROMPT_TOUCH,
  DEAD_CHANNEL, DEAD_TITLE, DEAD_PROMPT, DEAD_PROMPT_TOUCH, deadLine,
} from '../content/texts.js';
import { drawText, textWidth } from './pixelText.js';

const W = RENDER.uiWidth;
const H = RENDER.uiHeight;
const TEXT = '#bfc4b8';
const DIM = '#7d8278';
const LINE_H = 20;

/** Cuántos caracteres de `lines` mostrar (efecto de máquina de escribir). */
function typed(lines, chars) {
  const out = [];
  let left = chars;
  for (const line of lines) {
    if (left <= 0) break;
    out.push(line.slice(0, left));
    left -= line.length + 1;
  }
  return out;
}

export const totalChars = (list) => list.reduce((n, l) => n + l.length + 1, 0);

/**
 * La cruz de madera en la mano, abajo a la derecha (pixel art con rectángulos).
 * Tiembla cuando se está gastando; agrietada y caída cuando se agotó. Barra de carga al lado.
 */
function drawCross(ctx, cross, time) {
  const raised = cross.active;
  const shake = raised ? (1 - cross.level) * 3 : 0;
  const jx = Math.round(Math.sin(time * 47) * shake);
  const jy = Math.round(Math.cos(time * 39) * shake);
  const cx = W - 150 + jx;
  const top = (raised ? H - 250 : H - 130) + jy;
  ctx.save();
  if (cross.broken) {
    ctx.translate(cx, top + 120);
    ctx.rotate(0.5);
    ctx.translate(-cx, -(top + 120));
  }
  if (raised) {
    // Halo pálido con escalones.
    for (const [r, a] of [[70, 0.06], [48, 0.08], [30, 0.1]]) {
      ctx.fillStyle = `rgba(255,244,200,${a})`;
      ctx.fillRect(cx - r, top + 40 - r, r * 2, r * 2);
    }
  }
  const wood = cross.broken ? '#3a2a1c' : '#5c4128';
  const dark = '#2e2014';
  const light = cross.broken ? '#4a3626' : '#7a5a38';
  // Palo vertical y travesaño.
  ctx.fillStyle = wood;
  ctx.fillRect(cx - 7, top, 14, 150);
  ctx.fillRect(cx - 30, top + 30, 60, 13);
  ctx.fillStyle = light;
  ctx.fillRect(cx - 7, top, 3, 150);
  ctx.fillRect(cx - 30, top + 30, 60, 3);
  ctx.fillStyle = dark;
  for (let y = top + 8; y < top + 150; y += 17) ctx.fillRect(cx - 1, y, 2, 7);
  ctx.fillRect(cx - 30, top + 41, 60, 2);
  if (cross.broken) {
    ctx.fillStyle = '#120c08';
    ctx.fillRect(cx - 2, top + 50, 4, 26);
    ctx.fillRect(cx + 2, top + 70, 4, 14);
  }
  // Mano (puño pálido y sucio) sujetando el palo.
  const hy = top + 100;
  ctx.fillStyle = '#9c8670';
  ctx.fillRect(cx - 20, hy, 40, 34);
  ctx.fillStyle = '#b39c84';
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - 18 + i * 9, hy + 2, 7, 9);
  ctx.fillStyle = '#6f5c4a';
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - 18 + i * 9, hy + 11, 7, 2);
  ctx.fillRect(cx - 20, hy + 34, 40, 40);
  ctx.restore();

  // Barra de carga.
  const bx = W - 30;
  const by = H - 170;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx, by, 8, 120);
  ctx.fillStyle = cross.broken ? '#7a2a20' : '#d8cfa8';
  const h = Math.round(118 * cross.level);
  ctx.fillRect(bx + 1, by + 119 - h, 6, h);
}

/** `touch`: muestra los textos de los controles táctiles en lugar de teclado y ratón. */
export function createOverlay(canvas, { touch = false } = {}) {
  const lines = introLines(touch);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const cursor = (time) => Math.floor(time * 2.2) % 2 === 0;

  return {
    clear() {
      ctx.clearRect(0, 0, W, H);
    },

    loading(progress) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const blocks = Math.round(progress * 20);
      drawText(ctx, `${LOADING} ${'█'.repeat(blocks)}${'░'.repeat(20 - blocks)}`, 40, H / 2 - 10, { color: DIM });
    },

    intro(chars, time, alpha = 1) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#a9aca2';
      ctx.fillRect(0, 22, W, 20);
      drawText(ctx, INTRO_HEADER, W / 2, 24, { color: '#101010', align: 'center' });
      const shown = typed(lines, chars);
      shown.forEach((line, i) => drawText(ctx, line, 40, 72 + i * LINE_H, { color: TEXT }));
      const done = chars >= totalChars(lines);
      if (!done && shown.length && cursor(time * 2)) {
        const last = shown.length - 1;
        drawText(ctx, '_', 40 + textWidth(shown[last]), 72 + last * LINE_H, { color: TEXT });
      }
      if (done && cursor(time)) drawText(ctx, touch ? INTRO_PROMPT_TOUCH : INTRO_PROMPT, W / 2, H - 96, { color: TEXT, align: 'center' });
      drawText(ctx, INTRO_FOOTER, W / 2, H - 40, { color: '#4c5049', align: 'center', size: 12 });
      ctx.globalAlpha = 1;
      return done;
    },

    pause(time) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, PAUSE_TITLE, W / 2, H / 2 - 70, { color: TEXT, align: 'center', size: 20 });
      (touch ? PAUSE_HELP_TOUCH : PAUSE_HELP).forEach((l, i) => drawText(ctx, l, W / 2, H / 2 - 30 + i * LINE_H, { color: DIM, align: 'center' }));
      PAUSE_TIPS.forEach((l, i) => drawText(ctx, l, W / 2, H / 2 + 20 + i * LINE_H, { color: '#5f645a', align: 'center', size: 13 }));
      if (cursor(time)) drawText(ctx, touch ? PAUSE_PROMPT_TOUCH : PAUSE_PROMPT, W / 2, H / 2 + 80, { color: TEXT, align: 'center' });
    },

    /**
     * Capa del juego: aviso de interacción y la cruz en la mano.
     * @param {{ prompt?: string|null, cross?: { level: number, active: boolean, broken: boolean }|null, time: number }} hud
     */
    hud({ prompt = null, cross = null, time = 0 }) {
      ctx.clearRect(0, 0, W, H);
      if (cross && (cross.active || cross.broken || cross.level < 0.999)) drawCross(ctx, cross, time);
      if (prompt) drawText(ctx, prompt, W / 2, H - 92, { color: '#d6dacf', align: 'center', shadow: '#000000' });
    },

    /** Pantalla azul de VCR: te atrapó una entidad. */
    dead(kind, time) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0d1f9c';
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, DEAD_CHANNEL, 40, 34, { color: '#e8ecff', size: 20 });
      drawText(ctx, DEAD_TITLE, W / 2, H / 2 - 50, { color: '#ffffff', align: 'center', size: 32 });
      drawText(ctx, deadLine(kind), W / 2, H / 2 + 6, { color: '#c8d0ff', align: 'center' });
      if (cursor(time)) drawText(ctx, touch ? DEAD_PROMPT_TOUCH : DEAD_PROMPT, W / 2, H - 96, { color: '#e8ecff', align: 'center' });
      // Línea de "tracking" que baja despacio.
      const y = Math.floor((time * 40) % H);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, y, W, 6);
    },

    end(chars, time) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const shown = typed(END_LINES, chars);
      const top = H / 2 - (END_LINES.length * LINE_H) / 2 - 30;
      // Centrado según la línea completa, para que el texto no se desplace mientras se escribe.
      shown.forEach((line, i) => drawText(ctx, line, W / 2 - textWidth(END_LINES[i]) / 2, top + i * LINE_H, { color: TEXT }));
      const done = chars >= totalChars(END_LINES);
      if (done && cursor(time)) drawText(ctx, touch ? END_PROMPT_TOUCH : END_PROMPT, W / 2, H - 96, { color: DIM, align: 'center' });
      return done;
    },
  };
}
