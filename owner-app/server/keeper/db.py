import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id),
  expires_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  key_hash TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  last_seen_at REAL
);

CREATE TABLE IF NOT EXISTS processed_events (
  store_id TEXT NOT NULL REFERENCES stores(id),
  event_id TEXT NOT NULL,
  PRIMARY KEY (store_id, event_id)
);

CREATE TABLE IF NOT EXISTS cameras (
  store_id TEXT NOT NULL REFERENCES stores(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (store_id, id)
);

CREATE TABLE IF NOT EXISTS alerts (
  store_id TEXT NOT NULL REFERENCES stores(id),
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  occurred_ts REAL NOT NULL,
  camera_id TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  details TEXT NOT NULL,
  PRIMARY KEY (store_id, id)
);
CREATE INDEX IF NOT EXISTS alerts_by_time ON alerts (store_id, occurred_ts);

CREATE TABLE IF NOT EXISTS clips (
  store_id TEXT NOT NULL REFERENCES stores(id),
  id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  duration TEXT NOT NULL,
  PRIMARY KEY (store_id, id),
  FOREIGN KEY (store_id, alert_id) REFERENCES alerts (store_id, id)
);

CREATE TABLE IF NOT EXISTS inquiries (
  store_id TEXT NOT NULL REFERENCES stores(id),
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL,
  transcript TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  occurred_ts REAL NOT NULL,
  status TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, id)
);
CREATE INDEX IF NOT EXISTS inquiries_by_time ON inquiries (store_id, occurred_ts);
"""

AUTH_ATTEMPTS = """
CREATE TABLE IF NOT EXISTS auth_attempts (
  key TEXT NOT NULL,
  attempted_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_by_key ON auth_attempts (key, attempted_at);
"""

OWNER_FEATURES = """
ALTER TABLE alerts ADD COLUMN resolution TEXT;

CREATE TABLE IF NOT EXISTS inquiry_replies (
  store_id TEXT NOT NULL REFERENCES stores(id),
  id TEXT NOT NULL,
  inquiry_id TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  sent_ts REAL NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, id),
  FOREIGN KEY (store_id, inquiry_id) REFERENCES inquiries (store_id, id)
);
CREATE INDEX IF NOT EXISTS inquiry_replies_waiting ON inquiry_replies (store_id, delivered, sent_ts);

CREATE TABLE IF NOT EXISTS notification_settings (
  store_id TEXT PRIMARY KEY REFERENCES stores(id),
  settings TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TEXT NOT NULL,
  published_ts REAL NOT NULL
);
"""

# DB 구조를 바꿀 때는 기존 항목을 고치지 않고 맨 뒤에 추가한다
MIGRATIONS = [SCHEMA, AUTH_ATTEMPTS, OWNER_FEATURES]


def connect(path: str | Path) -> sqlite3.Connection:
    # FastAPI가 의존성과 경로 함수를 서로 다른 스레드에서 실행할 수 있다
    conn = sqlite3.connect(path, timeout=10, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for index in range(version, len(MIGRATIONS)):
            conn.executescript(MIGRATIONS[index])
            conn.execute(f"PRAGMA user_version = {index + 1}")
    finally:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection):
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
