// dev-only: solve left-arm pose angles for target elbow/wrist positions (body space)
import * as THREE from 'three';
import { SHOULDER, UPPER_ARM, WRIST_OFFSET } from '../src/character/anatomy.js';
const [ex, ey, ez, wx, wy, wz] = process.argv.slice(2).map(Number);
const sh = new THREE.Group(); sh.position.set(...SHOULDER); sh.rotation.order = 'ZXY';
const el = new THREE.Group(); el.position.y = -UPPER_ARM; sh.add(el);
const wr = new THREE.Group(); wr.position.y = WRIST_OFFSET; el.add(wr);
const E = new THREE.Vector3(ex, ey, ez), Wt = new THREE.Vector3(wx, wy, wz);
const err = (p) => {
  sh.rotation.set(p[0], p[1], p[2]); el.rotation.x = p[3]; sh.updateMatrixWorld(true);
  const e = el.getWorldPosition(new THREE.Vector3()), w = wr.getWorldPosition(new THREE.Vector3());
  return e.distanceTo(E) ** 2 + w.distanceTo(Wt) ** 2 + 0.002 * (p[1] ** 2);
};
let best = [0, 0, 1, -1.2], be = err(best);
for (let it = 0; it < 20000; it++) {
  const s = 0.5 * Math.exp(-it / 4000);
  const c = best.map((v) => v + (Math.random() - 0.5) * s);
  c[3] = Math.min(0, c[3]);
  const e = err(c);
  if (e < be) { be = e; best = c; }
}
err(best);
const e = el.getWorldPosition(new THREE.Vector3()), w = wr.getWorldPosition(new THREE.Vector3());
console.log(JSON.stringify(best.map((v) => +v.toFixed(3))), 'err', be.toFixed(5), 'elbow', e.toArray().map((v) => v.toFixed(2)), 'wrist', w.toArray().map((v) => v.toFixed(2)));
