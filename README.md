# Keeper

무인매장 점주 앱과 키오스크, 음성 기능을 함께 관리하는 저장소입니다.
프로젝트별 코드는 아래 폴더에서 따로 작업합니다.

| 폴더 | 내용 | 현재 상태 |
| --- | --- | --- |
| [owner-app](owner-app) | 점주 앱과 FastAPI 서버 | 기존 앱·서버 코드 유지 |
| [kiosk-windows](kiosk-windows) | Windows 키오스크 | 앱 코드를 넣을 자리 |
| [kiosk-android](kiosk-android) | Android 키오스크 | 앱 코드를 넣을 자리 |
| [tts](tts) | 한국어 음성 엔진, Windows 실행 도구, Android TTS 테스트 앱 | 단독 실행 테스트용 |
| [docs](docs) | 공통 개발·브랜치 안내 | 작업 방법 |

Android TTS 테스트 앱은 `tts/android`에 있습니다. `kiosk-android`는 앞으로 만들 키오스크 전체 앱을 위한 폴더입니다.
TTS 파일을 합쳤다고 기존 점주 앱과 음성 기능이 자동으로 연결되는 것은 아닙니다.

## 실행하고 싶다면

- **점주 앱:** [실행·서버 연동 안내](owner-app/README.md)
- **Windows TTS:** [실행 환경·모델이 들어 있는 ZIP 받기](https://github.com/kev208dev/-Keeper/releases/tag/tts-windows-v0.1.0)
- **Android TTS:** [테스트 APK 받기](https://github.com/kev208dev/-Keeper/releases/tag/tts-android-v0.1.0)
- **TTS 코드 직접 실행:** [설치 방법](tts/README.md)

Windows ZIP은 전체를 압축 해제한 뒤 `start.cmd`를 실행합니다.
Android APK는 실제 기기에서 아직 검증하지 않은 디버그 서명 테스트 버전입니다.
모델은 릴리스에 포함하고 Git 소스에는 넣지 않습니다.

## 작업 브랜치

| 브랜치 | 작업 |
| --- | --- |
| `main` | 함께 확인한 공통 코드 |
| `feat/owner-app` | 점주 앱·서버 |
| `feat/kiosk-windows` | Windows 키오스크 |
| `feat/kiosk-android` | Android 키오스크 |
| `feat/tts-integration` | 음성 생성·재생·앱 연동 |

각 브랜치에도 전체 폴더가 들어 있습니다. 맡은 폴더를 중심으로 수정하고 PR로 합치면 됩니다.
[브랜치 사용 방법](docs/DEVELOPMENT.md)

## 기존 TTS 저장소

TTS는 [JHOO2010/keeper-tts-demo](https://github.com/JHOO2010/keeper-tts-demo)에서 가져왔습니다.
기존 저장소와 다운로드는 유지하며, 이후 통합 작업은 이 저장소의 `tts`에서 진행합니다.
TTS 코드·모델·라이브러리의 라이선스는 [tts 안내](tts/README.md)와 동봉한 고지를 확인하세요.
TTS의 라이선스를 다른 앱 전체에 적용한 것은 아닙니다.
