#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SERVER="$ROOT/owner-app/server"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "필수 명령이 없습니다: $1" >&2; return 1; }
}

need python3
need curl
need unzip
need ffmpeg
need ffprobe

node_supported() {
  "$1" -e 'const [a,b,c]=process.versions.node.split(".").map(Number); process.exit((a===22&&(b>22||(b===22&&c>=2)))||(a===24&&(b>15||(b===15&&c>=0)))||a>=26?0:1)'
}

NODE24=""
if command -v brew >/dev/null 2>&1; then
  NODE24="$(brew --prefix node@24 2>/dev/null || true)/bin/node"
fi
NODE_BIN=$(command -v node || true)
if [[ -x "$NODE24" ]] && node_supported "$NODE24"; then
  export PATH="$(dirname "$NODE24"):$PATH"
  NODE_BIN="$NODE24"
elif [[ -z "$NODE_BIN" ]] || ! node_supported "$NODE_BIN"; then
  echo "Node 22.22.2+, 24.15.0+ 또는 26+가 필요합니다. macOS 권장: brew install node@24" >&2
  exit 1
fi
need npm
echo "Node $($NODE_BIN --version) 사용"

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
