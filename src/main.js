// AI 모션 챌린지 메인: 화면 흐름, 카메라·AI 추론 루프, 게임 실행, 예외 처리.
// 판정은 실제 관절 좌표로만 한다(DEMO 모드는 화면에 DEMO 로 표시되는 가상 학생).

import { $, h, clear, setText } from './core/dom.js';
import { Camera, CameraError } from './camera/camera.js';
import { FrameSource, measureLight } from './camera/source.js';
import { createPoseEngine, EngineError, MODEL_PATHS, WASM_DIR, WASM_FILES } from './pose/engine.js';
import { toFrame, assessBody, isMeaningfulPerson, LM, FULL_VIEW } from './pose/landmarks.js';
import { POSE_MAP, POSE_IDS, SEATED_POSE_IDS, evaluatePose } from './pose/poses.js';
import { bodyInfo } from './pose/body.js';
import { evaluateCalibration, personBox } from './pose/calibration.js';
import { PoseMaster, POSE_DIFFICULTY } from './games/poseMaster.js';
import { LaserEscape } from './games/laser.js';
import { TreasureQuest } from './games/treasure.js';
import { SpaceGuard } from './games/space.js';
import {
  GAMES, loadSettings, saveSettings, resetSettings, loadStats, bumpStat, resetStats, hashPin, withinHours,
  logError, loadErrors, clearErrors, loadTreasureEdits, saveTreasureEdits,
} from './core/settings.js';
import { Sfx } from './core/sfx.js';
import { drawCamera, drawGuides } from './ui/render.js';
import { drawFigurePanel } from './ui/figure.js';
import { drawTreasureIcon } from './ui/art.js';
import { createAdmin } from './ui/admin.js';
import { DemoStudent } from './demo/student.js';

const app = $('#app');
const video = $('#cam');
const canvas = $('#view');
const side = $('#side');
const overlay = $('#overlay');
const dialog = $('#dialog');
const banner = $('#banner');
const centerMsg = $('#center-msg');
const countdownEl = $('#countdown');
const bigGrade = $('#big-grade');
const popupEl = $('#popup');
const titleCards = $('#title-cards');
const cursors = $('#cursors');
const calibPanel = $('#calib-panel');
const diagEl = $('#diag');

const GAME_INFO = {
  pose: { name: '포즈 마스터', ico: '🧍', short: '자세를 맞춰라!', how: '왼쪽 그림과 같은 자세를 만들고 1초 동안 멈춰요!', Cls: PoseMaster },
  laser: { name: '레이저 탈출', ico: '🔴', short: '장애물을 피해라!', how: '발은 그대로! 몸을 옆으로 기울여 다가오는 레이저를 피해요.', Cls: LaserEscape },
  treasure: { name: '백제 보물 탐험대', ico: '🏯', short: '몸으로 찾는 역사 탐험!', how: '미션 자세를 하고, 반짝이는 보물 위에 손을 잠깐 올려 보물을 모아요.', Cls: TreasureQuest },
  space: { name: '우주 수호대', ico: '🚀', short: '몸으로 조종하는 우주선!', how: '두 손이 방어막이 돼요! 날아오는 운석에 손을 대서 막아요. 마지막엔 만세!', Cls: SpaceGuard },
};

const S = {
  settings: loadSettings(),
  screen: 'boot',
  camera: new Camera(video),
  source: new FrameSource(video),
  cameraOn: false,
  engine: null,
  demo: null,
  sfx: new Sfx(),
  obs: { t: 0, status: 'NO_PERSON', frame: null, body: null, persons: 0 },
  bodyCache: { t: -1, body: null },
  lastStamp: null,
  lastInferAt: 0,
  inferErrors: 0,
  perf: { infer: [], inferMs: [], status: [] },
  light: null,
  lightAt: 0,
  seated: false,
  alt: false,
  gameId: null,
  game: null,
  paused: false,
  noPersonSince: null,
  calibOkSince: null,
  countdown: null,
  resultTimer: null,
  hover: { card: null, since: 0 },
  pointer: null,
  keys: { left: false, right: false },
  content: null,
  hidden: false,
  scoreCache: new Map(),
};
S.seated = S.settings.seatedDefault;

// ------------------------------------------------------------------ 공통

function showOverlay(card) { clear(overlay).append(card); overlay.hidden = false; }
function hideOverlay() { overlay.hidden = true; clear(overlay); }
function closeDialog() { dialog.hidden = true; clear(dialog); }
function clearResultTimer() { if (S.resultTimer) clearInterval(S.resultTimer); S.resultTimer = null; }
const LIVE = ['title', 'calib', 'howto', 'play'];
/** START_GAME.bat 의 로컬 서버로 실행 중인지(아니면 GitHub Pages 등 웹 실행) */
const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);

function setScreen(name, { guide = false } = {}) {
  S.screen = name;
  app.dataset.screen = name;
  app.dataset.guide = guide ? 'on' : 'off';
  titleCards.hidden = name !== 'title';
  calibPanel.hidden = name !== 'calib';
  clear(cursors);
  for (const el of [banner, centerMsg, countdownEl, bigGrade, popupEl]) el.hidden = true;
  if (name !== 'play') for (const id of ['tb-game', 'tb-round', 'tb-lives', 'tb-time']) setText($(`#${id}`), '');
  $('#cam-indicator').hidden = !S.cameraOn || !!S.demo;
}

function applySettings() {
  const st = S.settings;
  app.dataset.layout = st.layout;
  app.dataset.effects = st.effects;
  S.sfx.volume = st.volume;
  S.sfx.enabled = st.sfx;
  S.source.setRotation(st.rotation);
  $('#badge-demo').hidden = !st.demoMode;
  $('#demo-mark').hidden = !st.demoMode;
  $('#badge-seated').hidden = !S.seated;
  $('#badge-alt').hidden = !S.alt;
}

function statusMessage(status, body) {
  switch (status) {
    case 'NO_PERSON': return '잠시 멈춤 — 화면 안으로 들어와 주세요';
    case 'MULTI_PERSON': return '잠시 멈춤 — 한 명씩 참여해 주세요 🙂';
    case 'PARTIAL_BODY':
      if (body?.tooClose) return '잠시 멈춤 — 조금 뒤로 가 주세요';
      if (body?.offSide) return '잠시 멈춤 — 화면 가운데로 와 주세요';
      return S.seated ? '잠시 멈춤 — 머리와 두 팔이 보이게 해 주세요' : '잠시 멈춤 — 온몸이 보이게 조금 뒤로 가 주세요';
    case 'TRACKING_UNCERTAIN': return '잠시 멈춤 — 움직임을 다시 확인하고 있어요';
    default: return '';
  }
}

// ------------------------------------------------------------------ 카메라 / 엔진 / DEMO

