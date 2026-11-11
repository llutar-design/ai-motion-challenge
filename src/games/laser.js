// 게임 2: AI 레이저 탈출 — 다가오는 레이저 벽을 제자리에서 몸을 기울여 피한다.
// 충돌 판정: 레이저가 판정선에 닿는 순간 전후(±150ms) 실제 머리·가슴 위치(화면 좌표)가 레이저 영역 안인지.
// 기준점은 골반 중심(앉아서 하기에선 시작 때 잰 가슴 위치) — 옆으로 걸어가도 피해지지 않고, 기울여야 피한다.
// 점프·눕기·뛰기·깊게 숙이기·이동을 요구하는 장애물은 없다. 인식이 끊기면 레이저가 멈춘다.

import { GameClock, Events, ENCOURAGE, pick, clamp01 } from './common.js';

export const LASER_DIFFICULTY = {
  easy: { label: '쉬움', approach: [3.4, 3.0, 2.7], gap: 1.0, edge: 0.18 },
  normal: { label: '보통', approach: [3.0, 2.6, 2.3], gap: 0.8, edge: 0.2 },
  hard: { label: '도전', approach: [2.6, 2.3, 2.0], gap: 0.6, edge: 0.22 },
};

const HIT_WINDOW = 150; // 판정 순간 전후(ms)
const STAGE_MS = 20000;

/**
 * 레이저와 몸의 충돌 여부. 화면 좌표, cx: 기준점 x, e: 레이저 경계 여유(몸통 길이 T 배수).
 * LEFT: 화면 왼쪽 벽(왼쪽 끝 ~ cx+eT) → 화면 오른쪽으로 기울여야 함
 * RIGHT: 화면 오른쪽 벽(cx-eT ~ 오른쪽 끝) → 화면 왼쪽으로 기울여야 함
 * CENTER: 가운데 기둥(|x-cx| < eT) → 어느 쪽이든 기울이기
 */
export function laserCollides(type, body, cx, e) {
  const edge = e * body.T;
  const core = [body.head.x, body.chest.x];
  if (type === 'LEFT') return core.some((x) => x < cx + edge);
  if (type === 'RIGHT') return core.some((x) => x > cx - edge);
  return core.some((x) => Math.abs(x - cx) < edge);
}

const HINT = { LEFT: '→ 화면 오른쪽으로 몸을 기울여요!', RIGHT: '← 화면 왼쪽으로 몸을 기울여요!', CENTER: '← 어느 쪽이든 기울여요! →' };

export class LaserEscape {
  constructor({ difficulty = 'easy', durationMs = 60000, lives = 3, rng = Math.random }) {
    this.diff = LASER_DIFFICULTY[difficulty] ?? LASER_DIFFICULTY.easy;
    this.duration = durationMs;
    this.lives = lives;
    this.maxLives = lives;
    this.rng = rng;
    this.clock = new GameClock();
    this.events = new Events();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.dodged = 0;
    this.hits = 0;
    this.skipped = 0;
    this.cur = null;
    this.nextAt = 1500;
    this.flash = null;
    this.lastTypes = [];
    this.baseX = null;
    this.body = null;
    this.phase = 'ACTIVE';
  }

  get done() { return this.phase === 'DONE'; }
  get stage() { return Math.min(2, Math.floor(this.clock.ms / STAGE_MS)); }

  _cx(body) {
    if (body.hip) return body.hip.x;
    if (this.baseX == null) this.baseX = body.chest.x;
    return this.baseX;
  }

  _spawn() {
    let type;
    do { type = ['LEFT', 'RIGHT', 'CENTER'][Math.floor(this.rng() * 3)]; }
    while (this.lastTypes.length >= 2 && this.lastTypes.slice(-2).every((t) => t === type));
    this.lastTypes.push(type);
    const approach = this.diff.approach[this.stage] * 1000;
    this.cur = { type, t0: this.clock.ms, hitAt: this.clock.ms + approach, samples: [] };
  }

  update(now, s) {
    if (this.phase === 'DONE') return;
    const tracking = s.status === 'OK' && !!s.body;
    if (s.fresh && s.body) this.body = s.body;
    this.clock.tick(now, tracking);
    this.paused = !this.clock.running;
    const t = this.clock.ms;

    if (!this.cur && t >= this.nextAt && t < this.duration) this._spawn();
    const c = this.cur;
    if (c) {
      if (s.fresh && tracking && t >= c.hitAt - HIT_WINDOW && t <= c.hitAt + HIT_WINDOW) {
        c.samples.push(laserCollides(c.type, s.body, this._cx(s.body), this.diff.edge));
      }
      if (t > c.hitAt + HIT_WINDOW) this._resolve(now);
    }
    if (this.lives <= 0 || (t >= this.duration && !this.cur)) {
      this.phase = 'DONE';
      this.events.push('finish');
    }
  }

