// Domo del cielo nublado. Sigue a la cámara y se dibuja detrás de todo.
import * as THREE from 'three';
import vertexShader from '../../shaders/sky.vert.glsl?raw';
import fragmentShader from '../../shaders/sky.frag.glsl?raw';
import { ATMOSPHERE } from '../../config.js';

export function createSky(textures, timeUniform) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(ATMOSPHERE.skyTop) },
      uHorizon: { value: new THREE.Color(ATMOSPHERE.exterior.fogColor) },
      uCloudLight: { value: new THREE.Color(ATMOSPHERE.cloudLight) },
      uCloudDark: { value: new THREE.Color(ATMOSPHERE.cloudDark) },
      uClouds: { value: textures.clouds },
      uTime: timeUniform,
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), material);
  mesh.name = 'cielo';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (renderer, scene, camera) => mesh.position.copy(camera.position);
  return mesh;
}
