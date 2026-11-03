# Android 테스트 APK

[Android 릴리스](https://github.com/kev208dev/-Keeper/releases/tag/tts-android-v0.1.0)에서 `Keeper-TTS-0.1.0-android-test.apk`를 받으면 됩니다.

이 앱은 문장을 입력하면 기기 안에서 한국어 음성을 만들고 재생합니다. 모델을 APK에 포함했으며 인터넷 권한을 요청하지 않습니다. Windows용 Python이나 PowerShell은 필요 없습니다.

**테스트용 APK입니다. 빌드와 정적 검사, 같은 Java 엔진의 PC 음성 생성은 확인했지만 Android 실기기에서 설치·실행한 상태는 아닙니다.**

## 설치할 기기

- Android 8.0(API 26) 이상
- 64비트 ARM(`arm64-v8a`) 또는 `x86_64`
- APK 약 443MB. 설치 파일·앱·내부 모델 복사 공간을 고려해 여유 공간 1.5GB 이상을 권장합니다.
- 32비트 ARM 기기는 이 APK에 포함하지 않았습니다.

RAM 4GB 이상인 기기부터 테스트하는 편이 좋습니다. 이는 검증된 최소 사양이 아니라 테스트를 시작할 때의 권장 기준입니다. 실제 키오스크의 메모리·CPU에 따라 앱이 실행되지 않거나 생성이 느릴 수 있습니다.

## 설치하고 실행하기

1. APK를 기기에 내려받거나 USB로 옮깁니다.
2. 파일 앱에서 APK를 열어 설치합니다. 기기가 설치 출처 허용을 요청하면 해당 설치 앱에 대해 직접 확인합니다.
3. `Keeper TTS`를 엽니다.
4. 첫 실행에는 APK에 들어 있는 모델을 앱 내부 저장소로 복사하고 무결성을 확인합니다. 다운로드는 하지 않습니다.
5. `준비 완료`가 표시되면 문장을 입력하고 **음성 만들고 듣기**를 누릅니다.

F1~F5, M1~M5 목소리와 0.8·1.0·1.2배 속도를 선택할 수 있습니다. 문장은 한 번에 300자까지 입력합니다. **다시 듣기**, **재생 중지**, **WAV 저장**도 사용할 수 있습니다. WAV 저장을 누르면 Android 파일 저장 화면에서 위치를 정합니다.

첫 준비에는 시간이 걸릴 수 있습니다. 모델을 복사할 공간이 부족하면 저장 공간을 확보하고 앱을 다시 실행하세요. 반복해서 실패하면 오류 화면과 기기 사양을 기록해 주세요.

## PC에서 USB로 설치하기

Android SDK Platform-Tools의 `adb`를 사용합니다. 개발자 옵션에서 USB 디버깅을 켜고, 기기에 표시되는 연결 허용을 직접 확인하세요.

```powershell
adb devices
adb shell getprop ro.build.version.release
adb shell getprop ro.product.cpu.abilist
adb install -r Keeper-TTS-0.1.0-android-test.apk
```

`adb`가 PATH에 없으면 Android SDK의 `platform-tools` 폴더에서 실행하세요. 여러 기기가 연결됐다면 `adb -s 기기번호 ...`로 대상을 지정합니다. `unauthorized`라면 기기의 연결 허용 화면을 확인합니다.

설치 후 앱 서랍에서 Keeper TTS를 열면 됩니다. 앱 오류 로그는 아래 명령으로 확인할 수 있습니다.

```powershell
adb logcat -s KeeperTTS AndroidRuntime
```

앱 패키지 이름은 `io.keeper.tts`입니다. 디버그 키로 서명한 개발·테스트용 APK이며 정식 운영·스토어 배포용 서명은 아닙니다. 나중에 다른 키로 서명한 앱은 이 APK 위에 바로 업데이트되지 않을 수 있습니다.

## 오프라인 테스트

모델을 다운로드한 적 없는 기기에서도 APK만으로 동작해야 합니다.

1. APK를 USB로 옮겨 준비합니다.
2. Wi-Fi, 모바일 데이터, 유선망을 모두 끄고 설치·실행합니다.
3. 이전에 생성하지 않았던 문장을 입력해 읽는 내용이 맞는지 확인합니다.
4. 앱을 완전히 종료했다가 다시 엽니다.
5. 기기를 재부팅하고 USB 연결도 끊은 뒤 다시 생성합니다.

앱에 이미 들어 있는 WAV를 재생하는 테스트와 구분해야 합니다. **지금 입력한 새 문장**을 기기에서 생성하는지 확인하세요.

| 확인할 것 | 예시 |
| --- | --- |
| 기본 안내 | 안녕하세요. 주문을 도와드리겠습니다. |
| 결제 안내 | 결제가 완료되었습니다. 카드를 챙겨 주세요. |
| 숫자와 가격 | 아메리카노 두 잔, 총 8,000원입니다. |
| 메뉴 이름과 영문 | ICE 아메리카노와 디카페인 라테를 선택하셨습니다. |
| 연속 요청 | 짧은 안내 문장을 30회 생성하고 멈춤·메모리 증가·발열을 확인합니다. |

기기 모델, Android 버전, CPU, RAM, 모델 준비 시간, 생성 시간과 음성 길이를 기록해 두세요. 앱 화면에 생성 시간과 음성 길이가 표시됩니다. 숫자나 영문 발음은 직접 듣고 확인해야 합니다.

## Keeper에 붙일 때

Android 코드는 `android` 폴더에 있습니다. 음성 엔진은 공식 Supertonic Java 예제를 Android에 맞게 수정했고, CPU용 ONNX Runtime Android를 사용합니다. 모델 세션은 재사용하고, 파일 준비와 음성 생성은 UI 스레드 밖에서 실행합니다.

앱의 `MainActivity`는 테스트 화면입니다. 기존 Keeper에 붙일 때는 모델 준비·음성 생성·재생 부분을 서비스나 별도 클래스로 분리하고 요청 취소, 음성 안내 순서, 결제 흐름과의 연결을 추가하는 편이 좋습니다. 현재 APK를 키오스크 전체 앱으로 만든 것은 아닙니다.

## 직접 빌드하기

Android Studio 또는 JDK 17~21, Android SDK Platform 35, Build Tools 35.0.0이 필요합니다. Python은 모델 파일을 준비하는 개발 스크립트에만 사용합니다.

Windows에서 모델 설치를 마친 뒤 실행하세요.

```powershell
.\setup-tts.ps1
.\scripts\build_android.ps1 -AndroidSdk 'C:\Users\사용자이름\AppData\Local\Android\Sdk'
```

스크립트는 모델과 체크섬을 Android assets에 준비하고, APK 빌드와 lint 검사를 실행합니다. SDK 경로, 모델 가중치, 빌드 결과, 개인 서명 키는 Git에 올리지 않습니다.

결과는 `release/Keeper-TTS-0.1.0-android-test.apk`에 저장됩니다. SHA-256은 `release/SHA256SUMS-android.txt`에서 확인할 수 있습니다. 이 APK를 실행하는 기기에는 Python이나 개발 도구가 필요 없습니다.

## 이번에 확인한 범위

| 항목 | 결과 |
| --- | --- |
| APK 컴파일 | 성공 |
| Android lint | 오류 없이 통과. 번역 리소스 등 경고는 남아 있습니다. |
| APK 서명 검증 | Android 디버그 서명 검증 통과 |
| 인터넷 권한 | Manifest에 없음 |
| 모델 가중치 | APK 안에 포함, 원본 파일별 SHA-256 검사 |
| Java 엔진 | PC에서 F1·M1 한국어 생성과 WAV 저장 확인 |
| 실제 Android 설치·화면·재생 | 기기가 없어 아직 확인하지 못함 |

## 출처와 라이선스

Supertonic 3 모델은 Supertone Inc.가 제작했으며 가중치는 수정하지 않았습니다. OpenRAIL-M 라이선스의 Section 5 및 Attachment A 사용 제한이 적용됩니다. APK 안에 원본 모델 라이선스, 출처 안내, 원본 revision과 파일 해시가 들어 있습니다. 앱의 **모델 출처와 라이선스** 버튼에서도 주요 라이선스를 볼 수 있습니다.

Keeper 코드는 MIT, 수정한 Supertonic Java 예제는 원본 MIT 고지를 유지합니다. ONNX Runtime과 Jackson의 라이선스도 APK에 포함했습니다.

- [원본 Java 예제](https://github.com/supertone-oss-archive/supertonic/tree/main/java)
- [ONNX Runtime Android](https://onnxruntime.ai/docs/tutorials/mobile/deploy-android.html)
- [실제 기기 연결](https://developer.android.com/studio/run/device)
- [ADB 사용법](https://developer.android.com/tools/adb)
