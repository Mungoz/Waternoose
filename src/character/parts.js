// The sculpt. Every body part of Mr. Waternoose as a signed distance field,
// plus the grid bounds/resolution it is meshed at and any baked attributes.
// This module runs inside Web Workers (and on the main thread for placement).

import {
  sphere, ellipsoid, roundCone, capsule, roundBox, U, H, S, mirrorX, warp,
  smin, smoothstep, mix, vnoise, stats,
} from '../sdf/sdf.js';
import {
  EYES, MOUTH_Y, MOUTH_CURVE, MOUTH_HALF_W, JACKET_HEM, FEMUR, TIBIA, TIBIA_BOW,
  UPPER_ARM, FORE_ARM,
} from './anatomy.js';

// deterministic scatter
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
const smin2 = (a, b, k) => (x, y, z) => smin(a(x, y, z), b(x, y, z), k);

// the mouth line (head space): wide, frowning, following the round of the face
export const mouthY = (x) => MOUTH_Y - MOUTH_CURVE * x * x;
const faceBend = (x, y, z) => [x, y + MOUTH_CURVE * x * x, z + 1.25 * x * x];

// --------------------------------------------------------------------------
// HEAD — a big warty toad dome, five eyes, ear-to-ear mouth, heavy chin
// --------------------------------------------------------------------------
function headSDF(withMouth) {
  // A squat bell, wider than tall: a short warty dome, five frog-bulb eyes high
  // on the face, a wide flat-fronted mouth at the midline, and below it the
  // great jowl sack that rests straight on the collar.
  const dome = ellipsoid([0, 0.49, -0.045], [0.315, 0.285, 0.3]);
  // a rounded forehead facing forward above the eye row
  const forehead = ellipsoid([0, 0.6, 0.02], [0.27, 0.13, 0.19]);
  const face = ellipsoid([0, 0.34, 0.02], [0.39, 0.26, 0.34]);
  // the jowl sack: bulges forward and down past the face, widest of all
  const jowls = ellipsoid([0, 0.18, 0.08], [0.43, 0.215, 0.37]);
  const base = ellipsoid([0, 0.07, 0.04], [0.3, 0.09, 0.28]);
  // only a slight overhang above the mouth crease, strongest in the middle
  // a thick rolled upper lip overhanging the mouth, drooping at the corners like a walrus
  const upperLip = warp(ellipsoid([0, MOUTH_Y + 0.026, 0.322], [0.34, 0.034, 0.07]), (x, y, z) => [x, y + MOUTH_CURVE * 1.15 * x * x, z + 1.25 * x * x]);
  // cheek pads bulging above the mouth corners
  const cheeks = mirrorX(ellipsoid([0.235, MOUTH_Y + 0.07, 0.23], [0.1, 0.07, 0.08], [0, 0.5, 0.25]));
  // bags under the eyes
  const bags = H(...EYES.map((e) => {
    const d = norm(e.dir);
    return ellipsoid([e.pos[0] + d[0] * 0.004, e.pos[1] - e.r * 1.05, e.pos[2] - d[2] * 0.01], [e.r * 1.05, e.r * 0.42, e.r * 0.7], [0.3, Math.atan2(d[0], d[2]), 0]);
  }));
  // a small fleshy brow bump over each eye
  const brows = H(...EYES.map((e) => {
    const d = norm(e.dir);
    const outer = Math.abs(e.pos[0]) > 0.15 ? 1 : 0;
    return ellipsoid([e.pos[0] - d[0] * 0.02, e.pos[1] + e.r * (1.1 + outer * 0.25), e.pos[2] - d[2] * 0.03], [e.r * 1.3, e.r * (0.42 + outer * 0.2), e.r * 0.8], [0, Math.atan2(d[0], d[2]), outer * -0.35 * Math.sign(e.pos[0])]);
  }));

  let head = U(0.12, dome, face, base, jowls);
  head = U(0.08, head, forehead);
  head = U(0.05, head, cheeks);
  head = U(0.028, head, upperLip);
  head = smin2(head, bags, 0.02);
  head = smin2(head, brows, 0.045);

  // frog-bulb sockets: a raised mound around each eye, then the hole it sits in
  for (const e of EYES) {
    const d = norm(e.dir);
    const k = e.r * 0.6;
    head = smin2(head, sphere(e.pos[0] - d[0] * k, e.pos[1] - d[1] * k, e.pos[2] - d[2] * k, e.r * 1.08), 0.06);
  }
  for (const e of EYES) head = S(0.01, head, sphere(e.pos[0], e.pos[1], e.pos[2], e.r * 1.04));

  // the jowl line running from each mouth corner round the chin, plus soft folds in the sack
  // (the fine wrinkles of the jowl sack are in the shader; sculpted folds read as shelves)

  // warts across the dome
  const r = rng(7);
  const warts = [];
  for (let i = 0; i < 170; i++) {
    const th = Math.acos(1 - r() * 1.35); // polar angle from +Y
    const ph = r() * Math.PI * 2;
    const dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.cos(ph);
    const rad = (0.007 + r() * 0.012) * (0.6 + 0.4 * dy);
    if (dz > 0.45 && dy < 0.36) continue; // keep clear of the eyes and brows
    // sit each wart on the actual dome surface (pushed out over the forehead)
    const px = dx * 0.315, py = 0.49 + dy * 0.285, pz = -0.045 + dz * 0.3;
    warts.push([px, py, pz + Math.max(0, dz) * 0.035 * Math.max(0, 1 - dy), rad]);
  }
  // bucket the warts in a coarse grid so each sample only tests its neighbours
  const G = 0.06, reach = 0.03;
  const buckets = new Map();
  const key = (i, j, k) => (i + 64) * 16384 + (j + 64) * 128 + (k + 64);
  warts.forEach((w, n) => {
    const r = w[3] + reach;
    for (let i = Math.floor((w[0] - r) / G); i <= Math.floor((w[0] + r) / G); i++)
      for (let j = Math.floor((w[1] - r) / G); j <= Math.floor((w[1] + r) / G); j++)
        for (let k = Math.floor((w[2] - r) / G); k <= Math.floor((w[2] + r) / G); k++) {
          const kk = key(i, j, k);
          if (!buckets.has(kk)) buckets.set(kk, []);
          buckets.get(kk).push(w);
        }
  });
  stats.primitives += warts.length;
  const wartField = (x, y, z) => {
    const list = buckets.get(key(Math.floor(x / G), Math.floor(y / G), Math.floor(z / G)));
    // nothing nearby: report "far" so the mesher can still skip empty space
    if (!list) return 1;
    let d = 1;
    for (const w of list) d = Math.min(d, Math.hypot(x - w[0], y - w[1], z - w[2]) - w[3]);
    return d;
  };
  head = smin2(head, wartField, 0.008);

  if (withMouth) {
    const slit = warp(roundBox([0, MOUTH_Y, 0.37], [MOUTH_HALF_W, 0.0095, 0.17], 0.0094), faceBend);
    head = S(0.01, head, slit);
  }
  return head;
}