async function startCamera() {
  if (S.settings.demoMode) {
    S.demo ??= new DemoStudent();
    S.source.override = S.demo.frame();
    S.cameraOn = true;
    return true;
  }
  S.source.override = null;
  try {
    await S.camera.start({ deviceId: S.settings.cameraDeviceId, resolution: S.settings.resolution });
    S.cameraOn = true;
    S.camera.onLost = onCameraLost;
    $('#cam-indicator').hidden = false;
    return true;
  } catch (e) {
    S.cameraOn = false;
    logError('camera', `${e.code ?? ''} ${e.message}`);
    showCameraError(e);
    return false;
  }
}

function stopCamera() {
  S.camera.stop();
  S.cameraOn = false;
  S.obs = { t: 0, status: 'NO_PERSON', frame: null, body: null, persons: 0 };
  $('#cam-indicator').hidden = true;
  drawCamera(canvas, null, { cameraOn: false });
}

function onCameraLost() {
  if (!S.cameraOn) return;
  S.game = null;
  stopCamera();
  logError('camera', 'disconnected');
  showCameraError(new CameraError('LOST', '카메라 연결이 끊어졌어요. USB 연결을 확인한 뒤 "다시 연결"을 눌러 주세요.'));
}

async function startEngine() {
  S.engine?.close?.();
  S.engine = null;
  if (S.settings.demoMode) {
    S.demo ??= new DemoStudent();
    S.engine = { info: { modelVariant: 'DEMO', delegate: '-', numPoses: 1, version: 'demo' }, detect: () => S.demo.detect(), close() {} };
    return true;
  }
  try {
    S.engine = await createPoseEngine({ modelVariant: S.settings.modelVariant, delegate: S.settings.delegate, numPoses: S.settings.detectMultiple ? 2 : 1 });
    return true;
  } catch (e) {
    logError('engine', e.message);
    showEngineError(e);
    return false;
  }
}

/**
 * 실제 영상 맞춤 방식. "꽉 채우기"는 양옆을 자르는 경우(세로 화면)에만 쓴다.
 * 위아래가 잘리면 머리·발이 안 보이므로(가로 화면) 자동으로 "전체 보기"로 바꾼다.
 */
function effectiveFit(W = canvas.width, H = canvas.height) {
  if (S.settings.videoFit !== 'cover') return 'contain';
  const wrap = $('#view-wrap');
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  if (!W || !H || !cw || !ch) return 'cover';
  return cw / ch < W / H ? 'cover' : 'contain';
}

/** 화면에 보이는 영역(정규화) — 꽉 채우기로 잘린 양옆 제외 */
function visibleRegion(W, H) {
  if (effectiveFit(W, H) !== 'cover') return FULL_VIEW;
  const wrap = $('#view-wrap');
  const half = (wrap.clientWidth / wrap.clientHeight) / (W / H) / 2;
  return { x0: 0.5 - half, x1: 0.5 + half, y0: 0, y1: 1 };
}

function maybeInfer(now, dt) {
  if (!S.engine || !S.cameraOn || !LIVE.includes(S.screen)) return false;
  if (S.paused && S.screen === 'play') return false;
  if (S.demo && S.settings.demoMode) {
    S.demo.step(now, dt, { screen: S.screen, gameId: S.gameId, game: S.game, mirror: S.settings.mirrorDisplay });
    S.source.override = S.demo.frame();
  }
  if (!S.source.ready) return false;
  const stamp = S.source.frameStamp();
  if (stamp === S.lastStamp) return false;
  if (now - S.lastInferAt < 1000 / S.settings.maxInferenceFps - 2) return false;
  S.lastStamp = stamp;
  S.lastInferAt = now;
  const src = S.source.grab();
  const t0 = performance.now();
  let res;
  try {
    res = S.engine.detect(src.image, now);
    S.inferErrors = 0;
  } catch (e) {
    S.inferErrors += 1;
    if (S.inferErrors === 1) logError('infer', e.message);
    if (S.inferErrors > 30) { S.game = null; showEngineError(new EngineError(`AI 추론이 반복해서 실패했습니다: ${e.message}`)); }
    return false;
  }
  const ms = performance.now() - t0;
  S.perf.infer.push(now);
  S.perf.inferMs.push(ms);
  if (S.perf.inferMs.length > 60) S.perf.inferMs.shift();
  S.obs = buildObs(res, src, now);
  S.perf.status.push({ t: now, ok: S.obs.status === 'OK' });
  while (S.perf.infer.length && now - S.perf.infer[0] > 2000) S.perf.infer.shift();
  while (S.perf.status.length && now - S.perf.status[0].t > 10000) S.perf.status.shift();
  S.scoreCache.clear();
  // 밝기·역광 점검(0.5초마다, 처음 화면·캘리브레이션에서만)
  if ((S.screen === 'calib' || S.screen === 'title') && now - S.lightAt > 500) {
    S.lightAt = now;
    try { S.light = measureLight(src.image, src.width, src.height, personBox(S.obs.frame)); } catch { S.light = null; }
  }
  return true;
}

function buildObs(res, src, now) {
  const minVis = S.settings.minVisibility;
  const visible = visibleRegion(src.width, src.height);
  const list = res?.landmarks ?? [];
  const people = list.map((l, i) => ({ l, i })).filter((p) => isMeaningfulPerson(p.l, minVis, visible));
  if (!people.length) return { t: now, status: 'NO_PERSON', frame: null, body: null, persons: 0, visible };
  const size = (l) => Math.abs(l[LM.L_SHOULDER].x - l[LM.R_SHOULDER].x) + Math.abs(l[LM.L_HIP].y - l[LM.L_SHOULDER].y);
  people.sort((a, b) => size(b.l) - size(a.l));
  const main = people[0];
  const frame = toFrame(main.l, src.width, src.height, res.worldLandmarks?.[main.i], { swap: S.settings.sourceMirrored, visible });
  if (people.length >= 2) return { t: now, status: 'MULTI_PERSON', frame, body: null, persons: people.length, visible };
  const body = assessBody(frame, { minVis, requireFeet: true, seated: S.seated });
  return { t: now, status: body.status, frame, body, persons: 1, visible };
}

function currentObs(now) {
  if (S.cameraOn && S.obs.t && now - S.obs.t > 1000) return { ...S.obs, status: 'TRACKING_UNCERTAIN' };
  return S.obs;
}

/** 화면(캔버스) 좌표의 보이는 영역 */
function visRect() {
  const v = S.obs.visible ?? FULL_VIEW;
  const W = canvas.width;
  const H = canvas.height;
  return { x0: v.x0 * W, x1: v.x1 * W, y0: v.y0 * H, y1: v.y1 * H };
}

function bodyNow(obs) {
  if (S.bodyCache.t === obs.t) return S.bodyCache.body;
  const b = obs.frame && obs.status !== 'NO_PERSON' ? bodyInfo(obs.frame, { mirror: S.settings.mirrorDisplay, minVis: S.settings.minVisibility }) : null;
  S.bodyCache = { t: obs.t, body: b };
  return b;
}

