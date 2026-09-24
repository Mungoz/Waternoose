// Procedural PBR for the sculpt. Nothing here uses a texture: colour, micro
// bump, roughness and region masks (skin / vest / shirt / lining ...) are all
// computed per-pixel from the rest-pose object-space position, so detail holds
// up at any zoom. Built by patching MeshPhysicalMaterial so we keep three.js
// lighting, shadows and IBL.
//
// Palette taken from film frames: slate blue-grey skin, burgundy-brown suit
// with red lining, scarlet vest with a cream triangle motif, maroon bow tie.

import * as THREE from 'three';
import { EYES, MOUTH_Y, MOUTH_CURVE, JACKET_HEM, JAW_HINGE, FEMUR } from './anatomy.js';

export const KIND = {
  SKIN: 0, TORSO: 1, JACKET: 2, SLEEVE: 3, SHIRT: 4, SATIN: 5, LEG: 6, TEETH: 7,
  TONGUE: 8, BUTTON: 11, HEAD: 12, TIBIA: 13, GOLD: 14, HAND: 15,
};

// Shared uniforms: the rig writes these every frame.
export const charUniforms = {
  uTime: { value: 0 },
  uMode: { value: 0 }, // 0 beauty, 1 clay, 2 normals, 3 baked AO
  uJaw: { value: 0 },
  uJawHinge: { value: new THREE.Vector3(...JAW_HINGE) },
  uBrow: { value: 0 },
  uFurrow: { value: 0 },
  uSmile: { value: 0 },
  uSSSColor: { value: new THREE.Color(0.85, 0.55, 0.58) },
  uEyes: { value: EYES.map((e) => new THREE.Vector4(e.pos[0], e.pos[1], e.pos[2], e.r)) },
  uPupil: { value: 0.2 },
  uEyeGlow: { value: 0 },
};

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const NOISE_GLSL = /* glsl */ `
vec3 wn_mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 wn_mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 wn_perm(vec4 x){return wn_mod289(((x*34.0)+10.0)*x);}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-0.5;
  i=wn_mod289(i);
  vec4 p=wn_perm(wn_perm(wn_perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  vec4 j=p-49.0*floor(p*(1.0/49.0)); vec4 x_=floor(j*(1.0/7.0)); vec4 y_=floor(j-7.0*x_);
  vec4 x=(x_*2.0+0.5)/7.0-1.0; vec4 y=(y_*2.0+0.5)/7.0-1.0; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 g0=vec3(a0.xy,h.x); vec3 g1=vec3(a0.zw,h.y); vec3 g2=vec3(a1.xy,h.z); vec3 g3=vec3(a1.zw,h.w);
  vec4 norm=inversesqrt(vec4(dot(g0,g0),dot(g1,g1),dot(g2,g2),dot(g3,g3)));
  g0*=norm.x; g1*=norm.y; g2*=norm.z; g3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(g0,x0),dot(g1,x1),dot(g2,x2),dot(g3,x3)));
}
float fbm3(vec3 p){ return 0.5*snoise(p)+0.25*snoise(p*2.03+1.7)+0.125*snoise(p*4.01+3.1); }
vec3 hex(float r, float g, float b){ return pow(vec3(r,g,b)/255.0, vec3(2.2)); }
`;

