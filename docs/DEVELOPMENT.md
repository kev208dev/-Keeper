# 같이 작업하는 방법

한 저장소에서 폴더로 기능을 나누고 브랜치로 작업을 나눕니다.
다른 브랜치로 바꾼다고 담당 폴더만 남는 구조는 아닙니다.

## 처음 받기

```powershell
git clone https://github.com/kev208dev/-Keeper.git
cd ./-Keeper
git fetch origin
```

## 맡은 브랜치로 이동하기

점주 앱은 다음과 같이 시작합니다.

```powershell
git switch --track origin/feat/owner-app
cd owner-app
```

Windows는 `feat/kiosk-windows`, Android는 `feat/kiosk-android`, TTS는 `feat/tts-integration`을 사용합니다.
이미 로컬 브랜치를 만들었다면 `git switch 브랜치이름`만 실행하세요.
저장소 안의 파일을 수정한 상태라면 먼저 커밋하거나 임시 저장한 후 브랜치를 바꿉니다.

## main의 변경 가져오기

담당 브랜치에서 저장소 루트로 이동한 뒤 실행합니다.

```powershell
git fetch origin
git merge origin/main
```

충돌이 나면 함께 수정한 파일을 확인해 해결합니다. 공동 브랜치를 강제로 덮어쓰지 않습니다.

## 변경 올리기

수정한 파일만 추가하고 커밋한 뒤 담당 브랜치에 push합니다.
GitHub에서 `main`을 대상으로 PR을 만들고 확인 후 합칩니다.
TTS 작업 커밋 메시지는 요청에 따라 `TTS 푸시`를 사용합니다.

작업을 더 작게 나누고 싶으면 담당 브랜치에서 새 기능 브랜치를 만들어도 됩니다.

## 배포 파일

- `tts-windows-v...`: Windows 음성 도구·모델 ZIP
- `tts-android-v...`: Android TTS 테스트 APK
- 점주 앱이나 키오스크 전체 앱은 완성·검증한 뒤 별도 태그로 배포합니다.

현재 Windows와 Android 릴리스는 **TTS 단독 도구**입니다. 점주 앱·전체 키오스크의 완성 배포본이 아닙니다.
모델, 가상환경, 개인 키, 실제 매장 데이터는 Git에 올리지 않습니다.
기존 TTS 배포 파일은 바이트를 변경하지 않고 옮겨 SHA-256을 동일하게 유지했습니다.
