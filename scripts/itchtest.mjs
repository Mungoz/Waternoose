// dev-only: serve the zip's contents the way itch.io does (sub-path, inside an iframe) and play it
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer-core';

// unzip in memory (our own zip format: stored or deflated entries)
const buf = fs.readFileSync(process.argv[2] || 'waternoose-itch.zip');
const files = {};
let p = 0;
while (buf.readUInt32LE(p) === 0x04034b50) {
  const method = buf.readUInt16LE(p + 8), csize = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
  const name = buf.slice(p + 30, p + 30 + nlen).toString();
  const body = buf.slice(p + 30 + nlen + xlen, p + 30 + nlen + xlen + csize);
  files[name] = method === 8 ? zlib.inflateRawSync(body) : body;
  p += 30 + nlen + xlen + csize;
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<body style="margin:0;background:#222"><iframe id=f src="/html/123456/index.html" width=1280 height=720 frameborder=0 allow="autoplay; fullscreen *; microphone; gamepad" allowfullscreen></iframe></body>`);
    return;
  }
  const m = url.match(/^\/html\/123456\/(.*)$/);
  const f = m && files[m[1] || 'index.html'];
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(m[1] || '.html')] || 'application/octet-stream' });
  res.end(f);
}).listen(8765);

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => logs.push('[failed] ' + r.url()));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[${r.status()}] ${r.url()}`); });
const t0 = Date.now();
await page.goto('http://localhost:8765/', { waitUntil: 'load' });
const frame = await (await page.$('#f')).contentFrame();
await frame.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
console.log('sculpted + ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await frame.click('#enter');
await frame.waitForFunction('window.__app().audio.voiceClips', { timeout: 30000 });
console.log('voice clips decoded in iframe:', await frame.evaluate(() => [...window.__app().audio.voiceClips.values()].filter((c) => c.buffer).length));
await new Promise((r) => setTimeout(r, 7000));
console.log('speaking:', await frame.evaluate(() => window.__app().audio.isSpeaking()));
await page.screenshot({ path: '.shots/itch_iframe.png' });
const err = await frame.$eval('#error', (e) => (e.classList.contains('hidden') ? '' : e.textContent));
console.log('error box:', err || '(none)');
console.log(logs.join('\n') || 'no console errors / failed requests');
await browser.close();
server.close();
