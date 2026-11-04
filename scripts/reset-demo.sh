#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PYTHON="$ROOT/owner-app/server/.venv/bin/python"
[[ -x "$PYTHON" ]] || PYTHON=$(command -v python3)
"$PYTHON" "$ROOT/scripts/demo_data.py" reset
