// DEMO 모드의 가상 학생: 현재 게임 상태를 보고 스스로 움직인다(카메라 없는 PC 에서 동작 확인용).
// 화면에는 항상 DEMO 표시가 붙고, 실제 판정 검증으로 쓰지 않는다.

import { makePose, drawPuppet, CORRECT, STANDING, DEMO_W, DEMO_H } from './puppet.js';
import { clamp01 } from '../games/common.js';

const lerp = (a, b, k) => a + (b - a) * k;

export class DemoStudent {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = DEMO_W;
    this.canvas.height = DEMO_H;
    this.g = this.canvas.getContext('2d');
    this.ang = { L: [-85, -88], R: [-85, -88] };
    this.tilt = 0;
    this.hand = { L: null, R: null };
    this.key = null;
    this.since = 0;
    this.stamp = 0;
    this.pose = makePose(STANDING);
    this.label = '';
  }

  /** ctx: { screen, gameId, game, mirror, vis(캔버스 px) } */
  step(now, dt, ctx) {
    const plan = this._plan(now, ctx);
    this.label = plan.label;
    const k = Math.min(1, dt * 6);
    const tgt = plan.pose ? (CORRECT[plan.pose] ?? STANDING) : STANDING;
    for (const s of ['L', 'R']) for (const j of [0, 1]) this.ang[s][j] = lerp(this.ang[s][j], tgt[s][j], k);
    this.tilt = lerp(this.tilt, plan.tilt ?? tgt.tiltDeg ?? 0, Math.min(1, dt * 5));
    for (const s of ['L', 'R']) {
      const want = plan.hands?.[s] ?? null;
      if (!want) { this.hand[s] = null; continue; }
      const cur = this.hand[s] ?? want;
      const sp = Math.min(1, dt * 5);
      this.hand[s] = { x: lerp(cur.x, want.x, sp), y: lerp(cur.y, want.y, sp) };
    }
    const jit = () => (Math.random() - 0.5) * 2;
    this.pose = makePose({
      L: [this.ang.L[0] + jit(), this.ang.L[1] + jit()], R: [this.ang.R[0] + jit(), this.ang.R[1] + jit()],
      tiltDeg: this.tilt, hands: this.hand,
    });
    this._draw();
    this.stamp += 1;
  }

  _plan(now, c) {
    const keyed = (key) => { if (key !== this.key) { this.key = key; this.since = now; } return (now - this.since) / 1000; };
    const g = c.game;
    const toRaw = (pt) => ({ x: c.mirror ? DEMO_W - pt.x : pt.x, y: pt.y });
    // 화면 왼쪽에 있는 목표는 거울 화면에서 학생의 왼손이 닿는다(거울이 아니면 오른손)
    const handFor = (screenX, chestX) => ((screenX < chestX) === c.mirror ? 'L' : 'R');
    if (c.screen !== 'play' || !g) return { label: '가만히 서 있기' };

    if (c.gameId === 'pose') {
      const el = keyed(`p${g.index}-${g.attempt}`);
      if (g.index === 1 && g.attempt === 1) return { pose: el > 0.8 ? 'MANSE' : null, label: '헷갈려서 다른 자세' };
      return { pose: el > 0.9 ? g.def.id : null, label: '보고 따라 하기' };
    }
    if (c.gameId === 'laser') {
      const cur = g.cur;
      if (!cur) return { label: '레이저 기다리기' };
      const p = clamp01((g.clock.ms - cur.t0) / (cur.hitAt - cur.t0));
      if (p < 0.35) return { label: '레이저 보는 중' };
      // 몸을 화면 쪽으로 기울이기: 원본 +x 로 기울면 거울 화면에선 왼쪽으로 보인다
      const screenDir = cur.type === 'LEFT' ? 1 : cur.type === 'RIGHT' ? -1 : (g.cur.t0 % 2 ? 1 : -1);
      return { tilt: 18 * screenDir * (c.mirror ? -1 : 1), label: screenDir > 0 ? '화면 오른쪽으로 기울이기' : '화면 왼쪽으로 기울이기' };
    }
    if (c.gameId === 'treasure') {
      if (g.phase === 'MISSION') return { pose: g.mission.pose, label: '미션 자세' };
      if (g.phase === 'SEARCH' && g.body) {
        const it = g.items.find((i) => !i.got);
        if (!it) return { label: '보물 다 찾음' };
        const side = handFor(it.x, g.body.chest.x);
        return { hands: { [side]: toRaw(it) }, label: '보물에 손 뻗기' };
      }
      return { label: '탐험 중' };
    }
    if (c.gameId === 'space') {
      if (g.boss) return { pose: 'MANSE', label: '만세 방어막!' };
      if (!g.body || !g.meteors.length) return { label: '하늘 살피기' };
      const m = g.meteors.reduce((a, b) => (b.y > a.y ? b : a));
      const side = handFor(m.target.x, g.body.chest.x);
      const aim = { x: m.x + (m.target.x - m.x) * 0.45, y: m.y + (m.target.y - m.y) * 0.45 };
      return { hands: { [side]: toRaw(aim) }, label: '손 방어막으로 막기' };
    }
    return { label: '' };
  }

  _draw() {
    const g = this.g;
    const bg = g.createLinearGradient(0, 0, 0, DEMO_H);
    bg.addColorStop(0, '#d9e4f2'); bg.addColorStop(0.75, '#c8d3e3'); bg.addColorStop(0.75, '#a88d6e'); bg.addColorStop(1, '#8c7457');
    g.fillStyle = bg;
    g.fillRect(0, 0, DEMO_W, DEMO_H);
    drawPuppet(g, this.pose);
  }

  /** FrameSource.override 용 */
  frame() { return { image: this.canvas, width: DEMO_W, height: DEMO_H, stamp: this.stamp }; }

  /** 가짜 추론 결과(MediaPipe 결과와 같은 형식) */
  detect() { return { landmarks: [this.pose.landmarks], worldLandmarks: [this.pose.world] }; }
}
