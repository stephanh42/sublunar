'use strict';

class CanvasViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawPromise = null;
    // ensure load() is only started on next tick
    this.loadPromise = Promise.resolve().then(() => this.load());
    this.dpi = 1;
  }

  async load() {
  }

  redraw() {
    if (this.drawPromise === null) {
      this.drawPromise = this.loadPromise.then(() =>
          new Promise((resolve, reject) =>
            window.requestAnimationFrame((time) => {
              this.drawPromise = null;
              try {
                this.basicDraw(time);
                resolve(time);
              } catch (exc) {
                reject(exc);
              }
              })));
    }
    return this.drawPromise;
  }

  async animateUntil(time) {
    for (;;) {
      const t = await this.redraw();
      if (t >= time) {
        return t;
      }
    }
  }

  redrawOnWindowResize() {
    window.addEventListener('resize', () => this.redraw(), false);
  }

  basicDraw(time) {
    const canvas = this.canvas;
    const width = (canvas.clientWidth * this.dpi)|0;
    const height = (canvas.clientHeight * this.dpi)|0;
    if ((width !== canvas.width) || (height !== canvas.height)) {
      canvas.width = width;
      canvas.height = height;
    }
    this.draw(time);
  }

  draw() {}

  getMousePos(evt) {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    return [
      (evt.clientX - rect.left) / (rect.right - rect.left) * canvas.width,
      (evt.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height
    ];
  }
}

module.exports = CanvasViewer;
