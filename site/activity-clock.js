(function (root) {
  'use strict';
  // Never reveal a neural window before it ends, or invent activity past a recording.
  function activityIndex(bins, elapsed) {
    if (!bins?.length || !Number.isFinite(elapsed) || elapsed < bins[0].time) return -1;
    let low = 0, high = bins.length;
    while (low < high) { const middle = (low + high) >>> 1; if (bins[middle].time <= elapsed + 1e-9) low = middle + 1; else high = middle; }
    return low - 1;
  }
  // Actual media time naturally stops on buffering and already includes playback speed.
  function mediaDelta(previous, current, duration) {
    if (![previous, current].every(Number.isFinite)) return 0;
    if (current >= previous) return current - previous;
    return Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - previous + current) : 0;
  }
  // UI progress uses the original media timeline, independently of the fly's deadline.
  function mediaProgress(current, duration, fallbackDuration) {
    const length = [duration, fallbackDuration].find(value => Number.isFinite(value) && value > 0);
    if (length === undefined) return { duration: null, elapsed: 0, remaining: null, fraction: 0 };
    const elapsed = Number.isFinite(current) ? Math.max(0, Math.min(length, current)) : 0;
    return { duration: length, elapsed, remaining: length - elapsed, fraction: elapsed / length };
  }
  if (typeof module !== 'undefined') module.exports = { activityIndex, mediaDelta, mediaProgress };
  else root.ActivityClock = { activityIndex, mediaDelta, mediaProgress };
})(globalThis);
