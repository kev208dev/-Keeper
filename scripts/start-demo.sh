#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEMO="$ROOT/.demo"
SERVER="$ROOT/owner-app/server"
PYTHON="$SERVER/.venv/bin/python"
PORT="${KEEPER_PORT:-8000}"
PID_FILE="$DEMO/server.pid"
LOG_FILE="$DEMO/server.log"

[[ -x "$PYTHON" ]] || { echo "먼저 ./scripts/setup-macos.sh를 실행하세요." >&2; exit 1; }
[[ -d "$ROOT/owner-app/dist" ]] || { echo "owner-app/dist가 없습니다. setup-macos.sh를 실행하세요." >&2; exit 1; }
mkdir -p "$DEMO/media"
"$PYTHON" "$ROOT/scripts/demo_data.py" init >/dev/null

if [[ -f "$PID_FILE" ]]; then
  old_pid=$(<"$PID_FILE")
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    old_command=$(ps -p "$old_pid" -o command= 2>/dev/null || true)
    old_cwd=$(lsof -a -p "$old_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    if [[ "$old_command" == *"uvicorn asgi:app"* && "$old_cwd" == "$SERVER" ]]; then
      echo "Keeper 데모 서버가 이미 실행 중입니다. PID $old_pid"
      exit 0
    fi
    echo "PID 파일이 다른 프로세스를 가리켜 새 서버를 시작합니다." >&2
  fi
fi

(
  cd "$SERVER"
  nohup env \
    KEEPER_DB_PATH="$DEMO/keeper.db" \
    KEEPER_MEDIA_ROOT="$DEMO/media" \
    KEEPER_STATIC_DIR="$ROOT/owner-app/dist" \
    "$PYTHON" -m uvicorn asgi:app --host 0.0.0.0 --port "$PORT" \
    >"$LOG_FILE" 2>&1 &
  server_pid=$!
  echo "$server_pid" >"$PID_FILE"
  if command -v caffeinate >/dev/null 2>&1; then
    nohup caffeinate -dimsu -w "$server_pid" >"$DEMO/caffeinate.log" 2>&1 &
    echo $! >"$DEMO/caffeinate.pid"
  fi
)

for _ in {1..40}; do
  server_pid=$(<"$PID_FILE")
  if kill -0 "$server_pid" 2>/dev/null && curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    local_ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "Mac의 Wi-Fi IP")
    echo "Keeper 데모 시작 완료"
    echo "점주 앱: http://$local_ip:$PORT/"
    echo "시뮬레이터: http://$local_ip:$PORT/simulator.html"
    echo "로그: $LOG_FILE"
    echo "종료: ./scripts/stop-demo.sh"
    exit 0
  fi
  sleep 0.25
done

echo "서버가 시작되지 않았습니다. ${LOG_FILE}을 확인하세요." >&2
exit 1
