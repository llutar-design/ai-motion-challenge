// 게임 3: AI 백제 보물 탐험대 — 3개 구역. 구역마다 자세 미션을 통과하면 보물 3개가 나타나고,
// 손을 보물 위에 일정 시간(기본 0.7초) 머무르면 획득한다. 손 좌표는 화면(거울) 좌표 그대로 비교한다.
// 보물 위치는 탐색을 시작할 때 학생 몸(가슴·몸통 길이) 기준으로 팔이 닿는 곳에 고정한다.

import { POSE_MAP } from '../pose/poses.js';
import { ScoreWindow, HoldTracker } from '../pose/temporal.js';
import { shuffle } from '../core/random.js';
import { Events } from './common.js';
import { drawTreasureIcon, drawTreasureSlot, drawZoneFrame, Particles } from '../ui/art.js';

export const TREASURE_DIFFICULTY = {
  easy: { label: '쉬움', threshold: 62, radius: 0.5 },
  normal: { label: '보통', threshold: 70, radius: 0.42 },
  hard: { label: '도전', threshold: 78, radius: 0.36 },
};

// 가슴 기준 보물 후보 위치(몸통 길이 T 배수, 화면 x 오른쪽 +, y 아래 +) — 모두 제자리에서 팔이 닿는 곳
export const SPOTS = [[-1.25, -0.5], [1.25, -0.5], [-0.85, -1.35], [0.85, -1.35], [-1.45, 0.35], [1.45, 0.35], [0, -1.75]];

const INTRO_MS = 1800;
const CLEAR_MS = 1600;
const FOUND_MS = 2800;
const GAP_MS = 220; // 손이 잠깐 인식 안 돼도 머무르기를 이어 가는 여유

/** 손이 보물 원 안에 있는지 */
export function handOn(hands, tr, radiusPx) {
  return ['L', 'R'].some((k) => hands[k] && Math.hypot(hands[k].x - tr.x, hands[k].y - tr.y) <= radiusPx);
}

export class TreasureQuest {
  /**
   * @param {{content:{zones:any[], treasures:any[]}, difficulty?:string, dwellMs?:number, missionHoldMs?:number, limitMs?:number, mirror?:boolean, rng?:()=>number}} o
   */
  constructor({ content, difficulty = 'easy', dwellMs = 700, missionHoldMs = 1000, limitMs = 180000, mirror = true, rng = Math.random }) {
    this.diff = TREASURE_DIFFICULTY[difficulty] ?? TREASURE_DIFFICULTY.easy;
    this.content = content;
    this.dwellMs = dwellMs;
    this.missionHoldMs = missionHoldMs;
    this.limitMs = limitMs;
    this.mirror = mirror;
    this.rng = rng;
    this.events = new Events();
    this.particles = new Particles();
    this.score = 0;
    this.found = [];
    this.zoneIdx = 0;
    this.elapsed = 0;
    this.lastNow = null;
    this.body = null;
    this.popup = null;
    this._enterZone(0, 0);
  }

  get zone() { return this.content.zones[this.zoneIdx]; }
  get done() { return this.phase === 'DONE'; }

  _mission(i) {
    if (i === 1) {
      // 방향 맞추기: 화면에 보이는 화살표 쪽으로 팔 뻗기. 거울 화면에서는 학생의 오른팔이 화면 오른쪽에 보인다.
      const side = this.rng() < 0.5 ? 'left' : 'right';
      const rightArm = (side === 'right') === this.mirror;
      return { kind: 'arrow', side, pose: rightArm ? 'RIGHT_ARM_OUT' : 'LEFT_ARM_OUT', title: `${side === 'right' ? '➡ 오른쪽' : '⬅ 왼쪽'} 화살표 쪽으로 팔을 뻗어요!` };
    }
    if (i === 2) return { kind: 'pose', pose: 'MANSE', title: '별 모양 만세로 보물 지도를 밝혀요!' };
    return { kind: 'pose', pose: 'T_POSE', title: '두 팔을 쫙 벌려 궁궐 문을 열어요!' };
  }

