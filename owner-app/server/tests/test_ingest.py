from concurrent.futures import ThreadPoolExecutor

import pytest

from .conftest import clip_ready, door_closed, door_open, inquiry, movement


def test_device_key_is_required(client):
    assert client.post("/ingest/events", json=movement()).status_code == 401


def test_wrong_device_key_is_rejected(client):
    response = client.post("/ingest/events", json=movement(), headers={"X-Device-Key": "wrong"})

    assert response.status_code == 401


def test_owner_token_cannot_send_events(store):
    response = store.client.post("/ingest/events", json=movement(), headers=store.login())

    assert response.status_code == 401


def test_same_event_sent_twice_is_counted_once(store):
    first = store.send(movement())
    second = store.send(movement())

    assert first.json() == {"status": "accepted"}
    assert second.json() == {"status": "duplicate"}
    assert len(store.dashboard(store.login())["alerts"]) == 1


def test_concurrent_retries_create_one_alert(store):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: store.send(movement()).json()["status"], range(8)))

    assert results.count("accepted") == 1
    assert results.count("duplicate") == 7
    assert len(store.dashboard(store.login())["alerts"]) == 1


def test_duplicate_does_not_reset_confirmation(store):
    headers = store.login()
    store.send_ok(movement())
    store.client.post("/api/alerts/m1/confirm", headers=headers)

    store.send_ok(movement())

    assert store.dashboard(headers)["alerts"][0]["confirmed"] is True


def test_duplicate_inquiry_does_not_reset_read_state(store):
    headers = store.login()
    store.send_ok(inquiry())
    store.client.post("/api/inquiries/q1/read", headers=headers)

    store.send_ok(inquiry())

    assert store.dashboard(headers)["inquiries"][0]["read"] is True


@pytest.mark.parametrize(
    "change",
    [
        {"occurredAt": "2026-10-23T14:08:00"},
        {"occurredAt": "어제"},
        {"type": "alert.unknown"},
        {"extra": "field"},
        {"eventId": ""},
        {"eventId": "x" * 101},
        {"unpaid": "maybe"},
        {"from": ""},
    ],
)
def test_malformed_events_are_rejected_and_not_stored(store, change):
    response = store.send(movement() | change)

    assert response.status_code == 422
    assert store.dashboard(store.login())["alerts"] == []


def test_missing_required_field_is_rejected(store):
    event = movement()
    del event["cameraId"]

    assert store.send(event).status_code == 422


def test_door_closed_stops_the_timer(store):
    store.send_ok(door_open())

    store.send_ok(door_closed())

    alert = store.dashboard(store.login())["alerts"][0]
    assert alert["closedAt"] == "2026-10-23T14:55:00+09:00"
    assert alert["openedAt"] == "2026-10-23T14:32:00+09:00"
    assert alert["limitMinutes"] == 35


def test_open_door_has_no_close_time(store):
    store.send_ok(door_open())

    assert store.dashboard(store.login())["alerts"][0]["closedAt"] is None


def test_door_closed_before_open_can_be_retried(store):
    assert store.send(door_closed()).status_code == 404

    store.send_ok(door_open())
    store.send_ok(door_closed())

    assert store.dashboard(store.login())["alerts"][0]["closedAt"] is not None


def test_clip_for_unknown_alert_can_be_retried(store):
    assert store.send(clip_ready()).status_code == 404

    store.send_ok(movement())
    store.send_ok(clip_ready())

    assert store.dashboard(store.login())["clips"] == [{"id": "c1", "alertId": "m1", "duration": "00:14"}]


def test_camera_status_registers_then_updates(store):
    camera = {
        "eventId": "s1",
        "type": "camera.status",
        "occurredAt": "2026-10-23T09:00:00+09:00",
        "cameraId": "cam-09",
        "name": "카메라 09",
        "location": "계산대",
        "status": "connected",
    }
    store.send_ok(camera)
    store.send_ok(camera | {"eventId": "s2", "status": "disconnected"})

    assert store.dashboard(store.login())["cameras"] == [
        {"id": "cam-09", "name": "카메라 09", "location": "계산대", "status": "disconnected"}
    ]


def test_any_number_of_cameras_can_be_registered(store):
    for index in range(120):
        store.send_ok(
            {
                "eventId": f"s{index}",
                "type": "camera.status",
                "occurredAt": "2026-10-23T09:00:00+09:00",
                "cameraId": f"cam-{index}",
                "name": f"카메라 {index:03}",
                "location": "매장",
                "status": "connected",
            }
        )

    assert len(store.dashboard(store.login())["cameras"]) == 120


def test_html_in_inquiry_is_stored_as_plain_text(store):
    attack = "<img src=x onerror=alert(1)>"
    store.send_ok(inquiry() | {"title": attack})

    assert store.dashboard(store.login())["inquiries"][0]["title"] == attack


def test_sql_in_inquiry_is_stored_as_plain_text(store):
    attack = "'); DROP TABLE alerts; --"
    store.send_ok(movement())
    store.send_ok(inquiry() | {"title": attack})

    dashboard = store.dashboard(store.login())
    assert dashboard["inquiries"][0]["title"] == attack
    assert len(dashboard["alerts"]) == 1
