// 게임 4: AI 우주 수호대 — 두 손 위치에 방어막이 생기고(화면 좌표 1:1), 몸 쪽으로 날아오는 운석을 막는다.
// 막기 판정: 운석 원과 손 방어막 원이 실제로 겹치면 막음. 운석이 목표 지점(몸 주변)에 닿으면 에너지 감소.
// 마지막 보스: 두 손을 머리 위로 올린 "만세 방어막"으로 막는다. 인식이 끊기면 운석이 멈춘다.

import { GameClock, Events, ENCOURAGE, pick, clamp01 } from './common.js';
import { drawMeteor, drawShield, Particles } from '../ui/art.js';

export const SPACE_DIFFICULTY = {
  easy: { label: '쉬움', flight: 3.4, interval: 1.9, shield: 0.55 },
  normal: { label: '보통', flight: 2.8, interval: 1.5, shield: 0.48 },
  hard: { label: '도전', flight: 2.3, interval: 1.15, shield: 0.42 },
};

// 가슴 기준 목표 지점(몸통 길이 T 배수, 화면 좌표) — 손을 뻗으면 닿는 위치
export const TARGETS = [[-1.1, -0.4], [1.1, -0.4], [-0.7, -1.1], [0.7, -1.1], [0, -1.45], [-1.3, 0.3], [1.3, 0.3]];
const BOSS_MS = 15000;
const BOSS_FLIGHT = 7000;

/** 두 원이 겹치는지 */
export function circlesHit(a, ar, b, br) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= ar + br;
}

/** 만세 방어막: 두 손이 모두 머리보다 위에 있고 어깨 폭 이상 벌어져 있으면 활성 */
export function domeActive(body) {
  const { L, R } = body.hands;
  if (!L || !R) return false;
  const above = L.y < body.head.y - body.T * 0.15 && R.y < body.head.y - body.T * 0.15;
  return above && Math.abs(L.x - R.x) >= body.shoulderW * 0.6;
}

export class SpaceGuard {
  constructor({ difficulty = 'easy', durationMs = 60000, energy = 5, rng = Math.random }) {
    this.diff = SPACE_DIFFICULTY[difficulty] ?? SPACE_DIFFICULTY.easy;
    this.duration = durationMs;
    this.energy = energy;
    this.maxEnergy = energy;
    this.rng = rng;
    this.clock = new GameClock();
    this.events = new Events();
    this.particles = new Particles();
    this.meteors = [];
    this.nextAt = 1200;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.blocked = 0;
    this.missed = 0;
    this.boss = null;
    this.bossResult = null;
    this.flash = null;
    this.body = null;
    this.phase = 'ACTIVE';
    this.lastT = 0;
  }

  get done() { return this.phase === 'DONE'; }

  _spawn(body, vis) {
    const off = TARGETS[Math.floor(this.rng() * TARGETS.length)];
    const target = { x: body.chest.x + off[0] * body.T, y: body.chest.y + off[1] * body.T };
    const sx = Math.min(vis.x1, Math.max(vis.x0, target.x + (this.rng() - 0.5) * body.T * 2.2));
    const start = { x: sx, y: vis.y0 - body.T * 0.3 };
    this.meteors.push({ start, target, t0: this.clock.ms, flight: this.diff.flight * 1000, r: body.T * 0.2, x: start.x, y: start.y, vx: 0, vy: 1 });
  }

