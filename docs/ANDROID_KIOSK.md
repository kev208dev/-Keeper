# Android 키오스크

## 지원 범위

- Android 8.0/API 26 이상
- ARM64 또는 x86_64
- 가로 화면, 전체 화면, 손가락 터치
- 로컬 서버 문의·답변 폴링, 중복 방지, 재시도, 앱 재실행 복구
- Supertonic 3 한국어 음성의 기기 내 오프라인 생성

웹 화면을 감싼 앱이 아니라 Java 기반 네이티브 앱입니다. 서버 주소와 기기 키는 소스에 없으며 앱의 `개발자 설정`에서 저장합니다.

## 모델 준비

모델은 약 394MB라 Git에 넣지 않습니다. 저장소의 기존 TTS 테스트 릴리스 APK를 내려받아 공개 SHA-256 `1925e74e...c0da7`과 대조한 뒤 동일한 모델·라이선스·`MODEL_SOURCE.json`을 추출합니다.

```bash
./scripts/prepare-kiosk-model.sh
```

결과는 Git에서 제외되는 `tts/android/app/src/main/assets/supertonic-3`에 생깁니다. 다운로드한 릴리스는 `.demo/cache`에 보관됩니다.

## 빌드

JDK 21과 Android SDK Platform/Build Tools 35가 필요합니다. Homebrew 예시:

```bash
brew install openjdk@21 android-commandlinetools
sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"
```

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
cd kiosk-android
./gradlew testDebugUnitTest lintDebug assembleDebug --no-daemon
```

생성물은 `kiosk-android/app/build/outputs/apk/debug/app-debug.apk`입니다. 확인된 빌드는 모델 포함 약 423MB였고 SHA-256은 `7c9956e8890afe0195b884cb2b683948711bbd6dae866f029fa637763a880e5a`입니다.

## 설치와 연결

USB 디버깅을 켠 태블릿을 연결합니다.

```bash
adb devices -l
adb install -r kiosk-android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n io.keeper.kiosk.debug/io.keeper.kiosk.MainActivity
```

앱의 `개발자 설정`에서 다음을 입력합니다.

1. 서버: `http://<MacBook Wi-Fi IP>:8000`
2. 기기 키: `.demo/credentials.json`의 `deviceKey`
3. `연결 테스트`
4. 목소리·속도·음량 선택 후 저장

로컬 HTTP 허용은 debug manifest에만 있습니다. main/release manifest는 cleartext를 막습니다. 운영 외부망에는 HTTPS를 사용해야 합니다.

## 실기기 확인 항목

현재 자동 검증과 APK 빌드는 완료했지만 연결된 Android 기기가 없어 다음은 남아 있습니다.

- 최초 모델 복사·ONNX 초기화 시간과 메모리
- 한국어 발음, 음량, 실제 태블릿 스피커 지연
- 회전 고정·전체 화면·키보드·터치 영역
- Wi-Fi 끊김/재연결과 백그라운드 복귀

답변 ACK는 답변 화면을 실제로 그린 다음 큐에 들어가며, 실패하면 앱 재실행 후 같은 답변 ID로 재시도합니다.
