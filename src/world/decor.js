// Furnishing the CEO's office: panelled walls, coffered ceiling, fireplace,
// bookshelves, family portraits, trophies, seating, doors and knick-knacks.
//
// Everything static is merged per material (a handful of draw calls in total)
// so the room stays cheap on phones. All textures are painted into canvases.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, rnd, woodPlanks } from './textures.js';

// ---------------------------------------------------------------------------
// batching: collect transformed geometry per material, merge at the end
// ---------------------------------------------------------------------------
export class Batch {
  constructor() { this.parts = new Map(); }
  add(geo, mat, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], color = null, uv = null, parent = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (uv) {
      const a = g.attributes.uv;
      for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * uv[2], uv[1] + a.getY(i) * uv[3]);
    }
    const c = new THREE.Color(color ?? 0xffffff);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    if (parent) m.premultiply(parent);
    g.applyMatrix4(m);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  }
  build(group, { cast = true } = {}) {
    for (const [mat, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = cast && !mat.userData.noShadow;
      mesh.receiveShadow = true;
      mesh.name = `decor:${mat.name}`;
      group.add(mesh);
    }
  }
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
export const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

// a transform for placing furniture against a wall and then offsetting locally
export const frame = (x, y, z, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));

// ---------------------------------------------------------------------------
// paintings and printed things
// ---------------------------------------------------------------------------
function portraitTex(variant) {
  return canvasTex(512, 640, (g, w, h) => {
    const bg = g.createRadialGradient(w * 0.5, h * 0.4, 40, w * 0.5, h * 0.5, w * 0.8);
    bg.addColorStop(0, variant === 1 ? '#5a4631' : '#3d4a3a'); bg.addColorStop(1, '#120d08');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // shoulders and suit
    g.fillStyle = '#1b1414';
    g.beginPath(); g.ellipse(w / 2, h * 1.02, w * 0.52, h * 0.36, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = variant === 1 ? '#6b1d1d' : '#8a2020';
    g.beginPath(); g.moveTo(w * 0.38, h * 0.72); g.lineTo(w / 2, h * 0.95); g.lineTo(w * 0.62, h * 0.72); g.fill();
    g.fillStyle = '#e8e2d2';
    g.beginPath(); g.moveTo(w * 0.43, h * 0.7); g.lineTo(w / 2, h * 0.84); g.lineTo(w * 0.57, h * 0.7); g.fill();
    // the family head: a warty grey dome with five eyes
    const skin = variant === 1 ? '#8e97a3' : '#7d8da0';
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(w / 2, h * 0.47, w * 0.27, h * 0.24, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(w / 2, h * 0.6, w * 0.3, h * 0.13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(w / 2 + (rnd() - 0.5) * w * 0.44, h * 0.3 + rnd() * h * 0.12, 2 + rnd() * 4, 0, Math.PI * 2); g.fill(); }
    const eyes = [[-0.11, 0.44, 13], [0.11, 0.44, 13], [0, 0.4, 10], [-0.21, 0.41, 10], [0.21, 0.41, 10]];
    for (const [ex, ey, er] of eyes) {
      g.fillStyle = '#f0ead8'; g.beginPath(); g.arc(w / 2 + ex * w, ey * h, er, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6e8a5a'; g.beginPath(); g.arc(w / 2 + ex * w, ey * h + 1, er * 0.55, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(w / 2 + ex * w, ey * h + 1, er * 0.25, 0, Math.PI * 2); g.fill();
    }
    // mouth, and a family-appropriate flourish
    g.strokeStyle = '#3a3a44'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w * 0.33, h * 0.555); g.quadraticCurveTo(w / 2, h * 0.535, w * 0.67, h * 0.555); g.stroke();
    if (variant === 1) { // the founder: monocle and mutton chops
      g.strokeStyle = '#d4af37'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2 + 0.11 * w, 0.44 * h, 20, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(w / 2 + 0.11 * w + 20, 0.44 * h); g.lineTo(w * 0.72, h * 0.66); g.stroke();
      g.fillStyle = '#e6e2da';
      g.beginPath(); g.ellipse(w * 0.24, h * 0.56, 34, 60, 0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(w * 0.76, h * 0.56, 34, 60, -0.2, 0, Math.PI * 2); g.fill();
    } else { // the second: a magnificent moustache
      g.fillStyle = '#d9d4ca';
      g.beginPath(); g.ellipse(w * 0.42, h * 0.52, 44, 14, 0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(w * 0.58, h * 0.52, 44, 14, -0.2, 0, Math.PI * 2); g.fill();
    }
    // painterly strokes and varnish
    for (let i = 0; i < 1800; i++) {
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '255,230,190' : '0,0,0'},${0.02 + rnd() * 0.03})`;
      g.lineWidth = 1 + rnd() * 3;
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
    }
    const v = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}

function plateTex(text) {
  return canvasTex(512, 96, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#e6c56a'); gr.addColorStop(1, '#8c6a1f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1c05'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function chartTex() {
  return canvasTex(768, 512, (g, w, h) => {
    g.fillStyle = '#ece3cc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2016'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center';
    g.fillText('SCREAM YIELD  ·  KILOWATTS PER DOOR', w / 2, 56);
    g.strokeStyle = '#8a7a60'; g.lineWidth = 2;
    for (let i = 0; i <= 5; i++) { const y = 100 + i * 64; g.beginPath(); g.moveTo(80, y); g.lineTo(w - 40, y); g.stroke(); }
    g.fillStyle = '#5a4a30'; g.font = '22px Georgia, serif';
    ['1970', '1980', '1990', '2000'].forEach((l, i) => g.fillText(l, 110 + i * 190, h - 40));
    g.strokeStyle = '#b3121f'; g.lineWidth = 7; g.beginPath();
    const pts = [[100, 130], [200, 120], [290, 150], [380, 170], [470, 230], [560, 260], [640, 340], [720, 400]];
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.fillStyle = '#b3121f'; g.font = 'italic bold 28px Georgia, serif'; g.fillText('?!', 736, 390);
  });
}

function spineAtlas() {
  const cols = ['#5b1a1a', '#1d3a2c', '#1d2a44', '#3b2a18', '#181818', '#6a4a1a', '#4a1d3a', '#2e4a4a'];
  return canvasTex(1024, 256, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      const x = i * 64;
      g.fillStyle = cols[i % cols.length]; g.fillRect(x, 0, 64, h);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 6, 0, 8, h);
      g.fillStyle = '#c9a24a';
      for (const y of [18, 26, h - 30, h - 22]) g.fillRect(x + 4, y, 56, 3);
      const titles = ['SCARING 101', 'ROAR!', 'CLOSETS', 'FEAR', 'QUOTAS', 'DOORS', 'MONSTROPOLIS', 'THE BIG SCARE', 'TOXIC TOTS', 'LURKING', 'GROWLS', 'SCREAM YIELD', 'UNDER THE BED', 'NIGHTSHIFT', 'CRAWLING', 'TENTACLES'];
      g.save(); g.translate(x + 40, h - 44); g.rotate(-Math.PI / 2);
      g.fillStyle = '#e8c870'; g.font = 'bold 20px Georgia, serif'; g.textAlign = 'left';
      g.fillText(titles[i], 0, 0, 170);
      g.restore();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 3, h); g.fillRect(x + 61, 0, 3, h);
    }
  }, { repeat: [1, 1] });
}

function globeTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#284a5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const cx = rnd() * w, cy = h * (0.2 + rnd() * 0.6), r = 30 + rnd() * 90;
      g.fillStyle = '#c9b27a';
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2, rr = r * (0.6 + rnd() * 0.5);
        g.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr);
      }
      g.fill();
    }
    g.strokeStyle = 'rgba(255,240,200,0.25)'; g.lineWidth = 2;
    for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo((i * w) / 12, 0); g.lineTo((i * w) / 12, h); g.stroke(); }
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, (i * h) / 6); g.lineTo(w, (i * h) / 6); g.stroke(); }
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(80,50,10,0.35)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(80,50,10,0.35)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}

function doorGlassTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = 'rgba(210,220,210,0.9)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.15})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    // lettering reads correctly from the corridor, so it is mirrored in here
    g.save(); g.translate(w, 0); g.scale(-1, 1);
    g.fillStyle = '#1a1406'; g.textAlign = 'center';
    g.font = 'bold 40px Georgia, serif'; g.fillText('OFFICE OF THE', w / 2, h * 0.36);
    g.font = 'bold 72px Georgia, serif'; g.fillText('C.E.O.', w / 2, h * 0.52);
    g.font = 'italic 30px Georgia, serif'; g.fillText('H. J. Waternoose III', w / 2, h * 0.66);
    g.restore();
  });
}

function clockTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a2016'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, c - 30, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2a2016'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    numerals.forEach((n, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; g.fillText(n, c + Math.cos(a) * (c - 80), c + Math.sin(a) * (c - 80)); });
    g.font = 'italic 26px Georgia, serif'; g.fillText('Monstropolis', c, c + 90);
  });
}

function damaskTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#16301f'; g.fillRect(0, 0, w, h);
    const motif = (cx, cy, s) => {
      g.save(); g.translate(cx, cy); g.scale(s, s);
      g.fillStyle = '#23462f';
      for (const m of [1, -1]) {
        g.save(); g.scale(m, 1);
        g.beginPath(); g.moveTo(0, -120);
        g.bezierCurveTo(60, -90, 80, -30, 30, 0);
        g.bezierCurveTo(90, 20, 70, 90, 0, 120);
        g.bezierCurveTo(20, 60, 10, 20, 0, 0);
        g.closePath(); g.fill();
        g.beginPath(); g.ellipse(45, -60, 12, 26, 0.6, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      g.fillStyle = '#2b5238'; g.beginPath(); g.ellipse(0, 0, 14, 30, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    motif(w / 2, h / 2, 1.1);
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) motif(x, y, 1.1);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
}

function wainscotTex() {
  return canvasTex(512, 256, (g, w, h) => {
    woodPlanks(g, w, h, [74, 38, 20], 1);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, h);
    // one raised panel per tile
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 10; g.strokeRect(40, 36, w - 80, h - 72);
    g.strokeStyle = 'rgba(255,190,130,0.12)'; g.lineWidth = 4; g.strokeRect(50, 46, w - 100, h - 92);
    g.fillStyle = 'rgba(255,200,150,0.05)'; g.fillRect(56, 52, w - 112, h - 104);
  });
}

// ---------------------------------------------------------------------------
export function buildDecor(group, { H, WZ, WX, WY0, WY1, lowPower = false }) {
  const B = new Batch();
  const tex = (t, rx = 1, ry = 1) => { t.repeat.set(rx, ry); return t; };

  // ---- materials ----------------------------------------------------------------
  const woodTex = canvasTex(512, 512, (g, w, h) => woodPlanks(g, w, h, [96, 52, 30], 4));
  const M = {
    wood: new THREE.MeshStandardMaterial({ name: 'wood', map: woodTex, vertexColors: true, roughness: 0.5 }),
    lacquer: new THREE.MeshPhysicalMaterial({ name: 'lacquer', map: woodTex, vertexColors: true, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    brass: new THREE.MeshStandardMaterial({ name: 'brass', color: 0xc9a24a, vertexColors: true, metalness: 1, roughness: 0.3 }),
    leather: new THREE.MeshPhysicalMaterial({ name: 'leather', color: 0x5a1a14, vertexColors: true, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: 0x8a4030 }),
    velvet: new THREE.MeshPhysicalMaterial({ name: 'velvet', color: 0x5c0d16, vertexColors: true, roughness: 0.85, sheen: 1, sheenColor: 0xd04050, sheenRoughness: 0.4, side: THREE.DoubleSide }),
    stone: new THREE.MeshPhysicalMaterial({ name: 'stone', color: 0xd9d0bf, vertexColors: true, roughness: 0.3, clearcoat: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ name: 'steel', color: 0x4a5058, vertexColors: true, metalness: 0.7, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ name: 'dark', color: 0x0d0a08, vertexColors: true, roughness: 0.8 }),
    plant: new THREE.MeshStandardMaterial({ name: 'plant', color: 0x2f5a2a, vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    ceramic: new THREE.MeshPhysicalMaterial({ name: 'ceramic', color: 0x1f3b4a, vertexColors: true, roughness: 0.2, clearcoat: 1 }),
    books: new THREE.MeshStandardMaterial({ name: 'books', map: spineAtlas(), vertexColors: true, roughness: 0.75 }),
    glow: new THREE.MeshStandardMaterial({ name: 'glow', color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 2.6 }),
    canister: new THREE.MeshPhysicalMaterial({ name: 'canister', color: 0xf2b705, vertexColors: true, metalness: 0.3, roughness: 0.4, clearcoat: 0.6 }),
    scream: new THREE.MeshStandardMaterial({ name: 'scream', color: 0x000000, emissive: 0xffb02a, emissiveIntensity: 2 }),
    shade: new THREE.MeshStandardMaterial({ name: 'shade', color: 0xe8d4a8, vertexColors: true, roughness: 0.9, emissive: 0x6a4a20, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    wallpaper: new THREE.MeshStandardMaterial({ name: 'wallpaper', map: tex(damaskTex()), vertexColors: true, roughness: 0.85 }),
    wainscot: new THREE.MeshStandardMaterial({ name: 'wainscot', map: tex(wainscotTex()), vertexColors: true, roughness: 0.45 }),
    ceiling: new THREE.MeshStandardMaterial({ name: 'ceiling', map: woodTex, color: 0x3a2518, vertexColors: true, roughness: 0.7 }),
  };
  M.glow.userData.noShadow = true;
  M.scream.userData.noShadow = true;
  M.wallpaper.userData.noShadow = true;
  M.wainscot.userData.noShadow = true;
  M.ceiling.userData.noShadow = true;
  M.velvet.userData.noShadow = false;

  // ---- walls: wainscot to 1.25m, damask above, mouldings --------------------------
  const DADO = 1.25;
  const wallPlane = (w, h, x, y, z, ry, mat, tileW, tileH) => {
    B.add(new THREE.PlaneGeometry(w, h), mat, { p: [x, y, z], r: [0, ry, 0], uv: [0, 0, w / tileW, h / tileH] });
  };
  const wall = (len, x, z, ry, from = 0, to = H) => {
    // len along the wall, centred on (x, z), facing into the room
    if (from < DADO) wallPlane(len, Math.min(DADO, to) - from, x, (from + Math.min(DADO, to)) / 2, z, ry, M.wainscot, 1.6, 1.25);
    if (to > DADO) wallPlane(len, to - Math.max(DADO, from), x, (Math.max(DADO, from) + to) / 2, z, ry, M.wallpaper, 1.2, 1.2);
    const f = frame(x, 0, z, ry);
    if (from < 0.2) B.add(box(len, 0.2, 0.04), M.lacquer, { p: [0, 0.1, 0.02], parent: f, color: 0x5a3a28 });
    if (from < DADO && to > DADO) B.add(box(len, 0.07, 0.06), M.lacquer, { p: [0, DADO, 0.03], parent: f, color: 0x6a4630 });
    if (to >= H) {
      B.add(box(len, 0.28, 0.12), M.lacquer, { p: [0, H - 0.14, 0.06], parent: f, color: 0x4a3020 });
      B.add(box(len, 0.08, 0.2), M.lacquer, { p: [0, H - 0.32, 0.1], parent: f, color: 0x5a3a28 });
    }
  };
  // side walls
  wall(14, -9, 1.8, Math.PI / 2);
  wall(14, 9, 1.8, -Math.PI / 2);
  // front wall
  wall(18, 0, 8.8, Math.PI);
  // back wall around the window
  wall(9 - WX, -(9 + WX) / 2, WZ, 0);
  wall(9 - WX, (9 + WX) / 2, WZ, 0);
  wall(WX * 2, 0, WZ, 0, WY1, H);
  wall(WX * 2, 0, WZ, 0, 0, WY0);

  // pilasters
  const pilaster = (x, z, ry) => {
    const f = frame(x, 0, z, ry);
    B.add(box(0.36, H - 0.5, 0.1), M.lacquer, { p: [0, (H - 0.5) / 2 + 0.2, 0.05], parent: f, color: 0x7a5236 });
    B.add(box(0.46, 0.3, 0.16), M.lacquer, { p: [0, 0.15, 0.08], parent: f, color: 0x5a3a28 });
    B.add(box(0.46, 0.22, 0.16), M.lacquer, { p: [0, H - 0.6, 0.08], parent: f, color: 0x5a3a28 });
  };
  // spaced to fall between the furniture on each wall
  const PIL_L = [-4.95, -1.35, 2.62, 5.9, 8.55], PIL_R = [-4.95, -2.6, 2.95, 8.55], PIL_F = [-8.55, -2.9, 2.9, 8.55];
  for (const z of PIL_L) pilaster(-8.99, z, Math.PI / 2);
  for (const z of PIL_R) pilaster(8.99, z, -Math.PI / 2);
  for (const x of PIL_F) pilaster(x, 8.79, Math.PI);
  for (const x of [-WX - 0.25, WX + 0.25]) pilaster(x, WZ + 0.01, 0);

  // coffered ceiling
  B.add(new THREE.PlaneGeometry(18, 14), M.ceiling, { p: [0, H - 0.001, 1.8], r: [Math.PI / 2, 0, 0], uv: [0, 0, 6, 5] });
  for (const x of [-6, -3, 0, 3, 6]) B.add(box(0.28, 0.32, 14), M.lacquer, { p: [x, H - 0.16, 1.8], color: 0x4a3020 });
  for (const z of [-2.2, 1.0, 4.2, 7.4]) B.add(box(18, 0.3, 0.28), M.lacquer, { p: [0, H - 0.15, z], color: 0x4a3020 });

  // ---- curtains at the window ------------------------------------------------------
  const curtain = (x0) => {
    const g = new THREE.PlaneGeometry(1.2, 6.6, 24, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / 1.2 + 0.5, v = pos.getY(i) / 6.6 + 0.5;
      pos.setZ(i, Math.sin(u * Math.PI * 7) * 0.07 * (0.6 + 0.4 * (1 - v)));
      pos.setX(i, pos.getX(i) * (0.8 + 0.2 * v));
    }
    g.computeVertexNormals();
    B.add(g, M.velvet, { p: [x0, 3.3, WZ + 0.35] });
    B.add(cyl(0.16, 0.16, 0.12, 16), M.velvet, { p: [x0, 2.2, WZ + 0.42], r: [Math.PI / 2, 0, 0], s: [3.2, 1, 1.3], color: 0xb0707a });
  };
  curtain(-WX - 0.35); curtain(WX + 0.35);
  B.add(cyl(0.04, 0.04, WX * 2 + 2.4, 12), M.brass, { p: [0, 6.62, WZ + 0.4], r: [0, 0, Math.PI / 2] });
  for (const x of [-WX - 1.2, WX + 1.2]) B.add(sph(0.08), M.brass, { p: [x, 6.62, WZ + 0.4] });

  // ---- left wall: bookshelves, fireplace, portrait -------------------------------------
  const bookshelf = (z) => {
    const f = frame(-8.72, 0, z, Math.PI / 2);
    const W = 2.5, Ht = 3.5, D = 0.5;
    B.add(box(W, Ht, 0.04), M.wood, { p: [0, Ht / 2, -D / 2 + 0.02], parent: f, color: 0x6a4a36 });
    for (const sx of [-1, 1]) B.add(box(0.08, Ht, D), M.lacquer, { p: [sx * (W / 2 - 0.04), Ht / 2, 0], parent: f, color: 0x8a5a3a });
    B.add(box(W + 0.2, 0.18, D + 0.1), M.lacquer, { p: [0, Ht + 0.09, 0.03], parent: f, color: 0x6a4530 });
    const shelves = [0.12, 0.8, 1.45, 2.1, 2.75];
    for (const y of shelves) B.add(box(W - 0.1, 0.05, D - 0.04), M.lacquer, { p: [0, y, 0], parent: f, color: 0x8a5a3a });
    for (let si = 0; si < shelves.length; si++) {
      let x = -W / 2 + 0.12;
      while (x < W / 2 - 0.2) {
        if (rnd() < 0.08) { x += 0.2; continue; } // gaps
        const t = 0.03 + rnd() * 0.045, hgt = 0.26 + rnd() * 0.16, d = 0.2 + rnd() * 0.08;
        const lean = rnd() < 0.06 ? 0.25 : 0;
        const i = Math.floor(rnd() * 16);
        B.add(box(t, hgt, d), M.books, { p: [x + t / 2, shelves[si] + 0.025 + hgt / 2, 0.05], r: [0, 0, lean], parent: f, uv: [i / 16, 0, 1 / 16, 1] });
        x += t + 0.004 + lean * 0.1;
      }
    }
    // an ornament or two
    B.add(sph(0.09), M.brass, { p: [0.7, 2.1 + 0.03 + 0.09, 0.05], parent: f });
    B.add(lathe([[0, 0], [0.08, 0], [0.1, 0.1], [0.06, 0.25], [0.09, 0.32], [0, 0.32]]), M.ceramic, { p: [-0.9, 3.5 + 0.18, 0], parent: f });
  };
  bookshelf(-2.9);
  bookshelf(4.3);

  // fireplace
  const fireZ = 0.65;
  {
    const f = frame(-8.8, 0, fireZ, Math.PI / 2);
    B.add(box(2.8, 1.7, 0.5), M.stone, { p: [0, 0.85, 0.2], parent: f });
    B.add(box(3.2, 0.14, 0.7), M.stone, { p: [0, 1.75, 0.3], parent: f, color: 0xece6da });
    B.add(box(3.0, 0.06, 1.0), M.stone, { p: [0, 0.03, 0.55], parent: f, color: 0xb8ae9c });
    B.add(box(1.4, 1.0, 0.52), M.dark, { p: [0, 0.6, 0.22], parent: f });
    // the firebox is a monster's mouth: fangs, carved eyes above, horned corbels
    const ivory = 0xefe6cc;
    [[-0.52, 0.22], [-0.3, 0.3], [-0.1, 0.26], [0.12, 0.3], [0.33, 0.24], [0.54, 0.2]].forEach(([x, l]) => B.add(new THREE.ConeGeometry(0.055, l, 10), M.stone, { p: [x, 1.1 - l / 2, 0.46], r: [Math.PI, 0, 0], parent: f, color: ivory }));
    [[-0.4, 0.16], [0, 0.2], [0.4, 0.16]].forEach(([x, l]) => B.add(new THREE.ConeGeometry(0.045, l, 10), M.stone, { p: [x, 0.1 + l / 2, 0.46], parent: f, color: ivory }));
    for (const sx of [-1, 1]) {
      B.add(sph(0.16, 20, 14), M.stone, { p: [sx * 0.95, 1.36, 0.4], s: [1, 0.8, 0.45], parent: f, color: 0xece6da });
      B.add(sph(0.07, 16, 10), M.dark, { p: [sx * 0.95, 1.36, 0.47], s: [1, 1, 0.3], parent: f, color: 0x3a6a4a });
      B.add(new THREE.ConeGeometry(0.1, 0.5, 12), M.stone, { p: [sx * 1.55, 2.02, 0.35], r: [0, 0, -sx * 0.55], parent: f, color: 0xd8cfbc });
    }
    // logs and fire irons
    for (const [x, rz] of [[-0.2, 0.2], [0.2, -0.25], [0, 0]]) B.add(cyl(0.07, 0.07, 0.9, 8), M.wood, { p: [x * 0.8, 0.22 + (x === 0 ? 0.12 : 0), 0.3], r: [0, 0, Math.PI / 2 + rz], parent: f, color: 0x2a1a10 });
    B.add(cyl(0.012, 0.012, 0.8, 6), M.brass, { p: [1.3, 0.4, 0.55], parent: f });
    B.add(cyl(0.012, 0.012, 0.75, 6), M.brass, { p: [1.38, 0.38, 0.55], parent: f });
    // mantel clock and candlesticks
    B.add(rbox(0.36, 0.3, 0.14, 0.03), M.lacquer, { p: [0, 1.97, 0.3], parent: f, color: 0x8a5a3a });
    B.add(cyl(0.1, 0.1, 0.02, 20), M.stone, { p: [0, 2.0, 0.375], r: [Math.PI / 2, 0, 0], parent: f, color: 0xf2ead8 });
    for (const x of [-1.1, 1.1]) {
      B.add(lathe([[0, 0], [0.07, 0], [0.05, 0.03], [0.02, 0.05], [0.025, 0.28], [0.045, 0.3], [0, 0.3]], 16), M.brass, { p: [x, 1.82, 0.3], parent: f });
      B.add(cyl(0.018, 0.018, 0.16, 8), M.stone, { p: [x, 2.2, 0.3], parent: f, color: 0xfff6e0 });
      B.add(sph(0.022, 8, 6), M.glow, { p: [x, 2.3, 0.3], s: [1, 1.6, 1], parent: f });
    }
  }
  // fire: layered animated flame sprites
  const fireMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 uv = vUv;
        float t = uTime;
        float q = n(vec2(uv.x * 5.0, uv.y * 3.0 - t * 2.2)) * 0.6 + n(vec2(uv.x * 11.0, uv.y * 7.0 - t * 4.0)) * 0.4;
        float shape = (1.0 - uv.y) * (1.0 - pow(abs(uv.x - 0.5) * 2.0, 1.6));
        float fl = smoothstep(0.25, 0.75, shape * 1.25 - q * 0.55 + 0.2);
        vec3 c = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.4), fl * fl) * fl * 2.2;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const fire = new THREE.Group();
  fire.position.set(-8.55, 0.25, fireZ);
  for (const ry of [Math.PI / 2, Math.PI / 2 + 0.6, Math.PI / 2 - 0.6]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), fireMat);
    p.position.y = 0.37; p.rotation.y = ry;
    fire.add(p);
  }
  group.add(fire);
  const fireLight = lowPower ? null : new THREE.PointLight(0xff7a2a, 3.5, 7, 2);
  if (fireLight) { fireLight.position.set(-8.1, 0.8, fireZ); group.add(fireLight); }

  // portraits
  const portrait = (x, y, z, ry, variant, name, w = 1.35, h = 1.7) => {
    const f = frame(x, y, z, ry);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: portraitTex(variant), roughness: 0.55 }));
    pm.applyMatrix4(f); pm.translateZ(0.06);
    group.add(pm);
    for (const [px, py, sw, sh] of [[0, h / 2 + 0.07, w + 0.28, 0.14], [0, -h / 2 - 0.07, w + 0.28, 0.14], [-w / 2 - 0.07, 0, 0.14, h], [w / 2 + 0.07, 0, 0.14, h]]) {
      B.add(box(sw, sh, 0.1), M.brass, { p: [px, py, 0.05], parent: f, color: 0xd8b060 });
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.12), new THREE.MeshStandardMaterial({ map: plateTex(name), metalness: 0.8, roughness: 0.3 }));
    plate.applyMatrix4(f); plate.translateY(-h / 2 - 0.26); plate.translateZ(0.03);
    group.add(plate);
    // picture light
    B.add(cyl(0.035, 0.035, w * 0.7, 12), M.brass, { p: [0, h / 2 + 0.22, 0.2], r: [0, 0, Math.PI / 2], parent: f });
    B.add(box(w * 0.68, 0.02, 0.05), M.glow, { p: [0, h / 2 + 0.19, 0.2], parent: f });
  };
  portrait(-8.98, 3.55, fireZ, Math.PI / 2, 1, 'H. J. WATERNOOSE I', 1.6, 2.0);
  portrait(8.98, 3.6, -1.2, -Math.PI / 2, 2, 'H. J. WATERNOOSE II');

  // side table with a decanter
  {
    const f = frame(-7.2, 0, 0.65, 0);
    B.add(cyl(0.38, 0.38, 0.05, 28), M.lacquer, { p: [0, 0.55, 0], parent: f, color: 0x8a5a3a });
    B.add(cyl(0.05, 0.08, 0.5, 12), M.lacquer, { p: [0, 0.28, 0], parent: f, color: 0x6a4530 });
    B.add(cyl(0.2, 0.26, 0.04, 20), M.lacquer, { p: [0, 0.02, 0], parent: f, color: 0x6a4530 });
  }

  // ---- right wall: cabinets, trophies, clock, chart, door ------------------------------
  for (const [z, drawers] of [[-4.3, 4], [-3.55, 4]]) {
    const f = frame(8.62, 0, z, -Math.PI / 2);
    B.add(box(0.7, 1.35, 0.65), M.steel, { p: [0, 0.675, 0], parent: f });
    for (let i = 0; i < drawers; i++) {
      const y = 0.2 + i * 0.32;
      B.add(box(0.62, 0.28, 0.02), M.steel, { p: [0, y, 0.33], parent: f, color: 0xa0a8b0 });
      B.add(box(0.18, 0.03, 0.04), M.brass, { p: [0, y + 0.05, 0.35], parent: f });
    }
  }
  // trophy cabinet
  const trophyZ = 1.6;
  {
    const f = frame(8.72, 0, trophyZ, -Math.PI / 2);
    B.add(box(2.2, 0.5, 0.55), M.lacquer, { p: [0, 0.25, 0], parent: f, color: 0x7a4e30 });
    B.add(box(2.2, 0.08, 0.55), M.lacquer, { p: [0, 2.16, 0], parent: f, color: 0x7a4e30 });
    for (const sx of [-1, 1]) B.add(box(0.06, 1.62, 0.55), M.lacquer, { p: [sx * 1.07, 1.31, 0], parent: f, color: 0x7a4e30 });
    B.add(box(2.1, 1.62, 0.02), M.wood, { p: [0, 1.31, -0.26], parent: f, color: 0x3a2418 });
    B.add(box(2.1, 0.03, 0.5), M.lacquer, { p: [0, 1.3, 0], parent: f, color: 0x7a4e30 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 1.62), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false }));
    glass.applyMatrix4(f); glass.translateY(1.31); glass.translateZ(0.28);
    group.add(glass);
  }
  // wall clock above the trophies (hands follow the game's clock)
  const clockGroup = new THREE.Group();
  clockGroup.applyMatrix4(frame(8.95, 3.75, trophyZ, -Math.PI / 2));
  group.add(clockGroup);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.4 }));
  face.position.z = 0.06;
  clockGroup.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 12, 48), M.brass);
  rim.position.z = 0.06;
  clockGroup.add(rim);
  const handMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.4 });
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.01), handMat);
  hourHand.geometry.translate(0, 0.11, 0);
  hourHand.position.z = 0.075;
  const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.4, 0.01), handMat);
  minHand.geometry.translate(0, 0.17, 0);
  minHand.position.z = 0.08;
  clockGroup.add(hourHand, minHand);

  // framed chart
  {
    const f = frame(8.97, 2.55, -3.92, -Math.PI / 2);
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ map: chartTex(), roughness: 0.8 }));
    cm.applyMatrix4(f); cm.translateZ(0.04);
    group.add(cm);
    for (const [px, py, sw, sh] of [[0, 0.44, 1.32, 0.08], [0, -0.44, 1.32, 0.08], [-0.64, 0, 0.08, 0.8], [0.64, 0, 0.08, 0.8]]) B.add(box(sw, sh, 0.05), M.dark, { p: [px, py, 0.03], parent: f, color: 0x333333 });
  }

  // ---- front wall: double doors, sofa, bar cart ------------------------------------
  {
    const f = frame(0, 0, 8.76, Math.PI);
    const w = 2.6, h = 3.3;
    for (const [px, py, sw, sh] of [[0, h + 0.14, w + 0.6, 0.28], [-w / 2 - 0.15, h / 2, 0.3, h], [w / 2 + 0.15, h / 2, 0.3, h]]) B.add(box(sw, sh, 0.14), M.lacquer, { p: [px, py, 0.07], parent: f, color: 0x6a4530 });
    for (const sx of [-1, 1]) {
      B.add(box(w / 2 - 0.02, h, 0.07), M.lacquer, { p: [sx * w / 4, h / 2, 0.035], parent: f, color: 0x8a5a3a });
      B.add(box(w / 2 - 0.34, 0.8, 0.03), M.lacquer, { p: [sx * w / 4, 0.6, 0.075], parent: f, color: 0x9a6a48 });
      B.add(cyl(0.02, 0.02, 0.45, 8), M.brass, { p: [sx * 0.12, 1.2, 0.14], parent: f });
    }
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 1.5), new THREE.MeshStandardMaterial({ map: doorGlassTex(), roughness: 0.2, emissive: 0x383020, emissiveIntensity: 0.5 }));
    gm.applyMatrix4(f); gm.translateY(2.1); gm.translateZ(0.08);
    group.add(gm);
  }
  // bar cart
  {
    const f = frame(5.0, 0, 8.2, Math.PI);
    for (const y of [0.3, 0.8]) B.add(box(1.1, 0.03, 0.5), M.lacquer, { p: [0, y, 0], parent: f, color: 0x3a2418 });
    for (const [x, z] of [[-0.53, -0.23], [0.53, -0.23], [-0.53, 0.23], [0.53, 0.23]]) B.add(cyl(0.015, 0.015, 0.85, 8), M.brass, { p: [x, 0.43, z], parent: f });
    for (const sx of [-1, 1]) B.add(new THREE.TorusGeometry(0.12, 0.015, 8, 20), M.brass, { p: [sx * 0.58, 0.12, 0.23], r: [0, Math.PI / 2, 0], parent: f });
    const liquor = new THREE.MeshPhysicalMaterial({ color: 0x8a4a10, roughness: 0.1, transparent: true, opacity: 0.85, clearcoat: 1 });
    const bottle = lathe([[0, 0], [0.07, 0], [0.075, 0.02], [0.075, 0.2], [0.03, 0.26], [0.02, 0.32], [0, 0.32]], 16);
    [[-0.3, 0], [0, 0.05], [0.28, -0.03]].forEach(([x, z], i) => {
      const m = new THREE.Mesh(bottle, i === 1 ? new THREE.MeshPhysicalMaterial({ color: 0x224a22, roughness: 0.1, transparent: true, opacity: 0.8, clearcoat: 1 }) : liquor);
      m.applyMatrix4(f); m.translateX(x); m.translateY(0.82); m.translateZ(z);
      group.add(m);
    });
    for (let i = 0; i < 4; i++) B.add(cyl(0.035, 0.03, 0.08, 12), M.stone, { p: [-0.35 + i * 0.12, 0.36, 0.1], parent: f, color: 0xeaf2f4 });
  }

  // ---- plants, globe, lamps -------------------------------------------------------------
  // globe on a stand
  const globeGroup = new THREE.Group();
  globeGroup.position.set(-6.4, 0, -3.3);
  group.add(globeGroup);
  {
    const f = frame(-6.4, 0, -3.3, 0.4);
    B.add(lathe([[0, 0], [0.3, 0], [0.32, 0.04], [0.08, 0.1], [0.05, 0.6], [0.08, 0.66], [0, 0.68]], 20), M.lacquer, { p: [0, 0, 0], parent: f, color: 0x7a4e30 });
    B.add(new THREE.TorusGeometry(0.4, 0.015, 8, 48), M.brass, { p: [0, 1.08, 0], r: [0, 0, 0.4], parent: f });
  }
  const globe = new THREE.Mesh(sph(0.37, 32, 20), new THREE.MeshPhysicalMaterial({ map: globeTex(), roughness: 0.35, clearcoat: 0.6 }));
  globe.position.y = 1.08; globe.rotation.z = 0.4;
  globe.castShadow = true;
  globeGroup.add(globe);

  // sconces, mounted on the pilasters
  const sconce = (x, y, z, ry) => {
    const f = frame(x, y, z, ry).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.1));
    B.add(box(0.12, 0.26, 0.03), M.brass, { p: [0, 0, 0.015], parent: f });
    B.add(cyl(0.012, 0.012, 0.22, 6), M.brass, { p: [0, 0.02, 0.12], r: [Math.PI / 2, 0, 0], parent: f });
    B.add(lathe([[0.02, 0], [0.07, 0.04], [0.09, 0.14], [0.085, 0.16]], 16), M.glow, { p: [0, 0.03, 0.22], parent: f });
  };
  for (const z of [-1.35, 2.62]) sconce(-8.97, 2.7, z, Math.PI / 2);
  for (const z of [-2.6, 2.95]) sconce(8.97, 2.7, z, -Math.PI / 2);
  for (const x of PIL_F.slice(1, 3)) sconce(x, 2.7, 8.77, Math.PI);

  // chandelier
  {
    const cz = 1.6, cy = 5.9;
    B.add(cyl(0.012, 0.012, 1.3, 6), M.brass, { p: [0, H - 0.65 - 0.3, cz] });
    B.add(lathe([[0, 0], [0.12, 0.02], [0.18, 0.14], [0.08, 0.3], [0.03, 0.42], [0, 0.44]], 20), M.brass, { p: [0, cy - 0.2, cz] });
    B.add(new THREE.TorusGeometry(0.75, 0.025, 8, 48), M.brass, { p: [0, cy - 0.05, cz], r: [Math.PI / 2, 0, 0] });
    B.add(new THREE.TorusGeometry(0.45, 0.02, 8, 36), M.brass, { p: [0, cy + 0.22, cz], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = Math.cos(a) * 0.75, pz = cz + Math.sin(a) * 0.75;
      B.add(cyl(0.05, 0.055, 0.05, 14), M.canister, { p: [px, cy + 0.03, pz] });
      B.add(cyl(0.04, 0.04, 0.16, 14), M.scream, { p: [px, cy + 0.14, pz] });
      B.add(cyl(0.05, 0.05, 0.04, 14), M.canister, { p: [px, cy + 0.24, pz] });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const px = Math.cos(a) * 0.45, pz = cz + Math.sin(a) * 0.45;
      B.add(cyl(0.04, 0.045, 0.04, 14), M.canister, { p: [px, cy + 0.28, pz] });
      B.add(cyl(0.032, 0.032, 0.13, 14), M.scream, { p: [px, cy + 0.37, pz] });
      B.add(cyl(0.04, 0.04, 0.035, 14), M.canister, { p: [px, cy + 0.45, pz] });
    }
    // crystal drops
    const crystal = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.5, emissive: 0x806040, emissiveIntensity: 0.3 });
    const drops = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.03), crystal, 36);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      m4.compose(new THREE.Vector3(Math.cos(a) * 0.73, cy - 0.12 - (i % 3) * 0.05, cz + Math.sin(a) * 0.73), new THREE.Quaternion(), new THREE.Vector3(1, 1.8, 1));
      drops.setMatrixAt(i, m4);
    }
    group.add(drops);
  }

  B.build(group);

  // ---- things he shouldn't walk through (world XZ circles) ----------------------------
  const obstacles = [
    { x: -4.1, z: -2.7, r: 1.4 }, // desk
    { x: 4.3, z: -2.6, r: 1.3 }, // canister rack
    { x: -6.4, z: -3.3, r: 0.5 }, // globe
  ];

  return {
    obstacles,
    // hours/minutes as fractional numbers
    setClock(hours, minutes) {
      minHand.rotation.z = -(minutes / 60) * Math.PI * 2;
      hourHand.rotation.z = -(((hours % 12) + minutes / 60) / 12) * Math.PI * 2;
    },
    // lamps, sconces and the chandelier brighten as the city's power returns
    setPower(e, flicker = 1) {
      M.glow.emissiveIntensity = (0.35 + 2.6 * e) * flicker;
      M.shade.emissiveIntensity = (0.1 + 0.6 * e) * flicker;
      M.scream.emissiveIntensity = (0.2 + 3.2 * e) * flicker;
    },
    update(dt, t) {
      fireMat.uniforms.uTime.value = t;
      if (fireLight) fireLight.intensity = 3.2 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.5 + Math.sin(t * 23.1) * 0.25;
      globe.rotation.y += dt * 0.08;
    },
  };
}