const headAttributes = (uncut) => [
  {
    // x: jaw weight, y: brow raise, z: inner-brow furrow, w: mouth corners
    name: 'aRig', size: 4,
    fn(x, y, z, nx, ny, nz, out) {
      const ax = Math.abs(x);
      const dm = y - mouthY(Math.min(ax, 0.36));
      const near = smoothstep(0.39, 0.32, ax) * smoothstep(0.14, 0.24, z + 1.25 * x * x);
      const width = mix(0.07, 0.0065, near);
      let jaw = smoothstep(width, -width, dm);
      // the chin travels; the throat resting on the shirt stays put
      jaw *= smoothstep(-0.05, 0.15, z) * smoothstep(0.03, 0.13, y);
      out[0] = jaw;
      const brow = smoothstep(0.56, 0.59, y) * smoothstep(0.67, 0.62, y) * smoothstep(0.06, 0.18, z) * smoothstep(0.3, 0.2, ax);
      out[1] = brow;
      out[2] = brow * smoothstep(0.18, 0.02, ax);
      // mouth corners, fading in along the lip line so a smile curves the whole mouth
      out[3] = Math.exp(-((ax - 0.31) ** 2) / 0.009 - ((y - mouthY(Math.min(ax, 0.32))) ** 2) / 0.0035) * smoothstep(0.02, 0.14, z) * smoothstep(0.05, 0.22, ax);
    },
  },
  {
    name: 'aMouth', size: 1,
    fn(x, y, z, nx, ny, nz, out) { out[0] = smoothstep(0.004, 0.035, -uncut(x, y, z)); },
  },
];

