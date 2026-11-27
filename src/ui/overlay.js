// Capa 2D (640×480, pixelada) encima del 3D: pantalla inicial, pausa, avisos y final.
import { RENDER } from '../config.js';
import {
  INTRO_HEADER, INTRO_LINES, INTRO_PROMPT, INTRO_FOOTER, LOADING,
  PAUSE_TITLE, PAUSE_PROMPT, PAUSE_HELP, END_LINES, END_PROMPT,
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

export const totalChars = (lines) => lines.reduce((n, l) => n + l.length + 1, 0);

export function createOverlay(canvas) {
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
      const shown = typed(INTRO_LINES, chars);
      shown.forEach((line, i) => drawText(ctx, line, 40, 72 + i * LINE_H, { color: TEXT }));
      const done = chars >= totalChars(INTRO_LINES);
      if (!done && shown.length && cursor(time * 2)) {
        const last = shown.length - 1;
        drawText(ctx, '_', 40 + textWidth(shown[last]), 72 + last * LINE_H, { color: TEXT });
      }
      if (done && cursor(time)) drawText(ctx, INTRO_PROMPT, W / 2, H - 96, { color: TEXT, align: 'center' });
      drawText(ctx, INTRO_FOOTER, W / 2, H - 40, { color: '#4c5049', align: 'center', size: 12 });
      ctx.globalAlpha = 1;
      return done;
    },

    pause(time) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, PAUSE_TITLE, W / 2, H / 2 - 70, { color: TEXT, align: 'center', size: 20 });
      PAUSE_HELP.forEach((l, i) => drawText(ctx, l, W / 2, H / 2 - 20 + i * LINE_H, { color: DIM, align: 'center' }));
      if (cursor(time)) drawText(ctx, PAUSE_PROMPT, W / 2, H / 2 + 60, { color: TEXT, align: 'center' });
    },

    prompt(text) {
      ctx.clearRect(0, 0, W, H);
      drawText(ctx, text, W / 2, H - 92, { color: '#d6dacf', align: 'center', shadow: '#000000' });
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
      if (done && cursor(time)) drawText(ctx, END_PROMPT, W / 2, H - 96, { color: DIM, align: 'center' });
      return done;
    },
  };
}