/** 캔버스 좌표 → 화면(CSS) 좌표(object-fit 반영) */
function canvasToClient(pt) {
  const r = canvas.getBoundingClientRect();
  const W = canvas.width;
  const H = canvas.height;
  const sc = effectiveFit(W, H) === 'cover' ? Math.max(r.width / W, r.height / H) : Math.min(r.width / W, r.height / H);
  return { x: r.left + (r.width - W * sc) / 2 + pt.x * sc, y: r.top + (r.height - H * sc) / 2 + pt.y * sc };
}
function clientToCanvas(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const W = canvas.width;
  const H = canvas.height;
  const sc = effectiveFit(W, H) === 'cover' ? Math.max(r.width / W, r.height / H) : Math.min(r.width / W, r.height / H);
  return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
}

// ------------------------------------------------------------------ 처음 화면(게임 선택)

function visibleGames() { return GAMES.filter((g) => !S.settings.hidden[g]); }

function buildTitle() {
  const cards = visibleGames().map((g) => {
    const info = GAME_INFO[g];
    return h('button', { class: 'game-card', dataset: { game: g }, onclick: () => chooseGame(g) },
      h('div', { class: 'ico' }, info.ico), h('b', {}, info.name), h('span', {}, info.short), h('i', { class: 'dwell' }));
  });
  const seatedBtn = h('button', { class: `opt-btn ${S.seated ? 'on' : ''}`, onclick: () => { S.seated = !S.seated; applySettings(); buildTitle(); } }, S.seated ? '🪑 앉아서 하기 켜짐' : '🪑 앉아서 하기');
  const altBtn = h('button', {
    class: `opt-btn ${S.alt ? 'on' : ''}`,
    onclick: () => {
      S.alt = !S.alt;
      applySettings();
      // 카메라 없이 대체 조작만 하던 중 끄면 카메라를 다시 켜 본다
      if (!S.alt && S.noCamera) { S.noCamera = false; goTitle(); return; }
      buildTitle();
    },
  }, S.alt ? '⌨ 대체 조작 켜짐' : '⌨ 대체 조작');
  // 카드는 화면 위쪽: 손을 어깨 위로 들어야 닿는다(서 있기만 해도 선택되는 일 방지)
  clear(titleCards).append(
    h('div', { class: 'title-grid' }, ...cards),
    h('div', { class: 'title-foot' },
      h('div', { class: 'title-head' }, h('h1', {}, 'AI 모션 챌린지'), h('p', {}, '✋ 손을 높이 들어 카드에 1초 대거나, 카드를 눌러 골라요')),
      h('div', { class: 'title-opts' }, seatedBtn, altBtn, h('button', { class: 'opt-btn', onclick: showSafety }, '⚠ 안전 안내'))),
  );
}

async function goTitle() {
  clearResultTimer();
  closeDialog();
  hideOverlay();
  S.game = null;
  S.gameId = null;
  S.paused = false;
  S.countdown = null;
  S.hover = { card: null, since: 0 };
  if (!withinHours(S.settings.hours)) { showHours(); return; }
  setScreen('title');
  buildTitle();
  if (!S.cameraOn && !S.noCamera) {
    await startCamera();
    if (['stopped', 'closed', 'hours'].includes(S.screen)) stopCamera();
  }
}

/** 손을 카드 위에 1.2초 올리면 선택(몸으로 시작하기) */
function updateTitle(now, obs) {
  const body = bodyNow(obs);
  clear(cursors);
  let hit = null;
  if (body && obs.status !== 'MULTI_PERSON') {
    for (const k of ['L', 'R']) {
      const hp = body.hands[k];
      // 어깨보다 높이 든 손만 선택 커서로 쓴다(팔을 내리고 서 있을 때 실수로 고르지 않게)
      if (!hp || hp.y > body.chest.y) continue;
      const c = canvasToClient(hp);
      const wr = $('#view-wrap').getBoundingClientRect();
      cursors.append(h('div', { class: 'cursor', style: { left: `${c.x - wr.left}px`, top: `${c.y - wr.top}px` } }));
      const el = document.elementFromPoint(c.x, c.y)?.closest?.('.game-card');
      if (el) hit = el;
    }
  }
  for (const el of titleCards.querySelectorAll('.game-card')) {
    el.classList.toggle('hover', el === hit);
    el.querySelector('.dwell').style.width = '0';
  }
  if (!hit) { S.hover = { card: null, since: 0 }; return; }
  if (S.hover.card !== hit) S.hover = { card: hit, since: now };
  const p = (now - S.hover.since) / 1200;
  hit.querySelector('.dwell').style.width = `${Math.min(100, p * 100)}%`;
  if (p >= 1) { S.hover = { card: null, since: 0 }; chooseGame(hit.dataset.game); }
}

function chooseGame(g) {
  S.sfx.unlock();
  S.sfx.play('click');
  if (S.alt && g === 'pose') {
    showOverlay(h('div', { class: 'card' }, h('h2', {}, '포즈 마스터는 카메라 동작으로만 할 수 있어요'),
      h('p', {}, '대체 조작에서는 레이저 탈출 · 백제 보물 탐험대 · 우주 수호대를 이용해 주세요.'),
      h('button', { class: 'big-btn', onclick: hideOverlay }, '알겠어요')));
    return;
  }
  S.gameId = g;
  if (S.alt) { goHowto(); return; }
  S.calibOkSince = null;
  S.noPersonSince = null;
  setScreen('calib');
  buildCalib();
}

function showSafety() {
  showOverlay(h('div', { class: 'card' },
    h('h1', {}, '⚠ 안전 안내'),
    h('ul', {},
      h('li', {}, '한 명씩 참여해요.'),
      h('li', {}, '바닥 표시 안에서 제자리 동작만 해요. 뛰거나 점프하지 않아요.'),
      h('li', {}, '모니터에 부딪히지 않게 팔 길이보다 멀리 서요.'),
      h('li', {}, '주변에 친구나 물건이 없는지 확인해요.'),
      h('li', {}, '힘들면 언제든 멈춰도 괜찮아요.')),
    h('p', {}, '카메라 영상은 화면에만 보이고 저장하지 않아요.'),
    h('button', { class: 'big-btn', onclick: hideOverlay }, '알겠어요!')));
}

function showHours() {
  stopCamera();
  setScreen('hours');
  const st = S.settings.hours;
  showOverlay(h('div', { class: 'card' }, h('h1', {}, '🌙 지금은 운영 시간이 아니에요'), h('p', {}, `운영 시간: ${st.start} ~ ${st.end}`)));
}

// ------------------------------------------------------------------ 캘리브레이션

