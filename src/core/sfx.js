// 효과음: Web Audio 로 직접 합성(음원 파일 없음). 마이크는 사용하지 않는다.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.enabled = true;
  }

  unlock() {
    if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { this.ctx = null; } }
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _tone(freq, at, dur, vol = 0.25, type = 'sine', slideTo = null) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * this.volume), at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  play(name) {
    if (!this.enabled || this.volume <= 0) return;
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const seq = (notes, step, dur, vol, type) => notes.forEach((f, i) => this._tone(f, t + i * step, dur, vol, type));
    switch (name) {
      case 'count': this._tone(660, t, 0.14, 0.2, 'square'); break;
      case 'go': this._tone(988, t, 0.3, 0.22, 'square'); break;
      case 'success': seq([523, 659, 784, 1047], 0.07, 0.22, 0.2, 'triangle'); break;
      case 'perfect': seq([659, 784, 988, 1319], 0.06, 0.25, 0.22, 'triangle'); break;
      case 'retry': this._tone(392, t, 0.18, 0.16); this._tone(330, t + 0.16, 0.26, 0.16); break;
      case 'dodge': this._tone(500, t, 0.18, 0.18, 'triangle', 900); break;
      case 'hit': this._tone(220, t, 0.3, 0.2, 'sawtooth', 110); break;
      case 'collect': seq([784, 1047, 1319], 0.05, 0.18, 0.2, 'sine'); break;
      case 'block': this._tone(1200, t, 0.08, 0.15, 'square'); this._tone(800, t + 0.04, 0.12, 0.12, 'triangle'); break;
      case 'boss': seq([196, 247, 294], 0.12, 0.3, 0.2, 'sawtooth'); break;
      case 'finish': seq([523, 659, 784, 659, 784, 1047], 0.1, 0.28, 0.2, 'triangle'); break;
      case 'click': this._tone(880, t, 0.05, 0.1, 'square'); break;
      default: break;
    }
  }
}
