import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--use-angle=d3d11'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction('!document.querySelector("#enter").disabled', { timeout: 120000 });
await page.tap('#enter');
await new Promise((r) => setTimeout(r, 3000));
console.log(await page.evaluate(() => { const e = document.querySelector('#touchHint'); const r = e.getBoundingClientRect(); return { display: getComputedStyle(e).display, opacity: getComputedStyle(e).opacity, cls: e.className, rect: [r.x, r.y, r.width, r.height] }; }));
await page.screenshot({ path: '.shots/m_real.png' });
// tap the hold button and check it registers as a scream
const hb = await page.$('#hold'); const box = await hb.boundingBox();
await page.touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 1500));
console.log('holding:', await page.evaluate(() => window.__app().state.holding), 'energy', await page.evaluate(() => window.__app().state.energy.toFixed(2)));
await page.touchscreen.touchEnd();
await new Promise((r) => setTimeout(r, 300));
console.log('released:', await page.evaluate(() => !window.__app().state.holding));
await browser.close();