// --------------------------------------------------------------------------
// TORSO: red vest up top, big grey crab belly below (body space)
// --------------------------------------------------------------------------
export function torsoSDF() {
  return U(0.18,
    ellipsoid([0, -0.2, 0.08], [0.9, 0.5, 0.74]),
    ellipsoid([0, 0.14, 0.07], [0.72, 0.46, 0.58]),
    ellipsoid([0, 0.36, -0.08], [0.7, 0.28, 0.46]),
    ellipsoid([0, 0.46, 0.06], [0.36, 0.13, 0.3]),
  );
}

// jacket front edge: close to the neck at the top, hanging open over the belly
export const openingW = (y) => 0.46 + (0.52 - y) * 0.6;
const hemY = (z) => JACKET_HEM - 0.12 * smoothstep(0.1, -0.5, z);

export function jacketSDF() {
  const torso = torsoSDF();
  return (x, y, z) => {
    const d = torso(x, y, z);
    let j = Math.max(d - 0.036, -(d - 0.012));
    j = Math.max(j, hemY(z) - y);
    // neck hole
    j = Math.max(j, -Math.max(Math.hypot(x, z - 0.1) - 0.29, 0.4 - y));
    // open front
    const ow = openingW(y);
    j = Math.max(j, Math.min((ow - Math.abs(x)) * 0.94, z - 0.05));
    // lapels: a thicker rolled band along the front edge, with a notch
    if (y > 0.06 && y < 0.56 && z > 0.0) {
      const e = Math.abs(x) - ow;
      let lap = Math.max(d - 0.055, -(d - 0.014));
      lap = Math.max(lap, Math.max(-e * 0.94, (e - 0.1) * 0.94));
      lap = Math.max(lap, 0.06 - y);
      lap = Math.max(lap, -Math.max(0.05 - Math.abs(y - 0.33) - 0.5 * Math.max(0, e - 0.05), 0.05 - e));
      j = Math.min(j, lap);
    }
    j += 0.003 * vnoise(x * 12, y * 8, z * 12);
    return j;
  };
}

function bowtieSDF() {
  const lobes = warp(mirrorX(ellipsoid([0.062, 0, 0], [0.058, 0.044, 0.016])), (x, y, z) => {
    const ax = Math.abs(x);
    return [x, y / (0.42 + 0.58 * smoothstep(0.0, 0.07, ax)), z + 0.02 * (ax / 0.11) ** 2];
  });
  const knot = roundBox([0, 0, 0.008], [0.02, 0.024, 0.016], 0.01);
  const creases = mirrorX(H(
    ellipsoid([0.06, 0.012, 0.016], [0.045, 0.003, 0.006], [0, 0, 0.25]),
    ellipsoid([0.06, -0.012, 0.016], [0.045, 0.003, 0.006], [0, 0, -0.25]),
  ));
  return U(0.01, knot, S(0.004, lobes, creases));
}

// --------------------------------------------------------------------------
// ARMS
// --------------------------------------------------------------------------
function upperSleeveSDF() {
  const L = UPPER_ARM;
  const main = U(0.06, roundCone([0, 0.02, 0], [0, -L, 0], 0.135, 0.112), sphere(0, 0, 0, 0.14));
  const creases = H(
    ellipsoid([0, -L + 0.03, 0.1], [0.08, 0.008, 0.04], [0.3, 0, 0]),
    ellipsoid([0.02, -L + 0.07, 0.1], [0.07, 0.007, 0.035], [0.4, 0, 0.2]),
    ellipsoid([-0.02, -0.28, 0.11], [0.05, 0.006, 0.03], [0.1, 0, -0.2]),
  );
  const s = S(0.012, main, creases);
  return (x, y, z) => s(x, y, z) + 0.004 * vnoise(x * 22, y * 16, z * 22);
}

function foreSleeveSDF() {
  const L = FORE_ARM;
  const main = U(0.04, roundCone([0, 0, 0], [0, -L + 0.02, 0], 0.11, 0.1), sphere(0, 0, 0, 0.108));
  const hollow = capsule([0, -0.33, 0], [0, -0.6, 0], 0.088);
  const s = S(0.005, main, hollow);
  return (x, y, z) => Math.max(s(x, y, z) + 0.003 * vnoise(x * 24, y * 18, z * 24), -y - L + 0.005);
}

