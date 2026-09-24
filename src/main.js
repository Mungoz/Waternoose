import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { buildWaternoose, PART_NAMES } from './character/waternoose.js';
import { WaternooseRig } from './character/rig.js';
import { charUniforms } from './character/materials.js';
import { buildOffice } from './world/office.js';
import { AudioEngine } from './audio/audio.js';
import { LINES, pickLine } from './lines.js';
import { createAchievements } from './features/achievements.js';
import { createGrading, gradeFor } from './features/grading.js';
import { createDrive } from './features/drive.js';
import { createEvents } from './features/events.js';
import { createPhoto } from './features/photo.js';
import { createPhone } from './features/phone.js';
import { createShifts } from './features/shifts.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const AUTO = params.has('shot'); // headless screenshot mode: no audio, no loader click
const coarse = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
// integrated / mobile GPUs get a coarser sculpt and no GTAO
const gpuName = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch { return ''; }
})();
const weakGPU = coarse || /intel|iris|uhd|hd graphics|mali|adreno|powervr|swiftshader|llvmpipe|apple gpu/i.test(gpuName);
const QUALITY = Number(params.get('q')) || (coarse ? 1.6 : weakGPU ? 1.3 : 1);

window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));
function showError(err) {
  const el = $('#error');
  el.textContent = `Something broke: ${err && err.stack ? err.stack : err}`;
  el.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// renderer, scene, camera
// ---------------------------------------------------------------------------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: AUTO });
const DPR = Math.min(devicePixelRatio, coarse ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
renderer.shadowMap.autoUpdate = false; // refreshed once per frame in loop(), not once per pass

const scene = new THREE.Scene();
// keep roughly the same horizontal framing on tall (phone) screens
const fovFor = (aspect) => (aspect >= 1.3 ? 32 : Math.min(75, 32 + (1.3 - aspect) * 48));
const camera = new THREE.PerspectiveCamera(fovFor(innerWidth / innerHeight), innerWidth / innerHeight, 0.05, 1200);
camera.position.set(1.4, 2.3, 6.4);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.55, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 0.9;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.53;
controls.autoRotateSpeed = 0.8;
controls.update();

// ---------------------------------------------------------------------------
// post
// ---------------------------------------------------------------------------
const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const sanitize = new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, vec3(0.0), vec3(48.0)), 1.0); }`,
});
composer.addPass(sanitize);
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
gtao.blendIntensity = 0.9;
gtao.enabled = !weakGPU;
if (!gtao.enabled) document.querySelector('.seg[data-key="fx"] button[data-v="ao"]')?.classList.remove('on');
// keep the shadow-only proxy meshes out of GTAO's depth/normal prepass
const gtaoHide = gtao._overrideVisibility.bind(gtao);
gtao._overrideVisibility = function () {
  gtaoHide();
  for (const p of [...(ch?.shadowProxies || []), ...office.noAO]) if (p.visible) { p.visible = false; this._visibilityCache.push(p); }
};
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.55, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.045 }, uVignette: { value: 1 },
    uCA: { value: 0.0022 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uCA; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - d * uCA * r2 * 4.0).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + d * uCA * r2 * 4.0).b;
      float v = smoothstep(0.95, 0.22, length(d * vec2(1.0, 0.85)));
      c *= mix(1.0, v, 0.55 * uVignette);
      float g = hash(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      c += g * uGrain * (1.0 - dot(c, vec3(0.3)) * 0.6);
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(finish);

// ---------------------------------------------------------------------------
// world
// ---------------------------------------------------------------------------
const office = buildOffice(renderer, scene, { lowPower: weakGPU });
const audio = new AudioEngine();
AudioEngine.prefetchVoice(); // start downloading his lines while the sculpt runs

let ch = null, rig = null;
const loaderLog = $('#log');
function logLine(name, info, right) {
  const li = document.createElement('li');
  li.innerHTML = `<b>${name}</b><span>${info}</span><span>${right}</span>`;
  loaderLog.appendChild(li);
  while (loaderLog.children.length > 12) loaderLog.firstChild.remove();
}

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n));

async function init() {
  logLine('workers', `${Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))} threads`, 'spawned');
  ch = await buildWaternoose({
    quality: QUALITY,
    onProgress: (name, s, done, total) => {
      $('#bar').style.width = `${(done / total) * 100}%`;
      logLine(name, `${s.grid.join('×')} grid · ${fmt(s.evals)} SDF evals · ${fmt(s.triangles)} tris`, `${s.ms.toFixed(0)} ms`);
    },
  });
  scene.add(ch.root, ch.legsGroup);
  rig = new WaternooseRig(ch);
  rig.obstacles = office.obstacles;
  rig.onFootstep = (p, s) => {
    const v = p.clone().project(camera);
    audio.tap(v.x * 0.8, s);
  };
  logLine('assembled', `${fmt(ch.stats.triangles)} triangles · ${ch.stats.primitives} primitives`, `${(ch.stats.ms / 1000).toFixed(1)} s`);
  initFeatures();

  // warm up shaders so the first frame doesn't hitch
  renderer.compile(scene, camera);

  if (AUTO) {
    rig.place(0, 0, 0);
    startHud();
    runShotMode();
  } else {
    rig.place(0.3, -2.6, Math.PI * 0.92); // gazing out of the window
    const btn = $('#enter');
    btn.disabled = false;
    btn.textContent = 'Clock in';
    btn.onclick = clockIn;
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// dialogue director
// ---------------------------------------------------------------------------
const POSE_MAP = {
  explain: ['explain', 'idle'], shrug: ['shrug', 'shrug'], delight: ['delight', 'delight'],
  steeple: ['steeple', 'steeple'], point: ['idle', 'point'], behind: ['behind', 'behind'],
};
const talk = { until: 0, typeTimer: 0, queue: [] };
let clockT = 0;

function baseMood() {
  if (state.villain) return 'villain';
  if (state.dancing) return 'delighted';
  return state.energy < 0.3 ? 'worried' : state.energy < 0.75 ? 'neutral' : 'happy';
}

function say(kindOrLine, { force = false, fromChain = false } = {}) {
  const line = Array.isArray(kindOrLine) ? kindOrLine : pickLine(kindOrLine);
  if (!line || !rig) return 0;
  if (clockT < talk.until && !force) return 0;
  // anything the player triggers cuts off a queued conversation
  if (!fromChain) talk.queue = [];
  const [text, mood, pose] = line;
  audio.stopSpeaking();
  // villain mode plays the same recording slower, which also drops the pitch
  let dur = audio.speak(text, { rate: state.villain ? 0.88 : 1 });
  if (dur > 0) {
    rig.mouthFn = () => audio.mouthOpen();
  } else {
    // no audio (headless / clip failed to load): mime along to the subtitle
    dur = text.length * 0.055;
    const t0 = clockT;
    rig.mouthFn = () => (clockT - t0 < dur ? Math.max(0, Math.sin((clockT - t0) * 17) * 0.6) : 0);
  }
  talk.until = clockT + dur;
  rig.setMood(state.villain ? 'villain' : mood);
  const [pl, pr] = POSE_MAP[pose] || ['idle', 'idle'];
  if (!state.dancing && !rig.drive) rig.setPose(pl, pr);
  showSubtitle(text, dur, 'MR. WATERNOOSE');
  return dur;
}

// the board, heard over the desk phone: no lip-sync, different caption
function sayBoard(text) {
  if (!rig) return 0;
  let dur = audio.speak(text);
  if (!(dur > 0)) dur = text.length * 0.055;
  rig.mouthFn = null;
  talk.until = clockT + dur;
  showSubtitle(text, dur, 'THE BOARD · ON THE LINE', true);
  return dur;
}

// typewriter subtitle
function showSubtitle(text, dur, who, phone = false) {
  const sub = $('#subtitle'), el = sub.querySelector('.text');
  sub.querySelector('.who').textContent = who;
  sub.classList.toggle('phone', phone);
  sub.classList.remove('hidden');
  clearInterval(talk.typeTimer);
  let i = 0;
  const step = Math.max(12, (dur * 1000 * 0.85) / text.length);
  el.textContent = '';
  talk.typeTimer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(talk.typeTimer);
  }, step);
}

function sayChain(list) {
  talk.queue = list.slice();
  const next = () => {
    const item = talk.queue.shift();
    if (!item) return;
    const d = say(item, { force: true, fromChain: true });
    talk.nextAt = clockT + d + 0.35;
  };
  talk.next = next;
  next();
}

function updateTalk() {
  if (!rig) return;
  if (talk.queue.length && clockT > (talk.nextAt || 0)) talk.next();
  if (clockT > talk.until && rig.mouthFn && !talk.queue.length) {
    rig.mouthFn = null;
    setTimeout(() => { if (clockT > talk.until) $('#subtitle').classList.add('hidden'); }, 1800);
    rig.setMood(baseMood());
    if (!state.dancing) rig.setPose(state.villain ? 'steeple' : 'idle');
  }
}

// ---------------------------------------------------------------------------
// energy / game state
// ---------------------------------------------------------------------------
const state = {
  energy: AUTO ? Number(params.get('energy') || 0.15) : 0.06,
  holding: false,
  mic: false,
  villain: false,
  dancing: false,
  quota: false,
  lastInteract: 0,
  screamT: 0,
  lastScreamLine: -99,
  cellsDone: 0,
  prevPreset: 'night',
  danceUntil: 0,
  started: false,
  padScream: false,
  danceT: 0,
  pokedEyes: new Set(),
};

// ---------------------------------------------------------------------------
// feature modules share this context
// ---------------------------------------------------------------------------
const game = {
  get rig() { return rig; },
  get ch() { return ch; },
  get t() { return clockT; },
  audio, state, talk, camera, controls, office,
  say: (...a) => say(...a),
  sayBoard: (text) => sayBoard(text),
  gradeFor,
  get shifts() { return shifts; },
  photoBusy: () => !!photo?.busy,
  phoneBusy: () => !!phone?.busy,
  lookAt: (target) => { lookOverride = target; },
  updateViewOffset: () => updateViewOffset(),
  shot: (n) => shot(n),
  award: (id) => awards?.unlock(id) || false,
  get awards() { return awards; },
  bestGrade: () => (grading?.best ? gradeFor(grading.best).g : '-'),
  lookAtCamera: (on) => { lookOverride = on ? 'camera' : null; },
  captureFrame: () => new Promise((res) => { captureRequest = res; }),
  actions: {
    talk: () => sayContextual(),
    scare: () => scareDemo(),
    dance: () => setDance(!state.dancing),
    villain: () => setVillain(!state.villain),
    padScream: (on) => { if (on !== state.padScream) { state.padScream = on; syncScream(); } },
  },
};
let awards = null, grading = null, drive = null, events = null, photo = null, phone = null, shifts = null;
let lookOverride = null, captureRequest = null;

function initFeatures() {
  awards = createAchievements(game);
  grading = createGrading(game);
  drive = createDrive(game);
  events = createEvents(game);
  photo = createPhoto(game);
  phone = createPhone(game);
  shifts = createShifts(game);
}

function sayContextual() {
  say(state.energy >= 0.99 ? 'full' : state.energy < 0.3 ? 'lowEnergy' : 'midEnergy', { force: true });
}

const cells = $('#cells');
for (let i = 0; i < 5; i++) cells.insertAdjacentHTML('beforeend', '<div class="cell"><i></i></div>');

function updateEnergy(dt) {
  const micScream = state.mic ? audio.sampleMic() : 0;
  const keyScream = state.holding || state.padScream ? 0.9 : 0;
  const scream = Math.max(micScream, keyScream);
  if (state.mic) $('#miclevel').style.setProperty('--lvl', `${Math.round(audio.micLevel * 100)}%`);

  const screaming = scream > 0.12;
  state.screamT = screaming ? state.screamT + dt : Math.max(0, state.screamT - dt * 2);
  const mult = events?.gainMult || 1;
  if (screaming) {
    state.energy = Math.min(1, state.energy + scream * dt * 0.085 * mult);
    state.lastInteract = clockT;
    if (screaming) awards?.unlock('firstScream');
  } else if (!state.quota) {
    state.energy = Math.max(0, state.energy - dt * 0.0015 * (shifts?.difficulty || 1));
  }
  grading?.update(dt, scream, micScream > keyScream);
  events?.update(dt, { screaming });

  const en = $('#energy');
  en.classList.toggle('surging', events?.active === 'surge');
  $('#energyLabel').textContent = events?.active === 'surge' ? 'Scream Energy ×2' : 'Scream Energy';

  // Waternoose reacts to the scream
  if (rig && !state.villain) {
    if (state.screamT > 0.25) {
      if (clockT > talk.until) { rig.setMood('delighted'); if (!state.dancing && !rig.drive) rig.setPose('delight'); }
      if (state.screamT > 1.8 && clockT - state.lastScreamLine > 15 && clockT > talk.until) {
        state.lastScreamLine = clockT;
        say('screaming');
      }
    } else if (clockT > talk.until && !rig.mouthFn && rig.mood !== baseMood() && !photo?.busy) {
      rig.setMood(baseMood());
      if (!state.dancing) rig.setPose('idle');
    }
  }

  // milestones
  const done = Math.floor(state.energy * 5 + 1e-6);
  if (done > state.cellsDone) {
    for (let i = state.cellsDone; i < done; i++) audio.ding(i);
    state.cellsDone = done;
    if (done >= 5 && !state.quota) quotaMet();
    else if (done === 3) setTimeout(() => say('midEnergy'), 600);
  }
  if (done < state.cellsDone) state.cellsDone = done;

  // UI
  cells.querySelectorAll('i').forEach((el, i) => { el.style.width = `${THREE.MathUtils.clamp(state.energy * 5 - i, 0, 1) * 100}%`; });
  $('#pct').textContent = `${Math.round(state.energy * 100)}%`;
  const st = $('#status');
  st.textContent = `Night ${shifts?.night || 1} · ${state.energy < 0.3 ? 'City power critical' : state.energy < 0.99 ? 'Power partially restored' : 'Monstropolis fully powered'}`;
  st.classList.toggle('ok', state.energy >= 0.99);
}

function quotaMet() {
  state.quota = true;
  awards?.unlock('quota');
  shifts?.onQuota();
  audio.fanfare();
  $('#flash').classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => $('#flash').classList.remove('on')));
  $('#banner').classList.remove('hidden');
  setTimeout(() => $('#banner').classList.add('hidden'), 3800);
  rig.celebrate = 1;
  sayChain(LINES.full);
  if (!state.dancing && !state.villain) { setDance(true); state.danceUntil = clockT + 14; }
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------
function setDance(on) {
  state.dancing = on;
  state.danceUntil = 0;
  if (on) {
    audio.startMusic(132);
    rig.dance = { beat: () => (audio.ctx ? audio.musicBeat() : clockT * 2.2) };
    rig.target = null;
    rig.setMood('delighted');
    say('dance', { force: true });
  } else {
    audio.stopMusic();
    rig.dance = null;
    rig.setMood(baseMood());
    rig.setPose('idle');
  }
  dockBtn('dance').classList.toggle('on', on);
}

function setVillain(on) {
  state.villain = on;
  if (on) {
    if (state.dancing) setDance(false);
    state.prevPreset = office.preset === 'villain' ? 'night' : office.preset;
    office.setPreset('villain');
    rig.setMood('villain');
    rig.setPose('steeple');
    say('villain', { force: true });
    awards?.unlock('villain');
  } else {
    office.setPreset(state.prevPreset);
    rig.setMood(baseMood());
    say('unvillain', { force: true });
  }
  syncSeg('preset', office.preset);
  dockBtn('villain').classList.toggle('on', on);
}

function stroll() {
  awards?.unlock('stroll');
  const spots = [[-2.6, -3.0], [2.4, -3.0], [0, -2.9], [-3.2, 0.6], [3.0, 0.4], [0, 0.4]];
  const r = rig.ch.root.position;
  const far = spots.filter(([x, z]) => Math.hypot(x - r.x, z - r.z) > 1.5);
  const [x, z] = far[Math.floor(Math.random() * far.length)];
  if (state.dancing) setDance(false);
  rig.walkTo(new THREE.Vector3(x, 0, z));
  say('walk');
}

function scareDemo() {
  if (state.dancing) setDance(false);
  audio.stopSpeaking();
  rig.mouthFn = null;
  talk.until = clockT + 1.9;
  rig.scare();
  audio.roar();
  setTimeout(() => say('scare', { force: true }), 1900);
}

const dockBtn = (act) => $(`#dock [data-act="${act}"]`);
$('#dock').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !rig) return;
  state.lastInteract = clockT;
  audio.blip(660, 0.04, 'triangle', 0.04);
  const act = b.dataset.act;
  if (act === 'talk') sayContextual();
  if (act === 'photo') photo?.take();
  if (act === 'awards') awards?.toggle();
  if (act === 'walk') stroll();
  if (act === 'dance') setDance(!state.dancing);
  if (act === 'villain') setVillain(!state.villain);
  if (act === 'scare') scareDemo();
  if (act === 'director') toggleDirector();
});

