/**
 * Touch controls for phones and tablets.
 *
 * Left half of the screen is a floating stick that appears where the thumb
 * lands; the right half is a look-drag surface; the action buttons sit above
 * both and map onto exactly the same key codes the keyboard uses, so the
 * physics and the animation state machine never learn that touch exists.
 */

export function isTouchDevice() {
  return (('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    && matchMedia('(pointer: coarse)').matches;
}

const BUTTONS = [
  { key: 'Space', cls: 't-web', zh: '蛛丝', en: 'WEB / JUMP', hint: '点按起跳 · 按住发射' },
  { key: 'ShiftLeft', cls: 't-sprint', zh: '冲刺', en: 'SPRINT / REEL' },
  { key: 'KeyS', cls: 't-dive', zh: '俯冲', en: 'DIVE' },
  { key: 'KeyE', cls: 't-zip', zh: '飞索', en: 'ZIP' },
];
const TOP_BUTTONS = [
  { key: 'KeyR', zh: '重入', en: 'R' },
  { key: 'KeyT', zh: '时段', en: 'T' },
  { key: '__pause', zh: '暂停', en: 'II' },
];

export class TouchControls {
  constructor(input, { onPause } = {}) {
    this.input = input;
    this.onPause = onPause || (() => {});
    this.lookSensitivity = 0.0052;
    this.stickRadius = 54;
    this.pointers = new Map();          // pointerId -> {role, ...}
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="t-zone t-left" data-zone="move"></div>
      <div class="t-zone t-right" data-zone="look"></div>
      <div class="t-stick" hidden><i></i></div>
      <div class="t-top">${TOP_BUTTONS.map((b) =>
        `<button type="button" class="t-mini" data-key="${b.key}">${b.zh}<small>${b.en}</small></button>`).join('')}</div>
      <div class="t-actions">${BUTTONS.map((b) =>
        `<button type="button" class="t-btn ${b.cls}" data-key="${b.key}">${b.zh}<small>${b.en}</small></button>`).join('')}</div>
      <p class="t-hint">左侧摇杆移动 · 右侧拖动转视角 · Drag left to move, right to look</p>
    `;
    document.getElementById('ui').appendChild(this.root);
    this.stick = this.root.querySelector('.t-stick');
    this.knob = this.stick.querySelector('i');
    this._wire();
  }

  _wire() {
    const held = new Set();
    for (const btn of this.root.querySelectorAll('[data-key]')) {
      const key = btn.dataset.key;
      const press = (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.classList.add('on');
        if (key === '__pause') { this.onPause(); return; }
        this.input.virtualKey(key, true);
        held.add(key);
        // capture can throw for a synthetic or already-released pointer
        try { btn.setPointerCapture?.(e.pointerId); } catch { /* not fatal */ }
      };
      const release = (e) => {
        e?.stopPropagation();
        btn.classList.remove('on');
        if (key === '__pause') return;
        this.input.virtualKey(key, false);
        held.delete(key);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', (e) => { if (e.buttons) release(e); });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    const onDown = (e) => {
      const zone = e.target?.dataset?.zone;
      if (!zone) return;
      e.preventDefault();
      if (zone === 'move') {
        this.pointers.set(e.pointerId, { role: 'move', ox: e.clientX, oy: e.clientY });
        this.stick.hidden = false;
        this.stick.style.left = e.clientX + 'px';
        this.stick.style.top = e.clientY + 'px';
        this.knob.style.transform = 'translate(-50%, -50%)';
      } else {
        this.pointers.set(e.pointerId, { role: 'look', lx: e.clientX, ly: e.clientY });
      }
      try { e.target.setPointerCapture?.(e.pointerId); } catch { /* not fatal */ }
    };
    const onMove = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      if (p.role === 'move') {
        let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
        const len = Math.hypot(dx, dy);
        const max = this.stickRadius;
        if (len > max) { dx *= max / len; dy *= max / len; }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        // dead zone keeps a resting thumb from creeping forward
        const norm = Math.min(1, len / max);
        const k = norm < 0.16 ? 0 : (norm - 0.16) / 0.84;
        const l = Math.hypot(dx, dy) || 1;
        this.input.setVirtualMove((dx / l) * k, (dy / l) * k);
      } else {
        this.input.applyLook(e.clientX - p.lx, e.clientY - p.ly, this.lookSensitivity);
        p.lx = e.clientX; p.ly = e.clientY;
      }
    };
    const onUp = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (p.role === 'move') { this.stick.hidden = true; this.input.setVirtualMove(0, 0); }
      this.pointers.delete(e.pointerId);
    };
    for (const z of this.root.querySelectorAll('.t-zone')) {
      z.addEventListener('pointerdown', onDown);
      z.addEventListener('pointermove', onMove);
      z.addEventListener('pointerup', onUp);
      z.addEventListener('pointercancel', onUp);
    }
    this._release = () => {
      for (const k of held) this.input.virtualKey(k, false);
      held.clear();
      this.pointers.clear();
      this.stick.hidden = true;
      this.input.setVirtualMove(0, 0);
      for (const b of this.root.querySelectorAll('.on')) b.classList.remove('on');
    };
    window.addEventListener('blur', this._release);
  }

  show(on) {
    this.root.hidden = !on;
    if (!on) this._release();
  }

  dispose() {
    window.removeEventListener('blur', this._release);
    this._release();
    this.root.remove();
  }
}
