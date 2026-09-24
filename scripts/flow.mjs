// Drives the real (non-harness) flow: loader -> clock in -> scream -> quota.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('console', (m) => { if (['error', 'warn'].includes(m.type()) && !m.text().includes('X4122')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: '.shots/flow0_loader.png' });
await page.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
await page.screenshot({ path: '.shots/flow1_ready.png' });
await page.click('#enter');
await new Promise((r) => setTimeout(r, 7000));
await page.screenshot({ path: '.shots/flow2_greet.png' });
await page.keyboard.down('Space');
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: '.shots/flow3_scream.png' });
await new Promise((r) => setTimeout(r, 9000));
await page.keyboard.up('Space');
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '.shots/flow4_quota.png' });
await page.keyboard.press('Tab');
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '.shots/flow5_director.png' });
const err = await page.$eval('#error', (e) => e.classList.contains('hidden') ? '' : e.textContent);
console.log('error box:', err || '(none)');
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
