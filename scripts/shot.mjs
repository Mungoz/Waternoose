// Headless screenshot harness: node scripts/shot.mjs "<query>" shotA,shotB ...
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [query = 'shot=wide', list = 'wide', w = '1280', h = '720'] = process.argv.slice(2);
fs.mkdirSync('.shots', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader', `--window-size=${w},${h}`],
});
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h });
const logs = [];
page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`http://localhost:5173/?${query}`, { waitUntil: 'load' });
try {
  await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 250 });
} catch (e) { logs.push('TIMEOUT waiting for ready'); }
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
const gl = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
console.log('GPU:', gl);
for (const name of list.split('|')) {
  const [shotName, extra] = name.split(':');
  await page.evaluate((n, x) => { window.app?.shot(n); if (x) eval(x); }, shotName, extra ? decodeURIComponent(extra) : '');
  await page.evaluate(() => new Promise((r) => { let f = 0; const s = () => (++f > 40 ? r() : requestAnimationFrame(s)); s(); }));
  await page.screenshot({ path: `.shots/${name.split(':')[0]}.png` });
  console.log('saved', name.split(':')[0]);
}
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
