// Mapa del juego, escrito como texto para que sea fácil de leer y editar.
//
// Leyenda:
//   #  pared (sólida)
//   .  suelo
//   +  puerta (caminable)
//   S  punto de inicio del jugador
//   E  punto de inicio de la Señal (la entidad)
//   V  VCR (mueble sólido; úsalo con E desde cerca)
//   T  cinta (se recoge al pasar encima)
//   X  salida: sólida hasta que las 3 cintas estén reproducidas
//
// Reglas que tests/world.test.js verifica: todas las filas miden lo mismo,
// hay exactamente una S, una E, una V, una X y tantas T como cintas en content.js.

export const MAP_ROWS = [
  '##############################', // 0
  '#S.........#.........#.......#', // 1  recepción | archivo | control
  '#..........#.........#...T...#', // 2
  '#....V.....+...T.....+.......#', // 3
  '#..........#.........#.......#', // 4
  '#####+#########+#########+####', // 5  puertas hacia el sótano
  '#.........#.........#........#', // 6
  '#..T......#.........#........#', // 7
  '#.........#.........#........#', // 8
  '#.........#.........#........#', // 9
  '#.........#.........#........#', // 10
  '#............................#', // 11 pasillo abierto
  '#............................#', // 12
  '#...........#................#', // 13
  '#...E.......#................#', // 14
  '#...........#................X', // 15 salida (borde derecho)
  '#...........#................#', // 16
  '##############################', // 17
];

const SOLID_CHARS = new Set(['#', 'V']);
const KNOWN_CHARS = new Set(['#', '.', '+', 'S', 'E', 'V', 'T', 'X']);

// Convierte MAP_ROWS en un objeto de mundo con posiciones de los elementos.
export function parseWorld(rows = MAP_ROWS) {
  const height = rows.length;
  const width = rows[0].length;
  const world = {
    width,
    height,
    grid: rows,
    player: null,
    entity: null,
    vcr: null,
    exit: null,
    tapes: [],
  };

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Fila ${y} mide ${row.length}, se esperaba ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const c = row[x];
      if (!KNOWN_CHARS.has(c)) throw new Error(`Carácter desconocido "${c}" en ${x},${y}`);
      if (c === 'S') world.player = { x, y };
      else if (c === 'E') world.entity = { x, y };
      else if (c === 'V') world.vcr = { x, y };
      else if (c === 'X') world.exit = { x, y };
      else if (c === 'T') world.tapes.push({ x, y });
    }
  });

  return world;
}

// Una casilla es sólida si está fuera del mapa, es pared/VCR, o es la salida cerrada.
export function isSolid(world, tx, ty, exitOpen = false) {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return true;
  const c = world.grid[ty][tx];
  if (c === 'X') return !exitOpen;
  return SOLID_CHARS.has(c);
}
