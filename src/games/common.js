// 게임 공통: 인식될 때만 흐르는 게임 시계, 효과음 이벤트, 화면 문구.
//
// 모든 게임은 같은 인터페이스를 따른다(카메라·화면과 분리되어 가상 입력으로 테스트 가능).
//   update(now, sample)   sample = { fresh, status, frame, body, poseScore(id) }
//      status: 'OK' | 'NO_PERSON' | 'PARTIAL_BODY' | 'MULTI_PERSON' | 'TRACKING_UNCERTAIN'
//      body: bodyInfo() — 화면(캔버스) 좌표의 머리·가슴·골반·손, 몸통 길이 T
//      poseScore(id): 해당 자세 유사도 0~100 또는 null(인식 불확실)
//   draw(ctx, now, view)  view = { W, H, vis:{x0,y0,x1,y1} 캔버스 픽셀, effects }
//   hud()                 { score, combo, lives, maxLives, timeLeftMs, round, rounds, message, tone, big, guidePose }
//   popEvents()           효과음 이름 목록
//   done / result()

/** 인식이 될 때만 흐르는 시계. 인식이 끊겨도 grace 동안은 흐르게 해 깜빡임에 둔감하게 한다. */
export class GameClock {
  constructor(graceMs = 250) {
    this.ms = 0;
    this.last = null;
    this.lastOk = -Infinity;
    this.grace = graceMs;
  }

  tick(now, tracking) {
    if (tracking) this.lastOk = now;
    const running = now - this.lastOk <= this.grace;
    if (this.last != null && running) this.ms += Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    this.running = running;
    return running;
  }
}

export class Events {
  constructor() { this.list = []; }
  push(e) { this.list.push(e); }
  pop() { const l = this.list; this.list = []; return l; }
}

export const ENCOURAGE = [
  '좋아요! 몸이 가벼워요!', '멋져요! 계속해 봐요!', '천천히 해도 괜찮아요!', '와, 집중력 최고!', '포기하지 않는 게 제일 멋져요!',
];

export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/** 0~1 사이로 자르기 */
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
