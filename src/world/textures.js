// Small helpers for painting textures into canvases at startup.

import * as THREE from 'three';

export function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// deterministic so the room looks the same every visit
let seed = 1337;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function woodPlanks(g, w, h, base, rows = 8) {
  const ph = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * w * 0.5;
    while (x < w) {
      const pw = w * (0.35 + rnd() * 0.4);
      const tint = 0.8 + rnd() * 0.35;
      g.fillStyle = `rgb(${base[0] * tint | 0},${base[1] * tint | 0},${base[2] * tint | 0})`;
      g.fillRect(x, r * ph, pw, ph);
      // grain
      for (let k = 0; k < 26; k++) {
        const y0 = r * ph + rnd() * ph;
        g.strokeStyle = `rgba(${rnd() < 0.5 ? '20,8,2' : '255,210,160'},${0.04 + rnd() * 0.07})`;
        g.lineWidth = 0.5 + rnd() * 1.8;
        g.beginPath();
        g.moveTo(x, y0);
        for (let s = 0; s <= 12; s++) g.lineTo(x + (pw * s) / 12, y0 + Math.sin(s * 0.8 + k) * (1 + rnd() * 2));
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, r * ph, 2, ph);
      x += pw;
    }
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, r * ph, w, 2);
  }
}
