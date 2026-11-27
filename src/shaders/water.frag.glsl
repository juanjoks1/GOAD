// Agua turbia: oscura vista desde arriba, refleja el cielo (falso Fresnel) en ángulos rasantes.
// Sin reflejos reales: como en los juegos de 2005, un color de cielo y ondas de ruido bastan.

uniform vec3 uDeep;      // color del agua vista de frente
uniform vec3 uReflect;   // color reflejado (cielo / luz)
uniform vec3 uMud;       // orilla fangosa
uniform float uSheen;    // brillos sueltos
uniform sampler2D uNoise;
uniform float uTime;

varying vec3 vWorld;
varying float vEdge;

#include <fog_pars_fragment>

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec2 p = vWorld.xz;

  float n1 = texture2D(uNoise, p * 0.11 + vec2(uTime * 0.012, uTime * 0.008)).r;
  float n2 = texture2D(uNoise, p * 0.29 - vec2(uTime * 0.017, -uTime * 0.006)).r;
  float ripple = n1 + n2 - 1.0;

  float cosTheta = clamp(viewDir.y + ripple * 0.12, 0.0, 1.0);
  float fresnel = pow(1.0 - cosTheta, 4.0);
  vec3 col = mix(uDeep, uReflect, clamp(0.06 + fresnel * 0.94, 0.0, 1.0));
  col += uSheen * smoothstep(0.68, 0.9, n1 * n2 * 2.2) * (0.3 + fresnel);

  // Orilla irregular y fija (no se anima).
  float still = texture2D(uNoise, p * 0.7).r;
  float e = vEdge + (still - 0.5) * 0.5;
  if (e > 0.95) discard;
  col = mix(col, uMud, smoothstep(0.55, 0.95, e) * 0.85);

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
