// Generador pseudoaleatorio con semilla (mulberry32). Todo lo procedural usa semillas fijas
// para que el pantano sea idéntico en cada partida y en cada máquina.

export function createRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Número en [min, max). */
    range: (min, max) => min + (max - min) * next(),
    /** Entero en [min, max]. */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    /** true con probabilidad p. */
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Valor centrado en 0 con amplitud `amount`. */
    spread: (amount) => (next() * 2 - 1) * amount,
  };
}
