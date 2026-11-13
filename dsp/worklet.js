import { Engine } from './engine.js';

class GoongWaveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new Engine(sampleRate);
    this.frames = 0;
    this.port.onmessage = (e) => {
      const d = e.data, en = this.engine;
      switch (d.type) {
        case 'param': en.setParam(d.id, d.v, false); break;
        case 'params': for (const [id, v] of d.params) en.setParam(id, v, true); break;
        case 'table': en.setTable(d.slot, d.frames, d.data); break;
        case 'on': en.noteOn(d.n, d.v); break;
        case 'off': en.noteOff(d.n); break;
        case 'alloff': en.allOff(); break;
        case 'ctl': en.ctl(d.k, d.v); break;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    this.engine.process(out[0], out[1] || new Float32Array(out[0].length));
    this.frames += out[0].length;
    if (this.frames >= sampleRate / 30) {
      this.frames = 0;
      this.port.postMessage({ type: 'state', state: this.engine.state() });
    }
    return true;
  }
}
registerProcessor('goongwave', GoongWaveProcessor);