/** 준비 확인 패널은 한 번만 만들고(버튼이 매 프레임 바뀌면 클릭이 안 먹힘) 항목만 갱신한다 */
function buildCalib() {
  const rows = h('div', { class: 'calib-rows' });
  const fill = h('i');
  clear(calibPanel).append(
    h('h2', {}, `${GAME_INFO[S.gameId].ico} ${GAME_INFO[S.gameId].name} — 준비 확인`),
    rows,
    h('div', { class: 'calib-bar' }, fill),
    h('div', { class: 'calib-btns' },
      h('button', { class: 'small-btn', onclick: goTitle }, '← 뒤로'),
      h('button', { class: 'small-btn', onclick: goHowto }, '그래도 시작(선생님)')),
  );
  S.calibUi = { rows, fill, sig: '' };
}

function updateCalib(now, obs) {
  // 학생이 떠나면 처음 화면으로(무인 운영)
  if (obs.status === 'NO_PERSON') {
    S.noPersonSince ??= now;
    if (now - S.noPersonSince > S.settings.abandonSeconds * 1000) { goTitle(); return; }
  } else S.noPersonSince = null;
  const res = evaluateCalibration(obs, { seated: S.seated, light: S.light, minVis: S.settings.minVisibility });
  if (res.allOk) S.calibOkSince ??= now; else S.calibOkSince = null;
  const p = S.calibOkSince ? (now - S.calibOkSince) / (S.settings.calibrationHoldSeconds * 1000) : 0;
  const ui = S.calibUi;
  const sig = res.checks.map((c) => `${c.ok}${c.hint}`).join('|');
  if (sig !== ui.sig) {
    ui.sig = sig;
    clear(ui.rows).append(...res.checks.map((c) => h('div', { class: `check ${c.ok ? 'ok' : 'no'}` }, h('span', { class: 'mk' }, c.ok ? '✔' : '…'), h('span', {}, c.label), c.hint ? h('small', {}, c.hint) : null)));
  }
  ui.fill.style.width = `${Math.min(100, p * 100)}%`;
  if (p >= 1) goHowto();
}

// ------------------------------------------------------------------ 설명 → 3·2·1

function goHowto() {
  const info = GAME_INFO[S.gameId];
  setScreen('howto');
  showOverlay(h('div', { class: 'card' },
    h('div', { class: 'how-ico' }, info.ico),
    h('h1', {}, info.name),
    h('h2', {}, info.how),
    S.seated ? h('p', {}, '🪑 앉아서 하기: 팔 동작 중심으로 진행해요.') : null,
    S.alt ? h('p', {}, '⌨ 대체 조작: 화면을 누르거나 마우스·방향키로 조작해요.') : null,
    h('button', { class: 'big-btn', onclick: startCountdown }, '시작!')));
  S.howtoUntil = performance.now() + 4000;
}

function startCountdown() {
  if (S.screen !== 'howto' || S.countdown) return;
  hideOverlay();
  S.countdown = { start: performance.now(), last: null };
}

function updateCountdown(now) {
  if (!S.countdown) {
    if (now >= S.howtoUntil) startCountdown();
    return;
  }
  const el = now - S.countdown.start;
  const n = 3 - Math.floor(el / 1000);
  countdownEl.hidden = false;
  if (n > 0) {
    if (S.countdown.last !== n) { S.countdown.last = n; S.sfx.play('count'); }
    setText(countdownEl, String(n));
  } else if (el < 3700) {
    if (S.countdown.last !== 0) { S.countdown.last = 0; S.sfx.play('go'); }
    setText(countdownEl, 'START!');
  } else {
    countdownEl.hidden = true;
    S.countdown = null;
    beginGame();
  }
}

function makeGame(g) {
  const st = S.settings;
  const difficulty = st.difficulty[g];
  if (g === 'pose') {
    const ids = S.seated ? SEATED_POSE_IDS : POSE_IDS;
    return new PoseMaster({ poseIds: ids, rounds: st.poseRounds, difficulty, holdMs: st.poseHoldSeconds * 1000, stepMs: st.poseStepSeconds * 1000 });
  }
  if (g === 'laser') return new LaserEscape({ difficulty, durationMs: st.laserSeconds * 1000 });
  if (g === 'treasure') return new TreasureQuest({ content: S.content, difficulty, dwellMs: st.treasureDwellSeconds * 1000, limitMs: st.treasureLimitSeconds * 1000, mirror: st.mirrorDisplay });
  return new SpaceGuard({ difficulty, durationMs: st.spaceSeconds * 1000 });
}

function beginGame() {
  S.game = makeGame(S.gameId);
  S.paused = false;
  S.noPersonSince = null;
  const guide = S.gameId === 'pose' || S.gameId === 'treasure';
  setScreen('play', { guide });
  $('#meter-acc').hidden = !guide;
  if (guide) {
    const fig = h('canvas', { class: 'figure-canvas' });
    const label = h('div', { class: 'guide-label' });
    const name = h('p', { class: 'guide-name' });
    const hint = h('p', { class: 'guide-hint' });
    clear(side).append(fig, h('div', { class: 'side-col' }, label, name, hint));
    S.ui = { fig, label, name, hint };
  } else {
    S.ui = {};
  }
}

// ------------------------------------------------------------------ 플레이

/** 대체 조작: 마우스·터치·방향키로 만든 가상 몸(화면 좌표). 카메라 없이도 플레이 가능. */
function altBody() {
  const v = visRect();
  const T = (v.y1 - v.y0) * 0.17;
  const cx = (v.x0 + v.x1) / 2;
  const chestY = v.y0 + (v.y1 - v.y0) * 0.42;
  let lean = 0;
  if (S.keys.left) lean -= 1;
  if (S.keys.right) lean += 1;
  if (S.pointer?.down && S.gameId === 'laser') lean = S.pointer.x < cx ? -1 : 1;
  const shift = lean * T * 0.45;
  const chest = { x: cx + shift * 0.7, y: chestY };
  const hand = S.pointer ? { x: S.pointer.x, y: S.pointer.y } : null;
  const up = S.keys.up;
  return {
    head: { x: cx + shift, y: chestY - T * 0.45 }, chest, hip: { x: cx, y: chestY + T }, T, shoulderW: T * 0.84,
    hands: up ? { L: { x: cx - T * 0.6, y: chestY - T * 1.3 }, R: { x: cx + T * 0.6, y: chestY - T * 1.3 } } : { L: hand, R: null },
  };
}

function updatePlay(now, obs, fresh) {
  const g = S.game;
  if (!g || S.paused) return;
  let sample;
  if (S.alt) {
    sample = { fresh: true, status: 'OK', frame: null, body: altBody(), vis: visRect(), poseScore: () => null };
  } else {
    const body = bodyNow(obs);
    const status = obs.status === 'OK' && !body ? 'TRACKING_UNCERTAIN' : obs.status;
    sample = {
      fresh, status, frame: obs.frame, body, vis: visRect(),
      poseScore: (id) => {
        if (!S.scoreCache.has(id)) S.scoreCache.set(id, evaluatePose(POSE_MAP[id], obs.frame, { minVis: S.settings.minVisibility }).score);
        return S.scoreCache.get(id);
      },
    };
    if (obs.status === 'NO_PERSON') {
      S.noPersonSince ??= now;
      if (now - S.noPersonSince > S.settings.abandonSeconds * 1000) { goTitle(); return; }
    } else S.noPersonSince = null;
  }
  g.update(now, sample);
  for (const e of g.popEvents()) S.sfx.play(e);
  renderHud(now, obs);
  if (g.done) finishGame();
}