function cuffSDF() {
  const L = FORE_ARM;
  return (x, y, z) => {
    const r = Math.hypot(x, z);
    const dr = r - 0.088;
    const dy = Math.abs(y - (-L + 0.012)) - 0.045;
    const q0 = Math.max(dr, 0), q1 = Math.max(dy, 0);
    return Math.hypot(q0, q1) + Math.min(Math.max(dr, dy), 0) - 0.003;
  };
}

// Big grey hand with long knobbly fingers ending in claws. Wrist at origin,
// fingers along -Y, palm facing -X (towards the body for the left hand).
function handParts() {
  const parts = [], claws = [];
  const palm = roundBox([0, -0.09, 0.0], [0.034, 0.078, 0.066], 0.03);
  const wrist = capsule([0, 0.03, 0], [0, -0.04, 0], 0.054);
  const thenar = ellipsoid([-0.015, -0.08, 0.045], [0.032, 0.052, 0.034]);
  const scale = [0.86, 1.0, 1.04, 0.92];
  for (let f = 0; f < 4; f++) {
    const s = scale[f];
    const splay = (f - 1.5) * 0.09;
    let p = [0.003, -0.158 + (f === 0 || f === 3 ? 0.01 : 0), -0.05 + f * 0.033];
    const lens = [0.072 * s, 0.056 * s, 0.042 * s];
    const radii = [0.02, 0.0175, 0.015, 0.011];
    const curls = [0.18 + f * 0.03, 0.32, 0.28];
    let theta = 0;
    for (let k = 0; k < 3; k++) {
      theta += curls[k];
      const dir = [-Math.sin(theta), -Math.cos(theta) * Math.cos(splay), -Math.cos(theta) * Math.sin(splay)];
      const q = [p[0] + dir[0] * lens[k], p[1] + dir[1] * lens[k], p[2] + dir[2] * lens[k]];
      parts.push(roundCone(p, q, radii[k], radii[k + 1]));
      parts.push(sphere(p[0] + 0.004, p[1], p[2], radii[k] * 1.12)); // knobbly knuckle
      p = q;
    }
    theta += 0.35;
    const cd = [-Math.sin(theta), -Math.cos(theta) * Math.cos(splay), -Math.cos(theta) * Math.sin(splay)];
    claws.push(roundCone(p, [p[0] + cd[0] * 0.04, p[1] + cd[1] * 0.04, p[2] + cd[2] * 0.04], 0.011, 0.0015));
  }
  const t = [[-0.012, -0.05, 0.058], [-0.032, -0.105, 0.09], [-0.056, -0.145, 0.1], [-0.07, -0.172, 0.1]];
  parts.push(roundCone(t[0], t[1], 0.026, 0.02), roundCone(t[1], t[2], 0.02, 0.017), roundCone(t[2], t[3], 0.017, 0.012));
  claws.push(roundCone(t[3], [-0.09, -0.198, 0.096], 0.011, 0.0015));
  const body = U(0.03, wrist, palm, thenar);
  const fingers = H(...parts);
  const clawF = H(...claws);
  const skin = (x, y, z) => smin(body(x, y, z), fingers(x, y, z), 0.014);
  return {
    sdf: (x, y, z) => smin(skin(x, y, z), clawF(x, y, z), 0.006) + 0.0007 * vnoise(x * 160, y * 160, z * 160),
    claw: clawF,
  };
}

// --------------------------------------------------------------------------
// LEGS — thick crab legs; pinkish knuckles, bowed knobbly lower segments
// --------------------------------------------------------------------------
function tubercles(seed, n, centre, radiusAt, yRange) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = yRange[0] + r() * (yRange[1] - yRange[0]);
    const a = (r() - 0.5) * Math.PI * 1.4; // mostly on the outer (+X) side
    const c = centre(y);
    const rad = radiusAt(y);
    out.push(sphere(c[0] + Math.cos(a) * rad * 0.97, y, c[2] + Math.sin(a) * rad * 0.97, 0.007 + r() * 0.008));
  }
  return H(...out);
}

