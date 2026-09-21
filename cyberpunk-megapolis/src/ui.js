/**
 * All DOM: the loader, the character-selection menu, the HUD, the pause overlay,
 * notices, the compatibility notice and the fatal-error card.
 *
 * One strict phase owns the flow (loading -> menu -> playing <-> paused). Every
 * transition goes through setPhase, and startGame is guarded by a re-entry lock,
 * so an async load finishing late, a focused button or a pointer-lock change can
 * never start the game twice or spin up a second animation loop.
 */
import { STATE_LABEL } from '../controller.js';

export const PHASES = ['loading', 'menu', 'controls', 'playing', 'paused', 'fatal'];

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ onSelect, onStart, onResume, onRetry }) {
    this.el = {
      loader: $('loader'), pct: $('ld-pct'), bar: $('ld-bar'), count: $('ld-count'), errs: $('ld-errors'),
      menu: $('menu'), chars: $('chars'), enter: $('enter'), touch: $('touch-note'),
      hud: $('hud'), speed: $('hud-speed'), height: $('hud-height'), state: $('hud-state'),
      perf: $('perf'), notice: $('notice'),
      controls: $('controls'), controlsClose: $('controls-close'),
      pause: $('pause'),
      compat: $('compat'), compatTitle: $('compat-title'), compatBody: $('compat-body'), compatOk: $('compat-ok'),
      fatal: $('fatal'), fatalBody: $('fatal-body'), fatalDetail: $('fatal-detail'), fatalRetry: $('fatal-retry'),
      flash: $('flash'), fade: $('fade'),
      canvas: $('gl'),
    };
    this.phase = 'loading';
    this.selected = null;
    this.startLock = false;
    this.controlsSeen = false;
    this._noticeTimer = 0;
    this.cb = { onSelect, onStart, onResume, onRetry };
    this._wire();
    this._showTouchNoteIfNeeded();
  }

  /* ------------------------------------------------------------- plumbing */
  _wire() {
    this.charButtons = [...this.el.chars.querySelectorAll('.char')];
    this.charButtons.forEach((b, i) => {
      b.addEventListener('click', () => this.select(b.dataset.char));
      b.addEventListener('mouseenter', () => { if (this.phase === 'menu') b.focus({ preventScroll: true }); });
      b.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.select(b.dataset.char); }
      });
      b._index = i;
    });

    this.el.enter.addEventListener('click', () => this.requestStart());
    this.el.controlsClose.addEventListener('click', () => this.cb.onStart?.('controls-dismissed'));
    this.el.compatOk.addEventListener('click', () => { this.el.compat.hidden = true; });
    this.el.fatalRetry.addEventListener('click', () => this.cb.onRetry?.());

    // menu keyboard: arrows pick, Enter starts (only with a selection)
    window.addEventListener('keydown', (e) => {
      if (this.phase === 'menu') {
        if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); this._cycle(-1); }
        else if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); this._cycle(1); }
        else if (e.key === 'Enter') { e.preventDefault(); this.requestStart(); }
      } else if (this.phase === 'controls') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.cb.onStart?.('controls-dismissed'); }
      } else if (this.phase === 'paused') {
        if (e.key === 'Enter') { e.preventDefault(); this.cb.onResume?.(); }
      }
    });

    this.el.pause.addEventListener('click', () => { if (this.phase === 'paused') this.cb.onResume?.(); });
  }

  _showTouchNoteIfNeeded() {
    const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (!touchOnly) return;
    this.el.touch.hidden = false;
    document.body.classList.add('is-touch');
    // portrait on a phone leaves almost no room for the city
    const orient = () => {
      const portrait = window.innerHeight > window.innerWidth;
      this.el.touch.textContent = portrait
        ? '请横屏游玩 · Please rotate to landscape'
        : '支持触屏操作 · Touch controls supported';
      document.body.classList.toggle('is-portrait', portrait);
    };
    orient();
    window.addEventListener('resize', orient);
    window.addEventListener('orientationchange', orient);
  }

  _cycle(dir) {
    const i = this.selected ? this.charButtons.findIndex((b) => b.dataset.char === this.selected) : -1;
    const n = this.charButtons.length;
    const next = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n;
    this.select(this.charButtons[next].dataset.char);
    this.charButtons[next].focus({ preventScroll: true });
  }

  select(id) {
    if (this.phase !== 'menu') return;
    this.selected = id;
    for (const b of this.charButtons) b.setAttribute('aria-checked', String(b.dataset.char === id));
    this.el.enter.disabled = false;
    this.cb.onSelect?.(id);
  }

  /** the single gate into gameplay */
  requestStart() {
    if (this.phase !== 'menu' || !this.selected || this.startLock) return false;
    this.startLock = true;                 // released only by setPhase('menu')
    this.el.enter.blur();                  // so a later Space/Enter cannot re-click it
    this.el.enter.disabled = true;
    this.cb.onStart?.(this.selected);
    return true;
  }

  /* ---------------------------------------------------------------- phase */
  setPhase(phase) {
    if (!PHASES.includes(phase)) throw new Error('unknown phase ' + phase);
    if (this.phase === phase) return false;
    this.phase = phase;
    this.el.menu.hidden = phase !== 'menu';
    this.el.controls.hidden = phase !== 'controls';
    this.el.pause.hidden = phase !== 'paused';
    this.el.hud.hidden = !(phase === 'playing' || phase === 'paused');
    if (phase === 'playing') {
      requestAnimationFrame(() => this.el.hud.dataset.in = '1');
      this.el.hud.setAttribute('aria-hidden', 'false');
    }
    if (phase === 'menu') {
      this.startLock = false;
      this.el.enter.disabled = !this.selected;
      this.el.hud.dataset.in = '0';
    }
    if (phase === 'paused') this.el.pause.focus?.();
    return true;
  }

  /* --------------------------------------------------------------- loader */
  progress(loaded, total, errors) {
    const t = Math.max(total, loaded, 1);
    const pct = Math.min(100, Math.round((loaded / t) * 100));
    this.el.pct.textContent = pct + '%';
    this.el.bar.style.width = pct + '%';
    this.el.count.textContent = `LOADING ASSETS · ${loaded} / ${t}`;
    if (errors && errors.length && this.el.errs.childElementCount !== errors.length) {
      this.el.errs.hidden = false;
      this.el.errs.innerHTML = errors.slice(-6).map((e) => `<li>缺失资源 asset failed: ${escapeHtml(e)} — 已使用备用 fallback used</li>`).join('');
    }
  }

  hideLoader() {
    return new Promise((res) => {
      this.el.loader.dataset.out = '1';
      setTimeout(() => { this.el.loader.hidden = true; res(); }, 950);
    });
  }

  /* ------------------------------------------------------------------ HUD */
  hud(player) {
    this.el.speed.textContent = String(player.speedKmh);
    this.el.height.textContent = String(player.heightM);
    const label = STATE_LABEL[player.state] || player.state;
    if (this.el.state.textContent !== label) this.el.state.textContent = label;
  }

  perf(text) { this.el.perf.textContent = text; }
  showPerf(on) { this.el.perf.hidden = !on; }

  notice(text, ms = 2000) {
    this.el.notice.textContent = text;
    this.el.notice.dataset.in = '1';
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => { this.el.notice.dataset.in = '0'; }, ms);
  }

  flash(ms = 380) {
    this.el.flash.style.transitionDuration = (ms * 0.35) + 'ms';
    this.el.flash.style.opacity = '0.82';
    setTimeout(() => { this.el.flash.style.opacity = '0'; }, ms * 0.35);
  }

  fadeOut(ms = 350) {
    this.el.fade.style.transitionDuration = ms + 'ms';
    this.el.fade.style.opacity = '1';
    return new Promise((r) => setTimeout(r, ms));
  }
  fadeIn(ms = 350) {
    this.el.fade.style.transitionDuration = ms + 'ms';
    this.el.fade.style.opacity = '0';
    return new Promise((r) => setTimeout(r, ms));
  }

  showControls() { this.controlsSeen = true; this.setPhase('controls'); this.el.controlsClose.focus({ preventScroll: true }); }

  compat(title, body) {
    this.el.compatTitle.textContent = title;
    this.el.compatBody.textContent = body;
    this.el.compat.hidden = false;
  }

  fatal(message, detail) {
    this.setPhase('fatal');
    this.el.fatal.hidden = false;
    this.el.fatalBody.textContent = message;
    this.el.fatalDetail.textContent = detail || '';
    this.el.fatalRetry.focus({ preventScroll: true });
  }
  clearFatal() { this.el.fatal.hidden = true; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
