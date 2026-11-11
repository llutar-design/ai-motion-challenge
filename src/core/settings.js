// 교사용 설정. 이 PC 브라우저(localStorage)에만 저장된다. 학생 정보·영상은 저장하지 않는다.

const KEY = 'aiMotion.settings.v1';
const STATS_KEY = 'aiMotion.stats.v1';
const LOG_KEY = 'aiMotion.errors.v1';
const CONTENT_KEY = 'aiMotion.treasures.v1';

export const GAMES = ['pose', 'laser', 'treasure', 'space'];

export const DEFAULTS = {
  // 카메라
  cameraDeviceId: '',
  resolution: '1280x720',
  mirrorDisplay: true,
  sourceMirrored: false,
  rotation: 0, // 0 | 90 | 180 | 270 (카메라를 돌려 설치한 경우)
  videoFit: 'cover',
  layout: 'portrait', // portrait(9:16) | landscape
  // 인식
  modelVariant: 'lite',
  delegate: 'GPU',
  detectMultiple: true,
  maxInferenceFps: 30,
  minVisibility: 0.5,
  showSkeleton: 'intro', // intro(안내 화면에서만) | always | never
  // 게임
  difficulty: { pose: 'normal', laser: 'easy', treasure: 'easy', space: 'easy' },
  hidden: { pose: false, laser: false, treasure: false, space: false },
  poseRounds: 5,
  poseHoldSeconds: 1.0,
  poseStepSeconds: 8,
  laserSeconds: 60,
  spaceSeconds: 60,
  treasureDwellSeconds: 0.7,
  treasureLimitSeconds: 180,
  // 운영
  seatedDefault: false,
  autoReturnSeconds: 20,
  abandonSeconds: 15,
  calibrationHoldSeconds: 1.5,
  hours: { enabled: false, start: '09:00', end: '16:30' },
  volume: 0.6,
  sfx: true,
  effects: 'normal', // normal | low
  showDiagnostics: false,
  countPlays: false,
  adminPinHash: '',
  demoMode: false,
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

function merge(base, obj) {
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (!(k in obj)) continue;
    const b = base[k];
    const v = obj[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      if (v && typeof v === 'object') out[k] = merge(b, v);
    } else if (typeof v === typeof b) out[k] = v;
  }
  return out;
}

export function loadSettings() {
  try { return merge(DEFAULTS, JSON.parse(safeGet(KEY) ?? '{}')); } catch { return structuredClone(DEFAULTS); }
}
export function saveSettings(s) { return safeSet(KEY, JSON.stringify(s)); }
export function resetSettings() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  return structuredClone(DEFAULTS);
}

// ---- 게임별 익명 합산 이용 횟수(기본 꺼짐, 숫자만) ----
export function loadStats() {
  try { return { pose: 0, laser: 0, treasure: 0, space: 0, ...JSON.parse(safeGet(STATS_KEY) ?? '{}') }; } catch { return { pose: 0, laser: 0, treasure: 0, space: 0 }; }
}
export function bumpStat(game) {
  const s = loadStats();
  s[game] = (s[game] ?? 0) + 1;
  safeSet(STATS_KEY, JSON.stringify(s));
}
export function resetStats() { safeSet(STATS_KEY, '{}'); }

// ---- 운영 오류 기록(개인 식별 정보 없음, 최근 50건) ----
export function logError(where, message) {
  try {
    const list = JSON.parse(safeGet(LOG_KEY) ?? '[]');
    list.push({ at: new Date().toISOString().slice(0, 19), where, message: String(message).slice(0, 200) });
    safeSet(LOG_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* 무시 */ }
}
export function loadErrors() { try { return JSON.parse(safeGet(LOG_KEY) ?? '[]'); } catch { return []; } }
export function clearErrors() { safeSet(LOG_KEY, '[]'); }

// ---- 교사가 수정한 보물 도감 설명 ----
export function loadTreasureEdits() { try { return JSON.parse(safeGet(CONTENT_KEY) ?? '{}'); } catch { return {}; } }
export function saveTreasureEdits(map) { return safeSet(CONTENT_KEY, JSON.stringify(map)); }

export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ai-motion:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 운영시간 안인지(설정이 꺼져 있으면 항상 true) */
export function withinHours(hours, date = new Date()) {
  if (!hours?.enabled) return true;
  const m = date.getHours() * 60 + date.getMinutes();
  const p = (s) => { const [h, mm] = String(s).split(':').map(Number); return h * 60 + (mm || 0); };
  const a = p(hours.start);
  const b = p(hours.end);
  return a <= b ? m >= a && m < b : m >= a || m < b;
}
