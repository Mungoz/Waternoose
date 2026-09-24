// Staff photo: he poses, a countdown runs, the frame is captured and laid out
// as an "Employee of the Month" poster the player can download.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

async function poster(photo, info) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  try { await document.fonts?.ready; } catch { /* ignore */ }

  // mahogany panel
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3b1d12'); bg.addColorStop(1, '#1d0d07');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = `rgba(${i % 2 ? '255,190,140' : '0,0,0'},${0.03 + Math.random() * 0.04})`;
    g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * H;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= W; x += 60) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6);
    g.stroke();
  }
  // gold frame
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#f6dc8a'); gold.addColorStop(0.5, '#b8862a'); gold.addColorStop(1, '#f0cf73');
  g.strokeStyle = gold; g.lineWidth = 26; g.strokeRect(22, 22, W - 44, H - 44);
  g.lineWidth = 3; g.strokeRect(52, 52, W - 104, H - 104);

  g.textAlign = 'center';
  g.fillStyle = '#f2d98c';
  g.font = '600 26px Jost, Futura, "Trebuchet MS", sans-serif';
  g.fillText('M O N S T E R S ,   I N C O R P O R A T E D', W / 2, 118);
  g.font = '800 76px Jost, Futura, "Trebuchet MS", sans-serif';
  g.fillStyle = gold;
  g.fillText('EMPLOYEE OF', W / 2, 200);
  g.fillText('THE MONTH', W / 2, 278);

  // the photo, cropped to fill
  const px = 110, py = 318, pw = W - 220, ph = 640;
  const s = Math.max(pw / photo.width, ph / photo.height);
  const sw = pw / s, sh = ph / s;
  g.save();
  roundRect(g, px, py, pw, ph, 18); g.clip();
  g.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2 - sh * 0.04, sw, sh, px, py, pw, ph);
  g.restore();
  g.strokeStyle = gold; g.lineWidth = 8; roundRect(g, px, py, pw, ph, 18); g.stroke();

  // plaque
  g.fillStyle = '#f1e8d4';
  g.font = 'italic 30px Georgia, serif';
  g.fillText('For outstanding contributions to the scream energy effort', W / 2, 1024);
  g.font = '600 26px "JetBrains Mono", Consolas, monospace';
  g.fillStyle = '#e8c86a';
  g.fillText(info.stats, W / 2, 1072);

  // signature
  g.textAlign = 'left';
  g.fillStyle = '#f1e8d4';
  g.font = '64px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';
  g.fillText('H. J. Waternoose III', 110, 1190);
  g.strokeStyle = 'rgba(241,232,212,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(110, 1210); g.lineTo(700, 1210); g.stroke();
  g.font = '600 22px Jost, Futura, sans-serif';
  g.fillStyle = '#c9b48a';
  g.fillText(`CHIEF EXECUTIVE OFFICER  ·  ${info.date}`, 110, 1246);

  // gold seal
  const cx = W - 190, cy = 1195;
  g.fillStyle = gold;
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2, r = i % 2 ? 92 : 104;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.fill();
  g.fillStyle = '#7a4e0e';
  g.beginPath(); g.arc(cx, cy, 76, 0, Math.PI * 2); g.fill();
  g.fillStyle = gold;
  g.textAlign = 'center';
  g.font = 'italic bold 88px Georgia, serif';
  g.fillText('W', cx, cy + 31);
  return c;
}

export function createPhoto(game) {
  const modal = document.querySelector('#photoModal');
  const img = modal.querySelector('img');
  const dl = modal.querySelector('.download');
  const count = document.querySelector('#countdown');
  let busy = false, url = null;

  const close = () => {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    game.award('photo');
  };
  modal.querySelector('.close').onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  return {
    get busy() { return busy; },
    async take() {
      if (busy || !game.rig) return;
      busy = true;
      const hud = document.querySelector('#hud');
      const wasPhoto = hud.classList.contains('photo');
      hud.classList.add('photo');
      game.updateViewOffset?.();
      const rig = game.rig;
      rig.drive = null;
      if (game.state.dancing) game.actions.dance();
      game.shot('photo');
      game.lookAtCamera(true);
      const d = game.say('photo', { force: true });
      await wait(Math.max(1500, d * 1000 + 200));
      rig.setMood('delighted');
      rig.setPose('idle');
      for (const n of ['3', '2', '1']) {
        count.textContent = n;
        count.classList.remove('hidden', 'tick'); void count.offsetWidth; count.classList.add('tick');
        game.audio.blip(n === '1' ? 1320 : 880, 0.08, 'sine', 0.06);
        await wait(650);
      }
      count.classList.add('hidden');
      const shot = await game.captureFrame();
      game.audio.shutter();
      const flash = document.querySelector('#flash');
      flash.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('on')));

      const photo = await loadImage(shot);
      const canvas = await poster(photo, {
        date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
        stats: `Quota ${Math.round(game.state.energy * 100)}%   ·   Best scream ${game.bestGrade()}   ·   Awards ${game.awards.count}/${game.awards.total}`,
      });
      if (url) URL.revokeObjectURL(url);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      url = URL.createObjectURL(blob);
      img.src = url;
      dl.href = url;
      dl.download = 'waternoose-employee-of-the-month.png';
      modal.classList.remove('hidden');

      if (!wasPhoto) hud.classList.remove('photo');
      game.updateViewOffset?.();
      game.lookAtCamera(false);
      setTimeout(() => game.say('photoDone', { force: true }), 400);
      busy = false;
    },
  };
}