  _enterZone(i, now) {
    this.zoneIdx = i;
    this.phase = 'INTRO';
    this.phaseUntil = now + INTRO_MS;
    this.mission = this._mission(i);
    this.window = new ScoreWindow(400);
    this.hold = new HoldTracker({ threshold: this.diff.threshold + (POSE_MAP[this.mission.pose].thresholdOffset ?? 0), holdMs: this.missionHoldMs });
    this.items = [];
  }

  _placeTreasures(body, vis) {
    const list = this.content.treasures.filter((t) => t.zone === this.zone.id).slice(0, 3);
    const spots = shuffle(SPOTS, this.rng).slice(0, list.length);
    const r = body.T * this.diff.radius;
    this.radiusPx = r;
    this.items = list.map((t, k) => {
      let x = body.chest.x + spots[k][0] * body.T;
      let y = body.chest.y + spots[k][1] * body.T;
      if (vis) {
        x = Math.min(vis.x1 - r * 1.3, Math.max(vis.x0 + r * 1.3, x));
        y = Math.min(vis.y1 - r * 1.3, Math.max(vis.y0 + r * 2.2, y));
      }
      return { ...t, x, y, since: null, lastTouch: -Infinity, progress: 0, got: false };
    });
  }

  /** s.vis: 화면에 보이는 영역(캔버스 픽셀) — 보물이 잘린 곳에 놓이지 않게 */
  update(now, s) {
    const dt = this.lastNow == null ? 0 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    if (this.phase === 'DONE') return;
    const tracking = s.status === 'OK' && !!s.body;
    if (s.fresh && s.body) this.body = s.body;
    this.waiting = !tracking;
    if (tracking) this.elapsed += dt;
    if (this.elapsed >= this.limitMs) { this._finish(); return; }
    this.particles.update(dt / 1000);

    if (this.phase === 'INTRO') {
      if (now >= this.phaseUntil) this.phase = 'MISSION';
      return;
    }
    if (this.phase === 'CLEAR') {
      if (now >= this.phaseUntil) {
        if (this.zoneIdx + 1 >= this.content.zones.length) this._finish();
        else this._enterZone(this.zoneIdx + 1, now);
      }
      return;
    }
    if (this.phase === 'MISSION') {
      if (!s.fresh) return;
      const score = tracking ? s.poseScore(this.mission.pose) : null;
      this.window.push(now, score);
      const st = this.window.stats();
      this.live = st.mean;
      const h = this.hold.update(now, st.mean);
      this.progress = h.progress;
      if (h.done && this.body) {
        this.score += 200;
        this.events.push('success');
        this.phase = 'SEARCH';
        this._placeTreasures(this.body, s.vis ?? null);
      }
      return;
    }
    if (this.phase === 'SEARCH') {
      if (!s.fresh) return;
      for (const it of this.items) {
        if (it.got) continue;
        const touching = tracking && handOn(s.body.hands, it, this.radiusPx);
        if (touching) {
          if (it.since == null || now - it.lastTouch > GAP_MS) it.since = now;
          it.lastTouch = now;
          it.progress = Math.min(1, (now - it.since) / this.dwellMs);
          if (now - it.since >= this.dwellMs) this._collect(it, now);
        } else if (now - it.lastTouch > GAP_MS) {
          it.since = null;
          it.progress = 0;
        }
      }
      if (this.items.every((it) => it.got)) {
        this.phase = 'CLEAR';
        this.phaseUntil = now + CLEAR_MS;
        this.events.push('finish');
      }
    }
  }

  _collect(it, now) {
    it.got = true;
    it.progress = 1;
    this.found.push(it.id);
    this.score += 100;
    this.events.push('collect');
    this.particles.burst(it.x, it.y, '#ffd84d', 22);
    this.popup = { item: it, until: now + FOUND_MS };
  }

  _finish() {
    this.phase = 'DONE';
  }

  popEvents() { return this.events.pop(); }

