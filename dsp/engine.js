// GoongWave — DSP core of an 8-voice wavetable synthesizer with a 16-step analog-style sequencer.
// Pure ES module: used by the AudioWorklet and by the offline Node tests.
//
// Voice: two wavetable oscillators + square sub + noise → 4-pole ladder filter → amplifier.
// Three ADSRs per voice (wave position, filter, amplifier), two global LFOs.
// Bus: stereo chorus → ping-pong delay → reverb → master.
// Modulation is computed every K output samples and interpolated. The voices run per sample at twice the
// output rate (so the filter's saturation does not fold back) and are decimated before the effects.

import { PARAMS, PIDX, STEPS, NVOICES, envTime, cutHz, lfoHz, glideTime, delayTime, chorusHz, DIVS, syncSteps } from './params.js';
import { N, LEVELS } from './wavetables.js';

const K = 16, K2 = 2 * K, MASK = N - 1, FRAME = LEVELS * N;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ix = (id) => { const i = PIDX[id]; if (i === undefined) throw new Error('unknown parameter ' + id); return i; };
const IS_STEP = PARAMS.map((d) => d.step);

const OSC = [1, 2].map((n) => ({ pos: ix(`o${n}.pos`), env: ix(`o${n}.env`), oct: ix(`o${n}.oct`), semi: ix(`o${n}.semi`), fine: ix(`o${n}.fine`), mix: ix(`mix.o${n}`) }));
const LFO = [1, 2].map((n) => ({ rate: ix(`l${n}.rate`), shape: ix(`l${n}.shape`), pitch: ix(`l${n}.pitch`), wave: ix(`l${n}.wave`), cut: ix(`l${n}.cut`) }));
const ENV = ['wenv', 'fenv', 'aenv'].map((e) => ({ a: ix(e + '.a'), d: ix(e + '.d'), s: ix(e + '.s'), r: ix(e + '.r') }));
const MIX_SUB = ix('mix.sub'), MIX_NOISE = ix('mix.noise');
const VCF_CUT = ix('vcf.cut'), VCF_RES = ix('vcf.res'), VCF_ENV = ix('vcf.env'), VCF_KEY = ix('vcf.key'), VCF_DRIVE = ix('vcf.drive'), VCF_MODE = ix('vcf.mode');
const CH_RATE = ix('ch.rate'), CH_DEPTH = ix('ch.depth'), CH_MIX = ix('ch.mix');
const DL_TIME = ix('dl.time'), DL_FB = ix('dl.fb'), DL_MIX = ix('dl.mix'), DL_SYNC = ix('dl.sync');
const RV_SIZE = ix('rv.size'), RV_MIX = ix('rv.mix');
const M_GLIDE = ix('m.glide'), M_VEL = ix('m.vel'), M_VOL = ix('m.vol'), M_MODE = ix('m.mode');
const SEQ_RUN = ix('seq.run'), SEQ_BPM = ix('seq.bpm'), SEQ_DIV = ix('seq.div'), SEQ_DIR = ix('seq.dir'), SEQ_STEPS = ix('seq.steps');
const SEQ_GATE = ix('seq.gate'), SEQ_SWING = ix('seq.swing'), SEQ_WAVE = ix('seq.wave'), SEQ_CUT = ix('seq.cut');
const SEQ_N = ix('seq.n0'), SEQ_M = ix('seq.m0'), SEQ_G = ix('seq.g0');

const PAN = [0, -0.35, 0.35, -0.15, 0.15, -0.5, 0.5, 0]; // poly voices are spread a little across the stereo field
const VOICE_GAIN = 0.55, MONO_GAIN = 1.5;
export const SEQ_ROOT = 48; // the key that plays the sequence untransposed (C3)

function pblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Control-rate ADSR. The attack aims above the peak (as an RC contour does), decay and release are exponential.
class Env {
  constructor() { this.v = 0; this.st = 0; } // 0 idle · 1 attack · 2 decay/sustain · 3 release
  on() { this.st = 1; }
  off() { if (this.st) this.st = 3; }
  tick(ca, cd, s, cr) {
    if (this.st === 1) { this.v += (1.3 - this.v) * ca; if (this.v >= 1) { this.v = 1; this.st = 2; } }
    else if (this.st === 2) this.v += (s - this.v) * cd;
    else if (this.st === 3) { this.v -= this.v * cr; if (this.v < 1e-4) { this.v = 0; this.st = 0; } }
    return this.v;
  }
}

class Voice {
  constructor(i) {
    this.i = i;
    this.active = false; this.gate = false; this.fresh = false; this.kill = false;
    this.note = -1; this.vel = 0; this.age = 0;
    this.pitch = 60; this.target = 60;
    this.ph1 = 0; this.ph2 = 0; this.phs = 0;
    this.inc1 = 0; this.inc2 = 0; this.lv1 = 0; this.lv2 = 0;
    this.x1 = 0; this.x2 = 0; this.dx1 = 0; this.dx2 = 0;
    this.ew = new Env(); this.ef = new Env(); this.ea = new Env();
    this.amp = 0; this.damp = 0; this.g = 0.1; this.dg = 0;
    this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0;
    const a = (PAN[i] + 1) * Math.PI / 4;
    this.panL = Math.cos(a) * Math.SQRT2; this.panR = Math.sin(a) * Math.SQRT2;
  }
  reset() {
    this.ph1 = this.ph2 = this.phs = 0;
    this.s1 = this.s2 = this.s3 = this.s4 = 0;
    this.ew.v = this.ef.v = this.ea.v = 0; this.amp = 0;
  }
  trigger() { this.ew.on(); this.ef.on(); this.ea.on(); }
  release() { this.gate = false; this.ew.off(); this.ef.off(); this.ea.off(); }
}

// Half-band FIR (Kaiser window, 63 taps) for the 2x → 1x decimation.
class Decim2 {
  constructor() {
    const T = 63, c = (T - 1) / 2, beta = 8;
    const i0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 25; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; } return s; };
    this.h = new Float64Array(T);
    let sum = 0;
    for (let n = 0; n < T; n++) {
      const m = n - c, s = m === 0 ? 0.5 : Math.sin(Math.PI * m * 0.5) / (Math.PI * m);
      this.h[n] = s * i0(beta * Math.sqrt(1 - (m / c) * (m / c))) / i0(beta);
      sum += this.h[n];
    }
    for (let n = 0; n < T; n++) this.h[n] /= sum;
    this.T = T; this.buf = new Float64Array(64); this.pos = 0;
  }
  // two input samples in, one out
  step(a, b) {
    const h = this.h, buf = this.buf;
    let j = this.pos;
    buf[j] = a; j = (j + 1) & 63; buf[j] = b; j = (j + 1) & 63;
    this.pos = j;
    let y = 0;
    for (let n = this.T - 1; n >= 0; n--) { j = (j - 1) & 63; y += h[n] * buf[j]; }
    return y;
  }
}

// Stereo reverb (Schroeder/Moorer: 8 damped combs + 4 allpasses per side).
const RV_COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], RV_AP = [556, 441, 341, 225];
class Reverb {
  constructor(fs) {
    const sc = fs / 44100, mk = (len, spread) => len.map((n) => new Float32Array(Math.round((n + spread) * sc)));
    this.cb = [mk(RV_COMB, 0), mk(RV_COMB, 23)]; this.ab = [mk(RV_AP, 0), mk(RV_AP, 23)];
    this.ci = [new Int32Array(8), new Int32Array(8)]; this.ai = [new Int32Array(4), new Int32Array(4)];
    this.st = [new Float64Array(8), new Float64Array(8)];
    this.room = 0.9; this.damp = 0.4;
  }
  side(s, inp) {
    const cb = this.cb[s], ci = this.ci[s], st = this.st[s], ab = this.ab[s], ai = this.ai[s], room = this.room, damp = this.damp;
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      const b = cb[k], j = ci[k], y = b[j];
      let f = y * (1 - damp) + st[k] * damp;
      if (f < 1e-15 && f > -1e-15) f = 0;
      st[k] = f; b[j] = inp + f * room; ci[k] = j + 1 === b.length ? 0 : j + 1;
      sum += y;
    }
    for (let k = 0; k < 4; k++) {
      const b = ab[k], j = ai[k], bo = b[j];
      b[j] = sum + bo * 0.5; sum = bo - sum; ai[k] = j + 1 === b.length ? 0 : j + 1;
    }
    return sum;
  }
}

