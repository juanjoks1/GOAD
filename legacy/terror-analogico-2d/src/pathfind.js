// Búsqueda de ruta en la rejilla (BFS de 4 direcciones). Sin DOM.
import { isSolid } from './world.js';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Devuelve las casillas desde (sin incluir `start`) hasta `goal` (incluida),
// o null si no hay camino. Un [] significa que ya estás en la casilla objetivo.
export function findPath(world, start, goal, exitOpen = false) {
  if (start.x === goal.x && start.y === goal.y) return [];

  const key = (x, y) => y * world.width + x;
  const parent = new Map([[key(start.x, start.y), null]]);
  const queue = [start];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (isSolid(world, nx, ny, exitOpen)) continue;
      const k = key(nx, ny);
      if (parent.has(k)) continue;
      parent.set(k, cur);

      if (nx === goal.x && ny === goal.y) {
        const path = [];
        let node = { x: nx, y: ny };
        while (!(node.x === start.x && node.y === start.y)) {
          path.push(node);
          node = parent.get(key(node.x, node.y));
        }
        return path.reverse();
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