  hud(now = performance.now()) {
    const z = this.zone;
    let message = null;
    let tone = 'info';
    let guidePose = null;
    if (this.waiting) tone = 'wait';
    else if (this.phase === 'INTRO') { message = `${this.zoneIdx + 1}구역 · ${z.name} — ${z.intro}`; }
    else if (this.phase === 'MISSION') { message = this.progress > 0 ? '좋아요! 그대로!' : this.mission.title; tone = this.progress > 0 ? 'ok' : 'info'; guidePose = POSE_MAP[this.mission.pose]; }
    else if (this.phase === 'SEARCH') {
      const left = this.items.filter((i) => !i.got).length;
      message = `손을 반짝이는 보물 위에 잠깐 멈춰요! (남은 보물 ${left}개)`;
    } else if (this.phase === 'CLEAR') { message = `🎉 ${z.name} 탐험 완료!`; tone = 'ok'; }
    return {
      score: this.score, round: this.zoneIdx + 1, rounds: this.content.zones.length,
      timeLeftMs: Math.max(0, this.limitMs - this.elapsed), message, tone, guidePose,
      popup: this.popup && now < this.popup.until ? this.popup.item : null,
      found: this.found.length, total: this.content.treasures.length, live: this.live ?? null, progress: this.progress ?? 0,
      phase: this.phase, missionArrow: this.phase === 'MISSION' && this.mission.kind === 'arrow' ? this.mission.side : null,
    };
  }

  draw(ctx, now, view) {
    const t = now / 1000;
    const vis = view.vis;
    drawZoneFrame(ctx, this.zone.id, vis, view.effects === 'low' ? 0 : t);
    if (this.phase === 'MISSION' && this.mission.kind === 'arrow') {
      const w = vis.x1 - vis.x0;
      const cy = vis.y0 + (vis.y1 - vis.y0) * 0.3;
      const dir = this.mission.side === 'right' ? 1 : -1;
      const cx = vis.x0 + w / 2 + dir * w * 0.3;
      const s = w * 0.08;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 216, 77, 0.92)';
      ctx.beginPath();
      ctx.moveTo(cx + dir * s * 1.5, cy);
      ctx.lineTo(cx, cy - s);
      ctx.lineTo(cx, cy - s * 0.45);
      ctx.lineTo(cx - dir * s * 1.4, cy - s * 0.45);
      ctx.lineTo(cx - dir * s * 1.4, cy + s * 0.45);
      ctx.lineTo(cx, cy + s * 0.45);
      ctx.lineTo(cx, cy + s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (this.phase === 'SEARCH' || this.phase === 'CLEAR') {
      for (const it of this.items) {
        if (it.got) continue;
        drawTreasureSlot(ctx, it.x, it.y, this.radiusPx, it.progress, view.effects === 'low' ? 0 : t);
        drawTreasureIcon(ctx, it.icon, it.x, it.y, this.radiusPx * 0.75);
      }
    }
    // 손 위치 표시(판정에 쓰는 지점)
    const b = this.body;
    if (b && (this.phase === 'SEARCH')) {
      for (const k of ['L', 'R']) {
        const h = b.hands[k];
        if (!h) continue;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.fillStyle = 'rgba(255, 216, 77, 0.55)';
        ctx.beginPath(); ctx.arc(h.x, h.y, Math.max(10, b.T * 0.12), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    this.particles.draw(ctx);
  }

  result() {
    const all = this.content.treasures;
    const got = new Set(this.found);
    const badges = [];
    if (got.size === all.length) badges.push('👑 백제 보물 박사');
    if (got.size >= 6) badges.push('🧭 꼼꼼한 탐험가');
    badges.push('📖 도감 수집가');
    return {
      score: this.score,
      lines: [`찾은 보물 ${got.size} / ${all.length}`, `탐험을 마친 구역 ${this.content.zones.filter((z) => all.filter((t) => t.zone === z.id).every((t) => got.has(t.id))).length} / ${this.content.zones.length}`],
      badges,
      chips: all.map((t) => ({ text: t.name, ok: got.has(t.id), tag: '' })),
      codex: all.map((t) => ({ ...t, found: got.has(t.id) })),
      notice: this.content.notice,
    };
  }
}
