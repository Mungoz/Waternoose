// dev-only: overlay the rendered character on a reference frame.
//   node scripts/overlay.mjs <ref.jpg> <out.png> <refPts x1,y1,x2,y2> <cam px,py,pz,tx,ty,tz,fov> [yawDeg] [pitchDeg]
// refPts are the reference's two big (inner) eyes, screen-left then screen-right.
// The reference is scaled/rotated so those land on our two inner eyes; then our
// silhouette (from a green-screen render) is traced over it in magenta.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [ref, out, refPts, cam, yaw = '0', pitch = '0', extra = ''] = process.argv.slice(2);
const W = 1000, H = 1000;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?shot=wide&hideui&noao&frames=30', { waitUntil: 'load' });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 250 });
const [px, py, pz, tx, ty, tz, fov] = cam.split(',').map(Number);
const lm = await page.evaluate(async (px, py, pz, tx, ty, tz, fov, yaw, pitch, extra) => {
  const { THREE, camera, controls, ch, rig, office } = window.app;
  const a = window.__app();
  a.office.group.visible = false;
  a.scene.background = new THREE.Color(0x00ff00);
  a.scene.environment = a.scene.environment; // keep IBL
  a.bloom.enabled = false;
  a.finish.uniforms.uGrain.value = 0; a.finish.uniforms.uVignette.value = 0; a.finish.uniforms.uCA.value = 0;
  if (extra) eval(extra);
  // freeze the rig in a neutral pose, then set the head yaw/pitch directly
  for (let i = 0; i < 60; i++) rig.update(1 / 30, camera.position);
  rig.update = () => {};
  ch.neck.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ');
  for (const e of ch.eyes) { e.ball.quaternion.identity(); }
  camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update();
  controls.enabled = false;
  camera.lookAt(tx, ty, tz);
  ch.root.updateMatrixWorld(true);
  await new Promise((r) => { let f = 0; const s = () => (++f > 8 ? r() : requestAnimationFrame(s)); s(); });
  const proj = (o) => { const v = o.getWorldPosition(new THREE.Vector3()).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; };
  return { eyes: ch.eyes.map((e) => proj(e.socket)), w: innerWidth, h: innerHeight };
}, px, py, pz, tx, ty, tz, fov, +yaw, +pitch, extra);
const shot = await page.screenshot({ encoding: 'base64' });
await page.close();

// ---- composite ------------------------------------------------------------
const refData = 'data:image/' + (ref.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(ref).toString('base64');
const p2 = await browser.newPage();
await p2.setViewport({ width: W * 2, height: H });
await p2.setContent(`<body style="margin:0;background:#000"><canvas id=c width=${W * 2} height=${H}></canvas><script>
const R = new Image(), S = new Image(); let n = 0;
const go = () => { if (++n < 2) return;
  const c = document.getElementById('c'), g = c.getContext('2d');
  const [ax, ay, bx, by] = [${refPts}];
  const E = ${JSON.stringify(lm.eyes)};
  const [cx, cy] = E[1], [dx, dy] = E[0]; // our screen-left inner eye is innerR (index 1)
  const rs = Math.hypot(bx - ax, by - ay), os = Math.hypot(dx - cx, dy - cy);
  const s = os / rs, rot = Math.atan2(dy - cy, dx - cx) - Math.atan2(by - ay, bx - ax);
  const place = (ox) => { g.save(); g.beginPath(); g.rect(ox, 0, ${W}, ${H}); g.clip(); g.translate(ox + cx, cy); g.rotate(rot); g.scale(s, s); g.translate(-ax, -ay); g.drawImage(R, 0, 0); g.restore(); };
  // left panel: reference with our silhouette traced over it
  place(0);
  // right panel: our render with the reference ghosted over it
  g.save(); g.beginPath(); g.rect(${W}, 0, ${W}, ${H}); g.clip(); g.drawImage(S, ${W}, 0); g.restore();
  g.globalAlpha = 0.45; place(${W}); g.globalAlpha = 1;
  // silhouette edge from the green screen
  const tmp = document.createElement('canvas'); tmp.width = ${W}; tmp.height = ${H};
  const tg = tmp.getContext('2d'); tg.drawImage(S, 0, 0);
  const d = tg.getImageData(0, 0, ${W}, ${H}).data;
  const m = new Uint8Array(${W * H});
  for (let i = 0; i < m.length; i++) { const r = d[i*4], gg = d[i*4+1], b = d[i*4+2]; m[i] = (gg > r + 50 && gg > b + 50 && gg > 120) ? 0 : 1; }
  const edge = g.createImageData(${W}, ${H});
  for (let y = 1; y < ${H} - 1; y++) for (let x = 1; x < ${W} - 1; x++) {
    const i = y * ${W} + x;
    if (m[i] && (!m[i-1] || !m[i+1] || !m[i-${W}] || !m[i+${W}])) {
      for (const [ox, oy] of [[0,0],[1,0],[0,1],[1,1]]) { const j = ((y+oy) * ${W} + x + ox) * 4; edge.data[j] = 255; edge.data[j+1] = 0; edge.data[j+2] = 255; edge.data[j+3] = 255; }
    }
  }
  const ec = document.createElement('canvas'); ec.width = ${W}; ec.height = ${H}; ec.getContext('2d').putImageData(edge, 0, 0);
  g.drawImage(ec, 0, 0); g.drawImage(ec, ${W}, 0);
  // our eye centres
  g.strokeStyle = '#0ff'; g.lineWidth = 2;
  for (const [x, y] of E) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.stroke(); g.beginPath(); g.arc(x + ${W}, y, 6, 0, 7); g.stroke(); }
  // reference eye points
  g.fillStyle = '#ff0';
  for (const [x, y] of [[cx, cy], [dx, dy]]) { g.fillRect(x - 2, y - 2, 4, 4); }
  document.title = 'done';
};
R.onload = go; S.onload = go;
R.src = '${refData}'; S.src = 'data:image/png;base64,${shot}';
</script></body>`);
await p2.waitForFunction('document.title === "done"', { timeout: 60000 });
await p2.screenshot({ path: out });
console.log('wrote', out, JSON.stringify(lm.eyes.map((e) => e.map((v) => Math.round(v)))));
await browser.close();
