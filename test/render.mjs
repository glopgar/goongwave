// Offline sanity tests: node test/render.mjs
import { Engine } from '../dsp/engine.js';
import { PARAMS, PIDX, defaults, NVOICES } from '../dsp/params.js';
import { TABLES, buildTable, fft, N, LEVELS } from '../dsp/wavetables.js';
import { FACTORY, CATS } from '../js/presets.js';

let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('  FAIL', msg); } };
const SR = 48000;

const cache = new Map();
const table = (i) => { if (!cache.has(i)) cache.set(i, buildTable(i)); return cache.get(i); };
function load(params = {}) {
  const en = new Engine(SR), all = { ...defaults(), ...params };
  for (const [id, v] of Object.entries(all)) en.setParam(id, v, true);
  for (const slot of [0, 1]) { const t = table(all[`o${slot + 1}.table`]); en.setTable(slot, t.frames, t.data); }
  return en;
}
function render(en, secs) {
  const n = Math.round(secs * SR / 128) * 128, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 128) en.process(L.subarray(i, i + 128), R.subarray(i, i + 128));
  return L;
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
function pitch(x, a, n = 8192) { // frequency from the rising zero crossings (for waves that cross once a cycle)
  let first = -1, last = -1, count = 0;
  for (let i = a + 1; i < a + n; i++) if (x[i - 1] < 0 && x[i] >= 0) {
    const t = i - 1 + x[i - 1] / (x[i - 1] - x[i]);
    if (first < 0) first = t; last = t; count++;
  }
  return count > 1 ? SR * (count - 1) / (last - first) : 0;
}

// 1. parameter list
{
  ok(new Set(PARAMS.map((d) => d.id)).size === PARAMS.length, 'duplicate parameter ids');
  for (const d of PARAMS) ok(d.def >= d.min && d.def <= d.max, `${d.id}: default out of range`);
  console.log(PARAMS.length, 'parameters');
}

// 2. wavetables: finite, every level band-limited, consistent loudness
{
  const re = new Float64Array(N), im = new Float64Array(N);
  let ms = 0;
  TABLES.forEach((def, ti) => {
    const t0 = performance.now(), t = table(ti); ms += performance.now() - t0;
    ok(t.data.every((v) => v === v && Math.abs(v) <= 2), `${def.id}: bad sample values`);
    for (const f of [0, t.frames >> 1, t.frames - 1]) {
      ok(Math.abs(rms(t.data, f * LEVELS * N, f * LEVELS * N + N) - 0.4) < 0.15, `${def.id} frame ${f}: loudness`);
      for (let k = 1; k < LEVELS; k++) {
        const o = (f * LEVELS + k) * N, top = 1024 >> k;
        for (let i = 0; i < N; i++) { re[i] = t.data[o + i]; im[i] = 0; }
        fft(re, im);
        let above = 0; for (let h = top + 1; h < N / 2; h++) above = Math.max(above, Math.hypot(re[h], im[h]) / N);
        ok(above < 1e-6, `${def.id} frame ${f} level ${k}: harmonics above ${top}`);
      }
    }
  });
  console.log(`${TABLES.length} wavetables, ${(ms / TABLES.length).toFixed(0)} ms each to build`);
}

// 3. factory patches: known parameters in range, sound without clipping, silence after release
ok(FACTORY.every((p) => CATS.includes(p.cat)), 'patch with unknown category');
for (const preset of FACTORY) {
  for (const [id, v] of Object.entries(preset.params)) {
    const d = PARAMS[PIDX[id]];
    ok(d, `${preset.name}: unknown parameter ${id}`);
    if (d) ok(v >= d.min && v <= d.max && (!d.step || Number.isInteger(v)), `${preset.name}: ${id} = ${v} out of range`);
  }
  const en = load(preset.params), seq = preset.params['seq.run'] === 1;
  if (!seq) for (const n of [48, 55, 64]) en.noteOn(n, 0.8);
  const t0 = performance.now();
  const x = render(en, 4);
  const cpu = (performance.now() - t0) / 4000;
  if (seq) en.setParam('seq.run', 0); else for (const n of [48, 55, 64]) en.noteOff(n);
  en.setParam('dl.fb', 0); en.setParam('rv.size', 0);
  const tail = render(en, 14);
  console.log(`${preset.name.slice(0, 34).padEnd(34)} rms ${rms(x).toFixed(3)} peak ${peak(x).toFixed(3)} tail ${rms(tail, 13 * SR).toFixed(5)} cpu ${(cpu * 100).toFixed(1)}%`);
  ok(!x.some((v) => v !== v), `${preset.name}: NaN in output`);
  ok(rms(x) > 0.01, `${preset.name}: silent`);
  ok(peak(x) <= 1.0, `${preset.name}: clipping`);
  ok(rms(tail, 13 * SR) < 1e-3, `${preset.name}: does not fall silent`);
}

