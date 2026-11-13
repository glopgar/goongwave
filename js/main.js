import { PARAMS, PIDX, defaults } from '../dsp/params.js';
import { buildTable } from '../dsp/wavetables.js';
import { CTL, fmt } from './defs.js';
import { FACTORY, CATS } from './presets.js';
import { createUI, RIG_W, RIG_H } from './ui.js';
import { Midi, srcLabel } from './midi.js';
import { t, tn, lang, setLang, applyI18n } from './i18n.js';

applyI18n();
const $ = (id) => document.getElementById(id);
$('lang').value = lang;
$('lang').onchange = (e) => setLang(e.target.value);

const LS_CUR = 'gw.current', LS_USER = 'gw.patches';
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const state = { name: '', params: defaults() };
const ctlName = (key) => (CTL[key] ? CTL[key].name : key);
const isTable = (key) => key === 'o1.table' || key === 'o2.table';

// ------------------------------------------------------------------ wavetables
// Built here (a few tens of ms each) and handed to the audio thread, which only ever reads them.
const tables = new Map();
function getTable(i) {
  let tb = tables.get(i);
  if (!tb) {
    tb = buildTable(i); tables.set(i, tb);
    if (tables.size > 4) tables.delete(tables.keys().next().value);
  }
  return tb;
}
function sendTable(slot) {
  const tb = getTable(state.params[`o${slot + 1}.table`]);
  ui.setWave(slot, tb);
  post({ type: 'table', slot, frames: tb.frames, data: tb.data });
}

// ------------------------------------------------------------------ audio
let ctx = null, node = null, starting = null;
const post = (m) => { if (node) node.port.postMessage(m); };
// The synth is "on" by default. Browsers only let audio start after a user gesture, so if the context
// comes up suspended it is resumed on the first click or key press anywhere on the page.
let wantOn = true;
const onAudioState = () => $('power').classList.toggle('on', !!ctx && ctx.state === 'running');
async function start() {
  wantOn = true;
  if (ctx) { if (ctx.state !== 'running') ctx.resume().catch(() => {}); return; }
  if (starting) return starting;
  starting = (async () => {
    const c = new AudioContext({ latencyHint: 'interactive' });
    await c.audioWorklet.addModule('dsp/worklet.js');
    node = new AudioWorkletNode(c, 'goongwave', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = (e) => { if (e.data.type === 'state') onEngineState(e.data.state); };
    node.connect(c.destination);
    ctx = c;
    c.onstatechange = onAudioState;
    post({ type: 'params', params: Object.entries(state.params) });
    sendTable(0); sendTable(1);
    if (wantOn) c.resume().catch(() => {}); else c.suspend().catch(() => {});
    onAudioState();
  })().catch((err) => { starting = null; toast(t('audioFail', err.message)); });
  return starting;
}
$('power').onclick = () => {
  if (ctx && ctx.state === 'running') { wantOn = false; ctx.suspend(); } else start();
};
for (const ev of ['pointerdown', 'keydown']) {
  addEventListener(ev, (e) => { if (wantOn && (!ctx || ctx.state !== 'running') && !(e.target.closest && e.target.closest('#power'))) start(); }, true);
}
let voicesOn = false;
function onEngineState(st) {
  ui.setState(st);
  voicesOn = !!st.pos;
  for (const slot of [0, 1]) ui.setWavePos(slot, st.pos ? st.pos[slot] : state.params[`o${slot + 1}.pos`]);
}

// ------------------------------------------------------------------ state <-> UI
let saveT = 0;
const autosave = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set(LS_CUR, snapshot()), 400); };
const snapshot = (name = state.name) => ({ name, params: state.params });
const showValue = (key) => ui.setLcd(1, `${ctlName(key)}: ${fmt(key, state.params[key], state.params)}`);

