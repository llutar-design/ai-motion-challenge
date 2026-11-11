// 게임 시작 전 안전·거리 캘리브레이션. 모든 항목이 일정 시간 통과해야 시작한다.
// obs: main 이 만든 인식 결과 { status, persons, frame, body(assessBody 결과) }

import { LM, isGood } from './landmarks.js';

/**
 * @param {object} obs
 * @param {{seated:boolean, light:{mean:number, personMean:number|null, backlit:boolean, dark:boolean}|null, minVis?:number}} o
 * @returns {{checks:{id:string,label:string,ok:boolean,hint:string}[], allOk:boolean}}
 */
export function evaluateCalibration(obs, { seated, light, minVis = 0.5 }) {
  const checks = [];
  const add = (id, label, ok, hint) => checks.push({ id, label, ok: !!ok, hint: ok ? '' : hint });
  const f = obs.frame;
  const vis = f?.visible ?? { x0: 0, x1: 1, y0: 0, y1: 1 };

  add('one', '한 명만 보여요', obs.persons === 1, obs.persons >= 2 ? '한 명씩 참여해 주세요' : '카메라 앞에 서 주세요');
  add('body', seated ? '머리·어깨·팔이 보여요' : '온몸이 보여요', obs.status === 'OK',
    obs.body?.offSide ? '화면 가운데로 와 주세요' : obs.body?.tooClose ? '조금 뒤로 가 주세요' : seated ? '상체가 모두 보이게 앉아 주세요' : '머리부터 발끝까지 보이게 서 주세요');

  const handsOk = !!f && [LM.L_WRIST, LM.R_WRIST].every((i) => isGood(f.pts[i], minVis));
  add('hands', '두 손이 화면 안에 있어요', handsOk, '두 손이 화면에 보이게 해 주세요');
  if (!seated) {
    const feetOk = !!f && [LM.L_ANKLE, LM.R_ANKLE].every((i) => isGood(f.pts[i], minVis));
    add('feet', '두 발이 화면 안에 있어요', feetOk, '발끝까지 보이게 조금 뒤로 가 주세요');
  }

  // 거리: 서 있으면 머리~발목 높이, 앉으면 어깨 폭으로 판단(보이는 영역 기준 비율)
  let distOk = false;
  let distHint = '카메라 앞에 서 주세요';
  if (f) {
    if (!seated) {
      const nose = f.pts[LM.NOSE];
      const ank = Math.max(f.pts[LM.L_ANKLE].ny, f.pts[LM.R_ANKLE].ny);
      const r = (ank - nose.ny) / (vis.y1 - vis.y0);
      distOk = r >= 0.45 && r <= 0.92;
      distHint = r > 0.92 ? '조금만 뒤로 가 주세요' : '조금만 앞으로 와 주세요';
    } else {
      const sw = Math.abs(f.pts[LM.L_SHOULDER].nx - f.pts[LM.R_SHOULDER].nx) / (vis.x1 - vis.x0);
      distOk = sw >= 0.12 && sw <= 0.45;
      distHint = sw > 0.45 ? '조금만 뒤로 가 주세요' : '조금만 앞으로 와 주세요';
    }
  }
  add('dist', '카메라와 거리가 알맞아요', distOk, distHint);

  if (light) {
    add('light', '밝기가 충분해요', !light.dark && !light.backlit,
      light.dark ? '너무 어두워요. 조명을 켜 주세요(선생님)' : '뒤쪽이 너무 밝아요(역광). 창문 커튼을 쳐 주세요(선생님)');
  }
  return { checks, allOk: checks.every((c) => c.ok) };
}

/** 사람 영역(정규화 상자) — 역광 점검용 */
export function personBox(frame, minVis = 0.5) {
  if (!frame) return null;
  const pts = frame.pts.filter((p) => p.v >= minVis);
  if (pts.length < 5) return null;
  const xs = pts.map((p) => p.nx);
  const ys = pts.map((p) => p.ny);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return { x0: clamp(Math.min(...xs)), x1: clamp(Math.max(...xs)), y0: clamp(Math.min(...ys)), y1: clamp(Math.max(...ys)) };
}
