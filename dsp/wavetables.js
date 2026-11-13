// GoongWave — wavetable generation. Pure ES module: used by the page (which builds the tables and
// hands them to the AudioWorklet) and by the offline Node tests.
//
// A table is a row of single-cycle waves ("frames") that the oscillator scans and crossfades.
// Every frame is stored at LEVELS band-limited versions (level k keeps harmonics 1..1024>>k), so the
// oscillator can pick one whose top harmonic stays below Nyquist at the pitch being played.
// All tables are computed here from formulas; no sampled or third-party wave data is used.

export const N = 2048, LEVELS = 11;
const H = N / 2;
const TAU = 2 * Math.PI;

// ---------------------------------------------------------------- FFT (radix 2, size N)
const COS = new Float64Array(H), SIN = new Float64Array(H), REV = new Uint16Array(N);
for (let k = 0; k < H; k++) { COS[k] = Math.cos(TAU * k / N); SIN[k] = Math.sin(TAU * k / N); }
for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < 11; b++) r |= ((i >> b) & 1) << (10 - b); REV[i] = r; }
export function fft(re, im) {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const c = COS[k], s = SIN[k], a = i + j, b = a + half;
        const tr = re[b] * c + im[b] * s, ti = im[b] * c - re[b] * s;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}
const RE = new Float64Array(N), IM = new Float64Array(N);

// A spectrum is {a, b}: x(θ) = Σ a[h]·cos(hθ) + b[h]·sin(hθ), h = 1..H-1.
const spec = () => ({ a: new Float64Array(H), b: new Float64Array(H) });
function fromTime(x) {
  RE.set(x); IM.fill(0); fft(RE, IM);
  const s = spec();
  for (let h = 1; h < H; h++) { s.a[h] = 2 * RE[h] / N; s.b[h] = -2 * IM[h] / N; }
  return s;
}
// Writes the wave made of harmonics 1..maxH into RE.
function synth(s, maxH) {
  RE.fill(0); IM.fill(0);
  for (let h = 1; h <= maxH; h++) {
    const a = s.a[h] * 0.5, b = s.b[h] * 0.5;
    RE[h] = a; IM[h] = b; RE[N - h] = a; IM[N - h] = -b;
  }
  fft(RE, IM);
}

// ---------------------------------------------------------------- helpers for the generators
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const time = (fn) => { const x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = fn(i / N); return x; };
const sines = (fn, maxH = H - 1) => { const s = spec(); for (let h = 1; h <= maxH; h++) s.b[h] = fn(h); return s; };
const lerp = (p, q, t) => { const s = spec(); for (let h = 1; h < H; h++) { s.a[h] = p.a[h] + (q.a[h] - p.a[h]) * t; s.b[h] = p.b[h] + (q.b[h] - p.b[h]) * t; } return s; };
function pulse(w) { // ±1 pulse, high for a fraction w of the cycle; w = 0.5 is the square below
  const s = spec();
  for (let h = 1; h < H; h++) { const k = 2 / (Math.PI * h); s.a[h] = k * Math.sin(TAU * h * w); s.b[h] = k * (1 - Math.cos(TAU * h * w)); }
  return s;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SINE = sines((h) => (h === 1 ? 1 : 0));
const TRI = sines((h) => (h & 1 ? (8 / (Math.PI * Math.PI)) * ((h >> 1) & 1 ? -1 : 1) / (h * h) : 0));
const SAW = sines((h) => (2 / Math.PI) / h);
const SQUARE = pulse(0.5);

// Vowel formants (Hz) for a voice around 130 Hz.
const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240]];
const METAL = (() => {
  const r = rng(7), hs = [1, 3, 4, 7, 9, 11, 14, 17, 19, 23, 27, 31, 37, 41, 47];
  return hs.map((h) => ({ h, rate: 1 + Math.floor(r() * 3), ph: r(), psi: r() * TAU }));
})();
const SPECTRAL = (() => {
  const r = rng(21), keys = [];
  for (let k = 0; k < 8; k++) {
    const s = spec();
    for (let h = 1; h <= 32; h++) { const v = r(); s.b[h] = (r() < 0.5 ? -1 : 1) * v * v / Math.pow(h, 0.7); }
    s.b[1] = 0.5 + 0.5 * Math.abs(s.b[1]);
    keys.push(s);
  }
  return keys;
})();
const DRAWBARS = [[1, 1], [2, 0.8], [3, 0.7], [4, 0.6], [6, 0.5], [8, 0.45], [10, 0.4], [12, 0.35], [16, 0.3]];

