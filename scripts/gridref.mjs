// dev-only: draw a labelled pixel grid over an image so landmark coordinates can be read off
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [src, out, step = '50', crop = ''] = process.argv.slice(2);
const [cx = 0, cy = 0, cw = 0, ch = 0, sc = 1] = crop ? crop.split(',').map(Number) : [];
const data = 'data:image/' + (src.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(src).toString('base64');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setContent(`<body style="margin:0"><canvas id=c></canvas><script>
const img = new Image(); img.onload = () => {
  const CX=${cx}, CY=${cy}, CW=${cw}||img.width, CH=${ch}||img.height, SC=${sc};
  const c = document.getElementById('c'); c.width = CW*SC; c.height = CH*SC;
  const g = c.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(img, CX, CY, CW, CH, 0, 0, CW*SC, CH*SC);
  const s = ${step};
  g.font = '11px monospace';
  for (let x = Math.ceil(CX/s)*s; x <= CX+CW; x += s) { const X=(x-CX)*SC; g.strokeStyle = x % (s*2) ? "rgba(0,255,255,0.4)" : "rgba(255,255,0,0.7)"; g.beginPath(); g.moveTo(X,0); g.lineTo(X,c.height); g.stroke(); g.fillStyle="#ff0"; g.fillText(x, X+2, 11); }
  for (let y = Math.ceil(CY/s)*s; y <= CY+CH; y += s) { const Y=(y-CY)*SC; g.strokeStyle = y % (s*2) ? "rgba(0,255,255,0.4)" : "rgba(255,255,0,0.7)"; g.beginPath(); g.moveTo(0,Y); g.lineTo(c.width,Y); g.stroke(); g.fillStyle="#ff0"; g.fillText(y, 2, Y-2); }
  document.title = c.width + 'x' + c.height;
}; img.src = '${data}';
</script></body>`);
await page.waitForFunction('document.title.includes("x")');
const [w, h] = (await page.title()).split('x').map(Number);
await page.setViewport({ width: w, height: h });
await page.screenshot({ path: out });
console.log(out, w, h);
await browser.close();
