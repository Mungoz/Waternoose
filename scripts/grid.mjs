// dev-only: tile images into one labelled sheet. node scripts/grid.mjs out.png cols a.jpg b.jpg ...
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [out, cols, ...imgs] = process.argv.slice(2);
const src = (p) => 'data:image/' + (p.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(p).toString('base64');
const W = 1500, c = +cols, cw = Math.floor(W / c), ch = Math.floor(cw * 0.8);
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${c},${cw}px)">${imgs.map((p) => `<div style="position:relative;width:${cw}px;height:${ch}px"><img src="${src(p)}" style="width:100%;height:100%;object-fit:contain"><span style="position:absolute;left:2px;top:2px;background:#ff0;font:bold 14px sans-serif;padding:1px 4px">${p.split(/[\/]/).pop()}</span></div>`).join('')}</body>`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: W, height: Math.ceil(imgs.length / c) * ch });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: out });
await browser.close();