// 4. tuning: A3 (MIDI 57) is 220 Hz; octave and semitone switches
{
  for (const [extra, want] of [[{}, 220], [{ 'o1.oct': 1 }, 440], [{ 'o1.semi': 7, 'o1.oct': -1 }, 164.81]]) {
    const en = load({ 'vcf.cut': 1, ...extra });
    en.noteOn(57, 1);
    const f = pitch(render(en, 1), 20000, 16384);
    console.log('tuning', JSON.stringify(extra), f.toFixed(2), 'Hz');
    ok(Math.abs(f / want - 1) < 0.006, `tuning off: ${f} vs ${want}`);
  }
}

// 5. aliasing: a bright wave played high must not fold back audibly. The note is placed on an FFT bin so
// every harmonic lands on a multiple of it and anything else in the spectrum is an artefact.
{
  const bin = 150, hz = bin * SR / N, note = 69 + 12 * Math.log2(hz / 440);
  const en = load({ 'o1.table': 0, 'o1.pos': 0.5, 'vcf.cut': 1, 'vcf.res': 0, 'vcf.key': 0, 'vcf.drive': 0, 'o1.semi': 0, 'm.vol': 0.5 });
  en.voices[0].panL = en.voices[0].panR = 1;
  en.noteOn(Math.floor(note), 1); en.voices.forEach((v) => { v.target = v.pitch = note; });
  const x = render(en, 1), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { re[i] = x[20000 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
  fft(re, im);
  let sig = 0, art = 0;
  for (let h = 4; h < N / 2; h++) {
    const m = Math.hypot(re[h], im[h]), d = h % bin;
    if (d <= 2 || d >= bin - 2) sig = Math.max(sig, m); else if (h * SR / N < 15000) art = Math.max(art, m);
  }
  const db = 20 * Math.log10(art / sig);
  console.log(`aliasing below 15 kHz, saw at ${hz.toFixed(0)} Hz: ${db.toFixed(1)} dB`);
  ok(db < -60, 'audible aliasing');
}

// 6. filter: the cutoff knob darkens a saw; full resonance self-oscillates near the cutoff
{
  const level = (cut) => { const en = load({ 'o1.pos': 0.5, 'vcf.cut': cut, 'vcf.key': 0 }); en.noteOn(45, 1); return rms(render(en, 0.5), 12000); };
  const open = level(1), closed = level(0.2);
  console.log('filter: open', open.toFixed(3), 'closed', closed.toFixed(4));
  ok(closed < open * 0.2, 'cutoff does not close');
  const en = load({ 'mix.o1': 0, 'mix.noise': 0.02, 'vcf.res': 1, 'vcf.cut': Math.log(1000 / 20) / Math.log(1000), 'vcf.key': 0 });
  en.noteOn(60, 1);
  const f = pitch(render(en, 1.5), 40000, 16384);
  console.log('self-oscillation at a 1 kHz cutoff:', f.toFixed(1), 'Hz');
  ok(Math.abs(f / 1000 - 1) < 0.05, 'self-oscillation off pitch');
}

// 7. envelope: attack at 0.5 reaches the peak in about 100 ms
{
  const en = load({ 'aenv.a': 0.5, 'aenv.s': 1 });
  en.noteOn(60, 1);
  let n = 0; const b = new Float32Array(128);
  while (en.voices.every((v) => v.ea.st !== 2) && n < 1e6) { en.process(b, b); n += 128; }
  console.log('attack at 0.5:', (n / SR * 1000).toFixed(1), 'ms');
  ok(Math.abs(n / SR - 0.1) < 0.01, 'attack time off');
}

// 8. voice allocation
{
  const active = (en) => en.voices.filter((v) => v.active).length;
  let en = load();
  for (let i = 0; i < NVOICES + 2; i++) en.noteOn(40 + i, 0.8);
  render(en, 0.05);
  ok(active(en) === NVOICES, 'poly: expected all voices in use');
  ok(en.voices.some((v) => v.note === 40 + NVOICES + 1), 'poly: newest note not sounding');
  for (let i = 0; i < NVOICES + 2; i++) en.noteOff(40 + i);
  render(en, 3);
  ok(active(en) === 0, 'poly: voices did not free');

  en = load({ 'm.mode': 2, 'm.glide': 0.5 });
  en.noteOn(48, 0.8); render(en, 0.3);
  const st = en.voices[0].ea.st;
  en.noteOn(60, 0.8); render(en, 0.01);
  ok(active(en) === 1 && en.voices[0].ea.st === st && st === 2, 'legato: tied note retriggered');
  ok(en.voices[0].pitch > 48 && en.voices[0].pitch < 60, 'legato: no glide between tied notes');
  en.noteOff(60); render(en, 0.01);
  ok(en.voices[0].target === 48 && en.voices[0].gate, 'mono: did not return to the held key');
  en.noteOff(48); render(en, 0.01);
  ok(!en.voices[0].gate, 'mono: gate stuck');

  en = load();
  en.ctl('sus', 1); en.noteOn(60, 0.8); en.noteOff(60); render(en, 0.5);
  ok(en.voices.some((v) => v.gate), 'sustain pedal does not hold');
  en.ctl('sus', 0); render(en, 0.01);
  ok(!en.voices.some((v) => v.gate), 'sustain pedal does not release');
}

// 9. sequencer: timing, directions, rests, ties, transposition
{
  const walk = (params, secs) => {
    const en = load({ 'seq.run': 1, ...params }), seen = [];
    const b = new Float32Array(128);
    for (let i = 0; i < secs * SR; i += 128) { en.process(b, b); const s = en.state().step; if (s !== seen[seen.length - 1]) seen.push(s); }
    return { en, seen };
  };
  let r = walk({}, 1.95); // 120 BPM, sixteenths: 8 steps a second
  console.log('sequencer, 2 s forward at 120 BPM:', r.seen.join(' '));
  ok(r.seen.length === 16 && r.seen.every((s, i) => s === i), 'forward: wrong steps or tempo');
  r = walk({ 'seq.dir': 1, 'seq.steps': 4 }, 0.95);
  ok(r.seen.join() === '3,2,1,0,3,2,1,0', 'reverse: ' + r.seen.join());
  r = walk({ 'seq.dir': 2, 'seq.steps': 4 }, 0.95);
  ok(r.seen.join() === '0,1,2,3,2,1,0,1', 'pendulum: ' + r.seen.join());
  r = walk({ 'seq.dir': 3, 'seq.steps': 5 }, 2);
  ok(r.seen.every((s) => s >= 0 && s < 5), 'random: step out of range');

  // step 1 rests, step 2 ties into step 3: notes start on steps 0, 2, 3 and step 3 follows without a gap
  const en = load({ 'seq.run': 1, 'seq.steps': 4, 'seq.g1': 0, 'seq.g2': 2, 'seq.n0': 0, 'seq.n2': 5, 'seq.n3': 7, 'm.mode': 2, 'aenv.r': 0 });
  const b = new Float32Array(128), log = [];
  let prevGate = false, prevNote = -1;
  for (let i = 0; i < 0.48 * SR; i += 128) {
    en.process(b, b);
    const v = en.voices[0];
    if (v.gate !== prevGate || (v.gate && v.note !== prevNote)) log.push(`${en.state().step}:${v.gate ? v.note : 'off'}`);
    prevGate = v.gate; prevNote = v.note;
  }
  console.log('rest and tie:', log.join(' '));
  ok(log.join(' ') === '0:48 0:off 2:53 3:55 3:off', 'rest / tie pattern');
  en.noteOn(55, 1); // transpose up a fifth
  for (let i = 0; i < 0.5 * SR; i += 128) en.process(b, b);
  ok(en.root === 55 && en.voices.filter((v) => v.active).every((v) => v.note >= 55), 'keys do not transpose the sequence');
  en.setParam('seq.run', 0); render(en, 0.1);
  ok(en.state().step === -1 && !en.voices.some((v) => v.gate), 'stop leaves a note hanging');
}

console.log(fail ? `\n${fail} FAILED` : '\nall ok');
process.exit(fail ? 1 : 0);
