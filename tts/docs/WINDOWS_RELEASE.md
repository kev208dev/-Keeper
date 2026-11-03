# Keeper TTS Windows 실행용

Python이나 GPU를 설치하지 않고 한국어 음성을 만들어 보는 버전입니다.
Windows 10/11 64비트 PC용입니다. Windows 11에서 확인했으며 모든 기기에서의 동작을 보장하는 것은 아닙니다.

## 실행하기

1. ZIP 전체를 쓰기 가능한 폴더에 압축 해제합니다. ZIP 안에서 바로 실행하지 마세요.
2. `start.cmd`를 더블클릭합니다.
3. 터미널에 읽을 문장을 입력하고 Enter를 누릅니다.
4. 음성이 생성되면 바로 재생됩니다. 다른 문장을 계속 입력할 수 있습니다.
5. 빈 줄에서 Enter를 누르면 종료합니다.

모델과 실행 환경이 들어 있어 최초 실행부터 인터넷이 필요 없습니다.
음성과 측정 결과는 실행 폴더의 `outputs`에 저장됩니다.
`KeeperTTS.exe`, `_internal`, `models`는 같은 위치에 그대로 두세요.
기존 파일은 덮어쓰지 않습니다.

## 터미널에서 직접 실행하기

```powershell
.\KeeperTTS.exe --text "안녕하세요. 주문을 도와드리겠습니다." --play
.\KeeperTTS.exe --text "결제가 완료되었습니다." --voice M1 --speed 0.9 --play
.\KeeperTTS.exe --interactive --play
```

목소리는 F1~F5, M1~M5 중 선택할 수 있습니다. `--play`를 빼면 파일만 저장합니다.
생성이 느리면 짧은 문장으로 나눠 보세요. 기기마다 속도가 다릅니다.
모델 파일이 없다는 오류가 나면 ZIP 전체를 정상적으로 풀었는지 확인하세요.

## 모델과 라이선스

Supertonic 3 원본 모델은 Supertone Inc.에서 만들었습니다. Keeper는 이 모델을 실행하기 위한 별도 도구입니다.
모델 가중치는 수정하지 않았으며 OpenRAIL-M의 사용·재배포 조건(Section 5와 Attachment A 포함)이 적용됩니다.
`models/supertonic-3/LICENSE`, `MODEL_NOTICE.md`, `MODEL_SOURCE.json`을 함께 확인하세요.
프로그램 코드는 MIT이며, 실행 환경의 라이선스는 `licenses` 폴더에 들어 있습니다.

이 버전은 Windows용입니다. Android APK는 포함하지 않았습니다.
원 제작사의 Supertonic 개발과 지원은 종료되어 있습니다.

코드 및 Android 테스트 안내: https://github.com/kev208dev/-Keeper
