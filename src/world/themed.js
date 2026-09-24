// The things that make it *his* office: monster-fur furniture with horns and
// claws, eyeball lamps on tentacle stalks, carnivorous pot plants, a tentacle
// coat rack, a scare-floor door station with a child's closet door behind it,
// the Top Scarers board, CDA safety posters and a contaminated sock on display.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, rnd } from './textures.js';
import { Batch, frame, box, cyl, sph } from './decor.js';

const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);

// A tapering tube along a curve, built from short cylinders (batch friendly).
function tentacle(B, mat, pts, r0, r1, { parent = null, color = null, suckers = 0, suckerColor = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const N = 16;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = curve.getPoint(i / N), b = curve.getPoint((i + 1) / N);
    const ra = r0 + (r1 - r0) * (i / N), rb = r0 + (r1 - r0) * ((i + 1) / N);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(rb, ra, len * 1.08, 12);
    const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
    const m = new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, 1, 1));
    if (parent) m.premultiply(parent);
    g.applyMatrix4(m);
    B.add(g, mat, { color });
    B.add(new THREE.SphereGeometry(rb, 10, 8), mat, { p: b.toArray(), parent, color });
  }
  for (let i = 0; i < suckers; i++) {
    const t = 0.15 + (i / suckers) * 0.75;
    const p = curve.getPoint(t), tan = curve.getTangent(t);
    const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
    const r = r0 + (r1 - r0) * t;
    B.add(new THREE.SphereGeometry(r * 0.45, 8, 6), mat, { p: p.clone().addScaledVector(side, r * 0.8).toArray(), s: [1, 1, 0.5], parent, color: suckerColor ?? color });
  }
  return curve;
}

// ---- painted textures ---------------------------------------------------------------
function furTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, w, h);
    // spots
    for (let i = 0; i < 14; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 45;
      g.fillStyle = 'rgba(40,20,70,0.55)';
      g.beginPath();
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.fill();
    }
    // hair strands
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * w, y = rnd() * h, a = 1.2 + rnd() * 0.6;
      g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.1 + rnd() * 0.15})` : `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke();
    }
  }, { repeat: [2, 2] });
}

function eyeTex(iris) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(200,60,60,0.35)'; g.lineWidth = 1.5;
      let x = rnd() < 0.5 ? w * 0.75 : rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    const cx = w * 0.25, cy = h * 0.5;
    const gr = g.createRadialGradient(cx, cy, 6, cx, cy, 44);
    gr.addColorStop(0, iris[0]); gr.addColorStop(0.7, iris[1]); gr.addColorStop(1, '#101010');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, 44, 44, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#050505'; g.beginPath(); g.ellipse(cx, cy, 17, 17, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(cx - 12, cy - 12, 7, 7, 0, 0, Math.PI * 2); g.fill();
  });
}

function kidDoorTex() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#8fc7e8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6aa6c8'; g.lineWidth = 8;
    g.strokeRect(24, 30, w - 48, h * 0.42); g.strokeRect(24, h * 0.52, w - 48, h * 0.42);
    // crayon rainbow and sun
    ['#e8453c', '#f29a2e', '#f5d23a', '#5bbf55', '#4a7fd6'].forEach((c, i) => {
      g.strokeStyle = c; g.lineWidth = 9; g.beginPath(); g.arc(w / 2, 200, 90 - i * 11, Math.PI, 0); g.stroke();
    });
    g.fillStyle = '#f5d23a'; g.beginPath(); g.arc(196, 72, 22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f5d23a'; g.lineWidth = 3;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.moveTo(196 + Math.cos(a) * 28, 72 + Math.sin(a) * 28); g.lineTo(196 + Math.cos(a) * 38, 72 + Math.sin(a) * 38); g.stroke(); }
    // stickers: stars
    const star = (x, y, r, c) => {
      g.fillStyle = c; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.fill();
    };
    star(60, 320, 18, '#f5d23a'); star(190, 360, 14, '#e87ab0'); star(90, 430, 16, '#ffffff'); star(170, 450, 12, '#f5d23a');
    // stick-figure family, drawn by someone small
    g.strokeStyle = '#333'; g.lineWidth = 4;
    for (const [x, s] of [[80, 1], [128, 1.2], [170, 0.7]]) {
      g.beginPath(); g.arc(x, 290 - 34 * s, 10 * s, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x, 300 - 24 * s); g.lineTo(x, 300 + 16 * s); g.moveTo(x - 14 * s, 300 - 8 * s); g.lineTo(x + 14 * s, 300 - 8 * s);
      g.moveTo(x, 300 + 16 * s); g.lineTo(x - 10 * s, 300 + 36 * s); g.moveTo(x, 300 + 16 * s); g.lineTo(x + 10 * s, 300 + 36 * s); g.stroke();
    }
    g.fillStyle = '#e8453c'; g.font = 'bold 26px "Comic Sans MS", "Chalkboard SE", sans-serif'; g.textAlign = 'center';
    g.fillText('KEEP OUT!!', w / 2, 490);
  });
}

