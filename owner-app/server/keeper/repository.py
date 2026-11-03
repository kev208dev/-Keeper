import json
import sqlite3
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from . import security
from .db import transaction
from .schemas import (
    CameraStatusEvent,
    ClipReadyEvent,
    DoorClosedEvent,
    DoorOpenEvent,
    InquiryCreatedEvent,
    MovementEvent,
    ProductDamageEvent,
)

KST = timezone(timedelta(hours=9))
RECENT_ALERT_COUNT = 5
# 관리용 앱은 1분마다 신호를 보낸다. 5분 동안 없으면 끊긴 것으로 본다
OFFLINE_AFTER = timedelta(minutes=5)
ATTEMPT_RETENTION = timedelta(days=1)
MAX_NOTICES = 50
# 휴대폰 알림은 점주가 브라우저 권한을 허용할 때 켠다
DEFAULT_NOTIFICATION_SETTINGS = {
    "push": False,
    "alert": True,
    "door": True,
    "inquiry": True,
    "camera": True,
    "sound": True,
}

ALERT_PRESENTATION = {
    "movement": {"label": "이상 행동 감지", "tone": "red", "title": "상품 이동 감지"},
    "duration": {"label": "주의 행동 감지", "tone": "orange", "title": "냉장고 문 장시간 개방"},
    "product": {"label": "이상 행동 감지", "tone": "green", "title": "상품 훼손 의심"},
}


class UnknownAlert(Exception):
    pass


class EmailTaken(Exception):
    pass


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_store(conn: sqlite3.Connection, name: str, email: str, password: str) -> tuple[str, str]:
    """매장, 점주 계정, 관리용 앱 키를 만들고 (store_id, device_key)를 돌려준다."""
    store_id = uuid4().hex
    device_key = security.new_secret()
    password_hash = security.hash_password(password)
    try:
        with transaction(conn):
            conn.execute("INSERT INTO stores (id, name) VALUES (?, ?)", (store_id, name))
            conn.execute(
                "INSERT INTO owners (store_id, email, password_hash) VALUES (?, ?, ?)",
                (store_id, normalize_email(email), password_hash),
            )
            conn.execute(
                "INSERT INTO devices (key_hash, store_id) VALUES (?, ?)",
                (security.hash_secret(device_key), store_id),
            )
    except sqlite3.IntegrityError:
        raise EmailTaken(email) from None
    return store_id, device_key


def too_many_attempts(conn: sqlite3.Connection, key: str, now: datetime, limit: int, window: timedelta) -> bool:
    count = conn.execute(
        "SELECT COUNT(*) FROM auth_attempts WHERE key = ? AND attempted_at > ?",
        (key, (now - window).timestamp()),
    ).fetchone()[0]
    return count >= limit


def record_attempt(conn: sqlite3.Connection, key: str, now: datetime) -> None:
    with transaction(conn):
        conn.execute(
            "DELETE FROM auth_attempts WHERE attempted_at <= ?",
            ((now - ATTEMPT_RETENTION).timestamp(),),
        )
        conn.execute("INSERT INTO auth_attempts (key, attempted_at) VALUES (?, ?)", (key, now.timestamp()))


def clear_attempts(conn: sqlite3.Connection, key: str) -> None:
    conn.execute("DELETE FROM auth_attempts WHERE key = ?", (key,))


def add_device(conn: sqlite3.Connection, email: str) -> str | None:
    """점주의 매장에 관리용 앱 키를 하나 더 만든다. 없는 계정이면 None을 돌려준다."""
    owner = conn.execute(
        "SELECT store_id FROM owners WHERE email = ?",
        (normalize_email(email),),
    ).fetchone()
    if owner is None:
        return None
    return issue_device(conn, owner["store_id"])


def issue_device(conn: sqlite3.Connection, store_id: str) -> str:
    device_key = security.new_secret()
    conn.execute(
        "INSERT INTO devices (key_hash, store_id) VALUES (?, ?)",
        (security.hash_secret(device_key), store_id),
    )
    return device_key


def login(conn: sqlite3.Connection, email: str, password: str, now: datetime, ttl: timedelta) -> str | None:
    owner = conn.execute(
        "SELECT id, password_hash FROM owners WHERE email = ?",
        (normalize_email(email),),
    ).fetchone()
    stored = owner["password_hash"] if owner else security.DUMMY_PASSWORD_HASH
    if not security.verify_password(password, stored) or owner is None:
        return None
    token = security.new_secret()
    with transaction(conn):
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now.timestamp(),))
        conn.execute(
            "INSERT INTO sessions (token_hash, owner_id, expires_at) VALUES (?, ?, ?)",
            (security.hash_secret(token), owner["id"], (now + ttl).timestamp()),
        )
    return token


