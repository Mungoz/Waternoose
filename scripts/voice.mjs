// Pre-records every line of dialogue with a neural TTS voice (Kokoro, runs
// locally), deepens it into Mr. Waternoose's register, and writes compact MP3s
// plus a manifest with a lip-sync envelope for each clip.
//
//   npm run voice            regenerate changed lines
//   npm run voice -- --all   regenerate everything
//   npm run voice -- --check also transcribe each clip back with Whisper
//
// Output: public/voice/*.mp3 + public/voice/manifest.json (shipped with the game).

import { KokoroTTS } from 'kokoro-js';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LINES, CALLS } from '../src/lines.js';

// lamejs's Node entry point is broken (missing globals); evaluate the self-contained bundle instead
const require = createRequire(import.meta.url);
const lamejs = new Function(fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8') + ';\nreturn lamejs;')();

const VOICE = 'am_michael';
// the chair of the board, heard down a phone line
const BOARD_VOICE = 'bf_emma';
const SPEED = 1.04;        // generation speed, before the pitch drop slows it again
const PITCH = Number(process.env.PITCH) || 0.89; // resample ratio: <1 = deeper voice, bigger formants
const KBPS = 56;
const ENV_FPS = 60;
const SETTINGS = `${VOICE}|${SPEED}|${PITCH}|${KBPS}|v2`;

const OUT = path.resolve(process.env.OUT || 'public/voice');
const args = new Set(process.argv.slice(2));
fs.mkdirSync(OUT, { recursive: true });

const manifestPath = path.join(OUT, 'manifest.json');
const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { clips: {} };

const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
// every spoken line with who says it
const speakerOf = new Map();
for (const l of Object.values(LINES).flat()) speakerOf.set(l[0], 'wn');
for (const l of Object.values(CALLS).flat()) speakerOf.set(l.text, l.who);
const texts = [...speakerOf.keys()].filter((t) => !only || only.test(t));
const idOf = (t) => crypto.createHash('sha1').update(SETTINGS + '|' + speakerOf.get(t) + '|' + t).digest('hex').slice(0, 10);

// ---- DSP helpers ------------------------------------------------------------
// Catmull-Rom resample: plays the clip back `ratio` times as fast (ratio < 1 = lower)
function resample(x, ratio) {
  const n = Math.floor(x.length / ratio);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, k = Math.floor(p), t = p - k;
    const a = x[k - 1] ?? 0, b = x[k] ?? 0, c = x[k + 1] ?? 0, d = x[k + 2] ?? 0;
    y[i] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  }
  return y;
}
// one-pole shelf-ish warmth: add a little low end back after the TTS
function warm(x, sr) {
  const y = new Float32Array(x.length);
  const a = Math.exp(-2 * Math.PI * 220 / sr);
  let lp = 0;
  for (let i = 0; i < x.length; i++) { lp = (1 - a) * x[i] + a * lp; y[i] = x[i] + lp * 0.35; }
  return y;
}
// gentle tape-style saturation for a hint of gravel
function saturate(x, drive = 1.8, mix = 0.3) {
  const n = Math.tanh(drive);
  return x.map((v) => v * (1 - mix) + (Math.tanh(v * drive) / n) * mix);
}
function trim(x, sr) {
  const thr = 0.01;
  let s = 0, e = x.length - 1;
  while (s < e && Math.abs(x[s]) < thr) s++;
  while (e > s && Math.abs(x[e]) < thr) e--;
  s = Math.max(0, s - Math.floor(sr * 0.03));
  e = Math.min(x.length - 1, e + Math.floor(sr * 0.08));
  const y = x.slice(s, e + 1);
  const f = Math.floor(sr * 0.01);
  for (let i = 0; i < f; i++) { y[i] *= i / f; y[y.length - 1 - i] *= i / f; }
  return y;
}
function normalize(x, peak = 0.89) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m > 0 ? x.map((v) => (v / m) * peak) : x;
}
// RBJ biquad, used for the telephone band-limit
function biquad(x, sr, type, f0, q) {
  const w = 2 * Math.PI * f0 / sr, a = Math.sin(w) / (2 * q), c = Math.cos(w);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function telephone(x, sr) {
  let y = biquad(x, sr, 'hp', 420, 0.8);
  y = biquad(y, sr, 'hp', 420, 0.8);
  y = biquad(y, sr, 'lp', 3100, 0.8);
  y = biquad(y, sr, 'lp', 3100, 0.8);
  return saturate(normalize(y, 0.9), 3.0, 0.5);
}

// jaw envelope: RMS per frame, compressed and normalised to 0..255
function envelope(x, sr) {
  const hop = Math.floor(sr / ENV_FPS);
  const frames = Math.ceil(x.length / hop);
  const env = new Float32Array(frames);
  let max = 1e-6;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const s = f * hop;
    for (let i = 0; i < hop * 1.5 && s + i < x.length; i++) e += x[s + i] ** 2;
    env[f] = Math.sqrt(e / (hop * 1.5));
    max = Math.max(max, env[f]);
  }
  const out = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) out[f] = Math.round(255 * Math.min(1, Math.pow(env[f] / (max * 0.8), 0.7)));
  return Buffer.from(out).toString('base64');
}
function mp3(x, sr) {
  const enc = new lamejs.Mp3Encoder(1, sr, KBPS);
  const pcm = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, x[i] * 32767));
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) chunks.push(Buffer.from(b));
  }
  chunks.push(Buffer.from(enc.flush()));
  return Buffer.concat(chunks);
}

