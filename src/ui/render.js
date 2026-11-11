// 메인 캔버스: 카메라 영상(거울 표시) + 관절선. 캔버스 크기 = 영상 크기(비율 왜곡 없음).
// 게임 물체는 이 함수 다음에 "화면 좌표"(변환 없음)로 그린다 — bodyInfo 와 같은 좌표계.

import { SKELETON_EDGES, LM, isGood } from '../pose/landmarks.js';

export function drawCamera(canvas, src, opt) {
  const ctx = canvas.getContext('2d');
  if (!src || !src.width || !opt.cameraOn) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#071030';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }
  const { width: W, height: H } = src;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  if (opt.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src.image, 0, 0, W, H);
  if (opt.frame && opt.skeleton) drawSkeleton(ctx, opt.frame, opt.minVis, opt.skeletonColor);
  ctx.restore();
  if (opt.dim) {
    ctx.fillStyle = `rgba(5, 10, 40, ${opt.dim})`;
    ctx.fillRect(0, 0, W, H);
  }
  return ctx;
}

export function drawSkeleton(ctx, frame, minVis = 0.5, color = '#4dd0ff') {
  const p = frame.pts;
  const lw = Math.max(3, frame.width / 220);
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  for (const [a, b] of SKELETON_EDGES) {
    if (!isGood(p[a], minVis) || !isGood(p[b], minVis)) continue;
    ctx.beginPath();
    ctx.moveTo(p[a].x, p[a].y);
    ctx.lineTo(p[b].x, p[b].y);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  for (const i of Object.values(LM)) {
    if (i === LM.NOSE || !isGood(p[i], minVis)) continue;
    ctx.beginPath();
    ctx.arc(p[i].x, p[i].y, lw * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 설치 점검용 기준선(머리 위·발 아래·가운데)과 사람 상자 */
export function drawGuides(ctx, W, H, vis, box, ok) {
  ctx.save();
  ctx.setLineDash([16, 12]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  for (const y of [vis.y0 + (vis.y1 - vis.y0) * 0.05, vis.y0 + (vis.y1 - vis.y0) * 0.95]) {
    ctx.beginPath(); ctx.moveTo(vis.x0, y); ctx.lineTo(vis.x1, y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo((vis.x0 + vis.x1) / 2, vis.y0); ctx.lineTo((vis.x0 + vis.x1) / 2, vis.y1); ctx.stroke();
  ctx.setLineDash([]);
  if (box) {
    ctx.strokeStyle = ok ? '#3ddc84' : '#ff6b6b';
    ctx.lineWidth = 5;
    ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  }
  ctx.restore();
}
