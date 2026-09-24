// dev-only: drive every feature in a real browser and screenshot it
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (n) => page.screenshot({ path: `.shots/ft_${n}.png` });
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await ev(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
await page.click('#enter');
await wait(9000);
await snap('01_clockin');

// scream with the keyboard -> review card (capped at B) + first scream award
await page.keyboard.down('Space'); await wait(3200); await page.keyboard.up('Space');
await wait(1200); await snap('02_grade');
console.log('grade card:', await ev(() => document.querySelector('#grade .letter').textContent + ' ' + document.querySelector('#grade .meta').textContent));

// the closet door
await ev(() => window.__app().office.themed.openDoor());
await wait(2500); await snap('03_door');

// drive forward then sidestep
await page.keyboard.down('KeyW'); await wait(2500); await snap('04_drive'); await page.keyboard.up('KeyW');

await wait(1500);

// poke all five eyes
await ev(() => { const { camera, controls, ch, rig } = window.__app(); const V = ch.head.position.constructor; const p = new V(); ch.eyes.forEach((e) => p.add(e.socket.getWorldPosition(new V()))); p.divideScalar(5); const f = new V(Math.sin(rig.heading), 0, Math.cos(rig.heading)); camera.position.copy(p).addScaledVector(f, 1.3); controls.target.copy(p); controls.update(); });
await wait(600);
for (let i = 0; i < 5; i++) {
  await ev((i) => { const { camera, controls, ch } = window.__app(); const V = ch.head.position.constructor; const e = ch.eyes[i]; const w = e.socket.getWorldPosition(new V()); const d = new V(0, 0, 1).transformDirection(e.socket.matrixWorld); camera.position.copy(w).addScaledVector(d, 1.1); controls.target.copy(w); controls.update(); camera.updateMatrixWorld(); }, i);
  await new Promise((r) => setTimeout(r, 150));
  const xy = await ev((i) => { const { camera, ch } = window.__app(); const v = ch.eyes[i].ball.getWorldPosition(new ch.head.position.constructor()).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }, i);
  await page.mouse.click(xy[0], xy[1]);
  await wait(1400); // let the flinch settle
  console.log('click', i, xy.map(Math.round), 'poked', await ev(() => [...window.__app().state.pokedEyes].join(',')));
}
await snap('06_eyes');
console.log('eyes poked:', await ev(() => window.__app().state.pokedEyes.size));

// power events
await ev(() => window.__app().events.trigger('surge'));
await wait(900);
await page.keyboard.down('Space'); await wait(1500); await snap('07_surge'); await page.keyboard.up('Space');
await wait(12000);
await ev(() => window.__app().events.trigger('brownout'));
await wait(1500); await snap('08_brownout');
await wait(5000);

// staff photo
await page.keyboard.press('KeyP');
await page.waitForFunction('!document.querySelector("#photoModal").classList.contains("hidden")', { timeout: 30000 });
await wait(600); await snap('09_photo');
const posterSize = await ev(() => { const i = document.querySelector('#photoModal img'); return [i.naturalWidth, i.naturalHeight]; });
console.log('poster', posterSize);
await page.keyboard.press('Escape');

// awards panel
await page.click('#dock [data-act="awards"]');
await wait(500); await snap('10_awards');
console.log('awards:', await ev(() => window.__app().awards.count), '/', await ev(() => window.__app().awards.total));
console.log(logs.join('\n') || 'no errors');
await browser.close();
