/* Observer-only visualization. Never passed to the demonstration policy. */
(function () {
  'use strict';
  const { math: M, basis, objectParts } = FlyLab;
  const { dot, sub, norm, scale, add, unit } = M;
  class ArenaRenderer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.azimuth = -1.05; this.elevation = .63;
      this.trail = []; this.effects = []; this.lastStep = -1;
      const rand = M.rng(872);
      this.stars = Array.from({ length: 130 }, () => ({ x: rand(), y: rand(), r: rand() * 1.05 + .2, a: rand() * .4 + .1 }));
      let dragging = false, previous;
      canvas.addEventListener('pointerdown', e => { dragging = true; previous = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => {
        if (!dragging) return;
        this.azimuth -= (e.clientX - previous[0]) * .008;
        this.elevation = M.clamp(this.elevation + (e.clientY - previous[1]) * .006, -.8, 1.35);
        previous = [e.clientX, e.clientY];
      });
      canvas.addEventListener('pointerup', () => { dragging = false; });
      canvas.addEventListener('pointercancel', () => { dragging = false; });
    }
    reset() { this.trail = []; this.effects = []; this.lastStep = -1; }
    setupProjection(dimension, w, h) {
      if (dimension === 2) {
        const s = Math.min((w - 94) / 24, (h - 100) / 24);
        this.project = p => ({ x: w / 2 + p[0] * s, y: h / 2 - p[1] * s, s, depth: -p[2], visible: true });
      } else {
        const eye = [Math.cos(this.azimuth) * Math.cos(this.elevation) * 36, Math.sin(this.azimuth) * Math.cos(this.elevation) * 36, Math.sin(this.elevation) * 36];
        const f = unit(scale(eye, -1));
        const r = unit([f[1], -f[0], 0]);
        const u = [r[1] * f[2], -r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        const focal = Math.min(w, h) * .92;
        this.project = p => {
          const d = sub(p, eye), depth = dot(d, f), s = focal / Math.max(depth, .1);
          return { x: w / 2 + dot(d, r) * s, y: h / 2 - dot(d, u) * s, s, depth, visible: depth > .1 };
        };
      }
    }
    line(a, b, color, width = 1) {
      const c = this.ctx, p = this.project(a), q = this.project(b);
      if (!p.visible || !q.visible) return;
      c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
    }
    draw(env, now) {
      const canvas = this.canvas, c = this.ctx, w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = c.createRadialGradient(w * .45, h * .4, 0, w / 2, h / 2, w * .8);
      bg.addColorStop(0, '#193440'); bg.addColorStop(1, '#0c1722'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
      for (const star of this.stars) { c.fillStyle = `rgba(179,209,227,${star.a})`; c.beginPath(); c.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2); c.fill(); }
      const dim = env.config.dimension, s = env.state;
      this.setupProjection(dim, w, h);
      const floor = dim === 2 ? 0 : -8;
      for (let x = -12; x <= 12; x += 2) {
        this.line([x, -12, floor], [x, 12, floor], x === 0 ? '#41647565' : '#4261722a');
        this.line([-12, x, floor], [12, x, floor], x === 0 ? '#41647565' : '#4261722a');
      }
      const corners = [[-12, -12, floor], [12, -12, floor], [12, 12, floor], [-12, 12, floor]];
      for (let i = 0; i < 4; i++) {
        this.line(corners[i], corners[(i + 1) % 4], '#86aeba65');
        if (dim === 3) {
          const top = [...corners[i]]; top[2] = 8;
          const next = [...corners[(i + 1) % 4]]; next[2] = 8;
          this.line(corners[i], top, '#7299aa38'); this.line(top, next, '#7299aa38');
        }
      }
      if (s.steps !== this.lastStep) {
        if (s.steps > 0) this.trail.push([...s.fly.position]);
        if (this.trail.length > 180) this.trail.shift();
        for (const event of s.events) this.effects.push({ position: [...s.fly.position], kind: event.kind, reward: event.reward, born: now });
        this.lastStep = s.steps;
      }
      for (let i = 1; i < this.trail.length; i++) this.line(this.trail[i - 1], this.trail[i], `rgba(201,250,114,${i / this.trail.length * .35})`, 1.5);
      if (dim === 2) {
        const p = this.project(s.fly.position), angle = -s.fly.yaw;
        c.save(); c.translate(p.x, p.y); c.rotate(angle);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, p.s * 5.2); g.addColorStop(0, '#c9fa721a'); g.addColorStop(1, '#c9fa7200');
        c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, p.s * 5.2, -env.config.fov * Math.PI / 360, env.config.fov * Math.PI / 360); c.closePath(); c.fill(); c.restore();
        for (const object of s.objects) {
          const p = this.project(object.position);
          if (object.kind === 'reward') this.poo(p.x, p.y, Math.max(9, p.s * .75));
          else this.trap(p.x, p.y, Math.max(12, p.s * .92));
        }
      } else {
        const parts = s.objects.flatMap(objectParts).map(p => ({ ...p, projected: this.project(p.position) })).sort((a, b) => b.projected.depth - a.projected.depth);
        for (const p of parts) this.sphere(p.projected, p.radius, p.color);
        // Discreet source rings retain an easy overview at any orbit angle.
        for (const object of s.objects) {
          const p = this.project(object.position);
          c.strokeStyle = object.kind === 'reward' ? '#efbb5944' : '#74dca444'; c.lineWidth = 1;
          c.beginPath(); c.ellipse(p.x, p.y + p.s * .6, p.s * .9, p.s * .25, 0, 0, Math.PI * 2); c.stroke();
          if (object.kind === 'danger') this.teeth(p.x, p.y - p.s * .35, p.s * .63);
        }
        this.line([s.fly.position[0], s.fly.position[1], -8], s.fly.position, '#c9fa7229');
      }
      const fly = this.project(s.fly.position), ahead = this.project(add(s.fly.position, basis(s.fly).f));
      this.fly(fly.x, fly.y, Math.max(11, fly.s * .8), Math.atan2(ahead.y - fly.y, ahead.x - fly.x), now, norm(s.fly.velocity) > .1);
      this.effects = this.effects.filter(e => now - e.born < 950);
      for (const e of this.effects) {
        const p = this.project(e.position), t = (now - e.born) / 950;
        c.globalAlpha = 1 - t; c.fillStyle = e.kind === 'reward' ? '#fbd585' : '#ff8791'; c.font = '600 19px ui-sans-serif, sans-serif'; c.textAlign = 'center'; c.fillText((e.reward > 0 ? '+' : '') + Number(e.reward.toFixed(2)), p.x, p.y - 22 - t * 32); c.globalAlpha = 1;
      }
      c.font = '11px ui-monospace, monospace'; c.fillStyle = '#688998'; c.textAlign = 'left';
      c.fillText(dim === 2 ? '24 × 24 units' : '24 × 24 × 16 units', 22, 53);
    }
    sphere(p, radius, color) {
      if (!p.visible) return;
      const c = this.ctx, r = Math.max(.5, radius * p.s), [red, green, blue] = color;
      const g = c.createRadialGradient(p.x - r * .3, p.y - r * .4, r * .05, p.x, p.y, r);
      g.addColorStop(0, `rgb(${Math.min(255, red * 1.25)},${Math.min(255, green * 1.25)},${Math.min(255, blue * 1.25)})`);
      g.addColorStop(.6, `rgb(${red},${green},${blue})`); g.addColorStop(1, `rgb(${red * .5},${green * .5},${blue * .5})`);
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill();
    }
    poo(x, y, r) {
      const c = this.ctx;
      c.save(); c.translate(x, y); c.shadowColor = '#e5a43a28'; c.shadowBlur = r * 1.8;
      c.fillStyle = '#070c1255'; c.beginPath(); c.ellipse(0, r * .6, r * .95, r * .38, 0, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
      const layers = [[0, .27, .85, .4, '#885029'], [-.05, -.12, .67, .39, '#ac7136'], [.07, -.47, .45, .32, '#ce9348']];
      for (const [dx, dy, rx, ry, color] of layers) {
        c.fillStyle = color; c.beginPath(); c.ellipse(dx * r, dy * r, rx * r, ry * r, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#f8cd7b50'; c.lineWidth = 1; c.beginPath(); c.ellipse(dx * r - r * .08, dy * r - r * .07, rx * r * .6, ry * r * .55, -.1, Math.PI, Math.PI * 1.8); c.stroke();
      }
      c.fillStyle = '#d9a354'; c.beginPath(); c.moveTo(-r * .17, -r * .57); c.quadraticCurveTo(r * .25, -r * .9, r * .08, -r * 1.12); c.quadraticCurveTo(r * .65, -r * .66, r * .3, -r * .5); c.closePath(); c.fill(); c.restore();
    }
    trap(x, y, r) {
      const c = this.ctx;
      c.save(); c.translate(x, y); c.fillStyle = '#0b15154d'; c.beginPath(); c.ellipse(0, r * .5, r, r * .4, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#468b58'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, r * .8); c.quadraticCurveTo(r * .2, r * .5, 0, 0); c.stroke();
      for (const sign of [-1, 1]) {
        c.save(); c.rotate(sign * .35); c.fillStyle = '#5ab174'; c.beginPath(); c.ellipse(sign * r * .4, 0, r * .5, r * .72, sign * .3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#b85663'; c.beginPath(); c.ellipse(sign * r * .3, -r * .06, r * .31, r * .54, sign * .3, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#e4e9b6'; c.lineWidth = 1.4;
        for (let i = 0; i < 6; i++) { const t = -1 + i * .4; c.beginPath(); c.moveTo(sign * r * (.62 - Math.abs(t) * .15), t * r * .57); c.lineTo(sign * r * (.87 - Math.abs(t) * .16), t * r * .75); c.stroke(); }
        c.restore();
      }
      c.restore();
    }
    teeth(x, y, r) {
      const c = this.ctx; c.strokeStyle = '#e3e8b6'; c.lineWidth = 1;
      for (const sign of [-1, 1]) for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(x + sign * r * .75, y + (i - 1.5) * r * .32); c.lineTo(x + sign * r * 1.13, y + (i - 1.7) * r * .42); c.stroke();
      }
    }
    fly(x, y, size, angle, now, moving) {
      const c = this.ctx, r = size;
      c.save(); c.translate(x, y); c.rotate(angle);
      const glow = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.4); glow.addColorStop(0, '#d8ff7b28'); glow.addColorStop(1, '#d8ff7b00'); c.fillStyle = glow; c.beginPath(); c.arc(0, 0, r * 2.4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#a4b0a2'; c.lineWidth = .9;
      for (const sign of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo((i - 1) * r * .25, 0); c.lineTo((i - 1.2) * r * .6, sign * r * .65); c.stroke(); }
      const flutter = moving ? Math.sin(now * .09) * .2 : .03;
      for (const sign of [-1, 1]) {
        c.fillStyle = '#daf1edb8'; c.strokeStyle = '#f3fff5cc'; c.lineWidth = .7;
        c.beginPath(); c.ellipse(-r * .14, sign * r * .62, r * .36, r * (.69 + flutter), sign * .65, 0, Math.PI * 2); c.fill(); c.stroke();
        c.strokeStyle = '#708f9766'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * .45, sign * r); c.stroke();
      }
      c.fillStyle = '#889169'; c.beginPath(); c.ellipse(-r * .25, 0, r * .63, r * .29, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#303e36'; c.lineWidth = 1.4; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-r * (.24 + i * .16), -r * .23); c.lineTo(-r * (.24 + i * .16), r * .23); c.stroke(); }
      c.fillStyle = '#b2bf92'; c.beginPath(); c.ellipse(r * .3, 0, r * .3, r * .34, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d75857'; for (const sign of [-1, 1]) { c.beginPath(); c.ellipse(r * .43, sign * r * .2, r * .17, r * .15, 0, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
  }
  function drawPixels(canvas, pixels, width, height) {
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const c = canvas.getContext('2d'), image = c.createImageData(width, height);
    for (let p = 0; p < width * height; p++) { image.data[p * 4] = pixels[p * 3]; image.data[p * 4 + 1] = pixels[p * 3 + 1]; image.data[p * 4 + 2] = pixels[p * 3 + 2]; image.data[p * 4 + 3] = 255; }
    c.putImageData(image, 0, 0);
  }
  function drawSmell(canvas, smell, dimension) {
    const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2 + 4, r = 48;
    c.clearRect(0, 0, w, h); c.strokeStyle = '#dce6e9'; c.lineWidth = 1;
    for (const size of [r * .5, r]) { c.beginPath(); c.arc(cx, cy, size, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(cx - r - 7, cy); c.lineTo(cx + r + 7, cy); c.moveTo(cx, cy - r - 7); c.lineTo(cx, cy + r + 7); c.stroke();
    c.fillStyle = '#80929c'; c.font = '11px ui-sans-serif, sans-serif'; c.textAlign = 'center'; c.fillText(smell ? 'AHEAD' : 'SMELL DISABLED', cx, 13);
    if (smell && smell[smell.length - 1] > 0) {
      const v = smell, intensity = v[v.length - 1];
      const length = r * (.4 + .6 * Math.sqrt(intensity));
      const x = cx + v[1] * length, y = cy - v[0] * length;
      c.strokeStyle = '#527fba'; c.fillStyle = '#527fba'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke();
      c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
      if (dimension === 3) { c.textAlign = 'center'; c.fillText(`z ${v[2] >= 0 ? '+' : ''}${v[2].toFixed(2)}`, cx, h - 5); }
    }
    c.fillStyle = '#173845'; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
  }
  window.FlyView = { ArenaRenderer, drawPixels, drawSmell };
})();