function femurSDF() {
  const L = FEMUR;
  const main = U(0.07,
    roundCone([0, 0, 0], [0, L, 0], 0.21, 0.2),
    ellipsoid([0.02, L * 0.5, 0], [0.235, L * 0.38, 0.2]),
  );
  const knee = U(0.035, main, sphere(0, L, 0, 0.215), ellipsoid([0.05, L - 0.01, 0], [0.18, 0.13, 0.17]));
  const bumps = tubercles(3, 34, () => [0.02, 0, 0], (y) => 0.225 - y * 0.03, [0.08, L - 0.06]);
  const ring = (x, y, z) => Math.hypot(Math.hypot(x, z) - 0.2, y - L * 0.82) - 0.01;
  const s = S(0.012, smin2(knee, bumps, 0.006), ring);
  return (x, y, z) => s(x, y, z / 0.85) * 0.9 + 0.003 * vnoise(x * 30, y * 14, z * 30);
}

// bows out early, then hooks back in towards the point
export const tibiaCentre = (t) => [TIBIA_BOW * Math.sin(Math.PI * Math.pow(t, 0.68)), t * TIBIA, 0];
// a broad blade that stays wide most of the way, then tapers to a hooked point
const tibiaRadius = (t) => 0.19 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.6) + 0.006;

function tibiaSDF() {
  const segs = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    segs.push(roundCone(tibiaCentre(t0), tibiaCentre(t1), tibiaRadius(t0), tibiaRadius(t1)));
  }
  const shaft = H(...segs);
  const knuckle = U(0.035, sphere(0, 0, 0, 0.2), ellipsoid([0.045, 0.09, 0], [0.21, 0.15, 0.18]));
  const leg0 = smin2(knuckle, shaft, 0.04);
  // the crease where the knuckle meets the claw segment
  const crease = (x, y, z) => Math.hypot(Math.hypot(x - tibiaCentre(0.13)[0], z) - tibiaRadius(0.13) * 1.02, y - 0.13 * TIBIA) - 0.012;
  const leg = S(0.012, leg0, crease);
  const bumps = tubercles(11, 34, (y) => tibiaCentre(y / TIBIA), (y) => tibiaRadius(y / TIBIA), [0.1, 0.72]);
  const s = smin2(leg, bumps, 0.006);
  return (x, y, z) => s(x, y, z / 0.68) * 0.75 + 0.0025 * vnoise(x * 30, y * 12, z * 30);
}

// --------------------------------------------------------------------------
// MOUTH BITS (head space)
// --------------------------------------------------------------------------
function teethSDF(upper) {
  const ts = [];
  // chunky, slightly crooked old teeth
  const n = 11;
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * 2 - 1;
    const x = u * 0.26 + Math.sin(i * 7.3) * 0.004;
    const z = 0.345 - 1.25 * x * x;
    const y = mouthY(x);
    const len = 0.021 * (1 - 0.3 * Math.abs(u)) * (0.85 + 0.3 * Math.abs(Math.sin(i * 12.9)));
    const base = upper ? y + 0.016 : y - 0.016;
    const tip = upper ? base - len : base + len;
    const w = 0.0115 * (1 - 0.25 * Math.abs(u));
    ts.push(roundCone([x, base, z], [x + Math.sin(i * 3.1) * 0.003, tip, z + 0.003], w, w * 0.55));
  }
  const gum = warp(
    ellipsoid([0, upper ? MOUTH_Y + 0.022 : MOUTH_Y - 0.022, 0.31], [0.24, 0.016, 0.06]),
    (x, y, z) => [x, y + MOUTH_CURVE * x * x, z + 1.25 * x * x],
  );
  return U(0.004, gum, H(...ts));
}

function tongueSDF() {
  return U(0.03,
    ellipsoid([0, MOUTH_Y - 0.026, 0.25], [0.14, 0.024, 0.08]),
    ellipsoid([0, MOUTH_Y - 0.035, 0.18], [0.17, 0.035, 0.09]),
  );
}

function buttonSDF() {
  return (x, y, z) => {
    const r = Math.hypot(x, y);
    const dome = Math.max(r - 0.018, Math.abs(z) - 0.004) - 0.005;
    const rim = Math.hypot(r - 0.017, z - 0.006) - 0.003;
    return smin(dome, rim, 0.003);
  };
}

// --------------------------------------------------------------------------
// registry: name -> (detail) => mesher job. detail scales the grid spacing.
// --------------------------------------------------------------------------
function handJob(q, flip) {
  const { sdf, claw } = handParts();
  return {
    proxy: 3, sdf, min: [-0.14, -0.4, -0.13], max: [0.08, 0.1, 0.17], h: 0.0028 * q, ao: { step: 0.01, strength: 1.2 }, flipX: flip,
    attributes: [{ name: 'aMask', size: 1, fn(x, y, z, nx, ny, nz, out) { out[0] = smoothstep(0.003, -0.001, claw(x, y, z)); } }],
  };
}

