// MediaPipe Pose Landmarker 초기화(모든 파일을 프로젝트 로컬 폴더에서 로드, CDN 사용 안 함).
// 버전 고정: @mediapipe/tasks-vision 0.10.35 — 1.x 버전에는 원격 사용 통계 전송 코드가 포함되어 있어 사용하지 않는다.

import { FilesetResolver, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';

export const MODEL_PATHS = {
  lite: 'models/pose_landmarker_lite.task',
  full: 'models/pose_landmarker_full.task',
};
export const WASM_DIR = 'wasm';
export const WASM_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];

export class EngineError extends Error {
  constructor(message, missing = []) {
    super(message);
    this.missing = missing;
  }
}

async function exists(path) {
  try {
    const r = await fetch(path, { method: 'HEAD', cache: 'no-cache' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function checkEngineAssets(modelVariant = 'lite') {
  const paths = [MODEL_PATHS[modelVariant] ?? MODEL_PATHS.lite, ...WASM_FILES.map((f) => `${WASM_DIR}/${f}`)];
  const results = await Promise.all(paths.map(async (p) => ({ path: p, ok: await exists(p) })));
  return results.filter((r) => !r.ok).map((r) => r.path);
}

/**
 * @returns {Promise<{detect:(video:HTMLVideoElement, ts:number)=>any, close:()=>void, info:object}>}
 */
export async function createPoseEngine({ modelVariant = 'lite', delegate = 'GPU', numPoses = 2 } = {}) {
  const missing = await checkEngineAssets(modelVariant);
  if (missing.length) throw new EngineError('AI 동작 인식 파일이 없거나 손상되었습니다.', missing);

  const base = new URL(WASM_DIR, document.baseURI).href;
  const fileset = await FilesetResolver.forVisionTasks(base);
  const modelAssetPath = new URL(MODEL_PATHS[modelVariant] ?? MODEL_PATHS.lite, document.baseURI).href;
  const make = (d) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate: d },
    runningMode: 'VIDEO',
    numPoses,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });

  let landmarker;
  let used = delegate;
  try {
    landmarker = await make(delegate);
  } catch (e) {
    if (delegate !== 'GPU') throw new EngineError(`AI 모델을 시작하지 못했습니다: ${e.message}`);
    used = 'CPU';
    try {
      landmarker = await make('CPU');
    } catch (e2) {
      throw new EngineError(`AI 모델을 시작하지 못했습니다: ${e2.message}`);
    }
  }

  let lastTs = 0;
  return {
    info: { modelVariant, delegate: used, numPoses, version: '0.10.35' },
    detect(video, ts) {
      // VIDEO 모드는 타임스탬프가 반드시 증가해야 한다
      const t = Math.max(Math.round(ts), lastTs + 1);
      lastTs = t;
      return landmarker.detectForVideo(video, t);
    },
    close() {
      try { landmarker.close(); } catch { /* 무시 */ }
    },
  };
}
