// 목표 자세 라이브러리와 실제 자세 유사도 계산.
// 각 자세는 "구성 요소" 목록: 몸 기준 팔 각도·손목 높이·몸 기울기 등 특징값과 허용 범위.
// 범위 안이면 100점, 벗어나면 falloff 만큼 선형 감소. 필요한 관절이 안 보이면 그 요소는 빠지고,
// 남은 가중치가 70% 미만이면 null(인식 대기)을 돌려준다 — 인식 실패를 오답으로 처리하지 않기 위함.
// 좌표 규칙: 판정은 카메라 원본 좌표(거울 반전 전), LEFT/RIGHT 는 학생 본인 기준.

import { LM, isSeen, sub, dot, dist, mid, bodyFrame, limbAngle } from './landmarks.js';

/** 학생 기준 왼쪽으로 몸통이 기운 각도(도). 엉덩이 중심→어깨 중심 벡터와 화면 수직의 차이. */
function torsoTilt(f) {
  const p = f.pts;
  const sm = mid(p[LM.L_SHOULDER], p[LM.R_SHOULDER]);
  const hm = mid(p[LM.L_HIP], p[LM.R_HIP]);
  const v = sub(sm, hm);
  // 원본 영상에서 학생의 왼쪽 방향(정면이면 +x). 어깨 위치로 확인한다.
  const sgn = p[LM.L_SHOULDER].x >= p[LM.R_SHOULDER].x ? 1 : -1;
  return (Math.atan2(v.x * sgn, -v.y) * 180) / Math.PI;
}

const F = {
  L_ARM: { deps: [LM.L_SHOULDER, LM.L_WRIST], kind: 'angle', fn: (f, bf) => limbAngle(sub(f.pts[LM.L_WRIST], f.pts[LM.L_SHOULDER]), bf, 'L') },
  R_ARM: { deps: [LM.R_SHOULDER, LM.R_WRIST], kind: 'angle', fn: (f, bf) => limbAngle(sub(f.pts[LM.R_WRIST], f.pts[LM.R_SHOULDER]), bf, 'R') },
  L_UPPER: { deps: [LM.L_SHOULDER, LM.L_ELBOW], kind: 'angle', fn: (f, bf) => limbAngle(sub(f.pts[LM.L_ELBOW], f.pts[LM.L_SHOULDER]), bf, 'L') },
  R_UPPER: { deps: [LM.R_SHOULDER, LM.R_ELBOW], kind: 'angle', fn: (f, bf) => limbAngle(sub(f.pts[LM.R_ELBOW], f.pts[LM.R_SHOULDER]), bf, 'R') },
  L_FORE: { deps: [LM.L_ELBOW, LM.L_WRIST], kind: 'angle', fn: (f, bf) => limbAngle(sub(f.pts[LM.L_WRIST], f.pts[LM.L_ELBOW]), bf, 'L') },
  R_FORE: { deps: [LM.R_ELBOW, LM.R_WRIST], kind: 'angle', fn: (f, bf) => limbAngle(sub(f.pts[LM.R_WRIST], f.pts[LM.R_ELBOW]), bf, 'R') },
  L_WRIST_UP: { deps: [LM.L_SHOULDER, LM.L_WRIST], kind: 'scalar', fn: (f, bf) => dot(sub(f.pts[LM.L_WRIST], f.pts[LM.L_SHOULDER]), bf.up) / bf.torso },
  R_WRIST_UP: { deps: [LM.R_SHOULDER, LM.R_WRIST], kind: 'scalar', fn: (f, bf) => dot(sub(f.pts[LM.R_WRIST], f.pts[LM.R_SHOULDER]), bf.up) / bf.torso },
  L_WRIST_HIP: { deps: [LM.L_WRIST, LM.L_HIP], kind: 'scalar', fn: (f, bf) => dist(f.pts[LM.L_WRIST], f.pts[LM.L_HIP]) / bf.torso },
  R_WRIST_HIP: { deps: [LM.R_WRIST, LM.R_HIP], kind: 'scalar', fn: (f, bf) => dist(f.pts[LM.R_WRIST], f.pts[LM.R_HIP]) / bf.torso },
  TILT: { deps: [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP], kind: 'scalar', fn: (f) => torsoTilt(f) },
};