function bedroomTex() {
  return canvasTex(256, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1230'); bg.addColorStop(1, '#141a3a');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // window with moon
    g.fillStyle = '#1e2a5a'; g.fillRect(40, 60, 110, 140);
    g.fillStyle = '#e8e4c0'; g.beginPath(); g.arc(110, 100, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1e2a5a'; g.beginPath(); g.arc(100, 94, 20, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0b1230'; g.lineWidth = 6; g.strokeRect(40, 60, 110, 140); g.beginPath(); g.moveTo(95, 60); g.lineTo(95, 200); g.stroke();
    // glow-in-the-dark stars
    g.fillStyle = 'rgba(190,255,190,0.8)';
    for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * 240, 2 + rnd() * 2, 0, Math.PI * 2); g.fill(); }
    // bed silhouette with a sleeping lump
    g.fillStyle = '#1c2450'; g.fillRect(10, 360, 236, 100);
    g.fillStyle = '#2e3a78'; g.beginPath(); g.ellipse(150, 360, 80, 36, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#d8d0f0'; g.beginPath(); g.ellipse(52, 350, 32, 18, 0, 0, Math.PI * 2); g.fill();
    // nightlight
    const nl = g.createRadialGradient(222, 300, 2, 222, 300, 70);
    nl.addColorStop(0, 'rgba(255,220,140,0.9)'); nl.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = nl; g.fillRect(150, 230, 106, 140);
  });
}

function hazardTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#f2c200'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    for (let x = -h; x < w + h; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  }, { repeat: [3, 1] });
}

