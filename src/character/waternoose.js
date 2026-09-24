// Assembles the sculpted parts into a rigged hierarchy.

import * as THREE from 'three';
import { sculptAll } from '../sdf/pool.js';
import { torsoSDF, jacketSDF, openingW } from './parts.js';
import { KIND, createCharMaterial, createEyeMaterial } from './materials.js';
import {
  BODY_HEIGHT, NECK, HEAD_SCALE, SHOULDER, UPPER_ARM, WRIST_OFFSET, HIPS, EYES, JAW_HINGE, VEST_BUTTONS,
} from './anatomy.js';

export const PART_NAMES = [
  'head', 'jacket', 'torso', 'handL', 'handR', 'teethUpper', 'teethLower', 'upperSleeve',
  'foreSleeve', 'femur', 'tibia', 'bowtie', 'cuff', 'tongue', 'button',
];

function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('ao', new THREE.BufferAttribute(m.ao, 1));
  for (const k in m.extra) g.setAttribute(k, new THREE.BufferAttribute(m.extra[k].array, m.extra[k].itemSize));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  if (m.proxy) {
    const p = new THREE.BufferGeometry();
    p.setAttribute('position', new THREE.BufferAttribute(m.proxy.position, 3));
    p.setAttribute('normal', new THREE.BufferAttribute(m.proxy.normal, 3));
    p.setIndex(new THREE.BufferAttribute(m.proxy.index, 1));
    p.computeBoundingSphere();
    g.userData.proxy = p;
  }
  return g;
}

// Draws nothing in the beauty pass; only the shadow map sees it.
const proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// sphere-trace an SDF from `o` along `d`
function raycastSDF(sdf, o, d, maxT = 2) {
  let t = 0;
  for (let i = 0; i < 256 && t < maxT; i++) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    const dist = sdf(x, y, z);
    if (dist < 1e-4) return new THREE.Vector3(x, y, z);
    t += Math.max(dist * 0.7, 1e-4);
  }
  return null;
}
function sdfNormal(sdf, p) {
  const e = 1e-3;
  return new THREE.Vector3(
    sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z),
    sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z),
    sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e),
  ).normalize();
}

