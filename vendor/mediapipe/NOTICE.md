# 제3자 구성요소 고지

## @mediapipe/tasks-vision 0.10.35
- 파일: `vendor/mediapipe/vision_bundle.mjs`, `wasm/vision_wasm_internal.*`, `wasm/vision_wasm_nosimd_internal.*`
- 출처: npm 레지스트리 `@mediapipe/tasks-vision@0.10.35`
- 라이선스: Apache License 2.0 — Copyright Google LLC
- 버전 고정 사유: 1.x 버전 번들에는 `https://odml.pa.googleapis.com/v1/log` 로 사용 통계를 전송하는 코드가 포함되어 있다. 이 프로젝트는 외부 전송을 금지하므로 외부 URL이 없는 0.10.35를 사용한다.
  업그레이드할 경우 `vision_bundle.mjs` 에서 `http` 문자열을 검색해 외부 전송 코드가 없는지 반드시 확인한다.

## MediaPipe Pose Landmarker 모델
- 파일: `models/pose_landmarker_lite.task`, `models/pose_landmarker_full.task` (float16)
- 출처: Google MediaPipe 공식 모델 저장소 (storage.googleapis.com/mediapipe-models/pose_landmarker/…/latest)
- 라이선스: Apache License 2.0 (MediaPipe 모델 카드 기준). 배포 전 최신 모델 카드의 라이선스·사용 제한 조항을 다시 확인할 것.

Apache License 2.0 전문: https://www.apache.org/licenses/LICENSE-2.0
