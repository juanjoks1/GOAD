/**
 * One input owner for the whole game: key state, edge-triggered justPressed,
 * mouse buttons and the camera yaw/pitch. Auto-repeat keydown events never
 * re-trigger an edge, and losing focus or pointer lock clears every key so the
 * character can't keep running while the tab is in the background.
 */
export const SENSITIVITY = 0.0023;
export const PITCH_MIN = -1.25;
export const PITCH_MAX = 1.35;

export class Input {
  constructor(canvas, { onPointerLockChange, onEscape } = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.mouse = { left: false, right: false, middle: false };
    this.mouseJust = { left: false, right: false };
    this.yaw = 0;
    this.pitch = -0.08;
    this.locked = false;
    this.enabled = true;
    // touch fills these in; the rest of the game only ever sees keys + look
    this.virtualMove = { x: 0, z: 0, active: false };
    this.touchMode = false;
    this._onLock = onPointerLockChange || (() => {});
    this._onEscape = onEscape || (() => {});
    this._bound = [];
    this._install();
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._bound.push([target, type, fn, opts]);
  }

  _install() {
    this._on(window, 'keydown', (e) => {
      // let the browser keep its own shortcuts
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const code = e.code;
      if (PREVENT.has(code)) e.preventDefault();
      if (e.repeat) return;                       // auto-repeat never fires an edge
      if (!this.keys.has(code)) this.justPressed.add(code);
      this.keys.add(code);
      if (code === 'Escape') this._onEscape();
    });
    this._on(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      this.justReleased.add(e.code);
    });
    this._on(window, 'blur', () => this.clear());
    this._on(document, 'visibilitychange', () => { if (document.hidden) this.clear(); });

    this._on(this.canvas, 'mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouseJust.left = true; }
      if (e.button === 1) this.mouse.middle = true;
      if (e.button === 2) { this.mouse.right = true; this.mouseJust.right = true; e.preventDefault(); }
    });
    this._on(window, 'mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 1) this.mouse.middle = false;
      if (e.button === 2) this.mouse.right = false;
    });
    this._on(this.canvas, 'contextmenu', (e) => e.preventDefault());

    this._on(document, 'mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.applyLook(e.movementX, e.movementY, SENSITIVITY);
    });

    this._on(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.locked = locked;
      if (!locked) this.clear();
      this._onLock(locked);
    });
    this._on(document, 'pointerlockerror', () => {
      if (!this._lockWarned) { this._lockWarned = true; console.warn('[input] pointer lock request failed'); }
      this.locked = false;
      this._onLock(false);
    });
  }

  requestLock() {
    if (this.locked) return Promise.resolve(true);
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      return (p && p.then) ? p.then(() => true, () => { try { this.canvas.requestPointerLock(); } catch { } return false; }) : Promise.resolve(true);
    } catch {
      try { this.canvas.requestPointerLock(); } catch { }
      return Promise.resolve(false);
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /** shared by the mouse and the touch look-drag */
  applyLook(dx, dy, sensitivity = SENSITIVITY) {
    if (!this.enabled) return;
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    if (this.pitch < PITCH_MIN) this.pitch = PITCH_MIN;
    if (this.pitch > PITCH_MAX) this.pitch = PITCH_MAX;
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  /** a touch button behaves exactly like the key it stands for, edges included */
  virtualKey(code, isDown) {
    if (isDown) {
      if (!this.keys.has(code)) this.justPressed.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
      this.justReleased.add(code);
    }
  }

  setVirtualMove(x, z) {
    this.virtualMove.x = x;
    this.virtualMove.z = z;
    this.virtualMove.active = (x !== 0 || z !== 0);
  }

  down(code) { return this.enabled && this.keys.has(code); }
  pressed(code) { return this.enabled && this.justPressed.has(code); }
  released(code) { return this.justReleased.has(code); }

  /** WASD (or the touch stick) as a camera-relative vector in the -1..1 square */
  moveAxis() {
    if (this.virtualMove.active && this.enabled) return { x: this.virtualMove.x, z: this.virtualMove.z };
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const l = Math.hypot(x, z);
    return l > 1 ? { x: x / l, z: z / l } : { x, z };
  }

  /** must be called at the end of each frame */
  endFrame() { this.justPressed.clear(); this.justReleased.clear(); this.mouseJust.left = false; this.mouseJust.right = false; }

  clear() {
    this.keys.clear();
    this.justPressed.clear();
    this.mouse.left = this.mouse.right = this.mouse.middle = false;
    this.setVirtualMove(0, 0);
  }

  dispose() {
    for (const [t, type, fn, opts] of this._bound) t.removeEventListener(type, fn, opts);
    this._bound.length = 0;
    this.clear();
  }
}

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
