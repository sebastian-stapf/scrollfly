(function (root) {
  'use strict';
  class WatchClock {
    constructor() { this.elapsed = 0; this.target = 1; this.running = false; }
    reset(seconds) { if (!Number.isFinite(seconds) || seconds <= 0) throw Error('Positive watch time required'); this.elapsed = 0; this.target = seconds; }
    advance(dt, speed = 1) { if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(speed) || speed <= 0) throw Error('Invalid elapsed time'); if (this.running) this.elapsed = Math.min(this.target, this.elapsed + dt * speed); return this.elapsed >= this.target; }
    get fraction() { return this.elapsed / this.target; }
  }
  if (typeof module !== 'undefined') module.exports = { WatchClock };
  else root.WatchClock = WatchClock;
})(typeof globalThis === 'undefined' ? this : globalThis);
