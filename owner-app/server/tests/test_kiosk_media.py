from pathlib import Path

from .conftest import clip_ready, inquiry, movement


def device_headers(store, device_id: str | None = None) -> dict[str, str]:
    headers = {"X-Device-Key": store.device_key}
    if device_id is not None:
        headers["X-Device-Id"] = device_id
    return headers


def register_camera(store, camera_id: str = "cam-01") -> None:
    store.send_ok(
        {
            "eventId": f"register-{camera_id}",
            "type": "camera.status",
            "occurredAt": "2026-10-23T09:00:00+09:00",
            "cameraId": camera_id,
            "name": "카메라 01",
            "location": "입구",
            "status": "connected",
        }
    )


def reply_to(store, inquiry_id: str) -> dict:
    response = store.client.post(
        f"/api/inquiries/{inquiry_id}/replies",
        json={"body": "확인했습니다. 잠시만 기다려 주세요."},
        headers=store.login(),
    )
    assert response.status_code == 201
    return response.json()


def test_reply_is_only_visible_and_acknowledgeable_by_originating_device(store):
    store.send_ok(inquiry() | {"deviceId": "tablet-01"})
    reply = reply_to(store, "q1")

    simulator = store.client.post(
        "/ingest/replies/pull", headers=device_headers(store, "web-simulator")
    )
    tablet = store.client.post(
        "/ingest/replies/pull", headers=device_headers(store, "tablet-01")
    )

    assert simulator.status_code == 200
    assert simulator.json() == []
    assert tablet.json() == [
        {
            "id": reply["id"],
            "inquiryId": "q1",
            "body": "확인했습니다. 잠시만 기다려 주세요.",
            "sentAt": reply["sentAt"],
        }
    ]
    wrong_ack = store.client.post(
        f"/ingest/replies/{reply['id']}/delivered",
        headers=device_headers(store, "web-simulator"),
    )
    assert wrong_ack.status_code == 404

    acknowledged = store.client.post(
        f"/ingest/replies/{reply['id']}/delivered",
        headers=device_headers(store, "tablet-01"),
    )
    assert acknowledged.status_code == 204
    assert store.client.post(
        "/ingest/replies/pull", headers=device_headers(store, "tablet-01")
    ).json() == []
    assert store.dashboard(store.login())["inquiries"][0]["replies"][0]["delivered"] is True


def test_legacy_inquiry_without_device_id_keeps_legacy_pull_contract(store):
    store.send_ok(inquiry())
    reply = reply_to(store, "q1")

    response = store.client.post("/ingest/replies/pull", headers=device_headers(store))

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [reply["id"]]


def test_duplicate_targeted_inquiry_is_stored_once(store):
    event = inquiry() | {"deviceId": "tablet-01"}

    first = store.send(event)
    second = store.send(event)

    assert first.json() == {"status": "accepted"}
    assert second.json() == {"status": "duplicate"}
    assert [item["id"] for item in store.dashboard(store.login())["inquiries"]] == ["q1"]


def test_owner_uploads_and_reads_recording_from_authenticated_store(store, tmp_path: Path):
    register_camera(store)
    payload = b"\x00\x00\x00\x18ftypmp42demo-video"

    upload = store.client.post(
        "/api/cameras/cam-01/recordings",
        params={"filename": "demo.mp4"},
        content=payload,
        headers={**store.login(), "Content-Type": "video/mp4"},
    )

    assert upload.status_code == 201
    media = upload.json()
    assert media["cameraId"] == "cam-01"
    assert media["kind"] == "recording"
    assert media["contentType"] == "video/mp4"
    assert media["sizeBytes"] == len(payload)
    dashboard = store.dashboard(store.login())
    assert dashboard["cameras"][0]["mediaId"] == media["id"]

    download = store.client.get(f"/api/media/{media['id']}", headers=store.login())
    assert download.status_code == 200
    assert download.content == payload
    assert download.headers["content-type"] == "video/mp4"


def test_recording_rejects_path_traversal_filename(store):
    register_camera(store)

    response = store.client.post(
        "/api/cameras/cam-01/recordings",
        params={"filename": "../outside.mp4"},
        content=b"video",
        headers={**store.login(), "Content-Type": "video/mp4"},
    )

    assert response.status_code == 422


def test_media_is_hidden_from_other_store(make_store):
    owner, stranger = make_store("owner"), make_store("stranger")
    register_camera(owner)
    upload = owner.client.post(
        "/api/cameras/cam-01/recordings",
        params={"filename": "private.mp4"},
        content=b"private-video",
        headers={**owner.login(), "Content-Type": "video/mp4"},
    )
    media_id = upload.json()["id"]

    other_store = stranger.client.get(f"/api/media/{media_id}", headers=stranger.login())
    missing = stranger.client.get("/api/media/missing", headers=stranger.login())

    assert other_store.status_code == missing.status_code == 404
    assert other_store.json() == missing.json()


def test_device_uploads_clip_and_links_media_to_alert(store):
    register_camera(store)
    store.send_ok(movement())
    payload = b"\x00\x00\x00\x18ftypmp42clip"
    upload = store.client.post(
        "/ingest/media",
        params={"cameraId": "cam-01", "kind": "clip", "filename": "event.mp4"},
        content=payload,
        headers={**device_headers(store, "analyzer-01"), "Content-Type": "video/mp4"},
    )
    assert upload.status_code == 201
    media_id = upload.json()["id"]

    linked = store.send(clip_ready() | {"mediaId": media_id})

    assert linked.status_code == 202
    assert store.dashboard(store.login())["clips"] == [
        {"id": "c1", "alertId": "m1", "duration": "00:14", "mediaId": media_id}
    ]
    assert store.client.get(f"/api/media/{media_id}", headers=store.login()).content == payload


def test_clip_cannot_link_media_from_another_store(make_store):
    first, second = make_store("first"), make_store("second")
    register_camera(first)
    register_camera(second)
    first.send_ok(movement())
    second.send_ok(movement())
    upload = second.client.post(
        "/ingest/media",
        params={"cameraId": "cam-01", "kind": "clip", "filename": "other.mp4"},
        content=b"other",
        headers={**device_headers(second, "analyzer-02"), "Content-Type": "video/mp4"},
    )

    response = first.send(clip_ready() | {"mediaId": upload.json()["id"]})

    assert response.status_code == 404
    assert first.dashboard(first.login())["clips"] == []
