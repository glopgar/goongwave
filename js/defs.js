// Panel layout: sections, the controls inside them (positions in px, relative to the section) and
// how each parameter's value reads on the display. Ranges and defaults come from dsp/params.js.
import { PARAMS, PIDX, STEPS, envTime, cutHz, lfoHz, glideTime, delayTime, chorusHz, syncSteps } from '../dsp/params.js';
import { TABLES } from '../dsp/wavetables.js';
import { lang } from './i18n.js';

export const PANEL_W = 1420, CHEEK = 30;
const R1 = 214, R2 = 196, R3 = 244;
export const PANEL_H = R1 + R2 + R3;

const knob = (id, x, y, label, size = 'S', name) => ({ t: 'knob', id, x, y, label, size, name });
const rot = (id, x, y, label, pos) => ({ t: 'rot', id, x, y, label, pos });
const slider = (id, x, label) => ({ t: 'slider', id, x, y: 100, h: 104, label });
const text = (x, y, s, line) => ({ t: 'text', x, y, text: s, line });

const osc = (n, x) => ({ id: `o${n}`, title: `Oscillator ${n}`, x, y: 0, w: 350, h: R1, ui: [
  { t: 'wave', slot: n - 1, id: `o${n}.table`, x: 14, y: 34, w: 172, h: 138 },
  knob(`o${n}.pos`, 238, 76, 'Position', 'L'), knob(`o${n}.env`, 312, 76, 'Env', 'M'),
  knob(`o${n}.oct`, 216, 164, 'Octave'), knob(`o${n}.semi`, 268, 164, 'Semi'), knob(`o${n}.fine`, 320, 164, 'Fine'),
] });
const lfo = (n, x) => ({ id: `l${n}`, title: `LFO ${n}`, x, y: R1, w: 235, h: R2, ui: [
  knob(`l${n}.rate`, 60, 72, 'Rate', 'M'), rot(`l${n}.shape`, 160, 72, 'Shape', ['SIN', 'TRI', 'SAW', 'SQR', 'S&H']),
  knob(`l${n}.pitch`, 45, 152, 'Pitch'), knob(`l${n}.wave`, 117, 152, 'Wave'), knob(`l${n}.cut`, 190, 152, 'Filter'),
] });
const env = (id, title, x) => ({ id, title, x, y: R1, w: 170, h: R2, ui: [
  slider(`${id}.a`, 32, 'A'), slider(`${id}.d`, 67, 'D'), slider(`${id}.s`, 102, 'S'), slider(`${id}.r`, 137, 'R'),
] });

const SEQ_X0 = 440;
export const stepX = (i) => SEQ_X0 + i * 58 + (i >> 2) * 10;
const seqUi = [
  { t: 'tog', id: 'seq.run', x: 52, y: 80, label: 'Run' },
  knob('seq.bpm', 128, 80, 'Tempo', 'M'),
  rot('seq.div', 210, 80, 'Step', ['1/4', '1/8', '1/16', '1/32']),
  rot('seq.dir', 300, 80, 'Direction', ['FWD', 'REV', 'PEND', 'RND']),
  knob('seq.steps', 52, 174, 'Steps'), knob('seq.gate', 114, 174, 'Gate'), knob('seq.swing', 176, 174, 'Swing'),
  knob('seq.wave', 250, 174, 'Wave', 'S', 'Mod row → wave'), knob('seq.cut', 312, 174, 'Filter', 'S', 'Mod row → filter'),
  text(281, 142, 'Mod row to', 96),
  text(394, 86, 'Note'), text(394, 142, 'Mod'), text(394, 198, 'Gate'),
];
for (let i = 0; i < STEPS; i++) {
  const x = stepX(i);
  seqUi.push({ t: 'led', id: `step${i}`, x, y: 44 }, knob(`seq.n${i}`, x, 86, ''), knob(`seq.m${i}`, x, 142, ''),
    { t: 'sw', id: `seq.g${i}`, x, y: 198 }, text(x, 226, String(i + 1)));
}

