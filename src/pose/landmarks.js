// MediaPipe Pose 33개 랜드마크 중 판정에 쓰는 관절 인덱스와 프레임 해석 유틸리티.
// 좌표 규칙: MediaPipe 의 LEFT/RIGHT 는 "학생 본인의" 왼쪽/오른쪽이다.
// 카메라 원본(좌우 반전 전) 영상에서 정면을 보는 학생의 왼쪽 어깨는 이미지 오른쪽(x 큼)에 나타난다.
// 화면의 거울 표시는 그리기 단계에서만 처리하고, 판정은 항상 원본 좌표로 한다.

export const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_INDEX: 19, R_INDEX: 20,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
};

export const LM_NAMES = {
  0: '코', 11: '왼쪽 어깨', 12: '오른쪽 어깨', 13: '왼쪽 팔꿈치', 14: '오른쪽 팔꿈치',
  15: '왼쪽 손목', 16: '오른쪽 손목', 23: '왼쪽 엉덩이', 24: '오른쪽 엉덩이',
  25: '왼쪽 무릎', 26: '오른쪽 무릎', 27: '왼쪽 발목', 28: '오른쪽 발목',
};

// 좌우 쌍(MediaPipe Pose 토폴로지)
const LR_PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18],
  [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];

export const SKELETON_EDGES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [28, 30], [27, 31], [28, 32],
];

const CORE = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP];
const LOWER = [LM.L_KNEE, LM.R_KNEE];
const FEET = [LM.L_ANKLE, LM.R_ANKLE];

/** 카메라 드라이버가 이미 좌우 반전된 영상을 보내는 경우 좌우 라벨을 교환한다. */
export function swapLeftRight(list) {
  if (!list) return list;
  const out = list.slice();
  for (const [a, b] of LR_PAIRS) {
    if (a < list.length && b < list.length) { out[a] = list[b]; out[b] = list[a]; }
  }
  return out;
}

/**
 * MediaPipe 결과 1명분을 픽셀 좌표 프레임으로 바꾼다(가로세로 비율 보정).
 * @param {Array<{x:number,y:number,z?:number,visibility?:number}>} landmarks 정규화 좌표
 * @param {Array|undefined} world 월드 좌표(m, 엉덩이 중심)
 */
export const FULL_VIEW = { x0: 0, x1: 1, y0: 0, y1: 1 };

/**
 * @param {{x0,x1,y0,y1}} [visible] 화면에 실제로 보이는 영역(정규화 좌표). 세로 화면에서 영상 양옆을
 *   잘라 표시할 때, 잘린 곳에 있는 관절은 "화면 밖"으로 취급한다(학생이 볼 수 없는 곳에서 채점하지 않음).
 */
export function toFrame(landmarks, width, height, world, { swap = false, visible = FULL_VIEW } = {}) {
  let lms = landmarks;
  let wl = world;
  if (swap) { lms = swapLeftRight(lms); wl = swapLeftRight(wl); }
  const m = 0.01;
  const pts = lms.map((l) => ({
    x: l.x * width,
    y: l.y * height,
    nx: l.x,
    ny: l.y,
    v: l.visibility ?? 1,
    inFrame: l.x >= visible.x0 - m && l.x <= visible.x1 + m && l.y >= visible.y0 - m && l.y <= visible.y1 + m,
    inCamera: l.x >= -m && l.x <= 1 + m && l.y >= -m && l.y <= 1 + m,
  }));
  const w = wl ? wl.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.visibility ?? 1 })) : null;
  return { pts, world: w, width, height, visible };
}

export function isGood(p, minVis = 0.5) {
  return !!p && p.v >= minVis && p.inFrame;
}

/** 카메라에는 찍힌 관절인지. 세로 화면에서 팔을 벌리면 손목이 잘린 영역에 들어가도 자세 판정은 할 수 있다. */
export function isSeen(p, minVis = 0.5) {
  return !!p && p.v >= minVis && p.inCamera;
}

/** 한 사람으로 볼 만큼 주요 관절이 보이는지(다인원 감지 시 잡음 제거용). */
export function isMeaningfulPerson(landmarks, minVis = 0.5, visible = FULL_VIEW) {
  const idx = [...CORE, ...LOWER, LM.NOSE, LM.L_ELBOW, LM.R_ELBOW];
  let n = 0;
  for (const i of idx) {
    const l = landmarks[i];
    if (l && (l.visibility ?? 1) >= minVis && l.x > visible.x0 && l.x < visible.x1 && l.y > visible.y0 && l.y < visible.y1) n++;
  }
  return n >= 5;
}

