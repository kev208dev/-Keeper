"""관리용 앱 연결 상태를 검증한다. 0건이 연동 전인지 정말 없는 것인지 구분하는 근거가 된다."""

from datetime import timedelta

from .conftest import movement


def integration(store) -> dict:
    return store.dashboard(store.login())["integration"]


def heartbeat(store, key: str | None = None):
    headers = {"X-Device-Key": key or store.device_key}
    return store.client.post("/ingest/heartbeat", headers=headers)


def test_new_store_has_no_data_and_waits_for_the_device(store):
    dashboard = store.dashboard(store.login())

    assert dashboard["integration"] == {"status": "waiting", "lastSeenAt": None}
    assert dashboard["cameras"] == dashboard["alerts"] == dashboard["clips"] == dashboard["inquiries"] == []


def test_first_event_turns_the_store_online(store):
    store.send_ok(movement())

    assert integration(store) == {"status": "online", "lastSeenAt": "2026-10-23T15:00:00+09:00"}


def test_heartbeat_turns_the_store_online_without_creating_data(store):
    assert heartbeat(store).status_code == 204

    dashboard = store.dashboard(store.login())
    assert dashboard["integration"]["status"] == "online"
    assert dashboard["alerts"] == []


def test_store_stays_online_for_five_minutes(store, clock):
    heartbeat(store)

    clock.now += timedelta(minutes=5)

    assert integration(store)["status"] == "online"


def test_store_goes_offline_after_five_silent_minutes(store, clock):
    heartbeat(store)

    clock.now += timedelta(minutes=5, seconds=1)

    assert integration(store) == {"status": "offline", "lastSeenAt": "2026-10-23T15:00:00+09:00"}


def test_heartbeat_brings_an_offline_store_back(store, clock):
    heartbeat(store)
    clock.now += timedelta(hours=1)

    heartbeat(store)

    assert integration(store)["status"] == "online"


def test_duplicate_event_still_counts_as_a_sign_of_life(store, clock):
    store.send_ok(movement())
    clock.now += timedelta(hours=1)

    store.send_ok(movement())

    assert integration(store)["status"] == "online"


def test_malformed_event_does_not_count_as_a_sign_of_life(store):
    assert store.send({"eventId": "bad"}).status_code == 422

    assert integration(store)["status"] == "waiting"


def test_wrong_key_does_not_count_as_a_sign_of_life(store):
    assert heartbeat(store, "wrong").status_code == 401

    assert integration(store)["status"] == "waiting"


def test_heartbeat_requires_a_device_key(client):
    assert client.post("/ingest/heartbeat").status_code == 401


def test_one_stores_device_does_not_affect_another_store(make_store):
    a, b = make_store("a"), make_store("b")

    heartbeat(a)

    assert integration(a)["status"] == "online"
    assert integration(b)["status"] == "waiting"
