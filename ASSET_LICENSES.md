# 사용 자산과 라이선스

| 자산 | 파일 | 출처 | 라이선스 |
|---|---|---|---|
| MediaPipe Tasks Vision 0.10.35 | `vendor/mediapipe/vision_bundle.mjs`, `wasm/*` | npm `@mediapipe/tasks-vision@0.10.35` (Google) | Apache License 2.0 |
| Pose Landmarker 모델(Lite, Full, float16) | `models/pose_landmarker_lite.task`, `models/pose_landmarker_full.task` | Google MediaPipe 공식 모델 저장소 | Apache License 2.0 (모델 카드 기준, 배포 전 최신 모델 카드 재확인 권장) |
| Pretendard 1.3.9 (가변 폰트) | `fonts/PretendardVariable.woff2` | npm `pretendard@1.3.9` (Kil Hyung-jin) | SIL Open Font License 1.1 — 전문 `fonts/Pretendard-LICENSE.txt` |
| 게임 그래픽(보물 아이콘, 백제 장식, 레이저, 운석, 방어막, 스틱맨, DEMO 가상 학생) | `src/ui/art.js`, `src/ui/figure.js`, `src/demo/puppet.js` | 이 프로젝트에서 Canvas 코드로 직접 그림 | 프로젝트 자체 제작 |
| 효과음 | `src/core/sfx.js` | Web Audio API 합성(파일 없음) | 프로젝트 자체 제작 |
| 보물 도감 설명 | `assets/content/treasures.json` | 프로젝트 작성(일반적으로 알려진 사실만 기재, 창작·전설은 표시) | 프로젝트 자체 제작 |

## 참고
- 외부 이미지·음원·영상·CDN은 사용하지 않습니다.
- 보물 그림은 실제 유물·유적을 정확히 복원한 것이 아닌 **단순화한 창작 아이콘**입니다. 게임 안에도 이 사실을 표시합니다.
- MediaPipe 1.x 버전은 원격 사용 통계 전송 코드가 있어 쓰지 않습니다. 업그레이드할 때는 `vision_bundle.mjs`에서 `http` 문자열을 검색해 외부 전송 코드가 없는지 확인하세요.
- Apache License 2.0 전문: https://www.apache.org/licenses/LICENSE-2.0
