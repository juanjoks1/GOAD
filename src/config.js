// Valores de ajuste del prototipo. Cambia los números aquí, no dentro de la lógica.
// Distancias en metros, tiempos en segundos, ángulos en radianes.

/** Resolución interna (4:3). Se escala a pantalla completa sin suavizado. */
export const RENDER = {
  width: 480,
  height: 360,
  uiWidth: 640, // los textos se dibujan a 640×480 (también pixelados)
  uiHeight: 480,
  fov: 62,
  near: 0.05,
  far: 600,
  maxDelta: 0.1, // tope del paso de tiempo por fotograma
};

/** Post-procesado retro (src/shaders/retro.frag.glsl). */
export const POST = {
  colorLevels: [31, 63, 31], // RGB565: color de 16 bits
  dither: 0.9, // tramado ordenado (Bayer 4×4) antes de cuantizar
  grain: 0.03, // grano analógico
  vignette: 0.32,
  saturation: 0.74,
  tint: [0.97, 1.02, 0.95], // ligero verde
  scanlines: 0.07, // opacidad de las líneas CRT (capa CSS)
};

/** Filtrado de texturas: 'nearest' marca el píxel; 'linear' lo emborrona como en 2005. */
export const TEXTURES = {
  magFilter: 'nearest',
  minFilter: 'nearest-mipmap',
  posterizeLevels: 28,
};

/** Atmósfera por zona. La zona va de 0 (exterior) a 1 (subterráneo); ver src/world/zones.js. */
export const ATMOSPHERE = {
  exterior: { fogColor: 0x5e655a, fogDensity: 0.05 },
  hut: { fogColor: 0x3b4038, fogDensity: 0.05 },
  underground: { fogColor: 0x090b0a, fogDensity: 0.075 },
  skyTop: 0x7b8379,
  cloudLight: 0x939a8f,
  cloudDark: 0x4a5148,
  hemiSky: 0xa9b1a2,
  hemiGround: 0x2f2a21,
  hemiIntensity: 2.4,
  sunColor: 0xd2d0bd,
  sunIntensity: 1.0,
  sunDirection: [0.4, 1, 0.25],
};

export const PLAYER = {
  eyeHeight: 1.62,
  radius: 0.28,
  height: 1.75,
  walkSpeed: 1.55, // caminata lenta y pausada
  backSpeedFactor: 0.75,
  strafeSpeedFactor: 0.85,
  waterSpeedFactor: 0.72, // en charcos
  acceleration: 5.5, // suavizado de arranque y frenado (1/s)
  mouseSensitivity: 0.0021,
  pitchLimit: 1.45,
  stepUp: 0.45,
  snapDown: 0.4,
  gravity: 9.8,
  eyeSmoothing: 14,
  sprintSpeed: 2.9,
  stamina: 5, // segundos corriendo
  staminaRegen: 0.3, // por segundo
  staminaRearm: 0.35, // tras agotarte, no corres hasta recuperar esto
  crouchEye: 0.95,
  crouchSpeedFactor: 0.55,
};

export const HEADBOB = {
  stepLength: 0.74,
  amplitudeY: 0.034,
  amplitudeX: 0.02,
  roll: 0.006,
  fadeRate: 6,
};

/** Secuencia inicial: la cámara despierta mirando al cielo y baja la vista. */
export const INTRO = {
  typeSpeed: 52, // caracteres por segundo
  blackHold: 1.0,
  fadeDuration: 6.5,
  lookUpHold: 4.8, // desde el inicio del fundido
  lookDownDuration: 4.5,
  startPitch: 1.12,
};

/** Controles táctiles (Android): mitad izquierda de la pantalla camina, mitad derecha mira, tocar usa. */
export const TOUCH = {
  stickRadius: 60, // px de pantalla
  deadZone: 0.15,
  lookScale: 2.6, // multiplicador sobre la sensibilidad del ratón
  tapMaxMove: 14, // px: más que esto ya es arrastrar
  tapMaxTime: 0.4, // s
  sprintAt: 0.97, // palanca al tope = correr
  // Botones (en px desde la esquina inferior derecha de la pantalla).
  crossButton: { right: 84, bottom: 92, radius: 48 },
  crouchButton: { right: 76, bottom: 214, radius: 36 },
};

