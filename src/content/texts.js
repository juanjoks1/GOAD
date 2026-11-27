// Textos del juego (en español). Edita aquí la premisa, los avisos y el final.

export const TITLE = 'CIÉNAGA';

/** Barra superior de la pantalla inicial, estilo instalador shareware. */
export const INTRO_HEADER = ' CIENAGA.EXE                               v0.9 shareware ';

/** Pantalla inicial: se escribe letra a letra (seguida de los controles). */
export const INTRO_STORY = [
  'Copia de evaluación. Puede distribuirse libremente.',
  '',
  'En octubre de 2004, un topógrafo del condado anotó',
  'una construcción circular en la ciénaga de San Lázaro.',
  'No aparecía en el catastro ni en las fotos aéreas.',
  '',
  'Volvió tres veces a medir el terreno.',
  'En sus notas, el pasillo era más largo cada vez.',
  '',
  'No hay nada que encontrar. Camina, y no mires demasiado.',
  '',
];

export const CONTROLS_KEYBOARD = [
  '   [WASD] caminar   [SHIFT] correr   [C] agacharse',
  '   [RATÓN] mirar    [Q / CLIC DER.] levantar la cruz',
  '   [E] usar         [ESC] pausa',
];
export const CONTROLS_TOUCH = [
  '   [IZQUIERDA] caminar (al tope: correr)',
  '   [DERECHA] mirar    [CRUZ] mantener para repeler',
  '   [AGACHAR] esconderse    [TOCAR] usar',
];

/** Texto completo de la pantalla inicial según el tipo de control. */
export const introLines = (touch) => [...INTRO_STORY, ...(touch ? CONTROLS_TOUCH : CONTROLS_KEYBOARD)];

export const INTRO_PROMPT = 'Haz clic para comenzar';
export const INTRO_PROMPT_TOUCH = 'Toca la pantalla para comenzar';
export const INTRO_FOOTER = '(c) 2005 Estudio Humedal. Todos los derechos reservados.';

export const LOADING = 'CARGANDO';

export const PAUSE_TITLE = 'PAUSA';
export const PAUSE_PROMPT = 'Haz clic para continuar';
export const PAUSE_PROMPT_TOUCH = 'Toca para continuar';
export const PAUSE_HELP = ['[WASD] caminar  [SHIFT] correr  [C] agacharse', '[RATÓN] mirar  [Q / CLIC DER.] cruz  [E] usar'];
export const PAUSE_HELP_TOUCH = ['[IZQUIERDA] caminar (al tope: correr)', '[DERECHA] mirar  [CRUZ] repeler  [AGACHAR]'];

/** Consejos que aparecen en la pausa: cómo sobrevivir. */
export const PAUSE_TIPS = ['Si no las miras, son más lentas.', 'Agachado entre arbustos no te ven.'];

export const PROMPT_DOOR = '[E] Abrir';
export const PROMPT_DOOR_TOUCH = 'Toca para abrir';

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
export const END_PROMPT_TOUCH = 'Toca para volver al pantano';

/** Nombres de las entidades (para la pantalla de "te atrapó"). */
export const ENTITY_NAMES = {
  stalker: 'El Alto',
  percher: 'La Aguja',
  watcher: 'El del Sombrero',
  grinner: 'El Sonriente',
};

/** Pantalla azul de VCR cuando una entidad te atrapa. */
export const DEAD_CHANNEL = 'AV-1';
export const DEAD_TITLE = 'SEÑAL PERDIDA';
export const deadLine = (kind) => `Te encontró ${ENTITY_NAMES[kind] ?? 'algo'}.`;
export const DEAD_PROMPT = 'Haz clic para volver a intentarlo';
export const DEAD_PROMPT_TOUCH = 'Toca para volver a intentarlo';
