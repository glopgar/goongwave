// Interface language (Spanish / English). Panel legends stay in English, as on most instruments.
const LS = 'gw.lang';
let stored = null;
try { stored = localStorage.getItem(LS); } catch { /* storage unavailable */ }
export const lang = stored === 'es' || stored === 'en' ? stored : ((navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en');
export function setLang(l) { try { localStorage.setItem(LS, l); } catch { /* storage unavailable */ } location.reload(); }

const S = {
  title: ['GoongWave — sintetizador de tabla de ondas', 'GoongWave — wavetable synthesizer'],
  powerTip: ['Encender / apagar el audio', 'Audio on / off'],
  patch: ['Sonido', 'Patch'],
  save: ['Guardar', 'Save'], saveTip: ['Guardar como sonido de usuario', 'Save as a user patch'],
  del: ['Borrar', 'Delete'], delTip: ['Borrar el sonido de usuario seleccionado', 'Delete the selected user patch'],
  export: ['Exportar', 'Export'], exportTip: ['Exportar el sonido a un archivo JSON', 'Export the patch to a JSON file'],
  import: ['Importar', 'Import'], importTip: ['Importar un sonido desde un archivo JSON', 'Import a patch from a JSON file'],
  midiInTip: ['Entrada MIDI', 'MIDI input'], chTip: ['Canal MIDI', 'MIDI channel'],
  learnTip: ['Modo aprendizaje: pulsa un control del panel y mueve un control físico', 'Learn mode: click a panel control, then move a hardware control'],
  maps: ['Asignaciones', 'Mappings'], mapsTip: ['Ver / editar asignaciones MIDI', 'View / edit MIDI mappings'],
  fit: ['Ajustar', 'Fit'], panicTip: ['Apagar todas las notas', 'All notes off'], langTip: ['Idioma', 'Language'],
  audioFail: ['No se pudo iniciar el audio: {0}', 'Could not start audio: {0}'],
  learnMove: ['{0}: mueve un control MIDI…', '{0}: move a MIDI control…'],
  allInputs: ['Todas las entradas', 'All inputs'], noInputs: [' (ninguna detectada)', ' (none detected)'],
  omni: ['Todos los canales', 'All channels'], ch: ['Canal {0}', 'Channel {0}'],
  mLearn: ['Aprender MIDI…', 'MIDI learn…'], mUnmap: ['Quitar asignación ({0})', 'Remove mapping ({0})'], mNone: ['Sin asignación MIDI', 'No MIDI mapping'],
  mReset: ['Restablecer valor', 'Reset value'],
  user: ['Usuario', 'User'], patchName: ['Nombre del sonido:', 'Patch name:'], myPatch: ['Mi sonido', 'My patch'],
  saved: ['Sonido guardado', 'Patch saved'], onlyUser: ['Solo se pueden borrar sonidos de usuario', 'Only user patches can be deleted'],
  confirmDel: ['¿Borrar "{0}"?', 'Delete "{0}"?'], imported: ['Sonido importado', 'Patch imported'], badFile: ['Archivo de sonido no válido', 'Not a valid patch file'],
  learnOn: ['Pulsa un control del panel y mueve un control de tu equipo MIDI', 'Click a panel control, then move a control on your MIDI gear'],
  remove: ['Quitar', 'Remove'], mapsTitle: ['Asignaciones MIDI', 'MIDI mappings'], control: ['Control', 'Control'], source: ['Origen', 'Source'],
  noMaps: ['No hay asignaciones. Usa <b>MIDI Learn</b> o haz clic derecho sobre cualquier mando, deslizador o conmutador.', 'No mappings yet. Use <b>MIDI Learn</b> or right-click any knob, slider or switch.'],
  clearAll: ['Borrar todas', 'Clear all'], close: ['Cerrar', 'Close'],
  noMidi: ['Web MIDI no disponible', 'Web MIDI not available'],
  channel: [' · canal {0}', ' · channel {0}'],
  kbHint: ['Teclado del ordenador: A W S E D F T G Y H U J K · Z / X octava · Espacio: secuenciador', 'Computer keyboard: A W S E D F T G Y H U J K · Z / X octave · Space: sequencer'],
  helpTitle: ['GoongWave — ayuda rápida', 'GoongWave — quick help'],
  help: [`<li><b>POWER</b> enciende y apaga el audio. Si el navegador lo bloquea al cargar, se enciende con tu primer clic.</li>
  <li><b>Mandos y deslizadores</b>: arrastra arriba/abajo o usa la rueda; <kbd>Shift</kbd> = ajuste fino; doble clic = valor por defecto. La pantalla de <b>Master</b> muestra el valor.</li>
  <li><b>Osciladores</b>: cada uno recorre una <b>tabla de ondas</b>. Elige la tabla con ◀ ▶ (o la rueda sobre la pantalla) y muévete por ella con <b>Position</b>. <b>Env</b> hace que la envolvente de onda la recorra; los LFO (<b>Wave</b>) y el secuenciador también pueden moverla.</li>
  <li><b>Secuenciador</b>: <b>Run</b> (o <kbd>Espacio</kbd>) lo arranca. Cada paso tiene nota (en semitonos), un valor <b>Mod</b> y un conmutador: abajo silencio, centro nota, arriba ligadura con el paso siguiente. La fila Mod se envía a la posición de onda y al filtro con los mandos <b>Mod row to</b>.</li>
  <li>Con el secuenciador en marcha, las teclas <b>transportan</b> la secuencia (Do3 = sin transporte) en lugar de sonar.</li>
  <li><b>Voices</b>: POLY (8 voces), MONO, o LEG (mono sin redisparo y con <b>Glide</b> solo entre notas ligadas).</li>
  <li><b>MIDI</b>: notas, pitch bend, rueda de modulación (vibrato del LFO 1) y pedal de sustain. Para asignar un control físico: clic derecho sobre un mando → <i>Aprender MIDI</i>, o activa <b>MIDI Learn</b>.</li>
  <li><b>Teclado del ordenador</b>: <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>E</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>T</kbd> <kbd>G</kbd> <kbd>Y</kbd> <kbd>H</kbd> <kbd>U</kbd> <kbd>J</kbd> <kbd>K</kbd>; <kbd>Z</kbd>/<kbd>X</kbd> cambian de octava. En el teclado de pantalla, cuanto más abajo pulses la tecla, más fuerte suena.</li>`,
  `<li><b>POWER</b> turns audio on and off. If the browser blocks it on load, it starts on your first click.</li>
  <li><b>Knobs and sliders</b>: drag up/down or use the wheel; <kbd>Shift</kbd> = fine adjust; double-click = default value. The <b>Master</b> display shows the value.</li>
  <li><b>Oscillators</b>: each one scans a <b>wavetable</b>. Pick the table with ◀ ▶ (or the wheel over the display) and move through it with <b>Position</b>. <b>Env</b> lets the wave envelope sweep it; the LFOs (<b>Wave</b>) and the sequencer can move it too.</li>
  <li><b>Sequencer</b>: <b>Run</b> (or <kbd>Space</kbd>) starts it. Each step has a note (in semitones), a <b>Mod</b> value and a switch: down is a rest, centre a note, up a tie into the next step. The Mod row goes to the wave position and the filter through the <b>Mod row to</b> knobs.</li>
  <li>While the sequencer runs, the keys <b>transpose</b> the sequence (C3 = no transposition) instead of playing.</li>
  <li><b>Voices</b>: POLY (8 voices), MONO, or LEG (mono, no retrigger, and <b>Glide</b> only between tied notes).</li>
  <li><b>MIDI</b>: notes, pitch bend, mod wheel (LFO 1 vibrato) and sustain pedal. To map a hardware control: right-click a knob → <i>MIDI learn</i>, or turn on <b>MIDI Learn</b>.</li>
  <li><b>Computer keyboard</b>: <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>E</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>T</kbd> <kbd>G</kbd> <kbd>Y</kbd> <kbd>H</kbd> <kbd>U</kbd> <kbd>J</kbd> <kbd>K</kbd>; <kbd>Z</kbd>/<kbd>X</kbd> change octave. On the on-screen keyboard, the lower you press a key, the louder it plays.</li>`],
};
export function t(key, ...args) {
  const e = S[key];
  let s = e ? e[lang === 'es' ? 0 : 1] : key;
  args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
  return s;
}

// Factory patch and category names are written in Spanish; these are their English names.
const NAMES = {
  'Secuencias': 'Sequences', 'Colchones': 'Pads', 'Bajos y solistas': 'Basses and leads', 'Teclados y campanas': 'Keys and bells', 'Básicos': 'Basics',
  'Berlín · ostinato de 8 pasos': 'Berlin · 8-step ostinato',
  'Arpegio de ondas (MOD recorre la tabla)': 'Wave arpeggio (MOD scans the table)',
  'Bajo ácido digital (ligaduras y silencios)': 'Digital acid bass (ties and rests)',
  'Pulso vocal (una vocal por paso)': 'Vocal pulse (one vowel per step)',
  'Paisaje aleatorio de campanas': 'Random bell landscape',
  'Barrido resonante': 'Resonant sweep', 'Coro vocal': 'Vocal choir', 'Cuerdas de pulso': 'Pulse strings', 'Espectros lentos': 'Slow spectra', 'Cristal': 'Glass',
  'Bajo sync': 'Sync bass', 'Bajo FM': 'FM bass', 'Bajo redondo con ligado': 'Round legato bass', 'Solista plegado': 'Folded lead', 'Solista de fase': 'Phase lead',
  'Piano eléctrico FM': 'FM electric piano', 'Campana metálica': 'Metal bell', 'Órgano con altavoz giratorio': 'Organ with rotary speaker',
  'Arpa escalonada': 'Staircase harp', 'Inicial': 'Init',
};
export const tn = (name) => (lang === 'en' && NAMES[name]) || name;

// Static markup: data-i18n="key" (text), data-i18n-title="key" (tooltip).
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.title = t('title');
  root.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
}
