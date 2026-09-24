// dev-only: render one line in several Kokoro voices and report pitch stats
import { KokoroTTS } from 'kokoro-js';
import fs from 'node:fs';
const text = 'Ah! There you are. Come in, come in. Mind the legs, they have a mind of their own.';
const voices = (process.argv[2] || 'am_michael,am_fenrir,am_onyx,am_santa,am_eric,bm_george,bm_lewis,bm_daniel').split(',');
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
function f0Stats(x, sr) {
  const win = 1024, hop = 480, out = [];
  for (let s = 0; s + win < x.length; s += hop) {
    let e = 0; for (let i = 0; i < win; i++) e += x[s + i] * x[s + i];
    if (e / win < 1e-4) continue;
    let best = 0, bl = 0;
    for (let lag = Math.floor(sr / 300); lag < Math.floor(sr / 60); lag++) {
      let c = 0, n1 = 0, n2 = 0;
      for (let i = 0; i < win - lag; i++) { c += x[s + i] * x[s + i + lag]; n1 += x[s + i] ** 2; n2 += x[s + i + lag] ** 2; }
      const r = c / Math.sqrt(n1 * n2 + 1e-9);
      if (r > best) { best = r; bl = lag; }
    }
    if (best > 0.6) out.push(sr / bl);
  }
  out.sort((a, b) => a - b);
  return { median: out[out.length >> 1] | 0, p10: out[(out.length * 0.1) | 0] | 0, p90: out[(out.length * 0.9) | 0] | 0 };
}
function wav(x, sr) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, x[i] * 32767)), 44 + i * 2);
  return b;
}
for (const v of voices) {
  const t0 = Date.now();
  const a = await tts.generate(text, { voice: v, speed: 1 });
  const x = a.audio, sr = a.sampling_rate;
  fs.writeFileSync(`.voicetest/${v}.wav`, wav(x, sr));
  console.log(v.padEnd(11), 'dur', (x.length / sr).toFixed(2) + 's', 'F0', JSON.stringify(f0Stats(x, sr)), ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