  _resolve(now) {
    const c = this.cur;
    this.cur = null;
    this.nextAt = this.clock.ms + this.diff.gap * 1000;
    if (c.samples.length < 2) { this.skipped += 1; this.flash = { text: '잠깐! 다시 와요', tone: 'wait', until: now + 900 }; return; }
    const hitRatio = c.samples.filter(Boolean).length / c.samples.length;
    if (hitRatio >= 0.5) {
      this.lives -= 1;
      this.hits += 1;
      this.combo = 0;
      this.events.push('hit');
      this.flash = { text: this.lives > 0 ? `앗! 레이저에 닿았어요 · ${pick(ENCOURAGE, this.rng)}` : '앗! 에너지를 다 썼어요', tone: 'warn', until: now + 1200, hitType: c.type };
    } else {
      this.dodged += 1;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pts = 100 + Math.min(this.combo - 1, 5) * 20;
      this.score += pts;
      this.events.push('dodge');
      this.flash = { text: `회피 성공! +${pts}`, tone: 'ok', until: now + 900 };
    }
  }

  popEvents() { return this.events.pop(); }

  hud(now = performance.now()) {
    const f = this.flash && now < this.flash.until ? this.flash : null;
    let message = f?.text ?? (this.cur ? HINT[this.cur.type] : '레이저가 다가와요. 준비!');
    let tone = f?.tone ?? (this.cur ? 'info' : 'info');
    if (this.paused) { message = null; tone = 'wait'; }
    return {
      score: this.score, combo: this.combo, lives: this.lives, maxLives: this.maxLives,
      timeLeftMs: Math.max(0, this.duration - this.clock.ms), message, tone, stage: this.stage + 1,
    };
  }

  /** 레이저 그리기(화면 좌표). 다가올수록 커지고 진해진다. 강한 점멸 없음. */
  draw(ctx, now, view) {
    const b = this.body;
    const c = this.cur;
    if (!b) return;
    const { vis } = view;
    const cx = this._cx(b);
    const edge = this.diff.edge * b.T;
    if (c) {
      const p = clamp01((this.clock.ms - c.t0) / (c.hitAt - c.t0));
      const regions = c.type === 'LEFT' ? [[vis.x0, cx + edge]] : c.type === 'RIGHT' ? [[cx - edge, vis.x1]] : [[cx - edge, cx + edge]];
      for (const [x0, x1] of regions) {
        const w = x1 - x0;
        const h = vis.y1 - vis.y0;
        const s = 0.35 + 0.65 * p; // 멀리서 다가오는 느낌
        const rx = x0 + (w * (1 - s)) / 2;
        const ry = vis.y0 + (h * (1 - s)) / 2;
        ctx.save();
        ctx.fillStyle = `rgba(255, 40, 80, ${0.08 + 0.3 * p})`;
        ctx.fillRect(rx, ry, w * s, h * s);
        ctx.strokeStyle = `rgba(255, 90, 120, ${0.4 + 0.5 * p})`;
        ctx.lineWidth = Math.max(2, b.T * 0.04);
        const lines = 7;
        for (let i = 0; i <= lines; i++) {
          const y = ry + (h * s * i) / lines;
          ctx.beginPath();
          ctx.moveTo(rx, y);
          ctx.lineTo(rx + w * s, y);
          ctx.stroke();
        }
        ctx.strokeRect(rx, ry, w * s, h * s);
        ctx.restore();
      }
      // 안전한 쪽 표시(연한 초록)
      ctx.save();
      ctx.fillStyle = 'rgba(61, 220, 132, 0.12)';
      if (c.type === 'LEFT') ctx.fillRect(cx + edge, vis.y0, vis.x1 - cx - edge, vis.y1 - vis.y0);
      else if (c.type === 'RIGHT') ctx.fillRect(vis.x0, vis.y0, cx - edge - vis.x0, vis.y1 - vis.y0);
      else { ctx.fillRect(vis.x0, vis.y0, cx - edge - vis.x0, vis.y1 - vis.y0); ctx.fillRect(cx + edge, vis.y0, vis.x1 - cx - edge, vis.y1 - vis.y0); }
      ctx.restore();
    }
    // 판정에 쓰는 몸 지점(머리·가슴) 표시
    ctx.save();
    for (const pt of [b.head, b.chest]) {
      ctx.fillStyle = 'rgba(77, 208, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(6, b.T * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  result() {
    const badges = [];
    if (this.hits === 0 && this.dodged > 0) badges.push('🛡️ 무피해 탈출');
    if (this.maxCombo >= 5) badges.push(`⚡ ${this.maxCombo}연속 회피`);
    if (this.lives > 0) badges.push('🏁 끝까지 생존');
    if (!badges.length) badges.push('💪 용감한 도전');
    return {
      score: this.score,
      lines: [`피한 레이저 ${this.dodged}개 · 닿은 레이저 ${this.hits}개`, `최고 연속 회피 ${this.maxCombo} · 남은 에너지 ${Math.max(0, this.lives)}/${this.maxLives}`],
      badges,
      chips: [],
    };
  }
}
