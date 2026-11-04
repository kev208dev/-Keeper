#!/usr/bin/env python3
"""Create and safely reset the repository-local Keeper demo database."""

import argparse
import json
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "owner-app" / "server"
sys.path.insert(0, str(SERVER))

from keeper import repository  # noqa: E402
from keeper.db import connect, init_db, transaction  # noqa: E402

EMAIL = "owner@keeper.local"
STORE_NAME = "#Keeper 시연 매장"


def _inside(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    demo_root = root.resolve()
    if resolved == demo_root or not resolved.is_relative_to(demo_root):
        raise ValueError(f"demo 경로 밖은 변경할 수 없습니다: {resolved}")
    return resolved


def _write_credentials(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(values, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)


def initialize_demo(db_path: Path, credentials_path: Path) -> dict[str, str]:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    init_db(db_path)
    existing = None
    if credentials_path.is_file():
        existing = json.loads(credentials_path.read_text(encoding="utf-8"))
    conn = connect(db_path)
    try:
        owner = conn.execute("SELECT store_id FROM owners WHERE email = ?", (EMAIL,)).fetchone()
        if owner is not None:
            if existing is None:
                raise RuntimeError("시연 DB는 있지만 credentials.json이 없습니다. DB를 보관하거나 함께 새로 만드세요.")
            return existing
        password = existing.get("password") if existing else secrets.token_urlsafe(12)
        _, device_key = repository.create_store(conn, STORE_NAME, EMAIL, password)
        details = {"email": EMAIL, "password": password, "deviceKey": device_key}
        _write_credentials(credentials_path, details)
        return details
    finally:
        conn.close()


def reset_demo(db_path: Path, media_root: Path, demo_root: Path) -> None:
    database = _inside(db_path, demo_root)
    media = _inside(media_root, demo_root)
    if database.parent != demo_root.resolve() or media.parent != demo_root.resolve():
        raise ValueError("demo DB와 media는 .demo 바로 아래에 있어야 합니다.")
    init_db(database)
    conn = connect(database)
    try:
        with transaction(conn):
            for table in (
                "clips",
                "alerts",
                "inquiry_replies",
                "inquiries",
                "media",
                "cameras",
                "processed_events",
            ):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("UPDATE devices SET last_seen_at = NULL")
    finally:
        conn.close()
    if media.exists():
        for path in sorted(media.rglob("*"), key=lambda item: len(item.parts), reverse=True):
            if path.is_symlink() or path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
    media.mkdir(parents=True, exist_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("init", "reset", "show"))
    parser.add_argument("--demo-root", type=Path, default=ROOT / ".demo")
    args = parser.parse_args()
    demo_root = args.demo_root.resolve()
    db_path = demo_root / "keeper.db"
    credentials = demo_root / "credentials.json"
    media = demo_root / "media"
    if args.command == "reset":
        reset_demo(db_path, media, demo_root)
        print("시연 이벤트와 미디어를 초기화했습니다. 매장 계정은 유지됩니다.")
    else:
        details = initialize_demo(db_path, credentials)
        if args.command == "show":
            print(json.dumps(details, ensure_ascii=False, indent=2))
        else:
            print(f"시연 매장 준비 완료: {details['email']} ({credentials})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