export const PARTS = {
  head: (q) => {
    const uncut = headSDF(false);
    return {
      sdf: headSDF(true), proxy: 3, projectIters: 2,
      min: [-0.52, -0.08, -0.4], max: [0.52, 0.82, 0.56], h: 0.005 * q,
      ao: { step: 0.02, strength: 1.2 },
      attributes: headAttributes(uncut),
    };
  },
  torso: (q) => ({
    proxy: 3, sdf: torsoSDF(), min: [-1.0, -0.8, -0.72], max: [1.0, 0.8, 0.88], h: 0.0095 * q, ao: { step: 0.04, strength: 1.0 },
    // the jacket hides the sides and back of the chest
    keep: (x, y, z) => y < hemY(z) + 0.05 || y > 0.42 || (z > 0.0 && Math.abs(x) < openingW(y) + 0.08),
  }),
  jacket: (q) => {
    const torso = torsoSDF();
    return {
      sdf: jacketSDF(), proxy: 3, min: [-1.0, -0.46, -0.8], max: [1.0, 0.78, 0.9], h: 0.0075 * q, ao: { step: 0.03, strength: 0.9 },
      keep: (x, y, z) => torso(x, y, z) > 0.02,
    };
  },
  bowtie: (q) => ({ sdf: bowtieSDF(), min: [-0.15, -0.07, -0.05], max: [0.15, 0.07, 0.06], h: 0.0024 * q, ao: { step: 0.008, strength: 1.0 } }),
  upperSleeve: (q) => ({ proxy: 3, sdf: upperSleeveSDF(), min: [-0.19, -0.64, -0.19], max: [0.19, 0.19, 0.19], h: 0.0072 * q }),
  foreSleeve: (q) => ({ proxy: 3, sdf: foreSleeveSDF(), min: [-0.15, -0.52, -0.15], max: [0.15, 0.14, 0.15], h: 0.0066 * q }),
  cuff: (q) => ({ sdf: cuffSDF(), min: [-0.1, -0.53, -0.1], max: [0.1, -0.37, 0.1], h: 0.0042 * q }),
  handL: (q) => handJob(q, false),
  handR: (q) => handJob(q, true),
  femur: (q) => ({
    proxy: 3, sdf: femurSDF(), min: [-0.28, -0.26, -0.28], max: [0.3, FEMUR + 0.26, 0.28], h: 0.0088 * q,
    attributes: [{ name: 'aMask', size: 1, fn(x, y, z, nx, ny, nz, out) { out[0] = smoothstep(FEMUR * 0.82 - 0.02, FEMUR * 0.82 + 0.03, y) * smoothstep(-0.4, 0.3, nx); } }],
  }),
  tibia: (q) => ({
    proxy: 3, sdf: tibiaSDF(), min: [-0.26, -0.26, -0.2], max: [0.56, TIBIA + 0.06, 0.2], h: 0.0085 * q,
    attributes: [{ name: 'aMask', size: 1, fn(x, y, z, nx, ny, nz, out) { out[0] = smoothstep(0.14, 0.1, y); } }],
  }),
  teethUpper: (q) => ({ sdf: teethSDF(true), min: [-0.33, 0.29, 0.14], max: [0.33, 0.45, 0.4], h: 0.003 * q, ao: { step: 0.006, strength: 1.0 } }),
  teethLower: (q) => ({ sdf: teethSDF(false), min: [-0.33, 0.27, 0.14], max: [0.33, 0.43, 0.4], h: 0.003 * q, ao: { step: 0.006, strength: 1.0 } }),
  tongue: (q) => ({ sdf: tongueSDF(), min: [-0.24, 0.25, 0.04], max: [0.24, 0.42, 0.4], h: 0.005 * q }),
  button: (q) => ({ sdf: buttonSDF(), min: [-0.03, -0.03, -0.016], max: [0.03, 0.03, 0.02], h: 0.0014 * q, ao: { step: 0.003, strength: 1.0 } }),
};

export function buildPart(name, q) {
  stats.primitives = 0;
  const job = PARTS[name](q);
  job.primitives = stats.primitives;
  return job;
}
