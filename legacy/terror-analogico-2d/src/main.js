// Punto de entrada en el navegador: conecta teclado/ratón, el bucle de juego y la interfaz (HUD).
import { parseWorld } from './world.js';
import { createGame, update } from './game.js';
import { render, drawStatic } from './render.js';
import { startAudio, setNoise, stopAudio } from './audio.js';
import { formatTimestamp } from './logic.js';
import { TAPES } from './content.js';
import { TAPE_PLAY_TIME } from './config.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');

// Elementos de la interfaz. Los IDs deben coincidir con index.html.
const ui = {
  start: $('screen-start'),
  end: $('screen-end'),
  endTitle: $('end-title'),
  endMsg: $('end-msg'),
  hud: $('hud'),
  rec: $('rec'),
  tapes: $('tapes'),
  signal: $('signal-bar'),
  subtitle: $('subtitle'),
  tape: $('tape'),
  tapeTitle: $('tape-title'),
  tapeText: $('tape-text'),
};

const keys = new Set();
let aimAngle = 0;
let interactQueued = false;
let state = 'menu'; // 'menu' | 'playing' | 'over'
let game = null;
let last = performance.now();
let time = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if ((e.code === 'Enter' || e.code === 'KeyR') && state !== 'playing') startGame();
  if (e.code === 'KeyE' && !e.repeat) interactQueued = true;
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('pointermove', (e) => {
  aimAngle = Math.atan2(e.clientY - canvas.height / 2, e.clientX - canvas.width / 2);
});

function startGame() {
  game = createGame(parseWorld());
  state = 'playing';
  ui.start.classList.add('hidden');
  ui.end.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  startAudio();
}

function showEnd() {
  state = 'over';
  stopAudio();
  ui.hud.classList.add('hidden');
  ui.tape.classList.add('hidden');
  ui.endTitle.textContent = game.endTitle;
  ui.endMsg.textContent = game.endMessage;
  ui.end.classList.remove('hidden');
}

function updateHud() {
  ui.rec.textContent = `● REC  ${formatTimestamp(game.elapsed)}`;
  ui.tapes.textContent = `CINTAS ${game.played.size}/${TAPES.length}`;
  ui.signal.style.width = `${Math.round(game.signal * 100)}%`;
  ui.subtitle.textContent = game.message || game.prompt;

  if (game.playing) {
    const tape = TAPES[game.playing.idx];
    const shown = Math.floor((game.playing.t / TAPE_PLAY_TIME) * tape.text.length);
    ui.tape.classList.remove('hidden');
    ui.tapeTitle.textContent = tape.title;
    ui.tapeText.textContent = tape.text.slice(0, shown);
  } else {
    ui.tape.classList.add('hidden');
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (state === 'playing') {
    const input = {
      up: keys.has('KeyW') || keys.has('ArrowUp'),
      down: keys.has('KeyS') || keys.has('ArrowDown'),
      left: keys.has('KeyA') || keys.has('ArrowLeft'),
      right: keys.has('KeyD') || keys.has('ArrowRight'),
      interact: interactQueued,
      aimAngle,
    };
    interactQueued = false;

    update(game, input, dt);
    render(ctx, canvas, game, time);

    const noise = 1 - game.signal;
    drawStatic(ctx, canvas, noise, time);
    setNoise(noise);
    updateHud();

    if (game.status !== 'playing') showEnd();
  } else {
    interactQueued = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawStatic(ctx, canvas, state === 'menu' ? 0.35 : 0.6, time);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
