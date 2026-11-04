# 검증 결과

검증일: 2026-11-04, macOS Apple Silicon, Python 3.14.4, Node 25, JDK 21, Android SDK 35, ffmpeg 9.0.2.

## 구현 및 자동 검증 완료

| 대상 | 실행 명령 | 결과 |
| --- | --- | --- |
| FastAPI/SQLite | `cd owner-app/server && .venv/bin/python -m pytest -q` | 231 passed, coverage 85.73%, 매장 격리·대상 답변·보호 미디어 포함 |
| React 점주 앱/시뮬레이터 | `cd owner-app && npm test -- --run && npm run build` | 314 passed, 12 files, production build 성공 |
| Android JVM/lint/APK | `cd kiosk-android && ./gradlew testDebugUnitTest lintDebug assembleDebug --no-daemon` | 4 JVM 테스트, lint, APK 빌드 성공 |
| 로컬 서비스 | `./scripts/start-demo.sh && ./scripts/check-demo.sh` | API·점주 앱·시뮬레이터·OpenCV·ffmpeg·DB·APK 확인 |
| 실제 HTTP 통합 | `./scripts/check-demo.sh --full` | 문의/중복/답변/대상 pull/ACK, 생성 MP4, ROI 전환, 실제 ffmpeg 클립, 보호 업로드·다운로드, 카메라 끊김·복구 성공 |
| 안전 초기화 | `./scripts/reset-demo.sh` 및 자동 테스트 | `.demo` 밖 거부, 계정 보존, 이벤트·미디어만 제거 |

Supertonic 모델 19개 파일은 기존 GitHub 릴리스 APK의 공개 SHA-256과 `MODEL_SOURCE.json` 파일별 해시로 확인했고, 모델이 포함된 debug APK는 약 423MB였습니다.

## 구현 완료, 실기기 검증 필요

- Android 태블릿 설치·실행·터치·가로 전체 화면
- 기기 내 ONNX 초기 모델 복사, 실제 한국어 추론 시간·메모리·발음
- 실제 Wi-Fi 단절/복구와 화면 잠금·앱 복귀
- 실제 스마트폰 Safari/Chrome에서 영상 codec·알림 권한·모바일 레이아웃 육안 확인
- 실제 매장 CCTV 영상에서 HOG 사람 탐지율과 ROI 보정

빌드 시 `adb devices -l`에 연결된 기기가 없어 설치/실행을 성공으로 보고하지 않았습니다.

## 부분 구현 또는 제약

- 스마트폰 실시간 카메라 스트림 수신기는 미구현이며 파일 입력이 완성 범위입니다.
- 냉장고 문 열림은 이벤트·지속시간 구조는 있으나 영상만으로 상태를 인식하는 전용 모델은 없습니다.
- 상품 훼손은 전용 학습 모델이 없어 시뮬레이션 이벤트만 지원합니다.
- POS 결제 연동이 없어 영상 분석은 미결제 여부를 판단하지 않습니다.
- 생성 fixture의 결정적 밝은 객체 detector 검증은 실제 사람 탐지 정확도 검증이 아닙니다.

## 경고

Python 3.14에서 Starlette TestClient의 `httpx` deprecation 경고가 하나 있으나 테스트 실패는 아닙니다. Android 빌드는 SDK XML 버전 경고와 Gradle 9 예정 deprecation 경고가 있었으나 Gradle 8.14.3에서 성공했습니다.
