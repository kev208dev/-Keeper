"""서버를 끄지 않고 DB를 백업한다.

    python -m keeper.backup /data/backups

호스팅 서비스의 예약 작업으로 하루 한 번 실행한다. 최근 14개만 남긴다.
"""

import os
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

from .main import DEFAULT_DB_PATH

KEEP_COUNT = 14


def back_up(db_path: str | Path, backup_dir: str | Path, now: datetime, keep: int = KEEP_COUNT) -> Path:
    directory = Path(backup_dir)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"keeper-{now:%Y%m%d-%H%M%S}.db"

    source = sqlite3.connect(db_path)
    destination = sqlite3.connect(target)
    try:
        with destination:
            source.backup(destination)
    finally:
        destination.close()
        source.close()

    for old in sorted(directory.glob("keeper-*.db"))[:-keep]:
        old.unlink()
    return target


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: python -m keeper.backup 백업폴더")
        return 1
    db_path = os.environ.get("KEEPER_DB_PATH", DEFAULT_DB_PATH)
    print(f"백업 완료: {back_up(db_path, sys.argv[1], datetime.now(UTC))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
