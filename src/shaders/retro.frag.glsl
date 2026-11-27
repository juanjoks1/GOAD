// Post-procesado "PC de 2005": gradación desaturada, viñeta, grano analógico,
// fundido a negro y reducción a color de 16 bits (RGB565) con tramado ordenado.
// Se aplica a la imagen de baja resolución, así que cada efecto ocurre por píxel grande.

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uFade;        // 0 = negro, 1 = imagen completa
uniform vec3 uLevels;       // niveles por canal (31, 63, 31 = RGB565)
uniform float uDither;      // intensidad del tramado Bayer
uniform float uGrain;       // amplitud del grano
uniform float uVignette;
uniform float uSaturation;
uniform vec3 uTint;

varying vec2 vUv;

// Matriz de Bayer 4×4 calculada (valores en [0, 1)).
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;

  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(luma), c, uSaturation) * uTint;

  vec2 d = vUv - 0.5;
  c *= 1.0 - uVignette * dot(d, d) * 2.2;

  // Grano a 24 fps, algo más fuerte en las sombras.
  float frame = floor(uTime * 24.0);
  float g = hash12(gl_FragCoord.xy + frame * vec2(37.0, 17.0)) - 0.5;
  c += g * uGrain * (0.6 + 0.4 * (1.0 - luma));

  c *= uFade;

  float b = (bayer4(gl_FragCoord.xy) - 0.5) * uDither;
  c = floor(c * uLevels + 0.5 + b) / uLevels;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
