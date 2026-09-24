// Surface-Nets polygonizer for SDF closures.
//
//  1. Sparse sampling: the grid is visited in blocks; if the SDF at a block's
//     centre says the surface can't be inside, the whole block is filled
//     without evaluating it. That skips most of the volume.
//  2. One vertex per sign-changing cell, at the mean of its edge crossings.
//  3. Vertices are Newton-projected onto the exact zero set, and normals come
//     from the analytic SDF gradient, so shading is smooth at any resolution.
//  4. Ambient occlusion is baked per vertex by marching the SDF along the normal.

export function meshSDF(f, opts) {
  const { min, max, h, projectIters = 3, ao = { step: 0.02, strength: 1.1 }, attributes = [], flipX = false, keep = null, skipAO = false } = opts;
  const t0 = performance.now();

  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const sxy = nx * ny;
  const total = sxy * nz;
  const vals = new Float32Array(total);
  let evals = 0;

  // --- 1. sparse sampling ---------------------------------------------------
  const B = 5;
  const halfDiag = Math.sqrt(3) * B * h * 0.5;
  const skipDist = opts.noSkip ? Infinity : halfDiag * 1.6 + 2 * h;
  for (let bk = 0; bk < nz; bk += B) {
    const ek = Math.min(bk + B, nz);
    for (let bj = 0; bj < ny; bj += B) {
      const ej = Math.min(bj + B, ny);
      for (let bi = 0; bi < nx; bi += B) {
        const ei = Math.min(bi + B, nx);
        const cx = min[0] + (bi + (ei - bi - 1) * 0.5) * h;
        const cy = min[1] + (bj + (ej - bj - 1) * 0.5) * h;
        const cz = min[2] + (bk + (ek - bk - 1) * 0.5) * h;
        const dc = f(cx, cy, cz);
        evals++;
        if (Math.abs(dc) > skipDist) {
          for (let k = bk; k < ek; k++)
            for (let j = bj; j < ej; j++) {
              const row = k * sxy + j * nx;
              for (let i = bi; i < ei; i++) vals[row + i] = dc;
            }
          continue;
        }
        for (let k = bk; k < ek; k++) {
          const z = min[2] + k * h;
          for (let j = bj; j < ej; j++) {
            const y = min[1] + j * h;
            const row = k * sxy + j * nx;
            for (let i = bi; i < ei; i++) vals[row + i] = f(min[0] + i * h, y, z);
          }
        }
        evals += (ek - bk) * (ej - bj) * (ei - bi);
      }
    }
  }

  // --- 2. one vertex per surface cell --------------------------------------
  const cellVert = new Int32Array(total).fill(-1);
  const pos = [];
  const corner = new Float32Array(8);
  // 12 cube edges as corner index pairs (corner bit order: x=1, y=2, z=4)
  const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const s = k * sxy + j * nx + i;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = vals[s + (c & 1) + ((c >> 1) & 1) * nx + ((c >> 2) & 1) * sxy];
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, n = 0;
        for (let e = 0; e < 24; e += 2) {
          const c0 = E[e], c1 = E[e + 1];
          const a = corner[c0], b = corner[c1];
          if ((a < 0) === (b < 0)) continue;
          const t = a / (a - b);
          ax += (c0 & 1) + ((c1 & 1) - (c0 & 1)) * t;
          ay += ((c0 >> 1) & 1) + (((c1 >> 1) & 1) - ((c0 >> 1) & 1)) * t;
          az += ((c0 >> 2) & 1) + (((c1 >> 2) & 1) - ((c0 >> 2) & 1)) * t;
          n++;
        }
        cellVert[s] = pos.length / 3;
        pos.push(min[0] + (i + ax / n) * h, min[1] + (j + ay / n) * h, min[2] + (k + az / n) * h);
      }
    }
  }

  const vcount = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(vcount * 3);

  // --- 3. projection + analytic normals ------------------------------------
  const e = h * 0.35;
  const grad = (x, y, z, out) => {
    const a = f(x + e, y - e, z - e);
    const b = f(x - e, y - e, z + e);
    const c = f(x - e, y + e, z - e);
    const d = f(x + e, y + e, z + e);
    out[0] = a - b - c + d;
    out[1] = -a - b + c + d;
    out[2] = -a + b - c + d;
    evals += 4;
  };
  const g = [0, 0, 0];
  for (let v = 0; v < vcount; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    for (let it = 0; it < projectIters; it++) {
      const d = f(x, y, z);
      grad(x, y, z, g);
      const gl2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (gl2 < 1e-20) break;
      const gl = Math.sqrt(gl2);
      // g is scaled by 4e; normalise then take a clamped Newton step.
      let step = d;
      if (step > h) step = h; else if (step < -h) step = -h;
      x -= (g[0] / gl) * step;
      y -= (g[1] / gl) * step;
      z -= (g[2] / gl) * step;
    }
    grad(x, y, z, g);
    const gl = Math.hypot(g[0], g[1], g[2]) || 1;
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = g[0] / gl; N[v * 3 + 1] = g[1] / gl; N[v * 3 + 2] = g[2] / gl;
  }

  // --- quads -> triangles ---------------------------------------------------
  const idx = [];
  const du = [1, nx, sxy];
  const dims = [nx, ny, nz];
  const coord = [0, 0, 0];
  const pushQuad = (a, b, c, d) => {
    // orient using the SDF normal at the quad
    const pax = P[a * 3], pay = P[a * 3 + 1], paz = P[a * 3 + 2];
    const ux = P[c * 3] - pax, uy = P[c * 3 + 1] - pay, uz = P[c * 3 + 2] - paz;
    const vx = P[d * 3] - P[b * 3], vy = P[d * 3 + 1] - P[b * 3 + 1], vz = P[d * 3 + 2] - P[b * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const nxs = N[a * 3] + N[b * 3] + N[c * 3] + N[d * 3];
    const nys = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1] + N[d * 3 + 1];
    const nzs = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2] + N[d * 3 + 2];
    if (cx * nxs + cy * nys + cz * nzs < 0) { const t = b; b = d; d = t; }
    // split along the shorter diagonal
    const d1 = ux * ux + uy * uy + uz * uz;
    const d2 = vx * vx + vy * vy + vz * vz;
    if (d1 <= d2) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < nz - 1; k++) {
    coord[2] = k;
    for (let j = 0; j < ny - 1; j++) {
      coord[1] = j;
      for (let i = 0; i < nx - 1; i++) {
        coord[0] = i;
        const s = k * sxy + j * nx + i;
        const v0 = vals[s];
        for (let a = 0; a < 3; a++) {
          const v1 = vals[s + du[a]];
          if ((v0 < 0) === (v1 < 0)) continue;
          const u = (a + 1) % 3, w = (a + 2) % 3;
          if (coord[u] === 0 || coord[w] === 0) continue;
          const c0 = cellVert[s], c1 = cellVert[s - du[u]], c2 = cellVert[s - du[u] - du[w]], c3 = cellVert[s - du[w]];
          if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
          pushQuad(c0, c1, c2, c3);
        }
      }
    }
  }
  void dims;

  // --- 4. baked SDF ambient occlusion + custom attributes ------------------
  const AO = new Float32Array(vcount);
  const aoStep = ao.step;
  for (let v = 0; v < (skipAO ? 0 : vcount); v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const nX = N[v * 3], nY = N[v * 3 + 1], nZ = N[v * 3 + 2];
    let occ = 0, w = 0.5;
    for (let s = 1; s <= 5; s++) {
      const hd = aoStep * s;
      const d = f(x + nX * hd, y + nY * hd, z + nZ * hd);
      occ += Math.max(0, (hd - d) / hd) * w;
      w *= 0.5;
    }
    evals += 5;
    AO[v] = Math.max(0, Math.min(1, 1 - occ * ao.strength));
  }

  const extra = {};
  for (const at of attributes) {
    const arr = new Float32Array(vcount * at.size);
    const out = new Array(at.size).fill(0);
    for (let v = 0; v < vcount; v++) {
      at.fn(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], out);
      for (let c = 0; c < at.size; c++) arr[v * at.size + c] = out[c];
    }
    extra[at.name] = { array: arr, itemSize: at.size };
  }

  // optional culling of hidden triangles (e.g. the inside of a jacket)
  let tri = idx;
  if (keep) {
    const kv = new Uint8Array(vcount);
    for (let v = 0; v < vcount; v++) kv[v] = keep(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) ? 1 : 0;
    tri = [];
    for (let t = 0; t < idx.length; t += 3) {
      if (kv[idx[t]] | kv[idx[t + 1]] | kv[idx[t + 2]]) tri.push(idx[t], idx[t + 1], idx[t + 2]);
    }
  }
  let index = new Uint32Array(tri);
  if (flipX) {
    for (let v = 0; v < vcount; v++) { P[v * 3] = -P[v * 3]; N[v * 3] = -N[v * 3]; }
    for (let t = 0; t < index.length; t += 3) { const tmp = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = tmp; }
  }

  return {
    position: P,
    normal: N,
    ao: AO,
    index,
    extra,
    stats: { samples: total, evals, vertices: vcount, triangles: index.length / 3, ms: performance.now() - t0, grid: [nx, ny, nz] },
  };
}
