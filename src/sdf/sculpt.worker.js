import { buildPart } from '../character/parts.js';
import { meshSDF } from './mesher.js';

self.onmessage = (e) => {
  const { id, name, quality } = e.data;
  try {
    const job = buildPart(name, quality);
    const mesh = meshSDF(job.sdf, job);
    mesh.stats.primitives = job.primitives;
    const transfer = [mesh.position.buffer, mesh.normal.buffer, mesh.ao.buffer, mesh.index.buffer];
    for (const k in mesh.extra) transfer.push(mesh.extra[k].array.buffer);
    if (job.proxy) {
      // coarse stand-in that only ever renders into shadow maps
      const pm = meshSDF(job.sdf, { ...job, h: job.h * job.proxy, attributes: [], skipAO: true, projectIters: 1 });
      mesh.proxy = { position: pm.position, normal: pm.normal, index: pm.index };
      transfer.push(pm.position.buffer, pm.normal.buffer, pm.index.buffer);
      mesh.stats.evals += pm.stats.evals;
    }
    self.postMessage({ id, name, mesh }, transfer);
  } catch (err) {
    self.postMessage({ id, name, error: String(err && err.stack || err) });
  }
};
