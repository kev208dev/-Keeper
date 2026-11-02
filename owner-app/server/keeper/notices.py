"""점주 앱의 공지사항을 등록한다.

    python -m keeper.notices "제목" "내용"

모든 매장의 점주에게 같은 공지가 보인다.
"""

import os
import sys
from datetime import UTC, datetime

from . import repository
from .db import connect, init_db
from .main import DEFAULT_DB_PATH


def publish(db_path: str, title: str, body: str, now: datetime) -> None:
    init_db(db_path)
    conn = connect(db_path)
    try:
        repository.add_notice(conn, title, body, now)
    finally:
        conn.close()


def main() -> int:
    if len(sys.argv) != 3 or not sys.argv[1].strip() or not sys.argv[2].strip():
        print('사용법: python -m keeper.notices "제목" "내용"')
        return 1
    publish(os.environ.get("KEEPER_DB_PATH", DEFAULT_DB_PATH), sys.argv[1].strip(), sys.argv[2].strip(), datetime.now(UTC))
    print("공지사항을 등록했습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
