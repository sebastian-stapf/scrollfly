/* Demonstration only: a visual reflex, not a trained agent. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./environment.js'));
  else root.FlyPolicy = factory(root.FlyLab);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FlyLab) {
  'use strict';
  const M = FlyLab.math;
  // Receives observations only. Orientation memory derives from its own actions.
  class SensorReflex {
    constructor(config) { this.config = config; this.yaw = Math.PI / 2; this.pitch = 0; this.roll = 0; this.omega = [0, 0, 0]; this.tick = 0; }
    visualDirections(vision) {
      const signals = { reward: [0, 0, 0], danger: [0, 0, 0] };
      const tan = Math.tan(this.config.fov * Math.PI / 360);
      // Classify RGB pixels in the actual camera observations, never world state.
      for (const pixels of [vision.mono || vision.left, vision.right].filter(Boolean)) {
        for (let y = 0; y < vision.height; y++) for (let x = 0; x < vision.width; x++) {
          const i = (y * vision.width + x) * 3, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          const isReward = r > g * 1.3 && g > b * 1.25 && r > 45;
          const isDanger = (g > r * 1.25 && g > b * 1.2 && g > 40) || (r > g * 1.6 && b > g * .9 && r > 45);
          if (!isReward && !isDanger) continue;
          const right = ((x + .5) / vision.width * 2 - 1) * tan;
          const direction = this.config.dimension === 2 ? [1 - (y + .5) / vision.height, right, 0]
            : [1, right, (1 - (y + .5) / vision.height * 2) * tan * vision.height / vision.width];
          const kind = isReward ? 'reward' : 'danger';
          signals[kind] = M.add(signals[kind], M.unit(direction));
        }
      }
      return { reward: M.unit(signals.reward), danger: M.unit(signals.danger) };
    }
    act(obs) {
      const c = this.config, visual = this.visualDirections(obs.vision);
      let target = [0, 0, 0];
      // Odor attracts toward either kind of object, including an unseen flytrap.
      if (obs.smell && obs.smell.at(-1) > 0) target = [obs.smell[0], obs.smell[1], c.dimension === 3 ? obs.smell[2] : 0];
      if (M.norm(visual.reward) > 0) target = visual.reward;
      // Only visual evidence can trigger avoidance; the scent carries no category.
      if (M.norm(visual.danger) > 0 && (M.norm(target) === 0 || M.dot(M.unit(target), visual.danger) > .45)) {
        target = M.sub(target, M.scale(visual.danger, 1.7));
      }
      this.tick++;
      let action;
      if (c.control === 'directional') {
        if (Math.hypot(...target) < .01) action = [4, c.dimension === 2 ? 1 : 5, 3, c.dimension === 2 ? 2 : 6][Math.floor(this.tick / 18) % 4];
        else {
          const b = FlyLab.basis({ yaw: this.yaw, pitch: 0, roll: 0 });
          const world = M.add(M.add(M.scale(b.f, target[0]), M.scale(b.r, target[1])), M.scale(b.u, target[2]));
          const axis = world.map(Math.abs).indexOf(Math.max(...world.map(Math.abs)));
          action = axis === 0 ? (world[0] > 0 ? 4 : 3) : axis === 1 ? (world[1] > 0 ? (c.dimension === 2 ? 1 : 5) : (c.dimension === 2 ? 2 : 6)) : (world[2] > 0 ? 1 : 2);
        }
        if (c.directionalFrame !== 'heading') this.yaw=Math.PI/2;
        else if (action === 3) this.yaw = Math.PI; else if (action === 4) this.yaw = 0;
        else if (action === (c.dimension === 2 ? 1 : 5)) this.yaw = Math.PI / 2;
        else if (action === (c.dimension === 2 ? 2 : 6)) this.yaw = -Math.PI / 2;
      } else {
        const yawError = Math.hypot(...target) < .01 ? .9 : Math.atan2(-target[1], target[0]);
        const turn = M.clamp(yawError * 1.6 - this.omega[0] * .28, -.9, .9);
        const thrust = M.clamp(Math.cos(yawError) * .78, .06, .78);
        action = [M.clamp(thrust + turn, -1, 1), M.clamp(thrust - turn, -1, 1)];
        if (c.dimension === 3) action.push(M.clamp(Math.atan2(target[2], Math.hypot(target[0], target[1])) * 1.8 - this.omega[1] * .45, -1, 1), M.clamp(-this.roll * 1.5, -1, 1));
        const [left, right, pitch = 0, bank = 0] = action, dt = c.dt;
        this.omega[0] = (this.omega[0] + ((left - right) * 8 + Math.sin(this.roll) * 2) * dt) * Math.exp(-3.2 * dt);
        this.omega[1] = (this.omega[1] + pitch * 4.8 * dt) * Math.exp(-3 * dt);
        this.omega[2] = (this.omega[2] + (bank * 6 - this.roll * 2) * dt) * Math.exp(-3 * dt);
        this.yaw = M.wrap(this.yaw + this.omega[0] * dt); this.pitch = M.clamp(this.pitch + this.omega[1] * dt, -1.45, 1.45); this.roll = M.clamp(this.roll + this.omega[2] * dt, -1.2, 1.2);
      }
      return action;
    }
  }
  return { SensorReflex };
});
