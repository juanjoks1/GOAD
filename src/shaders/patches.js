// Pequeñas inyecciones en los materiales estándar de Three.js (onBeforeCompile).

/**
 * Balanceo por viento en follaje. Requiere el atributo de vértice `sway` (0 = fijo, 1 = se mueve).
 * La geometría está en coordenadas del mundo (fusionada), así que `position` sirve como fase.
 */
export function addWindSway(material, timeUniform, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    // Las tarjetas de follaje se iluminan igual por ambas caras (sin invertir la normal).
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );',
    );
    shader.vertexShader =
      'attribute float sway;\nuniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swayPhase = uTime * 1.1 + position.x * 0.35 + position.z * 0.27;
        float swayGust = 0.6 + 0.4 * sin(uTime * 0.23 + position.x * 0.02);
        transformed.x += sin(swayPhase) * sway * ${(0.09 * strength).toFixed(3)} * swayGust;
        transformed.z += cos(swayPhase * 0.83) * sway * ${(0.06 * strength).toFixed(3)} * swayGust;`,
      );
  };
  material.customProgramCacheKey = () => `sway-${strength}`;
  return material;
}

/** Recorta un círculo del terreno (bajo la choza, para que no atraviese el piso ni la escalera). */
export function addGroundHole(material, center, radius) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHoleCenter = { value: center };
    shader.uniforms.uHoleRadius = { value: radius };
    shader.vertexShader =
      'varying vec2 vHoleXZ;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    shader.fragmentShader =
      'varying vec2 vHoleXZ;\nuniform vec2 uHoleCenter;\nuniform float uHoleRadius;\n' +
      shader.fragmentShader.replace(
        'void main() {',
        `void main() {
        if (distance(vHoleXZ, uHoleCenter) < uHoleRadius) discard;`,
      );
  };
  material.customProgramCacheKey = () => 'ground-hole';
  return material;
}
