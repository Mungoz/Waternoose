import { buildPart, PARTS } from '../src/character/parts.js';
import { meshSDF } from '../src/sdf/mesher.js';
let tot = 0, tris = 0;
for (const name of Object.keys(PARTS)) {
  const job = buildPart(name, Number(process.argv[2] || 1));
  const m = meshSDF(job.sdf, job);
  tot += m.stats.ms; tris += m.stats.triangles;
  // sanity: bounds of mesh vs grid bounds (touching the box = clipped surface)
  let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
  for (let i = 0; i < m.position.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], m.position[i+a]); mx[a] = Math.max(mx[a], m.position[i+a]); }
  const clip = [0,1,2].some(a => mn[a] - job.min[a] < job.h*1.5 || job.max[a] - mx[a] < job.h*1.5);
  console.log(name.padEnd(13), `${m.stats.ms.toFixed(0)}ms`.padStart(7), `tris ${m.stats.triangles}`.padEnd(12), `prims ${job.primitives}`, 'grid', m.stats.grid.join('x'), clip ? 'CLIPPED ' + mn.map(v=>v.toFixed(2)) + ' / ' + mx.map(v=>v.toFixed(2)) : '');
}
console.log('total', tot.toFixed(0), 'ms', tris, 'tris');
