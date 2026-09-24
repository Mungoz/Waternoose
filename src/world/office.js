// The CEO's office at night, overlooking a Monstropolis in a power crisis.
// All textures are painted into canvases at startup.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { NOISE_GLSL } from '../character/materials.js';
import { canvasTex, rnd, woodPlanks } from './textures.js';
import { buildDecor } from './decor.js';
import { buildThemed } from './themed.js';

export function buildOffice(renderer, scene, opts = {}) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- image based lighting -------------------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.25;

  // ---- floor -----------------------------------------------------------------
  const floorTex = canvasTex(1024, 1024, (g, w, h) => woodPlanks(g, w, h, [92, 50, 28]), { repeat: [3, 3] });
  const floorMat = new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1;
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // monogrammed rug
  const rugTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#123a34'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9000; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c;
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '60,120,100'},0.12)`;
      g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 2);
    }
    g.strokeStyle = '#c9a24a'; g.lineWidth = 22; g.beginPath(); g.arc(c, c, c - 40, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.arc(c, c, c - 80, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.save(); g.translate(c + Math.cos(a) * (c - 60), c + Math.sin(a) * (c - 60)); g.rotate(a);
      g.fillStyle = '#c9a24a'; g.fillRect(-6, -12, 12, 24); g.restore();
    }
    g.lineWidth = 5; g.beginPath(); g.arc(c, c, 190, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#c9a24a';
    g.font = 'italic bold 230px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('W', c, c + 12);
  });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.7, 96), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.004;
  rug.receiveShadow = true;
  group.add(rug);

  // ---- window wall (the rest of the room is furnished in decor.js) ----------------
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.4, metalness: 0.6 });
  const box = (w, h, d, x, y, z, mat, cast = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = cast;
    group.add(m);
    return m;
  };
  const WZ = -5.2; // window wall
  const WX = 5.6, WY0 = 0.55, WY1 = 5.6, H = 7.5;
  // window frame & mullions
  box(WX * 2 + 0.3, 0.18, 0.3, 0, WY0, WZ, frameMat);
  box(WX * 2 + 0.3, 0.18, 0.3, 0, WY1, WZ, frameMat);
  for (let i = 0; i <= 6; i++) box(0.09, WY1 - WY0, 0.14, -WX + (i * WX * 2) / 6, (WY0 + WY1) / 2, WZ, frameMat);
  box(WX * 2, 0.06, 0.1, 0, 3.4, WZ, frameMat);
  // window sill / radiator cabinet
  box(WX * 2 + 0.4, 0.5, 0.55, 0, 0.25, WZ + 0.3, new THREE.MeshStandardMaterial({ color: 0x1e120b, roughness: 0.5 }), true);
  // faint glass reflection
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WX * 2, WY1 - WY0), new THREE.MeshPhysicalMaterial({
    color: 0x9fb4ff, roughness: 0.04, transparent: true, opacity: 0.06, metalness: 0, envMapIntensity: 1.5, depthWrite: false,
  }));
  glass.position.set(0, (WY0 + WY1) / 2, WZ - 0.02);
  group.add(glass);

  const decor = buildDecor(group, { H, WZ, WX, WY0, WY1, lowPower: opts.lowPower });
  const themed = buildThemed(group, { WZ });
  let lookAt = null;

  // ---- skyline -------------------------------------------------------------------
  const skyUniforms = { uEnergy: { value: 0 }, uTime: { value: 0 }, uDay: { value: 0 }, uVillain: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uEnergy, uTime, uDay, uVillain; varying vec3 vDir;
      ${NOISE_GLSL}
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 zen = mix(vec3(0.004,0.006,0.02), vec3(0.12,0.28,0.65), uDay);
        vec3 hor = mix(vec3(0.03,0.035,0.08), vec3(0.75,0.72,0.7), uDay);
        vec3 c = mix(hor, zen, smoothstep(0.0, 0.5, h));
        // city glow on the horizon
        c += vec3(1.0, 0.5, 0.18) * (0.02 + 0.22 * uEnergy) * exp(-max(h, 0.0) * 12.0) * (1.0 - uDay);
        c = mix(c, c * vec3(1.6, 0.3, 0.3) + vec3(0.04, 0.0, 0.0) * exp(-max(h,0.0)*6.0), uVillain);
        // clouds
        float cl = fbm3(vec3(d.xz / max(d.y, 0.05) * 1.2, uTime * 0.01)) * 0.5 + 0.5;
        c = mix(c, c * 0.5 + vec3(0.04,0.04,0.06) * (1.0 - uDay) + vec3(0.9) * uDay * 0.5, smoothstep(0.55, 0.85, cl) * smoothstep(0.02, 0.2, h) * 0.8);
        // stars & moon
        vec3 sp = floor(d * 380.0);
        float st = step(0.9975, hash(sp)) * smoothstep(0.05, 0.3, h) * (1.0 - uDay) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(sp + 3.0) * 20.0));
        c += st * 0.7;
        vec3 md = normalize(vec3(-0.45, 0.32, -1.0));
        float m = dot(d, md);
        c += vec3(1.0, 0.95, 0.85) * (smoothstep(0.9993, 0.9995, m) * 3.0 + pow(max(m, 0.0), 300.0) * 0.4) * (1.0 - uDay);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false;
  group.add(sky);

  // buildings: one instanced box, windows drawn in the shader
  const N = 900;
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const cityUniforms = { uEnergy: skyUniforms.uEnergy, uTime: skyUniforms.uTime, uDay: skyUniforms.uDay, uVillain: skyUniforms.uVillain };
  const bMat = new THREE.ShaderMaterial({
    uniforms: cityUniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aInfo; // seed, window density, style, flicker
      // flat: per-instance values must not be interpolated, or the hash below turns float wobble into static
      varying vec3 vLocal; flat varying vec3 vScale; flat varying vec4 vInfo; varying vec3 vN; varying float vDist;
      void main(){
        vLocal = position; vInfo = aInfo; vN = normal;
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uEnergy, uTime, uDay, uVillain;
      varying vec3 vLocal; flat varying vec3 vScale; flat varying vec4 vInfo; varying vec3 vN; varying float vDist;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 an = abs(vN);
        vec2 uv = an.x > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y) : an.z > 0.5 ? vec2(vLocal.x * vScale.x, vLocal.y * vScale.y) : vec2(0.0);
        // each tower gets its own window rhythm
        vec2 cellSize = vec2(1.2 + vInfo.z * 1.4, 1.7 + fract(vInfo.x * 7.0) * 0.9);
        vec2 cell = uv / cellSize;
        vec2 id = floor(cell); vec2 f = fract(cell);
        float mx = 0.12 + 0.2 * fract(vInfo.y * 13.0), my = 0.18 + 0.12 * fract(vInfo.w * 5.0);
        float win = step(mx, f.x) * step(f.x, 1.0 - mx) * step(my, f.y) * step(f.y, 1.0 - my) * step(0.5, an.x + an.z);
        // filter the window grid down to its average once cells get smaller than a few pixels
        float fw = max(fwidth(cell.x), fwidth(cell.y));
        float detail = 1.0 - smoothstep(0.015, 0.045, fw);
        float r = hash(vec3(id, vInfo.x * 91.0 + (an.x > 0.5 ? 7.0 : 0.0)));
        float thresh = uEnergy * 0.85 + 0.03;
        // rolling brownouts: flicker when power is low
        float flick = step(0.5, sin(uTime * (3.0 + vInfo.w * 9.0) + vInfo.x * 40.0)) * (1.0 - smoothstep(0.1, 0.6, uEnergy));
        float lit = step(r, thresh) * (1.0 - flick * step(0.6, vInfo.w));
        vec3 warm = mix(vec3(1.0, 0.72, 0.36), vec3(0.8, 0.9, 1.0), step(0.8, hash(vec3(id.yx, vInfo.x))));
        warm = mix(warm, vec3(1.0, 0.15, 0.1), uVillain * 0.7);
        vec3 base = mix(vec3(0.012, 0.014, 0.022), vec3(0.28, 0.3, 0.34) * (0.6 + 0.4 * vInfo.z), uDay);
        vec3 dark = mix(vec3(0.016, 0.019, 0.034), vec3(0.35, 0.45, 0.6), uDay);
        vec3 c = base;
        float winA = mix(0.36 * step(0.5, an.x + an.z), win, detail);
        float litA = mix(thresh, lit, detail);
        c = mix(c, dark, winA);
        // lit rooms: warm, with a gradient like a ceiling light
        float room = mix(1.0, 0.65 + 0.5 * f.y, detail);
        c += winA * litA * warm * (0.55 + 0.5 * mix(0.5, r, detail)) * room * (1.0 - uDay * 0.85);
        // roof edge + aviation beacons
        float top = step(0.995, vLocal.y) * step(0.93, vInfo.y);
        c += top * vec3(3.0, 0.1, 0.05) * step(0.0, sin(uTime * 2.0 + vInfo.x * 10.0));
        // atmospheric perspective
        float fog = 1.0 - exp(-vDist * 0.011);
        vec3 fogC = mix(vec3(0.03, 0.035, 0.08) + vec3(0.25, 0.12, 0.05) * uEnergy * 0.4, vec3(0.7, 0.72, 0.75), uDay);
        c = mix(c, fogC, fog * 0.85);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const city = new THREE.InstancedMesh(bGeo, bMat, N);
  const info = new Float32Array(N * 4);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const zRow = rnd();
    const z = -34 - zRow * zRow * 170;
    const spread = 40 + (-z) * 1.3;
    const x = (rnd() - 0.5) * spread * 2;
    const hgt = (8 + rnd() ** 2.2 * 70) * (1 - zRow * 0.3) * (Math.abs(x) < 30 ? 1.2 : 1);
    const w = 6 + rnd() * 12, d = 6 + rnd() * 12;
    m4.compose(new THREE.Vector3(x, -18, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.3), new THREE.Vector3(w, hgt + 18, d));
    city.setMatrixAt(i, m4);
    info.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  bGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  city.frustumCulled = false;
  group.add(city);

  // ---- desk -------------------------------------------------------------------------
  const deskTex = canvasTex(1024, 512, (g, w, h) => woodPlanks(g, w, h, [70, 30, 16], 3));
  const deskMat = new THREE.MeshPhysicalMaterial({ map: deskTex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  const desk = new THREE.Group();
  desk.position.set(-4.1, 0, -2.7);
  desk.rotation.y = 0.45;
  group.add(desk);
  const dbox = (w, h, d, x, y, z, mat = deskMat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; desk.add(m); return m;
  };
  dbox(2.6, 0.09, 1.2, 0, 0.9, 0);
  dbox(0.7, 0.86, 1.1, -0.9, 0.43, 0);
  dbox(0.7, 0.86, 1.1, 0.9, 0.43, 0);
  dbox(1.1, 0.5, 0.05, 0, 0.6, -0.5);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.28 });
  for (const x of [-0.9, 0.9]) for (const y of [0.25, 0.55, 0.8]) dbox(0.14, 0.025, 0.02, x, y, 0.56, brass);
  // banker's lamp
  const lamp = new THREE.Group();
  lamp.position.set(0.8, 0.945, -0.25);
  desk.add(lamp);
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 32), brass); lamp.add(lb);
  const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 12), brass); lp.position.y = 0.18; lamp.add(lp);
  const shadeMat = new THREE.MeshPhysicalMaterial({ color: 0x0f5a2a, roughness: 0.15, clearcoat: 1, emissive: 0x114422, emissiveIntensity: 0.2, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 32, 1, true, 0, Math.PI), shadeMat);
  shade.rotation.z = Math.PI / 2; shade.rotation.y = Math.PI / 2; shade.position.y = 0.36; shade.castShadow = true;
  lamp.add(shade);
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
  bulb.rotation.z = Math.PI / 2; bulb.position.y = 0.33; lamp.add(bulb);
  const lampLight = new THREE.PointLight(0xffc27a, 2.5, 7, 2);
  lampLight.position.set(0, 0.25, 0);
  lamp.add(lampLight);
  // nameplate
  const plateTex = canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#b8923e'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1306'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('H. J. WATERNOOSE III', w / 2, h * 0.42);
    g.font = '32px Georgia, serif'; g.fillText('CHIEF EXECUTIVE OFFICER', w / 2, h * 0.8);
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.03), [brass, brass, brass, brass, new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.8, roughness: 0.3 }), brass]);
  plate.position.set(-0.3, 1.0, 0.45); plate.rotation.x = -0.35; plate.castShadow = true;
  desk.add(plate);
  // the desk phone (the board calls on it)
  const bakelite = new THREE.MeshPhysicalMaterial({ color: 0x0c0b0b, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
  const phone = new THREE.Group();
  phone.position.set(0.25, 0.945, -0.02);
  phone.rotation.y = -0.35;
  desk.add(phone);
  const pbase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 32), bakelite);
  pbase.position.y = 0.04; pbase.scale.z = 0.8;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 32), new THREE.MeshStandardMaterial({ color: 0xd8d0bc, metalness: 0.3, roughness: 0.4 }));
  dial.position.set(0, 0.075, 0.055); dial.rotation.x = 0.5;
  const handset = new THREE.Group();
  handset.position.y = 0.105;
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.2, 6, 16), bakelite);
  bar.rotation.z = Math.PI / 2;
  const cupA = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 12), bakelite); cupA.position.x = -0.11; cupA.scale.y = 0.7;
  const cupB = cupA.clone(); cupB.position.x = 0.11;
  handset.add(bar, cupA, cupB);
  const phoneLight = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), new THREE.MeshBasicMaterial({ color: 0x220000 }));
  phoneLight.position.set(0.08, 0.07, 0.06);
  for (const m of [pbase, dial, bar, cupA, cupB]) { m.castShadow = true; m.receiveShadow = true; }
  phone.add(pbase, dial, handset, phoneLight);

  // a stack of quarterly reports
  for (let i = 0; i < 6; i++) dbox(0.32, 0.012, 0.42, -0.9 + (rnd() - 0.5) * 0.02, 0.955 + i * 0.013, 0.1 + (rnd() - 0.5) * 0.02, new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe8e2d0 : 0xd8d0b8, roughness: 0.9 }));

  // ---- scream canisters ---------------------------------------------------------------
  const canisters = [];
  const rack = new THREE.Group();
  rack.position.set(4.3, 0, -2.6);
  rack.rotation.y = -0.5;
  group.add(rack);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.9, roughness: 0.35 });
  const rb = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; rack.add(m); };
  rb(2.3, 0.06, 0.55, 0, 0.35, 0); rb(2.3, 0.06, 0.55, 0, 1.55, 0);
  for (const x of [-1.12, 1.12]) for (const z of [-0.24, 0.24]) rb(0.05, 1.6, 0.05, x, 0.8, z);
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0xf2b705, metalness: 0.4, roughness: 0.38, clearcoat: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false });
  const energyMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: skyUniforms.uTime },
    vertexShader: `attribute float fill; varying vec3 vP; varying float vFill; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vFill = fill; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vP; varying float vFill; varying vec3 vN; varying vec3 vV;
      ${NOISE_GLSL}
      void main(){
        float h = vP.y / 0.62 + 0.5;
        float level = vFill;
        float surf = level + 0.02 * sin(uTime * 4.0 + vP.x * 40.0);
        if (h > surf) discard;
        float sw = snoise(vec3(vP.x * 14.0, vP.y * 8.0 - uTime * 1.5, vP.z * 14.0 + uTime * 0.6));
        float rim = pow(1.0 - abs(dot(vN, vV)), 1.5);
        vec3 c = mix(vec3(1.0, 0.55, 0.05), vec3(1.0, 0.95, 0.5), sw * 0.5 + 0.5) * (1.2 + rim * 2.0);
        c += vec3(1.0, 0.9, 0.6) * smoothstep(surf - 0.04, surf, h) * 2.0;
        gl_FragColor = vec4(c * (0.6 + 0.4 * sw) * step(0.001, level), 1.0);
      }`,
  });
  for (let i = 0; i < 5; i++) {
    const cg = new THREE.Group();
    cg.position.set(-0.86 + i * 0.43, 0.38, 0);
    rack.add(cg);
    const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.14, 40), capMat); cap1.position.y = 0.07;
    const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.14, 40), capMat); cap2.position.y = 0.83;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.08, 24), steel); knob.position.y = 0.94;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 12, 40), steel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.45;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.62, 40, 1, true), glassMat); tube.position.y = 0.45;
    const eg = new THREE.CylinderGeometry(0.12, 0.12, 0.62, 32, 8);
    eg.setAttribute('fill', new THREE.BufferAttribute(new Float32Array(eg.attributes.position.count), 1));
    const energy = new THREE.Mesh(eg, energyMat); energy.position.y = 0.45;
    for (const m of [cap1, cap2, knob, ring]) { m.castShadow = true; m.receiveShadow = true; }
    cg.add(cap1, cap2, knob, ring, energy, tube);
    canisters.push({ group: cg, energy, fill: 0 });
  }
  const canLight = new THREE.PointLight(0xffb030, 0, 6, 2);
  canLight.position.set(0, 1.0, 0.6);
  rack.add(canLight);

  // ---- dust motes in the light --------------------------------------------------------
  const DN = 700;
  const dp = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) dp.set([(rnd() - 0.5) * 9, rnd() * 5, (rnd() - 0.5) * 8], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: skyUniforms.uTime, uGain: { value: 1 } },
    vertexShader: `uniform float uTime; varying float vA;
      void main(){ vec3 p = position; float s = fract(sin(dot(p, vec3(12.9,78.2,37.7))) * 43758.5);
        p += vec3(sin(uTime*0.13+s*20.0), sin(uTime*0.07+s*9.0)*0.6 + fract(uTime*0.01+s)*0.0, cos(uTime*0.11+s*14.0)) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = min((0.8 + s * 1.6) * 9.0 / -mv.z, 7.0); vA = 0.25 + 0.75 * s; }`,
    fragmentShader: `uniform float uGain; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a * vA * 0.5 * uGain, 1.0); }`,
  }));
  dust.frustumCulled = false;
  group.add(dust);

  // ---- lights ---------------------------------------------------------------------
  const key = new THREE.SpotLight(0xffd2a0, 160, 0, 0.5, 0.75, 2);
  key.position.set(3.2, 7.0, 5.0);
  key.target.position.set(0, 1.4, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 20;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x8fb0ff, 1.4);
  rim.position.set(-2, 4.5, -8);
  rim.castShadow = true;
  rim.shadow.mapSize.set(1024, 1024);
  rim.shadow.camera.left = -4; rim.shadow.camera.right = 4; rim.shadow.camera.top = 4; rim.shadow.camera.bottom = -1;
  rim.shadow.bias = -0.0004; rim.shadow.normalBias = 0.03;
  scene.add(rim);

  const fill = new THREE.HemisphereLight(0x3a4466, 0x2a1a10, 0.35);
  scene.add(fill);

  const under = new THREE.SpotLight(0xff2010, 0, 0, 0.6, 0.8, 2);
  under.position.set(0.5, 0.15, 3.2);
  under.target.position.set(0, 2.3, 0);
  scene.add(under, under.target);

  const PRESETS = {
    night: { exposure: 1.0, key: [0xffd2a0, 135], rim: [0x8fb0ff, 1.4], fill: [0x3a4466, 0x2a1a10, 0.35], under: 0, env: 0.25, day: 0, villain: 0 },
    boardroom: { exposure: 0.85, key: [0xfff1e0, 120], rim: [0xfff4e6, 3.2], fill: [0xbcd4ff, 0x5a4a3a, 1.0], under: 0, env: 0.7, day: 1, villain: 0 },
    villain: { exposure: 1.0, key: [0x8090ff, 30], rim: [0xff3020, 1.8], fill: [0x200505, 0x000000, 0.15], under: 55, env: 0.08, day: 0, villain: 1 },
    studio: { exposure: 0.85, key: [0xffffff, 95], rim: [0xffffff, 2.6], fill: [0x8090a0, 0x303030, 0.7], under: 0, env: 0.55, day: 0, villain: 0 },
  };
  const state = { preset: 'night', cur: { ...PRESETS.night }, energy: 0 };
  const fxs = { surge: 0, brown: 0 };
  state.keyBase = PRESETS.night.key[1];
  const colA = new THREE.Color(), colB = new THREE.Color();
  function applyPreset(dt) {
    const P = PRESETS[state.preset];
    const k = 1 - Math.exp(-3 * dt);
    const lerpCol = (light, hex) => { colB.setHex(hex); light.color.lerp(colB, k); };
    lerpCol(key, P.key[0]); state.keyBase += (P.key[1] - state.keyBase) * k;
    lerpCol(rim, P.rim[0]); rim.intensity += (P.rim[1] * (0.75 + 0.35 * state.energy) - rim.intensity) * k;
    colA.setHex(P.fill[0]); fill.color.lerp(colA, k); colA.setHex(P.fill[1]); fill.groundColor.lerp(colA, k);
    fill.intensity += (P.fill[2] - fill.intensity) * k;
    under.intensity += (P.under - under.intensity) * k;
    scene.environmentIntensity += (P.env - scene.environmentIntensity) * k;
    skyUniforms.uDay.value += (P.day - skyUniforms.uDay.value) * k;
    skyUniforms.uVillain.value += (P.villain - skyUniforms.uVillain.value) * k;
    renderer.toneMappingExposure += (P.exposure - renderer.toneMappingExposure) * k;
  }

  return {
    group, floor, canisters, key, rim, fill, under,
    phone: { group: phone, handset, light: phoneLight },
    obstacles: [...decor.obstacles, { x: 8.3, z: 5.9, r: 1.0 }],
    setClock: decor.setClock,
    themed,
    // where the eyeball lamps should look
    setLookTarget(v) { lookAt = v; },
    // far-away things that must stay out of screen-space AO (depth precision noise)
    noAO: [sky, city, dust],
    setPreset(name) { if (PRESETS[name]) state.preset = name; },
    get preset() { return state.preset; },
    // fx: { surge 0..1, brownout 0..1 } from the game's event system
    update(dt, t, energy, fx = {}) {
      state.energy = energy;
      skyUniforms.uTime.value = t;
      const k = 1 - Math.exp(-2 * dt);
      fxs.surge += ((fx.surge || 0) - fxs.surge) * (1 - Math.exp(-5 * dt));
      fxs.brown += ((fx.brownout || 0) - fxs.brown) * (1 - Math.exp(-6 * dt));
      // brownouts black out chunks of the skyline and flicker the room
      const flicker = fxs.brown > 0.05 ? (Math.sin(t * 37) * Math.sin(t * 13.7) > 0.3 ? 0.25 : 1) : 1;
      skyUniforms.uEnergy.value += (energy * (1 - 0.85 * fxs.brown) - skyUniforms.uEnergy.value) * k;
      applyPreset(dt);
      key.intensity = state.keyBase * (1 - fxs.brown * 0.45 * (2 - flicker)) * (1 + fxs.surge * 0.35 * (0.5 + 0.5 * Math.sin(t * 29)));
      const e = skyUniforms.uEnergy.value;
      canisters.forEach((c, i) => {
        const f = THREE.MathUtils.clamp(energy * 5 - i, 0, 1);
        c.fill += (f - c.fill) * (1 - Math.exp(-4 * dt));
        const a = c.energy.geometry.attributes.fill;
        if (Math.abs(a.array[0] - c.fill) > 1e-4) { a.array.fill(c.fill); a.needsUpdate = true; }
      });
      canLight.intensity = (0.2 + e * 5 * (1 + 0.1 * Math.sin(t * 13))) * (1 + fxs.surge * 1.2) * flicker;
      decor.setPower(e, flicker);
      decor.update(dt, t);
      themed.update(dt, t, lookAt);
      lampLight.intensity = 2.5 * (skyUniforms.uVillain.value > 0.5 ? 0.3 : 1);
    },
  };
}