def logout(conn: sqlite3.Connection, token: str) -> None:
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (security.hash_secret(token),))


def store_for_token(conn: sqlite3.Connection, token: str, now: datetime) -> str | None:
    row = conn.execute(
        """
        SELECT owners.store_id FROM sessions
        JOIN owners ON owners.id = sessions.owner_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
        """,
        (security.hash_secret(token), now.timestamp()),
    ).fetchone()
    return row["store_id"] if row else None


def store_for_device(conn: sqlite3.Connection, device_key: str) -> str | None:
    row = conn.execute(
        "SELECT store_id FROM devices WHERE key_hash = ?",
        (security.hash_secret(device_key),),
    ).fetchone()
    return row["store_id"] if row else None


def mark_device_seen(conn: sqlite3.Connection, device_key: str, now: datetime) -> None:
    conn.execute(
        "UPDATE devices SET last_seen_at = ? WHERE key_hash = ?",
        (now.timestamp(), security.hash_secret(device_key)),
    )


def _integration_view(conn: sqlite3.Connection, store_id: str, now: datetime) -> dict:
    last_seen = conn.execute(
        "SELECT MAX(last_seen_at) AS last_seen FROM devices WHERE store_id = ?",
        (store_id,),
    ).fetchone()["last_seen"]
    if last_seen is None:
        return {"status": "waiting", "lastSeenAt": None}
    seen_at = datetime.fromtimestamp(last_seen, KST)
    return {
        "status": "online" if now - seen_at <= OFFLINE_AFTER else "offline",
        "lastSeenAt": seen_at.isoformat(),
    }


def _insert_alert(conn, store_id: str, event, kind: str, details: dict) -> None:
    conn.execute(
        """
        INSERT INTO alerts (store_id, id, kind, occurred_at, occurred_ts, camera_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            store_id,
            event.eventId,
            kind,
            event.occurredAt.isoformat(),
            event.occurredAt.timestamp(),
            event.cameraId,
            json.dumps(details, ensure_ascii=False),
        ),
    )


def _require_alert(conn, store_id: str, alert_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM alerts WHERE store_id = ? AND id = ?", (store_id, alert_id)).fetchone()
    if row is None:
        raise UnknownAlert(alert_id)
    return row


def _apply_event(conn, store_id: str, event) -> None:
    match event:
        case MovementEvent():
            details = {"from": event.from_, "to": event.to, "unpaid": event.unpaid}
            _insert_alert(conn, store_id, event, "movement", details)
        case DoorOpenEvent():
            details = {
                "openedAt": event.openedAt.isoformat(),
                "closedAt": None,
                "limitMinutes": event.limitMinutes,
            }
            _insert_alert(conn, store_id, event, "duration", details)
        case ProductDamageEvent():
            _insert_alert(conn, store_id, event, "product", {"product": event.product})
        case DoorClosedEvent():
            alert = _require_alert(conn, store_id, event.alertEventId)
            details = json.loads(alert["details"]) | {"closedAt": event.occurredAt.isoformat()}
            conn.execute(
                "UPDATE alerts SET details = ? WHERE store_id = ? AND id = ?",
                (json.dumps(details, ensure_ascii=False), store_id, event.alertEventId),
            )
        case ClipReadyEvent():
            _require_alert(conn, store_id, event.alertEventId)
            conn.execute(
                "INSERT INTO clips (store_id, id, alert_id, duration) VALUES (?, ?, ?, ?)",
                (store_id, event.eventId, event.alertEventId, event.duration),
            )
        case InquiryCreatedEvent():
            conn.execute(
                """
                INSERT INTO inquiries (store_id, id, title, note, transcript, occurred_at, occurred_ts, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    store_id,
                    event.eventId,
                    event.title,
                    event.note,
                    json.dumps(event.transcript, ensure_ascii=False),
                    event.occurredAt.isoformat(),
                    event.occurredAt.timestamp(),
                    event.status,
                ),
            )
        case CameraStatusEvent():
            conn.execute(
                """
                INSERT INTO cameras (store_id, id, name, location, status) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (store_id, id) DO UPDATE SET
                  name = excluded.name, location = excluded.location, status = excluded.status
                """,
                (store_id, event.cameraId, event.name, event.location, event.status),
            )


