"""한 매장의 계정이나 기기가 다른 매장의 데이터를 보거나 바꿀 수 없는지 검증한다."""

import pytest

from .conftest import clip_ready, door_closed, door_open, inquiry, movement


@pytest.fixture
def stores(make_store):
    a, b = make_store("a"), make_store("b")
    b.send_ok(
        {
            "eventId": "b-cam",
            "type": "camera.status",
            "occurredAt": "2026-10-23T09:00:00+09:00",
            "cameraId": "cam-b",
            "name": "B 매장 카메라",
            "location": "입구",
            "status": "connected",
        }
    )
    b.send_ok(movement("b-alert"))
    b.send_ok(door_open("b-door"))
    b.send_ok(clip_ready("b-alert", "b-clip"))
    b.send_ok(inquiry("b-inquiry"))
    return a, b


def test_dashboard_shows_only_own_store(stores):
    a, b = stores

    dashboard = a.dashboard(a.login())

    assert dashboard["store"]["name"] == "a"
    assert dashboard["cameras"] == dashboard["alerts"] == dashboard["clips"] == dashboard["inquiries"] == []
    assert len(b.dashboard(b.login())["alerts"]) == 2


def test_period_report_shows_only_own_store(stores):
    a, _ = stores

    response = a.client.get("/api/alerts", params={"start": "2026-10-23", "end": "2026-10-23"}, headers=a.login())

    assert response.json() == []


def test_cannot_confirm_another_stores_alert(stores):
    a, b = stores

    response = a.client.post("/api/alerts/b-alert/confirm", headers=a.login())

    assert response.status_code == 404
    assert all(not alert["confirmed"] for alert in b.dashboard(b.login())["alerts"])


def test_cannot_read_another_stores_inquiry(stores):
    a, b = stores

    response = a.client.post("/api/inquiries/b-inquiry/read", headers=a.login())

    assert response.status_code == 404
    assert b.dashboard(b.login())["inquiries"][0]["read"] is False


def test_other_stores_item_looks_the_same_as_a_missing_item(stores):
    a, _ = stores
    headers = a.login()

    other_store = a.client.post("/api/alerts/b-alert/confirm", headers=headers)
    missing = a.client.post("/api/alerts/none/confirm", headers=headers)

    assert other_store.status_code == missing.status_code
    assert other_store.json() == missing.json()


def test_device_cannot_close_another_stores_door(stores):
    a, b = stores

    assert a.send(door_closed("b-door")).status_code == 404

    door = next(alert for alert in b.dashboard(b.login())["alerts"] if alert["id"] == "b-door")
    assert door["closedAt"] is None


def test_device_cannot_attach_clip_to_another_stores_alert(stores):
    a, b = stores

    assert a.send(clip_ready("b-alert", "a-clip")).status_code == 404

    assert [clip["id"] for clip in b.dashboard(b.login())["clips"]] == ["b-clip"]


def test_same_ids_in_two_stores_stay_separate(stores):
    a, b = stores
    b_headers = b.login()
    a.send_ok(movement("b-alert"))

    a.client.post("/api/alerts/b-alert/confirm", headers=a.login())

    b_alert = next(alert for alert in b.dashboard(b_headers)["alerts"] if alert["id"] == "b-alert")
    assert b_alert["confirmed"] is False


def test_closing_a_door_does_not_touch_another_store_with_the_same_alert_id(stores):
    a, b = stores
    a.send_ok(door_open("b-door"))

    a.send_ok(door_closed("b-door"))

    a_door = a.dashboard(a.login())["alerts"][0]
    b_door = next(alert for alert in b.dashboard(b.login())["alerts"] if alert["id"] == "b-door")
    assert a_door["closedAt"] is not None
    assert b_door["closedAt"] is None


def test_device_cannot_change_another_stores_camera(stores):
    a, b = stores
    a.send_ok(
        {
            "eventId": "a-cam",
            "type": "camera.status",
            "occurredAt": "2026-10-23T09:00:00+09:00",
            "cameraId": "cam-b",
            "name": "덮어쓰기 시도",
            "location": "입구",
            "status": "disconnected",
        }
    )

    assert b.dashboard(b.login())["cameras"][0]["name"] == "B 매장 카메라"