// ---------------------------------------------------------------- the tables
// gen(t) with t = 0..1 along the table; returns a spectrum or a time-domain cycle (Float64Array).
export const TABLES = [
  { id: 'basic', name: ['Clásica', 'Classic'], frames: 49, gen(t) { // sine → triangle → saw → square → narrow pulse
    const u = t * 4;
    if (u < 1) return lerp(SINE, TRI, u);
    if (u < 2) return lerp(TRI, SAW, u - 1);
    if (u < 3) return lerp(SAW, SQUARE, u - 2);
    return pulse(0.5 - 0.4 * (u - 3));
  } },
  { id: 'pwm', name: ['Ancho de pulso', 'Pulse width'], frames: 48, gen: (t) => pulse(0.5 - 0.46 * t) },
  { id: 'reso', name: ['Resonante', 'Resonant'], frames: 64, gen(t) { // saw through a resonant low-pass that opens
    const hc = 1.5 * Math.pow(40, t);
    return sines((h) => { const r = h / hc, d = 1 - r * r; return (1 / h) / Math.sqrt(d * d + r * r / 25); });
  } },
  { id: 'vocal', name: ['Vocal', 'Vocal'], frames: 65, gen(t) { // A · E · I · O · U
    const u = t * 4, i = Math.min(3, Math.floor(u)), f = u - i;
    const F = VOWELS[i].map((v, k) => v + (VOWELS[i + 1][k] - v) * f), A = [1, 0.6, 0.35], BW = [70, 90, 120];
    const s = sines((h) => {
      let g = 0.02;
      for (let k = 0; k < 3; k++) { const d = (h * 130 - F[k]) / BW[k]; g += A[k] / (1 + d * d); }
      return g / h;
    }, 64);
    let mx = 0; for (let h = 1; h <= 64; h++) mx = Math.max(mx, s.b[h]);
    s.b[1] += 0.25 * mx;
    return s;
  } },
  { id: 'sync', name: ['Sync', 'Sync'], frames: 64, gen(t) { // saw slave hard-synced to the cycle, ratio 1 → 8
    const r = 1 + 7 * t;
    return time((p) => { const x = r * p; return 2 * (x - Math.floor(x)) - 1; });
  } },
  { id: 'organ', name: ['Órgano', 'Organ'], frames: 33, gen(t) { // drawbars pulled out one after another
    const s = spec();
    DRAWBARS.forEach(([h, w], i) => { s.b[h] = w * (i ? clamp(t * 8 - (i - 1), 0, 1) : 1); });
    return s;
  } },
  { id: 'fm1', name: ['FM 1:1', 'FM 1:1'], frames: 48, gen: (t) => time((p) => Math.sin(TAU * p + 7 * t * Math.sin(TAU * p))) },
  { id: 'fm3', name: ['FM 1:3', 'FM 1:3'], frames: 48, gen: (t) => time((p) => Math.sin(TAU * p + 5 * t * Math.sin(3 * TAU * p))) },
  { id: 'fold', name: ['Plegado', 'Wavefolder'], frames: 48, gen: (t) => time((p) => Math.sin(Math.PI / 2 * (1 + 7 * t) * Math.sin(TAU * p))) },
  { id: 'overtone', name: ['Armónicos', 'Overtones'], frames: 61, gen(t) { // one harmonic at a time, 1 → 16
    const c = 1 + 15 * t;
    const s = sines((h) => Math.exp(-(h - c) * (h - c) / 0.5), 20);
    s.b[1] = Math.max(s.b[1], 0.3);
    return s;
  } },
  { id: 'metal', name: ['Metal', 'Metal'], frames: 64, gen(t) { // sparse partials that fade in and out at their own rates
    const s = spec();
    for (const m of METAL) {
      const e = 0.5 + 0.5 * Math.cos(TAU * (t * m.rate + m.ph)), g = m.h === 1 ? 0.7 : Math.pow(m.h, -0.6) * e * e;
      s.a[m.h] = g * Math.cos(m.psi); s.b[m.h] = g * Math.sin(m.psi);
    }
    return s;
  } },
  { id: 'spectral', name: ['Espectral', 'Spectral'], frames: 57, gen(t) { // eight random spectra, blended
    const u = t * 7, i = Math.min(6, Math.floor(u)), f = u - i;
    return lerp(SPECTRAL[i], SPECTRAL[i + 1], 0.5 - 0.5 * Math.cos(Math.PI * f));
  } },
  { id: 'comb', name: ['Peine', 'Comb'], frames: 48, gen: (t) => sines((h) => Math.abs(Math.cos(Math.PI * h * 0.5 * t)) / h) }, // saw → saw an octave up
  { id: 'stairs', name: ['Escalera', 'Staircase'], frames: 33, gen(t) { // sine held on fewer and fewer steps, 64 → 4
    const m = Math.round(64 * Math.pow(1 / 16, t));
    return time((p) => Math.sin(TAU * (Math.floor(p * m) + 0.5) / m));
  } },
  { id: 'phase', name: ['Distorsión de fase', 'Phase distortion'], frames: 48, gen(t) { // cosine read with a bent phase
    const d = 0.5 - 0.48 * t;
    return time((p) => -Math.cos(TAU * (p < d ? 0.5 * p / d : 0.5 + 0.5 * (p - d) / (1 - d))));
  } },
];

// Returns { frames, data }. data[(frame * LEVELS + level) * N + i]; every frame is scaled to the same
// loudness (rms 0.4), with the peak held under 1.5 for the very narrow ones.
export function buildTable(index) {
  const t = TABLES[index], F = t.frames;
  const data = new Float32Array(F * LEVELS * N);
  for (let f = 0; f < F; f++) {
    let s = t.gen(f / (F - 1));
    if (s instanceof Float64Array) s = fromTime(s);
    let g = 1;
    for (let k = 0; k < LEVELS; k++) {
      synth(s, k === 0 ? H - 1 : H >> k);
      if (k === 0) {
        let sq = 0, pk = 0;
        for (let i = 0; i < N; i++) { const v = RE[i]; sq += v * v; if (v > pk) pk = v; else if (-v > pk) pk = -v; }
        g = 0.4 / Math.sqrt(sq / N + 1e-30);
        if (pk * g > 1.5) g = 1.5 / pk;
      }
      const o = (f * LEVELS + k) * N;
      for (let i = 0; i < N; i++) data[o + i] = RE[i] * g;
    }
  }
  return { frames: F, data };
}