function renderHud(now, obs) {
  const g = S.game;
  const hd = g.hud(now);
  const info = GAME_INFO[S.gameId];
  setText($('#tb-game'), `${info.ico} ${info.name}`);
  setText($('#tb-round'), hd.rounds ? `${hd.round}/${hd.rounds}` : hd.stage ? `STAGE ${hd.stage}` : '');
  setText($('#tb-lives'), hd.maxLives ? `${'❤️'.repeat(Math.max(0, hd.lives))}${'🤍'.repeat(Math.max(0, hd.maxLives - hd.lives))}` : '');
  setText($('#tb-time'), hd.timeLeftMs != null ? `⏱ ${Math.ceil(hd.timeLeftMs / 1000)}` : '');
  setText($('#val-score'), hd.score.toLocaleString('ko-KR'));
  setText($('#val-combo'), hd.combo > 1 ? `x${hd.combo}` : String(hd.combo ?? 0));
  const live = hd.live;
  const acc = $('#bar-acc');
  acc.style.width = `${live == null ? 0 : Math.round(live)}%`;
  acc.classList.toggle('hit', (hd.progress ?? 0) > 0);
  setText($('#val-acc'), live == null ? '-' : `${Math.round(live)}%`);
  const prog = hd.rounds ? (hd.round - 1) / hd.rounds : hd.timeLeftMs != null && g.duration ? 1 - hd.timeLeftMs / g.duration : 0;
  $('#bar-progress').style.width = `${Math.max(0, Math.min(1, prog)) * 100}%`;

  // 기준 자세 패널(포즈 마스터, 보물 미션)
  if (S.ui.fig) {
    const pose = hd.guidePose;
    const leftDirX = (S.settings.sourceMirrored ? -1 : 1) * (S.settings.mirrorDisplay ? -1 : 1);
    drawFigurePanel(S.ui.fig, pose, { leftDirX, t: now / 1000, dim: !pose });
    if (S.gameId === 'pose') {
      setText(S.ui.label, `라운드 ${hd.round}/${hd.rounds}${hd.attempts > 1 ? ` · 기회 ${hd.attempt}/${hd.attempts}` : ''}`);
      setText(S.ui.name, pose ? `${pose.emoji} ${pose.name}` : '');
      setText(S.ui.hint, pose ? pose.hint : '');
    } else {
      setText(S.ui.label, `${hd.round}구역 · 찾은 보물 ${hd.found}/${hd.total}`);
      setText(S.ui.name, pose ? `${pose.emoji} ${pose.name}` : hd.phase === 'SEARCH' ? '✋ 보물 찾기' : '🏯 탐험 중');
      setText(S.ui.hint, pose ? pose.hint : '반짝이는 보물에 손을 대고 잠깐 멈춰요');
    }
  }

  // 문구: 인식이 안 되면 "잠시 멈춤" 안내가 가장 우선
  const waiting = !S.alt && obs.status !== 'OK';
  centerMsg.hidden = !waiting;
  if (waiting) setText(centerMsg, statusMessage(obs.status, obs.body));
  banner.hidden = waiting || !hd.message || !!hd.popup; // 보물 발견 카드가 떠 있는 동안은 카드가 안내를 대신함
  if (!banner.hidden) { banner.className = `banner ${hd.tone}`; setText(banner, hd.message); }
  bigGrade.hidden = !hd.big;
  if (hd.big && bigGrade.textContent !== hd.big) setText(bigGrade, hd.big);
  // 보물 발견 카드
  if (hd.popup) {
    if (popupEl.dataset.id !== hd.popup.id) {
      popupEl.dataset.id = hd.popup.id;
      const c = h('canvas', { width: 160, height: 160 });
      drawTreasureIcon(c.getContext('2d'), hd.popup.icon, 80, 80, 60);
      clear(popupEl).append(c, h('div', {}, h('b', {}, `보물 발견! ${hd.popup.name}`), h('p', {}, hd.popup.desc)));
    }
    popupEl.hidden = false;
  } else { popupEl.hidden = true; popupEl.dataset.id = ''; }
}

function finishGame() {
  const g = S.game;
  const id = S.gameId;
  const res = g.result();
  S.sfx.play('finish');
  S.game = null;
  if (S.settings.countPlays && !S.settings.demoMode && !S.alt) bumpStat(id);
  stopCamera();
  setScreen('result');
  const info = GAME_INFO[id];
  const praise = ['정말 멋졌어요! 👏', '최고의 도전이었어요! 🌟', '몸으로 AI 와 함께 놀았어요! 🤖'][Math.floor(Math.random() * 3)];
  const autoEl = h('p', {});
  const codexBtn = res.codex ? h('button', { class: 'big-btn blue', onclick: () => showCodex(res) }, '📖 보물 도감 보기') : null;
  showOverlay(h('div', { class: 'card' },
    S.settings.demoMode ? h('p', { style: { color: '#ff5c9a', fontWeight: 900 } }, 'DEMO 결과 — 가상 학생 시연이에요') : null,
    h('h1', {}, `${info.ico} ${info.name} 완료!`),
    h('div', { class: 'score-big' }, res.score.toLocaleString('ko-KR')),
    h('h2', {}, praise),
    h('div', { class: 'badges' }, res.badges.map((b) => h('span', {}, b))),
    ...res.lines.map((l) => h('p', {}, l)),
    res.chips.length ? h('div', { class: 'chips' }, res.chips.map((c) => h('span', { class: c.ok ? 'ok' : '' }, `${c.text}${c.tag ? ` · ${c.tag}` : ''} ${c.ok ? '✔' : '↺'}`))) : null,
    codexBtn,
    h('div', { class: 'col-btns' },
      h('button', { class: 'big-btn', onclick: () => replay(id) }, '🔁 다시 하기'),
      h('button', { class: 'big-btn ghost', onclick: () => goTitle() }, '🎮 다른 게임 · 처음으로')),
    autoEl));
  let left = S.settings.autoReturnSeconds;
  setText(autoEl, `${left}초 뒤 처음 화면으로 돌아가요`);
  S.resultTimer = setInterval(() => {
    left -= 1;
    setText(autoEl, `${left}초 뒤 처음 화면으로 돌아가요`);
    if (left <= 0) goTitle();
  }, 1000);
}

