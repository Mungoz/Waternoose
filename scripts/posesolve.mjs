// dev-only: solve every arm pose from target elbow / wrist / fingertip positions (left arm, body space)
import * as THREE from 'three';
import { SHOULDER, UPPER_ARM, WRIST_OFFSET } from '../src/character/anatomy.js';
const TARGETS = {
  idle: [[1.12, 0.12, 0.05], [0.95, 0.38, 0.4], [0.88, 0.22, 0.6]],
  explain: [[1.08, 0.18, 0.28], [0.98, 0.52, 0.66], [0.98, 0.58, 0.88]],
  shrug: [[1.2, 0.02, 0.12], [1.42, 0.24, 0.44], [1.6, 0.26, 0.56]],
  delight: [[1.18, 0.65, 0.08], [1.3, 1.08, 0.22], [1.35, 1.3, 0.25]],
  steeple: [[1.0, 0.04, 0.32], [0.55, 0.36, 0.78], [0.35, 0.52, 0.86]],
  point: [[1.05, 0.34, 0.36], [0.92, 0.52, 0.8], [0.88, 0.58, 1.02]],
  behind: [[1.18, 0.0, 0.0], [1.2, 0.18, 0.42], [1.2, 0.02, 0.6]],
  jazzUp: [[1.2, 0.58, 0.12], [1.42, 0.98, 0.3], [1.52, 1.2, 0.34]],
  jazzDown: [[1.2, -0.02, 0.14], [1.48, 0.18, 0.42], [1.66, 0.2, 0.52]],
  scare: [[1.08, 0.72, 0.3], [1.12, 1.1, 0.66], [1.08, 1.2, 0.88]],
};
const sh = new THREE.Group(); sh.position.set(...SHOULDER); sh.rotation.order = 'ZXY';
const el = new THREE.Group(); el.position.y = -UPPER_ARM; sh.add(el);
const wr = new THREE.Group(); wr.position.y = WRIST_OFFSET; wr.rotation.order = 'ZXY'; el.add(wr);
const tip = new THREE.Group(); tip.position.y = -0.22; wr.add(tip);
const v = new THREE.Vector3();
const out = {};
for (const [name, [E, W, T]] of Object.entries(TARGETS)) {
  const Ev = new THREE.Vector3(...E), Wv = new THREE.Vector3(...W), Tv = new THREE.Vector3(...T);
  const err = (p) => {
    sh.rotation.set(p[0], p[1], p[2]); el.rotation.x = p[3]; wr.rotation.set(p[4], p[5], p[6]);
    sh.updateMatrixWorld(true);
    return el.getWorldPosition(v).distanceToSquared(Ev) * 2 + wr.getWorldPosition(v).distanceToSquared(Wv) * 2
      + tip.getWorldPosition(v).distanceToSquared(Tv) + 0.001 * (p[1] ** 2 + p[5] ** 2);
  };
  let best = [-0.3, 0, 1, -1.5, 0, 0, 0], be = err(best);
  for (let r = 0; r < 6; r++) {
    let cur = r ? best.map((x) => x + (Math.random() - 0.5) * 1.5) : best, ce = err(cur);
    for (let it = 0; it < 15000; it++) {
      const s = 0.6 * Math.exp(-it / 3000);
      const c = cur.map((x) => x + (Math.random() - 0.5) * s);
      c[3] = Math.min(-0.05, c[3]);
      const e = err(c);
      if (e < ce) { ce = e; cur = c; }
    }
    if (ce < be) { be = ce; best = cur; }
  }
  out[name] = best.map((x) => +x.toFixed(3));
  console.log(name.padEnd(9), JSON.stringify(out[name]), 'err', be.toFixed(4));
}
