// Agua de la zanja y de los charcos. `edge` = 0 en el centro, 1 en la orilla (los charcos se recortan).
attribute float edge;

varying vec3 vWorld;
varying float vEdge;

#include <fog_pars_vertex>

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  vEdge = edge;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
