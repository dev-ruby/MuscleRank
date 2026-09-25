/* Fixed center marker; all positions and velocity are measured in CSS pixels. */
(() => {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const snap = (n, step, min, max) => clamp(Math.round(n / step) * step, min, max);
  class RulerControl {
    constructor(element, { min, max, step, spacing, unit, onChange, onCommit }) {
      Object.assign(this, { element, min, max, step, spacing, unit, onChange, onCommit });
      this.track = element.querySelector('.ruler-track');
      this.value = min;
      this.lastOutput = min;
      this.frame = 0;
      this.buildTicks();
      element.addEventListener('pointerdown', e => this.start(e));
      element.addEventListener('pointermove', e => this.move(e));
      element.addEventListener('pointerup', e => this.end(e));
      element.addEventListener('pointercancel', () => this.stop(true));
      element.addEventListener('lostpointercapture', () => { if (this.drag) this.stop(true); });
      element.addEventListener('keydown', e => {
        const {step,min,max} = this;
        const deltas = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 10, PageDown: -step * 10 };
        if (!(e.key in deltas) && !['Home', 'End'].includes(e.key)) return;
        e.preventDefault(); this.stop();
        const next = e.key === 'Home' ? min : e.key === 'End' ? max : this.value + deltas[e.key];
        this.glide(clamp(next, min, max), 170);
      });
      this.paint(false);
    }
    configure(options) {
      this.stop();
      const changed = ['min','max','step','spacing'].some(key => this[key] !== options[key]);
      Object.assign(this, options);
      this.element.setAttribute('aria-valuemin', this.min);
      this.element.setAttribute('aria-valuemax', this.max);
      if (changed) this.buildTicks();
    }
    buildTicks() {
      const {min,max,step,spacing} = this;
      this.track.replaceChildren();
      for (let i = Math.ceil(min / step); i <= max / step; i++) {
        const tick = document.createElement('span');
        const value = i * step;
        const major = this.unit === 'kg' ? value % 5 === 0 : true;
        tick.className = `ruler-tick${major ? ' major' : ''}`;
        tick.style.left = `${value / step * spacing}px`;
        if (major) { const label = document.createElement('i'); label.textContent = value; tick.append(label); }
        this.track.append(tick);
      }
    }
    paint(emit = true) {
      this.track.style.transform = `translate3d(${-this.value / this.step * this.spacing}px,0,0)`;
      const output = snap(this.value, this.step, this.min, this.max);
      this.element.setAttribute('aria-valuenow', output);
      this.element.setAttribute('aria-valuetext', `${output} ${this.unit}`);
      if (emit && output !== this.lastOutput) this.onChange(output);
      this.lastOutput = output;
    }
    set(value) { this.stop(); this.value = clamp(Number(value) || this.min, this.min, this.max); this.paint(false); }
    stop(commit = false) {
      cancelAnimationFrame(this.frame); this.frame = 0;
      const pointer = this.drag?.id; this.drag = null;
      if (pointer !== undefined && this.element.hasPointerCapture(pointer)) this.element.releasePointerCapture(pointer);
      this.element.classList.remove('dragging');
      this.value = snap(this.value, this.step, this.min, this.max);
      this.paint(false);
      if (commit) this.onCommit();
    }
    start(e) {
      if (!e.isPrimary || e.button !== 0) return;
      this.stop(true); this.element.focus({ preventScroll: true });
      this.element.setPointerCapture(e.pointerId);
      this.element.classList.add('dragging');
      this.drag = { id: e.pointerId, x: e.clientX, time: e.timeStamp, velocity: 0 };
    }
    move(e) {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const delta = this.drag.x - e.clientX;
      const elapsed = Math.max(1, e.timeStamp - this.drag.time);
      this.value = clamp(this.value + delta / this.spacing * this.step, this.min, this.max);
      this.drag.velocity = this.drag.velocity * .35 + clamp(delta / elapsed, -.65, .65) * .65;
      this.drag.x = e.clientX; this.drag.time = e.timeStamp;
      this.paint();
    }
    end(e) {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const velocity = e.timeStamp - this.drag.time > 90 ? 0 : this.drag.velocity;
      this.drag = null; this.element.classList.remove('dragging');
      this.element.releasePointerCapture(e.pointerId);
      // Short, bounded coast: at most 2.1 kg / 1.1 reps beyond the finger.
      const destination = snap(this.value + velocity * 90 / this.spacing * this.step, this.step, this.min, this.max);
      this.glide(destination, 260);
    }
    glide(destination, duration) {
      cancelAnimationFrame(this.frame);
      const from = this.value, start = performance.now();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) duration = 0;
      const tick = now => {
        const progress = duration ? Math.min(1, (now - start) / duration) : 1;
        this.value = from + (destination - from) * (1 - Math.pow(1 - progress, 3));
        this.paint();
        if (progress < 1) this.frame = requestAnimationFrame(tick);
        else { this.frame = 0; this.onCommit(); }
      };
      this.frame = requestAnimationFrame(tick);
    }
  }
  window.RulerControl = RulerControl;
})();