// A fleshy eyelid: a spherical cap with a rolled, thickened rim so it reads
// as a heavy lid rather than a paper-thin shell.
function lidGeometry(upper) {
  const seg = 48, rings = 22;
  const pos = [], nor = [], idx = [];
  const R = upper ? 1.1 : 1.08, rim = upper ? 0.16 : 0.11;
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    // theta runs from the pole down to the lid edge, then rolls back under
    const th = v < 0.85 ? (v / 0.85) * Math.PI * 0.5 : Math.PI * 0.5;
    const roll = v < 0.85 ? 0 : (v - 0.85) / 0.15; // 0..1 around the rim
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2;
      let r = R, t = th;
      if (roll > 0) { r = R - rim * (1 - Math.cos(roll * Math.PI)) * 0.5; t = Math.PI * 0.5 + Math.sin(roll * Math.PI) * rim * 0.9; }
      const sy = upper ? Math.cos(t) : -Math.cos(t);
      const x = Math.sin(t) * Math.cos(ph) * r, z = Math.sin(t) * Math.sin(ph) * r, y = sy * r;
      pos.push(x, y, z);
      const l = Math.hypot(x, y, z);
      nor.push(x / l, y / l, z / l);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    if (upper) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('ao', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0.8), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export async function buildWaternoose({ quality = 1, onProgress } = {}) {
  const t0 = performance.now();
  const data = await sculptAll(PART_NAMES, { quality, onPart: onProgress });
  const G = {};
  const partStats = {};
  for (const k in data) { G[k] = toGeometry(data[k]); partStats[k] = data[k].stats; }

  const M = {
    head: createCharMaterial(KIND.HEAD),
    skin: createCharMaterial(KIND.SKIN),
    torso: createCharMaterial(KIND.TORSO),
    jacket: createCharMaterial(KIND.JACKET),
    sleeve: createCharMaterial(KIND.SLEEVE),
    shirt: createCharMaterial(KIND.SHIRT),
    satin: createCharMaterial(KIND.SATIN),
    leg: createCharMaterial(KIND.LEG),
    tibia: createCharMaterial(KIND.TIBIA),
    teeth: createCharMaterial(KIND.TEETH),
    tongue: createCharMaterial(KIND.TONGUE),
    hand: createCharMaterial(KIND.HAND),
    button: createCharMaterial(KIND.BUTTON),
    gold: createCharMaterial(KIND.GOLD),
    eye: createEyeMaterial(),
    lid: createCharMaterial(KIND.SKIN, { side: THREE.DoubleSide }),
  };

  const allMeshes = [];
  const shadowProxies = [];
  const mk = (geo, mat, parent, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    m.name = name || '';
    parent.add(m);
    allMeshes.push(m);
    if (geo.userData.proxy) {
      const p = new THREE.Mesh(geo.userData.proxy, proxyMaterial);
      p.castShadow = true;
      p.receiveShadow = false;
      p.name = 'shadowProxy';
      m.add(p);
      shadowProxies.push(p);
    }
    return m;
  };

  // ---- hierarchy -----------------------------------------------------------
  const root = new THREE.Group();
  root.name = 'Waternoose';
  const body = new THREE.Group();
  body.position.y = BODY_HEIGHT;
  root.add(body);

  const torsoMesh = mk(G.torso, M.torso, body, 'torso');
  const jacketMesh = mk(G.jacket, M.jacket, body, 'jacket');

  // tailoring details placed by sphere-tracing the sculpt
  const torso = torsoSDF();
  const jacket = jacketSDF();
  const placeOn = (sdf, x, y, geo, mat, lift, scale = 1) => {
    const p = raycastSDF(sdf, [x, y, 1.2], [0, 0, -1]);
    if (!p) return null;
    const n = sdfNormal(sdf, p);
    const m = mk(geo, mat, body, 'detail');
    m.position.copy(p).addScaledVector(n, lift);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.scale.setScalar(scale);
    return m;
  };
  // double-breasted vest: two columns of pewter buttons
  for (const y of VEST_BUTTONS) for (const x of [-0.2, 0.2]) placeOn(torso, x, y, G.button, M.button, 0.004, 1.05);
  // a gold button on each hanging front of the jacket
  for (const sx of [-1, 1]) placeOn(jacket, sx * (openingW(0.02) + 0.05), 0.02, G.button, M.gold, 0.003, 1.05);
  // bow tie tucked under the chin
  const bt = raycastSDF(torso, [0, 0.55, 1.2], [0, 0, -1]);
  const bowtie = mk(G.bowtie, M.satin, body, 'bowtie');
  bowtie.position.set(0, 0.55, (bt ? bt.z : 0.4) + 0.03);
  bowtie.rotation.x = -0.45;
  bowtie.scale.setScalar(1.8);

  // ---- head ------------------------------------------------------------------
  const neck = new THREE.Group();
  neck.position.set(...NECK);
  body.add(neck);
  const head = new THREE.Group();
  head.scale.setScalar(HEAD_SCALE);
  neck.add(head);
  const headMesh = mk(G.head, M.head, head, 'head');
  // the jaw is deformed in the vertex shader; bounding sphere needs a bit of slack
  G.head.boundingSphere.radius *= 1.15;
  const upperTeeth = mk(G.teethUpper, M.teeth, head, 'teethUpper');
  const jaw = new THREE.Group();
  jaw.position.set(...JAW_HINGE);
  head.add(jaw);
  const lowerTeeth = mk(G.teethLower, M.teeth, jaw, 'teethLower');
  lowerTeeth.position.set(-JAW_HINGE[0], -JAW_HINGE[1], -JAW_HINGE[2]);
  const tongue = mk(G.tongue, M.tongue, jaw, 'tongue');
  tongue.position.copy(lowerTeeth.position);

  // eyes
  const eyeGeo = new THREE.SphereGeometry(1, 64, 40);
  const upperLidGeo = lidGeometry(true);
  const lowerLidGeo = lidGeometry(false);
  const eyes = EYES.map((e) => {
    const socket = new THREE.Group();
    socket.position.set(...e.pos);
    const dir = new THREE.Vector3(...e.dir).normalize();
    socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    head.add(socket);
    const ball = mk(eyeGeo, M.eye, socket, 'eye');
    ball.scale.setScalar(e.r);
    ball.castShadow = false;
    const upper = mk(upperLidGeo, M.lid, socket, 'lid');
    upper.scale.setScalar(e.r);
    const lower = mk(lowerLidGeo, M.lid, socket, 'lid');
    lower.scale.setScalar(e.r);
    return { ...e, socket, ball, upper, lower, restDir: dir, look: new THREE.Quaternion() };
  });

  const glasses = new THREE.Group();

  // ---- arms ------------------------------------------------------------------
  const arms = {};
  for (const [key, s] of [['L', 1], ['R', -1]]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(SHOULDER[0] * s, SHOULDER[1], SHOULDER[2]);
    shoulder.rotation.order = 'ZXY';
    body.add(shoulder);
    mk(G.upperSleeve, M.sleeve, shoulder, 'sleeve');
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM;
    shoulder.add(elbow);
    mk(G.foreSleeve, M.sleeve, elbow, 'sleeve');
    mk(G.cuff, M.shirt, elbow, 'cuff');
    const wrist = new THREE.Group();
    wrist.position.y = WRIST_OFFSET;
    wrist.rotation.order = 'ZXY';
    elbow.add(wrist);
    const hand = mk(s > 0 ? G.handL : G.handR, M.hand, wrist, 'hand');
    hand.scale.setScalar(1.3);
    hand.position.y = 0.02;
    arms[key] = { shoulder, elbow, wrist, side: s };
  }

  // ---- legs (live in world space, driven by IK) -------------------------------
  const legsGroup = new THREE.Group();
  legsGroup.name = 'WaternooseLegs';
  const legs = HIPS.map((h, i) => {
    const femur = mk(G.femur, M.leg, legsGroup, 'femur');
    const tibia = mk(G.tibia, M.tibia, legsGroup, 'tibia');
    return {
      index: i,
      side: h.side,
      hipLocal: new THREE.Vector3(...h.hip),
      restLocal: new THREE.Vector3(...h.foot),
      femur, tibia,
    };
  });

  return {
    shadowProxies, root, body, neck, head, headMesh, jaw, upperTeeth, lowerTeeth, tongue, eyes, glasses, arms, legs, legsGroup,
    torsoMesh, jacketMesh, allMeshes, materials: M,
    stats: {
      parts: partStats,
      shadowTriangles: shadowProxies.reduce((a, m) => a + m.geometry.index.count / 3, 0),
      triangles: allMeshes.reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3), 0),
      primitives: Object.values(partStats).reduce((a, s) => a + (s.primitives || 0), 0),
      evals: Object.values(partStats).reduce((a, s) => a + s.evals, 0),
      ms: performance.now() - t0,
    },
  };
}
