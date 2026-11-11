// 자세 판정·몸 좌표·캘리브레이션 단위 테스트(가상 관절 좌표 사용)
import { describe, test, assert } from './runner.js';
import { makePose, CORRECT, STANDING } from '../demo/puppet.js';
import { toFrame, assessBody, LM } from '../pose/landmarks.js';
import { POSES, POSE_MAP, POSE_IDS, SEATED_POSE_IDS, evaluatePose, gradeFor } from '../pose/poses.js';
import { POSE_DIFFICULTY } from '../games/poseMaster.js';
import { bodyInfo } from '../pose/body.js';
import { evaluateCalibration } from '../pose/calibration.js';

const frameOf = (spec, opts = {}) => { const g = makePose(spec); return toFrame(g.landmarks, g.width, g.height, g.world, opts); };
const score = (id, spec) => evaluatePose(POSE_MAP[id], frameOf(spec)).score;
const line = (id, d) => POSE_DIFFICULTY[d].threshold + (POSE_MAP[id].thresholdOffset ?? 0);

describe('자세 판정', () => {
  test('목표 자세는 8개 이상', () => assert.gte(POSES.length, 8));
  for (const id of POSE_IDS) {
    test(`${id}: 정답 자세는 '도전' 기준 통과`, () => {
      const s = score(id, CORRECT[id]);
      assert.notNull(s);
      assert.gte(s, line(id, 'hard'), `${id} ${s?.toFixed(1)}`);
    });
  }
  for (const target of POSE_IDS) {
    for (const actual of POSE_IDS) {
      if (target === actual) continue;
      test(`${actual} 로 ${target} 를 하면 '쉬움' 기준에서도 실패`, () => {
        const s = score(target, CORRECT[actual]);
        if (s != null) assert.lt(s, line(target, 'easy'), `${s.toFixed(1)}`);
      });
    }
  }
  test('그냥 서 있으면 어떤 자세도 통과 못 함', () => {
    for (const id of POSE_IDS) { const s = score(id, STANDING); if (s != null) assert.lt(s, line(id, 'easy'), `${id} ${s}`); }
  });
  test('왼팔/오른팔, 왼쪽/오른쪽 기울기 구분', () => {
    assert.lt(score('RIGHT_ARM_UP', CORRECT.LEFT_ARM_UP), 40);
    assert.lt(score('LEFT_ARM_OUT', CORRECT.RIGHT_ARM_OUT), 40);
    assert.lt(score('LEAN_RIGHT', CORRECT.LEAN_LEFT), 10);
  });
  test('키·거리 차이(작게, 옆으로 치우침)에도 같은 판정', () => {
    for (const id of ['T_POSE', 'LEFT_ARM_UP', 'MANSE']) assert.gte(score(id, { ...CORRECT[id], scale: 0.6, shiftX: 120 }), line(id, 'hard'));
  });
  test('가려진 팔은 오답이 아니라 null(인식 대기)', () => {
    assert.isNull(score('LEFT_ARM_UP', { ...CORRECT.LEFT_ARM_UP, vis: { 13: 0.1, 15: 0.1 } }));
  });
  test('앉아서 하기: 골반이 가려져도 팔 자세 판정', () => {
    for (const id of SEATED_POSE_IDS) {
      const s = score(id, { ...CORRECT[id], vis: { 23: 0.05, 24: 0.05, 25: 0.05, 26: 0.05, 27: 0.05, 28: 0.05 } });
      assert.gte(s, line(id, 'normal'), `${id} ${s}`);
    }
    assert.ok(!SEATED_POSE_IDS.includes('LEAN_LEFT') && !SEATED_POSE_IDS.includes('SUPERHERO'), '앉아서 못 하는 자세 제외');
  });
  test('세로 화면(16:9 영상 양옆 잘림)에서 팔을 벌려 손목이 잘린 곳에 있어도 자세를 판정 — 회귀 테스트', () => {
    // 1280x720 카메라, 키가 화면 높이의 약 90%, 세로 화면에 보이는 폭 약 50%
    const g = makePose({ ...CORRECT.T_POSE, width: 1280, height: 720, scale: 2.1, shiftX: 320 });
    const f = toFrame(g.landmarks, g.width, g.height, g.world, { visible: { x0: 0.25, x1: 0.75, y0: 0, y1: 1 } });
    const s = evaluatePose(POSE_MAP.T_POSE, f).score;
    assert.notNull(s, '손목이 카메라에는 보이는데 null(인식 대기)로 멈춤');
    assert.gte(s, line('T_POSE', 'hard'));
  });
  test('등급 PERFECT/GREAT/GOOD', () => {
    assert.equal(gradeFor(95), 'PERFECT');
    assert.equal(gradeFor(85), 'GREAT');
    assert.equal(gradeFor(70), 'GOOD');
  });
});