function toggleDirector() {
  const d = $('#director');
  d.classList.toggle('hidden');
  dockBtn('director').classList.toggle('on', !d.classList.contains('hidden'));
}

// director panel
function syncSeg(key, v) {
  document.querySelectorAll(`.seg[data-key="${key}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
}
function setMode(v) {
  const wire = v === 'wire';
  charUniforms.uMode.value = wire ? 1 : Number(v);
  for (const k in ch.materials) ch.materials[k].wireframe = wire;
  syncSeg('mode', v);
}
$('#director').addEventListener('click', (e) => {
  const b = e.target.closest('.seg button');
  if (!b) return;
  const key = b.parentElement.dataset.key, v = b.dataset.v;
  audio.blip(880, 0.03, 'triangle', 0.03);
  if (key === 'preset') {
    if (v === 'villain' && !state.villain) { setVillain(true); return; }
    if (v !== 'villain' && state.villain) { state.villain = false; dockBtn('villain').classList.remove('on'); rig.setMood(baseMood()); rig.setPose('idle'); }
    office.setPreset(v);
    syncSeg('preset', v);
  }
  if (key === 'mode') setMode(v);
  if (key === 'shot') { shot(v); syncSeg('shot', v); }
  if (key === 'fx') {
    b.classList.toggle('on');
    const on = b.classList.contains('on');
    if (v === 'ao') gtao.enabled = on;
    if (v === 'bloom') bloom.enabled = on;
    if (v === 'grain') { finish.uniforms.uGrain.value = on ? 0.045 : 0; finish.uniforms.uCA.value = on ? 0.0022 : 0; }
    if (v === 'spin') controls.autoRotate = on;
  }
});
$('#photo').onclick = () => togglePhoto();
function togglePhoto() { $('#hud').classList.toggle('photo'); updateViewOffset(); }

// scream button + keyboard
const holdBtn = $('#hold');
function syncScream() {
  const on = state.holding || state.padScream;
  holdBtn.classList.toggle('active', on);
  audio.setScream(on);
}
const setHold = (on) => {
  if (state.holding === on) return;
  state.holding = on;
  syncScream();
};
holdBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setHold(true); });
window.addEventListener('pointerup', () => setHold(false));
window.addEventListener('pointercancel', () => setHold(false));
holdBtn.addEventListener('pointerleave', () => setHold(false));



$('#mic').onclick = async () => {
  const b = $('#mic');
  if (state.mic) {
    audio.disableMic(); state.mic = false; b.classList.remove('on'); b.querySelector('.lbl').textContent = 'Enable mic';
    return;
  }
  try {
    await audio.enableMic();
    state.mic = true;
    b.classList.add('on');
    b.querySelector('.lbl').textContent = 'Mic on';
    say(LINES.intro[1], { force: true });
  } catch (err) {
    b.querySelector('.lbl').textContent = 'No mic';
    say('micDenied', { force: true });
  }
};

window.addEventListener('keydown', (e) => {
  if (!rig || e.repeat && e.code !== 'Space') return;
  if (e.target.tagName === 'INPUT') return;
  state.lastInteract = clockT;
  if (e.code === 'Space') { e.preventDefault(); setHold(true); }
  if (e.code === 'KeyT') sayContextual();
  if (e.code === 'KeyB') setDance(!state.dancing);
  if (e.code === 'KeyP') photo?.take();
  if (e.code === 'KeyF') phone?.answer();
  if (e.code === 'Escape') $('#photoModal .close').click();
  if (e.code === 'KeyV') setVillain(!state.villain);
  if (e.code === 'KeyR') scareDemo();
  if (e.code === 'KeyH') togglePhoto();
  if (e.code === 'Tab') { e.preventDefault(); toggleDirector(); }
  if (e.code === 'KeyC') cycleShot();
  if (e.code.startsWith('Digit')) {
    const p = ['night', 'boardroom', 'villain', 'studio'][Number(e.code.slice(5)) - 1];
    if (p) $(`.seg[data-key="preset"] button[data-v="${p}"]`).click();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') setHold(false);
});

// ---------------------------------------------------------------------------
// camera shots
// ---------------------------------------------------------------------------
const SHOTS = {
  wide: { pos: [1.6, 2.2, 6.6], target: [0, 1.45, 0] },
  portrait: { pos: [0.8, 2.25, 2.9], target: [0, 2.12, 0.2] },
  photo: { pos: [0.3, 2.02, 2.25], target: [0, 1.98, 0.2] },
  eyes: { pos: [0.22, 2.38, 1.45], target: [0, 2.32, 0.4] },
  hero: { pos: [1.4, 0.35, 3.6], target: [0, 1.7, 0] },
  legs: { pos: [2.6, 0.8, 2.6], target: [0, 0.6, 0.3] },
  back: { pos: [-1.2, 2.2, -4.2], target: [0, 1.6, 0] },
  side: { pos: [4.2, 1.9, 0.6], target: [0, 1.5, 0] },
};
const tween = { t: 1, from: { p: new THREE.Vector3(), t: new THREE.Vector3() }, to: { p: new THREE.Vector3(), t: new THREE.Vector3() } };
let shotIdx = 0;
function shot(name, instant = false) {
  const s = SHOTS[name];
  if (!s || !rig) return;
  const r = rig.ch.root;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rig.heading);
  const base = new THREE.Vector3(r.position.x, 0, r.position.z);
  tween.from.p.copy(camera.position);
  tween.from.t.copy(controls.target);
  tween.to.p.set(...s.pos).applyQuaternion(q).add(base);
  tween.to.t.set(...s.target).applyQuaternion(q).add(base);
  tween.t = instant ? 1 : 0;
  if (instant) { camera.position.copy(tween.to.p); controls.target.copy(tween.to.t); controls.update(); }
}
function cycleShot() {
  const names = ['wide', 'portrait', 'eyes', 'hero', 'legs'];
  shotIdx = (shotIdx + 1) % names.length;
  shot(names[shotIdx]);
  syncSeg('shot', names[shotIdx]);
}

// ---------------------------------------------------------------------------
// pointer: look-at, poke, walk
// ---------------------------------------------------------------------------
const pointer = new THREE.Vector2();
let lastPointerMove = -99;
let downAt = null;
const raycaster = new THREE.Raycaster();
canvas.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  lastPointerMove = clockT;
});
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || !rig) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  const quick = performance.now() - downAt.t < 450;
  downAt = null;
  if (moved > 6 || !quick) return;
  state.lastInteract = clockT;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // the coarse shadow proxies are used for hit-testing the body; they can sit a
  // hair in front of the eyeballs, so an eye within a few cm of the body hit wins
  // an eye counts whether you hit the eyeball or its lids
  if (phone?.ringing && phone.hitTest(raycaster)) { phone.answer(); return; }
  if (office.themed.doorHitTest(raycaster)) {
    if (!office.themed.doorOpen) {
      office.themed.openDoor();
      audio.pickup();
      awards?.unlock('wrongDoor');
      setTimeout(() => say('wrongDoor', { force: true }), 500);
    }
    return;
  }
  const eyeParts = ch.eyes.flatMap((e) => [e.ball, e.upper, e.lower]);
  const eyeHit = raycaster.intersectObjects(eyeParts, false)[0];
  const bodyHit = raycaster.intersectObjects(ch.shadowProxies, false)[0];
  const hit = eyeHit && (!bodyHit || eyeHit.distance < bodyHit.distance + 0.06) ? eyeHit : bodyHit;
  if (hit) {
    const eye = hit === eyeHit ? Math.floor(eyeParts.indexOf(hit.object) / 3) : -1;
    let o = hit.object, face = false;
    while (o) { if (o === ch.head) { face = true; break; } o = o.parent; }
    rig.poke(face ? 'face' : 'belly');
    audio.blip(face ? 300 : 180, 0.12, 'sine', 0.08);
    if (eye >= 0) {
      state.pokedEyes.add(eye);
      if (state.pokedEyes.size === 5 && awards?.unlock('allEyes')) say('allEyes', { force: true });
      else say('pokeEye', { force: true });
    } else {
      say(face ? 'poke' : 'pokeBelly', { force: true });
    }
    return;
  }
  const fh = raycaster.intersectObject(office.floor, false)[0];
  if (fh) {
    if (state.dancing) setDance(false);
    rig.drive = null;
    rig.walkTo(fh.point);
    awards?.unlock('stroll');
    const m = $('#marker');
    m.style.left = `${e.clientX}px`; m.style.top = `${e.clientY}px`;
    m.classList.remove('go'); void m.offsetWidth; m.classList.add('go');
    if (Math.random() < 0.35) say('walk');
  }
});

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------
function startHud() {
  setTimeout(() => $('#touchHint').classList.add('gone'), 9000);
  setTimeout(() => { perf.armed = true; }, 2500);
  $('#loader').classList.add('gone');
  $('#hud').classList.remove('hidden');
  if (AUTO && params.has('hideui')) $('#hud').classList.add('photo');
  requestAnimationFrame(updateViewOffset);
}

async function clockIn() {
  $('#enter').disabled = true;
  try { await audio.init(); } catch (e) { console.warn(e); }
  startHud();
  state.lastInteract = clockT;
  state.started = true;
  awards?.unlock('clockin');
  shifts?.begin();
  // he turns from the window and ambles over
  rig.walkTo(new THREE.Vector3(0, 0, 0.1));
  rig.onArrive = () => {
    rig.onArrive = null;
    (audio.voiceReady || Promise.resolve()).finally(() => sayChain([LINES.greet[0], LINES.intro[0], LINES.intro[1]]));
  };
  setTimeout(() => { if (rig.onArrive) rig.onArrive(); }, 7000);
}

// if the GPU is struggling, shed GTAO first, then resolution
const perf = { t: 0, frames: 0, level: 0, armed: false };
function autoQuality(dt) {
  if (!perf.armed || AUTO) return;
  perf.t += dt; perf.frames++;
  if (perf.t < 3) return;
  const f = perf.frames / perf.t;
  perf.t = 0; perf.frames = 0;
  if (f > 44 || perf.level >= 4) return;
  perf.level++;
  if (gtao.enabled) {
    gtao.enabled = false;
    document.querySelector('.seg[data-key="fx"] button[data-v="ao"]').classList.remove('on');
  } else {
    const d = Math.max(0.6, renderer.getPixelRatio() * 0.8);
    renderer.setPixelRatio(d);
    composer.setPixelRatio(d);
    composer.setSize(innerWidth, innerHeight);
  }
}

// stats
let fpsAcc = 0, fpsN = 0, statT = 0, fps = 60;
function updateStats(dt) {
  fpsAcc += dt; fpsN++;
  statT += dt;
  if (statT < 0.5) return;
  fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; statT = 0;
  const s = ch.stats;
  $('#stats').innerHTML = [
    `<b>${fps.toFixed(0)}</b> fps · <b>${renderer.info.render.calls}</b> draws`,
    `<b>${fmt(renderer.info.render.triangles)}</b> tris rendered`,
    `waternoose: <b>${fmt(s.triangles)}</b> tris, 0 bytes of mesh data`,
    `sculpted from <b>${s.primitives}</b> SDF primitives`,
    `<b>${fmt(s.evals)}</b> field evaluations in <b>${(s.ms / 1000).toFixed(1)}s</b>`,
  ].join('<br>');
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
const timer = new THREE.Timer();
timer.connect(document);
const lookP = new THREE.Vector3();
const eyeLampTarget = new THREE.Vector3();
let shownBest = -1;
function loop() {
  requestAnimationFrame(loop);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  clockT += dt;
  renderer.info.reset();

  // clock in the corner ticks along from 11:47pm
  const mins = 47 + Math.floor(clockT / 60);
  $('#clock').textContent = `${mins >= 60 ? 12 : 11}:${String(mins % 60).padStart(2, '0')} ${mins >= 60 ? 'AM' : 'PM'}`;
  office.setClock(23 + Math.floor(mins / 60), (mins % 60) + (clockT % 60) / 60);

  if (rig) {
    // look at the cursor if it moved recently, else at the camera
    if (lookOverride) {
      rig.lookTarget = lookOverride === 'camera' ? camera.position : lookOverride;
    } else if (clockT - lastPointerMove < 2.5) {
      raycaster.setFromCamera(pointer, camera);
      const headP = ch.head.getWorldPosition(new THREE.Vector3());
      lookP.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, camera.position.distanceTo(headP) * 0.9);
      rig.lookTarget = lookP;
    } else {
      rig.lookTarget = camera.position;
    }
    if (state.dancing && state.danceUntil && clockT > state.danceUntil) setDance(false);
    if (state.dancing) { state.danceT += dt; if (state.danceT > 20) awards?.unlock('dance'); }
    drive?.update(dt);
    phone?.update(dt);
    office.setLookTarget(ch.head.getWorldPosition(eyeLampTarget));
    if (grading && grading.best !== shownBest) { shownBest = grading.best; office.themed.setBest(shownBest); }
    updateEnergy(dt);
    updateTalk();
    rig.update(dt, camera.position);

    if (!AUTO && clockT - state.lastInteract > 30 && clockT > talk.until && !state.dancing && !photo?.busy && !phone?.busy) {
      state.lastInteract = clockT;
      say(state.energy < 0.3 ? (Math.random() < 0.5 ? 'lowEnergy' : 'idle') : 'idle');
    }
  }
  charUniforms.uTime.value = clockT;
  office.update(dt, clockT, state.energy, { surge: events?.fx.surge || 0, brownout: events?.fx.brownout || 0 });

  if (tween.t < 1) {
    tween.t = Math.min(1, tween.t + dt / 1.4);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.from.p, tween.to.p, e);
    controls.target.lerpVectors(tween.from.t, tween.to.t, e);
  }
  controls.update();
  finish.uniforms.uTime.value = clockT;
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  // grab the frame for the staff photo while the drawing buffer is still intact
  if (captureRequest) { captureRequest(renderer.domElement.toDataURL('image/png')); captureRequest = null; }
  if (rig) { updateStats(dt); autoQuality(dt); }
}

// The HUD covers the bottom of the screen (a lot of it on phones), so shift the
// projection up to centre the scene in the part you can actually see.
function updateViewOffset() {
  const hud = $('#hud');
  let covered = 0;
  if (!hud.classList.contains('hidden') && !hud.classList.contains('photo')) {
    const top = Math.min($('#energy').getBoundingClientRect().top, $('#dock').getBoundingClientRect().top);
    covered = Math.max(0, innerHeight - top);
  }
  if (innerWidth > innerHeight) covered *= 0.45; // wide screens have room to spare above the HUD
  if (covered > 40) camera.setViewOffset(innerWidth, innerHeight + covered, 0, covered, innerWidth, innerHeight);
  else camera.clearViewOffset();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  requestAnimationFrame(updateViewOffset);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  gtao.setSize(innerWidth, innerHeight);
  finish.uniforms.uRes.value.set(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// headless screenshot harness (?shot=portrait&preset=studio&mode=1)
// ---------------------------------------------------------------------------
window.__app = () => ({ scene, camera, controls, gtao, bloom, finish, ch, rig, office, audio, renderer, composer, state, game, awards, events, photo, grading, phone, shifts });
window.__dbg = () => ({ cam: camera.position.toArray(), tgt: controls.target.toArray(), root: rig?.ch.root.position.toArray(), bodyScale: rig?.ch.body.scale.toArray(), jiggle: rig?.jiggle, heading: rig?.heading, dpr: renderer.getPixelRatio(), perf: { ...perf }, energy: state.energy, legs: rig?.ch.legs.map((l) => l.foot.toArray().map((v) => +v.toFixed(2))) });

function runShotMode() {
  if (params.get('preset')) office.setPreset(params.get('preset'));
  if (params.get('mode')) setMode(params.get('mode'));
  if (params.has('noao')) gtao.enabled = false;
  rig.nextBlink = 1e9; // stills shouldn't catch a blink
  if (params.get('mood')) rig.setMood(params.get('mood'));
  if (params.get('pose')) rig.setPose(params.get('pose'));
  if (params.has('dance')) { state.dancing = true; rig.dance = { beat: () => clockT * 2.2 }; }
  window.app = {
    shot: (n) => shot(n, true), rig, ch, office, setMode, camera, controls, state, THREE, say, setDance, setVillain, renderer, composer, gtao,
    get awards() { return awards; }, get events() { return events; }, get photo() { return photo; }, get phone() { return phone; }, get shifts() { return shifts; }, game,
    mouth: (v) => { talk.until = 1e9; rig.mouthFn = () => v; },
  };
  shot(params.get('shot'), true);
  let frames = 0;
  const wait = () => { if (++frames > Number(params.get('frames') || 90)) window.__READY = true; else requestAnimationFrame(wait); };
  wait();
}

init().catch(showError);
void PART_NAMES;