export class Engine {
  constructor(sampleRate) {
    const fs = this.fs = sampleRate;
    this.p = new Float64Array(PARAMS.length); this.pt = new Float64Array(PARAMS.length);
    PARAMS.forEach((d, i) => { this.p[i] = this.pt[i] = d.def; });
    this.ks = 1 - Math.exp(-K / (fs * 0.008));
    this.tab = [null, null];
    this.voices = Array.from({ length: NVOICES }, (_, i) => new Voice(i));
    this.stack = []; this.held = new Uint8Array(128); this.susHeld = new Uint8Array(128); this.sus = false;
    this.bend = 0; this.mod = 0; this.lastNote = -1; this.clock = 0;
    this.lfo = [{ ph: 0, v: 0, sh: 0 }, { ph: 0, v: 0, sh: 0 }];
    this.kc = 0; this.peak = 0;
    this.fs2 = 2 * fs;
    this.bl = new Float64Array(K2); this.br = new Float64Array(K2); this.decL = new Decim2(); this.decR = new Decim2();
    // per-block values shared by all voices
    this.c = { lfoPitch: 0, lfoWave: 0, lfoCut: 0, cg: 1, env: new Float64Array(12), pre: 1, post: 1, k: 0 };
    // sequencer
    this.sRun = false; this.sIdx = -1; this.sSign = 1; this.sCount = 0; this.sT = 0; this.sOff = 0;
    this.sNote = -1; this.sTie = false; this.root = SEQ_ROOT; this.seqMod = 0; this.seqModT = 0; this.stepSec = 0.125;
    // chorus
    this.cN = 1 << Math.ceil(Math.log2(fs * 0.03)); this.cl = new Float32Array(this.cN); this.cr = new Float32Array(this.cN); this.cw = 0; this.cph = 0;
    // delay
    this.dN = 1 << Math.ceil(Math.log2(fs * 1.1)); this.dbl = new Float32Array(this.dN); this.dbr = new Float32Array(this.dN); this.dw = 0;
    this.dd = fs * 0.3; this.dlpL = 0; this.dlpR = 0;
    this.dk = 1 - Math.exp(-2 * Math.PI * 4500 / fs); this.dks = 1 - Math.exp(-1 / (0.06 * fs));
    this.rv = new Reverb(fs);
  }

  // ---------------------------------------------------------------- control input
  setParam(id, v, jump) {
    const i = PIDX[id]; if (i === undefined) return;
    this.pt[i] = v;
    if (jump || IS_STEP[i]) {
      if (i === M_MODE && this.p[i] !== v) this.allOff();
      this.p[i] = v;
    }
  }
  setTable(slot, frames, data) {
    this.tab[slot] = { frames, data };
    for (const v of this.voices) { if (slot === 0) v.x1 = Math.min(v.x1, frames - 1); else v.x2 = Math.min(v.x2, frames - 1); }
  }
  // While the sequencer runs, the keys transpose it instead of playing.
  noteOn(n, vel) {
    if (this.p[SEQ_RUN] > 0.5) { this.root = n; return; }
    this.held[n] = 1; this.susHeld[n] = 0;
    this._on(n, vel);
  }
  noteOff(n) {
    if (!this.held[n]) return;
    this.held[n] = 0;
    if (this.sus) { this.susHeld[n] = 1; return; }
    this._off(n);
  }
  ctl(kind, v) {
    if (kind === 'bend') this.bend = v;
    else if (kind === 'mod') this.mod = v;
    else if (kind === 'sus') {
      this.sus = v >= 0.5;
      if (!this.sus) for (let n = 0; n < 128; n++) if (this.susHeld[n]) { this.susHeld[n] = 0; this._off(n); }
    }
  }
  allOff() {
    for (const v of this.voices) { if (v.active) { v.release(); v.kill = true; } }
    this.stack.length = 0; this.held.fill(0); this.susHeld.fill(0); this.sNote = -1; this.sTie = false;
  }

