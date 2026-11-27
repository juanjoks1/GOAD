// Punto de entrada. Parámetros de URL útiles para iterar:
//   ?skip-intro            empieza jugando, sin pantalla inicial
//   ?spawn=choza           aparece en un punto de depuración (inicio, puente, claro, choza, escalera, pasillo, puerta)
import './core/colorSetup.js';
import './style.css';
import { startGame } from './game/game.js';

const params = new URLSearchParams(window.location.search);
const $ = (id) => document.getElementById(id);

startGame({
  viewport: $('viewport'),
  glCanvas: $('gl'),
  uiCanvas: $('ui'),
  scanlines: $('crt'),
  options: { skipIntro: params.has('skip-intro'), spawn: params.get('spawn') },
})
  .then((game) => {
    if (import.meta.env.DEV) window.__cienaga = game;
  })
  .catch((err) => {
    const box = $('error');
    box.hidden = false;
    box.textContent = `No se pudo iniciar el juego: ${err.message}. Se necesita un navegador con WebGL 2.`;
    throw err;
  });
