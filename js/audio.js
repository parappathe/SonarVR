// Sons sintetizados na hora (sem arquivos). Só liga depois de um clique ou da entrada no VR;
// os testes nunca chamam unlock, então nunca tocam nada. O eco do ping sai de um PannerNode (áudio 3D)
// posto na posição real do submarino inimigo no aquário; o ouvinte acompanha a cabeça (câmera).
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.lastEcho = null; this.echoes = []; }

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.white = this.makeNoise(3, false);
      this.brown = this.makeNoise(3, true);
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  makeNoise(sec, brown) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { b = 0.98 * b + 0.02 * w; d[i] = b * 7; } else d[i] = w * 0.5;
    }
    return buf;
  }
  loop(buf, type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { f, g };
  }
  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.004 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', attack = 0, sweep = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.white;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    g.gain.setValueAtTime(attack ? 0.0001 : vol, t);
    if (attack) g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { vol: 0.1, type: 'triangle', at: i * 0.08 })); }
  bad() { this.tone(330, 0.5, { vol: 0.1, type: 'triangle', slide: 0.7 }); this.tone(262, 0.6, { vol: 0.06, type: 'sine', slide: 0.7, at: 0.12 }); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.7 : 0.18, { vol: 0.12, type: 'triangle', at: i * 0.12 })); }
  star(n) { this.tone(784 * (1 + n * 0.26), 0.35, { vol: 0.12, type: 'triangle' }); }

  // ---- Sonar ----
  pick() { this.tone(980, 0.05, { vol: 0.06, type: 'triangle', slide: 1.2 }); }
  deny() { this.tone(180, 0.15, { vol: 0.08, type: 'square' }); }
  move() { this.noise(0.5, { vol: 0.05, freq: 300, q: 0.8, type: 'lowpass', attack: 0.1 }); }
  // ping: o "tooon" do sonar
  ping() { this.tone(1350, 1.4, { vol: 0.16, type: 'sine', attack: 0.003 }); this.tone(1350, 1.0, { vol: 0.04, type: 'sine', at: 0.35, attack: 0.01 }); }
  enemyPing() { this.tone(980, 1.2, { vol: 0.09, type: 'sine', attack: 0.003 }); this.tone(980, 0.8, { vol: 0.03, type: 'sine', at: 0.3 }); }
  // ouvinte = cabeça do jogador
  setListener(p, f, u) {
    const c = this.ctx; if (!c) return;
    const L = c.listener, t = c.currentTime;
    if (L.positionX) { L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t); L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t); L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t); }
    else { L.setPosition?.(p.x, p.y, p.z); L.setOrientation?.(f.x, f.y, f.z, u.x, u.y, u.z); }
  }
  // eco vindo da posição pos (mundo), depois de "delay" segundos
  echo(pos, delay = 0.4, vol = 0.14) {
    this.lastEcho = { x: pos.x, y: pos.y, z: pos.z, delay };
    this.echoes.push(this.lastEcho);
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const pan = c.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 0.3; pan.rolloffFactor = 0.6;
    if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
    pan.connect(this.master);
    for (const [f, v, at] of [[1350, vol, 0], [1350, vol * 0.35, 0.18]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t + at);
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(v, t + at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.5);
      o.connect(g); g.connect(pan); o.start(t + at); o.stop(t + at + 0.55);
    }
  }
  launch() { this.noise(0.6, { vol: 0.1, freq: 600, q: 0.7, attack: 0.05, sweep: 3 }); this.tone(220, 0.3, { vol: 0.06, type: 'square', slide: 0.5 }); }
  boom(near = false) { this.noise(1.2, { vol: near ? 0.35 : 0.22, freq: 400, q: 0.6, type: 'lowpass', sweep: 0.3 }); this.tone(55, 0.9, { vol: near ? 0.25 : 0.15, type: 'sine', slide: 0.6 }); }
  bubbles() { for (let k = 0; k < 6; k++) this.tone(500 + Math.random() * 700, 0.06, { vol: 0.03, type: 'sine', slide: 1.8, at: k * 0.07 + Math.random() * 0.05 }); }
  hear() { for (let k = 0; k < 6; k++) this.noise(0.08, { vol: 0.08, freq: 240, q: 2, at: k * 0.16 }); }
  alarm() { for (let k = 0; k < 3; k++) { this.tone(880, 0.18, { vol: 0.07, type: 'square', at: k * 0.32 }); this.tone(660, 0.14, { vol: 0.06, type: 'square', at: k * 0.32 + 0.16 }); } }
  sink() { this.boom(true); for (let k = 0; k < 10; k++) this.tone(200 + Math.random() * 400, 0.1, { vol: 0.05, type: 'sine', slide: 1.6, at: 0.4 + k * 0.12 }); }

  // Sala de sonar: zumbido grave das máquinas e bolhas de vez em quando
  startAmbience() { this.hum = this.loop(this.brown, 'lowpass', 140, 0.7); this.hum.g.gain.value = 0.05; this.bubT = 3; }
  updateAmbience(dt) {
    if (!this.ctx) return;
    this.bubT -= dt;
    if (this.bubT <= 0) { this.bubT = 4 + Math.random() * 6; for (let k = 0; k < 3; k++) this.tone(400 + Math.random() * 500, 0.05, { vol: 0.012, type: 'sine', slide: 1.7, at: k * 0.1 }); }
  }
}
