/* Fly geometry and foreleg choreography adapted from mattyhempstead/fly-wirehead.
 * Pinned source: fcefe9441f80e25aab713411ebced53f5e5ea172.
 * See WIREHEAD-SOURCE.txt for source files, hashes and integration changes. */
(function (root) {
  'use strict';
// One presentation timeline drives both the phone and the right foreleg.
// This choreography does not generate neural activity or choose the next clip.
const SWIPE_SECONDS = .9;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
const mix = (a, b, p) => a.map((value, i) => value + (b[i] - value) * p);
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const length = a => Math.sqrt(dot(a, a));

function sampleSwipe(progress = 1) {
  const p = Number.isFinite(progress) ? clamp(progress) : 1;
  const stroke = clamp((p - .22) / .5);
  return {
    reach: smooth(p / .22) * (1 - smooth((p - .72) / .28)),
    screen: 1 - (1 - stroke) ** 3,
  };
}

const FORELEG_REST = [[.33, -.17, .3], [.85, -.37, .75], [.92, -.94, .99], [1.16, -.96, 1.07]];
const upperLength = length(subtract(FORELEG_REST[1], FORELEG_REST[0]));
const lowerLength = length(subtract(FORELEG_REST[2], FORELEG_REST[1]));

function frontRightLegPose(progress) {
  const { reach, screen } = sampleSwipe(progress), [shoulder, restJoint, restAnkle, restTip] = FORELEG_REST;
  if (reach === 0) return FORELEG_REST.map(point => [...point]);
  // Lift forward, sweep upward with the outgoing video, then plant the foot again.
  const ankle = mix(restAnkle, mix([1.42, -.22, .66], [1.05, .77, .6], screen), reach);
  const offset = subtract(ankle, shoulder), distance = length(offset), direction = offset.map(value => value / distance);
  const pole = mix(subtract(restJoint, shoulder), [0, 0, 1], reach), alongPole = dot(pole, direction);
  const bend = pole.map((value, i) => value - direction[i] * alongPole), bendLength = length(bend);
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const joint = shoulder.map((value, i) => value + direction[i] * along + bend[i] / bendLength * height);
  const restFoot = subtract(restTip, restAnkle);
  const foot = mix(restFoot, [.24, .035, -.08], reach), footScale = length(restFoot) / length(foot);
  const tip = ankle.map((value, i) => value + foot[i] * footScale);
  return [[...shoulder], joint, ankle, tip];
}

function buildCharacter(THREE) {
  const C = { lime: 0xc4f86a };
  const seed = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const vec = p => new THREE.Vector3(...p);
  const group = new THREE.Group();
  const material = (color, props = {}) => new THREE.MeshStandardMaterial({ color, roughness: .56, metalness: .28, ...props });
  const dark = material(0x203b37), metal = material(0x78988b, { metalness: .42, roughness: .4 });
  const glow = (color, strength = 1) => material(color, { emissive: color, emissiveIntensity: strength, roughness: .4 });
  const lime = glow(C.lime, 2);
  function mesh(geometry, mat, at, parent = group) { const m = new THREE.Mesh(geometry, mat); m.position.set(...at); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function box(size, at, mat = dark, parent = group) { return mesh(new THREE.BoxGeometry(...size), mat, at, parent); }
  function orb(size, at, mat, parent = group, detail = 2) { const m = mesh(new THREE.IcosahedronGeometry(1, detail), mat, at, parent); m.scale.set(...size); return m; }
  function rod(a, b, radius = .025, mat = metal, parent = group, radial = 6) { const start = vec(a), end = vec(b); const m = mesh(new THREE.CylinderGeometry(radius * .82, radius, start.distanceTo(end), radial), mat, start.clone().add(end).multiplyScalar(.5).toArray(), parent); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return m; }
  function wire(points, radius, mat, parent = group) { return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(vec)), 44, radius, 6, false), mat, [0, 0, 0], parent); }
  // Original low-poly Drosophila, facing its terminal.
  const fly = new THREE.Group(); fly.name = "Fly / Wirehead"; fly.rotation.y = -.12; group.add(fly);
  const shell = material(0x293e46, { flatShading: true, metalness: .3, roughness: .55 });
  const flyMetal = material(0x243239, { metalness: .38, roughness: .48 }), flyDark = material(0x101619, { metalness: .12, roughness: .65 });
  const abdomen = orb([.91, .39, .43], [-.83, -.02, 0], material(0x142429, { flatShading: true, metalness: .24, roughness: .58 }), fly);
  for (let i = 0; i < 5; i++) { const ring = mesh(new THREE.TorusGeometry(.36 - i * .035, .035, 4, 14), material([0x314843, 0x3e493d, 0x304447, 0x39413b, 0x2b3b40][i], { metalness: .3, roughness: .56 }), [-.65 - i * .17, -.01, 0], fly); ring.rotation.y = Math.PI / 2; ring.scale.z = .94; }
  const thorax = orb([.66, .53, .5], [-.05, .08, 0], shell, fly);
  const head = new THREE.Group(); head.position.set(.63, .19, 0); fly.add(head);
  orb([.41, .4, .4], [0, 0, 0], material(0x40515a, { flatShading: true, metalness: .28, roughness: .5 }), head);
  const eyeMaterial = material(0x9e1837, { flatShading: true, roughness: .29, metalness: .45, emissive: 0x3c0614, emissiveIntensity: .4 });
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = orb([.28, .37, .255], [.12, .04, .29 * side], eyeMaterial, head, 2); eyes.push(eye);
    orb([.065, .045, .045], [.21, .25, .47 * side], material(0xe7a8a0, { roughness: .1, emissive: 0x995069 }), head, 1);
    wire([[.25, .3, side * .15], [.48, .49, side * .21], [.7, .57, side * .37]], .012, flyMetal, head);
    orb([.038, .027, .027], [.7, .57, side * .37], flyDark, head, 1);
  }
  rod([.28, -.17, 0], [.51, -.35, 0], .045, flyMetal, head); orb([.06, .08, .11], [.51, -.35, 0], flyDark, head, 1);
  // Fine thorax bristles catch the monitor light.
  for (let i = 0; i < 72; i++) { const a = seed(i + 4) * Math.PI * 2, b = seed(i + 51) * Math.PI; const p = [Math.cos(a) * Math.sin(b) * .64 - .05, Math.abs(Math.cos(b)) * .51 + .1, Math.sin(a) * Math.sin(b) * .49]; if (p[0] > .3) continue; rod(p, [p[0] + (p[0] + .05) * .19, p[1] + .08 + seed(i) * .08, p[2] * 1.14], .006, flyDark, fly, 3); }
  const legs = [];
  let rightForeleg;
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const leg = new THREE.Group(); fly.add(leg); const x = .33 - i * .46;
    const a = [x, -.17, side * .3], b = [x + (.52 - i * .48), -.37, side * .75], c = [x + (.59 - i * .35), -.94, side * .99], d = [c[0] + .24, -.96, c[2] + side * .08];
    const upper = rod(a, b, .034, flyMetal, leg), joint = orb([.055, .055, .055], b, shell, leg, 1);
    const lower = rod(b, c, .022, flyMetal, leg), foot = rod(c, d, .012, flyDark, leg); legs.push(leg);
    // Forward is +X, so anatomical right is +Z: the visible front leg.
    if (side === 1 && i === 0) rightForeleg = { group: leg, upper, joint, lower, foot };
  }
  const boneStart = new THREE.Vector3(), boneEnd = new THREE.Vector3(), boneUp = new THREE.Vector3(0, 1, 0);
  function poseBone(bone, a, b) {
    boneStart.set(...a); boneEnd.set(...b);
    bone.position.copy(boneStart).add(boneEnd).multiplyScalar(.5);
    boneEnd.sub(boneStart);
    bone.scale.y = boneEnd.length() / bone.geometry.parameters.height;
    bone.quaternion.setFromUnitVectors(boneUp, boneEnd.normalize());
  }
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(-.18, .41, .23 * side); fly.add(wing);
    const points = [[0, 0, 0], [-.75, .07, .38 * side], [-1.72, .01, 1.1 * side], [-2.03, -.035, 1.05 * side], [-2.21, -.04, .83 * side], [-1.77, -.03, .41 * side], [-.66, -.015, .03 * side]];
    const vertices = []; for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
    const m = mesh(geo, material(0xa9dce2, { transparent: true, opacity: .48, side: THREE.DoubleSide, roughness: .2, metalness: .5, flatShading: true }), [0, 0, 0], wing); m.castShadow = false;
    const vein = material(0x77999b, { transparent: true, opacity: .68, metalness: .5 });
    const line = [...points, points[0]]; for (let j = 0; j < line.length - 1; j++) rod(line[j], line[j + 1], .009, vein, wing, 4);
    for (let j = 2; j < 6; j++) rod([-.1, 0, .025 * side], points[j], .006, vein, wing, 3);
    rod([-.83, .01, .31 * side], [-1.23, .025, .7 * side], .007, vein, wing, 3);
    rod([-1.38, -.02, .31 * side], [-1.68, .01, .87 * side], .007, vein, wing, 3);
    wings.push(wing);
  }
  const harness = mesh(new THREE.TorusGeometry(.515, .035, 5, 18, Math.PI * 1.5), dark, [-.13, .06, 0], fly); harness.rotation.y = Math.PI / 2;
  // The implant is seated in the crown between the eyes, not on the thorax.
  mesh(new THREE.CylinderGeometry(.12, .15, .11, 12), metal, [0, .39, 0], head);
  const cranialRing = mesh(new THREE.TorusGeometry(.125, .019, 6, 18), lime, [0, .444, 0], head);
  cranialRing.rotation.x = Math.PI / 2;
  rod([0, .445, 0], [0, .65, 0], .05, dark, head, 12);
  for (const y of [.49, .545, .6]) mesh(new THREE.CylinderGeometry(.066, .066, .025, 10), metal, [0, y, 0], head);
  const electrode = orb([.059, .025, .059], [0, .635, 0], glow(C.lime, 2), head, 1);

  const tapAnchor = vec(frontRightLegPose(.22)[3]);
  function pose(state, time) {
    const { reach = 0, cheer = 0, after = 0, reduced = false, swipeProgress = 1 } = state;
    const gesture = reduced ? 1 : swipeProgress < 1 ? swipeProgress : .22 * reach;
    const swipe = sampleSwipe(gesture), moving = Math.max(reach, swipe.reach);
    const idle = reduced ? 0 : Math.sin(time * 2.3);
    head.rotation.y = .025 * idle + .08 * cheer;
    head.rotation.z = reduced ? 0 : .018 * idle + Math.sin(after * Math.PI * 4) * cheer * .045;
    wings.forEach((wing, i) => { wing.rotation.x = reduced ? 0 : (i ? 1 : -1) * Math.sin(time * (cheer ? 45 : 22)) * (.035 + .23 * cheer + .07 * moving); });
    legs.forEach((leg, i) => { leg.rotation.x = reduced ? 0 : Math.sin(time * (moving ? 12 : 4) + i * 1.5) * (.013 + .09 * moving + .05 * cheer); });
    rightForeleg.group.rotation.x *= 1 - swipe.reach;
    const points = frontRightLegPose(gesture);
    poseBone(rightForeleg.upper, points[0], points[1]); rightForeleg.joint.position.set(...points[1]);
    poseBone(rightForeleg.lower, points[1], points[2]); poseBone(rightForeleg.foot, points[2], points[3]);
    fly.updateMatrixWorld(true);
    return points;
  }
  pose({}, 0);
  return { character: fly, pose, legs, wings, head, eyes, rightForeleg, tapAnchor, sampleSwipe,
    sourceRevision: 'fcefe9441f80e25aab713411ebced53f5e5ea172' };
}
root.WireheadModel = { buildCharacter, frontRightLegPose, sampleSwipe, FORELEG_REST };
})(globalThis);
