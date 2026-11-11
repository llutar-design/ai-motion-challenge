// 게임 4종 로직 단위 테스트: 가상 몸 좌표(화면 좌표)로 실제 충돌·머무르기·유지 판정을 검사
import { describe, test, assert } from './runner.js';
import { PoseMaster } from '../games/poseMaster.js';
import { LaserEscape, laserCollides } from '../games/laser.js';
import { TreasureQuest, handOn } from '../games/treasure.js';
import { SpaceGuard, circlesHit, domeActive } from '../games/space.js';
import { GameClock } from '../games/common.js';
import { withinHours, loadSettings, DEFAULTS } from '../core/settings.js';

const VIS = { x0: 0, x1: 640, y0: 0, y1: 480 };
/** 가상 몸: 골반 x=320, T=100. lean 은 가슴·머리의 가로 이동(px) */
function body({ lean = 0, L = null, R = null } = {}) {
  return {
    head: { x: 320 + lean * 1.4, y: 140 }, chest: { x: 320 + lean, y: 190 }, hip: { x: 320, y: 290 }, T: 100, shoulderW: 84,
    hands: { L: L ?? { x: 270, y: 300 }, R: R ?? { x: 370, y: 300 } },
  };
}
const ok = (b, extra = {}) => ({ fresh: true, status: 'OK', body: b, vis: VIS, poseScore: () => null, ...extra });
const lost = { fresh: true, status: 'NO_PERSON', body: null, vis: VIS, poseScore: () => null };
function run(game, t0, ms, sampleAt, step = 33) {
  let t = t0;
  for (; t <= t0 + ms; t += step) game.update(t, typeof sampleAt === 'function' ? sampleAt(t) : sampleAt);
  return t;
}
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('공통: 게임 시계', () => {
  test('인식될 때만 흐르고 끊기면 멈춤(유예 0.25초)', () => {
    const c = new GameClock(250);
    for (let t = 0; t <= 1000; t += 50) c.tick(t, true);
    const a = c.ms;
    for (let t = 1050; t <= 3000; t += 50) c.tick(t, false);
    assert.ok(c.ms - a <= 300, `끊긴 동안 ${c.ms - a}ms 흐름`);
  });
});

describe('포즈 마스터', () => {
  const base = { poseIds: ['T_POSE', 'MANSE', 'BOTH_ARMS_UP'], rounds: 3, difficulty: 'normal', holdMs: 1000, stepMs: 6000, rng: rng(3) };
  test('1초 유지하면 성공 + 등급', () => {
    const g = new PoseMaster(base);
    run(g, 0, 1600, ok(body(), { poseScore: () => 95 }));
    assert.equal(g.results[0].result, 'SUCCESS');
    assert.equal(g.results[0].grade, 'PERFECT');
    assert.ok(g.score >= 300);
  });
  test('0.5초만 유지하면 아직 성공 아님', () => {
    const g = new PoseMaster(base);
    run(g, 0, 500, ok(body(), { poseScore: () => 95 }));
    run(g, 533, 400, ok(body(), { poseScore: () => 20 }));
    assert.equal(g.results.length, 0);
  });
  test('틀린 자세는 제한 시간 후 재도전, 기회 소진 시 다음 라운드', () => {
    const g = new PoseMaster(base);
    let t = run(g, 0, 6200, ok(body(), { poseScore: () => 30 }));
    assert.equal(g.feedback.kind, 'RETRY');
    t = run(g, t, 1700, ok(body(), { poseScore: () => 30 }));
    assert.equal(g.attempt, 2);
    t = run(g, t, 6200, ok(body(), { poseScore: () => 30 }));
    run(g, t, 1700, ok(body(), { poseScore: () => 30 }));
    assert.equal(g.results[0].result, 'MISS');
    assert.equal(g.index, 1);
  });
  test('사람이 없으면 시간이 줄지 않고 실패도 없음', () => {
    const g = new PoseMaster(base);
    run(g, 0, 20000, lost);
    assert.equal(g.hud().timeLeftMs, 6000);
    assert.equal(g.results.length, 0);
  });
});