function showCodex(res) {
  const list = h('div', { class: 'codex' }, res.codex.map((t) => {
    const c = h('canvas', { width: 120, height: 120 });
    if (t.found) drawTreasureIcon(c.getContext('2d'), t.icon, 60, 60, 45);
    return h('div', { class: t.found ? '' : 'locked' }, c, h('span', {}, h('b', {}, t.found ? t.name : '??? (아직 못 찾음)'), h('p', {}, t.found ? t.desc : '다음 탐험에서 찾아봐요!')));
  }));
  clearResultTimer();
  showOverlay(h('div', { class: 'card' }, h('h1', {}, '📖 백제 보물 도감'), list, h('p', {}, res.notice ?? ''),
    h('div', { class: 'col-btns' }, h('button', { class: 'big-btn', onclick: () => goTitle() }, '처음 화면으로'))));
}

async function replay(id) {
  clearResultTimer();
  hideOverlay();
  setScreen('title');
  buildTitle();
  if (!S.cameraOn && !S.noCamera && !(await startCamera())) return;
  chooseGame(id);
}

// ------------------------------------------------------------------ 정지·숨김·일시정지·종료

function emergencyStop() {
  if (S.screen === 'closed') return;
  closeDialog();
  clearResultTimer();
  S.game = null;
  S.countdown = null;
  S.paused = false;
  stopCamera();
  setScreen('stopped');
  showOverlay(h('div', { class: 'card' }, h('h1', {}, '⛔ 멈췄어요'), h('p', {}, '게임과 카메라가 모두 꺼졌습니다.'),
    h('button', { class: 'big-btn', onclick: () => goTitle() }, '처음 화면으로')));
}

function toggleHide(force) {
  const hide = force ?? !S.hidden;
  if (hide) emergencyStop();
  S.hidden = hide;
  $('#blackout').hidden = !hide;
}

function setPaused(p) {
  if (p === S.paused) return;
  S.paused = p;
  if (!p && S.game) {
    // 일시정지 동안 흐른 시간을 게임에 넘기지 않는다(유지 중이던 자세도 처음부터 다시)
    if ('lastNow' in S.game) S.game.lastNow = null;
    S.game.hold?.reset();
    S.game.window?.reset();
    if (S.game.clock) S.game.clock.last = null;
  }
}

function togglePause(force) {
  if (S.screen !== 'play') return;
  const p = force ?? !S.paused;
  if (p === S.paused) return;
  setPaused(p);
  if (p) {
    showOverlay(h('div', { class: 'card' }, h('h1', {}, '⏸ 일시정지'),
      h('div', { class: 'col-btns' },
        h('button', { class: 'big-btn', onclick: () => togglePause(false) }, '▶ 계속하기'),
        h('button', { class: 'big-btn ghost', onclick: () => goTitle() }, '처음 화면으로'))));
  } else hideOverlay();
}

function showExitDialog() {
  if (!dialog.hidden || S.screen === 'closed') return;
  const inGame = ['play', 'howto', 'calib'].includes(S.screen);
  const pausedHere = S.screen === 'play' && !S.paused;
  if (pausedHere) setPaused(true);
  const cancel = () => { closeDialog(); if (pausedHere) setPaused(false); };
  clear(dialog).append(h('div', { class: 'card' },
    h('h1', {}, '종료할까요?'),
    h('div', { class: 'col-btns' },
      inGame || S.screen === 'result' ? h('button', { class: 'big-btn', onclick: () => { closeDialog(); goTitle(); } }, '🏠 처음 화면으로') : null,
      h('button', { class: 'big-btn danger', onclick: () => confirmShutdown(cancel) }, '⏻ 프로그램 종료'),
      h('button', { class: 'big-btn ghost', onclick: cancel }, '취소'))));
  dialog.hidden = false;
}

function confirmShutdown(onCancel) {
  if (!S.settings.adminPinHash) { shutdownApp(); return; }
  askPin(dialog, '프로그램을 끄려면 관리자 PIN 을 입력하세요', shutdownApp, () => { closeDialog(); onCancel(); });
}

async function shutdownApp() {
  closeDialog();
  admin.close();
  clearResultTimer();
  S.game = null;
  stopCamera();
  S.engine?.close?.();
  S.engine = null;
  setScreen('closed');
  showOverlay(h('div', { class: 'card' }, h('h1', {}, '👋 프로그램을 종료했어요'), h('p', {}, '카메라가 꺼졌어요. 창이 닫히지 않으면 Alt+F4 를 눌러 주세요.'), h('p', {}, '다시 시작: START_GAME.bat')));
  // 이 PC 의 로컬 서버(START_GAME.bat)로 실행 중일 때만 서버 종료를 요청한다(웹 실행에서는 보내지 않음)
  if (IS_LOCAL) {
    try { await fetch('/__shutdown', { method: 'POST', headers: { 'X-Motion-Challenge': 'shutdown' } }); } catch { /* 무시 */ }
  }
  setTimeout(() => window.close(), 500);
}

// ------------------------------------------------------------------ 오류 화면

function showCameraError(e) {
  S.game = null;
  setScreen('error');
  const tips = e.code === 'DENIED'
    ? ['주소창 왼쪽 카메라 아이콘 → "허용"', 'Windows 설정 → 개인 정보 및 보안 → 카메라 → 카메라 액세스 켜기']
    : e.code === 'BUSY' ? ['카메라를 쓰는 다른 프로그램(화상회의 등)을 종료하세요', 'USB 카메라를 뽑았다가 다시 꽂아 보세요']
      : e.code === 'INSECURE' ? ['START_GAME.bat 으로 실행하세요(주소 http://127.0.0.1:8770)']
        : ['카메라 연결을 확인하세요', '관리자 → 카메라·설치에서 다른 카메라를 고르세요', '카메라가 없는 PC 라면 관리자 → 운영 → DEMO 모드로 동작만 확인할 수 있어요'];
  showOverlay(h('div', { class: 'card' }, h('h1', {}, '📷 카메라를 사용할 수 없어요'), h('h2', {}, e.message), h('ul', {}, tips.map((t) => h('li', {}, t))),
    h('div', { class: 'col-btns' },
      h('button', { class: 'big-btn', onclick: () => { S.noCamera = false; goTitle(); } }, '🔌 다시 연결'),
      // 카메라가 없어도 대체 조작(터치·마우스·방향키)으로 레이저·보물·우주 게임은 할 수 있다
      h('button', { class: 'big-btn blue', onclick: () => { S.noCamera = true; S.alt = true; applySettings(); goTitle(); } }, '⌨ 카메라 없이 대체 조작으로 하기'),
      h('button', { class: 'big-btn ghost', onclick: requestAdmin }, '관리자'))));
}

