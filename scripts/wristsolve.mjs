import * as THREE from 'three';
import { SHOULDER, UPPER_ARM, WRIST_OFFSET } from '../src/character/anatomy.js';
const [a, b, c, d, tx, ty, tz] = process.argv.slice(2).map(Number);
const sh = new THREE.Group(); sh.position.set(...SHOULDER); sh.rotation.order = 'ZXY'; sh.rotation.set(a, b, c);
const el = new THREE.Group(); el.position.y = -UPPER_ARM; el.rotation.x = d; sh.add(el);
const wr = new THREE.Group(); wr.position.y = WRIST_OFFSET; wr.rotation.order = 'ZXY'; el.add(wr);
const tip = new THREE.Group(); tip.position.y = -0.22; wr.add(tip);
const palm = new THREE.Group(); palm.position.set(-0.1, -0.1, 0); wr.add(palm); // palm faces -X
const T = new THREE.Vector3(tx, ty, tz);
const err = (p) => { wr.rotation.set(p[0], p[1], p[2]); sh.updateMatrixWorld(true); const t = tip.getWorldPosition(new THREE.Vector3()); const pl = palm.getWorldPosition(new THREE.Vector3()); const w = wr.getWorldPosition(new THREE.Vector3());
  // palm should face down-ish/inward (toward the body centre line)
  const pd = pl.sub(w).normalize();
  return t.distanceTo(T) ** 2 + 0.01 * Math.max(0, pd.y + 0.3) ; };
let best = [0, 0, 0], be = err(best);
for (let it = 0; it < 20000; it++) { const s = 0.6 * Math.exp(-it / 4000); const cnd = best.map((v) => v + (Math.random() - 0.5) * s); const e = err(cnd); if (e < be) { be = e; best = cnd; } }
err(best);
console.log(JSON.stringify(best.map((v) => +v.toFixed(3))), 'err', be.toFixed(5), 'tip', tip.getWorldPosition(new THREE.Vector3()).toArray().map((v) => v.toFixed(2)));
