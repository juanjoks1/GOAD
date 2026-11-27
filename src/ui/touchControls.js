// Indicador de la palanca táctil: un aro y una perilla que aparecen donde apoyas el dedo.
import { TOUCH } from '../config.js';

export function createTouchControls(input) {
  const size = TOUCH.stickRadius * 2;
  const base = document.createElement('div');
  base.className = 'stick-base';
  base.style.width = base.style.height = `${size}px`;
  const knob = document.createElement('div');
  knob.className = 'stick-knob';
  document.body.append(base, knob);

  return {
    update(visible) {
      const st = input.stick();
      const show = Boolean(visible && st);
      base.style.display = knob.style.display = show ? 'block' : 'none';
      if (!show) return;
      base.style.transform = `translate(${st.ox - TOUCH.stickRadius}px, ${st.oy - TOUCH.stickRadius}px)`;
      knob.style.transform = `translate(${st.x}px, ${st.y}px) translate(-50%, -50%)`;
    },
  };
}