export const SECTIONS = [
  osc(1, 0), osc(2, 350),
  { id: 'mix', title: 'Mixer', x: 700, y: 0, w: 190, h: R1, ui: [
    { ...slider('mix.o1', 38, 'Osc 1'), y: 108, h: 112 }, { ...slider('mix.o2', 76, 'Osc 2'), y: 108, h: 112 },
    { ...slider('mix.sub', 114, 'Sub'), y: 108, h: 112 }, { ...slider('mix.noise', 152, 'Noise'), y: 108, h: 112 },
  ] },
  { id: 'vcf', title: 'Filter', x: 890, y: 0, w: 300, h: R1, ui: [
    knob('vcf.cut', 60, 76, 'Cutoff', 'L'), knob('vcf.res', 146, 76, 'Resonance', 'M'), rot('vcf.mode', 238, 76, 'Mode', ['LP24', 'LP12', 'BP', 'HP']),
    knob('vcf.env', 60, 164, 'Env'), knob('vcf.key', 146, 164, 'Key track'), knob('vcf.drive', 238, 164, 'Drive'),
  ] },
  { id: 'm', title: 'Master', x: 1190, y: 0, w: 230, h: R1, ui: [
    { t: 'lcd', x: 14, y: 34, w: 202, h: 44 },
    knob('m.glide', 45, 108, 'Glide', 'M'), knob('m.vel', 115, 108, 'Velocity', 'M'), knob('m.vol', 185, 108, 'Volume', 'M'),
    rot('m.mode', 62, 180, 'Voices', ['POLY', 'MONO', 'LEG']),
    { t: 'voices', x: 124, y: 180 },
  ] },
  lfo(1, 0), lfo(2, 235),
  env('wenv', 'Wave envelope', 470), env('fenv', 'Filter envelope', 640), env('aenv', 'Amp envelope', 810),
  { id: 'fx', title: 'Effects', x: 980, y: R1, w: 440, h: R2, ui: [
    text(105, 40, 'Chorus', 150), knob('ch.rate', 45, 72, 'Rate', 'S', 'Chorus rate'), knob('ch.depth', 105, 72, 'Depth', 'S', 'Chorus depth'), knob('ch.mix', 165, 72, 'Mix', 'S', 'Chorus mix'),
    text(335, 40, 'Reverb', 90), knob('rv.size', 305, 72, 'Size', 'S', 'Reverb size'), knob('rv.mix', 365, 72, 'Mix', 'S', 'Reverb mix'),
    text(105, 120, 'Delay', 150), knob('dl.time', 45, 152, 'Time', 'S', 'Delay time'), knob('dl.fb', 105, 152, 'Feedback', 'S', 'Delay feedback'), knob('dl.mix', 165, 152, 'Mix', 'S', 'Delay mix'),
    { t: 'sw', id: 'dl.sync', x: 238, y: 152, pos: ['FREE', 'SYNC'], name: 'Delay time' },
  ] },
  { id: 'seq', title: 'Sequencer', x: 0, y: R1 + R2, w: PANEL_W, h: R3, ui: seqUi },
];

// id → { min, max, def, step, t, label, section, bi }
export const CTL = {};
for (const s of SECTIONS) for (const d of s.ui) {
  if (!d.id || !(d.id in PIDX)) continue;
  const p = PARAMS[PIDX[d.id]];
  Object.assign(d, { min: p.min, max: p.max, def: p.def, step: p.step, bi: p.min < 0 });
  const m = /^seq\.([nmg])(\d+)$/.exec(d.id);
  d.name = m ? `Step ${+m[2] + 1} ${{ n: 'note', m: 'mod', g: 'gate' }[m[1]]}` : d.name || `${s.title} · ${d.t === 'wave' ? 'Table' : d.label}`;
  CTL[d.id] = d;
}

// ---------------------------------------------------------------- value read-outs
const pct = (v) => Math.round(v * 100) + ' %';
const signed = (v, unit = '') => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + unit;
const secs = (t) => (t < 1 ? (t < 0.01 ? (t * 1000).toFixed(1) : Math.round(t * 1000)) + ' ms' : t.toFixed(t < 10 ? 2 : 1) + ' s');
const hz = (f) => (f < 10 ? f.toFixed(2) + ' Hz' : f < 1000 ? Math.round(f) + ' Hz' : (f / 1000).toFixed(f < 10000 ? 2 : 1) + ' kHz');
export const tableName = (i) => TABLES[i].name[lang === 'es' ? 0 : 1];

export function fmt(id, v, params) {
  const d = CTL[id], k = id.split('.')[1];
  if (d && (d.t === 'rot' || (d.t === 'sw' && d.pos))) return d.pos[v];
  if (k === 'table') return tableName(v);
  if (/^seq\.g\d/.test(id)) return ['rest', 'note', 'tie'][v];
  if (/^seq\.n\d/.test(id) || k === 'semi') return signed(v, ' st');
  if (/^seq\.m\d/.test(id)) return pct(v);
  if (/env\.[adr]$/.test(id)) return secs(envTime(v));
  switch (id) {
    case 'o1.oct': case 'o2.oct': return signed(v);
    case 'o1.fine': case 'o2.fine': return signed(Math.round(v), ' ct');
    case 'vcf.cut': return hz(cutHz(v));
    case 'l1.rate': case 'l2.rate': return hz(lfoHz(v));
    case 'ch.rate': return hz(chorusHz(v));
    case 'dl.time': return params && params['dl.sync'] ? syncSteps(v) + (syncSteps(v) > 1 ? ' steps' : ' step') : secs(delayTime(v));
    case 'm.glide': return v <= 0 ? 'off' : secs(glideTime(v));
    case 'seq.bpm': return v + ' BPM';
    case 'seq.steps': return String(v);
    case 'seq.run': return v ? 'on' : 'off';
    case 'seq.swing': return Math.round(50 + v * 25) + ' %';
  }
  return d && d.bi ? signed(Math.round(v * 100), ' %') : pct(v);
}