const held = new Set();
const host = {
  getParam: (key) => state.params[key],
  setParam(key, v) {
    const d = PARAMS[PIDX[key]]; if (!d) return;
    v = Math.max(d.min, Math.min(d.max, d.step ? Math.round(v) : v));
    if (state.params[key] === v) return;
    state.params[key] = v;
    ui.setControl(key, v);
    post({ type: 'param', id: key, v });
    if (isTable(key)) sendTable(+key[1] - 1);
    else if (!voicesOn && (key === 'o1.pos' || key === 'o2.pos')) ui.setWavePos(+key[1] - 1, v);
    showValue(key);
    autosave();
  },
  touch: showValue,
  noteOn(n, v = 0.8) { start(); post({ type: 'on', n, v }); held.add(n); ui.setKey(n, true); },
  noteOff(n) { post({ type: 'off', n }); held.delete(n); ui.setKey(n, false); },
  ctl(k, v) { post({ type: 'ctl', k, v }); ui.setWheel(k, v); },
  panic() { for (const n of held) ui.setKey(n, false); held.clear(); post({ type: 'ctl', k: 'sus', v: 0 }); post({ type: 'alloff' }); },
  // MIDI
  learning: () => document.body.classList.contains('learning'),
  learnSelect(key) { midi.learnKey = key; ui.markLearn(key); toast(t('learnMove', ctlName(key)), 2500); },
  learned(key, src) { ui.markLearn(null); refreshMapped(); toast(`${ctlName(key)} ← ${srcLabel(src)}`); },
  midiControl(key, x) { const d = PARAMS[PIDX[key]]; if (d) host.setParam(key, d.min + x * (d.max - d.min)); },
  midiMonitor(text) { $('midiMon').textContent = text; },
  midiDevices(list) {
    const sel = $('midiIn'), cur = midi.input;
    sel.innerHTML = `<option value="all">${t('allInputs')}${list.length ? '' : t('noInputs')}</option>` +
      list.map((d) => `<option value="${d.id}">${d.name.replace(/</g, '&lt;')}</option>`).join('');
    sel.value = list.some((d) => d.id === cur) ? cur : 'all'; midi.input = sel.value;
  },
  menu(key, x, y) {
    const src = midi.maps[key];
    showMenu(x, y, ctlName(key), [
      [t('mLearn'), () => host.learnSelect(key)],
      [src ? t('mUnmap', srcLabel(src)) : t('mNone'), src ? () => { midi.unmap(key); refreshMapped(); } : null],
      [t('mReset'), () => host.setParam(key, PARAMS[PIDX[key]].def)],
    ]);
  },
};

const ui = createUI($('rig'), host);
const midi = new Midi(host);
const refreshMapped = () => ui.markMapped(new Set(Object.keys(midi.maps)));

function applyPatch(p, keepStopped) {
  host.panic();
  state.name = p.name || '';
  state.params = defaults();
  for (const [k, v] of Object.entries(p.params || {})) {
    const d = PARAMS[PIDX[k]];
    if (d && typeof v === 'number' && v === v) state.params[k] = Math.max(d.min, Math.min(d.max, d.step ? Math.round(v) : v));
  }
  if (keepStopped) state.params['seq.run'] = 0;
  for (const d of PARAMS) ui.setControl(d.id, state.params[d.id]);
  post({ type: 'params', params: Object.entries(state.params) });
  sendTable(0); sendTable(1);
  for (const slot of [0, 1]) ui.setWavePos(slot, state.params[`o${slot + 1}.pos`]);
  ui.setLcd(0, tn(state.name) || '—'); ui.setLcd(1, '');
  autosave();
}

// ------------------------------------------------------------------ patches
function fillPresets(selected) {
  const user = store.get(LS_USER, []);
  $('preset').innerHTML = CATS.map((cat) => `<optgroup label="${tn(cat)}">` + FACTORY.map((p, i) => (p.cat === cat ? `<option value="f${i}">${tn(p.name)}</option>` : '')).join('') + '</optgroup>').join('') +
    (user.length ? `<optgroup label="${t('user')}">` + user.map((p, i) => `<option value="u${i}">${String(p.name).replace(/</g, '&lt;')}</option>`).join('') + '</optgroup>' : '');
  if (selected != null) $('preset').value = selected;
}
$('preset').onchange = (e) => {
  const v = e.target.value, list = v[0] === 'f' ? FACTORY : store.get(LS_USER, []);
  const p = list[+v.slice(1)]; if (p) applyPatch(p);
  e.target.blur();
};
$('save').onclick = () => {
  const name = prompt(t('patchName'), state.name && !FACTORY.some((p) => p.name === state.name) ? state.name : t('myPatch'));
  if (!name) return;
  const user = store.get(LS_USER, []), i = user.findIndex((p) => p.name === name);
  state.name = name;
  if (i >= 0) user[i] = snapshot(); else user.push(snapshot());
  store.set(LS_USER, user);
  fillPresets('u' + (i >= 0 ? i : user.length - 1));
  ui.setLcd(0, name);
  toast(t('saved'));
};
$('del').onclick = () => {
  const v = $('preset').value;
  if (v[0] !== 'u') return toast(t('onlyUser'));
  const user = store.get(LS_USER, []);
  if (!confirm(t('confirmDel', user[+v.slice(1)].name))) return;
  user.splice(+v.slice(1), 1); store.set(LS_USER, user); fillPresets('f0');
};
$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' }));
  a.download = (state.name || 'patch').replace(/[^\w\- ]+/g, '_') + '.gw.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('import').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const p = JSON.parse(await file.text());
    if (!p || typeof p.params !== 'object') throw new Error('no params');
    applyPatch(p, true); fillPresets(); $('preset').selectedIndex = -1; toast(t('imported'));
  } catch { toast(t('badFile')); }
};

