/**
 * Procedural sky dome. A camera-locked sphere whose fragment shader builds the
 * zenith/horizon/ground gradient, sun disk and halo, five FBM cloud layers with
 * wind, twinkling stars and a moon. Night / Day / Dusk presets drive the sky,
 * fog, lights, exposure, environment intensity and bloom together, so cycling
 * the time of day can never leave the lighting out of step with the sky.
 */
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  // keep the dome's vertices pinned at (almost) the far plane
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.999999;
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;

uniform vec3 uZenith, uHorizon, uGround, uSunCol, uCloudLow, uCloudHigh, uMoonCol;
uniform vec3 uSunDir, uMoonDir;
uniform float uSunSize, uSunHalo, uCloudCover, uCloudSharp, uCloudScale;
uniform float uStars, uTime, uWind, uHorizonSoft, uGain;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {          // five cloud layers
    s += a * noise(p);
    p = p * 2.03 + vec2(1.7, -2.3);
    a *= 0.52;
  }
  return s;
}
float starField(vec3 d) {
  vec3 q = d * 260.0;
  vec3 i = floor(q);
  float h = hash(i.xy + i.z * 37.0);
  float h2 = hash(i.yz + i.x * 13.0);
  float star = step(0.9975, h) * (0.55 + 0.45 * sin(uTime * 2.4 + h2 * 62.0));
  float soft = smoothstep(0.02, 0.35, d.y);
  return star * soft;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  // ---- base gradient: ground below, horizon band, zenith above
  float up = clamp(h, 0.0, 1.0);
  float grad = pow(up, uHorizonSoft);
  vec3 sky = mix(uHorizon, uZenith, grad);
  vec3 col = mix(uGround, sky, smoothstep(-0.10, 0.045, h));

  // ---- sun disk + halo
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float disk = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sd);
  float halo = pow(sd, uSunHalo);
  col += uSunCol * halo * 0.42;
  col = mix(col, uSunCol * 1.5, disk);

  // ---- moon
  float md = max(dot(d, normalize(uMoonDir)), 0.0);
  float moon = smoothstep(0.9993, 0.99975, md);
  float mhalo = pow(md, 900.0);
  col += uMoonCol * (moon * 1.35 + mhalo * 0.32);

  // ---- stars (fade out where clouds and sun wash them away)
  col += vec3(0.86, 0.90, 1.0) * starField(d) * uStars;

  // ---- five-layer FBM clouds on a dome projection, moved by wind
  if (h > -0.02) {
    vec2 uv = d.xz / max(h + 0.16, 0.05) * uCloudScale;
    uv += vec2(uTime * uWind, uTime * uWind * 0.42);
    float f = fbm(uv);
    float f2 = fbm(uv * 2.7 + vec2(3.1, -1.4));
    float dens = clamp((f * 0.72 + f2 * 0.28 - (1.0 - uCloudCover)) * uCloudSharp, 0.0, 1.0);
    dens *= smoothstep(-0.02, 0.16, h);
    float lit = clamp(pow(max(dot(d, normalize(uSunDir)), 0.0), 3.0) + 0.22, 0.0, 1.0);
    vec3 cloud = mix(uCloudLow, uCloudHigh, lit);
    col = mix(col, cloud, dens * 0.92);
  }

  gl_FragColor = vec4(col * uGain, 1.0);
  #include <colorspace_fragment>
}`;

/* --------------------------------------------------------------- presets */
export const PRESETS = {
  dusk: {
    label: '黄昏 DUSK',
    zenith: '#262a55', horizon: '#f2a06a', ground: '#4a3a44',
    sun: '#ffb27a', sunDir: [0.36, 0.055, -0.93], sunSize: 0.0055, sunHalo: 22,
    cloudLow: '#6d4b60', cloudHigh: '#ffb98e', cloudCover: 0.50, cloudSharp: 2.0, cloudScale: 1.25,
    stars: 0.22, moon: '#c9d4ea', moonDir: [-0.55, 0.30, 0.78], horizonSoft: 0.58, gain: 1.0, wind: 0.0032,
    fog: '#8d7f8e', fogDensity: 0.0007,
    hemiSky: '#8496c6', hemiGround: '#4d3d46', hemiIntensity: 1.05,
    dirColor: '#ffc396', dirIntensity: 1.95, dirDir: [0.36, 0.20, -0.93],
    exposure: 1.08, envIntensity: 0.80,
    bloom: { strength: 0.60, radius: 0.50, threshold: 0.80 },
  },
  night: {
    label: '夜晚 NIGHT',
    zenith: '#050813', horizon: '#141d38', ground: '#0a0c14',
    sun: '#20304e', sunDir: [0.36, -0.22, -0.93], sunSize: 0.003, sunHalo: 48,
    cloudLow: '#0f1424', cloudHigh: '#2c3550', cloudCover: 0.40, cloudSharp: 1.7, cloudScale: 1.4,
    stars: 1.0, moon: '#e6eeff', moonDir: [-0.42, 0.44, 0.79], horizonSoft: 0.52, gain: 1.0, wind: 0.0021,
    fog: '#15192c', fogDensity: 0.00058,
    hemiSky: '#33477e', hemiGround: '#0c0e16', hemiIntensity: 0.52,
    dirColor: '#8fa6d8', dirIntensity: 0.60, dirDir: [-0.42, 0.40, 0.79],
    exposure: 1.20, envIntensity: 0.42,
    bloom: { strength: 0.92, radius: 0.58, threshold: 0.60 },
  },
  day: {
    label: '白天 DAY',
    zenith: '#2e6fc4', horizon: '#bcd6ef', ground: '#6f7480',
    sun: '#fff6e2', sunDir: [0.28, 0.66, -0.70], sunSize: 0.0045, sunHalo: 40,
    cloudLow: '#9fb0c6', cloudHigh: '#ffffff', cloudCover: 0.42, cloudSharp: 2.3, cloudScale: 1.1,
    stars: 0.0, moon: '#dfe8f8', moonDir: [-0.7, 0.16, 0.7], horizonSoft: 0.70, gain: 1.0, wind: 0.0042,
    fog: '#b9c7d8', fogDensity: 0.00034,
    hemiSky: '#9dc0ee', hemiGround2: '#6b6d6f', hemiIntensity: 1.00,
    dirColor: '#fff3dc', dirIntensity: 2.35, dirDir: [0.28, 0.66, -0.70],
    exposure: 0.96, envIntensity: 1.05,
    bloom: { strength: 0.34, radius: 0.42, threshold: 0.92 },
  },
};
PRESETS.day.hemiGround = PRESETS.day.hemiGround2;
export const PRESET_ORDER = ['dusk', 'night', 'day'];

/* =============================================================== SkyDome */
export class SkyDome {
  constructor(renderer, scene, { radius = 8200 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    this.uniforms = {
      uZenith: { value: C('#262a55') }, uHorizon: { value: C('#f2a06a') }, uGround: { value: C('#4a3a44') },
      uSunCol: { value: C('#ffb27a') }, uCloudLow: { value: C('#6d4b60') }, uCloudHigh: { value: C('#ffb98e') },
      uMoonCol: { value: C('#c9d4ea') },
      uSunDir: { value: new THREE.Vector3(0.36, 0.055, -0.93) },
      uMoonDir: { value: new THREE.Vector3(-0.55, 0.3, 0.78) },
      uSunSize: { value: 0.0055 }, uSunHalo: { value: 22 },
      uCloudCover: { value: 0.5 }, uCloudSharp: { value: 2.0 }, uCloudScale: { value: 1.25 },
      uStars: { value: 0.22 }, uTime: { value: 0 }, uWind: { value: 0.0032 },
      uHorizonSoft: { value: 0.58 }, uGain: { value: 1.0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: true,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), this.material);
    this.mesh.name = 'skyDome';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    this.hemi = new THREE.HemisphereLight(0x6f7fae, 0x40333a, 0.7);
    this.dir = new THREE.DirectionalLight(0xffc396, 1.55);
    this.dir.position.set(360, 200, -930);
    scene.add(this.hemi, this.dir, this.dir.target);
    this.shadowRange = 0;

    scene.fog = new THREE.FogExp2(new THREE.Color('#8d7f8e').convertSRGBToLinear(), 0.0007);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this._envRT = null;
    this.preset = 'dusk';
    this.cloudQuality = 1;
  }

  /** applies a preset across sky, fog, lights, exposure, env and bloom */
  apply(name, { renderer, bloomPass, quality } = {}) {
    const p = PRESETS[name] || PRESETS.dusk;
    this.preset = name;
    const u = this.uniforms;
    const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    u.uZenith.value.copy(C(p.zenith)); u.uHorizon.value.copy(C(p.horizon)); u.uGround.value.copy(C(p.ground));
    u.uSunCol.value.copy(C(p.sun)); u.uCloudLow.value.copy(C(p.cloudLow)); u.uCloudHigh.value.copy(C(p.cloudHigh));
    u.uMoonCol.value.copy(C(p.moon));
    u.uSunDir.value.fromArray(p.sunDir).normalize();
    u.uMoonDir.value.fromArray(p.moonDir).normalize();
    u.uSunSize.value = p.sunSize; u.uSunHalo.value = p.sunHalo;
    u.uCloudCover.value = p.cloudCover * (quality ? quality.cloudCover : 1);
    u.uCloudSharp.value = p.cloudSharp; u.uCloudScale.value = p.cloudScale;
    u.uStars.value = p.stars; u.uWind.value = p.wind;
    u.uHorizonSoft.value = p.horizonSoft; u.uGain.value = p.gain;

    const fogDensity = p.fogDensity * (quality ? quality.fogScale : 1);
    this.scene.fog.color.copy(C(p.fog));
    this.scene.fog.density = fogDensity;

    this.hemi.color.copy(C(p.hemiSky));
    this.hemi.groundColor.copy(C(p.hemiGround));
    this.hemi.intensity = p.hemiIntensity;
    this.dir.color.copy(C(p.dirColor));
    this.dir.intensity = p.dirIntensity;
    this.dir.position.set(p.dirDir[0], p.dirDir[1], p.dirDir[2]).multiplyScalar(1600);

    if (renderer) renderer.toneMappingExposure = p.exposure;
    if (bloomPass) {
      bloomPass.strength = p.bloom.strength * (quality ? quality.bloomScale : 1);
      bloomPass.radius = p.bloom.radius;
      bloomPass.threshold = p.bloom.threshold;
    }
    this.refreshEnvironment();
    this.scene.environmentIntensity = p.envIntensity;
    return p;
  }

  /** PMREM straight off the sky dome, so reflections match the sky exactly */
  refreshEnvironment() {
    const prevFog = this.scene.fog;
    const prevEnv = this.scene.environment;
    this.scene.fog = null;
    this.scene.environment = null;
    const visible = [];
    this.scene.traverse((o) => {
      if (o !== this.mesh && o.isMesh === true && o.visible) { visible.push(o); o.visible = false; }
      if (o.isBatchedMesh && o.visible) { visible.push(o); o.visible = false; }
    });
    try {
      if (this._envRT) this._envRT.dispose();
      this._envRT = this.pmrem.fromScene(this.scene, 0, 10, 12000);
      this.scene.environment = this._envRT.texture;
    } catch (e) {
      console.warn('[sky] PMREM generation failed, falling back to no environment map', e);
      this.scene.environment = prevEnv;
    }
    for (const o of visible) o.visible = true;
    this.scene.fog = prevFog;
  }

  /**
   * Shadows are tiered: the sun's shadow camera is a small box that follows the
   * player, so a 2.7 km city still fits a single 2048 map at the highest tier
   * and the cost disappears entirely at the lowest.
   */
  setShadows(size, range) {
    this.shadowRange = range;
    this.dir.castShadow = size > 0;
    if (!size) return;
    const c = this.dir.shadow.camera;
    c.left = -range; c.right = range; c.top = range; c.bottom = -range;
    c.near = 1; c.far = range * 6;
    c.updateProjectionMatrix();
    this.dir.shadow.mapSize.set(size, size);
    this.dir.shadow.bias = -0.0012;
    this.dir.shadow.normalBias = 0.6;
  }

  update(dt, cameraPosition) {
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(cameraPosition);
    this.dir.target.position.copy(cameraPosition);
    this.dir.target.updateMatrixWorld();
    if (this.shadowRange > 0) {
      // keep the sun a fixed offset from the player so the shadow box tracks
      const d = this.uniforms.uSunDir.value;
      this.dir.position.set(
        cameraPosition.x + d.x * this.shadowRange * 2.4,
        cameraPosition.y + Math.max(0.35, d.y) * this.shadowRange * 2.4,
        cameraPosition.z + d.z * this.shadowRange * 2.4,
      );
    }
  }

  next(opts) {
    const i = PRESET_ORDER.indexOf(this.preset);
    const name = PRESET_ORDER[(i + 1) % PRESET_ORDER.length];
    return { name, preset: this.apply(name, opts) };
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.pmrem.dispose();
    if (this._envRT) this._envRT.dispose();
    this.scene.remove(this.mesh, this.hemi, this.dir);
  }
}
