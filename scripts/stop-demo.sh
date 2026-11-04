#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEMO="$ROOT/.demo"
SERVER="$ROOT/owner-app/server"
PID_FILE="$DEMO/server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "실행 중인 Keeper 데모 서버가 없습니다."
  exit 0
fi

server_pid=$(<"$PID_FILE")
if [[ ! "$server_pid" =~ ^[0-9]+$ ]] || ! kill -0 "$server_pid" 2>/dev/null; then
  rm -f "$PID_FILE" "$DEMO/caffeinate.pid"
  echo "종료된 서버의 PID 파일을 정리했습니다."
  exit 0
fi

server_command=$(ps -p "$server_pid" -o command= 2>/dev/null || true)
server_cwd=$(lsof -a -p "$server_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
if [[ "$server_command" != *"uvicorn asgi:app"* || "$server_cwd" != "$SERVER" ]]; then
  echo "PID ${server_pid}가 Keeper 서버가 아니므로 종료하지 않았습니다." >&2
  exit 1
fi

kill -TERM "$server_pid"
for _ in {1..40}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    rm -f "$PID_FILE" "$DEMO/caffeinate.pid"
    echo "Keeper 데모 서버를 종료했습니다."
    exit 0
  fi
  sleep 0.1
done

echo "서버가 4초 안에 종료되지 않았습니다. PID $server_pid 로그를 확인하세요." >&2
exit 1