// ------------------------------------------------------------------ MIDI UI
$('midiCh').innerHTML = `<option value="-1">${t('omni')}</option>` + Array.from({ length: 16 }, (_, i) => `<option value="${i}">${t('ch', i + 1)}</option>`).join('');
$('midiCh').onchange = (e) => { midi.channel = +e.target.value; };
$('midiIn').onchange = (e) => { midi.input = e.target.value; };
$('learn').onclick = () => {
  const on = document.body.classList.toggle('learning');
  $('learn').classList.toggle('active', on);
  if (!on) { midi.learnKey = null; ui.markLearn(null); } else toast(t('learnOn'), 3500);
};
$('maps').onclick = () => {
  const rows = Object.entries(midi.maps).map(([k, s]) => `<tr><td>${ctlName(k)}</td><td>${srcLabel(s)}</td><td><button data-k="${k}">${t('remove')}</button></td></tr>`).join('');
  dialog(`<h2>${t('mapsTitle')}</h2>${rows ? `<table><tr><th>${t('control')}</th><th>${t('source')}</th><th></th></tr>${rows}</table>` : `<p>${t('noMaps')}</p>`}
    <div class="row">${rows ? `<button id="mclr">${t('clearAll')}</button>` : ''}<button id="dclose">${t('close')}</button></div>`);
  $('dlg').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { midi.unmap(b.dataset.k); refreshMapped(); $('maps').onclick(); }; });
  if ($('mclr')) $('mclr').onclick = () => { midi.clear(); refreshMapped(); $('maps').onclick(); };
};
$('help').onclick = () => dialog(`<h2>${t('helpTitle')}</h2><ul>${t('help')}</ul><div class="row"><button id="dclose">${t('close')}</button></div>`);
$('panic').onclick = () => host.panic();

// ------------------------------------------------------------------ menu / dialog / toast
function showMenu(x, y, title, items) {
  const m = $('menu');
  m.innerHTML = `<div class="hd">${title}</div>`;
  for (const [text, fn] of items) {
    const it = document.createElement('div'); it.className = 'it' + (fn ? '' : ' dis'); it.textContent = text;
    it.onclick = () => { m.hidden = true; fn && fn(); };
    m.appendChild(it);
  }
  m.hidden = false;
  m.style.left = Math.min(x, innerWidth - m.offsetWidth - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + 'px';
}
addEventListener('pointerdown', (e) => { if (!e.target.closest('#menu')) $('menu').hidden = true; }, true);
function dialog(html) {
  const d = $('dlg'); d.innerHTML = html;
  $('dclose').onclick = () => d.close();
  if (!d.open) d.showModal();
}
let toastT = 0;
function toast(text, ms = 1800) {
  let el = $('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = text; el.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, ms);
}

// ------------------------------------------------------------------ zoom
let zoom = 1, fitted = true;
function setZoom(z) {
  zoom = Math.max(0.35, Math.min(2.5, z));
  $('rig').style.transform = `scale(${zoom})`; $('rig').style.transformOrigin = '0 0';
  $('scaler').style.width = RIG_W * zoom + 'px'; $('scaler').style.height = RIG_H * zoom + 'px';
}
const fit = () => setZoom(Math.min(1.6, ($('stage').clientWidth - 36) / RIG_W));
$('zIn').onclick = () => { fitted = false; setZoom(zoom * 1.15); };
$('zOut').onclick = () => { fitted = false; setZoom(zoom / 1.15); };
$('zFit').onclick = () => { fitted = true; fit(); };
addEventListener('resize', () => { if (fitted) fit(); });

// ------------------------------------------------------------------ computer keyboard
const KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };
let octave = 1; const down = {};
addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || $('dlg').open) return;
  if (e.code === 'Space') { e.preventDefault(); host.setParam('seq.run', state.params['seq.run'] ? 0 : 1); return; }
  if (e.code === 'KeyZ') { octave = Math.max(0, octave - 1); return; }
  if (e.code === 'KeyX') { octave = Math.min(4, octave + 1); return; }
  if (e.code in KEYMAP && !(e.code in down)) { const n = 36 + 12 * octave + KEYMAP[e.code]; down[e.code] = n; host.noteOn(n, 0.8); }
});
addEventListener('keyup', (e) => { if (e.code in down) { host.noteOff(down[e.code]); delete down[e.code]; } });
addEventListener('blur', () => { for (const c in down) { host.noteOff(down[c]); delete down[c]; } });

// ------------------------------------------------------------------ boot
fit();
const saved = store.get(LS_CUR, null), restore = saved && saved.params;
applyPatch(restore ? saved : FACTORY.find((p) => p.cat === 'Colchones'), true); // never start the sequencer on its own at load
fillPresets();
{ const i = FACTORY.findIndex((p) => p.name === state.name); $('preset').value = i >= 0 ? 'f' + i : ''; }
start(); // powered on by default
midi.init().then((ok) => { if (!ok) $('midiMon').textContent = t('noMidi'); refreshMapped(); });
window.gw = { state, host, midi }; // for debugging / automated tests