describe('레이저 탈출', () => {
  test('충돌 판정: 똑바로 서면 맞고, 반대쪽으로 기울이면 피함', () => {
    const e = 0.2;
    assert.ok(laserCollides('LEFT', body(), 320, e));
    assert.ok(!laserCollides('LEFT', body({ lean: 40 }), 320, e), '화면 오른쪽으로 기울이면 왼쪽 벽 회피');
    assert.ok(laserCollides('LEFT', body({ lean: -40 }), 320, e), '반대로 기울이면 충돌');
    assert.ok(!laserCollides('RIGHT', body({ lean: -40 }), 320, e));
    assert.ok(laserCollides('CENTER', body(), 320, e));
    assert.ok(!laserCollides('CENTER', body({ lean: 40 }), 320, e) && !laserCollides('CENTER', body({ lean: -40 }), 320, e));
  });
  test('살짝만 기울이면(경계 안) 피하지 못함', () => {
    assert.ok(laserCollides('LEFT', body({ lean: 10 }), 320, 0.2));
  });
  test('가만히 서 있으면 목숨이 줄고, 피하면 점수', () => {
    const still = new LaserEscape({ difficulty: 'easy', durationMs: 30000, rng: rng(5) });
    run(still, 0, 12000, ok(body()));
    assert.ok(still.hits >= 1 && still.lives < 3, `hits ${still.hits}`);
    const smart = new LaserEscape({ difficulty: 'easy', durationMs: 30000, rng: rng(5) });
    run(smart, 0, 12000, (t) => {
      const c = smart.cur;
      const lean = !c ? 0 : c.type === 'LEFT' ? 45 : c.type === 'RIGHT' ? -45 : 45;
      return ok(body({ lean }));
    });
    assert.ok(smart.dodged >= 2 && smart.hits === 0, `dodged ${smart.dodged} hits ${smart.hits}`);
    assert.ok(smart.score > 0);
  });
  test('인식이 끊기면 레이저가 멈추고 목숨이 줄지 않음', () => {
    const g = new LaserEscape({ difficulty: 'easy', durationMs: 30000, rng: rng(5) });
    run(g, 0, 2000, ok(body({ lean: 45 })));
    run(g, 2033, 20000, lost);
    assert.equal(g.lives, 3);
    assert.ok(g.clock.ms < 2400);
  });
  test('목숨을 다 쓰면 종료', () => {
    const g = new LaserEscape({ difficulty: 'hard', durationMs: 120000, lives: 3, rng: rng(9) });
    run(g, 0, 60000, ok(body()));
    assert.ok(g.done && g.lives === 0);
  });
});

describe('백제 보물 탐험대', () => {
  const content = {
    zones: [{ id: 'a', name: 'A', intro: '' }, { id: 'b', name: 'B', intro: '' }, { id: 'c', name: 'C', intro: '' }],
    treasures: ['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c'].map((z, i) => ({ id: `t${i}`, zone: z, icon: 'tile', name: `보물${i}`, desc: '' })),
  };
  test('손이 보물 원 안에 있을 때만 닿음', () => {
    const tr = { x: 100, y: 100 };
    assert.ok(handOn({ L: { x: 110, y: 100 }, R: null }, tr, 40));
    assert.ok(!handOn({ L: { x: 200, y: 100 }, R: null }, tr, 40));
    assert.ok(!handOn({ L: null, R: null }, tr, 40));
  });
  function toSearch(g, t0 = 0) {
    let t = run(g, t0, 1900, ok(body()));
    t = run(g, t, 1500, ok(body(), { poseScore: () => 95 }));
    assert.equal(g.phase, 'SEARCH');
    return t;
  }
  test('미션 자세 성공 후 보물 3개 등장', () => {
    const g = new TreasureQuest({ content, rng: rng(2) });
    toSearch(g);
    assert.equal(g.items.length, 3);
  });
  test('손을 0.7초 머무르면 획득, 스쳐 지나가면 획득 안 됨', () => {
    const g = new TreasureQuest({ content, rng: rng(2), dwellMs: 700 });
    let t = toSearch(g);
    const it = g.items[0];
    t = run(g, t, 300, ok(body({ L: { x: it.x, y: it.y } })));
    t = run(g, t, 600, ok(body()));
    assert.ok(!it.got, '0.3초 스침');
    run(g, t, 900, ok(body({ L: { x: it.x, y: it.y } })));
    assert.ok(it.got, '0.9초 머무름');
    assert.equal(g.found.length, 1);
  });
  test('인식이 끊기면 머무르기가 초기화되고 감점 없음', () => {
    const g = new TreasureQuest({ content, rng: rng(2), dwellMs: 700 });
    let t = toSearch(g);
    const it = g.items[0];
    t = run(g, t, 400, ok(body({ L: { x: it.x, y: it.y } })));
    t = run(g, t, 1000, lost);
    assert.ok(!it.got);
    assert.equal(it.progress, 0);
  });
  test('3구역 모두 찾으면 종료 + 도감 9개', () => {
    const g = new TreasureQuest({ content, rng: rng(2), dwellMs: 300 });
    let t = 0;
    for (let z = 0; z < 3; z++) {
      t = toSearch(g, t);
      for (const it of g.items) t = run(g, t, 450, ok(body({ R: { x: it.x, y: it.y } })));
      t = run(g, t, 1700, ok(body()));
    }
    assert.ok(g.done);
    assert.equal(g.result().codex.filter((c) => c.found).length, 9);
  });
  test('방향 미션: 거울 화면에서 오른쪽 화살표 = 내 오른팔', () => {
    const g = new TreasureQuest({ content, rng: () => 0.9, mirror: true });
    const m = g._mission(1);
    assert.equal(m.side, 'right');
    assert.equal(m.pose, 'RIGHT_ARM_OUT');
    const g2 = new TreasureQuest({ content, rng: () => 0.9, mirror: false });
    assert.equal(g2._mission(1).pose, 'LEFT_ARM_OUT');
  });
});

