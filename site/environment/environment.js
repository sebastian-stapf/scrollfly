/* Fly foraging simulation. No browser dependencies; CommonJS and window API. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlyLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const ENV_VERSION = 'flyspace-v2-fixed-directional';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const norm = a => Math.hypot(...a);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (a, s) => a.map(v => v * s);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const unit = a => scale(a, 1 / (norm(a) || 1));
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let v = Math.imul(t ^ t >>> 15, 1 | t);
      v ^= v + Math.imul(v ^ v >>> 7, 61 | v);
      return ((v ^ v >>> 14) >>> 0) / 4294967296;
    };
  }
  function basis(fly) {
    const { yaw, pitch, roll } = fly;
    const f = [Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)];
    const r = [Math.sin(yaw), -Math.cos(yaw), 0];
    const u = [-Math.cos(yaw) * Math.sin(pitch), -Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch)];
    return { f, r: add(scale(r, Math.cos(roll)), scale(u, Math.sin(roll))), u: add(scale(u, Math.cos(roll)), scale(r, -Math.sin(roll))) };
  }
  // Shared geometric visual models. Positions are independent of observer camera.
  function objectParts(object) {
    const p = object.position, r = object.radius;
    const sphere = (offset, size, color) => ({ position: add(p, scale(offset, r)), radius: size * r, color, kind: object.kind });
    if (object.kind === 'reward') return [
      sphere([0, 0, -.34], .85, [126, 70, 32]),
      sphere([-.09, 0, .18], .65, [161, 94, 43]),
      sphere([.12, 0, .63], .39, [188, 120, 55]),
      sphere([.03, 0, .95], .19, [210, 145, 70])
    ];
    return [sphere([0, 0, -.37], .67, [47, 135, 80]),
      sphere([-.46, 0, .12], .58, [77, 196, 102]),
      sphere([.46, 0, .12], .58, [77, 196, 102]),
      sphere([-.28, -.24, .31], .39, [183, 60, 70]),
      sphere([.28, -.24, .31], .39, [183, 60, 70])];
  }
  function contactTime(from, to, point, radius) {
    const d = sub(to, from), m = sub(from, point), c = dot(m, m) - radius * radius;
    if (c <= 0) return 0;
    const a = dot(d, d), b = dot(m, d), disc = b * b - a * c;
    if (a < 1e-12 || disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    return t >= 0 && t <= 1 ? t : null;
  }
  class FlyEnv {
    constructor(options = {}) {
      this.config = Object.freeze({ dimension: 2, control: 'directional', sensors: 'vision-smell',
        rewardCount: 16, dangerCount: 7, maxSteps: 1800, dt: 1 / 30, speed: 5.2,
        width: 96, height: 64, fov: 100, eyeSeparation: .22, far: 30,
        lethalTraps: false, wallPenalty: -.01, directionalFrame: 'fixed', scenario:'foraging', ...options });
      const c = this.config;
      if (![2, 3].includes(c.dimension) || !['directional', 'wings'].includes(c.control) ||
        !['vision', 'vision-smell'].includes(c.sensors)) throw new RangeError('Invalid environment mode');
      for (const key of ['rewardCount', 'dangerCount', 'maxSteps', 'width', 'height']) {
        if (!Number.isInteger(c[key]) || c[key] < (['rewardCount', 'dangerCount'].includes(key) ? 0 : 1)) throw new RangeError('Invalid ' + key);
      }
      if (c.rewardCount + c.dangerCount > 100 || c.width > 512 || c.height > 512) throw new RangeError('Configuration too large');
      for (const key of ['dt', 'speed', 'far', 'fov', 'eyeSeparation']) {
        if (!Number.isFinite(c[key]) || c[key] <= 0) throw new RangeError('Invalid ' + key);
      }
      if (c.dt > .1 || c.fov >= 170) throw new RangeError('dt or FOV out of range');
      if (!Number.isFinite(c.wallPenalty) || c.wallPenalty > 0) throw new RangeError('wallPenalty must be finite and nonpositive');
      if (!['fixed','heading'].includes(c.directionalFrame)) throw new RangeError('Invalid directionalFrame');
      if (!['foraging','reach','choice'].includes(c.scenario)) throw new RangeError('Invalid scenario');
      this.actionSpace = c.control === 'directional' ? { type: 'Discrete', n: c.dimension === 2 ? 5 : 7 }
        : { type: 'Box', shape: [c.dimension === 2 ? 2 : 4], low: -1, high: 1 };
      this.observationSpace = { vision: { shape: [c.height, c.width, 3], dtype: 'uint8', cameras: c.dimension === 2 ? ['mono'] : ['left', 'right'] } };
      if (c.sensors === 'vision-smell') this.observationSpace.smell = { shape: [c.dimension + 1], directionRange: [-1, 1], intensityRange: [0, 1] };
      this.reset(42);
    }
    reset(seed = 42) {
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new RangeError('Seed must be a uint32');
      this.seed = seed;
      const random = rng(seed), c = this.config;
      this.episodeRewardCount = c.scenario==='foraging'?c.rewardCount:1;
      this.state = { fly: { position: [0, 0, 0], velocity: [0, 0, 0], yaw: Math.PI / 2, pitch: 0, roll: 0, angularVelocity: [0, 0, 0], radius: .28 },
        objects: [], steps: 0, score: 0, collected: 0, hits: 0, wallContacts: 0, wallPenaltyTotal: 0, terminated: c.rewardCount === 0, truncated: false, events: [], lastAction: c.control === 'directional' ? 0 : Array(c.dimension === 2 ? 2 : 4).fill(0) };
      for (let i = 0; i < c.rewardCount + c.dangerCount; i++) {
        let position, placed = false;
        for (let attempt = 0; attempt < 5000; attempt++) {
          position = [(random() * 2 - 1) * 10.7, (random() * 2 - 1) * 10.7, c.dimension === 3 ? (random() * 2 - 1) * 6.7 : 0];
          if (norm(position) > 2.2 && this.state.objects.every(o => norm(sub(position, o.position)) > 1.55)) { placed = true; break; }
        }
        if (!placed) throw new Error('Could not place objects with required clearance');
        this.state.objects.push({ id: i, kind: i < c.rewardCount ? 'reward' : 'danger', position, radius: i < c.rewardCount ? .55 : .67 });
      }
      // Explicit diagnostic curricula use the same rendering/contact/reward code.
      if(c.scenario==='reach'){
        const axis=Math.floor(random()*c.dimension),side=random()<.5?-1:1,position=[0,0,0];
        position[axis]=side*(1.08+random()*.12);
        this.state.objects=[{id:0,kind:'reward',position,radius:.55}];
      }else if(c.scenario==='choice'){
        const rewardOnLeft=random()<.5;
        // Equal distance and fixed left/right order prevent odor revealing type.
        this.state.objects=[{id:0,kind:rewardOnLeft?'reward':'danger',position:[-1,.65,0],radius:.65},
          {id:1,kind:rewardOnLeft?'danger':'reward',position:[1,.65,0],radius:.65}];
      }
      return { observation: this.observe(), info: this.info() };
    }
    info() {
      const s = this.state;
      return { environmentVersion: ENV_VERSION, seed: this.seed, step: s.steps, episodeReturn: s.score, collected: s.collected, trapHits: s.hits,
        wallContacts: s.wallContacts, wallPenaltyTotal: s.wallPenaltyTotal,
        remainingRewards: this.episodeRewardCount - s.collected, events: s.events.map(e => ({ ...e })) };
    }
    step(action) {
      const s = this.state, c = this.config, f = s.fly;
      if (s.terminated || s.truncated) throw new Error('Episode ended; call reset()');
      if (c.control === 'directional') {
        if (!Number.isInteger(action) || action < 0 || action >= this.actionSpace.n) throw new RangeError('Invalid discrete action');
      } else if ((!Array.isArray(action) && !ArrayBuffer.isView(action)) || action.length !== this.actionSpace.shape[0] ||
        Array.from(action).some(v => !Number.isFinite(v) || v < -1 || v > 1)) throw new RangeError('Wing action must match shape and lie in [-1, 1]');
      const before = [...f.position];
      s.lastAction = typeof action === 'number' ? action : Array.from(action);
      if (c.control === 'directional') {
        const directions = c.dimension === 2 ? [[0, 0, 0], [0, 1, 0], [0, -1, 0], [-1, 0, 0], [1, 0, 0]]
          : [[0, 0, 0], [0, 0, 1], [0, 0, -1], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]];
        f.velocity = scale(directions[action], c.speed);
        // Fixed world-axis actions need a fixed camera frame. Heading-relative
        // observations with hidden, action-dependent yaw were ambiguous.
        if (c.directionalFrame === 'heading' && Math.hypot(f.velocity[0], f.velocity[1]) > 0) f.yaw = Math.atan2(f.velocity[1], f.velocity[0]);
      } else {
        const [left, right, pitch = 0, bank = 0] = action, dt = c.dt;
        f.angularVelocity[0] = (f.angularVelocity[0] + ((left - right) * 8 + Math.sin(f.roll) * 2) * dt) * Math.exp(-3.2 * dt);
        f.angularVelocity[1] = (f.angularVelocity[1] + pitch * 4.8 * dt) * Math.exp(-3 * dt);
        f.angularVelocity[2] = (f.angularVelocity[2] + (bank * 6 - f.roll * 2) * dt) * Math.exp(-3 * dt);
        f.yaw = wrap(f.yaw + f.angularVelocity[0] * dt);
        f.pitch = clamp(f.pitch + f.angularVelocity[1] * dt, -1.45, 1.45);
        f.roll = clamp(f.roll + f.angularVelocity[2] * dt, -1.2, 1.2);
        f.velocity = scale(add(f.velocity, scale(basis(f).f, (left + right) * 5 * dt)), Math.exp(-1.4 * dt));
        if (norm(f.velocity) > c.speed * 1.5) f.velocity = scale(unit(f.velocity), c.speed * 1.5);
      }
      f.position = add(f.position, scale(f.velocity, c.dt));
      for (let axis = 0; axis < 3; axis++) {
        const limit = (axis === 2 ? 8 : 12) - f.radius;
        if (Math.abs(f.position[axis]) > limit) { f.position[axis] = clamp(f.position[axis], -limit, limit); f.velocity[axis] = 0; }
      }
      if (c.dimension === 2) { f.position[2] = 0; f.velocity[2] = 0; f.pitch = 0; f.roll = 0; }
      const contacts = s.objects.map(o => ({ object: o, t: contactTime(before, f.position, o.position, f.radius + o.radius) }))
        .filter(v => v.t !== null).sort((a, b) => a.t - b.t || a.object.id - b.object.id);
      let reward = 0;
      s.events = [];
      const removed = new Set();
      for (const { object: o, t } of contacts) {
        const value = o.kind === 'reward' ? 1 : -1;
        reward += value; removed.add(o.id);
        if (o.kind === 'reward') s.collected++; else s.hits++;
        s.events.push({ kind: o.kind, reward: value });
        if ((o.kind === 'danger' && c.lethalTraps) || s.collected === this.episodeRewardCount) {
          f.position = add(before, scale(sub(f.position, before), t));
          s.terminated = true; break;
        }
      }
      s.objects = s.objects.filter(o => !removed.has(o.id));
      // Charge continued contact, including no-op at a wall, once per tick.
      // Use the final position: a terminal object collision can stop us early.
      const touchingWall = f.position.some((value, axis) => axis < c.dimension &&
        Math.abs(value) >= (axis === 2 ? 8 : 12) - f.radius - 1e-9);
      if (touchingWall) {
        reward += c.wallPenalty; s.wallContacts++; s.wallPenaltyTotal += c.wallPenalty;
        s.events.push({ kind: 'wall', reward: c.wallPenalty });
      }
      s.score += reward; s.steps++;
      s.truncated = !s.terminated && s.steps >= c.maxSteps;
      return { observation: this.observe(), reward, terminated: s.terminated, truncated: s.truncated, info: this.info() };
    }
    smell() {
      const b = basis(this.state.fly);
      let closest = null, distance = Infinity;
      // All objects share one attractive odor. Never inspect kind or reward value.
      for (const o of this.state.objects) {
        const d = norm(sub(o.position, this.state.fly.position));
        if (d < distance) { distance = d; closest = o; }
      }
      const direction = closest ? unit(sub(closest.position, this.state.fly.position)) : [0, 0, 0];
      const result = [dot(direction, b.f), dot(direction, b.r)];
      if (this.config.dimension === 3) result.push(dot(direction, b.u));
      result.push(closest ? 1 / (1 + distance / 4) ** 2 : 0);
      return result;
    }
    observe() {
      const c = this.config;
      const vision = { width: c.width, height: c.height, channels: 3 };
      if (c.dimension === 2) vision.mono = this.render2DVision();
      else {
        const parts = this.state.objects.flatMap(objectParts);
        vision.left = this.render3DVision(-c.eyeSeparation / 2, parts);
        vision.right = this.render3DVision(c.eyeSeparation / 2, parts);
      }
      const observation = { vision };
      if (c.sensors === 'vision-smell') observation.smell = this.smell();
      return observation;
    }
    render2DVision() {
      const c = this.config, b = basis(this.state.fly), pixels = new Uint8Array(c.width * c.height * 3);
      const span = Math.tan(c.fov * Math.PI / 360) * c.far;
      const objects = this.state.objects.map(o => {
        const d = sub(o.position, this.state.fly.position);
        return { ...o, forward: dot(d, b.f), right: dot(d, b.r) };
      });
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const forward = (1 - (y + .5) / c.height) * c.far, right = ((x + .5) / c.width * 2 - 1) * span;
        let color = [8, 15, 24];
        if (Math.abs(right) <= forward * Math.tan(c.fov * Math.PI / 360)) {
          color = [17, 30, 40];
          for (const o of objects) if (Math.hypot(forward - o.forward, right - o.right) < o.radius) {
            color = o.kind === 'reward' ? [205, 128, 58] : [68, 193, 104];
            if (o.kind === 'danger' && Math.abs(right - o.right) < o.radius * .4) color = [188, 63, 72];
          }
        }
        pixels.set(color, (y * c.width + x) * 3);
      }
      return pixels;
    }
    render3DVision(eyeOffset, parts) {
      const c = this.config, b = basis(this.state.fly), origin = add(this.state.fly.position, scale(b.r, eyeOffset));
      const pixels = new Uint8Array(c.width * c.height * 3), tan = Math.tan(c.fov * Math.PI / 360);
      // Transform each sphere once per camera instead of once per pixel.
      const spheres = parts.map(p => {
        const d = sub(p.position, origin);
        return { x: dot(d, b.r), y: dot(d, b.u), z: dot(d, b.f), radius: p.radius, color: p.color };
      }).filter(p => p.z + p.radius > 0 && p.z - p.radius < c.far);
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        let dx = ((x + .5) / c.width * 2 - 1) * tan, dy = (1 - (y + .5) / c.height * 2) * tan * c.height / c.width;
        const inv = 1 / Math.hypot(dx, dy, 1); dx *= inv; dy *= inv; const dz = inv;
        let best = c.far, color = [10, 19, 29];
        for (const p of spheres) {
          const along = dx * p.x + dy * p.y + dz * p.z;
          const discriminant = along * along - (p.x * p.x + p.y * p.y + p.z * p.z - p.radius * p.radius);
          if (discriminant < 0) continue;
          const root = Math.sqrt(discriminant), near = along - root, t = near > .01 ? near : along + root;
          if (t > .01 && t < best) {
            best = t;
            const light = clamp(.7 + .3 * (dy * t - p.y) / p.radius, .36, 1);
            color = p.color.map(v => Math.round(v * light));
          }
        }
        pixels.set(color, (y * c.width + x) * 3);
      }
      return pixels;
    }
  }
  return { FlyEnv, ENV_VERSION, basis, objectParts, math: { clamp, dot, norm, sub, scale, add, unit, wrap, rng, TAU } };
});
