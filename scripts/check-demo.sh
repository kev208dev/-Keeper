#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SERVER="$ROOT/owner-app/server"
PYTHON="$SERVER/.venv/bin/python"
PORT="${KEEPER_PORT:-8000}"
BASE="http://127.0.0.1:$PORT"
failures=0

check() {
  local label=$1
  shift
  if "$@" >/dev/null 2>&1; then echo "OK   $label"; else echo "FAIL $label"; failures=$((failures + 1)); fi
}

check "FastAPI /health" curl -fsS "$BASE/health"
check "점주 앱" curl -fsS "$BASE/"
check "웹 시뮬레이터" curl -fsS "$BASE/simulator.html"
check "Python 가상환경" test -x "$PYTHON"
if [[ -x "$PYTHON" ]]; then
  check "OpenCV 영상 엔진" "$PYTHON" -c "import cv2; print(cv2.__version__)"
fi
check "ffmpeg" ffmpeg -version
check "ffprobe" ffprobe -version
check "React 빌드" test -f "$ROOT/owner-app/dist/index.html"
check "시연 전용 DB" test -f "$ROOT/.demo/keeper.db"
check "시연 계정" test -f "$ROOT/.demo/credentials.json"

BREW_PREFIX=$(brew --prefix 2>/dev/null || true)
NODE24="$BREW_PREFIX/opt/node@24/bin/node"
JDK21="$BREW_PREFIX/opt/openjdk@21/bin/java"
ANDROID_SDK="$BREW_PREFIX/share/android-commandlinetools"
check "Node 24 LTS" "$NODE24" -e 'process.exit(process.versions.node.startsWith("24.") ? 0 : 1)'
check "JDK 21" "$JDK21" -version
check "Android SDK 35" test -d "$ANDROID_SDK/platforms/android-35"
check "Android build-tools 35" test -d "$ANDROID_SDK/build-tools/35.0.0"

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [[ -n "$LAN_IP" ]]; then
  check "LAN $LAN_IP /health" curl -fsS "http://$LAN_IP:$PORT/health"
else
  echo "FAIL MacBook LAN IP"
  failures=$((failures + 1))
fi

if [[ -d "/Applications/OBS.app" || -d "/System/Applications/QuickTime Player.app" ]]; then
  echo "OK   화면 녹화 앱"
else
  echo "INFO OBS/QuickTime을 찾지 못했습니다."
fi

APK="$ROOT/kiosk-android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]] && unzip -l "$APK" | grep 'assets/supertonic-3/MODEL_SOURCE.json' >/dev/null; then
  echo "OK   Android debug APK + Supertonic 모델"
else
  echo "INFO Android APK 또는 모델 미준비 (docs/ANDROID_KIOSK.md 참고)"
  if [[ "${1:-}" == "--full" ]]; then failures=$((failures + 1)); fi
fi

if (( failures > 0 )); then
  echo "${failures}개 항목을 확인하세요." >&2
  exit 1
fi
echo "로컬 데모 필수 항목이 준비됐습니다."

if [[ "${1:-}" == "--full" ]]; then
  "$PYTHON" "$ROOT/scripts/verify_demo_flow.py" --server "$BASE"
fi
