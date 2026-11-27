// Teclado, ratón, Pointer Lock y pantalla táctil.
// Teclas por posición física (e.code): WASD funciona en cualquier distribución.
// Táctil: un dedo en la mitad izquierda de la pantalla es una palanca de movimiento,
// un dedo en la mitad derecha mira, y un toque corto sin arrastrar es "usar".
import { TOUCH } from '../config.js';

export function createInput(target) {
  const down = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let dragging = false;
  const listeners = { click: [], lockChange: [], tap: [] };
  // stick: { id, ox, oy, x, y } · look: { id, x, y } · starts: id → { x, y, time, moved }
  const touch = { stick: null, look: null, starts: new Map() };

  const isLocked = () => document.pointerLockElement === target;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  document.addEventListener('mousemove', (e) => {
    if (isLocked() || dragging) {
      mouseX += e.movementX || 0;
      mouseY += e.movementY || 0;
    }
  });
  // Respaldo sin Pointer Lock: arrastrar con el botón para mirar.
  target.addEventListener('mousedown', () => {
    if (!isLocked()) dragging = true;
  });
  window.addEventListener('mouseup', () => (dragging = false));
  target.addEventListener('click', (e) => listeners.click.forEach((fn) => fn(e)));
  document.addEventListener('pointerlockchange', () => listeners.lockChange.forEach((fn) => fn(isLocked())));

  window.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        touch.starts.set(t.identifier, { x: t.clientX, y: t.clientY, time: e.timeStamp, moved: 0 });
        if (t.clientX < window.innerWidth / 2 && !touch.stick) {
          touch.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        } else if (!touch.look) {
          touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
    },
    { passive: false },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const s = touch.starts.get(t.identifier);
        if (s) s.moved = Math.max(s.moved, Math.hypot(t.clientX - s.x, t.clientY - s.y));
        if (touch.stick?.id === t.identifier) {
          const st = touch.stick;
          st.x = t.clientX;
          st.y = t.clientY;
          // Palanca flotante: si el dedo se aleja más del radio, la base lo sigue.
          const d = Math.hypot(st.x - st.ox, st.y - st.oy);
          if (d > TOUCH.stickRadius) {
            st.ox = st.x - ((st.x - st.ox) / d) * TOUCH.stickRadius;
            st.oy = st.y - ((st.y - st.oy) / d) * TOUCH.stickRadius;
          }
        } else if (touch.look?.id === t.identifier) {
          mouseX += (t.clientX - touch.look.x) * TOUCH.lookScale;
          mouseY += (t.clientY - touch.look.y) * TOUCH.lookScale;
          touch.look.x = t.clientX;
          touch.look.y = t.clientY;
        }
      }
    },
    { passive: false },
  );
  const endTouch = (e, canTap) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = touch.starts.get(t.identifier);
      touch.starts.delete(t.identifier);
      if (touch.stick?.id === t.identifier) touch.stick = null;
      if (touch.look?.id === t.identifier) touch.look = null;
      const quick = s && s.moved < TOUCH.tapMaxMove && (e.timeStamp - s.time) / 1000 < TOUCH.tapMaxTime;
      if (canTap && quick) listeners.tap.forEach((fn) => fn({ x: t.clientX, y: t.clientY }));
    }
  };
  window.addEventListener('touchend', (e) => endTouch(e, true), { passive: false });
  window.addEventListener('touchcancel', (e) => endTouch(e, false), { passive: false });

  /** Ejes de la palanca táctil con zona muerta. */
  function stickAxes() {
    const st = touch.stick;
    if (!st) return { forward: 0, strafe: 0 };
    const dx = (st.x - st.ox) / TOUCH.stickRadius;
    const dy = (st.y - st.oy) / TOUCH.stickRadius;
    const mag = Math.min(1, Math.hypot(dx, dy));
    if (mag < TOUCH.deadZone) return { forward: 0, strafe: 0 };
    const k = (mag - TOUCH.deadZone) / (1 - TOUCH.deadZone) / Math.max(mag, 1e-6);
    return { forward: -dy * k, strafe: dx * k };
  }

  return {
    isDown: (code) => down.has(code),
    /** true una sola vez por pulsación. */
    consume(code) {
      const had = pressed.has(code);
      pressed.delete(code);
      return had;
    },
    anyPressed() {
      return pressed.size > 0;
    },
    /** Llamar al final de cada fotograma. */
    endFrame() {
      pressed.clear();
    },
    takeMouse() {
      const d = { x: mouseX, y: mouseY };
      mouseX = 0;
      mouseY = 0;
      return d;
    },
    axes() {
      const f = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
      const s = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const st = stickAxes();
      const clamp1 = (v) => Math.max(-1, Math.min(1, v));
      return { forward: clamp1(f + st.forward), strafe: clamp1(s + st.strafe) };
    },
    /** Palanca táctil activa (coordenadas de pantalla) o null. */
    stick() {
      return touch.stick;
    },
    get locked() {
      return isLocked();
    },
    get lockSupported() {
      return typeof target.requestPointerLock === 'function';
    },
    requestLock() {
      try {
        const r = target.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch {
        // Sin Pointer Lock (p. ej. en un iframe): queda el arrastre con el ratón.
      }
    },
    onClick: (fn) => listeners.click.push(fn),
    /** Toque corto sin arrastrar (pantalla táctil). */
    onTap: (fn) => listeners.tap.push(fn),
    onLockChange: (fn) => listeners.lockChange.push(fn),
  };
}