describe('화면 좌표 몸 정보(거울 반전)', () => {
  test('거울 화면에서 학생의 왼손은 화면 왼쪽에 보인다', () => {
    const f = frameOf({ L: [0, 0], R: [-85, -88] });
    const b = bodyInfo(f, { mirror: true });
    assert.lt(b.hands.L.x, b.chest.x);
    assert.ok(b.hands.R.x > b.chest.x);
    const nb = bodyInfo(f, { mirror: false });
    assert.ok(nb.hands.L.x > nb.chest.x, '거울이 아니면 반대');
  });
  test('몸통 길이 T 로 정규화(크기 비례)', () => {
    const a = bodyInfo(frameOf(STANDING), { mirror: true });
    const b = bodyInfo(frameOf({ ...STANDING, scale: 0.5 }), { mirror: true });
    assert.equal(Math.round((a.T / b.T) * 10), 20);
  });
  test('골반이 안 보이면 어깨 폭으로 T 추정', () => {
    const b = bodyInfo(frameOf({ ...STANDING, vis: { 23: 0.1, 24: 0.1 } }), { mirror: true });
    assert.isNull(b.hip);
    assert.ok(b.T > 50);
  });
});

describe('캘리브레이션', () => {
  const obsOf = (spec, extra = {}) => { const f = frameOf(spec); return { status: assessBody(f, {}).status, persons: 1, frame: f, body: assessBody(f, {}), ...extra }; };
  test('전신·두 손·두 발이 보이고 거리 적당하면 통과', () => {
    const r = evaluateCalibration(obsOf(STANDING), { seated: false, light: { dark: false, backlit: false } });
    assert.ok(r.allOk, r.checks.filter((c) => !c.ok).map((c) => c.id).join(','));
  });
  test('2명이면 통과 못 함', () => {
    assert.ok(!evaluateCalibration(obsOf(STANDING, { persons: 2, status: 'MULTI_PERSON' }), { seated: false, light: null }).allOk);
  });
  test('발이 안 보이면 서서 하기는 실패, 앉아서 하기는 통과', () => {
    const f = frameOf({ ...STANDING, vis: { 27: 0.1, 28: 0.1, 25: 0.1, 26: 0.1, 23: 0.1, 24: 0.1 } });
    const stand = { status: assessBody(f, {}).status, persons: 1, frame: f, body: assessBody(f, {}) };
    const sit = { status: assessBody(f, { seated: true }).status, persons: 1, frame: f, body: assessBody(f, { seated: true }) };
    assert.ok(!evaluateCalibration(stand, { seated: false, light: null }).allOk);
    assert.ok(evaluateCalibration(sit, { seated: true, light: null }).allOk, evaluateCalibration(sit, { seated: true, light: null }).checks.filter((c) => !c.ok).map((c) => c.id).join(','));
  });
  test('역광·어두움 안내', () => {
    const r = evaluateCalibration(obsOf(STANDING), { seated: false, light: { dark: false, backlit: true } });
    assert.ok(!r.allOk && r.checks.find((c) => c.id === 'light').hint.includes('역광'));
  });
  test('카메라에 너무 가까우면 거리 안내', () => {
    const r = evaluateCalibration(obsOf({ ...STANDING, scale: 1.4 }), { seated: false, light: null });
    assert.ok(!r.checks.find((c) => c.id === 'dist').ok);
  });
  test('LM 인덱스 확인', () => assert.equal(LM.L_INDEX, 19));
});