  _on(n, vel) {
    const mode = this.p[M_MODE] | 0, glide = this.pt[M_GLIDE] > 0, vs = this.voices;
    this.clock++;
    if (mode === 0) {
      let v = null;
      for (const w of vs) if (w.active && w.note === n) { v = w; break; }                    // same key again
      if (!v) for (const w of vs) if (!w.active && (!v || w.age < v.age)) v = w;             // a free voice, least recently used
      if (!v) for (const w of vs) if (!w.gate && (!v || w.age < v.age)) v = w;               // else steal the oldest released one
      if (!v) for (const w of vs) if (!v || w.age < v.age) v = w;                            // else the oldest
      if (!v.active) { v.reset(); v.fresh = true; v.active = true; v.pitch = glide && this.lastNote >= 0 ? this.lastNote : n; }
      else if (!glide) v.pitch = n;
      v.note = v.target = n; v.vel = vel; v.gate = true; v.kill = false; v.age = this.clock;
      v.trigger();
    } else {
      const st = this.stack, k = st.indexOf(n), v = vs[0];
      if (k >= 0) st.splice(k, 1);
      const tied = st.length > 0 && v.active && v.gate; // played while another key is down
      st.push(n);
      if (!v.active) { v.reset(); v.fresh = true; v.active = true; v.pitch = mode === 1 && glide && this.lastNote >= 0 ? this.lastNote : n; }
      else if (mode === 2 ? !tied : !glide) v.pitch = n; // legato glides only between tied notes
      v.note = v.target = n; v.vel = vel; v.gate = true; v.kill = false; v.age = this.clock;
      if (!(mode === 2 && tied)) v.trigger();
    }
    this.lastNote = n;
  }
  _off(n) {
    if ((this.p[M_MODE] | 0) === 0) {
      for (const v of this.voices) if (v.gate && v.note === n) v.release();
      return;
    }
    const st = this.stack, k = st.indexOf(n), v = this.voices[0];
    if (k >= 0) st.splice(k, 1);
    if (!st.length) { if (v.gate) v.release(); }
    else if (v.note === n) { v.note = v.target = this.lastNote = st[st.length - 1]; } // back to the key still held
  }

  // ---------------------------------------------------------------- sequencer (runs at control rate)
  seqTick() {
    const p = this.p, run = p[SEQ_RUN] > 0.5;
    if (run !== this.sRun) {
      this.sRun = run;
      if (run) { this.sIdx = -1; this.sSign = 1; this.sCount = 0; this.sT = 0; this.sOff = 0; this.sTie = false; }
      else { if (this.sNote >= 0) this._off(this.sNote); this.sNote = -1; this.sIdx = -1; this.seqModT = 0; }
    }
    this.seqMod += (this.seqModT - this.seqMod) * 0.5;
    if (!run) return;
    if (this.sOff > 0) { this.sOff -= K; if (this.sOff <= 0 && this.sNote >= 0) { this._off(this.sNote); this.sNote = -1; } }
    this.sT -= K;
    if (this.sT > 0) return;

    const steps = p[SEQ_STEPS] | 0, dir = p[SEQ_DIR] | 0;
    let i = this.sIdx;
    if (dir === 3) i = Math.floor(Math.random() * steps);
    else if (i < 0) i = dir === 1 ? steps - 1 : 0;
    else if (dir === 0) i = (i + 1) % steps;
    else if (dir === 1) i = (i - 1 + steps) % steps;
    else if (steps < 2) i = 0;
    else { i += this.sSign; if (i >= steps) { i = steps - 2; this.sSign = -1; } else if (i < 0) { i = 1; this.sSign = 1; } }
    if (i >= steps) i = steps - 1;

    this.stepSec = 60 / p[SEQ_BPM] * DIVS[p[SEQ_DIV] | 0];
    const sw = p[SEQ_SWING] * 0.5, len = this.stepSec * this.fs * (this.sCount & 1 ? 1 - sw : 1 + sw);
    this.sT += len;
    const gt = p[SEQ_G + i] | 0, wasTied = this.sTie && this.sNote >= 0;
    this.sTie = false;
    if (gt === 0) { if (this.sNote >= 0) { this._off(this.sNote); this.sNote = -1; } this.sOff = 0; }
    else {
      const n = clamp(this.root + p[SEQ_N + i], 0, 127), old = this.sNote;
      if (!(wasTied && old === n)) { // a tie into the same note just keeps it sounding
        this._on(n, 0.8);
        if (old >= 0 && old !== n) this._off(old); // released after the new note starts, so a tie plays legato
      }
      this.sNote = n;
      if (gt === 2) { this.sTie = true; this.sOff = 0; } else this.sOff = Math.max(K, len * p[SEQ_GATE]);
    }
    this.seqModT = p[SEQ_M + i];
    this.sIdx = i; this.sCount++;
  }