// ---------------------------------------------------------------------------
function surfaceGLSL() {
  const E = EYES.length;
  return /* glsl */ `
uniform float uTime;
uniform int uMode;
uniform vec3 uSSSColor;
uniform vec4 uEyes[${E}];
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying float vAO;
varying float vMouth;
varying float vMask;
varying vec4 vRig;

${NOISE_GLSL}

float wnFoot;           // object-space size of a pixel, for detail LOD
float lod(float freq){ return 1.0 - smoothstep(0.25, 0.9, wnFoot * freq); }
float aastep(float edge, float x){ float w = max(fwidth(x), 1e-5) * 0.75; return smoothstep(edge - w, edge + w, x); }

vec3 wnAlbedo; float wnRough; vec3 wnSheen; float wnSSS; float wnAO; float wnSpecOcc;

const float MOUTH_Y = ${f(MOUTH_Y)};
const float MOUTH_CURVE = ${f(MOUTH_CURVE)};
const float JACKET_HEM = ${f(JACKET_HEM)};
const float FEMUR = ${f(FEMUR)};

float openingW(float y){ return 0.46 + (0.52 - y) * 0.6; }
float mouthLine(float x){ return MOUTH_Y - MOUTH_CURVE * x * x; }

// ---- skin: slate blue-grey, fine dark speckle, subtle mottling -----------------
vec3 skinColor(vec3 p){
  float big = fbm3(p * 2.6);
  float mott = smoothstep(0.1, 0.8, snoise(p * 7.0 + 11.0));
  float speck = smoothstep(0.6, 0.92, snoise(p * 55.0)) * lod(55.0);
  vec3 c = mix(hex(98.,110.,132.), hex(138.,148.,166.), big * 0.5 + 0.5);
  c = mix(c, hex(112.,116.,134.), mott * 0.3);
  c = mix(c, hex(72.,82.,102.), speck * 0.45);
  return c;
}
float skinHeight(vec3 p){
  float h = 0.0;
  h += snoise(p * 150.0) * 0.00012 * lod(150.0);
  h += snoise(p * 48.0) * 0.00035 * lod(48.0);
  return h;
}

// ---- head detail (head space) ---------------------------------------------------
float headWrinkles(vec3 p){
  float ax = abs(p.x);
  float h = 0.0;
  // fine folds across the chin and throat, following the jaw's U
  // fine wrinkles across the jowl sack, following the U of the jaw
  float chin = smoothstep(0.31, 0.22, p.y) * smoothstep(0.0, 0.06, p.y) * smoothstep(-0.05, 0.12, p.z);
  float wob = snoise(p * vec3(3.0, 9.0, 3.0)) * 3.5;
  h += chin * 0.0014 * sin((p.y - 0.5 * ax * ax) * 140.0 + wob) * (0.5 + 0.5 * snoise(p * 7.0 + 4.0)) * lod(22.0);
  // forehead creases above the brows
  // a few lines between the eyes and the mouth
  float fm = smoothstep(0.405, 0.42, p.y) * smoothstep(0.46, 0.44, p.y) * smoothstep(0.15, 0.28, p.z) * smoothstep(0.2, 0.06, ax);
  h += fm * 0.0007 * sin(p.y * 190.0 + snoise(p * 5.0) * 2.5) * lod(30.0);
  // rings of loose skin round each eye
  for (int i = 0; i < ${E}; i++) {
    float d = length(p - uEyes[i].xyz) / uEyes[i].w;
    h += smoothstep(1.25, 1.45, d) * smoothstep(2.3, 1.7, d) * 0.0008 * sin(d * 16.0) * lod(20.0);
  }
  return h;
}

vec3 headColor(vec3 p, vec3 base){
  float ax = abs(p.x);
  vec3 c = base;
  // mouth line: a darker, slightly warm lip edge
  float lip = smoothstep(0.035, 0.012, abs(p.y - mouthLine(ax))) * smoothstep(0.1, 0.2, p.z + 1.25 * ax * ax) * smoothstep(0.38, 0.32, ax);
  c = mix(c, hex(96.,92.,106.), lip * 0.6);
  // lids around the eyes a touch darker and warmer
  for (int i = 0; i < ${E}; i++) {
    float d = length(p - uEyes[i].xyz) / uEyes[i].w;
    c = mix(c, hex(104.,100.,112.), smoothstep(1.7, 1.1, d) * 0.55);
  }
  // pale underside of the chin
  c = mix(c, hex(128.,132.,142.), smoothstep(0.24, 0.06, p.y) * smoothstep(0.0, 0.2, p.z) * 0.35);
  // inside of the mouth
  c = mix(c, hex(40., 34., 40.), smoothstep(0.0, 0.25, vMouth));
  c = mix(c, hex(30., 10., 16.), smoothstep(0.3, 1.0, vMouth));
  return c;
}

// ---- cloth ---------------------------------------------------------------------
float weave(vec3 p, float freq){
  float a = sin((p.x + p.y + p.z * 0.7) * freq);
  float b = sin((p.x - p.y + p.z * 0.3) * freq * 1.03);
  return (a * b) * lod(freq / 6.283);
}

// vest hem: pointed tips either side of the centre, rising round the sides
float vestHem(float x){ float ax = abs(x); return 0.1 - 0.13 * max(0.0, 1.0 - abs(ax - 0.18) / 0.45); }
float vestV(float y){ return 0.015 + (y - 0.22) * 1.8; }

// small cream triangles on the vest, staggered
float vestMotif(vec3 p){
  vec2 g = vec2(p.x, p.y) / vec2(0.075, 0.07);
  g.x += 0.5 * mod(floor(g.y), 2.0);
  vec2 f = fract(g) - 0.5;
  // downward pointing triangle
  float t = max(abs(f.x) * 2.6 + f.y * 1.2, -f.y - 0.08);
  return 1.0 - aastep(0.065, t);
}

void wnSurface(){
  vec3 p = vObjPos;
  float ax = abs(p.x);
  wnAO = vAO;
  wnSpecOcc = 1.0;
  wnSSS = 0.0;
  wnSheen = vec3(0.0);
#if WN_KIND == ${KIND.SKIN} || WN_KIND == ${KIND.HEAD} || WN_KIND == ${KIND.LEG} || WN_KIND == ${KIND.TIBIA} || WN_KIND == ${KIND.HAND}
  wnAlbedo = skinColor(p);
  wnRough = 0.5 + 0.12 * snoise(p * 9.0);
  wnSheen = hex(120.,128.,150.) * 0.35;
  wnSSS = 1.0;
  #if WN_KIND == ${KIND.HEAD}
    wnAlbedo = headColor(p, wnAlbedo);
    wnRough -= 0.1 * smoothstep(0.35, 0.6, p.y);
    wnRough = mix(wnRough, 0.28, smoothstep(0.0, 0.2, vMouth));
    wnSSS *= 1.0 - vMouth;
    float cave = smoothstep(0.02, 0.4, vMouth);
    wnAO *= mix(1.0, 0.12, cave);
    wnSpecOcc = mix(1.0, 0.15, cave);
  #endif
  #if WN_KIND == ${KIND.LEG} || WN_KIND == ${KIND.TIBIA}
    wnAlbedo *= hex(176., 180., 200.);
    // red-pink, fleshy knuckles
    wnAlbedo = mix(wnAlbedo, hex(122., 76., 88.), vMask * 0.55);
    wnSSS = mix(1.0, 1.6, vMask);
  #endif
  #if WN_KIND == ${KIND.TIBIA}
    float tip = smoothstep(0.7, 0.99, p.y);
    wnAlbedo = mix(wnAlbedo, hex(56.,58.,66.), tip * 0.85);
    wnRough = mix(wnRough, 0.28, tip);
  #endif
  #if WN_KIND == ${KIND.HAND}
    wnAlbedo *= hex(186., 190., 204.);
    // claws: dark, horny, glossy
    wnAlbedo = mix(wnAlbedo, hex(64.,62.,68.), vMask);
    wnRough = mix(wnRough, 0.25, vMask);
    wnSSS *= 1.0 - vMask;
  #endif
  wnAlbedo = mix(wnAlbedo, wnAlbedo * hex(210., 180., 190.), (1.0 - vAO) * 0.6);
#elif WN_KIND == ${KIND.TORSO}
  float isVest = aastep(vestHem(p.x), p.y) * aastep(-0.3, p.z) * aastep(p.y, 0.5);
  float isShirt = max(aastep(ax, vestV(p.y)) * aastep(0.22, p.y), aastep(0.47, p.y)) * aastep(-0.3, p.z);
  // belly: the grey crab shell, slightly smoother and paler
  vec3 skin = skinColor(p * 0.8) * hex(196., 202., 214.);
  vec3 vest = mix(hex(150., 22., 24.), hex(196., 130., 92.), vestMotif(p) * lod(15.0) * 0.85);
  vec3 shirt = hex(190., 188., 184.);
  wnAlbedo = mix(skin, vest, isVest);
  wnAlbedo = mix(wnAlbedo, shirt, isShirt);
  wnRough = mix(0.45, 0.62, isVest);
  wnRough = mix(wnRough, 0.72, isShirt);
  wnSheen = mix(hex(120.,128.,150.) * 0.3, hex(255., 90., 90.) * 0.5, isVest);
  wnSheen = mix(wnSheen, vec3(0.2), isShirt);
  wnSSS = (1.0 - isVest) * (1.0 - isShirt);
#elif WN_KIND == ${KIND.JACKET} || WN_KIND == ${KIND.SLEEVE}
  wnAlbedo = hex(50., 28., 32.);
  wnRough = 0.7;
  wnSheen = hex(160., 90., 100.) * 0.35;
  #if WN_KIND == ${KIND.JACKET}
    // red lining peeking along the front edge
    float e = ax - openingW(p.y);
    float lining = (1.0 - aastep(0.014, e)) * aastep(0.05, p.z) * aastep(JACKET_HEM, p.y);
    wnAlbedo = mix(wnAlbedo, hex(170., 20., 30.), lining);
    wnRough = mix(wnRough, 0.4, lining);
  #endif
#elif WN_KIND == ${KIND.SHIRT}
  wnAlbedo = hex(190., 188., 184.);
  wnRough = 0.66;
  wnSheen = vec3(0.2);
  wnSSS = 0.3;
#elif WN_KIND == ${KIND.SATIN}
  wnAlbedo = hex(26., 14., 18.);
  wnRough = 0.42 + 0.08 * snoise(p * 40.0);
  wnSheen = hex(150., 80., 90.) * 0.4;
#elif WN_KIND == ${KIND.TEETH}
  float gum = smoothstep(0.012, 0.018, abs(p.y - mouthLine(ax)));
  wnAlbedo = mix(hex(226., 214., 186.), hex(84., 44., 52.), gum);
  wnRough = mix(0.28, 0.4, gum);
  wnSSS = 0.6;
  wnAO = vAO * 0.55;
  wnSpecOcc = 0.45;
#elif WN_KIND == ${KIND.TONGUE}
  wnAlbedo = hex(150., 66., 80.) * (0.8 + 0.2 * snoise(p * 60.0));
  wnRough = 0.45;
  wnSSS = 1.0;
  wnAO = vAO * 0.25;
  wnSpecOcc = 0.2;
#elif WN_KIND == ${KIND.BUTTON}
  wnAlbedo = hex(150., 150., 156.);
  wnRough = 0.3;
#elif WN_KIND == ${KIND.GOLD}
  wnAlbedo = hex(214., 150., 60.);
  wnRough = 0.3;
#endif

  if (uMode == 1) { wnAlbedo = vec3(0.42); wnRough = 0.55; wnSheen = vec3(0.0); }
}

float wnHeight(vec3 p){
  float h = 0.0;
#if WN_KIND == ${KIND.SKIN} || WN_KIND == ${KIND.HEAD} || WN_KIND == ${KIND.LEG} || WN_KIND == ${KIND.TIBIA} || WN_KIND == ${KIND.HAND}
  h = skinHeight(p);
  #if WN_KIND == ${KIND.HEAD}
    h += headWrinkles(p);
    // pebbly crown, fading out down the face
    h += smoothstep(0.45, 0.8, snoise(p * 30.0)) * 0.0007 * smoothstep(0.5, 0.62, p.y) * lod(30.0);
  #else
    h += smoothstep(0.35, 0.8, snoise(p * 26.0)) * 0.0006 * lod(26.0);
  #endif
  #if WN_KIND == ${KIND.LEG} || WN_KIND == ${KIND.TIBIA}
    h += 0.0005 * sin(p.y * 60.0 + snoise(p * 6.0) * 2.0) * lod(10.0);
  #endif
#elif WN_KIND == ${KIND.TORSO}
  float ax = abs(p.x);
  float vest = step(vestHem(p.x), p.y) * step(p.y, 0.5);
  float shirt = step(ax, vestV(p.y)) * step(0.22, p.y);
  h = mix(skinHeight(p * 0.8) * 0.6, 0.00012 * weave(p, 900.0) + 0.0002 * vestMotif(p) * lod(15.0), vest);
  h = mix(h, 0.0005 * sin(p.x * 330.0) * lod(52.0), shirt);
  // the seam round the crab shell
  h -= (1.0 - vest) * 0.0025 * smoothstep(0.018, 0.0, abs(p.y + 0.4 - 0.05 * p.z));
  // vest edge ridge
  h += 0.0012 * smoothstep(0.012, 0.0, abs(p.y - vestHem(p.x))) * step(-0.3, p.z);
#elif WN_KIND == ${KIND.JACKET} || WN_KIND == ${KIND.SLEEVE}
  h = 0.0001 * weave(p, 1400.0) + 0.0003 * snoise(p * vec3(30.0, 60.0, 30.0)) * lod(60.0);
#elif WN_KIND == ${KIND.SHIRT}
  h = 0.00008 * weave(p, 1800.0);
#elif WN_KIND == ${KIND.SATIN}
  h = 0.0002 * snoise(p * vec3(20.0, 80.0, 20.0));
#elif WN_KIND == ${KIND.TONGUE}
  h = 0.0004 * snoise(p * 160.0) * lod(160.0);
#endif
  return h;
}

float wnWrap(vec3 n, vec3 l){ float d = dot(n, l); return max(0.0, (d + 0.55) / 1.55) - max(0.0, d); }

vec3 wnPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir){
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float det = dot(sx, R1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  vec3 n = abs(det) * surf_norm - grad;
  float l = length(n);
  return l > 1e-12 ? n / l : surf_norm;
}
`;
}

