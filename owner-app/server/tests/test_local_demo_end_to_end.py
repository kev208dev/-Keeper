from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

from keeper import repository
from keeper.db import connect
from keeper.main import create_app


def event(event_id: str, kind: str, **fields) -> dict:
    return {
        "eventId": event_id,
        "type": kind,
        "occurredAt": "2026-11-04T10:00:00+09:00",
        **fields,
    }


def test_local_demo_inquiry_media_camera_and_isolation_flow(tmp_path: Path):
    db_path = tmp_path / "demo.db"
    client = TestClient(
        create_app(
            db_path,
            clock=lambda: datetime(2026, 11, 4, 1, 0, tzinfo=UTC),
            media_root=tmp_path / "media",
        )
    )
    conn = connect(db_path)
    try:
        _, device_key = repository.create_store(conn, "시연 매장", "owner@demo.test", "demo-password")
        _, other_key = repository.create_store(conn, "다른 매장", "other@demo.test", "other-password")
    finally:
        conn.close()
    login = client.post("/api/auth/login", json={"email": "owner@demo.test", "password": "demo-password"})
    other_login = client.post("/api/auth/login", json={"email": "other@demo.test", "password": "other-password"})
    owner = {"Authorization": f"Bearer {login.json()['token']}"}
    other = {"Authorization": f"Bearer {other_login.json()['token']}"}
    tablet = {"X-Device-Key": device_key, "X-Device-Id": "tablet-demo"}

    inquiry = event(
        "inquiry-demo",
        "inquiry.created",
        title="결제 문제",
        note="결제했는데 문이 열리지 않아요",
        transcript=["고객: 결제했는데 문이 열리지 않아요"],
        status="forwarded",
        deviceId="tablet-demo",
    )
    assert client.post("/ingest/events", json=inquiry, headers=tablet).json() == {"status": "accepted"}
    assert client.post("/ingest/events", json=inquiry, headers=tablet).json() == {"status": "duplicate"}
    dashboard = client.get("/api/dashboard?since=2026-11-04T00:00:00%2B09:00", headers=owner).json()
    assert dashboard["inquiries"][0]["id"] == "inquiry-demo"

    reply = client.post(
        "/api/inquiries/inquiry-demo/replies", json={"body": "확인했습니다."}, headers=owner
    ).json()
    assert client.post(
        "/ingest/replies/pull",
        headers={"X-Device-Key": device_key, "X-Device-Id": "web-simulator"},
    ).json() == []
    assert [item["id"] for item in client.post("/ingest/replies/pull", headers=tablet).json()] == [reply["id"]]
    assert client.post(f"/ingest/replies/{reply['id']}/delivered", headers=tablet).status_code == 204

    camera = event(
        "camera-on",
        "camera.status",
        cameraId="cam-demo",
        name="시연 카메라",
        location="입구",
        status="connected",
    )
    assert client.post("/ingest/events", json=camera, headers=tablet).status_code == 202
    recording = b"\x00\x00\x00\x18ftypmp42demo-recording"
    uploaded = client.post(
        "/api/cameras/cam-demo/recordings?filename=recording.mp4", content=recording, headers=owner
    ).json()
    assert client.get(f"/api/media/{uploaded['id']}", headers=owner).content == recording
    assert client.get(f"/api/media/{uploaded['id']}", headers=other).status_code == 404

    movement = event(
        "movement-demo",
        "alert.movement",
        cameraId="cam-demo",
        **{
            "from": "진열대",
            "to": "출입구",
            "unpaid": False,
            "source": "analysis",
            "confidence": 0.82,
            "reason": "사람 추적 대상의 구역 이동",
        },
    )
    assert client.post("/ingest/events", json=movement, headers=tablet).status_code == 202
    clip = client.post(
        "/ingest/media?cameraId=cam-demo&kind=clip&filename=clip.mp4",
        content=b"\x00\x00\x00\x18ftypmp42demo-clip",
        headers=tablet,
    ).json()
    clip_event = event(
        "clip-demo",
        "clip.ready",
        alertEventId="movement-demo",
        duration="00:03",
        mediaId=clip["id"],
    )
    assert client.post("/ingest/events", json=clip_event, headers=tablet).status_code == 202

    camera["eventId"] = "camera-off"
    camera["status"] = "disconnected"
    assert client.post("/ingest/events", json=camera, headers=tablet).status_code == 202
    camera["eventId"] = "camera-recovered"
    camera["status"] = "connected"
    assert client.post("/ingest/events", json=camera, headers=tablet).status_code == 202
    dashboard = client.get("/api/dashboard?since=2026-11-04T00:00:00%2B09:00", headers=owner).json()
    assert dashboard["cameras"][0]["status"] == "connected"
    assert dashboard["alerts"][0]["source"] == "analysis"
    assert dashboard["clips"][0]["mediaId"] == clip["id"]
    assert client.post("/ingest/heartbeat", headers={"X-Device-Key": other_key}).status_code == 204