  // ---------------------------------------------------------------- control tick
  control() {
    const p = this.p, pt = this.pt, fs = this.fs, c = this.c, ks = this.ks;
    for (let k = 0; k < p.length; k++) { const d = pt[k] - p[k]; if (d !== 0) p[k] = (d < 1e-6 && d > -1e-6) ? pt[k] : p[k] + d * ks; }
    this.seqTick();

    c.lfoPitch = 0; c.lfoWave = 0; c.lfoCut = 0;
    for (let l = 0; l < 2; l++) {
      const L = this.lfo[l], o = LFO[l];
      L.ph += K * lfoHz(p[o.rate]) / fs;
      if (L.ph >= 1) { L.ph -= 1; L.sh = Math.random() * 2 - 1; }
      const ph = L.ph, sh = p[o.shape] | 0;
      const v = sh === 0 ? Math.sin(2 * Math.PI * ph) : sh === 1 ? 1 - 4 * Math.abs(ph - 0.5) : sh === 2 ? 1 - 2 * ph : sh === 3 ? (ph < 0.5 ? 1 : -1) : L.sh;
      L.v = v;
      c.lfoPitch += v * (p[o.pitch] * p[o.pitch] * 12 + (l === 0 ? this.mod * 0.6 : 0)); // the mod wheel adds LFO 1 vibrato
      c.lfoWave += v * p[o.wave] * 0.5;
      c.lfoCut += v * p[o.cut] * 3;
    }
    const gt = glideTime(p[M_GLIDE]);
    c.cg = gt > 0 ? 1 - Math.exp(-K / (fs * gt / 3)) : 1;
    for (let e = 0; e < 3; e++) {
      const o = ENV[e], q = c.env, b = e * 4;
      q[b] = 1 - Math.exp(-K * 1.466 / (fs * envTime(p[o.a])));
      q[b + 1] = 1 - Math.exp(-K * 4.6 / (fs * envTime(p[o.d])));
      q[b + 2] = p[o.s];
      q[b + 3] = 1 - Math.exp(-K * 4.6 / (fs * envTime(p[o.r])));
    }
    const drive = p[VCF_DRIVE];
    c.pre = 0.4 + 1.6 * drive * drive; c.post = Math.pow(c.pre, -0.7);
    c.k = p[VCF_RES] * 4.1;
    for (const v of this.voices) if (v.active) this.voiceControl(v);
  }