function showEngineError(e) {
  S.engine?.close?.();
  S.engine = null;
  stopCamera();
  setScreen('error');
  const missing = e.missing?.length ? `누락/손상 파일:\n${e.missing.map((m) => `  - ${m}`).join('\n')}` : '';
  showOverlay(h('div', { class: 'card' }, h('h1', {}, '🤖 AI 인식을 시작하지 못했어요'), h('p', {}, '선생님께 알려 주세요.'),
    h('pre', { class: 'err-list' }, `${e.message}\n${missing}`.trim()),
    h('div', { class: 'col-btns' }, h('button', { class: 'big-btn', onclick: async () => { showBoot(); if (await startEngine()) goTitle(); } }, '다시 시도'), h('button', { class: 'big-btn ghost', onclick: requestAdmin }, '관리자'))));
}

function showBoot() {
  setScreen('boot');
  showOverlay(h('div', { class: 'card' }, h('div', { class: 'spinner' }), h('h2', {}, 'AI 연구소를 준비하고 있어요...'), h('p', {}, '처음 실행할 때는 몇 초 걸릴 수 있어요.')));
}

// ------------------------------------------------------------------ 관리자

async function updateSettings(patch) {
  const prev = S.settings;
  S.settings = { ...prev, ...patch };
  saveSettings(S.settings);
  applySettings();
  const changed = Object.keys(patch).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(S.settings[k]));
  if (changed.includes('demoMode')) { stopCamera(); S.demo = null; await startEngine(); await goTitle(); return; }
  if (changed.some((k) => ['cameraDeviceId', 'resolution'].includes(k)) && S.cameraOn) { stopCamera(); await startCamera(); }
  if (changed.some((k) => ['modelVariant', 'delegate', 'detectMultiple'].includes(k))) await startEngine();
  if (changed.includes('hours') && S.screen === 'title' && !withinHours(S.settings.hours)) showHours();
}

function treasureList() {
  const zones = Object.fromEntries(S.content.zones.map((z) => [z.id, z.name]));
  return S.content.treasures.map((t) => ({ ...t, zoneName: zones[t.zone] }));
}

async function loadContent() {
  let base;
  try {
    base = await (await fetch('assets/content/treasures.json', { cache: 'no-cache' })).json();
  } catch (e) {
    logError('content', e.message);
    base = { notice: '', zones: [{ id: 'palace', name: '사비 궁궐 터', intro: '' }, { id: 'temple', name: '절 마을', intro: '' }, { id: 'fortress', name: '산성 숲길', intro: '' }], treasures: [] };
  }
  S.baseContent = base;
  const edits = loadTreasureEdits();
  S.content = { ...base, treasures: base.treasures.map((t) => ({ ...t, ...(edits[t.id] ?? {}) })) };
}

async function runDiagnostics() {
  const rows = [];
  const head = async (p) => { try { return (await fetch(p, { method: 'HEAD', cache: 'no-cache' })).ok; } catch { return false; } };
  rows.push(IS_LOCAL
    ? { name: '실행 방식', ok: true, detail: `이 PC 전용 로컬 서버(${location.host})` }
    : { name: '실행 방식', ok: false, warn: true, detail: `웹(${location.host})에서 실행 중 — 인터넷이 필요합니다. 학교 부스 운영은 START_GAME.bat(오프라인)을 쓰세요` });
  rows.push({ name: '인터넷 연결(게임에는 필요 없음)', ok: true, detail: navigator.onLine ? '연결됨 — 끊고 다시 점검해 보세요' : '끊김 — 오프라인 운영 상태' });
  for (const f of ['vendor/mediapipe/vision_bundle.mjs', ...WASM_FILES.map((x) => `${WASM_DIR}/${x}`), MODEL_PATHS.lite, 'fonts/PretendardVariable.woff2', 'assets/content/treasures.json']) {
    const ok = await head(f);
    rows.push({ name: f, ok, detail: ok ? '' : '파일 없음' });
  }
  const cams = await Camera.listDevices();
  rows.push({ name: '연결된 카메라', ok: cams.length > 0 || S.settings.demoMode, warn: !cams.length, detail: `${cams.length}대${S.settings.demoMode ? ' (DEMO 모드)' : ''}` });
  rows.push({ name: 'AI 엔진', ok: !!S.engine, detail: S.engine ? `${S.engine.info.version} · ${S.engine.info.modelVariant} · ${S.engine.info.delegate}` : '정지' });
  if (S.light) rows.push({ name: '밝기·역광', ok: !S.light.dark && !S.light.backlit, warn: true, detail: `평균 밝기 ${Math.round(S.light.mean)}${S.light.personMean ? ` · 사람 ${Math.round(S.light.personMean)}` : ''}${S.light.dark ? ' — 어두움' : S.light.backlit ? ' — 역광' : ''}` });
  return rows;
}

function diagText() {
  const now = performance.now();
  const fps = S.perf.infer.filter((t) => now - t < 2000).length / 2;
  const ms = S.perf.inferMs.length ? S.perf.inferMs.reduce((a, b) => a + b, 0) / S.perf.inferMs.length : 0;
  const ok = S.perf.status.length ? (S.perf.status.filter((x) => x.ok).length / S.perf.status.length) * 100 : 0;
  const lines = [
    `AI 추론 ${fps.toFixed(1)} FPS · ${ms.toFixed(0)} ms (${S.engine ? `${S.engine.info.modelVariant}/${S.engine.info.delegate}` : '정지'})`,
    `상태 ${S.obs.status} · 인원 ${S.obs.persons ?? 0} · 인식률(10초) ${ok.toFixed(0)}%`,
    `밝기 ${S.light ? Math.round(S.light.mean) : '-'}${S.light?.backlit ? ' (역광)' : ''}${S.light?.dark ? ' (어두움)' : ''} · 회전 ${S.settings.rotation}°`,
  ];
  if (S.cameraOn && S.engine && fps > 0 && fps < 10 && S.perf.status.length > 30) lines.push('⚠ 인식 속도 10FPS 미만 → 인식 탭 "성능 모드"');
  return lines.join('\n');
}

const admin = createAdmin($('#admin'), {
  getSettings: () => S.settings,
  update: (p) => updateSettings(p),
  listCameras: () => Camera.listDevices(),
  getDiag: diagText,
  runDiagnostics,
  treasures: treasureList,
  actions: {
    stop: () => { admin.close(); emergencyStop(); },
    hide: () => { admin.close(); toggleHide(true); },
    reconnect: async () => { admin.close(); stopCamera(); await goTitle(); },
    fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}),
    resetSettings: () => { S.settings = resetSettings(); applySettings(); },
    resetStats,
    stats: loadStats,
    errors: loadErrors,
    clearErrors,
    setPin: async (pin) => updateSettings({ adminPinHash: pin ? await hashPin(pin) : '' }),
    editTreasure: (id, patch) => {
      const edits = loadTreasureEdits();
      if (patch) edits[id] = patch; else delete edits[id];
      saveTreasureEdits(edits);
      S.content = { ...S.baseContent, treasures: S.baseContent.treasures.map((t) => ({ ...t, ...(edits[t.id] ?? {}) })) };
    },
    close: () => admin.close(),
  },
});

