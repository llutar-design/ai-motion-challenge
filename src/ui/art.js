// 직접 그리는 그래픽(외부 이미지 없음): 보물 아이콘, 백제 분위기 장식, 우주 물체.
// 실제 유물의 정확한 복원이 아닌 단순한 창작 아이콘이다.

const GOLD = '#ffcf4d';
const GOLD_D = '#b8860b';

function petals(ctx, r, n, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / n);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.22, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 보물 아이콘. (x,y) 중심, r 반지름 */
export function drawTreasureIcon(ctx, icon, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  switch (icon) {
    case 'tile': // 연꽃무늬 원형 기와
      ctx.fillStyle = '#8d8f99'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      petals(ctx, r * 0.9, 8, '#c9ccd6');
      ctx.fillStyle = '#6d6f79'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
      break;
    case 'brick': // 산 무늬 사각 벽돌
      ctx.fillStyle = '#b07b52'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#e4c29a';
      ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.6); ctx.lineTo(-r * 0.35, -r * 0.4); ctx.lineTo(0, r * 0.2); ctx.lineTo(r * 0.35, -r * 0.6); ctx.lineTo(r * 0.8, r * 0.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7a5134'; ctx.lineWidth = r * 0.08; ctx.strokeRect(-r, -r, r * 2, r * 2);
      break;
    case 'lotus':
      petals(ctx, r, 8, '#ff9ec7');
      petals(ctx, r * 0.6, 6, '#ffd1e6');
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx.fill();
      break;
    case 'pagoda': // 층층 돌탑
      ctx.fillStyle = '#a7a9b4';
      for (let i = 0; i < 5; i++) {
        const w = r * (1.6 - i * 0.22);
        const yy = r * (0.85 - i * 0.38);
        ctx.fillRect(-w / 2, yy - r * 0.08, w, r * 0.1);
        ctx.fillRect(-w * 0.32, yy - r * 0.3, w * 0.64, r * 0.22);
      }
      ctx.fillStyle = GOLD; ctx.fillRect(-r * 0.04, -r * 1.15, r * 0.08, r * 0.3);
      break;
    case 'incense': // 둥근 향로(창작 단순화)
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.7, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GOLD_D; ctx.fillRect(-r * 0.12, r * 0.45, r * 0.24, r * 0.3); ctx.fillRect(-r * 0.5, r * 0.72, r, r * 0.16);
      ctx.fillStyle = '#ffe69a'; ctx.beginPath(); ctx.arc(0, -r * 0.82, r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = GOLD_D; ctx.lineWidth = r * 0.06;
      for (const yy of [-0.35, -0.05, 0.25]) { ctx.beginPath(); ctx.arc(0, r * yy, r * 0.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      break;
    case 'lantern':
      ctx.fillStyle = '#ff7b54'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.65, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3b22'; ctx.fillRect(-r * 0.4, -r * 1.0, r * 0.8, r * 0.18); ctx.fillRect(-r * 0.4, r * 0.82, r * 0.8, r * 0.18);
      break;
    case 'wall': // 쌓은 돌
      ctx.fillStyle = '#9b8f7d';
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const off = row % 2 ? r * 0.3 : 0;
        ctx.fillRect(-r + col * r * 0.68 + off - r * 0.15, -r + row * r * 0.68, r * 0.6, r * 0.58);
      }
      break;
    case 'scroll':
      ctx.fillStyle = '#f3e3c3'; ctx.fillRect(-r * 0.8, -r * 0.6, r * 1.6, r * 1.2);
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-r * 0.95, -r * 0.7, r * 0.18, r * 1.4); ctx.fillRect(r * 0.77, -r * 0.7, r * 0.18, r * 1.4);
      ctx.strokeStyle = '#7a6a55'; ctx.lineWidth = r * 0.05;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.5 + i * r * 0.3, -r * 0.4); ctx.lineTo(-r * 0.5 + i * r * 0.3, r * 0.4); ctx.stroke(); }
      break;
    case 'boat':
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.moveTo(-r, r * 0.1); ctx.lineTo(r, r * 0.1); ctx.lineTo(r * 0.6, r * 0.55); ctx.lineTo(-r * 0.6, r * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e9e4d6'; ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.6, r * 0.05); ctx.lineTo(0, r * 0.05); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a3b22'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.1); ctx.stroke();
      ctx.strokeStyle = '#4dd0ff'; ctx.beginPath(); ctx.moveTo(-r, r * 0.75); ctx.quadraticCurveTo(0, r * 0.95, r, r * 0.75); ctx.stroke();
      break;
    default:
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** 보물 상자 테두리 빛(획득 진행도 링 포함) */
export function drawTreasureSlot(ctx, x, y, r, progress, t) {
  ctx.save();
  const pulse = 0.85 + 0.15 * Math.sin(t * 3);
  ctx.fillStyle = 'rgba(255, 215, 90, 0.18)';
  ctx.beginPath(); ctx.arc(x, y, r * 1.25 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 215, 90, 0.9)';
  ctx.lineWidth = Math.max(3, r * 0.1);
  ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.stroke();
  if (progress > 0) {
    ctx.strokeStyle = '#3ddc84';
    ctx.lineWidth = Math.max(5, r * 0.18);
    ctx.beginPath(); ctx.arc(x, y, r * 1.25, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** 백제 분위기 장식(화면 위 기와지붕 처마, 아래 물결/풀). 영상을 가리지 않게 가장자리에만. */
export function drawZoneFrame(ctx, zone, vis, t) {
  const w = vis.x1 - vis.x0;
  const h = vis.y1 - vis.y0;
  const eave = h * 0.07;
  ctx.save();
  // 처마
  ctx.fillStyle = zone === 'temple' ? 'rgba(90, 60, 40, 0.85)' : zone === 'fortress' ? 'rgba(60, 80, 50, 0.85)' : 'rgba(70, 50, 90, 0.85)';
  ctx.beginPath();
  ctx.moveTo(vis.x0, vis.y0);
  ctx.lineTo(vis.x1, vis.y0);
  ctx.lineTo(vis.x1, vis.y0 + eave * 0.6);
  ctx.quadraticCurveTo(vis.x0 + w / 2, vis.y0 + eave * 1.4, vis.x0, vis.y0 + eave * 0.6);
  ctx.closePath();
  ctx.fill();
  // 기와 무늬
  ctx.fillStyle = 'rgba(200, 200, 210, 0.7)';
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const x = vis.x0 + (w * i) / n;
    const yy = vis.y0 + eave * 0.6 + Math.sin((i / n) * Math.PI) * eave * 0.35;
    ctx.beginPath(); ctx.arc(x, yy, eave * 0.18, 0, Math.PI * 2); ctx.fill();
  }
  // 아래 장식: 궁궐=연못 물결, 절=연꽃, 산성=풀
  const by = vis.y1 - h * 0.05;
  if (zone === 'fortress') {
    ctx.fillStyle = 'rgba(70, 140, 70, 0.6)';
    for (let i = 0; i < 30; i++) {
      const x = vis.x0 + (w * i) / 29;
      ctx.beginPath(); ctx.moveTo(x - 8, vis.y1); ctx.lineTo(x, by - (i % 3) * 8); ctx.lineTo(x + 8, vis.y1); ctx.fill();
    }
  } else {
    ctx.strokeStyle = zone === 'palace' ? 'rgba(77, 208, 255, 0.6)' : 'rgba(255, 158, 199, 0.6)';
    ctx.lineWidth = 4;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = vis.x0 + (w * i) / 40;
        const yy = by + k * 10 + Math.sin(i * 0.6 + t * 2 + k) * 5;
        i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 운석 */
export function drawMeteor(ctx, x, y, r, vx, vy, boss = false) {
  ctx.save();
  const len = Math.hypot(vx, vy) || 1;
  const tx = (-vx / len) * r * 3;
  const ty = (-vy / len) * r * 3;
  const grad = ctx.createLinearGradient(x, y, x + tx, y + ty);
  grad.addColorStop(0, boss ? 'rgba(190, 120, 255, 0.8)' : 'rgba(255, 170, 60, 0.8)');
  grad.addColorStop(1, 'rgba(255, 170, 60, 0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = r * 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + tx, y + ty); ctx.stroke();
  ctx.fillStyle = boss ? '#7b4bd6' : '#8a6d5a';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = boss ? '#a988f0' : '#a88b75';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** 손 방어막 */
export function drawShield(ctx, x, y, r, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(77, 208, 255, 0.22)';
  ctx.strokeStyle = 'rgba(140, 230, 255, 0.95)';
  ctx.lineWidth = Math.max(3, r * 0.08);
  ctx.beginPath(); ctx.arc(x, y, r * (0.96 + 0.04 * Math.sin(t * 6)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** 부드러운 파편(획득·막기 효과) */
export class Particles {
  constructor() { this.p = []; }
  burst(x, y, color, n = 16, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 + Math.random() * 0.4, color, s: 4 + Math.random() * 5 });
    }
  }
  update(dt) {
    for (const q of this.p) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; q.life -= dt; }
    this.p = this.p.filter((q) => q.life > 0);
  }
  draw(ctx) {
    for (const q of this.p) {
      ctx.globalAlpha = Math.min(1, q.life * 1.5);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;
  }
}
