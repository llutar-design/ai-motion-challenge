// 게임이 공통으로 쓰는 "화면 좌표 기준 몸 정보".
// 판정용 랜드마크(카메라 원본 좌표)를 화면에 그려지는 좌표(캔버스 픽셀, 거울 반전 반영)로 바꾼다.
// 게임 물체(레이저·보물·운석)는 모두 이 화면 좌표에 놓이므로, 보이는 위치와 판정 위치가 항상 일치한다.
// 키·거리 차이는 몸통 길이 T(어깨 중심~엉덩이 중심, 앉으면 어깨 폭 기반 추정)로 정규화한다.

import { LM, isGood } from './landmarks.js';

/**
 * @param {object} frame toFrame() 결과(원본 픽셀 좌표)
 * @param {{mirror:boolean, minVis?:number}} o
 * @returns {null | {head, chest, hip, hands:{L,R}, T, shoulderY, visible}}
 *   좌표는 모두 캔버스 픽셀. hands.L/R 은 학생 본인의 왼손/오른손(화면에선 거울 위치).
 */
export function bodyInfo(frame, { mirror, minVis = 0.5 }) {
  if (!frame) return null;
  const W = frame.width;
  const P = frame.pts;
  const X = (p) => ({ x: mirror ? W - p.x : p.x, y: p.y });
  const ok = (i) => isGood(P[i], minVis);
  if (!ok(LM.L_SHOULDER) || !ok(LM.R_SHOULDER)) return null;
  const ls = X(P[LM.L_SHOULDER]);
  const rs = X(P[LM.R_SHOULDER]);
  const chest = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  let hip = null;
  let T;
  if (ok(LM.L_HIP) && ok(LM.R_HIP)) {
    const lh = X(P[LM.L_HIP]);
    const rh = X(P[LM.R_HIP]);
    hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    T = Math.hypot(chest.x - hip.x, chest.y - hip.y);
  } else {
    // 앉아서 하기 등으로 골반이 안 보이면 어깨 폭으로 몸통 길이를 추정(성인·아동 평균 비율 약 1.2)
    T = shoulderW * 1.2;
  }
  if (!(T > 1)) return null;
  const head = ok(LM.NOSE) ? X(P[LM.NOSE]) : { x: chest.x, y: chest.y - T * 0.45 };
  const hand = (wi, ii) => {
    if (!ok(wi)) return null;
    const w = X(P[wi]);
    // 손목에서 검지 쪽으로 조금 이동한 지점을 "손"으로 본다(손끝으로 보물을 만지는 느낌)
    if (P[ii] && P[ii].v >= minVis * 0.6) {
      const f = X(P[ii]);
      return { x: w.x + (f.x - w.x) * 0.6, y: w.y + (f.y - w.y) * 0.6 };
    }
    return w;
  };
  return {
    head, chest, hip, T, shoulderW,
    hands: { L: hand(LM.L_WRIST, LM.L_INDEX), R: hand(LM.R_WRIST, LM.R_INDEX) },
  };
}
