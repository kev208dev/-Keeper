#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SERVER="$ROOT/owner-app/server"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "필수 명령이 없습니다: $1" >&2; return 1; }
}

need python3
need npm
need curl
need unzip
need ffmpeg
need ffprobe

python3 - <<'PY'
import sys
if sys.version_info < (3, 12):
    raise SystemExit("Python 3.12 이상이 필요합니다.")
PY

if [[ "${KEEPER_SETUP_CHECK_ONLY:-0}" == "1" ]]; then
  echo "필수 macOS 명령 확인 완료"
  exit 0
fi

if [[ ! -x "$SERVER/.venv/bin/python" ]]; then
  python3 -m venv "$SERVER/.venv"
fi
"$SERVER/.venv/bin/python" -m pip install -r "$SERVER/requirements-dev.txt"
(cd "$ROOT/owner-app" && npm ci && npm run build)
"$SERVER/.venv/bin/python" "$ROOT/scripts/demo_data.py" init

echo "기본 설치 완료. Android 모델/APK는 docs/ANDROID_KIOSK.md 절차로 준비하세요."
