"""회원가입한 매장으로 시뮬레이터를 돌릴 수 있게 개발용 기기 키를 하나 더 만든다.

    python issue_device_key.py owner@example.com

키는 dev-device-keys.local.json에 저장되고 화면에는 표시되지 않는다. 개발 중에만 쓴다.
"""

import json
import sys
from pathlib import Path

from keeper import repository
from keeper.db import connect
from keeper.main import DEFAULT_DB_PATH

KEYS_PATH = Path(__file__).resolve().parent / "dev-device-keys.local.json"


def save_key(path: Path, email: str, device_key: str) -> None:
    keys = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    keys[email.strip().lower()] = device_key
    path.write_text(json.dumps(keys, indent=2), encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: python issue_device_key.py 이메일")
        return 1
    email = sys.argv[1]
    conn = connect(DEFAULT_DB_PATH)
    try:
        device_key = repository.add_device(conn, email)
    finally:
        conn.close()
    if device_key is None:
        print(f"{email} 계정을 찾을 수 없습니다. 회원가입한 이메일인지 확인하세요.")
        return 1
    save_key(KEYS_PATH, email, device_key)
    print(f"기기 키를 만들었습니다. 이제 python simulator.py --email {email} 로 실행하세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