function vertexHeader() {
  return /* glsl */ `
attribute float ao;
attribute float aMask;
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying float vAO;
varying float vMouth;
varying float vMask;
varying vec4 vRig;
#ifdef WN_RIG
attribute vec4 aRig;
attribute float aMouth;
uniform float uJaw;
uniform vec3 uJawHinge;
uniform float uBrow;
uniform float uFurrow;
uniform float uSmile;
#endif
`;
}

const SSS_KINDS = [KIND.TORSO, KIND.SKIN, KIND.HEAD, KIND.LEG, KIND.TIBIA, KIND.HAND, KIND.TONGUE, KIND.TEETH];

export function createCharMaterial(kind, params = {}) {
  const shiny = kind === KIND.BUTTON || kind === KIND.GOLD;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: shiny ? 1 : 0,
    sheen: shiny || kind === KIND.TEETH ? 0 : 1,
    sheenRoughness: 0.55,
    sheenColor: 0xffffff,
    clearcoat: 0,
    clearcoatRoughness: 0.15,
    specularIntensity: kind === KIND.JACKET || kind === KIND.SLEEVE ? 0.55 : 1,
    ...params,
  });
  const rig = kind === KIND.HEAD;
  mat.userData.kind = kind;
  mat.defines = { WN_KIND: kind, ...(rig ? { WN_RIG: '' } : {}), ...(SSS_KINDS.includes(kind) ? { WN_SSS: '' } : {}) };
  mat.customProgramCacheKey = () => `wn-char-${kind}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, charUniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHeader()}`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `#include <beginnormal_vertex>
        vObjNormal = objectNormal;
        #ifdef WN_RIG
          float jw = aRig.x * uJaw;
          float jc = cos(jw), js = sin(jw);
          mat3 jrot = mat3(1.0, 0.0, 0.0, 0.0, jc, js, 0.0, -js, jc);
          objectNormal = jrot * objectNormal;
        #endif`)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vObjPos = position;
        vAO = ao;
        vMask = aMask;
        vMouth = 0.0;
        vRig = vec4(0.0);
        #ifdef WN_RIG
          transformed = uJawHinge + jrot * (transformed - uJawHinge);
          transformed.y += (aRig.y * uBrow - aRig.z * uFurrow) * 0.016 + aRig.w * uSmile * 0.034;
          transformed.x += aRig.w * uSmile * 0.012 * sign(transformed.x);
          transformed.z -= aRig.w * max(uSmile, 0.0) * 0.008;
          transformed.z -= aRig.z * uFurrow * 0.006;
          vMouth = aMouth;
          vRig = aRig;
        #endif`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${surfaceGLSL()}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 wnDpx = dFdx(vObjPos), wnDpy = dFdy(vObjPos);
        wnFoot = max(length(wnDpx), length(wnDpy));
        wnSurface();
        diffuseColor.rgb = wnAlbedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(wnRough, 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        {
          float h0 = wnHeight(vObjPos);
          float hx = wnHeight(vObjPos + wnDpx);
          float hy = wnHeight(vObjPos + wnDpy);
          float sc = length(dFdx(vViewPosition)) / max(length(wnDpx), 1e-7);
          normal = wnPerturb(-vViewPosition, normal, vec2(hx - h0, hy - h0) * sc, faceDirection);
        }`)
      .replace('#include <lights_physical_fragment>', /* glsl */ `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          material.sheenColor = wnSheen;
        #endif`)
      .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
        #ifdef WN_SSS
        {
          // cheap subsurface: wrapped diffuse bleeding a warm tint past the terminator
          vec3 wrapL = vec3(0.0);
          #if NUM_DIR_LIGHTS > 0
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            wrapL += directionalLights[ i ].color * wnWrap(normal, directionalLights[ i ].direction);
          }
          #pragma unroll_loop_end
          #endif
          #if NUM_SPOT_LIGHTS > 0
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
            getSpotLightInfo( spotLights[ i ], geometryPosition, directLight );
            wrapL += directLight.color * wnWrap(normal, directLight.direction);
          }
          #pragma unroll_loop_end
          #endif
          #if NUM_POINT_LIGHTS > 0
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
            getPointLightInfo( pointLights[ i ], geometryPosition, directLight );
            wrapL += directLight.color * wnWrap(normal, directLight.direction);
          }
          #pragma unroll_loop_end
          #endif
          reflectedLight.directDiffuse += wrapL * wnSSS * uSSSColor * diffuseColor.rgb * RECIPROCAL_PI * 0.8;
        }
        #endif`)
      .replace('#include <aomap_fragment>', /* glsl */ `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= wnAO;
        reflectedLight.indirectSpecular *= mix(1.0, wnAO, 0.85);
        reflectedLight.directDiffuse *= mix(1.0, wnAO, 0.4);
        reflectedLight.directSpecular *= wnSpecOcc;
        reflectedLight.indirectSpecular *= wnSpecOcc;`)
      .replace('#include <opaque_fragment>', /* glsl */ `#include <opaque_fragment>
        if (uMode == 2) gl_FragColor = vec4(pow(normal * 0.5 + 0.5, vec3(2.2)), 1.0);
        if (uMode == 3) gl_FragColor = vec4(vec3(wnAO * wnAO), 1.0);`);
  };
  return mat;
}

