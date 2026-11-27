// Balanceo de cámara al caminar. Puro: fase por distancia recorrida, un paso cada π radianes.

/** Avanza la fase según la distancia caminada. */
export function advanceStepPhase(phase, distance, stepLength) {
  return phase + (distance / stepLength) * Math.PI;
}

/** Número de pisadas (apoyos del pie) entre dos fases. */
export function stepsBetween(prevPhase, nextPhase) {
  return Math.floor(nextPhase / Math.PI) - Math.floor(prevPhase / Math.PI);
}

/**
 * Desplazamiento de la cámara. La cabeza baja al apoyar el pie (fase = kπ) y se balancea
 * lateralmente una vez por zancada (dos pasos). `weight` (0..1) atenúa el efecto al detenerse.
 */
export function bobOffset(phase, weight, { amplitudeY, amplitudeX, roll }) {
  const c = Math.cos(phase);
  return {
    y: -amplitudeY * weight * c * c,
    x: amplitudeX * weight * c,
    roll: roll * weight * c,
  };
}
