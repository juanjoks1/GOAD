// Renderizado retro: la escena se dibuja a baja resolución (480×360) en un render target,
// luego un shader aplica gradación, grano, fundido y color de 16 bits. El canvas se escala
// a pantalla completa en 4:3 sin suavizado (image-rendering: pixelated).
import * as THREE from 'three';
import vertexShader from '../shaders/retro.vert.glsl?raw';
import fragmentShader from '../shaders/retro.frag.glsl?raw';
import { RENDER, POST } from '../config.js';

export function createRetroRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER.width, RENDER.height, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const target = new THREE.WebGLRenderTarget(RENDER.width, RENDER.height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    generateMipmaps: false,
  });

  const uniforms = {
    tDiffuse: { value: target.texture },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uLevels: { value: new THREE.Vector3(...POST.colorLevels) },
    uDither: { value: POST.dither },
    uGrain: { value: POST.grain },
    uVignette: { value: POST.vignette },
    uSaturation: { value: POST.saturation },
    uTint: { value: new THREE.Vector3(...POST.tint) },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false }),
  );
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCamera = new THREE.Camera();

  return {
    renderer,
    uniforms,
    get fade() {
      return uniforms.uFade.value;
    },
    set fade(v) {
      uniforms.uFade.value = v;
    },
    render(scene, camera, time) {
      uniforms.uTime.value = time;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    },
    /** Compila los shaders de la escena por adelantado (evita tirones al empezar). */
    warmUp(scene, camera) {
      renderer.compile(scene, camera);
    },
  };
}

/** Ajusta el contenedor a 4:3 centrado con bandas negras. */
export function fitViewport(el, scanlines) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let vw = w;
  let vh = (w * 3) / 4;
  if (vh > h) {
    vh = h;
    vw = (h * 4) / 3;
  }
  el.style.width = `${Math.floor(vw)}px`;
  el.style.height = `${Math.floor(vh)}px`;
  if (scanlines) {
    scanlines.style.backgroundSize = `100% ${vh / RENDER.height}px`;
    scanlines.style.opacity = String(POST.scanlines);
  }
}