const arm = (side, center, half, falloff = 35, weight = 2) => ({ feature: `${side}_ARM`, center, half, falloff, weight });
const fore = (side, center, half, falloff = 35, weight = 1) => ({ feature: `${side}_FORE`, center, half, falloff, weight });
const upper = (side, center, half, falloff = 35, weight = 1) => ({ feature: `${side}_UPPER`, center, half, falloff, weight });
const wristUp = (side, min, weight = 0.5) => ({ feature: `${side}_WRIST_UP`, min, max: 9, falloff: 0.5, weight });
const armDown = (side, weight = 3) => arm(side, -85, 40, 40, weight);

/**
 * seated: 앉아서 하기 모드에서도 출제 가능한지(다리·골반이 필요 없는 팔 중심 자세)
 * figure: 스틱맨 그림용 각도 L/R: [윗팔, 아래팔], tilt: 몸 기울기(학생 왼쪽 +)
 * thresholdOffset: 자세별 허용 오차 차이 보정
 */
export const POSES = [
  {
    id: 'T_POSE', name: '두 팔 벌리기', hint: '두 팔을 옆으로 비행기처럼 쭉 펴요', emoji: '✈️', seated: true,
    components: [upper('L', 0, 20, 40, 2), upper('R', 0, 20, 40, 2), fore('L', 0, 25, 40), fore('R', 0, 25, 40), arm('L', 0, 20, 40, 1), arm('R', 0, 20, 40, 1)],
    figure: { L: [0, 0], R: [0, 0] }, thresholdOffset: 0,
  },
  {
    id: 'BOTH_ARMS_UP', name: '두 팔 위로', hint: '두 팔을 머리 위로 곧게 올려요', emoji: '🙌', seated: true,
    components: [arm('L', 92, 22), arm('R', 92, 22), fore('L', 92, 30), fore('R', 92, 30), wristUp('L', 0.55), wristUp('R', 0.55)],
    figure: { L: [95, 92], R: [95, 92] }, thresholdOffset: 0,
  },
  {
    id: 'MANSE', name: '만세!', hint: '두 팔을 비스듬히 위로, V자 만세!', emoji: '🙆', seated: true,
    components: [arm('L', 45, 17, 40), arm('R', 45, 17, 40), fore('L', 45, 28), fore('R', 45, 28)],
    figure: { L: [45, 45], R: [45, 45] }, thresholdOffset: -3,
  },
  {
    id: 'LEFT_ARM_UP', name: '왼팔 올리기', hint: '내 왼팔을 위로, 오른팔은 내려요', emoji: '☝️', seated: true,
    components: [arm('L', 92, 25), fore('L', 92, 30), wristUp('L', 0.55), armDown('R', 2)],
    figure: { L: [95, 92], R: [-80, -85] }, thresholdOffset: 0,
  },
  {
    id: 'RIGHT_ARM_UP', name: '오른팔 올리기', hint: '내 오른팔을 위로, 왼팔은 내려요', emoji: '☝️', seated: true,
    components: [arm('R', 92, 25), fore('R', 92, 30), wristUp('R', 0.55), armDown('L', 2)],
    figure: { L: [-80, -85], R: [95, 92] }, thresholdOffset: 0,
  },
  {
    id: 'LEFT_ARM_OUT', name: '왼팔 옆으로 뻗기', hint: '내 왼팔만 옆으로 쭉 뻗어요', emoji: '👈', seated: true,
    components: [upper('L', 0, 20, 40, 2), fore('L', 0, 25, 40), armDown('R')],
    figure: { L: [0, 0], R: [-80, -85] }, thresholdOffset: 0,
  },
  {
    id: 'RIGHT_ARM_OUT', name: '오른팔 옆으로 뻗기', hint: '내 오른팔만 옆으로 쭉 뻗어요', emoji: '👉', seated: true,
    components: [upper('R', 0, 20, 40, 2), fore('R', 0, 25, 40), armDown('L')],
    figure: { L: [-80, -85], R: [0, 0] }, thresholdOffset: 0,
  },
  {
    id: 'LEAN_LEFT', name: '왼쪽으로 기울이기', hint: '발은 그대로, 몸을 내 왼쪽으로 살짝 기울여요', emoji: '↖️', seated: false,
    components: [{ feature: 'TILT', min: 9, max: 35, falloff: 7, weight: 1 }],
    figure: { L: [-60, -80], R: [-60, -80], tilt: 15 }, thresholdOffset: 0,
  },
  {
    id: 'LEAN_RIGHT', name: '오른쪽으로 기울이기', hint: '발은 그대로, 몸을 내 오른쪽으로 살짝 기울여요', emoji: '↗️', seated: false,
    components: [{ feature: 'TILT', min: -35, max: -9, falloff: 7, weight: 1 }],
    figure: { L: [-60, -80], R: [-60, -80], tilt: -15 }, thresholdOffset: 0,
  },
  {
    id: 'SUPERHERO', name: '슈퍼히어로 자세', hint: '두 손을 허리에! 팔꿈치는 옆으로', emoji: '🦸', seated: false,
    components: [
      upper('L', -45, 20, 35, 2), upper('R', -45, 20, 35, 2), fore('L', -150, 35, 30, 3), fore('R', -150, 35, 30, 3),
      { feature: 'L_WRIST_HIP', min: 0, max: 0.45, falloff: 0.3, weight: 1 }, { feature: 'R_WRIST_HIP', min: 0, max: 0.45, falloff: 0.3, weight: 1 },
    ],
    figure: { L: [-45, -150], R: [-45, -150] }, thresholdOffset: -5,
  },
];

