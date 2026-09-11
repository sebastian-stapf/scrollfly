(function (root) {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, x));
  function smooth(a, b, value) { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); }
  // Illustrative enjoyment index: watch share plus the difference from viewers.
  function likingScore(predicted, median, duration) {
    if (![predicted, median, duration].every(Number.isFinite) || duration <= 0 || median < 0) return null;
    return 100 * clamp(predicted / duration + (predicted - median) / duration);
  }
  class FlyPerformance {
    reset(predicted, median, duration) {
      if (!Number.isFinite(duration) || duration <= 0) throw Error('Positive duration required');
      this.duration = duration; this.midpoint = duration / 2; this.liked = false;
      this.eligible = Number.isFinite(predicted) && Number.isFinite(median) && predicted >= median + 1;
    }
    advance(elapsed) {
      if (!this.eligible || this.liked || !Number.isFinite(elapsed) || elapsed < this.midpoint) return false;
      this.liked = true; return true;
    }
    pose(elapsed) {
      const fraction = clamp(elapsed / this.duration);
      const after = this.liked ? clamp((fraction - .5) / .36) : 0;
      const anticipation = this.eligible && !this.liked ? smooth(.34, .5, fraction) : 0;
      return { fraction, anticipation, after, liked: this.liked,
        reach: this.liked ? 1 - smooth(0, .38, after) : anticipation,
        cheer: this.liked ? smooth(0, .14, after) * (1 - smooth(.72, 1, after)) : 0 };
    }
  }
  if (typeof module !== 'undefined') module.exports = { FlyPerformance, smooth, likingScore };
  else { root.FlyPerformance = FlyPerformance; root.FlyLiking = { score: likingScore }; }
})(globalThis);
