import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
await page.click('#enter');
for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 1500)); console.log('t', i * 1.5, JSON.stringify(await page.evaluate(() => window.__dbg()))); }
await page.keyboard.down('Space');
for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 1500)); console.log('scream', i * 1.5, JSON.stringify(await page.evaluate(() => window.__dbg()))); }
await page.screenshot({ path: '.shots/flowdbg.png' });
await browser.close();
