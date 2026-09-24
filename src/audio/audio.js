// Game audio. Apart from Waternoose's pre-recorded lines, everything is
// synthesized live in WebAudio:
//  - a synthetic child scream for keyboard players
//  - microphone scream detection
//  - stingers for awards, photos, the phone and power events
//  - a swing-jazz step sequencer for the crab dance
//  - leg taps and UI blips

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.mouth = 0;
    this.speaking = false;
    this.micLevel = 0;
    this.screamLevel = 0;
  }

  async init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // small room reverb from a synthesized impulse
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 1.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.18;
    this.verbSend.connect(this.verb).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this._buildVoice();
    this._buildScream();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  _noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  // ---- voice ----------------------------------------------------------------
  // Every line is pre-recorded (scripts/voice.mjs). Clips are fetched as soon as
  // the page loads and decoded once the AudioContext exists.
  static prefetchVoice() {
    if (AudioEngine._voiceFetch) return AudioEngine._voiceFetch;
    const base = new URL('./voice/', document.baseURI);
    AudioEngine._voiceFetch = fetch(new URL('manifest.json', base))
      .then((r) => (r.ok ? r.json() : { clips: {} }))
      .then(async (m) => {
        const entries = await Promise.all(Object.entries(m.clips).map(async ([text, c]) => {
          try {
            const bytes = await (await fetch(new URL(c.file, base))).arrayBuffer();
            const env = Uint8Array.from(atob(c.env), (ch) => ch.charCodeAt(0));
            return [text, { ...c, bytes, env }];
          } catch { return null; }
        }));
        return { fps: m.fps || 60, clips: new Map(entries.filter(Boolean)) };
      })
      .catch(() => ({ fps: 60, clips: new Map() }));
    return AudioEngine._voiceFetch;
  }

  _buildVoice() {
    const ctx = this.ctx;
    // a touch of warmth and room; the clips are already mastered
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 200; lowShelf.gain.value = 2;
    const deEss = ctx.createBiquadFilter();
    deEss.type = 'highshelf'; deEss.frequency.value = 6500; deEss.gain.value = -3;
    this.voiceIn = ctx.createGain();
    this.voiceIn.gain.value = 1.15;
    this.voiceIn.connect(lowShelf).connect(deEss);
    deEss.connect(this.master);
    const send = ctx.createGain(); send.gain.value = 0.55;
    deEss.connect(send).connect(this.verbSend);
    this.voiceReady = AudioEngine.prefetchVoice().then(async (v) => {
      this.voiceFps = v.fps;
      await Promise.all([...v.clips.values()].map(async (c) => {
        try { c.buffer = await ctx.decodeAudioData(c.bytes.slice(0)); } catch { /* skip */ }
      }));
      this.voiceClips = v.clips;
    });
  }

  // Speak a line. Returns its duration in seconds (0 if it can't be voiced).
  speak(text, { rate = 1 } = {}) {
    this.stopSpeaking();
    const clip = this.voiceClips?.get(text);
    if (!this.ctx || !clip?.buffer) return 0;
    const src = this.ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.playbackRate.value = rate; // villain mode: slower and deeper
    // the board is heard through the desk phone's little speaker, not his mouth
    if (clip.who === 'board') {
      if (!this.phoneOut) {
        this.phoneOut = this.ctx.createGain();
        this.phoneOut.gain.value = 0.85;
        this.phoneOut.connect(this.master);
        const s2 = this.ctx.createGain(); s2.gain.value = 0.35;
        this.phoneOut.connect(s2).connect(this.verbSend);
      }
      src.connect(this.phoneOut);
    } else {
      src.connect(this.voiceIn);
    }
    const t0 = this.ctx.currentTime + 0.03;
    src.start(t0);
    this._line = { src, clip, t0, rate, end: t0 + clip.buffer.duration / rate, mouth: clip.who !== 'board' };
    src.onended = () => { if (this._line?.src === src) this._line = null; };
    return clip.buffer.duration / rate + 0.03;
  }

  stopSpeaking() {
    if (!this._line) return;
    const { src } = this._line;
    this._line = null;
    try {
      const g = this.ctx.createGain();
      src.disconnect();
      src.connect(g).connect(this.voiceIn);
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      src.stop(this.ctx.currentTime + 0.1);
    } catch { /* already stopped */ }
  }

  // Mouth openness 0..1 from the clip's loudness envelope, a frame ahead so
  // the jaw leads the sound slightly like real speech.
  mouthOpen() {
    const l = this._line;
    if (!l || !l.mouth) return 0;
    const t = (this.ctx.currentTime - l.t0) * l.rate;
    if (t < 0) return 0;
    const f = t * this.voiceFps + 1.5;
    const i = Math.floor(f), env = l.clip.env;
    if (i >= env.length - 1) return 0;
    const v = env[i] + (env[i + 1] - env[i]) * (f - i);
    return (v / 255) * 1.1;
  }

  isSpeaking() { return !!this._line; }

  // ---- synthetic scream (hold space) -------------------------------------------------
  _buildScream() {
    const ctx = this.ctx;
    const s = {};
    s.osc = ctx.createOscillator(); s.osc.type = 'sawtooth'; s.osc.frequency.value = 900;
    s.osc2 = ctx.createOscillator(); s.osc2.type = 'square'; s.osc2.frequency.value = 903;
    s.vib = ctx.createOscillator(); s.vib.frequency.value = 7;
    s.vibG = ctx.createGain(); s.vibG.gain.value = 40;
    s.vib.connect(s.vibG); s.vibG.connect(s.osc.frequency); s.vibG.connect(s.osc2.frequency);
    const mix = ctx.createGain();
    s.osc.connect(mix);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; s.osc2.connect(g2).connect(mix);
    const n = this._noiseSrc(); const ng = ctx.createGain(); ng.gain.value = 0.3; n.connect(ng).connect(mix);
    s.out = ctx.createGain(); s.out.gain.value = 0;
    [[1100, 6], [1700, 8], [3100, 10]].forEach(([f, q], i) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = [1.4, 0.9, 0.5][i];
      mix.connect(bp).connect(g).connect(s.out);
    });
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.5); }
    shaper.curve = curve;
    s.out.connect(shaper).connect(this.master);
    shaper.connect(this.verbSend);
    for (const o of [s.osc, s.osc2, s.vib, n]) o.start();
    this.scream = s;
  }

  setScream(on) {
    if (!this.ctx) return;
    const s = this.scream, now = this.ctx.currentTime;
    if (on && !this._screaming) {
      const f = 850 + Math.random() * 300;
      s.osc.frequency.cancelScheduledValues(now);
      s.osc.frequency.setValueAtTime(f * 0.8, now);
      s.osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.35);
      s.osc.frequency.exponentialRampToValueAtTime(f * 1.1, now + 1.5);
      s.osc2.frequency.setValueAtTime(f * 0.8 + 3, now);
      s.osc2.frequency.exponentialRampToValueAtTime(f * 1.25 + 3, now + 0.35);
      s.out.gain.cancelScheduledValues(now);
      s.out.gain.setTargetAtTime(0.1, now, 0.04);
    } else if (!on && this._screaming) {
      s.out.gain.cancelScheduledValues(now);
      s.out.gain.setTargetAtTime(0, now, 0.08);
      s.osc.frequency.setTargetAtTime(s.osc.frequency.value * 0.7, now, 0.15);
    }
    this._screaming = on;
  }

  // ---- microphone ------------------------------------------------------------------
  async enableMic() {
    await this.init();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.micBuf = new Float32Array(this.analyser.fftSize);
    this.micFreq = new Uint8Array(this.analyser.frequencyBinCount);
    this.micStream = stream;
    return true;
  }
  disableMic() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.analyser = null;
    this.micLevel = 0;
  }

  // scream-ness of the mic signal 0..1: loud and pitched high
  sampleMic() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.micBuf);
    let sum = 0;
    for (let i = 0; i < this.micBuf.length; i++) sum += this.micBuf[i] * this.micBuf[i];
    const rms = Math.sqrt(sum / this.micBuf.length);
    this.analyser.getByteFrequencyData(this.micFreq);
    // spectral centroid
    let num = 0, den = 0;
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    for (let i = 2; i < this.micFreq.length; i++) { num += i * binHz * this.micFreq[i]; den += this.micFreq[i]; }
    const centroid = den ? num / den : 0;
    const loud = Math.min(1, Math.max(0, (rms - 0.03) / 0.22));
    const shrill = Math.min(1, Math.max(0.35, (centroid - 500) / 1500));
    this.micLevel = this.micLevel * 0.7 + Math.min(1, rms * 4) * 0.3;

    return loud * shrill;
  }

  // desk phone bell: a fast-struck pair of bells
  ring() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.07;
    out.connect(this.master); out.connect(this.verbSend);
    for (let i = 0; i < 24; i++) {
      const t = t0 + i * 0.05;
      for (const f of [1180, 1420]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * (1 + (i % 2) * 0.004);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.1);
      }
    }
  }

  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(bp).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.15);
  }

  // ---- UI & event stingers ------------------------------------------------------------
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [783.99, 987.77, 1318.5].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.09, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.9);
      o.connect(g); g.connect(this.master); g.connect(this.verbSend);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 1);
    });
  }

  shutter() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, f] of [[0, 3200], [0.07, 1800]]) {
      const n = this._noiseSrc();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.05);
      n.connect(bp).connect(g).connect(this.master);
      n.start(t + dt, Math.random()); n.stop(t + dt + 0.06);
    }
  }

  // rising electrical whoom (surge) or a dying one (brownout)
  powerSweep(up) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const [a, b] = up ? [60, 420] : [320, 38];
    for (const osc of [o, o2]) { osc.frequency.setValueAtTime(a, t); osc.frequency.exponentialRampToValueAtTime(b, t + 1.1); }
    o2.detune.value = 12;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(up ? 200 : 2400, t); lp.frequency.exponentialRampToValueAtTime(up ? 2600 : 150, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.15); g.gain.setTargetAtTime(0.0001, t + 1.0, 0.15);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master); g.connect(this.verbSend);
    o.start(t); o2.start(t); o.stop(t + 1.8); o2.stop(t + 1.8);
    // crackle
    for (let i = 0; i < 10; i++) {
      const ct = t + Math.random() * 1.1;
      const n = this._noiseSrc();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.08, ct); ng.gain.exponentialRampToValueAtTime(0.0001, ct + 0.02);
      n.connect(hp).connect(ng).connect(this.master);
      n.start(ct, Math.random()); n.stop(ct + 0.03);
    }
  }

  // a big, throaty monster roar: detuned saws through a falling formant + growl noise
  roar() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.3;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    out.gain.setTargetAtTime(0.35, t + 0.2, 0.3);
    out.gain.setTargetAtTime(0.0001, t + 1.0, 0.18);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
    shaper.curve = curve;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 3;
    f1.frequency.setValueAtTime(900, t); f1.frequency.exponentialRampToValueAtTime(450, t + 1.3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28;
    const lfoG = ctx.createGain(); lfoG.gain.value = 18;
    lfo.connect(lfoG);
    for (const [f, type] of [[70, 'sawtooth'], [72.5, 'sawtooth'], [140, 'square']]) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 1.4);
      lfoG.connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = type === 'square' ? 0.2 : 0.5;
      o.connect(g).connect(shaper);
      o.start(t); o.stop(t + 1.8);
    }
    const n = this._noiseSrc(); const ng = ctx.createGain(); ng.gain.value = 0.35;
    n.connect(ng).connect(f1);
    shaper.connect(f1);
    shaper.connect(lp);
    f1.connect(out); lp.connect(out);
    out.connect(this.master); out.connect(this.verbSend);
    n.start(t, Math.random()); n.stop(t + 1.8); lfo.start(t); lfo.stop(t + 1.8);
  }

  // ---- percussion & foley ----------------------------------------------------------
  tap(pan = 0, strength = 0.6) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 1500; bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * strength, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    n.connect(bp).connect(g).connect(p).connect(this.master);
    n.start(t, Math.random()); n.stop(t + 0.1);
    // woody knock
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.05);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.08 * strength, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og).connect(p); o.start(t); o.stop(t + 0.1);
  }

  blip(freq = 880, dur = 0.06, type = 'square', vol = 0.05) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  ding(i = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const f = [523.25, 587.33, 659.25, 783.99, 880][i % 5];
    for (const [mul, v] of [[1, 0.12], [2.76, 0.04], [5.4, 0.02]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(this.master); g.connect(this.verbSend); o.start(t); o.stop(t + 1.7);
    }
  }

  fanfare() {
    if (!this.ctx) return;
    const notes = [[349.23, 0], [440, 0.12], [523.25, 0.24], [698.46, 0.36], [698.46, 0.62]];
    notes.forEach(([f, dt], i) => this._brass(f, this.ctx.currentTime + dt, i === notes.length - 1 ? 1.1 : 0.2, 0.09));
  }

  _brass(freq, t, dur, vol = 0.07) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq * 1.004;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.05); lp.frequency.setTargetAtTime(1400, t + 0.08, 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setTargetAtTime(vol * 0.7, t + 0.05, 0.1);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master); g.connect(this.verbSend);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.4); o2.stop(t + dur + 0.4);
  }

  // ---- swing jazz sequencer -------------------------------------------------------------
  startMusic(bpm = 132) {
    if (!this.ctx || this.music) return;
    const ctx = this.ctx;
    const spb = 60 / bpm;
    const bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(this.master);
    // ii-V-I-VI in F, one bar each
    const prog = [
      { root: 98.0, chord: [196.0, 233.08, 293.66, 349.23], walk: [98.0, 116.54, 146.83, 138.59] }, // Gm7
      { root: 130.81, chord: [164.81, 233.08, 261.63, 329.63], walk: [130.81, 164.81, 196.0, 185.0] }, // C7
      { root: 87.31, chord: [220.0, 261.63, 329.63, 349.23], walk: [87.31, 110.0, 130.81, 110.0] }, // Fmaj7
      { root: 146.83, chord: [185.0, 261.63, 293.66, 369.99], walk: [146.83, 130.81, 110.0, 103.83] }, // D7
    ];
    const start = ctx.currentTime + 0.1;
    this.music = { bus, start, spb, next: 0, prog };
    const schedule = () => {
      const m = this.music;
      if (!m) return;
      const ahead = ctx.currentTime + 0.25;
      while (m.start + m.next * spb < ahead) {
        const beat = m.next;
        const t = m.start + beat * spb;
        const bar = Math.floor(beat / 4) % 4, b = beat % 4;
        const ch = prog[bar];
        // walking bass
        this._pluck(ch.walk[b], t, spb * 0.9, bus);
        // ride with swung skip note
        this._hat(t, 0.05, bus);
        if (b % 2 === 1) this._hat(t + spb * 0.66, 0.035, bus);
        // kick feathering + snare on 2 & 4
        this._kick(t, b === 0 ? 0.5 : 0.25, bus);
        if (b % 2 === 1) this._snare(t, bus);
        // brass stabs: Charleston rhythm
        if (b === 0) ch.chord.forEach((f) => this._brass(f, t, spb * 0.35, 0.028));
        if (b === 1) ch.chord.forEach((f) => this._brass(f, t + spb * 0.5, spb * 0.3, 0.024));
        m.next++;
      }
      m.timer = setTimeout(schedule, 50);
    };
    schedule();
  }
  stopMusic() {
    if (!this.music) return;
    clearTimeout(this.music.timer);
    const bus = this.music.bus;
    bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => bus.disconnect(), 1500);
    this.music = null;
  }
  // beat position in beats (float), for choreography
  musicBeat() {
    if (!this.music) return 0;
    return Math.max(0, (this.ctx.currentTime - this.music.start) / this.music.spb);
  }

  _pluck(f, t, dur, bus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.15;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(bus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  _hat(t, vol, bus) {
    const ctx = this.ctx;
    const n = this._noiseSrc();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(hp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.15);
  }
  _kick(t, vol, bus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3);
  }
  _snare(t, bus) {
    const ctx = this.ctx;
    const n = this._noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(bp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.2);
  }
}
