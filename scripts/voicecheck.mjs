// dev-only: confirm recorded lines load, play and drive the jaw in the real app
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[${r.status()}] ${r.url()}`); });
await page.goto(process.argv[2] || 'http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
await page.click('#enter');
await page.waitForFunction('window.__app().audio.voiceClips', { timeout: 30000 });
const loaded = await page.evaluate(() => { const c = [...window.__app().audio.voiceClips.values()]; return { total: c.length, decoded: c.filter((x) => x.buffer).length }; });
console.log('clips', loaded);
const samples = [];
for (let i = 0; i < 70; i++) {
  samples.push(await page.evaluate(() => { const a = window.__app().audio; return { speaking: a.isSpeaking(), mouth: +a.mouthOpen().toFixed(2), jaw: +window.__app().rig.jaw.toFixed(3), sub: document.querySelector('#subtitle .text').textContent.slice(0, 30) }; }));
  await new Promise((r) => setTimeout(r, 150));
}
const speakingFrames = samples.filter((s) => s.speaking).length;
const mouthMoves = samples.filter((s) => s.mouth > 0.2).length;
console.log('speaking frames', speakingFrames, '/ 70, mouth open frames', mouthMoves, ', max jaw', Math.max(...samples.map((s) => s.jaw)));
console.log('subtitles seen:', [...new Set(samples.map((s) => s.sub).filter(Boolean))].slice(0, 6));
// villain line should run slower
await page.keyboard.press('KeyV');
await new Promise((r) => setTimeout(r, 300));
console.log('villain playbackRate', await page.evaluate(() => window.__app().audio._line?.rate));
console.log(logs.join('\n') || 'no errors');
await browser.close();
