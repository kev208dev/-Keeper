from datetime import UTC, datetime, timedelta

import pytest

from clear_dev_data import clear
from issue_device_key import save_key
from keeper import repository
from keeper.db import connect
from simulator import Device, DeviceError, build_steps, load_device_key, run_scenario

from .conftest import movement
from .test_contract import validator_for

NOW = datetime(2026, 10, 23, 6, 0, tzinfo=UTC)


def transport_for(store):
    def send(path, body):
        response = store.client.post(path, json=body, headers={"X-Device-Key": store.device_key})
        return response.status_code, response.json() if response.content else None

    return send


def run(store, run_id="run-1"):
    return run_scenario(
        Device(transport_for(store)),
        sleep=lambda _: None,
        clock=lambda: NOW,
        log=lambda _: None,
        run_id=run_id,
    )


def test_scenario_events_match_the_contract(schema):
    validator = validator_for(schema, "IngestEvent")

    for step in build_steps("run-1"):
        validator.validate(step.build(NOW))


def test_scenario_produces_every_kind_of_data(store):
    run(store)

    dashboard = store.dashboard(store.login())

    assert dashboard["integration"]["status"] == "online"
    assert {alert["kind"] for alert in dashboard["alerts"]} == {"movement", "duration", "product"}
    assert len(dashboard["clips"]) == 1
    assert len(dashboard["inquiries"]) == 2
    assert all(camera["status"] == "connected" for camera in dashboard["cameras"])


def test_scenario_resends_one_event_and_the_server_ignores_it(store):
    results = run(store)

    assert results.count("duplicate") == 1
    assert len(store.dashboard(store.login())["alerts"]) == 3


def test_scenario_ends_with_the_door_closed(store):
    run(store)

    door = next(alert for alert in store.dashboard(store.login())["alerts"] if alert["kind"] == "duration")

    assert door["closedAt"] is not None


def test_running_twice_adds_new_events(store):
    run(store, "run-1")
    run(store, "run-2")

    assert len(store.dashboard(store.login())["alerts"]) == 6


def test_speed_shortens_the_waits(store):
    waits = []
    run_scenario(Device(transport_for(store)), speed=10, sleep=waits.append, clock=lambda: NOW, log=lambda _: None)

    assert sum(waits) == pytest.approx(sum(step.delay for step in build_steps("x")) / 10)


def test_device_retries_after_a_network_failure():
    calls = []

    def flaky(path, body):
        calls.append(body["eventId"])
        if len(calls) < 3:
            raise ConnectionError("down")
        return 202, {"status": "accepted"}

    result = Device(flaky, sleep=lambda _: None).send({"eventId": "same", "type": "alert.movement"})

    assert result == "accepted"
    assert calls == ["same", "same", "same"]


def test_device_gives_up_with_a_clear_message():
    def down(path, body):
        raise ConnectionError("down")

    with pytest.raises(DeviceError, match="서버가 실행 중인지"):
        Device(down, sleep=lambda _: None).heartbeat()


def test_device_reports_a_wrong_key(store):
    def rejected(path, body):
        return 401, None

    with pytest.raises(DeviceError, match="기기 키"):
        Device(rejected).heartbeat()


def test_device_reports_a_rejected_event(store):
    with pytest.raises(DeviceError, match="거부"):
        Device(transport_for(store)).send({"eventId": "bad", "type": "alert.movement"})


def test_clearing_dev_data_returns_to_waiting_and_keeps_the_login(store, db_path):
    run(store)
    headers = store.login()

    conn = connect(db_path)
    try:
        clear(conn)
    finally:
        conn.close()

    dashboard = store.dashboard(headers)
    assert dashboard["integration"] == {"status": "waiting", "lastSeenAt": None}
    assert dashboard["alerts"] == dashboard["cameras"] == dashboard["inquiries"] == dashboard["clips"] == []


def test_events_can_be_replayed_after_clearing(store, db_path):
    run(store)
    conn = connect(db_path)
    try:
        clear(conn)
    finally:
        conn.close()

    run(store)

    assert len(store.dashboard(store.login())["alerts"]) == 3


def issue_key(db_path, email):
    conn = connect(db_path)
    try:
        return repository.add_device(conn, email)
    finally:
        conn.close()


def test_extra_key_sends_events_to_that_owners_store_only(make_store, db_path):
    target, other = make_store("target"), make_store("other")

    key = issue_key(db_path, target.email.upper())
    response = target.client.post("/ingest/events", json=movement(), headers={"X-Device-Key": key})

    assert response.status_code == 202
    assert len(target.dashboard(target.login())["alerts"]) == 1
    assert other.dashboard(other.login())["alerts"] == []


def test_extra_key_keeps_the_original_key_working(store, db_path):
    issue_key(db_path, store.email)

    store.send_ok(movement())


def test_no_key_is_issued_for_an_unknown_account(client, db_path):
    assert issue_key(db_path, "nobody@keeper.test") is None


def test_simulator_uses_the_dev_store_by_default(tmp_path):
    credentials = tmp_path / "credentials.json"
    credentials.write_text('{"deviceKey": "dev-key"}', encoding="utf-8")

    assert load_device_key(None, credentials) == "dev-key"


def test_simulator_explains_a_missing_seed(tmp_path):
    with pytest.raises(DeviceError, match="seed.py"):
        load_device_key(None, tmp_path / "missing.json")


def test_simulator_finds_a_saved_key_by_email(tmp_path):
    keys = tmp_path / "keys.json"
    save_key(keys, "Owner@Keeper.Test", "first-key")
    save_key(keys, "other@keeper.test", "other-key")

    assert load_device_key(" owner@keeper.test ", keys_path=keys) == "first-key"
    assert load_device_key("other@keeper.test", keys_path=keys) == "other-key"


def test_simulator_explains_how_to_get_a_missing_key(tmp_path):
    with pytest.raises(DeviceError, match="issue_device_key.py"):
        load_device_key("owner@keeper.test", keys_path=tmp_path / "missing.json")


def test_scenario_total_length_is_about_a_minute():
    total = sum(step.delay for step in build_steps("x"))

    assert timedelta(seconds=total) <= timedelta(minutes=2)
