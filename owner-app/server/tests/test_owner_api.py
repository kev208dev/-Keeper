from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest

from .conftest import clip_ready, door_open, inquiry, movement


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_login_returns_a_working_token(store):
    headers = store.login()

    assert store.client.get(
        "/api/dashboard", params={"since": "2026-10-23T00:00:00+09:00"}, headers=headers
    ).status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_answer(store):
    wrong_password = login(store.client, store.email, "wrong")
    unknown_email = login(store.client, "nobody@keeper.test", "wrong")

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


@pytest.mark.parametrize(
    "request_args",
    [
        ("GET", "/api/dashboard?since=2026-10-23T00:00:00%2B09:00"),
        ("GET", "/api/alerts?start=2026-10-17&end=2026-10-23"),
        ("POST", "/api/alerts/m1/confirm"),
        ("POST", "/api/inquiries/q1/read"),
    ],
)
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"X-Device-Key": "wrong"}])
def test_owner_api_requires_login(client, request_args, headers):
    method, url = request_args

    assert client.request(method, url, headers=headers).status_code == 401


def test_device_key_cannot_read_owner_data(store):
    response = store.client.get(
        "/api/dashboard",
        params={"since": "2026-10-23T00:00:00+09:00"},
        headers={"Authorization": f"Bearer {store.device_key}"},
    )

    assert response.status_code == 401


def test_session_expires_after_thirty_days(store, clock):
    headers = store.login()
    params = {"since": "2026-10-23T00:00:00+09:00"}

    clock.now += timedelta(days=29)
    assert store.client.get("/api/dashboard", params=params, headers=headers).status_code == 200

    clock.now += timedelta(days=2)
    assert store.client.get("/api/dashboard", params=params, headers=headers).status_code == 401


def test_logout_ends_the_session(store):
    headers = store.login()
    params = {"since": "2026-10-23T00:00:00+09:00"}

    assert store.client.post("/api/auth/logout", headers=headers).status_code == 204

    assert store.client.get("/api/dashboard", params=params, headers=headers).status_code == 401


def test_logout_without_token_is_harmless(client):
    assert client.post("/api/auth/logout").status_code == 204


def test_dashboard_requires_a_timezone_on_since(store):
    response = store.client.get(
        "/api/dashboard",
        params={"since": "2026-10-23T00:00:00"},
        headers=store.login(),
    )

    assert response.status_code == 422


def test_dashboard_keeps_old_unconfirmed_alerts_but_not_old_confirmed_ones(store):
    headers = store.login()
    for index in range(6):
        store.send_ok(movement(f"old-{index}", f"2026-10-1{index}T10:00:00+09:00"))
        store.client.post(f"/api/alerts/old-{index}/confirm", headers=headers)
    store.send_ok(movement("old-unconfirmed", "2026-10-01T10:00:00+09:00"))
    store.send_ok(movement("today"))

    ids = [alert["id"] for alert in store.dashboard(headers)["alerts"]]

    assert "today" in ids
    assert "old-unconfirmed" in ids
    assert "old-0" not in ids


def test_dashboard_always_includes_latest_alerts_for_recent_activity(store):
    headers = store.login()
    for index in range(6):
        store.send_ok(movement(f"old-{index}", f"2026-10-1{index}T10:00:00+09:00"))
        store.client.post(f"/api/alerts/old-{index}/confirm", headers=headers)

    ids = [alert["id"] for alert in store.dashboard(headers)["alerts"]]

    assert ids == ["old-5", "old-4", "old-3", "old-2", "old-1"]


def test_dashboard_keeps_unread_forwarded_inquiries_from_past_days(store):
    headers = store.login()
    store.send_ok(inquiry("past-unread", occurred_at="2026-10-20T10:00:00+09:00"))
    store.send_ok(inquiry("past-ai", status="ai_resolved", occurred_at="2026-10-20T10:00:00+09:00"))
    store.send_ok(inquiry("today-ai", status="ai_resolved"))

    ids = [item["id"] for item in store.dashboard(headers)["inquiries"]]

    assert ids == ["today-ai", "past-unread"]


