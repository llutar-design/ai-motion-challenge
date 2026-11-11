// DEMO/테스트 전용 가상 학생(관절 좌표 생성기 + 그림). 실제 모드에서는 사용하지 않는다.
// 카메라 원본(반전 전) 좌표 기준: 정면을 보는 학생의 왼쪽이 이미지 +x 쪽.

export const DEMO_W = 640;
export const DEMO_H = 480;

/**
 * @param {object} o
 *  L/R: [윗팔, 아래팔] 몸 기준 각도(0=옆 수평, 90=위, -90=아래)
 *  tiltDeg: 몸 전체 기울기(엉덩이 축, + 는 원본 +x 쪽으로 어깨가 이동)
 *  hands: { L?:{x,y}, R?:{x,y} } 원본 픽셀 좌표로 손목 위치 직접 지정(팔꿈치는 자동)
 *  vis: { 인덱스: visibility }, move: { 인덱스: {x?,y?} 정규화 좌표 }
 */
export function makePose(o = {}) {
  const W = o.width ?? DEMO_W;
  const H = o.height ?? DEMO_H;
  const L = o.L ?? [-85, -88];
  const R = o.R ?? [-85, -88];
  const scale = o.scale ?? 1;
  const T = 110 * scale;
  const cx = 320 + (o.shiftX ?? 0);
  const sy = 140 * scale + (1 - scale) * 200;
  const p = new Array(33).fill(null);
  const set = (i, x, y) => { p[i] = { x, y }; };

  set(11, cx + 0.42 * T, sy);
  set(12, cx - 0.42 * T, sy);
  const hipY = sy + T;
  set(23, cx + 0.26 * T, hipY);
  set(24, cx - 0.26 * T, hipY);
  set(0, cx, sy - 0.45 * T);
  for (const [i, dx] of [[1, 0.06], [2, 0.08], [3, 0.1], [4, -0.06], [5, -0.08], [6, -0.1]]) set(i, cx + dx * T, sy - 0.52 * T);
  set(7, cx + 0.16 * T, sy - 0.48 * T);
  set(8, cx - 0.16 * T, sy - 0.48 * T);
  set(9, cx + 0.04 * T, sy - 0.36 * T);
  set(10, cx - 0.04 * T, sy - 0.36 * T);

  const arm = (side, [u, f], si, ei, wi, hand) => {
    const out = side === 'L' ? 1 : -1;
    const s = p[si];
    const ur = (u * Math.PI) / 180;
    const fr = (f * Math.PI) / 180;
    const e = { x: s.x + Math.cos(ur) * out * 0.62 * T, y: s.y - Math.sin(ur) * 0.62 * T };
    const w = { x: e.x + Math.cos(fr) * out * 0.58 * T, y: e.y - Math.sin(fr) * 0.58 * T };
    set(ei, e.x, e.y);
    set(wi, w.x, w.y);
    for (const k of hand) set(k, w.x + Math.cos(fr) * out * 0.08 * T, w.y - Math.sin(fr) * 0.08 * T);
  };
  arm('L', L, 11, 13, 15, [17, 19, 21]);
  arm('R', R, 12, 14, 16, [18, 20, 22]);

  const ankleY = hipY + 1.58 * T;
  for (const [side, hi, ki, ai, heel, toe] of [['L', 23, 25, 27, 29, 31], ['R', 24, 26, 28, 30, 32]]) {
    const out = side === 'L' ? 1 : -1;
    const hp = p[hi];
    set(ki, hp.x + out * 0.06 * T, (hp.y + ankleY) / 2);
    set(ai, hp.x + out * 0.1 * T, ankleY);
    set(heel, hp.x + out * 0.08 * T, ankleY + 0.05 * T);
    set(toe, hp.x + out * 0.15 * T, ankleY + 0.1 * T);
  }

  if (o.tiltDeg) {
    // 발목 높이를 축으로 상체만 기울인다(다리는 거의 그대로) — 제자리에서 몸 기울이기
    const r = (o.tiltDeg * Math.PI) / 180;
    const ox = cx;
    const oy = hipY;
    for (let i = 0; i <= 22; i++) {
      const q = p[i];
      const dx = q.x - ox;
      const dy = q.y - oy;
      q.x = ox + dx * Math.cos(r) - dy * Math.sin(r);
      q.y = oy + dx * Math.sin(r) + dy * Math.cos(r);
    }
  }

  // 손목 직접 지정(보물 잡기·운석 막기용)
  for (const [side, si, ei, wi, hand] of [['L', 11, 13, 15, [17, 19, 21]], ['R', 12, 14, 16, [18, 20, 22]]]) {
    const tgt = o.hands?.[side];
    if (!tgt) continue;
    const s = p[si];
    const out = side === 'L' ? 1 : -1;
    const midX = (s.x + tgt.x) / 2 + out * 0.12 * T;
    const midY = (s.y + tgt.y) / 2 + 0.08 * T;
    set(ei, midX, midY);
    set(wi, tgt.x, tgt.y);
    const dx = tgt.x - midX;
    const dy = tgt.y - midY;
    const len = Math.hypot(dx, dy) || 1;
    for (const k of hand) set(k, tgt.x + (dx / len) * 0.1 * T, tgt.y + (dy / len) * 0.1 * T);
  }

  let lms = p.map((q, i) => ({ x: q.x / W, y: q.y / H, z: 0, visibility: o.vis?.[i] ?? 0.98 }));
  for (const [i, m] of Object.entries(o.move ?? {})) lms[i] = { ...lms[i], ...m };
  const world = p.map((q, i) => ({ x: (q.x - cx) / 300, y: (q.y - hipY) / 300, z: 0, visibility: lms[i].visibility }));
  return { landmarks: lms, world, width: W, height: H, px: p };
}

