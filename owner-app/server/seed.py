"""개발용 매장과 점주 계정, 관리용 앱 키를 만든다. 이벤트는 만들지 않는다.

계정 정보는 dev-credentials.local.json에 저장된다.
"""

import json
import secrets
from pathlib import Path

from keeper import repository
from keeper.db import connect, init_db
from keeper.main import DEFAULT_DB_PATH

CREDENTIALS_PATH = Path(__file__).resolve().parent / "dev-credentials.local.json"
EMAIL = "owner@keeper.test"
STORE_NAME = "우리동네 아이스크림점"


def main() -> None:
    init_db(DEFAULT_DB_PATH)
    conn = connect(DEFAULT_DB_PATH)
    try:
        if conn.execute("SELECT 1 FROM owners WHERE email = ?", (EMAIL,)).fetchone():
            print(f"{EMAIL} 계정이 이미 있습니다. 다시 만들려면 keeper.db를 지우고 실행하세요.")
            return
        password = secrets.token_urlsafe(16)
        _, device_key = repository.create_store(conn, STORE_NAME, EMAIL, password)
        CREDENTIALS_PATH.write_text(
            json.dumps({"email": EMAIL, "password": password, "deviceKey": device_key}, indent=2),
            encoding="utf-8",
        )
        print(f"개발용 매장을 만들었습니다. 계정 정보: {CREDENTIALS_PATH.name}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
