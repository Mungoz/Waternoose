// Fans sculpt jobs out over a pool of module workers.
export function sculptAll(names, { quality = 1, onPart } = {}) {
  const cores = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  const queue = [...names];
  const results = {};
  let nextId = 0;
  return new Promise((resolve, reject) => {
    let active = 0;
    const workers = [];
    const finish = () => { workers.forEach((w) => w.terminate()); resolve(results); };
    const feed = (w) => {
      const name = queue.shift();
      if (!name) {
        if (active === 0) finish();
        return;
      }
      active++;
      w.postMessage({ id: nextId++, name, quality });
    };
    for (let i = 0; i < Math.min(cores, names.length); i++) {
      const w = new Worker(new URL('./sculpt.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        active--;
        const { name, mesh, error } = e.data;
        if (error) { workers.forEach((x) => x.terminate()); reject(new Error(`${name}: ${error}`)); return; }
        results[name] = mesh;
        onPart?.(name, mesh.stats, Object.keys(results).length, names.length);
        feed(w);
      };
      w.onerror = (e) => { workers.forEach((x) => x.terminate()); reject(e); };
      workers.push(w);
    }
    workers.forEach(feed);
  });
}
