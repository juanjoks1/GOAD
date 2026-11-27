// Entidades como recortes de foto con fallas de cinta: filas que se desplazan, grano propio,
// fundido con trama y ojos/dientes que no se apagan en la oscuridad.

uniform sampler2D uMap;
uniform float uTime;
uniform float uGlitch;      // 0..1: cuánto "tracking" sufre el recorte
uniform float uBrightness;  // luz del lugar (los tonos muy claros la ignoran)
uniform float uOpacity;     // 0..1, fundido con trama
uniform float uFogScale;    // < 1: atraviesa la niebla más que el resto

varying vec2 vUv;

#include <fog_pars_fragment>

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  float frame = floor(uTime * 18.0);
  float row = floor(vUv.y * 90.0);
  vec2 uv = vUv;
  float torn = step(0.78 - uGlitch * 0.5, hash12(vec2(row * 0.37, frame + 3.0)));
  uv.x += (hash12(vec2(row, frame)) - 0.5) * (0.012 + uGlitch * 0.14) * torn;

  vec4 tex = texture2D(uMap, clamp(uv, 0.001, 0.999));
  if (tex.a < 0.5) discard;
  if (bayer4(gl_FragCoord.xy) >= uOpacity) discard;

  float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
  vec3 col = tex.rgb * mix(uBrightness, 1.0, smoothstep(0.62, 0.8, luma));
  col += (hash12(gl_FragCoord.xy + frame) - 0.5) * (0.05 + 0.12 * uGlitch);
  gl_FragColor = vec4(col, 1.0);

  #ifdef USE_FOG
    float fd = fogDensity * uFogScale * vFogDepth;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-fd * fd));
  #endif
}
