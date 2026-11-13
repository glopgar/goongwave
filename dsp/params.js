// GoongWave — the parameter list, shared by the engine, the panel and the tests.
// step: true marks switches and selectors (rounded, applied at once); the rest are smoothed in the engine.
import { TABLES } from './wavetables.js';

export const STEPS = 16, NVOICES = 8;
export const PARAMS = [];
const c = (id, min, max, def) => PARAMS.push({ id, min, max, def, step: false });
const s = (id, min, max, def) => PARAMS.push({ id, min, max, def, step: true });

for (const n of [1, 2]) {
  s(`o${n}.table`, 0, TABLES.length - 1, 0);
  c(`o${n}.pos`, 0, 1, 0);
  c(`o${n}.env`, -1, 1, 0);      // wave envelope → position
  s(`o${n}.oct`, -2, 2, 0);
  s(`o${n}.semi`, -12, 12, 0);
  c(`o${n}.fine`, -50, 50, n === 2 ? 6 : 0); // cents
}
c('mix.o1', 0, 1, 0.8); c('mix.o2', 0, 1, 0); c('mix.sub', 0, 1, 0); c('mix.noise', 0, 1, 0);
c('vcf.cut', 0, 1, 0.75); c('vcf.res', 0, 1, 0.1); c('vcf.env', -1, 1, 0); c('vcf.key', 0, 1, 0.5); c('vcf.drive', 0, 1, 0.2);
s('vcf.mode', 0, 3, 0);         // LP24 · LP12 · BP · HP
c('wenv.a', 0, 1, 0.6); c('wenv.d', 0, 1, 0.6); c('wenv.s', 0, 1, 0.5); c('wenv.r', 0, 1, 0.5);
c('fenv.a', 0, 1, 0.05); c('fenv.d', 0, 1, 0.55); c('fenv.s', 0, 1, 0.3); c('fenv.r', 0, 1, 0.45);
c('aenv.a', 0, 1, 0.05); c('aenv.d', 0, 1, 0.5); c('aenv.s', 0, 1, 0.8); c('aenv.r', 0, 1, 0.45);
for (const n of [1, 2]) {
  c(`l${n}.rate`, 0, 1, n === 1 ? 0.5 : 0.7);
  s(`l${n}.shape`, 0, 4, 0);    // sine · triangle · saw · square · sample & hold
  c(`l${n}.pitch`, 0, 1, 0); c(`l${n}.wave`, 0, 1, 0); c(`l${n}.cut`, 0, 1, 0);
}
c('ch.rate', 0, 1, 0.3); c('ch.depth', 0, 1, 0.5); c('ch.mix', 0, 1, 0);
c('dl.time', 0, 1, 0.55); c('dl.fb', 0, 1, 0.35); c('dl.mix', 0, 1, 0); s('dl.sync', 0, 1, 0);
c('rv.size', 0, 1, 0.6); c('rv.mix', 0, 1, 0);
c('m.glide', 0, 1, 0); c('m.vel', 0, 1, 0.5); c('m.vol', 0, 1, 0.7);
s('m.mode', 0, 2, 0);           // poly · mono · legato

s('seq.run', 0, 1, 0);
s('seq.bpm', 40, 240, 120);
s('seq.div', 0, 3, 2);          // 1/4 · 1/8 · 1/16 · 1/32
s('seq.dir', 0, 3, 0);          // forward · reverse · pendulum · random
s('seq.steps', 1, STEPS, STEPS);
c('seq.gate', 0.05, 1, 0.5); c('seq.swing', 0, 1, 0);
c('seq.wave', -1, 1, 0); c('seq.cut', -1, 1, 0); // MOD row → wave position / cutoff
for (let i = 0; i < STEPS; i++) s(`seq.n${i}`, -12, 12, 0);   // semitones from the root key
for (let i = 0; i < STEPS; i++) c(`seq.m${i}`, 0, 1, 0);
for (let i = 0; i < STEPS; i++) s(`seq.g${i}`, 0, 2, 1);      // rest · note · tie

export const PIDX = {};
PARAMS.forEach((d, i) => { PIDX[d.id] = i; });
export const defaults = () => Object.fromEntries(PARAMS.map((d) => [d.id, d.def]));

// Knob position (0..1) → physical value.
export const envTime = (v) => 0.001 * Math.pow(10, 4 * v);          // 1 ms – 10 s
export const cutHz = (v) => 20 * Math.pow(1000, v);                 // 20 Hz – 20 kHz
export const lfoHz = (v) => 0.05 * Math.pow(600, v);                // 0.05 – 30 Hz
export const glideTime = (v) => (v <= 0 ? 0 : 0.005 * Math.pow(400, v)); // off, 5 ms – 2 s
export const delayTime = (v) => 0.02 * Math.pow(50, v);             // 20 ms – 1 s
export const chorusHz = (v) => 0.1 * Math.pow(60, v);               // 0.1 – 6 Hz
export const DIVS = [1, 0.5, 0.25, 0.125];                          // step length in beats
export const SYNC_STEPS = [1, 2, 3, 4, 6, 8];                       // synced delay time, in sequencer steps
export const syncSteps = (v) => SYNC_STEPS[Math.min(5, Math.floor(v * 6))];