/**
 * Entidades cazadoras (src/world/entities.js). Distancias en metros, tiempos en segundos.
 * Te ven → gritan → te persiguen. Defensas: no mirarlas, esconderte, salir de su territorio, la cruz.
 */
export const ENTITIES = {
  viewCos: 0.8, // "la estás mirando" (≈ ±37° del centro de la vista)
  lookBoost: 1.35, // si la miras, corre más
  ignoreFactor: 0.7, // si no la miras, va más lenta
  lookDetect: 1.3, // y si la miras, te ve desde más lejos
  catchDistance: 0.95,
  coverDetect: 2.5, // agachado entre arbustos o juncos solo te ven así de cerca
  crouchDetect: 0.6, // agachado al descubierto
  sprintNoise: 9, // correr se oye a esta distancia aunque no te vean
  unreachableGiveUp: 5, // si estás fuera de su territorio, se rinde tras este tiempo
  stutter: 0.11, // en persecución el recorte avanza a saltos (como stop-motion)
  stalker: {
    // El Alto: el pantano entero, salvo el claro de la choza.
    detect: 22,
    alert: 1.6,
    speed: 1.7,
    loseTime: 4,
    searchTime: 4,
    calm: 10,
    repelTime: 1.6,
    repelSpeed: 5,
    // Antes de verte, merodea entre la niebla y reaparece cada vez más cerca, solo fuera de tu vista.
    startZ: 26,
    startDistance: 30,
    minDistance: 12,
    approach: 3,
    moveEvery: [5, 9],
    fogScale: 0.5,
  },
  percher: {
    // La Aguja: el claro alrededor de la choza (no entra en ella).
    detect: 20,
    alert: 1.1,
    speed: 2.3,
    loseTime: 3,
    searchTime: 3,
    calm: 14,
    repelTime: 1.2,
    repelSpeed: 6,
    territory: 26,
  },
  watcher: {
    // El del Sombrero: dentro de la choza (no baja la escalera).
    detect: 7,
    alert: 1.3,
    speed: 1.6,
    loseTime: 3,
    searchTime: 3,
    calm: 10,
    repelTime: 1.0,
    repelSpeed: 4,
  },
  grinner: {
    // El Sonriente: el pasillo. Primero el susto del apagón; después, la caza.
    detect: 30,
    alert: 0.9,
    speed: 2.0,
    loseTime: 3,
    searchTime: 3,
    calm: 9,
    repelTime: 1.0,
    repelSpeed: 6,
    homeZ: -26.8, // espera junto a la puerta
    peekZ: -18.2,
    triggerZ: -10.8,
    blackout: 1.4,
    scare: 0.85,
    aftermath: 0.4,
    scareDistance: 1.0,
  },
};

/** La cruz: levántala apuntando a una entidad para repelerla. Se gasta y se recarga. */
export const CROSS = {
  range: 11,
  cos: 0.85,
  drain: 0.28, // por segundo levantada
  recharge: 0.07, // por segundo bajada
  rearm: 0.3, // si se agota, no vuelve a funcionar hasta recargar esto
};

/** Puntos de control: al atraparte, vuelves al último que alcanzaste. */
export const CHECKPOINT_RADIUS = 3;

export const INTERACT = {
  distance: 1.9,
  facing: 0.55, // producto punto mínimo entre la mirada y la dirección al objeto
};

export const AUDIO = {
  masterVolume: 0.85,
  lofiCutoff: 9000, // audio "a 22 kHz"
  ambienceVolume: 0.75,
  insectsVolume: 0.16,
  droneVolume: 0.24,
  humVolume: 0.06,
  footstepVolume: 0.5,
  scareVolume: 0.9,
  voiceVolume: 0.8, // gritos y ruidos de las entidades
  heartbeatVolume: 0.5,
  reverbSeconds: 3.2,
};

export const TRANSITION = {
  doorFadeDelay: 0.5,
  doorFadeDuration: 2.4,
};
