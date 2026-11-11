// 교사용 관리자 화면(오른쪽 서랍). 열려 있는 동안 카메라 화면에 설치 점검 기준선이 표시된다.

import { h, clear } from '../core/dom.js';
import { GAMES } from '../core/settings.js';
import { POSE_DIFFICULTY } from '../games/poseMaster.js';

const TABS = [['camera', '카메라·설치'], ['ai', '인식'], ['games', '게임'], ['ops', '운영'], ['codex', '도감'], ['diag', '진단·기록']];
const GAME_NAMES = { pose: '🧍 포즈 마스터', laser: '🔴 레이저 탈출', treasure: '🏯 백제 보물 탐험대', space: '🚀 우주 수호대' };
const DIFF = Object.entries(POSE_DIFFICULTY).map(([k, d]) => [k, d.label]);

export function createAdmin(root, api) {
  let tab = 'camera';
  let liveEl = null;
  const S = () => api.getSettings();

  const field = (label, control, help) => h('div', { class: 'field' }, h('label', {}, label), control, help ? h('small', {}, help) : null);
  const getPath = (path) => path.split('.').reduce((o, k) => o?.[k], S());
  const patchFor = (path, value) => {
    const keys = path.split('.');
    if (keys.length === 1) return { [path]: value };
    return { [keys[0]]: { ...S()[keys[0]], [keys[1]]: value } };
  };
  const select = (path, options) => h('select', {
    onchange: (e) => api.update(patchFor(path, typeof getPath(path) === 'number' ? Number(e.target.value) : e.target.value)),
  }, options.map(([v, t]) => h('option', { value: String(v), selected: String(getPath(path)) === String(v) }, t)));
  const checkbox = (path) => h('input', { type: 'checkbox', checked: !!getPath(path), onchange: (e) => api.update(patchFor(path, e.target.checked)) });
  const number = (path, min, max, step = 1) => h('input', {
    type: 'number', min, max, step, value: getPath(path),
    onchange: (e) => { const v = Math.min(max, Math.max(min, Number(e.target.value))); e.target.value = v; api.update(patchFor(path, v)); },
  });
  const range = (path, min, max, step, fmt) => {
    const out = h('span', {}, fmt(getPath(path)));
    return h('span', {}, h('input', { type: 'range', min, max, step, value: getPath(path), oninput: (e) => { out.textContent = fmt(Number(e.target.value)); api.update(patchFor(path, Number(e.target.value))); } }), ' ', out);
  };
  const timeInput = (path) => h('input', { type: 'time', value: getPath(path), onchange: (e) => api.update(patchFor(path, e.target.value)) });

  const builders = {
    async camera() {
      const cams = await api.listCameras();
      return [
        h('div', { class: 'adm-section' }, '카메라'),
        field('카메라 장치', select('cameraDeviceId', [['', '기본 카메라'], ...cams.map((c) => [c.deviceId, c.label])]), '부스 상단 카메라가 연결되지 않으면 USB 웹캠을 꽂고 여기서 고르세요.'),
        field('해상도', select('resolution', [['640x480', '640x480 (가벼움)'], ['1280x720', '1280x720 (권장)'], ['1920x1080', '1920x1080']])),
        field('영상 회전', select('rotation', [[0, '0° (그대로)'], [90, '90° 오른쪽'], [180, '180°'], [270, '270° (90° 왼쪽)']]), '카메라를 옆으로 돌려 설치했다면 사람이 똑바로 보이도록 맞추세요.'),
        field('거울처럼 보이기', checkbox('mirrorDisplay'), '표시만 반전합니다. 판정의 왼쪽/오른쪽은 항상 학생 본인 기준입니다.'),
        field('카메라가 이미 반전된 영상을 보냄', checkbox('sourceMirrored'), '"왼팔"을 들었는데 오른팔로 판정되면 켜세요.'),
        field('화면 비율', select('layout', [['portrait', '9:16 세로 (부스)'], ['landscape', '16:9 가로']])),
        field('영상 맞춤', select('videoFit', [['cover', '꽉 채우기(양옆 잘림)'], ['contain', '전체 보기(여백)']]), '잘려서 안 보이는 곳에 선 학생은 판정하지 않고 가운데로 안내합니다.'),
        h('div', { class: 'row-btns' },
          h('button', { class: 'small-btn', onclick: () => api.actions.reconnect() }, '🔌 카메라 다시 연결'),
          h('button', { class: 'small-btn', onclick: () => api.actions.fullscreen() }, '⛶ 전체 화면')),
        h('p', { class: 'adm-note' }, '설치 점검: 관리자 창이 열려 있는 동안 화면에 기준선이 표시됩니다. 학생의 머리와 발이 점선 사이, 상자가 초록색이면 알맞습니다. 손끝이 잘리지 않는지 두 팔을 벌려 확인하세요. 밝기/역광은 [진단·기록] 탭에서 확인합니다.'),
      ];
    },
    ai() {
      return [
        h('div', { class: 'adm-section' }, 'AI 동작 인식'),
        field('모델', select('modelVariant', [['lite', 'Lite (빠름, 권장)'], ['full', 'Full (정확, 무거움)']])),
        field('연산 장치', select('delegate', [['GPU', 'GPU'], ['CPU', 'CPU']]), 'GPU 가 안 되면 자동으로 CPU 를 씁니다.'),
        field('여러 사람 감지(2명 이상이면 멈춤)', checkbox('detectMultiple')),
        field('최대 추론 속도(FPS)', select('maxInferenceFps', [[15, '15'], [20, '20'], [30, '30']])),
        field('판정 민감도(관절 신뢰도)', range('minVisibility', 0.3, 0.8, 0.05, (v) => v.toFixed(2)), '낮추면 가려진 관절도 사용(오판 가능), 높이면 엄격해집니다.'),
        field('관절선 표시', select('showSkeleton', [['intro', '안내·점검 화면에서만(기본)'], ['always', '게임 중에도 표시'], ['never', '표시 안 함']])),
        h('button', { class: 'small-btn', onclick: () => api.update({ resolution: '640x480', modelVariant: 'lite', maxInferenceFps: 20 }) }, '⚡ 저사양 PC 성능 모드'),
      ];
    },
    games() {
      return [
        h('div', { class: 'adm-section' }, '게임별 난이도 · 숨기기'),
        ...GAMES.map((g) => h('div', { class: 'field' }, h('label', {}, GAME_NAMES[g]),
          h('span', {}, select(`difficulty.${g}`, DIFF), ' 숨기기 ', checkbox(`hidden.${g}`)))),
        h('div', { class: 'adm-section' }, '🧍 포즈 마스터'),
        field('라운드 수', number('poseRounds', 3, 10)),
        field('자세 유지 시간(초)', number('poseHoldSeconds', 0.5, 3, 0.1), '이 시간 동안 자세를 유지하면 성공(초기값 1초).'),
        field('라운드 제한 시간(초)', number('poseStepSeconds', 4, 20), '인식되는 동안에만 줄어듭니다.'),
        h('div', { class: 'adm-section' }, '🔴 레이저 탈출 · 🚀 우주 수호대'),
        field('레이저 탈출 시간(초)', number('laserSeconds', 30, 180)),
        field('우주 수호대 시간(초)', number('spaceSeconds', 30, 180)),
        h('div', { class: 'adm-section' }, '🏯 백제 보물 탐험대'),
        field('보물 위에 손 머무는 시간(초)', number('treasureDwellSeconds', 0.3, 3, 0.1), '초기값 0.7초.'),
        field('최대 탐험 시간(초)', number('treasureLimitSeconds', 60, 600)),
      ];
    },
    ops() {
      const stats = api.actions.stats();
      const pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: '숫자 4~8자리' });
      const pinMsg = h('span', { class: 'adm-note' });
      return [
        h('div', { class: 'adm-section' }, '소리 · 화면'),
        field('음량', range('volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)),
        field('효과음', checkbox('sfx'), '끄면 무음 모드로 운영합니다.'),
        field('화면 효과', select('effects', [['normal', '보통'], ['low', '최소(움직임 줄이기)']]), '번쩍이는 섬광 효과는 어떤 설정에서도 쓰지 않습니다.'),
        field('진단 정보 항상 표시', checkbox('showDiagnostics')),
        h('div', { class: 'adm-section' }, '진행'),
        field('앉아서 하기를 기본으로', checkbox('seatedDefault'), '앉아서 하기 모드는 팔 중심 판정이며, 기울이기·허리 자세는 나오지 않습니다.'),
        field('캘리브레이션 통과 후 시작까지(초)', number('calibrationHoldSeconds', 0.5, 5, 0.5)),
        field('결과 화면 → 처음 화면(초)', number('autoReturnSeconds', 5, 120)),
        field('사람이 없으면 처음 화면으로(초)', number('abandonSeconds', 5, 120)),
        h('div', { class: 'adm-section' }, '운영 시간'),
        field('운영 시간 사용', checkbox('hours.enabled'), '시간 밖에는 "운영 시간이 아니에요" 화면을 보이고 카메라를 끕니다.'),
        field('시작', timeInput('hours.start')),
        field('종료', timeInput('hours.end')),
        h('div', { class: 'adm-section' }, '관리자 PIN'),
        h('div', { class: 'row-btns' }, pin,
          h('button', { class: 'small-btn', onclick: async () => { if (!/^\d{4,8}$/.test(pin.value)) { pinMsg.textContent = '숫자 4~8자리'; return; } await api.actions.setPin(pin.value); pin.value = ''; pinMsg.textContent = '저장했습니다.'; } }, 'PIN 저장'),
          h('button', { class: 'small-btn', onclick: async () => { await api.actions.setPin(''); pinMsg.textContent = '해제했습니다.'; } }, 'PIN 해제')),
        pinMsg,
        h('p', { class: 'adm-note' }, S().adminPinHash ? 'PIN 이 설정되어 있습니다(해시로만 저장).' : 'PIN 없음: ⚙ 길게 누르기 / F2 로 열립니다.'),
        h('div', { class: 'adm-section' }, '익명 이용 횟수(게임별 합계만)'),
        field('이용 횟수 세기', checkbox('countPlays'), '이름·학년·얼굴 없이 게임별 횟수만 저장. 기본 꺼짐.'),
        h('p', { class: 'adm-note' }, GAMES.map((g) => `${GAME_NAMES[g]}: ${stats[g] ?? 0}회`).join(' · ')),
        h('div', { class: 'row-btns' },
          h('button', { class: 'small-btn', onclick: () => { api.actions.resetStats(); render(); } }, '횟수 초기화'),
          h('button', { class: 'small-btn', onclick: () => { if (confirm('설정을 모두 기본값으로 되돌릴까요? (PIN 포함)')) { api.actions.resetSettings(); render(); } } }, '설정 초기화')),
        h('div', { class: 'adm-section' }, 'DEMO 모드'),
        field('DEMO 모드(카메라 없는 PC 동작 확인용)', checkbox('demoMode'), '가상 학생이 플레이합니다. 화면에 DEMO 가 표시되며 실제 판정 검증이 아닙니다.'),
        h('div', { class: 'adm-section' }, '단축키'),
        h('p', { class: 'adm-note', style: { whiteSpace: 'pre-line' } }, 'Esc: 즉시 정지 · H: 화면 숨기기 · P: 일시정지\nF2 / Ctrl+Shift+A: 관리자 · 1~4: 게임 선택(처음 화면) · F11: 전체 화면'),
      ];
    },
    codex() {
      const items = api.treasures();
      return [
        h('div', { class: 'adm-section' }, '보물 도감 설명 고치기'),
        h('p', { class: 'adm-note' }, '학생에게 보이는 이름과 설명을 고칠 수 있습니다(이 PC 에 저장). 사실 확인이 된 내용만 적어 주세요.'),
        ...items.map((t) => {
          const name = h('input', { type: 'text', value: t.name, style: { width: '100%' } });
          const desc = h('textarea', { rows: 3, style: { width: '100%' } }, t.desc);
          return h('div', { class: 'codex-edit' },
            h('small', {}, `${t.zoneName} · ${t.id}`), name, desc,
            h('div', { class: 'row-btns' },
              h('button', { class: 'small-btn', onclick: () => { api.actions.editTreasure(t.id, { name: name.value.trim(), desc: desc.value.trim() }); } }, '저장'),
              h('button', { class: 'small-btn', onclick: () => { api.actions.editTreasure(t.id, null); render(); } }, '원래대로')));
        }),
      ];
    },
    async diag() {
      liveEl = h('pre', { class: 'adm-note', style: { whiteSpace: 'pre-wrap', fontFamily: 'Consolas, monospace' } });
      const table = h('div', {}, '점검 중...');
      api.runDiagnostics().then((rows) => {
        clear(table).append(h('table', { class: 'adm-table' }, rows.map((r) => h('tr', {},
          h('td', {}, r.name), h('td', { class: r.ok ? 'ok-t' : r.warn ? 'warn-t' : 'bad-t' }, r.ok ? '정상' : r.warn ? '주의' : '문제'), h('td', {}, r.detail)))));
      });
      const errs = api.actions.errors();
      return [
        h('div', { class: 'adm-section' }, '실시간 상태'), liveEl,
        h('div', { class: 'adm-section' }, '자체 진단'), table,
        h('div', { class: 'row-btns' },
          h('button', { class: 'small-btn', onclick: render }, '🔄 다시 점검'),
          h('button', { class: 'small-btn', onclick: () => window.open('tests.html', '_blank') }, '🧪 판정 로직 테스트')),
        h('div', { class: 'adm-section' }, `운영 오류 기록 (${errs.length}건, 개인정보 없음)`),
        h('pre', { class: 'adm-note', style: { whiteSpace: 'pre-wrap', maxHeight: '160px', overflow: 'auto' } }, errs.slice(-15).map((e) => `${e.at} [${e.where}] ${e.message}`).join('\n') || '없음'),
        h('button', { class: 'small-btn', onclick: () => { api.actions.clearErrors(); render(); } }, '기록 지우기'),
      ];
    },
  };

  async function render() {
    clear(root);
    const body = h('div', { class: 'adm-body' });
    root.append(
      h('div', { class: 'adm-head' }, h('h2', {}, '⚙ 교사용 관리자'), h('button', { class: 'small-btn', onclick: () => api.actions.close() }, '닫기 ✕')),
      h('div', { class: 'adm-quick' },
        h('button', { class: 'danger', onclick: () => api.actions.stop() }, '⛔ 즉시 정지'),
        h('button', { onclick: () => api.actions.hide() }, '⬛ 화면 숨기기')),
      h('div', { class: 'adm-tabs' }, TABS.map(([k, t]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; render(); } }, t))),
      body,
    );
    liveEl = null;
    body.append(...(await builders[tab]()));
  }

  return {
    open() { root.hidden = false; render(); },
    close() { root.hidden = true; clear(root); liveEl = null; },
    get isOpen() { return !root.hidden; },
    tick() { if (liveEl) liveEl.textContent = api.getDiag(); },
  };
}