// ---------------------------------------------------------------------------
// Eyes: the iris is painted procedurally on a unit sphere whose pole faces +Z.
// Pale green-hazel irises, small pupils, a wet sclera.
export function createEyeMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, ior: 1.38, specularIntensity: 0.6,
  });
  mat.customProgramCacheKey = () => 'wn-eye';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, charUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeP = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vEyeP;
        uniform float uPupil;
        uniform float uEyeGlow;
        uniform float uTime;
        uniform int uMode;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 ep = normalize(vEyeP);
        float th = acos(clamp(ep.z, -1.0, 1.0));
        float ang = atan(ep.y, ep.x);
        const float IRIS = 0.5;
        float pupil = uPupil;
        vec2 ringP = vec2(cos(ang), sin(ang));
        vec3 scl = hex(226., 222., 206.);
        float vein = smoothstep(0.55, 0.9, 1.0 - abs(snoise(vec3(ringP * 3.0, th * 5.0)))) * smoothstep(0.9, 1.6, th);
        scl = mix(scl, hex(206., 150., 140.), vein * 0.4 + smoothstep(1.0, 1.8, th) * 0.2);
        float r = th / IRIS;
        float fib = snoise(vec3(ringP * 9.0, r * 2.0)) * 0.5 + 0.5;
        float fib2 = snoise(vec3(ringP * 22.0, r * 5.0 + 3.0)) * 0.5 + 0.5;
        vec3 irisC = mix(hex(104., 120., 98.), hex(182., 192., 150.), fib * 0.7 + fib2 * 0.3);
        irisC = mix(irisC, hex(176., 150., 96.), smoothstep(0.6, 0.3, r) * 0.45);  // hazel collarette
        irisC *= mix(0.4, 1.0, smoothstep(1.0, 0.78, r));                          // limbal ring
        irisC = mix(irisC, irisC + vec3(1.2, 0.25, 0.05) * uEyeGlow, smoothstep(1.0, 0.4, r));
        float inIris = smoothstep(IRIS + 0.012, IRIS - 0.012, th);
        float inPupil = smoothstep(pupil + 0.01, pupil - 0.01, th);
        vec3 c = mix(scl, irisC, inIris);
        c = mix(c, vec3(0.004), inPupil);
        if (uMode == 1) c = vec3(0.42);
        diffuseColor.rgb = c;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(0.35, 0.15, inIris);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += irisC * uEyeGlow * inIris * (1.0 - inPupil) * 1.5;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uMode == 2) gl_FragColor = vec4(pow(normal * 0.5 + 0.5, vec3(2.2)), 1.0);
        if (uMode == 3) gl_FragColor = vec4(vec3(1.0), 1.0);`);
  };
  return mat;
}
