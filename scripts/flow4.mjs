import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
await page.click('#enter');
await new Promise((r) => setTimeout(r, 5000));
await page.keyboard.down('Space');
await new Promise((r) => setTimeout(r, 1000));
const steps = [
  ['base', ''],
  ['noGtao', 'a.gtao.enabled=false'],
  ['noBloom', 'a.bloom.enabled=false'],
  ['noChar', 'a.ch.root.visible=false; a.ch.legsGroup.visible=false'],
  ['noOffice', 'a.office.group.visible=false'],
];
for (const [n, code] of steps) {
  await page.evaluate((c) => { const a = window.__app(); eval(c); }, code);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `.shots/f4_${n}.png` });
}
await browser.close();