/** 가상 학생 그리기(카메라 원본 좌표). 사람 모양의 단순한 그림. */
export function drawPuppet(g, pose, shirt = '#e8505b') {
  const W = pose.width;
  const H = pose.height;
  const P = pose.landmarks.map((l) => ({ x: l.x * W, y: l.y * H }));
  const T = Math.hypot((P[11].x + P[12].x) / 2 - (P[23].x + P[24].x) / 2, (P[11].y + P[12].y) / 2 - (P[23].y + P[24].y) / 2);
  const limb = (a, b, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(P[a].x, P[a].y); g.lineTo(P[b].x, P[b].y); g.stroke(); };
  const skin = '#f2c9a0';
  for (const [a, b] of [[23, 25], [25, 27], [24, 26], [26, 28]]) limb(a, b, T * 0.22, '#2f3f75');
  for (const i of [27, 28]) { g.fillStyle = '#222'; g.beginPath(); g.ellipse(P[i].x, P[i].y + T * 0.06, T * 0.14, T * 0.07, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = shirt;
  g.beginPath(); g.moveTo(P[11].x, P[11].y); g.lineTo(P[12].x, P[12].y); g.lineTo(P[24].x, P[24].y + T * 0.1); g.lineTo(P[23].x, P[23].y + T * 0.1); g.closePath(); g.fill();
  for (const [a, b] of [[11, 13], [12, 14]]) limb(a, b, T * 0.17, shirt);
  for (const [a, b] of [[13, 15], [14, 16]]) limb(a, b, T * 0.13, skin);
  for (const i of [15, 16]) { g.fillStyle = skin; g.beginPath(); g.arc(P[i].x, P[i].y, T * 0.09, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = skin; g.beginPath(); g.arc(P[0].x, P[0].y - T * 0.05, T * 0.27, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(P[0].x, P[0].y - T * 0.12, T * 0.27, Math.PI, 0); g.fill();
}

/** 테스트용 기준 자세 */
export const CORRECT = {
  T_POSE: { L: [2, 0], R: [2, 0] },
  BOTH_ARMS_UP: { L: [92, 90], R: [92, 90] },
  MANSE: { L: [45, 45], R: [45, 45] },
  LEFT_ARM_UP: { L: [92, 90], R: [-85, -88] },
  RIGHT_ARM_UP: { L: [-85, -88], R: [92, 90] },
  LEFT_ARM_OUT: { L: [2, 0], R: [-85, -88] },
  RIGHT_ARM_OUT: { L: [-85, -88], R: [2, 0] },
  LEAN_LEFT: { L: [-80, -85], R: [-80, -85], tiltDeg: 18 },
  LEAN_RIGHT: { L: [-80, -85], R: [-80, -85], tiltDeg: -18 },
  SUPERHERO: { L: [-45, -150], R: [-45, -150] },
};
export const STANDING = { L: [-85, -88], R: [-85, -88] };
