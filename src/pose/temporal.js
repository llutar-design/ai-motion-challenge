// 프레임별 점수가 흔들려 판정이 깜빡이지 않도록 하는 시간 창 처리.

/** 최근 windowMs 동안의 점수를 모아 평균과 유효(인식된) 비율을 계산한다. */
export class ScoreWindow {
  constructor(windowMs = 500) {
    this.windowMs = windowMs;
    this.items = [];
  }

  reset() { this.items = []; }

  /** @param {number} t ms  @param {number|null} score null=인식 불확실 */
  push(t, score) {
    this.items.push({ t, score });
    const cut = t - this.windowMs;
    while (this.items.length && this.items[0].t < cut) this.items.shift();
  }

  stats() {
    const n = this.items.length;
    const valid = this.items.filter((i) => i.score != null);
    if (n === 0) return { mean: null, validRatio: 0, n: 0 };
    const validRatio = valid.length / n;
    // 유효 프레임이 절반 미만이면 판정 보류
    if (valid.length === 0 || validRatio < 0.5) return { mean: null, validRatio, n };
    const mean = valid.reduce((s, i) => s + i.score, 0) / valid.length;
    return { mean, validRatio, n };
  }
}

/**
 * 평활 점수가 임계값 이상으로 holdMs 동안 유지되면 성공.
 * 임계값 바로 아래의 작은 흔들림은 hysteresis 로 무시한다.
 */
export class HoldTracker {
  constructor({ threshold, holdMs, hysteresis = 5 }) {
    this.threshold = threshold;
    this.holdMs = holdMs;
    this.hysteresis = hysteresis;
    this.reset();
  }

  reset() {
    this.since = null;
    this.pausedAt = null;
    this.samples = [];
    this.done = false;
  }

  /** @returns {{holding:boolean, progress:number, done:boolean, onset:number|null}} */
  update(t, smoothed) {
    if (this.done) return { holding: true, progress: 1, done: true, onset: this.since };
    if (smoothed == null) {
      // 인식 불확실 구간은 유지 시간을 멈춰 두기만 하고(불이익 없음) 진행도는 그대로 둔다
      if (this.pausedAt == null) this.pausedAt = t;
      const held = this.since == null ? 0 : this.pausedAt - this.since;
      return { holding: false, progress: Math.min(1, held / this.holdMs), done: false, onset: null };
    }
    if (this.pausedAt != null) {
      if (this.since != null) this.since += t - this.pausedAt;
      this.pausedAt = null;
    }
    const above = this.since == null ? smoothed >= this.threshold : smoothed >= this.threshold - this.hysteresis;
    if (!above) {
      this.since = null;
      this.samples = [];
      return { holding: false, progress: 0, done: false, onset: null };
    }
    if (this.since == null) { this.since = t; this.samples = []; }
    this.samples.push(smoothed);
    const held = t - this.since;
    if (held >= this.holdMs) this.done = true;
    return { holding: true, progress: Math.min(1, held / this.holdMs), done: this.done, onset: this.since };
  }

  /** 유지 구간 평균 점수 / 안정도(표준편차가 작을수록 높음) */
  summary() {
    const s = this.samples;
    if (!s.length) return { poseScore: 0, stabilityScore: 0 };
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
    return { poseScore: mean, stabilityScore: Math.max(0, Math.min(100, 100 - sd * 4)) };
  }
}

/**
 * 좌우 흔들기 감지. x 는 몸통 길이 단위의 어깨 중심 가로 위치.
 * 처음엔 중앙에서 amp/2 이상, 이후에는 반대 방향 극값에서 amp 이상 움직일 때마다 1회로 센다.
 * 방향(좌/우)과 무관하게 번갈아 움직인 횟수를 센다.
 */
export class SwayTracker {
  constructor({ amp = 0.25, target = 3, smoothing = 0.5 } = {}) {
    this.amp = amp;
    this.target = target;
    this.smoothing = smoothing;
    this.reset();
  }

  reset() {
    this.x = null;
    this.anchor = null;
    this.extreme = null;
    this.dir = 0;
    this.swings = 0;
    this.history = [];
  }

  update(t, raw) {
    if (raw == null) return this.state();
    this.x = this.x == null ? raw : this.x + (raw - this.x) * this.smoothing;
    const x = this.x;
    if (this.anchor == null) { this.anchor = x; return this.state(); }
    if (this.dir === 0) {
      const d = x - this.anchor;
      if (Math.abs(d) >= this.amp / 2) {
        this.dir = Math.sign(d);
        this.extreme = x;
        this.swings = 1;
        this.history.push({ t, dir: this.dir });
      }
      return this.state();
    }
    if ((this.dir > 0 && x > this.extreme) || (this.dir < 0 && x < this.extreme)) {
      this.extreme = x;
    } else if (Math.abs(x - this.extreme) >= this.amp) {
      this.dir = -this.dir;
      this.extreme = x;
      this.swings += 1;
      this.history.push({ t, dir: this.dir });
    }
    return this.state();
  }

  state() {
    return { swings: this.swings, progress: Math.min(1, this.swings / this.target), done: this.swings >= this.target, dir: this.dir };
  }
}