def ingest_event(conn: sqlite3.Connection, store_id: str, event) -> bool:
    """이벤트를 한 번만 반영한다. 이미 처리한 eventId면 False를 돌려준다."""
    with transaction(conn):
        cursor = conn.execute(
            "INSERT OR IGNORE INTO processed_events (store_id, event_id) VALUES (?, ?)",
            (store_id, event.eventId),
        )
        if cursor.rowcount == 0:
            return False
        _apply_event(conn, store_id, event)
    return True


def _alert_view(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "kind": row["kind"],
        **ALERT_PRESENTATION[row["kind"]],
        "occurredAt": row["occurred_at"],
        "cameraId": row["camera_id"],
        "confirmed": bool(row["confirmed"]),
        "resolution": row["resolution"],
        **json.loads(row["details"]),
    }


def _reply_view(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "body": row["body"],
        "sentAt": row["sent_at"],
        "delivered": bool(row["delivered"]),
    }


def _replies_by_inquiry(conn: sqlite3.Connection, store_id: str) -> dict[str, list[dict]]:
    rows = conn.execute(
        "SELECT * FROM inquiry_replies WHERE store_id = ? ORDER BY sent_ts, id",
        (store_id,),
    ).fetchall()
    replies: dict[str, list[dict]] = {}
    for row in rows:
        replies.setdefault(row["inquiry_id"], []).append(_reply_view(row))
    return replies


def _inquiry_view(row: sqlite3.Row, replies: list[dict]) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "note": row["note"],
        "transcript": json.loads(row["transcript"]),
        "occurredAt": row["occurred_at"],
        "status": row["status"],
        "read": bool(row["read"]),
        "replies": replies,
    }


def get_notification_settings(conn: sqlite3.Connection, store_id: str) -> dict:
    row = conn.execute("SELECT settings FROM notification_settings WHERE store_id = ?", (store_id,)).fetchone()
    return DEFAULT_NOTIFICATION_SETTINGS | json.loads(row["settings"]) if row else DEFAULT_NOTIFICATION_SETTINGS


def save_notification_settings(conn: sqlite3.Connection, store_id: str, settings: dict) -> None:
    conn.execute(
        """
        INSERT INTO notification_settings (store_id, settings) VALUES (?, ?)
        ON CONFLICT (store_id) DO UPDATE SET settings = excluded.settings
        """,
        (store_id, json.dumps(settings)),
    )


def get_dashboard(conn: sqlite3.Connection, store_id: str, since: datetime, now: datetime) -> dict:
    """since 이후 항목, 아직 처리하지 않은 항목, 최근 활동에 쓸 최신 알림을 돌려준다."""
    since_ts = since.timestamp()
    store = conn.execute("SELECT name FROM stores WHERE id = ?", (store_id,)).fetchone()
    cameras = conn.execute(
        "SELECT id, name, location, status FROM cameras WHERE store_id = ? ORDER BY name, id",
        (store_id,),
    ).fetchall()
    alerts = conn.execute(
        """
        SELECT * FROM alerts
        WHERE store_id = :store AND (
          occurred_ts >= :since OR confirmed = 0 OR id IN (
            SELECT id FROM alerts WHERE store_id = :store ORDER BY occurred_ts DESC LIMIT :recent
          )
        )
        ORDER BY occurred_ts DESC
        """,
        {"store": store_id, "since": since_ts, "recent": RECENT_ALERT_COUNT},
    ).fetchall()
    alert_ids = {row["id"] for row in alerts}
    clips = conn.execute("SELECT id, alert_id, duration FROM clips WHERE store_id = ?", (store_id,)).fetchall()
    inquiries = conn.execute(
        """
        SELECT * FROM inquiries
        WHERE store_id = ? AND (occurred_ts >= ? OR (status = 'forwarded' AND read = 0))
        ORDER BY occurred_ts DESC
        """,
        (store_id, since_ts),
    ).fetchall()
    replies = _replies_by_inquiry(conn, store_id)
    return {
        "store": dict(store),
        "integration": _integration_view(conn, store_id, now),
        "cameras": [dict(row) for row in cameras],
        "alerts": [_alert_view(row) for row in alerts],
        "clips": [
            {"id": row["id"], "alertId": row["alert_id"], "duration": row["duration"]}
            for row in clips
            if row["alert_id"] in alert_ids
        ],
        "inquiries": [_inquiry_view(row, replies.get(row["id"], [])) for row in inquiries],
        "notificationSettings": get_notification_settings(conn, store_id),
    }


