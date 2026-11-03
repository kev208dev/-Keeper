# Keeper TTS Android

Android 프로젝트와 APK 설치 안내는 [docs/ANDROID_TEST.md](../docs/ANDROID_TEST.md)를 참고하세요.

- 패키지: `io.keeper.tts`
- 최소 Android: 8.0 / API 26
- ABI: arm64-v8a, x86_64
- 모델: Supertonic 3, APK 포함, 인터넷 권한 없음
- 빌드: 저장소 루트에서 `scripts/build_android.ps1`
- 서명: Android 개발용 디버그 서명

`Helper.java`는 Supertone Inc.의 MIT Java 예제를 수정했습니다.
수정 사항은 Android WAV 출력, CPU 스레드 설정, 생성 길이 제한, 예외 발생 시 텐서 정리입니다.
원본 코드 라이선스와 모델·런타임 라이선스는 `app/src/main/assets`에 있습니다.

`tools/EngineSmoke.java`는 같은 음성 엔진을 데스크톱 Java/ONNX Runtime에서 확인하는 검증기입니다.
Android 실기기 검증을 대체하지 않습니다.
