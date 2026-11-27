// Registro de escenas. Para añadir una zona liminal nueva:
//   1. Crea src/scene/<zona>/index.js que exporte una función como createSwampLevel.
//   2. Regístrala aquí con el id que usa la puerta de la escena anterior (p. ej. 'subterraneo-2').
// Si el id no está registrado, el juego muestra la pantalla final de la versión de evaluación.
import { createSwampLevel } from './swamp/index.js';

export const LEVELS = {
  pantano: createSwampLevel,
};

export const FIRST_LEVEL = 'pantano';
