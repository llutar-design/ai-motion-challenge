// 기준 동작 스틱맨. 동작 정의의 figure 각도(몸 기준)로 그린다.
// leftDirX: 화면에서 "학생의 왼쪽"이 +x(오른쪽)인지 -x(왼쪽)인지. 거울 화면이면 -1.

const C = { head: 0.3, neck: 0.12, shoulder: 0.42, hip: 0.26, upper: 0.62, fore: 0.58, thigh: 0.8, shin: 0.78 };

function armPoints(sx, sy, side, [upperDeg, foreDeg], leftDirX, T) {
  const outX = side === 'L' ? leftDirX : -leftDirX;
  const vec = (deg, len) => {
    const r = (deg * Math.PI) / 180;
    return { x: Math.cos(r) * outX * len * T, y: -Math.sin(r) * len * T };
  };
  const u = vec(upperDeg, C.upper);
  const e = { x: sx + u.x, y: sy + u.y };
  const f = vec(foreDeg, C.fore);
  return [e, { x: e.x + f.x, y: e.y + f.y }];
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{figure:object}} def
 * @param {{cx:number, cy:number, T:number, leftDirX:number, t:number, color?:string, alpha?:number, labels?:boolean, lineWidth?:number}} o
 *   cx, cy: 어깨 중심 위치, T: 몸통 길이(px), t: 애니메이션 시간(초)
 */
export function drawFigure(ctx, def, o) {
  const fig = def.figure;
  const { T, leftDirX } = o;
  let cx = o.cx;
  let cy = o.cy + Math.sin(o.t * 4) * 0.025 * T;
  let tilt = 0;
  if (fig.sway) {
    const s = Math.sin(o.t * Math.PI * 1.6);
    cx += s * 0.35 * T;
    tilt = s * 0.12;
  }
  const bent = fig.legs === 'bent';
  if (bent) cy += 0.18 * T;

  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.strokeStyle = o.color ?? '#ffd84d';
  ctx.fillStyle = o.color ?? '#ffd84d';
  ctx.lineWidth = o.lineWidth ?? Math.max(4, T * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  if (fig.tilt) {
    // 기울이기 자세: 발을 축으로 몸 전체를 학생 쪽 방향으로 기울인다(화면 방향은 leftDirX 로 결정)
    const footY = T * (1 + C.thigh + C.shin);
    ctx.translate(0, footY);
    ctx.rotate(((fig.tilt * leftDirX) * Math.PI) / 180);
    ctx.translate(0, -footY);
  }

  const sh = C.shoulder * T;
  const ls = { x: sh * leftDirX, y: 0 };
  const rs = { x: -sh * leftDirX, y: 0 };
  const hipY = T;
  const lh = { x: C.hip * T * leftDirX, y: hipY };
  const rh = { x: -C.hip * T * leftDirX, y: hipY };

  const line = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  // 몸통
  line([ls, rs]);
  line([{ x: 0, y: 0 }, { x: 0, y: hipY }]);
  line([lh, rh]);
  // 머리
  ctx.beginPath();
  ctx.arc(0, -(C.neck + C.head) * T, C.head * T, 0, Math.PI * 2);
  ctx.stroke();
  line([{ x: 0, y: 0 }, { x: 0, y: -C.neck * T }]);

  // 다리
  for (const [hip, side] of [[lh, 'L'], [rh, 'R']]) {
    const outX = side === 'L' ? leftDirX : -leftDirX;
    if (bent) {
      const knee = { x: hip.x + outX * 0.22 * T, y: hip.y + C.thigh * T * 0.8 };
      const ankle = { x: hip.x + outX * 0.08 * T, y: knee.y + C.shin * T * 0.92 };
      line([hip, knee, ankle]);
    } else {
      const knee = { x: hip.x + outX * 0.06 * T, y: hip.y + C.thigh * T };
      const ankle = { x: hip.x + outX * 0.1 * T, y: knee.y + C.shin * T };
      line([hip, knee, ankle]);
    }
  }

  // 팔(현재 동작이 강조되도록 위로 든 팔은 굵게)
  const labels = [];
  for (const [s, side] of [[ls, 'L'], [rs, 'R']]) {
    const [e, w] = armPoints(s.x, s.y, side, fig[side], leftDirX, T);
    line([s, e, w]);
    ctx.beginPath();
    ctx.arc(w.x, w.y, T * 0.1, 0, Math.PI * 2);
    ctx.fill();
    labels.push({ side, w });
  }
  ctx.restore();

  const ARM_LABEL = { LEFT_ARM_UP: 'L', RIGHT_ARM_UP: 'R', LEFT_ARM_OUT: 'L', RIGHT_ARM_OUT: 'R' };
  if (o.labels && ARM_LABEL[def.id]) {
    const side = ARM_LABEL[def.id];
    const w = labels.find((l) => l.side === side).w;
    ctx.save();
    ctx.font = `bold ${Math.round(T * 0.32)}px Pretendard, "Malgun Gothic", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    const text = side === 'L' ? '왼팔' : '오른팔';
    ctx.strokeText(text, cx + w.x, cy + w.y - T * 0.25);
    ctx.fillText(text, cx + w.x, cy + w.y - T * 0.25);
    ctx.restore();
  }
}

/** 패널 캔버스에 기준 동작을 꽉 차게 그린다. */
export function drawFigurePanel(canvas, def, { leftDirX, t, dim = false }) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  if (!def) return;
  // 전체 높이 ≈ (머리 0.72 + 몸통 1 + 다리 1.58) T + 위로 든 팔 여유
  const T = Math.min(hgt / 4.6, w / 2.6);
  drawFigure(ctx, def, { cx: w / 2, cy: hgt * 0.38, T, leftDirX, t, alpha: dim ? 0.5 : 1, labels: true });
}
