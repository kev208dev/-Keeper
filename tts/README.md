# Keeper TTS

Keeper 키오스크 도우미에 붙이기 전에, 한국어 음성이 잘 나오는지 터미널에서 테스트하는 코드입니다.

Supertonic 3를 사용합니다. GPU 없이 CPU로 돌아가고, 처음에 모델을 받아두면 인터넷 없이 쓸 수 있습니다. 지금은 Windows에서 실행을 확인한 상태입니다.

## 설치 없이 바로 써보기

[릴리스 페이지](https://github.com/kev208dev/-Keeper/releases/tag/tts-windows-v0.1.0)에서 `Keeper-TTS-0.1.0-windows-x64.zip`을 받으세요.

1. ZIP 전체를 쓰기 가능한 폴더에 압축 해제합니다.
2. `start.cmd`를 더블클릭합니다.
3. 읽을 문장을 입력하고 Enter를 누릅니다. 빈 줄을 입력하면 종료합니다.

Python 실행 환경과 모델이 모두 들어 있어 **첫 실행부터 인터넷 없이 사용할 수 있습니다.** Windows 64비트용이며, Android APK는 아닙니다.

앱에 직접 모델을 붙이려는 개발자는 `Keeper-Supertonic3-models.zip`만 받아도 됩니다. 이 파일에는 실행 프로그램이 없고, 압축 안의 `models/supertonic-3`를 프로젝트에 옮겨 사용합니다. Windows 실행용 ZIP을 받았다면 모델을 또 받을 필요는 없습니다.

[Windows 실행용 자세한 안내](docs/WINDOWS_RELEASE.md)

## 다른 PC에서 처음 실행하기

Windows 64비트와 Python 3.13이 필요합니다. Git이 없다면 GitHub의 **Code → Download ZIP**으로 받아서 압축을 풀어도 됩니다.

Git을 쓰는 경우 PowerShell에서 아래 명령을 입력하세요.

```powershell
git clone https://github.com/kev208dev/-Keeper.git
cd ./-Keeper/tts
.\setup-tts.ps1
```

ZIP으로 받았다면 압축을 푼 폴더에서 PowerShell을 열고 `.\setup-tts.ps1`만 실행하면 됩니다.

설치 스크립트가 아래 작업을 자동으로 합니다.

1. 이 프로젝트 전용 Python 환경을 만듭니다.
2. 필요한 패키지를 설치합니다.
3. Supertonic 3 모델을 `models/supertonic-3`에 받습니다.
4. 테스트 문장을 읽어 WAV 파일을 만듭니다.

모델은 약 400MB입니다. **처음 설치할 때는 인터넷이 필요하고, 설치가 끝난 뒤에는 인터넷 없이 실행할 수 있습니다.** Python과 Git 자체를 설치해 주는 스크립트는 아닙니다.

| 명령 | 언제 사용하나요? | 모델 다운로드 |
| --- | --- | --- |
| `setup-tts.ps1` | 처음 설치하거나 실행 환경을 다시 준비할 때 | 필요한 모델이 없으면 자동 다운로드 |
| `run-voice.ps1` | 문장을 음성으로 만들 때 | 다운로드하지 않음 |

`run-voice.ps1`부터 실행했는데 모델이나 가상환경이 없다는 오류가 나오면, `setup-tts.ps1`을 먼저 실행하세요. 저장소를 받는 것만으로는 모델까지 설치되지 않습니다.

## 문장 읽어보기

```powershell
.\run-voice.ps1 -Text "안녕하세요. 주문을 도와드리겠습니다." -Play
```

`-Play`를 붙이면 만든 음성을 바로 들을 수 있습니다. 빼면 파일만 저장됩니다.

목소리나 속도를 바꾸고 싶으면 이렇게 실행하면 됩니다.

```powershell
.\run-voice.ps1 -Text "결제가 완료되었습니다." -Voice M1 -Speed 0.9 -Play
```

- `-Voice`: F1~F5, M1~M5 중 선택. 기본값은 F1입니다.
- `-Speed`: 1이 기본 속도입니다. 작게 하면 느려지고, 크게 하면 빨라집니다. 0.7~2 사이로 설정할 수 있습니다.
- `-Output`: 저장할 파일 이름을 직접 정할 때 씁니다.

```powershell
.\run-voice.ps1 -Text "이용해 주셔서 감사합니다." -Output outputs/thanks.wav -Play
```

파일 이름을 따로 정하지 않으면 실행 시간으로 이름을 붙여 `outputs` 폴더에 저장합니다. 같은 이름의 파일이 있으면 덮어쓰지 않습니다.

터미널에서 음성 생성에 걸린 시간과 저장 위치를 확인할 수 있고, 측정 결과는 WAV 옆의 JSON 파일에도 남습니다.

## 인터넷이 없는 PC에 설치하려면

먼저 인터넷이 되는 곳에서 필요한 파일을 준비해야 합니다. 모델만 복사하면 되는 것은 아닙니다.

- 이 저장소의 코드
- `models/supertonic-3` 폴더 전체
- 대상 PC에 맞는 Python 설치 파일과 패키지 설치 파일

다른 PC의 `.venv-supertonic` 폴더는 경로나 Python 설치 위치가 달라 그대로 복사하면 작동하지 않을 수 있습니다. 대상 PC에서 가상환경을 만들고 패키지를 설치하는 편이 좋습니다.

현재 `setup-tts.ps1`은 인터넷으로 패키지를 설치하는 방식입니다. Python을 따로 준비하기 어렵거나 인터넷이 없는 PC에서 쓰려면 위의 Windows 실행용 ZIP을 사용하세요.

## Android에서도 써보기

[Android 테스트 릴리스](https://github.com/kev208dev/-Keeper/releases/tag/tts-android-v0.1.0)에서 `Keeper-TTS-0.1.0-android-test.apk`를 받으세요.

Android 8.0 이상, 64비트 ARM 또는 x86_64 기기용입니다. 모델이 APK에 들어 있어 첫 실행부터 인터넷 없이 음성을 생성하도록 만들었고, 인터넷 권한을 요청하지 않습니다.

설치 후 `Keeper TTS`를 열고 모델 준비가 끝나면 문장을 입력하세요. 목소리·속도 선택, 재생, WAV 저장을 사용할 수 있습니다.

**아직 Android 실기기에서 실행해 본 것은 아닙니다.** APK 빌드·정적 검사·서명 검증과 같은 Java 엔진의 PC 실행까지만 확인한 테스트 버전입니다. 실제 키오스크에서 발음·속도·메모리를 확인한 뒤 사용하세요. Windows 실행용 ZIP과는 별도로 받는 APK입니다.

[APK 설치·오프라인 테스트·직접 빌드 방법](docs/ANDROID_TEST.md)

## 사용한 모델

- [Supertonic 3 모델 보관소](https://huggingface.co/supertone-oss-archive/supertonic-3)
- [Supertonic 코드와 실행 예제](https://github.com/supertone-oss-archive/supertonic)
- [Supertonic Python 라이브러리](https://github.com/supertone-oss-archive/supertonic-py)

Supertonic은 현재 보관 상태로, 원 제작사의 개발·지원은 종료되었습니다. 배포에 사용할 모델과 라이브러리는 버전을 정해 함께 보관하는 편이 좋습니다.

모델 라이선스는 OpenRAIL-M입니다. 자세한 조건은 내려받은 모델 폴더의 라이선스 파일에서 확인할 수 있습니다.

이 저장소의 Keeper 코드는 MIT 라이선스입니다. 모델에는 별도의 OpenRAIL-M 조건이 적용되며, 릴리스에 원본 라이선스와 사용 제한 안내를 함께 넣었습니다. 모델 가중치는 수정하지 않았고, Keeper가 제작한 모델로 표시하지 않습니다.

## 실행용 ZIP 다시 만들기

Windows 개발 환경에서 모델 설치를 마친 후 실행합니다.

```powershell
.\.venv-supertonic\Scripts\python.exe -m pip install -r requirements-build.txt
.\.venv-supertonic\Scripts\python.exe scripts/package_release.py
```

결과는 `release` 폴더에 생성됩니다. 같은 버전의 준비 폴더가 이미 있으면 덮어쓰지 않고 멈추므로 새 빌드에는 버전 또는 준비 폴더를 구분하세요. 릴리스 ZIP의 SHA-256은 `SHA256SUMS.txt`, 모델 원본과 개별 파일 해시는 `MODEL_SOURCE.json`에서 확인할 수 있습니다.