function askPin(root, title, onOk, onCancel) {
  let entered = '';
  const dots = h('div', { class: 'pin-dots' });
  const msg = h('p', { class: 'adm-note' }, title);
  const press = async (k) => {
    if (k === '취소') { onCancel(); return; }
    if (k === '←') entered = entered.slice(0, -1); else if (entered.length < 8) entered += k;
    dots.textContent = '•'.repeat(entered.length);
    if (entered.length >= 4 && (await hashPin(entered)) === S.settings.adminPinHash) { clear(root); onOk(); }
    else if (entered.length === 8) { entered = ''; dots.textContent = ''; msg.textContent = 'PIN 이 맞지 않아요'; }
  };
  clear(root).append(h('div', { class: 'adm-body card', style: { alignItems: 'center', justifyContent: 'center' } },
    h('h2', {}, '⚙ 관리자 확인'), msg, dots,
    h('div', { class: 'pin-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '취소'].map((k) => h('button', { onclick: () => press(k) }, k)))));
  root.hidden = false;
}

function requestAdmin() {
  if (admin.isOpen) return;
  togglePause(true);
  if (!S.settings.adminPinHash) { admin.open(); return; }
  const root = $('#admin');
  askPin(root, '관리자 PIN 을 입력하세요', () => admin.open(), () => { root.hidden = true; clear(root); });
}

// ------------------------------------------------------------------ 입력

(() => {
  const gear = $('#btn-gear');
  let timer = null;
  const cancel = () => { clearTimeout(timer); gear.classList.remove('pressing'); };
  gear.addEventListener('pointerdown', () => { gear.classList.add('pressing'); timer = setTimeout(() => { cancel(); requestAdmin(); }, 1500); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) gear.addEventListener(ev, cancel);
  gear.addEventListener('contextmenu', (e) => e.preventDefault());
})();
$('#btn-exit').addEventListener('click', showExitDialog);
$('#btn-pause').addEventListener('click', () => togglePause());

// 대체 조작: 화면 터치·마우스 위치 = 손, 누르고 있는 쪽 = 레이저 기울이기
for (const ev of ['pointerdown', 'pointermove']) {
  canvas.addEventListener(ev, (e) => {
    if (!S.alt || S.screen !== 'play') return;
    const p = clientToCanvas(e.clientX, e.clientY);
    S.pointer = { ...p, down: e.buttons > 0 || ev === 'pointerdown' };
  });
}
canvas.addEventListener('pointerup', () => { if (S.pointer) S.pointer.down = false; });
canvas.addEventListener('pointerleave', () => { if (S.alt) S.pointer = null; });

const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up' };
document.addEventListener('keyup', (e) => { if (KEYMAP[e.key]) S.keys[KEYMAP[e.key]] = false; });
document.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) && e.key !== 'Escape') return;
  if (KEYMAP[e.key]) { S.keys[KEYMAP[e.key]] = true; if (S.alt) e.preventDefault(); }
  if (e.key === 'Escape') { e.preventDefault(); admin.close(); emergencyStop(); return; }
  if (e.key === 'F2' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a')) { e.preventDefault(); requestAdmin(); return; }
  if (e.key.toLowerCase() === 'h') { toggleHide(); return; }
  if (S.hidden || admin.isOpen || !dialog.hidden || S.screen === 'closed') return;
  if (e.key.toLowerCase() === 'p') { togglePause(); return; }
  if (S.screen === 'title' && overlay.hidden) {
    const g = visibleGames()[Number(e.key) - 1];
    if (g) chooseGame(g);
  }
  if (S.screen === 'howto' && (e.key === 'Enter' || e.key === ' ')) startCountdown();
});

// ------------------------------------------------------------------ 메인 루프

let lastLoop = 0;
let lastDiag = 0;
let lastHoursCheck = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = lastLoop ? Math.min(0.1, (now - lastLoop) / 1000) : 0;
  lastLoop = now;
  const fresh = maybeInfer(now, dt);
  const obs = currentObs(now);

  if (S.screen === 'title') updateTitle(now, obs);
  else if (S.screen === 'calib') updateCalib(now, obs);
  else if (S.screen === 'howto') updateCountdown(now);
  else if (S.screen === 'play') updatePlay(now, obs, fresh);

  if (LIVE.includes(S.screen) || S.screen === 'result') {
    const st = S.settings;
    const showSk = st.showSkeleton === 'always' || (st.showSkeleton === 'intro' && (S.screen === 'title' || S.screen === 'calib'));
    const src = S.cameraOn && S.source.ready ? S.source.grab() : null;
    const recent = obs.frame && now - obs.t < 600 && obs.status !== 'NO_PERSON';
    const ctx = drawCamera(canvas, src, {
      cameraOn: S.cameraOn && LIVE.includes(S.screen), mirror: st.mirrorDisplay, frame: recent ? obs.frame : null,
      skeleton: showSk, minVis: st.minVisibility, skeletonColor: obs.status === 'OK' ? '#2fe0d0' : '#ffb347',
      dim: S.screen === 'title' ? 0.15 : 0,
    });
    const fit = effectiveFit();
    if (app.dataset.fit !== fit) app.dataset.fit = fit;
    const view = { W: canvas.width, H: canvas.height, vis: visRect(), effects: st.effects };
    if (S.screen === 'play' && S.game) S.game.draw(ctx, now, view);
    if (S.screen === 'calib' || admin.isOpen) {
      const box = obs.frame ? personBox(obs.frame) : null;
      const W = canvas.width;
      const bx = box ? { x0: (st.mirrorDisplay ? 1 - box.x1 : box.x0) * W, x1: (st.mirrorDisplay ? 1 - box.x0 : box.x1) * W, y0: box.y0 * canvas.height, y1: box.y1 * canvas.height } : null;
      drawGuides(ctx, W, canvas.height, view.vis, bx, obs.status === 'OK');
    }
  }
  const showDiag = (admin.isOpen || S.settings.showDiagnostics) && LIVE.includes(S.screen);
  diagEl.hidden = !showDiag;
  if (now - lastDiag > 300) {
    lastDiag = now;
    if (showDiag) diagEl.textContent = diagText();
    admin.tick();
  }
  if (now - lastHoursCheck > 30000) {
    lastHoursCheck = now;
    const inside = withinHours(S.settings.hours);
    if (!inside && S.screen === 'title') showHours();
    else if (inside && S.screen === 'hours') goTitle();
  }
}

// ------------------------------------------------------------------ 시작

async function boot() {
  applySettings();
  showBoot();
  await loadContent();
  requestAnimationFrame(loop);
  if (await startEngine()) await goTitle();
}

window.addEventListener('beforeunload', () => S.camera.stop());
window.addEventListener('error', (e) => logError('script', e.message));
window.addEventListener('unhandledrejection', (e) => logError('promise', String(e.reason?.message ?? e.reason)));
boot();

// 검수용 읽기 전용 상태 노출(판정에 영향 없음)
window.__motion = { state: S, diag: diagText };
