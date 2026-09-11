/* Scrollfly presentation adapter for the upstream Fly / Wirehead model. */
(function (root) {
  'use strict';
  const buildCharacter = T => root.WireheadModel.buildCharacter(T);
  function heartGeometry(T) {
    const s = new T.Shape(); s.moveTo(0, -.45);
    s.bezierCurveTo(-.12, -.3, -.65, .04, -.55, .36); s.bezierCurveTo(-.47, .65, -.12, .66, 0, .36);
    s.bezierCurveTo(.12, .66, .47, .65, .55, .36); s.bezierCurveTo(.65, .04, .12, -.3, 0, -.45);
    return new T.ExtrudeGeometry(s, { depth: .13, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .04, bevelThickness: .04, curveSegments: 10 });
  }
  class ComicView {
    constructor(T, canvas) {
      this.T = T; this.canvas = canvas; this.scene = new T.Scene();
      this.renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2)); this.renderer.setClearColor(0, 0);
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.18; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.camera = new T.OrthographicCamera(-5, 5, 4, -4, .1, 60); this.camera.position.set(0, 7, 16); this.camera.lookAt(0, 0, 0);
      this.scene.add(new T.HemisphereLight('#fff4e1', '#8875b0', 1.7));
      const light = new T.DirectionalLight('#fff6dc', 2.5); light.position.set(-3, 6, 8); light.castShadow = true; light.shadow.mapSize.set(512, 512);
      Object.assign(light.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: .1, far: 35 });
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.bias = -.002; this.scene.add(light);
      const rim = new T.DirectionalLight('#baacff', 1.8); rim.position.set(4, 3, -4); this.scene.add(rim);
      this.rig = buildCharacter(T); this.scene.add(this.rig.character);
      this.ground = new T.Mesh(new T.PlaneGeometry(30, 30), new T.ShadowMaterial({ opacity: .26 }));
      this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      const geometry = heartGeometry(T);
      this.hearts = Array.from({ length: 12 }, (_, i) => {
        const mesh = new T.Mesh(geometry, new T.MeshPhongMaterial({ color: i % 3 ? '#ff688f' : '#e3ff87', shininess: 90, transparent: true }));
        mesh.visible = false; this.scene.add(mesh); return mesh;
      });
      this.ray = new T.Raycaster(); this.plane = new T.Plane(new T.Vector3(0, 0, 1), 0);
      this.target = new T.Vector3(); this.base = new T.Vector3();
      this.resize(); this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    }
    screenPoint(x, y, z = 0) {
      this.ray.setFromCamera(new this.T.Vector2(x * 2 - 1, 1 - y * 2), this.camera);
      this.plane.constant = -z;
      return this.ray.ray.intersectPlane(this.plane, new this.T.Vector3());
    }
    resize() {
      const box = this.canvas.getBoundingClientRect(); if (!box.width || !box.height) return;
      this.renderer.setSize(box.width, box.height, false);
      this.camera.left = -4 * box.width / box.height; this.camera.right = -this.camera.left;
      this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(); this.size = Math.min(1, box.width / 600);
      this.base.copy(this.screenPoint(.295, .69)); this.rig.character.position.copy(this.base); this.rig.character.scale.setScalar(this.size);
      this.ground.position.y = this.base.y - .98 * this.size;
      this.updateTarget(box);
    }
    updateTarget(box = this.canvas.getBoundingClientRect()) {
      const heart = document.querySelector('.screen').getBoundingClientRect();
      this.target.copy(this.screenPoint((heart.left + heart.width * .16 - box.left) / box.width, (heart.top + heart.height * .67 - box.top) / box.height, .8));
    }
    draw(time, state) {
      const { reduced = false, cheer = 0, after = 0, swipeProgress = 1 } = state, rig = this.rig.character;
      const swipe = reduced ? 0 : this.rig.sampleSwipe(swipeProgress).reach;
      const reach = reduced ? 0 : Math.max(state.reach || 0, swipe);
      // Touch the near edge of the glass, as in a video double-tap.
      if (reach > 0) this.updateTarget();
      rig.position.copy(this.base);
      rig.position.y += this.size * (reduced ? 0 : Math.sin(time * 2.7) * .035 + Math.sin(after * Math.PI * 4) * cheer * .12);
      rig.rotation.z = reduced ? 0 : -.05 * state.reach + Math.sin(after * Math.PI * 5) * cheer * .065 - .13 * swipe;
      rig.updateMatrixWorld(true);
      // A short scuttle brings the original, fixed-length foreleg to the phone.
      const contact = this.rig.tapAnchor.clone().applyMatrix4(rig.matrixWorld);
      rig.position.addScaledVector(this.target.clone().sub(contact), reach);
      this.rig.pose(state, time);
      this.hearts.forEach((heart, i) => {
        const progress = (after - i * .012) / .75;
        heart.visible = !reduced && state.liked && progress > 0 && progress < 1;
        if (!heart.visible) return;
        const angle = i * Math.PI * 2 / this.hearts.length;
        heart.position.set(this.target.x + Math.cos(angle) * progress * 1.2, this.target.y + Math.sin(angle) * progress * .6 + progress * 1.5, 1.1 + Math.sin(angle) * .3);
        heart.scale.setScalar((.15 + i % 3 * .04) * Math.sin(progress * Math.PI)); heart.rotation.set(.15, progress * 6 + i, Math.sin(angle) * .4);
        heart.material.opacity = 1 - progress;
      });
      this.renderer.render(this.scene, this.camera);
    }
  }
  root.FlyComic = { buildCharacter, create: async canvas => new ComicView(await import('./three.module.min.js'), canvas) };
})(globalThis);