  voiceControl(v) {
    const p = this.p, c = this.c, fs = this.fs2, q = c.env;
    if (v.kill && !v.fresh && v.amp < 1e-4) { v.active = false; v.kill = false; return; }
    const w = v.ew.tick(q[0], q[1], q[2], q[3]);
    const f = v.ef.tick(q[4], q[5], q[6], q[7]);
    const a = v.ea.tick(q[8], q[9], q[10], q[11]);
    if (v.ea.st === 0 && !v.fresh) { v.active = false; return; }

    v.pitch += (v.target - v.pitch) * c.cg;
    const base = v.pitch + this.bend * 2 + c.lfoPitch;
    const sm = this.seqMod, wmod = c.lfoWave + sm * p[SEQ_WAVE];
    for (let o = 0; o < 2; o++) {
      const d = OSC[o], t = this.tab[o];
      const hz = 440 * Math.pow(2, (base + p[d.oct] * 12 + p[d.semi] + p[d.fine] * 0.01 - 69) / 12);
      const inc = Math.min(0.45, hz / fs);
      // band-limited copy: harmonics stay below the output sample rate, i.e. inside what the decimator removes
      const lv = clamp(Math.ceil(Math.log2(2048 * inc)), 0, LEVELS - 1);
      const xt = t ? clamp(p[d.pos] + p[d.env] * w + wmod, 0, 1) * (t.frames - 1) : 0;
      if (o === 0) { v.inc1 = inc; v.lv1 = lv; if (v.fresh) v.x1 = xt; v.dx1 = (xt - v.x1) / K2; }
      else { v.inc2 = inc; v.lv2 = lv; if (v.fresh) v.x2 = xt; v.dx2 = (xt - v.x2) / K2; }
    }
    const oct = p[VCF_ENV] * f * 9 + p[VCF_KEY] * (v.pitch - 60) / 12 + c.lfoCut + sm * p[SEQ_CUT] * 6;
    const fc = clamp(cutHz(p[VCF_CUT]) * Math.pow(2, oct), 16, Math.min(24000, 0.45 * fs));
    const g = Math.tan(Math.PI * fc / fs);
    const amp = v.kill ? 0 : a * (1 - p[M_VEL] * (1 - v.vel));
    if (v.fresh) { v.g = g; v.amp = 0; v.fresh = false; }
    v.dg = (g - v.g) / K2; v.damp = (amp - v.amp) / K2;
  }

