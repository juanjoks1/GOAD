// Controles táctiles en pantalla: la palanca (aparece donde apoyas el dedo) y los botones de la
// cruz y de agacharse. Solo se ven en pantallas táctiles y mientras se juega.
import { TOUCH } from '../config.js';
import { touchButtonCenter } from '../core/input.js';

function button(label, b) {
  const el = document.createElement('div');
  el.className = 'touch-button';
  el.textContent = label;
  el.style.width = el.style.height = `${b.radius * 2}px`;
  document.body.append(el);
  return el;
}

export function createTouchControls(input, { enabled }) {
  const size = TOUCH.stickRadius * 2;
  const base = document.createElement('div');
  base.className = 'stick-base';
  base.style.width = base.style.height = `${size}px`;
  const knob = document.createElement('div');
  knob.className = 'stick-knob';
  document.body.append(base, knob);
  const cross = button('CRUZ', TOUCH.crossButton);
  const crouch = button('AGACHAR', TOUCH.crouchButton);

  const place = (el, b) => {
    const c = touchButtonCenter(b);
    el.style.transform = `translate(${c.x - c.r}px, ${c.y - c.r}px)`;
  };

  return {
    /** playing: si se está jugando; state: { crossActive, crossBroken, crouched } */
    update(playing, state = {}) {
      const showButtons = playing && (enabled || input.touchUsed);
      input.setTouchButtons(showButtons);
      for (const [el, b] of [[cross, TOUCH.crossButton], [crouch, TOUCH.crouchButton]]) {
        el.style.display = showButtons ? 'flex' : 'none';
        if (showButtons) place(el, b);
      }
      cross.classList.toggle('on', Boolean(state.crossActive));
      cross.classList.toggle('broken', Boolean(state.crossBroken));
      crouch.classList.toggle('on', Boolean(state.crouched));

      const st = input.stick();
      const show = Boolean(playing && st);
      base.style.display = knob.style.display = show ? 'block' : 'none';
      if (!show) return;
      base.style.transform = `translate(${st.ox - TOUCH.stickRadius}px, ${st.oy - TOUCH.stickRadius}px)`;
      knob.style.transform = `translate(${st.x}px, ${st.y}px) translate(-50%, -50%)`;
    },
  };
}