/**
 * 전신 인식 품질 평가.
 * @returns {{status:'OK'|'PARTIAL_BODY', missing:number[], tooClose:boolean, offSide:boolean, bodyHeightRatio:number|null}}
 *   offSide: 카메라에는 보이지만 화면에 표시되는 영역의 옆(잘린 곳)으로 벗어남 → "가운데로 와 주세요"
 */
export const SEATED_NEED = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW];

/** seated: 앉아서 하기 모드 — 머리·어깨·팔꿈치만 보이면 된다(골반·다리는 책상 등에 가려질 수 있음) */
export function assessBody(frame, { minVis = 0.5, requireFeet = true, seated = false } = {}) {
  const vis = frame.visible ?? FULL_VIEW;
  const need = seated ? SEATED_NEED : requireFeet ? [...CORE, ...LOWER, ...FEET] : [...CORE, ...LOWER];
  const missing = need.filter((i) => !isGood(frame.pts[i], minVis));
  const ls = frame.pts[LM.L_SHOULDER];
  const rs = frame.pts[LM.R_SHOULDER];
  const shoulderRatio = Math.abs(ls.nx - rs.nx) / Math.max(0.05, vis.x1 - vis.x0);
  const tooClose = shoulderRatio > (seated ? 0.6 : 0.45);
  const offSide = missing.some((i) => {
    const p = frame.pts[i];
    return p && p.v >= minVis && (p.nx < vis.x0 || p.nx > vis.x1) && p.ny >= vis.y0 && p.ny <= vis.y1;
  });
  let bodyHeightRatio = null;
  const nose = frame.pts[LM.NOSE];
  const la = frame.pts[LM.L_ANKLE];
  const ra = frame.pts[LM.R_ANKLE];
  if (nose && la && ra) bodyHeightRatio = Math.max(la.ny, ra.ny) - nose.ny;
  return { status: missing.length === 0 && !tooClose ? 'OK' : 'PARTIAL_BODY', missing, tooClose, offSide, bodyHeightRatio };
}

// ---- 벡터 유틸 ----
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function norm(v) {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : null;
}

/**
 * 몸 기준 좌표계: up = 엉덩이 중심→어깨 중심, left = 학생의 왼쪽 방향.
 * 몸이 약간 기울어도 팔 각도가 일정하게 계산되도록 한다.
 */
export function bodyFrame(frame) {
  const p = frame.pts;
  const sm = mid(p[LM.L_SHOULDER], p[LM.R_SHOULDER]);
  const hipsSeen = (p[LM.L_HIP].v ?? 1) >= 0.3 && (p[LM.R_HIP].v ?? 1) >= 0.3;
  let hm;
  let up;
  let torso;
  if (hipsSeen) {
    hm = mid(p[LM.L_HIP], p[LM.R_HIP]);
    up = norm(sub(sm, hm));
    torso = dist(sm, hm);
  } else {
    // 앉아서 하기 등으로 골반이 가려졌으면 화면 수직을 몸의 위쪽으로, 어깨 폭으로 몸통 길이를 추정
    const sw = dist(p[LM.L_SHOULDER], p[LM.R_SHOULDER]);
    up = { x: 0, y: -1 };
    torso = sw * 1.2;
    hm = { x: sm.x, y: sm.y + torso };
  }
  if (!up || !(torso > 0)) return null;
  // 이미지 좌표(y 아래)에서 up=(0,-1) 이면 perp=(1,0): 원본 영상의 +x = 학생의 왼쪽
  let left = { x: -up.y, y: up.x };
  const shoulderVec = sub(p[LM.L_SHOULDER], p[LM.R_SHOULDER]);
  const shoulderW = Math.hypot(shoulderVec.x, shoulderVec.y);
  if (dot(shoulderVec, left) < 0 && shoulderW > 0.3 * torso) left = { x: -left.x, y: -left.y };
  return { up, left, torso, shoulderW, sm, hm };
}

/** v 의 몸 기준 각도(도). 0=바깥 수평, 90=위, -90=아래, ±180=몸 안쪽 수평. */
export function limbAngle(v, bf, side) {
  const out = side === 'L' ? bf.left : { x: -bf.left.x, y: -bf.left.y };
  return (Math.atan2(dot(v, bf.up), dot(v, out)) * 180) / Math.PI;
}

/** 3D 세 점 사이 각도(도), b 가 꼭짓점. */
export function angle3(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const d = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const l = Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z);
  if (l < 1e-9) return null;
  return (Math.acos(Math.max(-1, Math.min(1, d / l))) * 180) / Math.PI;
}

/** 다리 수직 길이 / 몸통 길이(무릎 굽히기 기준값 비교용). */
export function legSpanRatio(frame, bf) {
  const p = frame.pts;
  const am = mid(p[LM.L_ANKLE], p[LM.R_ANKLE]);
  return dot(sub(bf.hm, am), bf.up) / bf.torso;
}
