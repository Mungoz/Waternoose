// Side-by-side sheet: node scripts/compare.mjs out.png refA.jpg renderA.png [refB renderB ...]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const [out, ...imgs] = process.argv.slice(2);
const pairs = [];
for (let i = 0; i < imgs.length; i += 2) pairs.push([imgs[i], imgs[i + 1]]);
const src = (p) => 'data:image/' + (p.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(p).toString('base64');
const html = `<html><body style="margin:0;background:#111;color:#ccc;font:14px sans-serif">${pairs.map(([a, b]) =>
  `<div style="display:flex;gap:6px;padding:6px"><div style="flex:1"><div>REFERENCE</div><img src="${src(a)}" style="width:100%;height:420px;object-fit:contain;background:#000"></div><div style="flex:1"><div>RENDER</div><img src="${src(b)}" style="width:100%;height:420px;object-fit:contain;background:#000"></div></div>`).join('')}</body></html>`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 450 * pairs.length + 10 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', path.resolve(out));