def test_dashboard_only_returns_clips_of_returned_alerts(store):
    headers = store.login()
    for index in range(6):
        store.send_ok(movement(f"old-{index}", f"2026-10-1{index}T10:00:00+09:00"))
        store.client.post(f"/api/alerts/old-{index}/confirm", headers=headers)
    store.send_ok(clip_ready("old-0", "c-old"))
    store.send_ok(clip_ready("old-3", "c-new"))

    assert [clip["id"] for clip in store.dashboard(headers)["clips"]] == ["c-new"]


def test_confirm_persists_and_can_be_repeated(store):
    headers = store.login()
    store.send_ok(movement())

    assert store.client.post("/api/alerts/m1/confirm", headers=headers).status_code == 204
    assert store.client.post("/api/alerts/m1/confirm", headers=headers).status_code == 204

    assert store.dashboard(store.login())["alerts"][0]["confirmed"] is True


def test_two_devices_confirming_at_once_both_succeed(store):
    first, second = store.login(), store.login()
    store.send_ok(movement())

    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(
            pool.map(lambda headers: store.client.post("/api/alerts/m1/confirm", headers=headers).status_code, [first, second])
        )

    assert codes == [204, 204]


def test_confirming_unknown_alert_returns_404(store):
    assert store.client.post("/api/alerts/none/confirm", headers=store.login()).status_code == 404


def test_read_persists(store):
    headers = store.login()
    store.send_ok(inquiry())

    assert store.client.post("/api/inquiries/q1/read", headers=headers).status_code == 204

    assert store.dashboard(headers)["inquiries"][0]["read"] is True


def test_reading_unknown_inquiry_returns_404(store):
    assert store.client.post("/api/inquiries/none/read", headers=store.login()).status_code == 404


def test_alert_period_uses_korean_day_boundaries(store):
    headers = store.login()
    store.send_ok(movement("before", "2026-10-16T23:59:59+09:00"))
    store.send_ok(movement("first", "2026-10-17T00:00:00+09:00"))
    store.send_ok(movement("last", "2026-10-23T23:59:59+09:00"))
    store.send_ok(movement("after", "2026-10-24T00:00:00+09:00"))

    response = store.client.get("/api/alerts", params={"start": "2026-10-17", "end": "2026-10-23"}, headers=headers)

    assert [alert["id"] for alert in response.json()] == ["last", "first"]


def test_alert_period_accepts_utc_events_at_the_boundary(store):
    headers = store.login()
    store.send_ok(movement("utc", "2026-10-16T15:00:00Z"))

    response = store.client.get("/api/alerts", params={"start": "2026-10-17", "end": "2026-10-17"}, headers=headers)

    assert [alert["id"] for alert in response.json()] == ["utc"]


def test_alert_period_rejects_reversed_dates(store):
    response = store.client.get(
        "/api/alerts", params={"start": "2026-10-23", "end": "2026-10-17"}, headers=store.login()
    )

    assert response.status_code == 422


def test_alert_period_allows_31_days_and_rejects_32(store):
    headers = store.login()

    ok = store.client.get("/api/alerts", params={"start": "2026-09-23", "end": "2026-10-23"}, headers=headers)
    too_long = store.client.get("/api/alerts", params={"start": "2026-09-22", "end": "2026-10-23"}, headers=headers)

    assert ok.status_code == 200
    assert too_long.status_code == 422


def test_door_alert_is_returned_with_presentation_fields(store):
    headers = store.login()
    store.send_ok(door_open())

    alert = store.dashboard(headers)["alerts"][0]

    assert alert["label"] == "주의 행동 감지"
    assert alert["tone"] == "orange"
    assert alert["title"] == "냉장고 문 장시간 개방"