function posterTex(kind) {
  return canvasTex(512, 720, (g, w, h) => {
    const center = (text, y, font, color) => { g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.fillText(text, w / 2, y); };
    if (kind === 'toxic') {
      g.fillStyle = '#f2c200'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111'; g.fillRect(24, 24, w - 48, 110);
      center('DANGER', 108, 'bold 92px Impact, "Arial Black", sans-serif', '#f2c200');
      // child pictogram with a slash
      g.fillStyle = '#111';
      g.beginPath(); g.arc(w / 2, 250, 44, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(w / 2 - 70, 470); g.lineTo(w / 2, 305); g.lineTo(w / 2 + 70, 470); g.fill();
      g.strokeStyle = '#c8102e'; g.lineWidth = 26;
      g.beginPath(); g.arc(w / 2, 350, 150, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 106, 244); g.lineTo(w / 2 + 106, 456); g.stroke();
      center('CHILDREN', 580, 'bold 64px Impact, "Arial Black", sans-serif', '#111');
      center('ARE TOXIC', 646, 'bold 64px Impact, "Arial Black", sans-serif', '#111');
      center('Report all contamination to the CDA', 692, 'italic 24px Georgia, serif', '#111');
    } else if (kind === 'doors') {
      g.fillStyle = '#1b6b73'; g.fillRect(0, 0, w, h);
      center('SCREAM', 110, 'bold 84px Impact, "Arial Black", sans-serif', '#f2e6c8');
      center('SAFELY', 196, 'bold 84px Impact, "Arial Black", sans-serif', '#f2c200');
      // a canister illustration
      g.fillStyle = '#f2c200'; g.fillRect(w / 2 - 60, 250, 120, 40); g.fillRect(w / 2 - 60, 470, 120, 40);
      const cg = g.createLinearGradient(w / 2 - 50, 0, w / 2 + 50, 0);
      cg.addColorStop(0, '#ffe680'); cg.addColorStop(0.5, '#fffbe0'); cg.addColorStop(1, '#ffc400');
      g.fillStyle = cg; g.fillRect(w / 2 - 50, 290, 100, 180);
      center('Close every door.', 590, 'bold 40px Georgia, serif', '#f2e6c8');
      center('Every time.', 640, 'bold 40px Georgia, serif', '#f2e6c8');
    } else {
      g.fillStyle = '#5a1422'; g.fillRect(0, 0, w, h);
      center('SCARER', 100, 'bold 76px Impact, "Arial Black", sans-serif', '#f2c200');
      center('OF THE MONTH', 170, 'bold 50px Impact, "Arial Black", sans-serif', '#f2e6c8');
      // horned silhouette
      g.fillStyle = '#1a0a0e';
      g.beginPath(); g.ellipse(w / 2, 420, 140, 170, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(w / 2 - 110, 300); g.quadraticCurveTo(w / 2 - 190, 200, w / 2 - 130, 230); g.lineTo(w / 2 - 80, 290); g.fill();
      g.beginPath(); g.moveTo(w / 2 + 110, 300); g.quadraticCurveTo(w / 2 + 190, 200, w / 2 + 130, 230); g.lineTo(w / 2 + 80, 290); g.fill();
      g.fillStyle = '#f2c200';
      for (const x of [-50, 0, 50]) { g.beginPath(); g.arc(w / 2 + x, 390, 14, 0, Math.PI * 2); g.fill(); }
      center('Could it be YOU?', 660, 'italic bold 40px Georgia, serif', '#f2e6c8');
    }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
  });
}

// the Top Scarers board: redrawn when the player posts a better scream
function scoreboard() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 640;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (best) => {
    const g = c.getContext('2d');
    g.fillStyle = '#0a0806'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#3a2a12'; g.lineWidth = 16; g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = '#ffb020'; g.font = 'bold 58px "JetBrains Mono", Consolas, monospace'; g.textAlign = 'center';
    g.fillText('TOP SCARERS · THIS QUARTER', c.width / 2, 92);
    const rows = [
      ['"THE GNASH" MOTTRAM', 97], ['OLGA TENTACULA', 94], ['FANGS McGEE', 91], ['BARTHOLOMEW BLOB', 86], ['LITTLE GRUMBLE', 73],
    ];
    if (best) rows.push(['YOU', best]);
    rows.sort((a, b) => b[1] - a[1]);
    g.textAlign = 'left';
    rows.slice(0, 6).forEach(([name, score], i) => {
      const y = 180 + i * 74;
      const you = name === 'YOU';
      g.fillStyle = you ? '#7fff9a' : '#ffcf66';
      g.font = 'bold 44px "JetBrains Mono", Consolas, monospace';
      g.fillText(`${i + 1}.`, 60, y);
      g.fillText(name, 150, y);
      g.textAlign = 'right'; g.fillText(String(score), c.width - 60, y); g.textAlign = 'left';
    });
    // dot-matrix scanlines
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}

// ---------------------------------------------------------------------------
export function buildThemed(group, { WZ }) {
  const B = new Batch();
  const M = {
    fur: new THREE.MeshPhysicalMaterial({ name: 'fur', map: furTex(), vertexColors: true, roughness: 0.95, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.6 }),
    horn: new THREE.MeshStandardMaterial({ name: 'horn', color: 0xe6dcc2, vertexColors: true, roughness: 0.45 }),
    claw: new THREE.MeshStandardMaterial({ name: 'claw', color: 0x2a2222, vertexColors: true, roughness: 0.3 }),
    flesh: new THREE.MeshPhysicalMaterial({ name: 'flesh', color: 0xffffff, vertexColors: true, roughness: 0.5, clearcoat: 0.4, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ name: 'steel2', color: 0x6a7078, vertexColors: true, metalness: 0.75, roughness: 0.4 }),
    hazard: new THREE.MeshStandardMaterial({ name: 'hazard', map: hazardTex(), vertexColors: true, roughness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ name: 'gold', color: 0xf0c050, vertexColors: true, metalness: 1, roughness: 0.22 }),
    yellow: new THREE.MeshPhysicalMaterial({ name: 'canisterYellow', color: 0xf2b705, vertexColors: true, metalness: 0.3, roughness: 0.4, clearcoat: 0.5 }),
    screamGlow: new THREE.MeshStandardMaterial({ name: 'screamGlow', color: 0x000000, emissive: 0xffb830, emissiveIntensity: 2 }),
    cloth: new THREE.MeshStandardMaterial({ name: 'cloth', color: 0xffffff, vertexColors: true, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ name: 'wood2', color: 0x5a3a26, vertexColors: true, roughness: 0.5 }),
    pot: new THREE.MeshPhysicalMaterial({ name: 'pot', color: 0xffffff, vertexColors: true, roughness: 0.25, clearcoat: 1 }),
  };
  M.screamGlow.userData.noShadow = true;
  const animated = [];

  // ---- monster-fur furniture ----------------------------------------------------
  const clawFoot = (f, x, z) => {
    B.add(sph(0.07, 10, 8), M.fur, { p: [x, 0.08, z], s: [1, 0.8, 1], parent: f, color: 0x7a5a9a });
    for (const a of [-0.5, 0, 0.5]) B.add(new THREE.ConeGeometry(0.022, 0.1, 8), M.claw, { p: [x + Math.sin(a) * 0.06, 0.03, z + Math.cos(a) * 0.07], r: [Math.PI / 2 + 0.3, a, 0], parent: f });
  };
  const furChair = (x, z, ry, tint) => {
    const f = frame(x, 0, z, ry);
    B.add(rbox(1.05, 0.42, 1.0, 0.12), M.fur, { p: [0, 0.34, 0], parent: f, color: tint });
    B.add(rbox(0.82, 0.18, 0.8, 0.08), M.fur, { p: [0, 0.62, 0.05], parent: f, color: tint });
    B.add(rbox(1.05, 0.9, 0.26, 0.12), M.fur, { p: [0, 0.9, -0.4], parent: f, color: tint });
    for (const sx of [-1, 1]) {
      B.add(rbox(0.22, 0.6, 1.0, 0.1), M.fur, { p: [sx * 0.46, 0.66, 0], parent: f, color: tint });
      // curled horns on the wings
      B.add(new THREE.ConeGeometry(0.06, 0.34, 12), M.horn, { p: [sx * 0.42, 1.44, -0.4], r: [0, 0, -sx * 0.5], parent: f });
    }
    for (const [lx, lz] of [[-0.42, -0.4], [0.42, -0.4], [-0.42, 0.4], [0.42, 0.4]]) clawFoot(f, lx, lz);
  };
  furChair(-6.4, -0.55, -Math.PI / 2 + 0.35, 0x49b8b0); // teal with purple spots
  furChair(-6.4, 1.85, -Math.PI / 2 - 0.35, 0x9a7ad0); // lavender

  // sofa: purple monster hide with big ram horns on the arms
  {
    const f = frame(-5.0, 0, 8.2, Math.PI);
    const tint = 0x8a5ac0;
    B.add(rbox(2.9, 0.45, 1.0, 0.12), M.fur, { p: [0, 0.34, 0], parent: f, color: tint });
    for (const x of [-0.93, 0, 0.93]) B.add(rbox(0.9, 0.18, 0.78, 0.08), M.fur, { p: [x, 0.64, 0.06], parent: f, color: tint });
    B.add(rbox(2.9, 0.7, 0.28, 0.14), M.fur, { p: [0, 0.9, -0.38], parent: f, color: tint });
    for (const sx of [-1, 1]) {
      B.add(rbox(0.3, 0.62, 1.0, 0.14), M.fur, { p: [sx * 1.45, 0.66, 0], parent: f, color: tint });
      // spiralled horns
      for (let k = 0; k < 7; k++) {
        const a = k * 0.55;
        B.add(sph(0.075 - k * 0.007, 10, 8), M.horn, { p: [sx * (1.5 + Math.sin(a) * 0.14), 1.02 + k * 0.035 + Math.cos(a) * 0.08, 0.3 - k * 0.04], parent: f });
      }
    }
    for (const [lx, lz] of [[-1.3, -0.42], [1.3, -0.42], [-1.3, 0.42], [1.3, 0.42]]) clawFoot(f, lx, lz);
  }

  // ---- eyeball lamps on tentacle stalks --------------------------------------------------
  const eyeLamps = [];
  const eyeLamp = (x, z, iris, h = 1.9) => {
    const f = frame(x, 0, z, 0);
    B.add(cyl(0.2, 0.26, 0.05, 20), M.claw, { p: [0, 0.025, 0], parent: f });
    tentacle(B, M.flesh, [[0, 0.02, 0], [0.12, 0.6, 0.05], [-0.08, 1.2, -0.04], [0.02, h, 0]], 0.07, 0.035, { parent: f, color: 0x5a9a50, suckers: 6, suckerColor: 0x9ac08a });
    const tex = eyeTex(iris);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.25 }));
    eye.position.set(x, h + 0.16, z);
    eye.castShadow = true;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.212, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0x4a8a44, roughness: 0.6, side: THREE.DoubleSide }));
    eye.add(lid);
    group.add(eye);
    eyeLamps.push({ eye, lid, next: 2 + rnd() * 5, blink: -1 });
  };
  eyeLamp(-8.2, 2.9, ['#ffd23a', '#c07a10']);
  eyeLamp(-6.9, 8.2, ['#7fe36a', '#2a7a30']);
  eyeLamp(8.25, 3.0, ['#ff6a6a', '#8a1010']);

  // ---- carnivorous pot plants ---------------------------------------------------------------
  const heads = [];
  const monsterPlant = (x, z, s = 1) => {
    const f = frame(x, 0, z, rnd() * 6);
    B.add(new THREE.LatheGeometry([[0, 0], [0.24, 0], [0.32, 0.45], [0.35, 0.5], [0, 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 20), M.pot, { s: [s, s, s], parent: f, color: 0x5a3a9a });
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd();
      const hh = (1.0 + rnd() * 0.6) * s;
      const top = [Math.cos(a) * 0.35 * s, hh, Math.sin(a) * 0.35 * s];
      tentacle(B, M.flesh, [[0, 0.45 * s, 0], [top[0] * 0.3, hh * 0.6, top[2] * 0.3], top], 0.035 * s, 0.025 * s, { parent: f, color: 0x3a7a34 });
      // a leaf or two on the stalk
      const tipW = new THREE.Vector3(...top).applyMatrix4(f);
      const head = new THREE.Group();
      head.position.copy(tipW);
      head.rotation.y = rnd() * 6;
      head.scale.setScalar(s);
      group.add(head);
      const jaw = (upper) => {
        const g = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a9a3a, roughness: 0.5, side: THREE.DoubleSide }));
        shell.scale.set(1, 0.6, 1.3);
        shell.position.z = 0.16;
        const inner = new THREE.Mesh(shell.geometry, new THREE.MeshStandardMaterial({ color: 0xb02030, roughness: 0.4, side: THREE.BackSide }));
        inner.scale.set(0.95, 0.57, 1.25); inner.position.z = 0.16;
        g.add(shell, inner);
        for (let k = 0; k < 7; k++) {
          const ta = -Math.PI * 0.8 + (k / 6) * Math.PI * 1.6;
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), M.horn);
          tooth.position.set(Math.sin(ta) * 0.15, 0, 0.16 + Math.cos(ta) * 0.19);
          tooth.rotation.x = upper ? Math.PI : 0;
          tooth.position.y = upper ? -0.02 : 0.02;
          g.add(tooth);
        }
        return g;
      };
      const upper = jaw(true), lower = jaw(false);
      head.add(upper, lower);
      heads.push({ head, upper, lower, phase: rnd() * 10, snapAt: 4 + rnd() * 12, snap: -1 });
    }
  };
  monsterPlant(-6.5, -4.55, 1.1); monsterPlant(6.5, -4.55, 1.1); monsterPlant(-8.3, 7.9); monsterPlant(-8.3, -4.6, 0.8);

  // ---- tentacle coat rack, holding his hat ------------------------------------------------
  {
    const f = frame(-2.2, 0, 8.25, 0);
    B.add(cyl(0.22, 0.26, 0.06, 20), M.claw, { p: [0, 0.03, 0], parent: f });
    tentacle(B, M.flesh, [[0, 0.05, 0], [0.06, 0.8, 0.02], [-0.04, 1.5, 0], [0, 1.85, 0]], 0.06, 0.04, { parent: f, color: 0x7a3a8a, suckers: 5, suckerColor: 0xc08ad0 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      tentacle(B, M.flesh, [[0, 1.6, 0], [Math.cos(a) * 0.2, 1.72, Math.sin(a) * 0.2], [Math.cos(a) * 0.32, 1.9, Math.sin(a) * 0.32]], 0.035, 0.015, { parent: f, color: 0x7a3a8a });
    }
    B.add(cyl(0.18, 0.18, 0.14, 20), M.claw, { p: [0.02, 1.98, 0], r: [0.15, 0, 0.1], parent: f, color: 0x3a3a3a });
    B.add(cyl(0.3, 0.3, 0.015, 24), M.claw, { p: [0.02, 1.91, 0], r: [0.15, 0, 0.1], parent: f, color: 0x3a3a3a });
  }

  // ---- scare-floor door station, a child's closet door in it ----------------------------------
  const station = new THREE.Group();
  station.position.set(8.3, 0, 5.9);
  station.rotation.y = -Math.PI / 2;
  group.add(station);
  const DW = 1.2, DH = 2.3;
  station.updateMatrix();
  const sm = station.matrix;
  B.add(box(DW + 0.9, 0.12, 1.2), M.hazard, { p: [0, 0.06, 0], parent: sm });
  for (const sx of [-1, 1]) B.add(box(0.26, DH + 0.3, 0.5), M.steel, { p: [sx * (DW / 2 + 0.13), (DH + 0.3) / 2 + 0.12, 0], parent: sm });
  B.add(box(DW + 0.52, 0.3, 0.5), M.steel, { p: [0, DH + 0.27, 0], parent: sm });
  B.add(box(0.36, 0.2, 0.3), M.steel, { p: [0, DH + 0.52, 0], parent: sm, color: 0x3a3a3a });
  // card reader
  B.add(box(0.16, 0.26, 0.06), M.steel, { p: [DW / 2 + 0.13, 1.2, 0.28], parent: sm, color: 0x2a2a2a });
  const readerLed = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0x40ff60 }));
  readerLed.position.set(DW / 2 + 0.13, 1.29, 0.315);
  station.add(readerLed);
  // the "door in use" light
  const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1010, emissiveIntensity: 0 }));
  redLight.position.set(0, DH + 0.52, 0.16);
  station.add(redLight);
  // bedroom behind the door
  const room = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshBasicMaterial({ map: bedroomTex() }));
  room.position.set(0, DH / 2 + 0.12, -0.05);
  station.add(room);
  // the door itself, hinged on its left edge
  const hinge = new THREE.Group();
  hinge.position.set(-DW / 2, 0.12, 0.02);
  station.add(hinge);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, 0.06), [
    new THREE.MeshStandardMaterial({ color: 0x7ab0d0 }), new THREE.MeshStandardMaterial({ color: 0x7ab0d0 }),
    new THREE.MeshStandardMaterial({ color: 0x7ab0d0 }), new THREE.MeshStandardMaterial({ color: 0x7ab0d0 }),
    new THREE.MeshStandardMaterial({ map: kidDoorTex(), roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }),
  ]);
  doorMesh.position.set(DW / 2, DH / 2, 0);
  doorMesh.castShadow = true;
  hinge.add(doorMesh);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd0a040, metalness: 1, roughness: 0.3 }));
  knob.position.set(DW - 0.12, DH * 0.45, 0.06);
  hinge.add(knob);
  const doorState = { open: 0, target: 0, closeAt: 0 };

  // ---- walls: posters, top scarers, the chart -------------------------------------------------
  const flat = (tex, w, h, x, y, z, ry, frameColor = 0x1a1410) => {
    const f = frame(x, y, z, ry);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    m.applyMatrix4(f); m.translateZ(0.035);
    group.add(m);
    for (const [px, py, sw, sh] of [[0, h / 2 + 0.03, w + 0.1, 0.06], [0, -h / 2 - 0.03, w + 0.1, 0.06], [-w / 2 - 0.03, 0, 0.06, h], [w / 2 + 0.03, 0, 0.06, h]]) {
      B.add(box(sw, sh, 0.05), M.claw, { p: [px, py, 0.025], parent: f, color: frameColor });
    }
    return m;
  };
  flat(posterTex('toxic'), 0.72, 1.0, 8.97, 2.2, 7.55, -Math.PI / 2);
  flat(posterTex('doors'), 0.72, 1.0, 5.0, 2.7, 8.77, Math.PI);
  flat(posterTex('scarer'), 0.72, 1.0, -5.0, 2.75, 8.77, Math.PI, 0xc9a24a);
  const board = scoreboard();
  const boardMesh = flat(board.tex, 1.6, 1.0, 8.97, 2.95, 3.85, -Math.PI / 2, 0x3a2a12);
  boardMesh.material = new THREE.MeshBasicMaterial({ map: board.tex });

  // ---- trophy cabinet contents + Exhibit 2319 ----------------------------------------------------
  {
    const f = frame(8.72, 0, 1.6, -Math.PI / 2);
    const canisterTrophy = (x, y, s) => {
      B.add(cyl(0.09, 0.1, 0.06, 20), M.gold, { p: [x, y + 0.03, 0.02], s: [s, s, s], parent: f });
      B.add(cyl(0.075, 0.075, 0.22, 20), M.gold, { p: [x, y + 0.17 * s, 0.02], s: [s, s, s], parent: f, color: 0xfff0b0 });
      B.add(cyl(0.085, 0.09, 0.05, 20), M.gold, { p: [x, y + 0.3 * s, 0.02], s: [s, s, s], parent: f });
      B.add(box(0.16, 0.06, 0.12), M.wood, { p: [x, y - 0.0, 0.02], s: [s, s, s], parent: f });
    };
    canisterTrophy(-0.7, 0.53, 1.2); canisterTrophy(0.7, 0.53, 1.2); canisterTrophy(-0.6, 1.35, 1.0); canisterTrophy(0.6, 1.35, 1.0);
    // golden door on a plinth
    B.add(box(0.28, 0.05, 0.14), M.wood, { p: [0, 0.53, 0.02], parent: f });
    B.add(box(0.2, 0.36, 0.03), M.gold, { p: [0, 0.74, 0.02], parent: f });
    B.add(sph(0.012), M.gold, { p: [0.07, 0.72, 0.045], parent: f, color: 0xffffff });
    B.add(box(0.26, 0.05, 0.14), M.wood, { p: [0, 1.35, 0.02], parent: f });
    B.add(sph(0.08, 16, 12), M.gold, { p: [0, 1.46, 0.02], parent: f });
    // on top: the contaminated sock, safely contained
    B.add(box(0.5, 0.06, 0.42), M.hazard, { p: [0, 2.23, 0], parent: f, uv: [0, 0, 1, 0.5] });
    B.add(new THREE.CapsuleGeometry(0.035, 0.16, 6, 12), M.cloth, { p: [-0.04, 2.36, 0], r: [0, 0, 1.3], parent: f });
    B.add(new THREE.CapsuleGeometry(0.035, 0.08, 6, 12), M.cloth, { p: [0.06, 2.31, 0], r: [0, 0, 0.2], parent: f });
    for (const x of [-0.1, -0.04]) B.add(new THREE.TorusGeometry(0.036, 0.008, 6, 16), M.cloth, { p: [x, 2.35 + (x + 0.1) * 0.2, 0], r: [0, Math.PI / 2, 1.3], parent: f, color: 0xc8102e });
    const caseGlass = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.38), new THREE.MeshPhysicalMaterial({ color: 0xd0f0ff, roughness: 0.05, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false }));
    caseGlass.applyMatrix4(f); caseGlass.translateY(2.43);
    group.add(caseGlass);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.06), new THREE.MeshBasicMaterial({ map: canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2c200'; g.font = 'bold 36px "JetBrains Mono", Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('EXHIBIT 2319 · DO NOT OPEN', w / 2, h / 2 + 2);
    }) }));
    label.applyMatrix4(f); label.translateY(2.23); label.translateZ(0.212);
    group.add(label);
  }

  // ---- the scream cooler ------------------------------------------------------------------
  {
    const f = frame(8.35, 0, -2.6, -Math.PI / 2);
    B.add(box(0.42, 0.95, 0.38), M.cloth, { p: [0, 0.475, 0], parent: f, color: 0xdedad2 });
    B.add(box(0.1, 0.06, 0.05), M.steel, { p: [0, 0.7, 0.21], parent: f });
    B.add(cyl(0.17, 0.18, 0.08, 20), M.yellow, { p: [0, 1.0, 0], parent: f });
    B.add(cyl(0.16, 0.16, 0.08, 20), M.yellow, { p: [0, 1.52, 0], parent: f });
    B.add(cyl(0.13, 0.13, 0.44, 20), M.screamGlow, { p: [0, 1.26, 0], parent: f });
    for (let i = 0; i < 4; i++) B.add(new THREE.ConeGeometry(0.035, 0.08, 10, 1, true), M.cloth, { p: [0.28, 0.9 - i * 0.02, 0], r: [Math.PI, 0, 0], parent: f });
  }

  B.build(group);

  // ---- behaviour -----------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  return {
    obstacles: [],
    // tap the door station
    doorHitTest(raycaster) { return raycaster.intersectObjects([doorMesh, knob, redLight], false).length > 0; },
    openDoor() {
      doorState.target = 1;
      doorState.closeAt = performance.now() + 4500;
    },
    get doorOpen() { return doorState.target > 0; },
    setBest(score) { board.draw(score); },
    update(dt, t, lookAt) {
      // closet door
      if (doorState.target && performance.now() > doorState.closeAt) doorState.target = 0;
      doorState.open += (doorState.target - doorState.open) * (1 - Math.exp(-5 * dt));
      hinge.rotation.y = -doorState.open * 1.6;
      redLight.material.emissiveIntensity = doorState.target ? 3 + Math.sin(t * 12) * 1.5 : 0;
      readerLed.material.color.setHex(doorState.target ? 0xff3030 : 0x40ff60);

      // eyeball lamps watch him; now and then they blink
      for (const l of eyeLamps) {
        if (lookAt) { tmp.copy(lookAt); l.eye.lookAt(tmp); }
        if (t > l.next && l.blink < 0) { l.blink = 0; l.next = t + 3 + rnd() * 6; }
        let b = 0;
        if (l.blink >= 0) { l.blink += dt; b = Math.sin(Math.min(1, l.blink / 0.18) * Math.PI); if (l.blink > 0.18) l.blink = -1; }
        l.lid.rotation.x = -0.9 + b * 1.1;
      }
      // pot plants sway, and occasionally snap at nothing
      for (const h of heads) {
        h.head.rotation.x = Math.sin(t * 0.9 + h.phase) * 0.12;
        h.head.rotation.z = Math.sin(t * 0.7 + h.phase * 2) * 0.1;
        let open = 0.25 + Math.sin(t * 1.3 + h.phase) * 0.12;
        if (t > h.snapAt && h.snap < 0) { h.snap = 0; h.snapAt = t + 6 + rnd() * 14; }
        if (h.snap >= 0) {
          h.snap += dt;
          open = h.snap < 0.35 ? 0.25 + (h.snap / 0.35) * 0.55 : Math.max(0, 0.8 - (h.snap - 0.35) * 8);
          if (h.snap > 0.6) h.snap = -1;
        }
        h.upper.rotation.x = -open;
        h.lower.rotation.x = open * 0.4;
      }
    },
  };
}
