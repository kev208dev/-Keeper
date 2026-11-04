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

APK="$ROOT/kiosk-android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]] && unzip -l "$APK" | grep 'assets/supertonic-3/MODEL_SOURCE.json' >/dev/null; then
  echo "OK   Android debug APK + Supertonic 모델"
else
  echo "INFO Android APK 또는 모델 미준비 (docs/ANDROID_KIOSK.md 참고)"
fi

if (( failures > 0 )); then
  echo "${failures}개 항목을 확인하세요." >&2
  exit 1
fi
echo "로컬 데모 필수 항목이 준비됐습니다."

if [[ "${1:-}" == "--full" ]]; then
  "$PYTHON" "$ROOT/scripts/verify_demo_flow.py" --server "$BASE"
fi
