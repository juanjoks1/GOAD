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
  reverbSeconds: 3.2,
};

export const TRANSITION = {
  doorFadeDelay: 0.5,
  doorFadeDuration: 2.4,
};