  // ---------------------------------------------------------------- one voice, m samples (at 2x) into the bus
  render(v, m) {
    const p = this.p, c = this.c, bl = this.bl, br = this.br;
    const t1 = this.tab[0], t2 = this.tab[1];
    const m1 = t1 ? p[OSC[0].mix] : 0, m2 = t2 ? p[OSC[1].mix] : 0, ms = p[MIX_SUB] * 0.6, mn = p[MIX_NOISE] * 0.7;
    const inc1 = v.inc1, inc2 = v.inc2, incs = inc1 * 0.5;
    let ph1 = v.ph1, ph2 = v.ph2, phs = v.phs;
    let d1 = null, oA1 = 0, oB1 = 0, w1 = 0, d2 = null, oA2 = 0, oB2 = 0, w2 = 0;
    if (m1 > 0) { d1 = t1.data; const f = clamp(v.x1 | 0, 0, t1.frames - 2); oA1 = f * FRAME + v.lv1 * N; oB1 = oA1 + FRAME; w1 = v.x1 - f; }
    if (m2 > 0) { d2 = t2.data; const f = clamp(v.x2 | 0, 0, t2.frames - 2); oA2 = f * FRAME + v.lv2 * N; oB2 = oA2 + FRAME; w2 = v.x2 - f; }
    const dw1 = v.dx1, dw2 = v.dx2;
    const mono = (p[M_MODE] | 0) !== 0, pl = mono ? MONO_GAIN : v.panL, pr = mono ? MONO_GAIN : v.panR;
    const pre = c.pre, post = c.post * VOICE_GAIN, k = c.k, comp = 1 + 0.35 * k, mode = p[VCF_MODE] | 0;
    let g = v.g, amp = v.amp, s1 = v.s1, s2 = v.s2, s3 = v.s3, s4 = v.s4;
    const dg = v.dg, da = v.damp;

    for (let j = 0; j < m; j++) {
      let x = 0;
      if (m1 > 0) {
        ph1 += inc1; if (ph1 >= 1) ph1 -= 1;
        const q = ph1 * N, qi = q | 0, qf = q - qi, qj = (qi + 1) & MASK;
        let a = d1[oA1 + qi]; a += (d1[oA1 + qj] - a) * qf;
        let b = d1[oB1 + qi]; b += (d1[oB1 + qj] - b) * qf;
        x += (a + (b - a) * w1) * m1; w1 += dw1;
      }
      if (m2 > 0) {
        ph2 += inc2; if (ph2 >= 1) ph2 -= 1;
        const q = ph2 * N, qi = q | 0, qf = q - qi, qj = (qi + 1) & MASK;
        let a = d2[oA2 + qi]; a += (d2[oA2 + qj] - a) * qf;
        let b = d2[oB2 + qi]; b += (d2[oB2 + qj] - b) * qf;
        x += (a + (b - a) * w2) * m2; w2 += dw2;
      }
      if (ms > 0) {
        phs += incs; if (phs >= 1) phs -= 1;
        let h = phs + 0.5; if (h >= 1) h -= 1;
        x += ((phs < 0.5 ? 1 : -1) + pblep(phs, incs) - pblep(h, incs)) * ms;
      }
      if (mn > 0) x += (Math.random() * 2 - 1) * mn;

      // 4-pole ladder, zero-delay feedback solved exactly, one saturator in the loop
      g += dg;
      const G = g / (1 + g), G2 = G * G;
      const S = (G2 * G * s1 + G2 * s2 + G * s3 + s4) / (1 + g);
      let u = (x * pre * comp - k * S) / (1 + k * G2 * G2);
      if (u > 3) u = 3; else if (u < -3) u = -3;
      u = u * (27 + u * u) / (27 + 9 * u * u);
      let t = (u - s1) * G; const y1 = t + s1; s1 = y1 + t;
      t = (y1 - s2) * G; const y2 = t + s2; s2 = y2 + t;
      t = (y2 - s3) * G; const y3 = t + s3; s3 = y3 + t;
      t = (y3 - s4) * G; const y4 = t + s4; s4 = y4 + t;
      const y = mode === 0 ? y4 : mode === 1 ? y2 : mode === 2 ? 4 * (y2 - 2 * y3 + y4) : u - 2 * y1 + y2;

      amp += da;
      const o = y * amp * post;
      bl[j] += o * pl; br[j] += o * pr;
    }
    v.ph1 = ph1; v.ph2 = ph2; v.phs = phs;
    v.x1 += dw1 * m; v.x2 += dw2 * m;
    v.g = g; v.amp = amp; v.s1 = s1; v.s2 = s2; v.s3 = s3; v.s4 = s4;
  }

