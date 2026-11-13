// Panel rendering and direct manipulation: knobs, sliders, switches, wavetable displays, keyboard and wheels.
import { SECTIONS, PANEL_W, PANEL_H, CHEEK, CTL, tableName } from './defs.js';
import { N, LEVELS, TABLES } from '../dsp/wavetables.js';
import { NVOICES, STEPS } from '../dsp/params.js';
import { t } from './i18n.js';

const TOP = 16, KB_H = 178, BOTTOM = 14;
const KB_LOW = 36, KB_KEYS = 61, KEY_W = 34, KEYS_X = CHEEK + 172;
export const RIG_W = PANEL_W + 2 * CHEEK, RIG_H = TOP + PANEL_H + KB_H + BOTTOM;

const el = (tag, cls, parent, css) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) Object.assign(e.style, css);
  if (parent) parent.appendChild(e);
  return e;
};
const px = (v) => v + 'px';
const f = (v) => v.toFixed(2);

export function createUI(rig, host) {
  const controls = {}, leds = {}, keyEls = {}, waves = [], wheels = {};
  let lcd = null, voiceLeds = [];

  rig.style.width = px(RIG_W); rig.style.height = px(RIG_H);
  const cab = el('div', 'wood', rig, { width: px(RIG_W), height: px(RIG_H) }); cab.id = 'cab';
  const panel = el('div', '', rig, { left: px(CHEEK), top: px(TOP), width: px(PANEL_W), height: px(PANEL_H) }); panel.id = 'panel';

  const label = (parent, x, y, text, o = {}) => {
    if (!text) return null;
    const l = el('div', 'lbl' + (o.line ? ' rule' : ''), parent, { left: px(x), top: px(y) });
    l.textContent = text;
    if (o.line) l.style.setProperty('--w', px(o.line));
    return l;
  };

  // ---------------------------------------------------------------- control builders
  function buildKnob(sec, d) {
    const R = { L: 23, M: 17, S: 12 }[d.size], sz = 2 * (R + 8), n = d.size === 'S' ? 7 : 11;
    let s = `<svg width="${sz}" height="${sz}" viewBox="${-sz / 2} ${-sz / 2} ${sz} ${sz}">`;
    for (let i = 0; i < n; i++) {
      const a = (-135 + 270 * i / (n - 1)) * Math.PI / 180, sx = Math.sin(a), cy = -Math.cos(a);
      const mid = d.bi && i === (n - 1) / 2, r2 = R + (mid ? 6.5 : 5);
      s += `<line x1="${f(sx * (R + 2.5))}" y1="${f(cy * (R + 2.5))}" x2="${f(sx * r2)}" y2="${f(cy * r2)}" class="${mid ? 'tick mid' : 'tick'}"/>`;
    }
    s += `<g class="body"><circle r="${R}" fill="url(#gSkirt)"/><circle r="${f(R * 0.84)}" fill="url(#gBody)" stroke="#000" stroke-width=".5"/>` +
      `<circle r="${f(R * 0.56)}" fill="url(#gCap)" stroke="#4a4a4a" stroke-width=".5"/>` +
      `<g class="ptr"><line y1="${f(-R * 0.5)}" y2="${f(-R * 0.96)}" stroke="#fff" stroke-width="${R > 14 ? 2 : 1.5}" stroke-linecap="round"/></g></g></svg>`;
    const c = el('div', 'ctl knob', sec, { left: px(d.x), top: px(d.y) });
    c.innerHTML = s;
    const ptr = c.querySelector('.ptr');
    label(sec, d.x, d.y + R + 14, d.label);
    return { dom: c, set: (v) => ptr.setAttribute('transform', `rotate(${f(-135 + 270 * (v - d.min) / (d.max - d.min))})`) };
  }

  function buildRot(sec, d) {
    const R = 14, n = d.pos.length, step = n <= 3 ? 50 : n === 4 ? 46 : 42, sz = 2 * (R + 18);
    const ang = (i) => (i - (n - 1) / 2) * step;
    let s = `<svg width="${sz}" height="${sz}" viewBox="${-sz / 2} ${-sz / 2} ${sz} ${sz}">`;
    d.pos.forEach((txt, i) => {
      const a = ang(i) * Math.PI / 180, sx = Math.sin(a), cy = -Math.cos(a);
      s += `<line x1="${f(sx * (R + 2))}" y1="${f(cy * (R + 2))}" x2="${f(sx * (R + 5))}" y2="${f(cy * (R + 5))}" class="tick"/>`;
      s += `<text x="${f(sx * (R + 14))}" y="${f(cy * (R + 11))}" font-size="6.6">${txt.replace('&', '&amp;')}</text>`;
    });
    s += `<g class="body"><circle r="${R}" fill="url(#gSkirt)"/><circle r="${R - 2.5}" fill="url(#gBody)" stroke="#000" stroke-width=".5"/>` +
      `<g class="ptr"><rect x="-3.4" y="${-R - 1.5}" width="6.8" height="${2 * R + 3}" rx="2.6" fill="#1a1a1b" stroke="#555" stroke-width=".6"/>` +
      `<line y1="${-R}" y2="-4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></g></g></svg>`;
    const c = el('div', 'ctl rot', sec, { left: px(d.x), top: px(d.y) });
    c.innerHTML = s;
    const ptr = c.querySelector('.ptr');
    label(sec, d.x, d.y + R + 12, d.label);
    return { dom: c, set: (v) => ptr.setAttribute('transform', `rotate(${ang(v)})`) };
  }

  const CAP = 14;
  function buildSlider(sec, d) {
    const c = el('div', 'ctl slider', sec, { left: px(d.x), top: px(d.y), height: px(d.h) });
    for (let i = 0; i <= 10; i++) el('u', i % 5 ? '' : 'maj', c, { top: px(CAP / 2 + (d.h - CAP) * i / 10) });
    el('b', '', c);
    const cap = el('i', '', c);
    label(sec, d.x, d.y + d.h / 2 + 12, d.label);
    return { dom: c, set: (v) => { cap.style.top = px((1 - (v - d.min) / (d.max - d.min)) * (d.h - CAP)); } };
  }

  function buildSw(sec, d) {
    const n = d.max + 1;
    const c = el('div', 'ctl sw', sec, { left: px(d.x), top: px(d.y) });
    el('i', '', c);
    if (d.pos) { label(sec, d.x, d.y - 23, d.pos[n - 1]); label(sec, d.x, d.y + 23, d.pos[0]); }
    return { dom: c, set: (v) => c.style.setProperty('--t', px(n === 2 ? (v > 0.5 ? 1 : 15) : [15, 8, 1][v | 0])) };
  }

  function buildTog(sec, d) {
    const c = el('div', 'ctl tog', sec, { left: px(d.x), top: px(d.y) });
    el('i', 'lamp', c);
    label(sec, d.x, d.y + 30, d.label);
    return { dom: c, set: (v) => c.classList.toggle('on', v > 0.5) };
  }

  // Wavetable display: the table drawn as a stack of frames, with the frame being played on top.
  function buildWave(sec, d) {
    const box = el('div', 'wave', sec, { left: px(d.x), top: px(d.y), width: px(d.w), height: px(d.h) });
    const W = d.w, H = d.h - 30, cv = el('canvas', '', box, { width: px(W), height: px(H) });
    cv.width = W * 2; cv.height = H * 2;
    const bar = el('div', 'tsel', box);
    const prev = el('button', '', bar), name = el('span', '', bar), next = el('button', '', bar);
    prev.textContent = '◀'; next.textContent = '▶';
    const stepTable = (dir) => { const n = TABLES.length; host.setParam(d.id, (host.getParam(d.id) + dir + n) % n); };
    prev.onclick = () => stepTable(-1); next.onclick = () => stepTable(1);
    box.addEventListener('wheel', (e) => { e.preventDefault(); stepTable(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    const w = { table: null, pos: 0, shown: -1, dirty: true };
    const ctx = cv.getContext('2d');
    const DX = 40, DY = 44, WW = W - DX - 16, AMP = 15, X0 = 8, Y0 = H - 22, PTS = 72;
    function trace(frameAt, tz) {
      const tb = w.table, d0 = tb.data, x = tz * (tb.frames - 1), fi = Math.min(tb.frames - 2, x | 0), fr = frameAt == null ? x - fi : 0;
      const oA = ((frameAt == null ? fi : frameAt) * LEVELS + 2) * N, oB = oA + (frameAt == null ? LEVELS * N : 0);
      ctx.beginPath();
      for (let j = 0; j <= PTS; j++) {
        const k = ((j * N / PTS) | 0) & (N - 1), a = d0[oA + k], y = a + (d0[oB + k] - a) * fr;
        const X = X0 + DX * tz + WW * j / PTS, Y = Y0 - DY * tz - y * AMP;
        if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
    }
    w.draw = () => {
      w.dirty = false; w.shown = w.pos;
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, W, H);
      if (!w.table) return;
      const B = 13; ctx.lineJoin = 'round';
      for (let k = B - 1; k >= 0; k--) { // back to front
        const tz = k / (B - 1);
        ctx.strokeStyle = `rgba(255,176,64,${0.16 + 0.2 * (1 - tz)})`; ctx.lineWidth = 0.8;
        trace(Math.round(tz * (w.table.frames - 1)), tz); ctx.stroke();
      }
      ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 1.7; ctx.shadowColor = '#ff9a1a'; ctx.shadowBlur = 7;
      trace(null, Math.max(0, Math.min(1, w.pos))); ctx.stroke(); ctx.shadowBlur = 0;
    };
    w.name = name;
    waves[d.slot] = w;
    return { dom: box, set: (v) => { name.textContent = `${String(v + 1).padStart(2, '0')} ${tableName(v)}`; } };
  }

  // ---------------------------------------------------------------- sections
  const BUILD = { knob: buildKnob, rot: buildRot, slider: buildSlider, sw: buildSw, tog: buildTog, wave: buildWave };
  for (const s of SECTIONS) {
    const sec = el('div', 'sec', panel, { left: px(s.x), top: px(s.y), width: px(s.w), height: px(s.h) });
    el('div', 'stitle', sec).textContent = s.title;
    for (const d of s.ui) {
      if (BUILD[d.t]) {
        const c = BUILD[d.t](sec, d);
        c.def = d; controls[d.id] = c;
        if (d.t !== 'wave') bindControl(d.id, c);
      } else if (d.t === 'text') label(sec, d.x, d.y, d.text, d);
      else if (d.t === 'led') leds[d.id] = el('div', 'lamp', sec, { left: px(d.x), top: px(d.y) });
      else if (d.t === 'lcd') {
        const box = el('div', 'lcd', sec, { left: px(d.x), top: px(d.y), width: px(d.w), height: px(d.h) });
        lcd = [el('div', '', box), el('div', '', box)];
      } else if (d.t === 'voices') {
        for (let i = 0; i < NVOICES; i++) voiceLeds.push(el('div', 'lamp small', sec, { left: px(d.x + i * 12), top: px(d.y) }));
        label(sec, d.x + (NVOICES - 1) * 6, d.y + 26, 'Voices in use');
      }
    }
  }

  // ---------------------------------------------------------------- pointer helpers
  function drag(e, target, move, up) {
    try { target.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    const mv = (ev) => move(ev);
    const end = (ev) => {
      target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end);
      up && up(ev);
    };
    target.addEventListener('pointermove', mv); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  }
  const zoom = () => rig.getBoundingClientRect().width / RIG_W;

  function bindControl(key, c) {
    const d = c.def, dom = c.dom, range = d.max - d.min;
    dom.dataset.ctl = key;
    dom.addEventListener('contextmenu', (e) => { e.preventDefault(); host.menu(key, e.clientX, e.clientY); });
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (host.learning()) host.learnSelect(key);
      const v0 = host.getParam(key), y0 = e.clientY;
      host.touch(key);
      if (d.t === 'knob') {
        drag(e, dom, (ev) => host.setParam(key, v0 + (y0 - ev.clientY) * range / (ev.shiftKey ? 1500 : 200)));
      } else if (d.t === 'slider') {
        const z = zoom();
        drag(e, dom, (ev) => host.setParam(key, v0 + (y0 - ev.clientY) / z * range / ((d.h - CAP) * (ev.shiftKey ? 6 : 1))));
      } else if (d.t === 'rot') {
        let moved = false;
        drag(e, dom, (ev) => { const dv = Math.round((y0 - ev.clientY) / 16); if (dv) moved = true; host.setParam(key, v0 + dv); },
          () => { if (!moved) host.setParam(key, v0 >= d.max ? 0 : v0 + 1); });
      } else if (d.t === 'sw') {
        if (d.max === 1) host.setParam(key, v0 > 0.5 ? 0 : 1);
        else { const r = dom.getBoundingClientRect(); host.setParam(key, v0 + (e.clientY < r.top + r.height / 2 ? 1 : -1)); }
      } else if (d.t === 'tog') host.setParam(key, v0 > 0.5 ? 0 : 1);
    });
    if (d.t === 'knob' || d.t === 'slider') {
      dom.addEventListener('dblclick', () => host.setParam(key, d.def));
      dom.addEventListener('wheel', (e) => {
        e.preventDefault();
        host.setParam(key, host.getParam(key) - Math.sign(e.deltaY) * (d.step ? 1 : range / (e.shiftKey ? 1000 : 100)));
      }, { passive: false });
    } else if (d.t === 'rot' || d.t === 'sw') {
      dom.addEventListener('wheel', (e) => { e.preventDefault(); host.setParam(key, host.getParam(key) - Math.sign(e.deltaY)); }, { passive: false });
    }
  }

  // ---------------------------------------------------------------- keyboard and wheels
  const kb = el('div', '', rig, { left: px(CHEEK), top: px(TOP + PANEL_H), width: px(PANEL_W), height: px(KB_H) }); kb.id = 'kb';
  el('div', 'brand', kb).innerHTML = 'Goong<b>Wave</b>';
  for (const [k, x, name] of [['bend', 56, 'Bend'], ['mod', 116, 'Mod']]) {
    const slot = el('div', 'wheel', kb, { left: px(x), top: px(96) });
    const w = el('i', '', slot);
    label(kb, x, 163, name);
    const st = { v: 0, set(v) { st.v = v; w.style.top = px(k === 'bend' ? 50 - v * 42 : 92 - v * 84); } };
    st.set(0);
    wheels[k] = st;
    slot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const v0 = st.v, y0 = e.clientY, z = zoom();
      drag(e, slot, (ev) => host.ctl(k, Math.max(k === 'bend' ? -1 : 0, Math.min(1, v0 + (y0 - ev.clientY) / z / (k === 'bend' ? 45 : 90)))),
        () => { if (k === 'bend') host.ctl('bend', 0); });
    });
  }
  const keys = el('div', '', kb, { left: px(KEYS_X - CHEEK), width: px(36 * KEY_W) }); keys.id = 'keys'; keys.title = t('kbHint');
  {
    let wx = 0;
    for (let n = KB_LOW; n < KB_LOW + KB_KEYS; n++) {
      const black = [1, 3, 6, 8, 10].includes(n % 12);
      const k = el('div', 'key ' + (black ? 'b' : 'w'), keys, { left: px(black ? wx - 10 : wx) });
      k.dataset.note = n; keyEls[n] = k;
      if (!black) { if (n % 12 === 0) el('span', '', k).textContent = 'C' + (n / 12 - 1); wx += KEY_W; }
    }
    let cur = null;
    const at = (e) => { const k = document.elementFromPoint(e.clientX, e.clientY); return k && k.dataset && k.dataset.note ? +k.dataset.note : null; };
    const vel = (e, n) => { // lower on the key = louder
      if (n == null) return 0.8;
      const r = keyEls[n].getBoundingClientRect();
      return Math.max(0.25, Math.min(1, 0.25 + 0.9 * (e.clientY - r.top) / r.height));
    };
    const go = (n, e) => { if (n === cur) return; if (cur != null) host.noteOff(cur); cur = n; if (n != null) host.noteOn(n, vel(e, n)); };
    keys.addEventListener('pointerdown', (e) => { e.preventDefault(); go(at(e), e); drag(e, keys, (ev) => go(at(ev), ev), () => go(null)); });
  }

  // ---------------------------------------------------------------- redraw loop for the wave displays
  function frame() {
    for (const w of waves) if (w && (w.dirty || Math.abs(w.pos - w.shown) > 0.002)) w.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    controls,
    setControl(key, v) { const c = controls[key]; if (c) c.set(v); },
    setKey(n, on) { const k = keyEls[n]; if (k) k.classList.toggle('on', on); },
    setWheel(k, v) { if (wheels[k]) wheels[k].set(v); },
    setWave(slot, table) { const w = waves[slot]; w.table = table; w.dirty = true; },
    setWavePos(slot, pos) { waves[slot].pos = pos; },
    setLcd(line, text) { lcd[line].textContent = text; },
    setState(st) {
      for (let i = 0; i < STEPS; i++) leds['step' + i].classList.toggle('on', st.step === i);
      for (let i = 0; i < NVOICES; i++) voiceLeds[i].classList.toggle('on', !!(st.voices >> i & 1));
    },
    markLearn(key) { for (const [k, c] of Object.entries(controls)) c.dom.classList.toggle('learnsel', k === key); },
    markMapped(set) { for (const [k, c] of Object.entries(controls)) c.dom.classList.toggle('mapped', set.has(k)); },
  };
}
