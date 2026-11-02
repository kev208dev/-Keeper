import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from keeper import repository
from keeper.db import connect
from keeper.main import create_app

CONTRACT_DIR = Path(__file__).resolve().parents[2] / "contract"
NOW = datetime(2026, 10, 23, 6, 0, tzinfo=UTC)  # 한국 시간 15:00


@dataclass
class Store:
    """매장 하나의 점주와 관리용 앱을 흉내 내는 테스트 도우미."""

    client: TestClient
    store_id: str
    email: str
    password: str
    device_key: str

    def login(self) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"email": self.email, "password": self.password})
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def send(self, event: dict):
        return self.client.post("/ingest/events", json=event, headers={"X-Device-Key": self.device_key})

    def send_ok(self, event: dict) -> None:
        assert self.send(event).status_code == 202

    def dashboard(self, headers: dict[str, str], since: str = "2026-10-23T00:00:00+09:00") -> dict:
        response = self.client.get("/api/dashboard", params={"since": since}, headers=headers)
        assert response.status_code == 200
        return response.json()


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test.db"


@pytest.fixture
def client(db_path: Path, clock: Clock) -> TestClient:
    return TestClient(create_app(db_path, clock=clock))


@pytest.fixture
def make_store(client: TestClient, db_path: Path):
    def make(name: str) -> Store:
        email = f"{name}@keeper.test"
        password = f"test-password-{name}"
        conn = connect(db_path)
        try:
            store_id, device_key = repository.create_store(conn, name, email, password)
        finally:
            conn.close()
        return Store(client, store_id, email, password, device_key)

    return make


@pytest.fixture
def store(make_store) -> Store:
    return make_store("a")


@pytest.fixture
def schema() -> dict:
    return json.loads((CONTRACT_DIR / "keeper.schema.json").read_text(encoding="utf-8"))


@pytest.fixture
def example_events() -> list[dict]:
    return json.loads((CONTRACT_DIR / "examples" / "events.json").read_text(encoding="utf-8"))


def movement(event_id: str = "m1", occurred_at: str = "2026-10-23T14:08:00+09:00", **overrides) -> dict:
    return {
        "eventId": event_id,
        "type": "alert.movement",
        "occurredAt": occurred_at,
        "cameraId": "cam-01",
        "from": "입구 진열대",
        "to": "냉동고 구역",
        "unpaid": True,
        **overrides,
    }


def door_open(event_id: str = "d1", occurred_at: str = "2026-10-23T14:42:00+09:00") -> dict:
    return {
        "eventId": event_id,
        "type": "alert.door_open",
        "occurredAt": occurred_at,
        "cameraId": "cam-01",
        "openedAt": "2026-10-23T14:32:00+09:00",
        "limitMinutes": 35,
    }


def door_closed(alert_id: str = "d1", event_id: str = "dc1") -> dict:
    return {
        "eventId": event_id,
        "type": "door.closed",
        "occurredAt": "2026-10-23T14:55:00+09:00",
        "alertEventId": alert_id,
    }


def clip_ready(alert_id: str = "m1", event_id: str = "c1") -> dict:
    return {
        "eventId": event_id,
        "type": "clip.ready",
        "occurredAt": "2026-10-23T14:09:00+09:00",
        "alertEventId": alert_id,
        "duration": "00:14",
    }


def inquiry(event_id: str = "q1", status: str = "forwarded", occurred_at: str = "2026-10-23T14:08:00+09:00") -> dict:
    return {
        "eventId": event_id,
        "type": "inquiry.created",
        "occurredAt": occurred_at,
        "title": "결제 후 상품이 나오지 않아요",
        "note": "점주에게 전달됨",
        "transcript": ["고객: 상품이 나오지 않아요."],
        "status": status,
    }
