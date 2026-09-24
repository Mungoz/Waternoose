// Tiny signed-distance-function toolkit. Every primitive returns a closure
// f(x, y, z) -> signed distance (metres). Closures are composed with smooth
// boolean operators to "sculpt" organic shapes, which the mesher then polygonizes.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Counts primitives so the loading screen can brag about it.
export const stats = { primitives: 0 };

// Polynomial smooth min (iq). k is the blend radius in metres.
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);

// Rotation matrix (inverse, i.e. world -> local) from XYZ euler angles.
function invRot(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz * Ry * Rx (three.js 'XYZ' order); inverse = transpose.
  const m00 = cy * cz, m01 = sx * sy * cz - cx * sz, m02 = cx * sy * cz + sx * sz;
  const m10 = cy * sz, m11 = sx * sy * sz + cx * cz, m12 = cx * sy * sz - sx * cz;
  const m20 = -sy, m21 = sx * cy, m22 = cx * cy;
  return [m00, m10, m20, m01, m11, m21, m02, m12, m22];
}

export function sphere(cx, cy, cz, r) {
  stats.primitives++;
  return (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  };
}

// Ellipsoid (iq's bound approximation), optional rotation [rx, ry, rz].
export function ellipsoid(c, r, rot) {
  stats.primitives++;
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const irx = 1 / rx, iry = 1 / ry, irz = 1 / rz;
  const irx2 = irx * irx, iry2 = iry * iry, irz2 = irz * irz;
  const m = rot ? invRot(rot[0], rot[1], rot[2]) : null;
  return (x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (m) {
      const ax = m[0] * px + m[3] * py + m[6] * pz;
      const ay = m[1] * px + m[4] * py + m[7] * pz;
      const az = m[2] * px + m[5] * py + m[8] * pz;
      px = ax; py = ay; pz = az;
    }
    const k0x = px * irx, k0y = py * iry, k0z = pz * irz;
    const k1x = px * irx2, k1y = py * iry2, k1z = pz * irz2;
    const k0 = Math.sqrt(k0x * k0x + k0y * k0y + k0z * k0z);
    const k1 = Math.sqrt(k1x * k1x + k1y * k1y + k1z * k1z);
    if (k1 < 1e-9) return -Math.min(rx, ry, rz);
    return (k0 * (k0 - 1)) / k1;
  };
}

// Round cone between points a and b with radii r1 (at a) and r2 (at b). (iq)
export function roundCone(a, b, r1, r2) {
  stats.primitives++;
  const [ax, ay, az] = a;
  const bax = b[0] - ax, bay = b[1] - ay, baz = b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const xvx = pax * l2 - bax * yy, xvy = pay * l2 - bay * yy, xvz = paz * l2 - baz * yy;
    const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

export const capsule = (a, b, r) => roundCone(a, b, r, r);

// Rounded box: centre c, half extents h, rounding r, optional rotation.
export function roundBox(c, h, r, rot) {
  stats.primitives++;
  const [cx, cy, cz] = c;
  const hx = h[0] - r, hy = h[1] - r, hz = h[2] - r;
  const m = rot ? invRot(rot[0], rot[1], rot[2]) : null;
  return (x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (m) {
      const ax = m[0] * px + m[3] * py + m[6] * pz;
      const ay = m[1] * px + m[4] * py + m[7] * pz;
      const az = m[2] * px + m[5] * py + m[8] * pz;
      px = ax; py = ay; pz = az;
    }
    const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy, qz = Math.abs(pz) - hz;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

// Torus lying in the XZ plane.
export function torus(c, R, r) {
  stats.primitives++;
  const [cx, cy, cz] = c;
  return (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const q = Math.sqrt(px * px + pz * pz) - R;
    return Math.sqrt(q * q + py * py) - r;
  };
}

// ---- operators -------------------------------------------------------------

// Smooth union of many shapes with a shared blend radius.
export function U(k, ...fs) {
  const n = fs.length;
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < n; i++) d = smin(d, fs[i](x, y, z), k);
    return d;
  };
}

// Hard union.
export function H(...fs) {
  const n = fs.length;
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < n; i++) {
      const e = fs[i](x, y, z);
      if (e < d) d = e;
    }
    return d;
  };
}

// Smooth subtraction: a minus b.
export const S = (k, a, b) => (x, y, z) => smax(a(x, y, z), -b(x, y, z), k);
// Smooth intersection.
export const I = (k, a, b) => (x, y, z) => smax(a(x, y, z), b(x, y, z), k);

// Mirror across the YZ plane — sculpt one side, get both.
export const mirrorX = (f) => (x, y, z) => f(Math.abs(x), y, z);

// Hollow shell of thickness t around the surface of f, offset outward by o.
export const shell = (f, o, t) => (x, y, z) => Math.abs(f(x, y, z) - o) - t;

// Offset (inflate) a shape.
export const inflate = (f, o) => (x, y, z) => f(x, y, z) - o;

// Arbitrary domain warp: g(x,y,z) returns [x', y', z'] (use sparingly; not exact).
export const warp = (f, g) => (x, y, z) => {
  const p = g(x, y, z);
  return f(p[0], p[1], p[2]);
};

// Cheap deterministic value noise for sculpt-time surface variation.
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz), b = hash3(ix + 1, iy, iz);
  const c = hash3(ix, iy + 1, iz), d = hash3(ix + 1, iy + 1, iz);
  const e = hash3(ix, iy, iz + 1), f = hash3(ix + 1, iy, iz + 1);
  const g = hash3(ix, iy + 1, iz + 1), h = hash3(ix + 1, iy + 1, iz + 1);
  const x1 = mix(mix(a, b, ux), mix(c, d, ux), uy);
  const x2 = mix(mix(e, f, ux), mix(g, h, ux), uy);
  return mix(x1, x2, uz) * 2 - 1;
}
