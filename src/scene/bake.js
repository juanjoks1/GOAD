// "Lightmap" por vértice: ilumina geometría estática con luces puntuales al construir la escena,
// como hacían los motores de 2005. Puro (trabaja con arreglos), así que se prueba sin navegador.

/**
 * @param {Float32Array|number[]} positions  xyz en coordenadas del mundo
 * @param {Float32Array|number[]} normals    xyz normalizadas
 * @param {{ ambient: number[], lights: { position: number[], color: number[], intensity: number, range: number, wrap?: number, falloff?: number }[], tint?: number[], occlusion?: (x:number, y:number, z:number) => number }} options
 * @returns {Float32Array} colores rgb por vértice
 */
export function bakeVertexColors(positions, normals, { ambient, lights, tint = [1, 1, 1], occlusion = null }) {
  const count = positions.length / 3;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    let r = ambient[0];
    let g = ambient[1];
    let b = ambient[2];
    for (const l of lights) {
      const dx = l.position[0] - px;
      const dy = l.position[1] - py;
      const dz = l.position[2] - pz;
      const d = Math.hypot(dx, dy, dz);
      if (d >= l.range) continue;
      const att = Math.pow(1 - d / l.range, l.falloff ?? 2) * l.intensity;
      const wrap = l.wrap ?? 0.15;
      const ndl = d > 1e-6 ? (nx * dx + ny * dy + nz * dz) / d : 1;
      const lambert = Math.max(0, ndl * (1 - wrap) + wrap);
      r += l.color[0] * att * lambert;
      g += l.color[1] * att * lambert;
      b += l.color[2] * att * lambert;
    }
    const ao = occlusion ? occlusion(px, py, pz) : 1;
    out[i * 3] = r * tint[0] * ao;
    out[i * 3 + 1] = g * tint[1] * ao;
    out[i * 3 + 2] = b * tint[2] * ao;
  }
  return out;
}
