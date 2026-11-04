#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CACHE="$ROOT/.demo/cache"
APK="$CACHE/Keeper-TTS-0.1.0-android-test.apk"
TARGET="$ROOT/tts/android/app/src/main"
URL="https://github.com/kev208dev/-Keeper/releases/download/tts-android-v0.1.0/Keeper-TTS-0.1.0-android-test.apk"
EXPECTED="1925e74e988963e7e5ea796610df6c85698b1db3f83eaf8cb0748734924c0da7"

mkdir -p "$CACHE"
if [[ ! -f "$APK" ]]; then
  echo "Supertonic 모델이 포함된 검증 릴리스를 받습니다 (약 423MB)."
  curl -fL --retry 3 "$URL" -o "$APK"
fi
actual=$(shasum -a 256 "$APK" | awk '{print $1}')
if [[ "$actual" != "$EXPECTED" ]]; then
  echo "TTS 릴리스 SHA-256이 일치하지 않습니다: $actual" >&2
  exit 1
fi
unzip -oq "$APK" 'assets/supertonic-3/*' -d "$TARGET"
test -f "$TARGET/assets/supertonic-3/MODEL_SOURCE.json"
echo "Supertonic 3 모델 준비 완료 (SHA-256 검증됨)."
