import { buildPart } from '../src/character/parts.js';
import { meshSDF } from '../src/sdf/mesher.js';
for (const name of process.argv.slice(2)) {
  const job = buildPart(name, 1.6);
  const a = meshSDF(job.sdf, { ...job, skipAO: true, projectIters: 0 });
  const b = meshSDF(job.sdf, { ...job, skipAO: true, projectIters: 0, noSkip: true });
  console.log(name, 'skip', a.stats.triangles, 'full', b.stats.triangles, 'diff', b.stats.triangles - a.stats.triangles);
}
