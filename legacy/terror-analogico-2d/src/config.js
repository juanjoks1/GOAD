// Valores de ajuste del juego. Cambia los números aquí, no dentro de la lógica.
// Distancias en píxeles salvo que se indique lo contrario.

export const TILE = 32;                      // tamaño de una casilla del mapa
export const PLAYER_SPEED = 96;              // px/s
export const PLAYER_RADIUS = 9;              // radio de colisión del jugador

export const FLASHLIGHT_RANGE = 220;         // alcance de la linterna
export const FLASHLIGHT_FOV = Math.PI / 2.6; // ancho del cono de luz (~69 grados)
export const AMBIENT_RADIUS = 70;            // luz tenue alrededor del jugador

export const ENTITY_SPEED = 62;              // px/s; solo se mueve cuando NO la miras
export const ENTITY_TOUCH_DIST = 14;         // si se acerca esto, pierdes
export const SENSE_RANGE = 5 * TILE;         // dentro de esta distancia la señal cae
export const REPATH_INTERVAL = 0.25;         // s entre recálculos de ruta de la entidad

export const SIGNAL_DRAIN = 0.10;            // señal perdida por segundo cerca de la entidad
export const SIGNAL_RECOVER = 0.05;          // señal recuperada por segundo lejos de ella
export const SIGNAL_LOOK_DRAIN = 0.04;       // señal perdida por segundo mientras la miras

export const TAPE_PLAY_TIME = 4;             // s que dura reproducir una cinta en el VCR
export const PICKUP_DIST = TILE * 0.6;       // distancia para recoger una cinta
export const VCR_USE_DIST = TILE * 1.6;      // distancia para usar el VCR