export const POSE_MAP = Object.fromEntries(POSES.map((p) => [p.id, p]));
export const POSE_IDS = POSES.map((p) => p.id);
export const SEATED_POSE_IDS = POSES.filter((p) => p.seated).map((p) => p.id);

function wrapDeg(a) {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

export function componentScore(comp, value) {
  if (value == null || Number.isNaN(value)) return null;
  let off;
  if (comp.center != null) off = Math.max(0, Math.abs(wrapDeg(value - comp.center)) - comp.half);
  else off = value < comp.min ? comp.min - value : value > comp.max ? value - comp.max : 0;
  return Math.max(0, 100 * (1 - off / comp.falloff));
}

/**
 * @returns {{score:number|null, parts:Array}} score=null 이면 인식 불확실(채점하지 않음)
 */
export function evaluatePose(def, frame, { minVis = 0.5 } = {}) {
  if (!def || !frame) return { score: null, parts: [] };
  const bf = bodyFrame(frame);
  if (!bf || bf.torso < 1e-3) return { score: null, parts: [] };
  let total = 0, avail = 0, sum = 0;
  const parts = [];
  for (const c of def.components) {
    const feat = F[c.feature];
    total += c.weight;
    if (!feat.deps.every((i) => isSeen(frame.pts[i], minVis))) { parts.push({ feature: c.feature, score: null }); continue; }
    const value = feat.fn(frame, bf);
    const s = componentScore(c, value);
    parts.push({ feature: c.feature, value, score: s });
    if (s == null) continue;
    avail += c.weight;
    sum += s * c.weight;
  }
  if (total === 0 || avail / total < 0.7) return { score: null, parts };
  return { score: sum / avail, parts };
}

/** 정확도 등급(성공한 자세에만 표시). 실패 표현 대신 격려 위주. */
export function gradeFor(score) {
  if (score >= 90) return 'PERFECT';
  if (score >= 80) return 'GREAT';
  return 'GOOD';
}