  update(now, s) {
    if (this.phase === 'DONE') return;
    const tracking = s.status === 'OK' && !!s.body;
    if (s.fresh && s.body) this.body = s.body;
    this.clock.tick(now, tracking);
    this.paused = !this.clock.running;
    const t = this.clock.ms;
    const dt = (t - this.lastT) / 1000;
    this.lastT = t;
    this.particles.update(Math.max(0, dt));
    const b = this.body;
    if (!b || !s.vis) return;

    const bossTime = t >= this.duration - BOSS_MS;
    if (!bossTime && t >= this.nextAt) {
      this._spawn(b, s.vis);
      this.nextAt = t + this.diff.interval * 1000 * (0.85 + this.rng() * 0.3);
    }
    if (bossTime && !this.boss && !this.bossResult && this.meteors.length === 0) {
      const target = { x: b.chest.x, y: b.head.y - b.T * 0.55 };
      this.boss = { start: { x: target.x, y: s.vis.y0 - b.T }, target, t0: t, flight: BOSS_FLIGHT, r: b.T * 0.55, domeMs: 0, x: target.x, y: s.vis.y0 };
      this.events.push('boss');
    }

    const shieldR = b.T * this.diff.shield;
    for (const m of this.meteors) {
      const p = clamp01((t - m.t0) / m.flight);
      const nx = m.start.x + (m.target.x - m.start.x) * p;
      const ny = m.start.y + (m.target.y - m.start.y) * p;
      m.vx = nx - m.x; m.vy = ny - m.y; m.x = nx; m.y = ny;
      if (m.done) continue;
      const shield = tracking && ['L', 'R'].some((k) => b.hands[k] && circlesHit(b.hands[k], shieldR, m, m.r));
      if (shield) {
        m.done = 'blocked';
        this.blocked += 1;
        this.combo += 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        const pts = 50 + Math.min(this.combo - 1, 6) * 10;
        this.score += pts;
        this.events.push('block');
        this.particles.burst(m.x, m.y, '#8ce6ff', 18);
        this.flash = { text: `막았다! +${pts}`, tone: 'ok', until: now + 700 };
      } else if (p >= 1) {
        m.done = 'hit';
        this.missed += 1;
        this.energy -= 1;
        this.combo = 0;
        this.events.push('hit');
        this.particles.burst(m.x, m.y, '#ffb347', 14);
        this.flash = { text: this.energy > 0 ? `앗! 에너지 -1 · ${pick(ENCOURAGE, this.rng)}` : '앗! 에너지를 다 썼어요', tone: 'warn', until: now + 1000 };
      }
    }
    this.meteors = this.meteors.filter((m) => !m.done);

    if (this.boss) {
      const bo = this.boss;
      const p = clamp01((t - bo.t0) / bo.flight);
      bo.x = bo.start.x + (bo.target.x - bo.start.x) * p;
      bo.y = bo.start.y + (bo.target.y - bo.start.y) * p;
      this.dome = tracking && domeActive(b);
      // 보스가 가까워진(70% 이후) 동안 만세 방어막을 합계 1.2초 유지하면 격파.
      // 유지 시간은 매 프레임 누적한다(AI 추론은 화면 갱신보다 드물게 오므로 마지막 인식 결과 기준).
      if (p >= 0.7 && this.dome) bo.domeMs += Math.min(100, dt * 1000);
      if (bo.domeMs >= 1200) {
        this.score += 500;
        this.bossResult = 'win';
        this.events.push('perfect');
        this.particles.burst(bo.x, bo.y, '#c9a8ff', 40, 400);
        this.flash = { text: '보스 격파! +500', tone: 'ok', until: now + 1800 };
        this.boss = null;
      } else if (p >= 1) {
        this.energy -= 2;
        this.bossResult = 'lose';
        this.events.push('hit');
        this.flash = { text: '보스가 지나갔어요! 다음엔 만세 방어막!', tone: 'warn', until: now + 1600 };
        this.boss = null;
      }
    }

    if (this.energy <= 0 || (t >= this.duration && !this.boss)) {
      this.phase = 'DONE';
      this.events.push('finish');
    }
  }

  popEvents() { return this.events.pop(); }

  hud(now = performance.now()) {
    const f = this.flash && now < this.flash.until ? this.flash : null;
    let message = f?.text ?? (this.boss ? '🛸 보스 등장! 두 손을 머리 위로 — 만세 방어막!' : '두 손 방어막으로 운석을 막아요!');
    let tone = f?.tone ?? (this.boss ? 'warn' : 'info');
    if (this.paused) { message = null; tone = 'wait'; }
    return {
      score: this.score, combo: this.combo, lives: Math.max(0, this.energy), maxLives: this.maxEnergy,
      timeLeftMs: Math.max(0, this.duration - this.clock.ms), message, tone,
    };
  }

  draw(ctx, now, view) {
    const b = this.body;
    const t = now / 1000;
    for (const m of this.meteors) drawMeteor(ctx, m.x, m.y, m.r, m.vx, m.vy);
    if (this.boss) {
      drawMeteor(ctx, this.boss.x, this.boss.y, this.boss.r, 0, 1, true);
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(this.boss.r * 0.5)}px Pretendard, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BOSS', this.boss.x, this.boss.y + this.boss.r * 0.18);
      ctx.restore();
    }
    if (b) {
      const r = b.T * this.diff.shield;
      for (const k of ['L', 'R']) if (b.hands[k]) drawShield(ctx, b.hands[k].x, b.hands[k].y, r, view.effects === 'low' ? 0 : t);
      if (this.dome && this.boss) {
        ctx.save();
        ctx.strokeStyle = 'rgba(140, 230, 255, 0.95)';
        ctx.fillStyle = 'rgba(77, 208, 255, 0.18)';
        ctx.lineWidth = Math.max(4, b.T * 0.06);
        ctx.beginPath();
        ctx.arc(b.chest.x, b.head.y, b.T * 1.1, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    this.particles.draw(ctx);
  }

  result() {
    const badges = [];
    if (this.bossResult === 'win') badges.push('🛸 보스 격파');
    if (this.maxCombo >= 5) badges.push(`🛡️ ${this.maxCombo}연속 방어`);
    if (this.missed === 0 && this.blocked > 0) badges.push('🌍 완벽한 수호');
    if (!badges.length) badges.push('🚀 우주 수호대원');
    return {
      score: this.score,
      lines: [`막은 운석 ${this.blocked}개 · 놓친 운석 ${this.missed}개`, `최고 연속 방어 ${this.maxCombo} · 보스 ${this.bossResult === 'win' ? '격파!' : this.bossResult === 'lose' ? '다음 기회에!' : '-'}`],
      badges,
      chips: [],
    };
  }
}