  // ---------------------------------------------------------------- audio
  process(L, R) {
    const n = L.length, p = this.p, fs = this.fs, bl = this.bl, br = this.br, rv = this.rv, decL = this.decL, decR = this.decR;
    const cl = this.cl, cr = this.cr, cM = this.cN - 1, dbl = this.dbl, dbr = this.dbr, dM = this.dN - 1;
    let i = 0;
    while (i < n) {
      if (this.kc === 0) this.control();
      const m = Math.min(K - this.kc, n - i);
      const m2 = 2 * m;
      for (let j = 0; j < m2; j++) { bl[j] = 0; br[j] = 0; }
      for (const v of this.voices) if (v.active && !v.fresh) this.render(v, m2);

      const chInc = chorusHz(p[CH_RATE]) / fs, chD = p[CH_DEPTH] * 0.004 * fs, chC = 0.007 * fs, chMix = p[CH_MIX];
      const dTgt = clamp((p[DL_SYNC] > 0.5 ? this.stepSec * syncSteps(p[DL_TIME]) : delayTime(p[DL_TIME])) * fs, 64, this.dN - 8);
      const dFb = p[DL_FB] * 0.9, dMix = p[DL_MIX], dk = this.dk, dks = this.dks;
      const rMix = p[RV_MIX], vol = p[M_VOL] * p[M_VOL] * 1.4;
      rv.room = 0.72 + p[RV_SIZE] * 0.265;
      for (let j = 0; j < m; j++) {
        let l = decL.step(bl[2 * j], bl[2 * j + 1]), r = decR.step(br[2 * j], br[2 * j + 1]);
        // chorus: one modulated line per side, swept in opposite directions
        {
          let ph = this.cph + chInc; if (ph >= 1) ph -= 1; this.cph = ph;
          const tri = 1 - 4 * (ph < 0.5 ? 0.5 - ph : ph - 0.5), w = this.cw;
          cl[w] = l; cr[w] = r;
          if (chMix > 0) {
            let a = w - (chC + chD * tri); if (a < 0) a += this.cN;
            let b = w - (chC - chD * tri); if (b < 0) b += this.cN;
            const a0 = a | 0, b0 = b | 0;
            const wl = cl[a0] + (cl[(a0 + 1) & cM] - cl[a0]) * (a - a0), wr = cr[b0] + (cr[(b0 + 1) & cM] - cr[b0]) * (b - b0);
            l = l * (1 - 0.3 * chMix) + wl * chMix * 0.8; r = r * (1 - 0.3 * chMix) + wr * chMix * 0.8;
          }
          this.cw = (w + 1) & cM;
        }
        // ping-pong delay: dark, softly saturating repeats; the time is slewed so it bends when it moves
        {
          this.dd += (dTgt - this.dd) * dks;
          const w = this.dw;
          let a = w - this.dd; if (a < 0) a += this.dN;
          const a0 = a | 0, a1 = (a0 + 1) & dM, fr = a - a0;
          this.dlpL += (dbl[a0] + (dbl[a1] - dbl[a0]) * fr - this.dlpL) * dk;
          this.dlpR += (dbr[a0] + (dbr[a1] - dbr[a0]) * fr - this.dlpR) * dk;
          dbl[w] = 2 * Math.tanh(((l + r) * 0.5 + this.dlpR * dFb) * 0.5);
          dbr[w] = 2 * Math.tanh(this.dlpL * dFb * 0.5);
          this.dw = (w + 1) & dM;
          l += this.dlpL * dMix; r += this.dlpR * dMix;
        }
        if (rMix > 0) {
          const inp = (l + r) * 0.5 * 0.045, wl = rv.side(0, inp), wr = rv.side(1, inp);
          l = l * (1 - 0.4 * rMix) + wl * rMix * 1.5; r = r * (1 - 0.4 * rMix) + wr * rMix * 1.5;
        }
        l *= vol; r *= vol;
        const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
        if (al > 0.6) l = (l < 0 ? -1 : 1) * (0.6 + 0.4 * Math.tanh((al - 0.6) * 2.5));
        if (ar > 0.6) r = (r < 0 ? -1 : 1) * (0.6 + 0.4 * Math.tanh((ar - 0.6) * 2.5));
        if (!(l === l) || !(r === r)) { l = 0; r = 0; } // never emit NaN
        const pk = al > ar ? al : ar; if (pk > this.peak) this.peak = pk;
        L[i + j] = l; R[i + j] = r;
      }
      this.kc += m; if (this.kc >= K) this.kc = 0;
      i += m;
    }
  }

  // For the panel: sequencer step, sounding voices, wave positions of the newest voice, output peak.
  state() {
    let nv = null, mask = 0;
    for (const v of this.voices) if (v.active) { mask |= 1 << v.i; if (!nv || v.age > nv.age) nv = v; }
    const t = this.tab, pk = this.peak; this.peak = 0;
    return {
      step: this.sRun ? this.sIdx : -1, voices: mask, peak: pk,
      pos: nv ? [t[0] ? nv.x1 / (t[0].frames - 1) : 0, t[1] ? nv.x2 / (t[1].frames - 1) : 0] : null,
    };
  }
}
