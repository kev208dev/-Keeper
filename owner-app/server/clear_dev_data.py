"""개발 DB의 이벤트를 모두 지운다. 매장과 계정은 남으므로 다시 로그인하지 않아도 된다.

시뮬레이터로 시험한 뒤 연동 전 상태로 돌아갈 때 쓴다. 실제 운영 DB에는 실행하지 않는다.
"""

from keeper.db import connect, transaction
from keeper.main import DEFAULT_DB_PATH


def clear(conn) -> None:
    with transaction(conn):
        for table in ("clips", "alerts", "inquiry_replies", "inquiries", "cameras", "processed_events"):
            conn.execute(f"DELETE FROM {table}")
        conn.execute("UPDATE devices SET last_seen_at = NULL")


def main() -> None:
    conn = connect(DEFAULT_DB_PATH)
    try:
        clear(conn)
    finally:
        conn.close()
    print("이벤트를 모두 지웠습니다. 점주 앱은 연동 대기 상태로 돌아갑니다.")


if __name__ == "__main__":
    main()
