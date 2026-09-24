// dev-only: collect reference image URLs via DuckDuckGo image search
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const queries = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
const all = {};
for (const q of queries) {
  await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  const urls = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.src).filter((s) => s.includes('external-content') || s.includes('tse')));
  all[q] = urls.map((u) => { try { const p = new URL(u); return decodeURIComponent(p.searchParams.get('u') || u); } catch { return u; } }).slice(0, 25);
  console.log('==', q, all[q].length);
  all[q].forEach((u) => console.log(u));
}
fs.writeFileSync(process.env.OUT || 'refs.json', JSON.stringify(all, null, 1));
await browser.close();