def get_alerts_in_period(conn: sqlite3.Connection, store_id: str, start: date, end: date) -> list[dict]:
    begin = datetime.combine(start, time.min, KST).timestamp()
    finish = datetime.combine(end + timedelta(days=1), time.min, KST).timestamp()
    rows = conn.execute(
        """
        SELECT * FROM alerts
        WHERE store_id = ? AND occurred_ts >= ? AND occurred_ts < ?
        ORDER BY occurred_ts DESC
        """,
        (store_id, begin, finish),
    ).fetchall()
    return [_alert_view(row) for row in rows]


def get_alert(conn: sqlite3.Connection, store_id: str, alert_id: str) -> dict | None:
    """오늘 목록에서 빠진 지난 알림도 상세 화면에서 볼 수 있게 알림과 클립을 돌려준다."""
    row = conn.execute("SELECT * FROM alerts WHERE store_id = ? AND id = ?", (store_id, alert_id)).fetchone()
    if row is None:
        return None
    clip = conn.execute(
        "SELECT id, alert_id, duration FROM clips WHERE store_id = ? AND alert_id = ? LIMIT 1",
        (store_id, alert_id),
    ).fetchone()
    return {
        "alert": _alert_view(row),
        "clip": clip and {"id": clip["id"], "alertId": clip["alert_id"], "duration": clip["duration"]},
    }


def confirm_alert(conn: sqlite3.Connection, store_id: str, alert_id: str, resolution: str) -> bool:
    """처음 내린 판단을 유지한다. 알림이 없으면 False를 돌려준다."""
    cursor = conn.execute(
        """
        UPDATE alerts SET confirmed = 1, resolution = COALESCE(resolution, ?)
        WHERE store_id = ? AND id = ?
        """,
        (resolution, store_id, alert_id),
    )
    return cursor.rowcount > 0


def mark_inquiry_read(conn: sqlite3.Connection, store_id: str, inquiry_id: str) -> bool:
    cursor = conn.execute(
        "UPDATE inquiries SET read = 1 WHERE store_id = ? AND id = ?",
        (store_id, inquiry_id),
    )
    return cursor.rowcount > 0


def add_reply(conn: sqlite3.Connection, store_id: str, inquiry_id: str, body: str, now: datetime) -> dict | None:
    """점주 답변을 저장한다. 관리용 앱이 가져가 키오스크에 띄운다. 문의가 없으면 None을 돌려준다."""
    reply_id = uuid4().hex
    with transaction(conn):
        updated = conn.execute(
            "UPDATE inquiries SET read = 1 WHERE store_id = ? AND id = ?",
            (store_id, inquiry_id),
        )
        if updated.rowcount == 0:
            return None
        conn.execute(
            """
            INSERT INTO inquiry_replies (store_id, id, inquiry_id, body, sent_at, sent_ts)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (store_id, reply_id, inquiry_id, body, now.astimezone(KST).isoformat(), now.timestamp()),
        )
    row = conn.execute(
        "SELECT * FROM inquiry_replies WHERE store_id = ? AND id = ?",
        (store_id, reply_id),
    ).fetchone()
    return _reply_view(row)


def get_waiting_replies(conn: sqlite3.Connection, store_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM inquiry_replies WHERE store_id = ? AND delivered = 0 ORDER BY sent_ts, id",
        (store_id,),
    ).fetchall()
    return [
        {"id": row["id"], "inquiryId": row["inquiry_id"], "body": row["body"], "sentAt": row["sent_at"]}
        for row in rows
    ]


def mark_reply_delivered(conn: sqlite3.Connection, store_id: str, reply_id: str) -> bool:
    cursor = conn.execute(
        "UPDATE inquiry_replies SET delivered = 1 WHERE store_id = ? AND id = ?",
        (store_id, reply_id),
    )
    return cursor.rowcount > 0


def rename_store(conn: sqlite3.Connection, store_id: str, name: str) -> None:
    conn.execute("UPDATE stores SET name = ? WHERE id = ?", (name, store_id))


def add_notice(conn: sqlite3.Connection, title: str, body: str, now: datetime) -> None:
    conn.execute(
        "INSERT INTO notices (title, body, published_at, published_ts) VALUES (?, ?, ?, ?)",
        (title, body, now.astimezone(KST).isoformat(), now.timestamp()),
    )


def get_notices(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM notices ORDER BY published_ts DESC, id DESC LIMIT ?",
        (MAX_NOTICES,),
    ).fetchall()
    return [
        {"id": row["id"], "title": row["title"], "body": row["body"], "publishedAt": row["published_at"]}
        for row in rows
    ]
