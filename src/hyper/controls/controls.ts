// @ts-nocheck
import { clamp } from '../core/math4d';

const ROTATION_KEYS = {
  q: { plane: 'xw', delta: -1 },
  e: { plane: 'xw', delta: 1 },
  w: { plane: 'yw', delta: -1 },
  s: { plane: 'yw', delta: 1 },
  a: { plane: 'zw', delta: -1 },
  d: { plane: 'zw', delta: 1 },
  ArrowUp: { plane: 'yz', delta: -1 },
  ArrowDown: { plane: 'yz', delta: 1 },
  ArrowLeft: { plane: 'xy', delta: -1 },
  ArrowRight: { plane: 'xy', delta: 1 },
};

function applyRotation(state, plane, delta) {
  const step = 0.04 * delta;
  state.rotation[plane] = (state.rotation[plane] || 0) + step;
}

export class HyperControls {
  constructor({ canvas, state, callbacks = {} }) {
    this.canvas = canvas;
    this.state = state;
    this.callbacks = callbacks;
    this.isDragging = false;
    this.pointerId = null;
    this.lastPos = { x: 0, y: 0 };

    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onWheel = this.onWheel.bind(this);

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('keydown', this._onKeyDown);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('keydown', this._onKeyDown);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }

  trigger(event) {
    if (this.callbacks[event]) {
      this.callbacks[event](this.state);
    }
  }

  onPointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.isDragging = true;
    this.pointerId = event.pointerId;
    this.lastPos = { x: event.clientX, y: event.clientY };
  }

  onPointerMove(event) {
    if (!this.isDragging || event.pointerId !== this.pointerId) return;

    const dx = event.clientX - this.lastPos.x;
    const dy = event.clientY - this.lastPos.y;
    this.lastPos = { x: event.clientX, y: event.clientY };

    const modifier = event.shiftKey ? 'high' : event.altKey || event.metaKey ? 'zw' : 'base';
    const speed = modifier === 'high' ? 0.0035 : 0.0025;

    if (modifier === 'base') {
      this.state.rotation.xy += dx * speed;
      this.state.rotation.xz += dy * speed;
    } else if (modifier === 'high') {
      this.state.rotation.xw += dx * speed;
      this.state.rotation.yw += dy * speed;
    } else {
      this.state.rotation.zw += dx * speed;
      this.state.rotation.yz += dy * speed;
    }

    this.trigger('rotation');
  }

  onPointerUp(event) {
    if (event.pointerId !== this.pointerId) return;
    this.isDragging = false;
    this.pointerId = null;
  }

  onWheel(event) {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const zoomDelta = -Math.sign(event.deltaY) * 0.08;
      this.adjustZoom(zoomDelta);
      return;
    }

    if (event.shiftKey && event.altKey) {
      const rotDelta = event.deltaX * 0.002;
      const rotDeltaY = event.deltaY * 0.002;
      this.state.rotation.xy += rotDelta;
      this.state.rotation.xz += rotDeltaY;
      this.trigger('rotation');
      return;
    }

    if (event.altKey) {
      const rotDelta = event.deltaX * 0.0015;
      const rotDeltaY = event.deltaY * 0.0015;
      this.state.rotation.xw += rotDelta;
      this.state.rotation.yw += rotDeltaY;
      this.trigger('rotation');
      return;
    }

    if (event.shiftKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const rotDelta = event.deltaX * 0.001;
      this.state.rotation.zw += rotDelta;
      this.trigger('rotation');
      return;
    }

    const delta = Math.sign(event.deltaY) * 0.02;
    const next = clamp(this.state.slice.offset + delta, -1.5, 1.5);
    if (next !== this.state.slice.offset) {
      this.state.slice.offset = next;
      this.trigger('slice');
    }
  }

  adjustZoom(delta) {
    this.state.camera.zoom = clamp(this.state.camera.zoom + delta, 0.5, 2.5);
    if (this.callbacks.zoom) {
      this.callbacks.zoom(this.state);
    }
  }

  onKeyDown(event) {
    const key = event.key;
    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'SELECT' ||
      activeElement.contentEditable === 'true' ||
      activeElement.isContentEditable ||
      activeElement.getAttribute('role') === 'textbox' ||
      activeElement.getAttribute('role') === 'searchbox'
    )) {
      return;
    }

    if (event.shiftKey && (event.code === 'Period' || key === '>')) {
      event.preventDefault();
      if (this.callbacks.onTogglePanels) {
        this.callbacks.onTogglePanels();
      }
      return;
    }

    if (ROTATION_KEYS[key]) {
      applyRotation(this.state, ROTATION_KEYS[key].plane, ROTATION_KEYS[key].delta);
      this.trigger('rotation');
      event.preventDefault();
      return;
    }

    switch (key) {
      case ' ':
        event.preventDefault();
        this.state.autoRotate = !this.state.autoRotate;
        this.trigger('autorotate');
        break;
      case '[': {
        const next = clamp(this.state.slice.offset - 0.05, -1.5, 1.5);
        this.state.slice.offset = next;
        this.trigger('slice');
        break;
      }
      case ']': {
        const next = clamp(this.state.slice.offset + 0.05, -1.5, 1.5);
        this.state.slice.offset = next;
        this.trigger('slice');
        break;
      }
      case ';': {
        const next = clamp(this.state.slice.thickness - 0.02, 0.01, 0.6);
        this.state.slice.thickness = next;
        this.trigger('slice');
        break;
      }
      case "'": {
        const next = clamp(this.state.slice.thickness + 0.02, 0.01, 0.6);
        this.state.slice.thickness = next;
        this.trigger('slice');
        break;
      }
      case '1':
        this.state.slice.mode = 'projection';
        this.trigger('mode');
        break;
      case '2':
        this.state.slice.mode = 'hyperplane';
        this.trigger('mode');
        break;
      case '3':
        this.state.slice.mode = 'shadow';
        this.trigger('mode');
        break;
      case '+':
      case '=':
        this.adjustZoom(0.08);
        break;
      case '-':
      case '_':
        this.adjustZoom(-0.08);
        break;
      default:
        break;
    }
  }
}
