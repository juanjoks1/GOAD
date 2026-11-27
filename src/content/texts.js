// Textos del juego (en español). Edita aquí la premisa, los avisos y el final.

export const TITLE = 'CIÉNAGA';

/** Barra superior de la pantalla inicial, estilo instalador shareware. */
export const INTRO_HEADER = ' CIENAGA.EXE                               v0.9 shareware ';

/** Pantalla inicial: se escribe letra a letra. */
export const INTRO_LINES = [
  'Copia de evaluación. Puede distribuirse libremente.',
  '',
  'En octubre de 2004, un topógrafo del condado anotó',
  'una construcción circular en la ciénaga de San Lázaro.',
  'No aparecía en el catastro ni en las fotos aéreas.',
  '',
  'Volvió tres veces a medir el terreno.',
  'En sus notas, el pasillo era más largo cada vez.',
  '',
  'Aquí no hay nada que encontrar. Solo camina.',
  '',
  '   [W A S D] caminar    [RATÓN] mirar    [E] usar',
  '   [ESC] pausa',
];

export const INTRO_PROMPT = 'Haz clic para comenzar';
export const INTRO_FOOTER = '(c) 2005 Estudio Humedal. Todos los derechos reservados.';

export const LOADING = 'CARGANDO';

export const PAUSE_TITLE = 'PAUSA';
export const PAUSE_PROMPT = 'Haz clic para continuar';
export const PAUSE_HELP = ['[W A S D] caminar', '[RATÓN] mirar', '[E] usar'];

export const PROMPT_DOOR = '[E] Abrir';

/** Final de la fase 1 (gancho para la siguiente escena). */
export const END_LINES = [
  'La puerta se cierra detrás de ti.',
  'Del otro lado no se oye el pantano.',
  '',
  '',
  '-- FIN DE LA VERSIÓN DE EVALUACIÓN --',
  '',
  'Para continuar, registra tu copia.',
  '(Tu copia ya está registrada.)',
];
export const END_PROMPT = '[R] volver al pantano';