// ---- optional round-trip check with Whisper ------------------------------------
let asr = null;
async function transcribe(x, sr) {
  if (!asr) {
    const { pipeline } = await import('@huggingface/transformers');
    asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', { dtype: 'q8' });
  }
  const y = resample(x, sr / 16000);
  return (await asr(y)).text.trim();
}
const words = (s) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
function wer(ref, hyp) {
  const a = words(ref), b = words(hyp);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] / a.length;
}

// ---- main ------------------------------------------------------------------------
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const clips = {};
let made = 0, bytes = 0, worst = 0;
for (const text of texts) {
  const id = idOf(text);
  const file = `${id}.mp3`;
  const prev = Object.values(old.clips).find((c) => c.file === file);
  if (prev && !args.has('--all') && fs.existsSync(path.join(OUT, file)) && !args.has('--check')) {
    clips[text] = prev;
    bytes += fs.statSync(path.join(OUT, file)).size;
    continue;
  }
  // Kokoro reads "CEO" and all-caps emphasis oddly; speak a cleaned-up version
  const spoken = text.replace(/\b([A-Z]{2,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase());
  const board = speakerOf.get(text) === 'board';
  const a = await tts.generate(spoken, { voice: board ? BOARD_VOICE : VOICE, speed: board ? 1.0 : SPEED });
  const sr = a.sampling_rate;
  let x = trim(a.audio, sr);
  if (board) {
    x = normalize(telephone(x, sr), 0.7);
  } else {
    x = resample(x, PITCH);
    x = normalize(saturate(warm(x, sr)));
  }
  const data = mp3(x, sr);
  fs.writeFileSync(path.join(OUT, file), data);
  clips[text] = { file, who: speakerOf.get(text), duration: +(x.length / sr).toFixed(3), env: envelope(x, sr) };
  made++;
  bytes += data.length;
  let note = '';
  if (args.has('--check')) {
    const heard = await transcribe(x, sr);
    const e = wer(text, heard);
    worst = Math.max(worst, e);
    note = `  WER ${(e * 100).toFixed(0)}%  heard: "${heard}"`;
  }
  console.log(`${file}  ${clips[text].duration.toFixed(2)}s  ${text.slice(0, 60)}${note}`);
}
// a filtered run (ONLY=...) only adds to the existing set
if (only) for (const [t, c] of Object.entries(old.clips)) if (!clips[t]) clips[t] = c;
// drop clips that no longer belong to any line
const keep = new Set(Object.values(clips).map((c) => c.file));
if (!only) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.mp3') && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
fs.writeFileSync(manifestPath, JSON.stringify({ voice: VOICE, fps: ENV_FPS, clips }, null, 0));
console.log(`\n${texts.length} lines (${made} rendered), ${(bytes / 1024).toFixed(0)} KB of audio` + (args.has('--check') ? `, worst WER ${(worst * 100).toFixed(0)}%` : ''));
