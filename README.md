# #Keeper

무인매장용 로컬 시연 시스템입니다. MacBook에서 FastAPI·SQLite·CCTV 영상 분석을 실행하고, 스마트폰의 점주 웹 앱과 Android 태블릿 키오스크를 같은 Wi-Fi로 연결합니다.

## 실제 구현 상태

| 구성 | 상태 | 내용 |
| --- | --- | --- |
| `owner-app` | 구현·자동 검증 완료 | 모바일 React 점주 앱, FastAPI, 매장 격리, 문의 답변, 보호 영상 재생, 운영 리포트 |
| `kiosk-android` | 구현·APK 빌드 완료, 실기기 검증 필요 | API 26+, 가로 전체화면, 문의/답변, 재시도·복구, 오프라인 Supertonic 3 TTS |
| CCTV 파일 분석 | 구현·자동 검증 완료 | MP4/MOV 입력, OpenCV HOG 사람 탐지, 추적, ROI 이동, ffmpeg 클립, 근거·확률 표시 |
| 웹 시뮬레이터 | 구현·자동 검증 완료 | 자동/수동 시나리오, 간격·중지·재시작, 영상 등록, 기기별 답변 분리 |
| 스마트폰 실시간 스트림 | 확장 지점만 제공 | 우선 완료 범위는 녹화 영상 파일입니다. RTSP/WebRTC 수신기는 미구현입니다. |

분석 결과는 결제 정보를 추론하지 않습니다. POS 연동이 없으므로 영상 분석 이벤트는 `미결제=false`, `확인 필요`, `source=analysis`로 저장됩니다.

## 가장 빠른 로컬 실행

macOS에서 저장소 루트 기준으로 실행합니다.

```bash
./scripts/setup-macos.sh
./scripts/start-demo.sh
./scripts/check-demo.sh --full
```

`start-demo.sh`가 표시하는 Wi-Fi 주소를 스마트폰 브라우저에서 열면 점주 앱을, `/simulator.html`을 붙이면 시뮬레이터를 사용할 수 있습니다. 로그인 정보는 Git에 올라가지 않는 `.demo/credentials.json`에 생성됩니다.

촬영 데이터를 다시 비우되 계정은 유지하려면 다음을 실행합니다.

```bash
./scripts/reset-demo.sh
```

## 문서

- [로컬 서버·스마트폰 연결](docs/LOCAL_DEMO.md)
- [Android 키오스크 빌드·설치](docs/ANDROID_KIOSK.md)
- [CCTV 파일·ROI 분석](docs/CCTV_TEST.md)
- [촬영 시나리오](docs/DEMO_SCENARIO.md)
- [검증 결과와 제한사항](docs/TEST_RESULTS.md)

## 주요 폴더

- `owner-app/server/keeper`: API, SQLite, 영상 분석
- `owner-app/src`: 점주 앱과 웹 시뮬레이터
- `kiosk-android`: 독립 실행 Android 키오스크
- `tts/android`: 공유 Supertonic 3 Java 엔진과 모델 고지
- `scripts`: macOS 설치·기동·초기화·통합 검증

모델, 실제 CCTV 영상, `.demo` DB, 기기 키는 Git에 포함하지 않습니다. TTS 코드는 MIT, Supertonic 모델은 동봉된 OpenRAIL-M 조건을 따릅니다. 현재 Homebrew FFmpeg 빌드는 GPL-3.0-or-later이며, OpenCV wheel은 Apache-2.0입니다.
