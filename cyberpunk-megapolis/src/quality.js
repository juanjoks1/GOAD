/**
 * Quality tiers and the auto-degrade watchdog.
 *
 * Degrading is deliberately sticky: a tier change needs several seconds of
 * sustained low (or high) frame rate and there is a cool-down afterwards, so the
 * renderer never oscillates between tiers frame to frame.
 */
export const TIERS = {
  mobile: {
    name: 'mobile', label: '手机 MOBILE',
    dpr: 1.0, msaa: 0, bloom: true, bloomScale: 0.85, normalMaps: false, ormMaps: false,
    cloudCover: 0.55, fogScale: 1.4, anisotropy: 2, shadows: 0, shadowRange: 0,
    detailDistance: 430, structureDistance: 1050, cullDistance: 2300,
    halfFloat: true,
  },
  high: {
    name: 'high', label: '高 HIGH',
    dpr: 1.5, msaa: 4, bloom: true, bloomScale: 1.0, normalMaps: true, ormMaps: true,
    cloudCover: 1.0, fogScale: 1.0, anisotropy: 8, shadows: 2048, shadowRange: 110,
    detailDistance: 1350, structureDistance: 2900, cullDistance: 5200,
    halfFloat: true,
  },
  medium: {
    name: 'medium', label: '中 MEDIUM',
    dpr: 1.15, msaa: 2, bloom: true, bloomScale: 0.8, normalMaps: true, ormMaps: true,
    cloudCover: 0.85, fogScale: 1.1, anisotropy: 4, shadows: 1024, shadowRange: 70,
    detailDistance: 950, structureDistance: 2200, cullDistance: 4200,
    halfFloat: true,
  },
  low: {
    name: 'low', label: '低 LOW',
    dpr: 1.0, msaa: 0, bloom: false, bloomScale: 0.0, normalMaps: false, ormMaps: false,
    cloudCover: 0.6, fogScale: 1.25, anisotropy: 2, shadows: 0, shadowRange: 0,
    detailDistance: 620, structureDistance: 1500, cullDistance: 3200,
    halfFloat: false,
  },
};

export const ORDER = ['mobile', 'low', 'medium', 'high'];

export class QualityManager {
  constructor(initial = 'high', { onChange } = {}) {
    this.tier = TIERS[initial] ? initial : 'high';
    this.onChange = onChange || (() => {});
    this.samples = [];
    this.cooldown = 3;
    this.auto = true;
    this.fps = 60;
  }

  get current() { return TIERS[this.tier]; }

  set(tier, { silent = false } = {}) {
    if (!TIERS[tier] || tier === this.tier) return false;
    this.tier = tier;
    this.cooldown = 6;
    this.samples.length = 0;
    if (!silent) this.onChange(TIERS[tier]);
    return true;
  }

  /** call once per frame with the frame time in seconds */
  sample(dt) {
    if (dt <= 0 || dt > 0.5) return;
    this.samples.push(dt);
    if (this.samples.length > 180) this.samples.shift();
    if (this.samples.length > 20) {
      const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      this.fps = 1 / avg;
    }
    if (this.cooldown > 0) { this.cooldown -= dt; return; }
    if (!this.auto || this.samples.length < 150) return;
    const i = ORDER.indexOf(this.tier);
    if (this.fps < 32 && i > 0) { this.set(ORDER[i - 1]); return; }
    if (this.fps > 72 && i < ORDER.length - 1) { this.set(ORDER[i + 1]); }
  }

  /** pick a starting tier from what the device reports */
  static detect(gl, { touch = false } = {}) {
    // a coarse pointer means a phone or tablet: start conservative and let the
    // watchdog climb if the device turns out to be fast
    if (touch) return { tier: 'mobile', renderer: 'touch device', reason: 'touch device' };
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const r = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '') || '';
      const soft = /swiftshader|software|basic render|llvmpipe/i.test(r);
      const weak = /intel.*(hd|uhd) graphics (4|5|6)|mali|adreno|apple gpu/i.test(r);
      const mem = navigator.deviceMemory || navigator.hardwareConcurrency || 8;
      if (soft) return { tier: 'low', renderer: r, reason: 'software renderer' };
      if (weak || mem <= 4) return { tier: 'medium', renderer: r, reason: 'integrated or low-memory GPU' };
      return { tier: 'high', renderer: r, reason: 'discrete GPU' };
    } catch {
      return { tier: 'medium', renderer: 'unknown', reason: 'renderer info unavailable' };
    }
  }
}
