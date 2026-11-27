// Cielo nublado, gris verdoso. El horizonte se funde con el color de la niebla.

uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uCloudLight;
uniform vec3 uCloudDark;
uniform sampler2D uClouds;
uniform float uTime;

varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));

  if (h > 0.0) {
    // Proyección plana de las nubes: se aplastan hacia el horizonte.
    vec2 uv = dir.xz / (h + 0.22) * 0.55;
    float c1 = texture2D(uClouds, uv + vec2(uTime * 0.004, uTime * 0.0015)).r;
    float c2 = texture2D(uClouds, uv * 2.3 + vec2(-uTime * 0.0025, uTime * 0.0035)).r;
    // Cielo completamente cubierto: capas claras y oscuras, sin huecos.
    float c = c1 * 0.65 + c2 * 0.35;
    vec3 cloud = mix(uCloudLight, uCloudDark, smoothstep(0.2, 0.9, c));
    col = mix(col, cloud, 0.8 * smoothstep(0.0, 0.3, h));
  }

  col = mix(uHorizon, col, smoothstep(-0.02, 0.16, h));
  gl_FragColor = vec4(col, 1.0);
}