describe('우주 수호대', () => {
  test('원 충돌·만세 방어막 판정', () => {
    assert.ok(circlesHit({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 6));
    assert.ok(!circlesHit({ x: 0, y: 0 }, 10, { x: 30, y: 0 }, 6));
    assert.ok(domeActive(body({ L: { x: 250, y: 60 }, R: { x: 390, y: 60 } })));
    assert.ok(!domeActive(body()));
  });
  test('손을 운석 경로에 두면 막고, 가만히 있으면 에너지 감소', () => {
    const still = new SpaceGuard({ difficulty: 'easy', durationMs: 40000, rng: rng(4) });
    run(still, 0, 12000, ok(body({ L: { x: 320, y: 470 }, R: { x: 330, y: 470 } })));
    assert.ok(still.missed >= 2 && still.energy < 5, `missed ${still.missed}`);
    const guard = new SpaceGuard({ difficulty: 'easy', durationMs: 40000, rng: rng(4) });
    run(guard, 0, 12000, () => {
      const m = guard.meteors[0];
      const hand = m ? { x: m.x + (m.target.x - m.x) * 0.3, y: m.y + (m.target.y - m.y) * 0.3 } : { x: 300, y: 300 };
      return ok(body({ L: hand }));
    });
    assert.ok(guard.blocked >= 3 && guard.missed === 0, `blocked ${guard.blocked} missed ${guard.missed}`);
  });
  test('보스: 만세 방어막으로 격파', () => {
    const g = new SpaceGuard({ difficulty: 'easy', durationMs: 16000, rng: rng(4) });
    const dome = { L: { x: 250, y: 60 }, R: { x: 390, y: 60 } };
    run(g, 0, 17000, ok(body(dome)));
    assert.equal(g.bossResult, 'win');
    assert.ok(g.done, '게임 시간이 끝나면 종료');
  });
  test('보스: AI 추론이 화면보다 드물어도(4프레임에 1번) 만세 방어막 유지 시간이 제대로 쌓임 — 회귀 테스트', () => {
    const g = new SpaceGuard({ difficulty: 'easy', durationMs: 16000, rng: rng(4) });
    const dome = body({ L: { x: 250, y: 60 }, R: { x: 390, y: 60 } });
    let i = 0;
    for (let t = 0; t <= 17000; t += 8) g.update(t, { ...ok(dome), fresh: i++ % 4 === 0 });
    assert.equal(g.bossResult, 'win');
  });

  test('인식이 끊기면 운석이 멈춤', () => {
    const g = new SpaceGuard({ difficulty: 'easy', durationMs: 40000, rng: rng(4) });
    run(g, 0, 2500, ok(body()));
    run(g, 2533, 400, lost); // 깜빡임 유예(0.25초)가 지난 뒤부터 멈춰 있어야 함
    const before = g.meteors.map((m) => m.y).join();
    assert.ok(g.meteors.length > 0);
    run(g, 2966, 5000, lost);
    assert.equal(g.meteors.map((m) => m.y).join(), before);
    assert.equal(g.energy, 5);
  });
});

describe('운영 설정', () => {
  test('운영 시간 판정', () => {
    const at = (h, m) => new Date(2026, 9, 28, h, m);
    const hrs = { enabled: true, start: '09:00', end: '16:30' };
    assert.ok(withinHours(hrs, at(10, 0)));
    assert.ok(!withinHours(hrs, at(17, 0)));
    assert.ok(withinHours({ ...hrs, enabled: false }, at(23, 0)));
  });
  test('설정 기본값: 이용 횟수 저장 꺼짐, DEMO 꺼짐', () => {
    assert.equal(DEFAULTS.countPlays, false);
    assert.equal(DEFAULTS.demoMode, false);
    assert.ok(loadSettings().difficulty.pose);
  });
});
