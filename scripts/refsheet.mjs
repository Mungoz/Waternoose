// dev-only: screenshot DuckDuckGo image grids as contact sheets + dump full-size URLs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [outDir, ...queries] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1600 });
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
let n = 0;
for (const q of queries) {
  await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  // number each tile so I can refer to it
  const tiles = await page.evaluate(() => {
    const figs = [...document.querySelectorAll('figure, [data-testid="image-result"], .tile--img')];
    const out = [];
    document.querySelectorAll('img').forEach((img, i) => {
      const r = img.getBoundingClientRect();
      if (r.width < 80 || r.height < 60 || !img.src.includes('bing')) return;
      const tag = document.createElement('div');
      tag.textContent = out.length;
      tag.style.cssText = `position:absolute;left:${r.left + window.scrollX}px;top:${r.top + window.scrollY}px;background:#ff0;color:#000;font:bold 16px sans-serif;padding:2px 5px;z-index:99999`;
      document.body.appendChild(tag);
      out.push(img.src);
    });
    void figs;
    return out;
  });
  const file = `${outDir}/sheet${n}.png`;
  await page.screenshot({ path: file });
  fs.writeFileSync(`${outDir}/sheet${n}.json`, JSON.stringify({ q, tiles }, null, 1));
  console.log(file, q, tiles.length);
  n++;
}
await browser.close();
