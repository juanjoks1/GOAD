// Disposición del pantano (fase 1). Todo en metros.
// Ejes: x = este, z = sur. Al empezar, el jugador mira hacia -z (norte), hacia la choza.
// Este archivo solo contiene datos y funciones puras: lo usan la escena, la física y las pruebas.

/** Punto de aparición. yaw 0 = mirando hacia -z. */
export const SPAWN = { x: 1.5, z: 34, yaw: 0.06 };

/** Límite jugable (círculo). La niebla oculta el borde; más allá sigue habiendo árboles. */
export const WORLD = { centerX: 0, centerZ: -6, radius: 62, terrainSize: 190, vegetationRadius: 82 };

/** Zanja de agua turbia que cruza el mapa de este a oeste. Solo se cruza por el puente. */
export const DITCH = {
  halfWidth: 3.0, // ancho del cauce (a cada lado del centro)
  bottom: -1.7, // altura del fondo
  waterLevel: -0.95, // altura del agua
  blockedHalfWidth: 1.75, // franja donde no se puede caminar (agua)
};

/** Centro de la zanja en z para cada x. Curva suave. */
export function ditchCenterZ(x) {
  return 8 + 1.8 * Math.sin(x * 0.06) + 0.8 * Math.sin(x * 0.17 + 1.3);
}

/** Puente de tablones sobre la zanja (alineado con el eje z). */
export const BRIDGE = {
  x: 0,
  z: ditchCenterZ(0),
  halfWidth: 0.8,
  halfLength: 4.0,
  railX: 0.86, // pasamanos en el lado este
  railPosts: [-3.7, -1.25, 1.35, 3.7], // z relativo al centro del puente
  railBreak: 1.35, // a partir de aquí el pasamanos está roto
};

export function onBridge(x, z) {
  return Math.abs(x - BRIDGE.x) < BRIDGE.halfWidth && Math.abs(z - BRIDGE.z) < BRIDGE.halfLength;
}

/** Choza circular en el claro. La puerta (hueco del muro) mira hacia +z. */
export const HUT = {
  x: 0,
  z: -30,
  groundHeight: 0.35, // altura del terreno aplanado alrededor de la choza
  floorLift: 0.12, // el piso de concreto sobresale del barro
  outerRadius: 4.0,
  innerRadius: 3.78,
  wallHeight: 2.6,
  doorWidth: 1.3,
  doorHeight: 1.95,
  roofRadius: 4.9,
  roofHeight: 3.6,
  flatRadius: 6.5,
  moundRadius: 11,
  clearingRadius: 13, // sin árboles dentro de este radio
  postRing: { radius: 6.6, count: 26, entranceHalfAngle: 0.55 },
};

/** Ángulo total del hueco de la puerta en el muro circular. */
export const DOOR_GAP_ANGLE = 2 * Math.asin(HUT.doorWidth / 2 / HUT.outerRadius);

export const FLOOR_Y = HUT.groundHeight + HUT.floorLift;

/** Altura del borde superior del muro y del cono del techo (la paja apoya sobre el muro). */
export const HUT_WALL_TOP = HUT.groundHeight + HUT.wallHeight;
export const HUT_ROOF_BASE = HUT_WALL_TOP - HUT.roofHeight * (1 - HUT.outerRadius / HUT.roofRadius);
export const HUT_APEX = HUT_ROOF_BASE + HUT.roofHeight;

/** Altura de la superficie del techo a distancia `r` del centro de la choza. */
export function roofHeightAt(r) {
  return HUT_ROOF_BASE + HUT.roofHeight * (1 - r / HUT.roofRadius);
}

/**
 * Escalera que desciende hacia el norte desde el interior de la choza.
 * Coordenadas z relativas al centro de la choza.
 */
export const STAIRS = {
  halfWidth: 0.75,
  zTop: 1.0,
  zBottom: -5.5,
  depth: 4.0,
  openingEnd: -2.75, // la abertura en el piso termina aquí; después la escalera tiene techo
  clearance: 2.2,
  steps: 20,
};

export const CORRIDOR_Y = FLOOR_Y - STAIRS.depth;

/** Pasillo subterráneo estrecho que sigue a la escalera. z relativo a la choza. */
export const CORRIDOR = {
  halfWidth: 0.75,
  height: STAIRS.clearance,
  zStart: STAIRS.zBottom,
  zEnd: -29.5,
  bulbs: [
    { z: -6.3, on: true },
    { z: -12.6, on: false }, // fundida
    { z: -18.9, on: true },
    { z: -25.0, on: true },
  ],
  puddles: [
    { x: 0.18, z: -9.6, r: 0.55 },
    { x: -0.22, z: -16.2, r: 0.75 },
    { x: 0.05, z: -27.7, r: 0.6 },
  ],
};

/** Puerta metálica al fondo del pasillo. */
export const METAL_DOOR = { width: 0.92, height: 2.02, z: CORRIDOR.zEnd };

/** Posición mundial del centro de la puerta metálica. */
export const METAL_DOOR_WORLD = {
  x: HUT.x,
  y: CORRIDOR_Y + METAL_DOOR.height / 2,
  z: HUT.z + METAL_DOOR.z + 0.04,
};

/** Sendero de barro pisado: guía al jugador del inicio al puente y del puente a la choza. */
export const PATH = [
  [SPAWN.x, SPAWN.z],
  [-0.3, 24],
  [0.2, 15.5],
  [0, BRIDGE.z + BRIDGE.halfLength + 0.3],
  [0, BRIDGE.z - BRIDGE.halfLength - 0.3],
  [1.6, -6],
  [1.2, -16],
  [0.2, -22],
  [0, HUT.z + HUT.outerRadius + 0.4],
];

/** Pasa de coordenadas mundiales a coordenadas locales de la choza. */
export function toHutLocal(x, z) {
  return { lx: x - HUT.x, lz: z - HUT.z };
}

/** ¿Está (lx, lz) dentro de la abertura de la escalera en el piso de la choza? */
export function inStairOpening(lx, lz) {
  return Math.abs(lx) < STAIRS.halfWidth && lz < STAIRS.zTop && lz > STAIRS.openingEnd;
}

/** Altura de la rampa de la escalera (para colisión) en z local. */
export function stairHeightAt(lz) {
  const t = (STAIRS.zTop - lz) / (STAIRS.zTop - STAIRS.zBottom);
  return FLOOR_Y - STAIRS.depth * Math.min(1, Math.max(0, t));
}
