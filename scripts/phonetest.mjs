// dev-only: board call + night shift cycle
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
await page.click('#enter');
await wait(22000); // intro conversation

await ev(() => window.__app().phone.ring());
await wait(3000);
await page.screenshot({ path: '.shots/ph_1_ringing.png' });
await page.keyboard.press('KeyF');
const seen = new Set();
for (let i = 0; i < 90; i++) {
  const s = await ev(() => ({ who: document.querySelector('#subtitle .who').textContent, text: document.querySelector('#subtitle .text').textContent, busy: window.__app().phone.busy, mouth: window.__app().audio.mouthOpen() }));
  if (s.text.length > 20) seen.add(`${s.who}: ${s.text.slice(0, 50)}`);
  if (i === 8) await page.screenshot({ path: '.shots/ph_2_call.png' });
  if (!s.busy && i > 10) break;
  await wait(300);
}
console.log([...seen].filter((x, i, a) => !a.some((y) => y !== x && y.startsWith(x.slice(0, 30)) && y.length > x.length)).join('\n'));

// finish the night
await ev(() => { window.__app().state.energy = 0.97; });
await page.keyboard.down('Space'); await wait(1500); await page.keyboard.up('Space');
await page.waitForFunction('!document.querySelector("#nightCard").classList.contains("hidden")', { timeout: 40000 });
await wait(600);
await page.screenshot({ path: '.shots/ph_3_report.png' });
await page.click('#nightCard .next');
await wait(4000);
console.log('after next night:', await ev(() => ({ night: window.__app().shifts.night, energy: +window.__app().state.energy.toFixed(2), quota: window.__app().state.quota, status: document.querySelector('#status').textContent })));
await page.screenshot({ path: '.shots/ph_4_night2.png' });
console.log(logs.join('\n') || 'no errors');
await browser.close();
