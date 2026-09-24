import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5173/?shot=wide&hideui', { waitUntil: 'load' });
await page.waitForFunction('window.__READY === true', { timeout: 180000 });
const res = await page.evaluate(() => {
  const { camera, controls, ch, rig } = window.__app();
  const V = ch.head.position.constructor;
  const p = new V(); ch.eyes.forEach((e) => p.add(e.socket.getWorldPosition(new V()))); p.divideScalar(5);
  const f = new V(Math.sin(rig.heading), 0, Math.cos(rig.heading));
  camera.position.copy(p).addScaledVector(f, 1.3); controls.target.copy(p); controls.update(); camera.updateMatrixWorld();
  const R = new window.app.THREE.Raycaster();
  return ch.eyes.map((e, i) => {
    const w = e.ball.getWorldPosition(new V());
    R.set(camera.position, w.clone().sub(camera.position).normalize());
    const eh = R.intersectObjects(ch.eyes.map((x) => x.ball), false)[0];
    const bh = R.intersectObjects(ch.shadowProxies, false)[0];
    return { i, name: e.name, eye: eh ? [ch.eyes.findIndex((x) => x.ball === eh.object), eh.distance.toFixed(3)] : null, body: bh ? [bh.object.parent.name, bh.distance.toFixed(3)] : null };
  });
});
console.log(res);
await browser.close();
