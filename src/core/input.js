// Teclado, ratón y Pointer Lock. Teclas por posición física (e.code): WASD funciona en cualquier distribución.

export function createInput(target) {
  const down = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let dragging = false;
  const listeners = { click: [], lockChange: [] };

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
      return { forward: f, strafe: s };
    },
    get locked() {
      return isLocked();
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
    onLockChange: (fn) => listeners.lockChange.push(fn),
  };
}
