// Factory patches. params holds only what differs from the defaults in dsp/params.js.
// Envelope times are knob positions: 0.25 = 10 ms, 0.5 = 100 ms, 0.75 = 1 s, 1 = 10 s.
import { TABLES } from '../dsp/wavetables.js';

const T = Object.fromEntries(TABLES.map((t, i) => [t.id, i]));
// Sequencer steps: notes in semitones, gates as a string ('x' note, '-' rest, '_' tie), mods 0..1.
function seq(notes, gates, mods = []) {
  const o = { 'seq.run': 1, 'seq.steps': notes.length };
  notes.forEach((n, i) => { if (n) o[`seq.n${i}`] = n; });
  [...gates].forEach((g, i) => { if (g !== 'x') o[`seq.g${i}`] = g === '_' ? 2 : 0; });
  mods.forEach((m, i) => { if (m) o[`seq.m${i}`] = m; });
  return o;
}

export const CATS = ['Secuencias', 'Colchones', 'Bajos y solistas', 'Teclados y campanas', 'Básicos'];

export const FACTORY = [
  // ------------------------------------------------------------ sequences
  { name: 'Berlín · ostinato de 8 pasos', cat: 'Secuencias', params: {
    'm.mode': 1, 'o1.table': T.basic, 'o1.pos': 0.5, 'o2.table': T.basic, 'o2.pos': 0.52, 'o2.fine': 8, 'mix.o2': 0.6, 'mix.sub': 0.3,
    'vcf.cut': 0.42, 'vcf.env': 0.42, 'vcf.res': 0.3, 'fenv.a': 0, 'fenv.d': 0.52, 'fenv.s': 0, 'aenv.a': 0, 'aenv.d': 0.58, 'aenv.s': 0, 'aenv.r': 0.4,
    'l1.rate': 0.12, 'l1.cut': 0.3, 'dl.sync': 1, 'dl.time': 0.42, 'dl.fb': 0.5, 'dl.mix': 0.4, 'rv.mix': 0.15,
    'seq.bpm': 126, ...seq([0, 0, 12, 0, 7, 0, 10, 12], 'xxxxxxxx'),
  } },
  { name: 'Arpegio de ondas (MOD recorre la tabla)', cat: 'Secuencias', params: {
    'o1.table': T.reso, 'o1.pos': 0.08, 'o2.table': T.reso, 'o2.pos': 0.2, 'o2.oct': 1, 'o2.fine': 5, 'mix.o2': 0.35,
    'vcf.cut': 0.8, 'aenv.a': 0, 'aenv.d': 0.66, 'aenv.s': 0, 'aenv.r': 0.66, 'ch.mix': 0.4, 'dl.sync': 1, 'dl.time': 0.42, 'dl.fb': 0.45, 'dl.mix': 0.35, 'rv.mix': 0.3,
    'seq.bpm': 112, 'seq.wave': 0.75, 'seq.gate': 0.6,
    ...seq([0, 3, 7, 12, 7, 3, 0, -5, 0, 3, 7, 10, 7, 3, 0, -2], 'xxxxxxxxxxxxxxxx', [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 0.9, 0.75, 0.6, 0.45, 0.3, 0.2, 0.1, 0.05]),
  } },
  { name: 'Bajo ácido digital (ligaduras y silencios)', cat: 'Secuencias', params: {
    'm.mode': 2, 'm.glide': 0.42, 'o1.table': T.sync, 'o1.pos': 0.12, 'o1.oct': -1, 'o1.env': 0.2, 'wenv.a': 0, 'wenv.d': 0.5, 'wenv.s': 0,
    'vcf.cut': 0.36, 'vcf.res': 0.68, 'vcf.env': 0.4, 'vcf.drive': 0.5, 'fenv.a': 0, 'fenv.d': 0.5, 'fenv.s': 0.1,
    'aenv.a': 0, 'aenv.d': 0.6, 'aenv.s': 0.6, 'aenv.r': 0.3, 'dl.sync': 1, 'dl.time': 0.42, 'dl.fb': 0.3, 'dl.mix': 0.2,
    'seq.bpm': 124, 'seq.cut': 0.5, 'seq.gate': 0.55,
    ...seq([0, 0, 12, 0, 3, 0, -2, 0, 0, 12, 0, 7, 0, 3, 5, 0], 'x_x-x_xx-xx_x-xx', [0, 0, 0.8, 0, 0.3, 0, 0, 0.6, 0, 1, 0, 0.4, 0, 0, 0.7, 0.2]),
  } },
  { name: 'Pulso vocal (una vocal por paso)', cat: 'Secuencias', params: {
    'm.mode': 1, 'o1.table': T.vocal, 'o1.pos': 0, 'o2.table': T.vocal, 'o2.oct': -1, 'o2.fine': 4, 'mix.o2': 0.5,
    'vcf.cut': 0.78, 'aenv.a': 0.1, 'aenv.d': 0.6, 'aenv.s': 0.5, 'aenv.r': 0.45, 'ch.mix': 0.5, 'rv.mix': 0.3,
    'seq.bpm': 96, 'seq.div': 1, 'seq.dir': 2, 'seq.wave': 1, 'seq.gate': 0.8,
    ...seq([0, 0, 3, 0, 7, 5, 0, -2], 'xxxxxxxx', [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.1]),
  } },
  { name: 'Paisaje aleatorio de campanas', cat: 'Secuencias', params: {
    'o1.table': T.metal, 'o1.pos': 0.1, 'o1.env': 0.5, 'o2.table': T.overtone, 'o2.pos': 0.2, 'o2.oct': 1, 'mix.o2': 0.3,
    'wenv.a': 0, 'wenv.d': 0.85, 'wenv.s': 0, 'wenv.r': 0.85, 'vcf.cut': 0.9, 'aenv.a': 0, 'aenv.d': 0.86, 'aenv.s': 0, 'aenv.r': 0.84,
    'dl.time': 0.72, 'dl.fb': 0.5, 'dl.mix': 0.35, 'rv.size': 0.85, 'rv.mix': 0.55,
    'seq.bpm': 84, 'seq.div': 1, 'seq.dir': 3, 'seq.wave': 0.4,
    ...seq([0, 2, 4, 7, 9, 12, -5, -3], 'xx-xxx-x', [0, 0.3, 0, 0.6, 0.2, 1, 0.5, 0.8]),
  } },
  // ------------------------------------------------------------ pads
  { name: 'Barrido resonante', cat: 'Colchones', params: {
    'o1.table': T.reso, 'o1.pos': 0.25, 'o1.env': 0.3, 'o2.table': T.reso, 'o2.pos': 0.3, 'o2.fine': 9, 'mix.o1': 0.7, 'mix.o2': 0.7,
    'wenv.a': 0.8, 'wenv.d': 0.8, 'wenv.s': 0.6, 'l1.rate': 0.25, 'l1.wave': 0.5, 'vcf.cut': 0.7,
    'aenv.a': 0.7, 'aenv.d': 0.6, 'aenv.s': 0.9, 'aenv.r': 0.72, 'ch.mix': 0.6, 'rv.size': 0.8, 'rv.mix': 0.45,
  } },
  { name: 'Coro vocal', cat: 'Colchones', params: {
    'o1.table': T.vocal, 'o1.env': 0.6, 'o2.table': T.vocal, 'o2.pos': 0.5, 'o2.env': -0.4, 'o2.fine': 8, 'mix.o1': 0.7, 'mix.o2': 0.7,
    'wenv.a': 0.85, 'wenv.s': 1, 'l1.rate': 0.3, 'l1.wave': 0.15, 'l2.rate': 0.68, 'l2.pitch': 0.12, 'vcf.cut': 0.72,
    'aenv.a': 0.65, 'aenv.s': 1, 'aenv.r': 0.7, 'ch.mix': 0.7, 'rv.mix': 0.5,
  } },
  { name: 'Cuerdas de pulso', cat: 'Colchones', params: {
    'o1.table': T.pwm, 'o1.pos': 0.3, 'o2.table': T.pwm, 'o2.pos': 0.5, 'o2.fine': 10, 'mix.o1': 0.7, 'mix.o2': 0.7,
    'l1.rate': 0.45, 'l1.wave': 0.45, 'vcf.cut': 0.68, 'vcf.env': 0.15, 'fenv.a': 0.5,
    'aenv.a': 0.55, 'aenv.s': 0.9, 'aenv.r': 0.62, 'ch.depth': 0.6, 'ch.mix': 0.8, 'rv.mix': 0.25,
  } },
  { name: 'Espectros lentos', cat: 'Colchones', params: {
    'o1.table': T.spectral, 'o1.pos': 0.5, 'o2.table': T.spectral, 'o2.pos': 0.2, 'o2.oct': -1, 'o2.env': 0.6, 'mix.o1': 0.7, 'mix.o2': 0.6,
    'wenv.a': 0.9, 'wenv.s': 1, 'wenv.r': 0.8, 'l1.rate': 0.12, 'l1.shape': 1, 'l1.wave': 1, 'vcf.cut': 0.66, 'vcf.mode': 1,
    'aenv.a': 0.72, 'aenv.s': 1, 'aenv.r': 0.78, 'ch.mix': 0.5, 'dl.time': 0.8, 'dl.mix': 0.25, 'rv.size': 0.9, 'rv.mix': 0.6,
  } },
  { name: 'Cristal', cat: 'Colchones', params: {
    'o1.table': T.overtone, 'o1.pos': 0.1, 'o1.env': 0.7, 'o2.table': T.fm3, 'o2.pos': 0.25, 'o2.env': 0.3, 'o2.oct': 1, 'mix.o2': 0.4,
    'wenv.a': 0, 'wenv.d': 0.75, 'wenv.s': 0.15, 'vcf.cut': 0.85, 'aenv.a': 0.1, 'aenv.d': 0.8, 'aenv.s': 0.3, 'aenv.r': 0.75,
    'dl.mix': 0.3, 'rv.size': 0.8, 'rv.mix': 0.5,
  } },
  // ------------------------------------------------------------ basses and leads
  { name: 'Bajo sync', cat: 'Bajos y solistas', params: {
    'm.mode': 1, 'o1.table': T.sync, 'o1.pos': 0.15, 'o1.env': 0.6, 'o1.oct': -1, 'mix.sub': 0.5, 'wenv.a': 0, 'wenv.d': 0.55, 'wenv.s': 0,
    'vcf.cut': 0.55, 'vcf.env': 0.35, 'vcf.res': 0.2, 'fenv.d': 0.5, 'fenv.s': 0.1, 'aenv.a': 0, 'aenv.d': 0.6, 'aenv.s': 0.6, 'aenv.r': 0.3,
  } },
  { name: 'Bajo FM', cat: 'Bajos y solistas', params: {
    'm.mode': 1, 'o1.table': T.fm1, 'o1.pos': 0.1, 'o1.env': 0.5, 'o1.oct': -1, 'mix.sub': 0.4, 'wenv.a': 0, 'wenv.d': 0.5, 'wenv.s': 0.1,
    'vcf.cut': 0.7, 'aenv.a': 0.02, 'aenv.d': 0.6, 'aenv.s': 0.7, 'aenv.r': 0.3,
  } },
  { name: 'Bajo redondo con ligado', cat: 'Bajos y solistas', params: {
    'm.mode': 2, 'm.glide': 0.4, 'o1.table': T.basic, 'o1.pos': 0.2, 'o1.oct': -1, 'mix.sub': 0.7,
    'vcf.cut': 0.45, 'vcf.env': 0.3, 'fenv.d': 0.5, 'fenv.s': 0, 'aenv.a': 0, 'aenv.s': 0.8, 'aenv.r': 0.35,
  } },
  { name: 'Solista plegado', cat: 'Bajos y solistas', params: {
    'm.mode': 2, 'm.glide': 0.45, 'o1.table': T.fold, 'o1.pos': 0.2, 'o1.env': 0.35, 'wenv.a': 0.3, 'wenv.d': 0.7, 'wenv.s': 0.5,
    'l1.rate': 0.72, 'l1.pitch': 0.1, 'l2.rate': 0.35, 'l2.wave': 0.1, 'vcf.cut': 0.8,
    'aenv.a': 0.1, 'aenv.s': 0.9, 'aenv.r': 0.5, 'dl.fb': 0.4, 'dl.mix': 0.3, 'rv.mix': 0.2,
  } },
  { name: 'Solista de fase', cat: 'Bajos y solistas', params: {
    'm.mode': 1, 'm.glide': 0.3, 'o1.table': T.phase, 'o1.pos': 0.4, 'o2.table': T.phase, 'o2.pos': 0.6, 'o2.fine': 12, 'mix.o2': 0.6,
    'vcf.mode': 1, 'vcf.cut': 0.66, 'vcf.res': 0.3, 'vcf.env': 0.3, 'fenv.a': 0.2, 'fenv.d': 0.65, 'fenv.s': 0.4,
    'l1.rate': 0.7, 'l1.pitch': 0.08, 'aenv.a': 0.05, 'aenv.s': 0.9, 'aenv.r': 0.45, 'ch.mix': 0.3, 'dl.mix': 0.25,
  } },
  // ------------------------------------------------------------ keys and bells
  { name: 'Piano eléctrico FM', cat: 'Teclados y campanas', params: {
    'o1.table': T.fm3, 'o1.env': 0.45, 'o2.table': T.basic, 'o2.fine': 3, 'mix.o2': 0.5, 'wenv.a': 0, 'wenv.d': 0.6, 'wenv.s': 0,
    'vcf.cut': 0.85, 'aenv.a': 0.02, 'aenv.d': 0.8, 'aenv.s': 0, 'aenv.r': 0.55, 'm.vel': 0.8, 'ch.mix': 0.4, 'rv.mix': 0.2,
  } },
  { name: 'Campana metálica', cat: 'Teclados y campanas', params: {
    'o1.table': T.metal, 'o1.pos': 0.2, 'o1.env': 0.5, 'o2.table': T.overtone, 'o2.pos': 0.4, 'o2.oct': 1, 'mix.o2': 0.3,
    'wenv.a': 0, 'wenv.d': 0.85, 'wenv.s': 0, 'wenv.r': 0.85, 'vcf.cut': 0.9, 'aenv.a': 0, 'aenv.d': 0.88, 'aenv.s': 0, 'aenv.r': 0.85, 'rv.mix': 0.5,
  } },
  { name: 'Órgano con altavoz giratorio', cat: 'Teclados y campanas', params: {
    'o1.table': T.organ, 'o1.pos': 0.6, 'o2.table': T.organ, 'o2.pos': 1, 'o2.oct': 1, 'o2.fine': 0, 'mix.o2': 0.3,
    'vcf.cut': 0.9, 'aenv.a': 0.1, 'aenv.s': 1, 'aenv.r': 0.2, 'm.vel': 0, 'ch.rate': 0.95, 'ch.depth': 0.4, 'ch.mix': 0.6, 'rv.mix': 0.2,
  } },
  { name: 'Arpa escalonada', cat: 'Teclados y campanas', params: {
    'o1.table': T.stairs, 'o1.pos': 0.7, 'o1.env': -0.6, 'o2.table': T.comb, 'o2.pos': 0.3, 'o2.oct': 1, 'mix.o2': 0.25,
    'wenv.a': 0, 'wenv.d': 0.6, 'wenv.s': 0, 'vcf.cut': 0.6, 'vcf.env': 0.35, 'fenv.a': 0, 'fenv.d': 0.62, 'fenv.s': 0,
    'aenv.a': 0, 'aenv.d': 0.75, 'aenv.s': 0, 'aenv.r': 0.7, 'dl.fb': 0.4, 'dl.mix': 0.3, 'rv.mix': 0.35,
  } },
  // ------------------------------------------------------------ basics
  { name: 'Inicial', cat: 'Básicos', params: {} },
];
