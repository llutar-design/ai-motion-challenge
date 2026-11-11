// 게임 1: AI 포즈 마스터 — 목표 자세를 일정 시간 유지하면 성공. PERFECT/GREAT/GOOD 등급.
// 제한 시간은 인식되는 동안에만 줄어든다(인식 실패는 불이익 없음). 실패해도 재도전 기회.

import { POSE_MAP, gradeFor } from '../pose/poses.js';
import { ScoreWindow, HoldTracker } from '../pose/temporal.js';
import { pickSequence } from '../core/random.js';
import { Events, ENCOURAGE, pick } from './common.js';

export const POSE_DIFFICULTY = {
  easy: { label: '쉬움', threshold: 65 },
  normal: { label: '보통', threshold: 72 },
  hard: { label: '도전', threshold: 80 },
};

const FEEDBACK_MS = 1600;
const GRADE_POINTS = { PERFECT: 300, GREAT: 200, GOOD: 100 };

export class PoseMaster {
  constructor({ poseIds, rounds = 5, difficulty = 'normal', holdMs = 1000, stepMs = 8000, attempts = 2, windowMs = 400, rng = Math.random }) {
    this.diff = POSE_DIFFICULTY[difficulty] ?? POSE_DIFFICULTY.normal;
    this.sequence = pickSequence(poseIds, rounds, rng);
    this.holdMs = holdMs;
    this.stepMs = stepMs;
    this.attempts = Math.max(1, attempts);
    this.window = new ScoreWindow(windowMs);
    this.rng = rng;
    this.events = new Events();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.results = [];
    this.index = 0;
    this.phase = 'ACTIVE';
    this.lastNow = null;
    this._begin(1);
  }

  get def() { return POSE_MAP[this.sequence[this.index]]; }
  get nextDef() { return POSE_MAP[this.sequence[this.index + 1]] ?? null; }
  get done() { return this.phase === 'DONE'; }

  _begin(attempt) {
    this.attempt = attempt;
    this.remaining = this.stepMs;
    this.window.reset();
    this.hold = new HoldTracker({ threshold: this.diff.threshold + (this.def?.thresholdOffset ?? 0), holdMs: this.holdMs });
    this.tracking = false;
    this.live = null;
    this.progress = 0;
    this.judge = 'MATCHING';
  }

  update(now, s) {
    const dt = this.lastNow == null ? 0 : Math.max(0, now - this.lastNow);
    this.lastNow = now;
    if (this.phase === 'DONE') return;
    if (this.phase === 'FEEDBACK') {
      if (now >= this.feedbackUntil) this._afterFeedback();
      return;
    }
    if (s.fresh) {
      const score = s.status === 'OK' ? s.poseScore(this.def.id) : null;
      this.window.push(now, s.status === 'OK' ? score : null);
      const st = this.window.stats();
      this.live = st.mean;
      if (s.status !== 'OK' || st.mean == null) {
        this.tracking = false;
        this.judge = s.status !== 'OK' ? s.status : 'TRACKING_UNCERTAIN';
        this.hold.update(now, null);
      } else {
        this.tracking = true;
        this.judge = 'MATCHING';
        const h = this.hold.update(now, st.mean);
        this.progress = h.progress;
        if (h.done) { this._success(now); return; }
      }
    }
    if (this.tracking) this.remaining -= dt;
    if (this.remaining <= 0) this._miss(now);
  }

  _success(now) {
    const { poseScore } = this.hold.summary();
    const grade = gradeFor(poseScore);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const pts = GRADE_POINTS[grade] + Math.min(this.combo - 1, 4) * 50;
    this.score += pts;
    this.results.push({ poseId: this.def.id, result: 'SUCCESS', grade, poseScore, points: pts });
    this.events.push(grade === 'PERFECT' ? 'perfect' : 'success');
    this.phase = 'FEEDBACK';
    this.feedback = { kind: 'SUCCESS', grade, points: pts };
    this.feedbackUntil = now + FEEDBACK_MS;
  }

  _miss(now) {
    this.combo = 0;
    this.events.push('retry');
    const last = this.attempt >= this.attempts;
    if (last) this.results.push({ poseId: this.def.id, result: 'MISS' });
    this.phase = 'FEEDBACK';
    this.feedback = { kind: 'RETRY', last, cheer: pick(ENCOURAGE, this.rng) };
    this.feedbackUntil = now + FEEDBACK_MS;
  }

  _afterFeedback() {
    const retry = this.feedback.kind === 'RETRY' && !this.feedback.last;
    this.feedback = null;
    this.phase = 'ACTIVE';
    if (retry) { this._begin(this.attempt + 1); return; }
    this.index += 1;
    if (this.index >= this.sequence.length) { this.phase = 'DONE'; return; }
    this._begin(1);
  }

  popEvents() { return this.events.pop(); }

  hud() {
    const fb = this.feedback;
    let message;
    let tone = 'info';
    let big = null;
    if (fb?.kind === 'SUCCESS') { message = `성공! +${fb.points}`; tone = 'ok'; big = fb.grade; }
    else if (fb?.kind === 'RETRY') { message = fb.last ? `괜찮아요! 다음 자세로 가요 · ${fb.cheer}` : `아쉬워요! 한 번 더! · ${fb.cheer}`; tone = 'warn'; }
    else if (this.judge === 'TRACKING_UNCERTAIN') { message = '팔과 몸이 잘 보이게 조금 뒤로 가 주세요'; tone = 'wait'; }
    else if (this.judge !== 'MATCHING') { message = null; tone = 'wait'; }
    else if (this.progress > 0) { message = '좋아요! 그대로 멈춰요!'; tone = 'ok'; }
    else message = '화면의 자세를 따라 해 보세요!';
    return {
      score: this.score, combo: this.combo, round: Math.min(this.index + 1, this.sequence.length), rounds: this.sequence.length,
      attempt: this.attempt, attempts: this.attempts, timeLeftMs: Math.max(0, this.remaining),
      message, tone, big, live: this.live, progress: this.progress, judge: this.judge,
      guidePose: this.def ?? null, nextPose: this.nextDef,
    };
  }

  draw() { /* 목표 자세는 측면 패널(스틱맨)에 그린다 */ }

  result() {
    const succ = this.results.filter((r) => r.result === 'SUCCESS');
    const perfect = succ.filter((r) => r.grade === 'PERFECT').length;
    const badges = [];
    if (succ.length === this.sequence.length) badges.push('🏅 모든 자세 성공');
    if (perfect >= 3) badges.push('🌟 PERFECT 장인');
    if (this.maxCombo >= 3) badges.push(`🔥 ${this.maxCombo}콤보`);
    if (!badges.length) badges.push('💪 끝까지 도전');
    return {
      score: this.score,
      lines: [`성공한 자세 ${succ.length} / ${this.sequence.length}`, `PERFECT ${perfect}개 · 최고 콤보 ${this.maxCombo}`],
      badges,
      chips: this.results.map((r) => ({ text: `${POSE_MAP[r.poseId].emoji} ${POSE_MAP[r.poseId].name}`, ok: r.result === 'SUCCESS', tag: r.grade ?? '' })),
    };
  }
}
