import importlib.util
import re
import subprocess
from pathlib import Path

import pytest

from keeper import repository
from keeper.db import connect, init_db

ROOT = Path(__file__).resolve().parents[3]
DEMO_DATA = ROOT / "scripts" / "demo_data.py"


def load_demo_data():
    spec = importlib.util.spec_from_file_location("demo_data", DEMO_DATA)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_shell_entrypoints_are_valid_bash():
    for path in sorted((ROOT / "scripts").glob("*.sh")):
        result = subprocess.run(["bash", "-n", path], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr


def test_shell_variables_next_to_korean_text_are_braced():
    unsafe = re.compile(r"\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]")
    for path in sorted((ROOT / "scripts").glob("*.sh")):
        assert unsafe.search(path.read_text(encoding="utf-8")) is None, path


def test_reset_is_limited_to_the_demo_directory(tmp_path: Path):
    demo_data = load_demo_data()
    outside = tmp_path / "keeper.db"
    init_db(outside)

    with pytest.raises(ValueError, match="demo"):
        demo_data.reset_demo(outside, tmp_path / "media", tmp_path / ".demo")


def test_reset_removes_demo_events_and_media_but_preserves_account(tmp_path: Path):
    demo_data = load_demo_data()
    demo_root = tmp_path / ".demo"
    db_path = demo_root / "keeper.db"
    media_root = demo_root / "media"
    credentials = demo_root / "credentials.json"
    details = demo_data.initialize_demo(db_path, credentials)
    conn = connect(db_path)
    try:
        store_id = conn.execute("SELECT id FROM stores").fetchone()["id"]
        conn.execute(
            "INSERT INTO cameras (store_id, id, name, location, status) VALUES (?, ?, ?, ?, ?)",
            (store_id, "cam-01", "테스트 카메라", "입구", "connected"),
        )
        conn.execute(
            "INSERT INTO processed_events (store_id, event_id) VALUES (?, ?)",
            (store_id, "cam-on"),
        )
        conn.commit()
    finally:
        conn.close()
    media_root.mkdir(parents=True)
    (media_root / "clip.mp4").write_bytes(b"demo")

    demo_data.reset_demo(db_path, media_root, demo_root)

    conn = connect(db_path)
    try:
        assert conn.execute("SELECT count(*) FROM owners").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM cameras").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM processed_events").fetchone()[0] == 0
    finally:
        conn.close()
    assert details["email"] == "owner@keeper.local"
    assert credentials.is_file()
    assert list(media_root.rglob("*")) == []
