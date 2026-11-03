"""알림 상세, 답변, 매장 정보, 알림 설정, 공지사항을 검증한다."""

from datetime import UTC, datetime, timedelta

import pytest

from clear_dev_data import clear
from keeper import repository
from keeper.db import connect
from keeper.main import DEVICE_KEY_LIMIT_PER_STORE
from keeper.notices import publish
from simulator import Device

from .conftest import NOW, clip_ready, inquiry, movement
from .test_contract import validator_for
from .test_simulator import transport_for


def confirm(store, headers, alert_id="m1", **body):
    return store.client.post(f"/api/alerts/{alert_id}/confirm", json=body or None, headers=headers)


def reply(store, headers, inquiry_id="q1", body="확인했습니다"):
    return store.client.post(f"/api/inquiries/{inquiry_id}/replies", json={"body": body}, headers=headers)


def pull(store):
    response = store.client.post("/ingest/replies/pull", headers={"X-Device-Key": store.device_key})
    assert response.status_code == 200
    return response.json()


def first_alert(store, headers):
    return store.dashboard(headers)["alerts"][0]


class TestAlertResolution:
    def test_owner_can_record_a_normal_behavior(self, store):
        headers = store.login()
        store.send_ok(movement())

        assert confirm(store, headers, resolution="normal").status_code == 204

        alert = first_alert(store, headers)
        assert alert["confirmed"] is True
        assert alert["resolution"] == "normal"

    def test_confirm_without_a_body_means_confirmed(self, store):
        headers = store.login()
        store.send_ok(movement())

        assert confirm(store, headers).status_code == 204

        assert first_alert(store, headers)["resolution"] == "confirmed"

    def test_first_decision_is_kept(self, store):
        headers = store.login()
        store.send_ok(movement())

        confirm(store, headers, resolution="normal")
        confirm(store, headers, resolution="confirmed")

        assert first_alert(store, headers)["resolution"] == "normal"

    def test_unknown_resolution_is_rejected(self, store):
        headers = store.login()
        store.send_ok(movement())

        assert confirm(store, headers, resolution="ignored").status_code == 422

    def test_new_alert_has_no_resolution(self, store):
        headers = store.login()
        store.send_ok(movement())

        assert first_alert(store, headers)["resolution"] is None


class TestAlertDetail:
    def test_returns_the_alert_with_its_clip(self, store, schema):
        headers = store.login()
        store.send_ok(movement())
        store.send_ok(clip_ready())

        response = store.client.get("/api/alerts/m1", headers=headers)

        assert response.status_code == 200
        validator_for(schema, "AlertDetail").validate(response.json())
        assert response.json()["clip"]["duration"] == "00:14"

    def test_alert_without_a_clip(self, store):
        headers = store.login()
        store.send_ok(movement())

        assert store.client.get("/api/alerts/m1", headers=headers).json()["clip"] is None

    def test_old_alert_can_still_be_opened(self, store):
        headers = store.login()
        store.send_ok(movement(occurred_at="2026-10-01T10:00:00+09:00"))
        confirm(store, headers)

        assert store.client.get("/api/alerts/m1", headers=headers).status_code == 200

    def test_unknown_alert_is_not_found(self, store):
        assert store.client.get("/api/alerts/none", headers=store.login()).status_code == 404

    def test_other_stores_alert_looks_like_it_does_not_exist(self, make_store):
        owner, other = make_store("owner"), make_store("other")
        owner.send_ok(movement())

        assert other.client.get("/api/alerts/m1", headers=other.login()).status_code == 404

    def test_requires_login(self, store):
        assert store.client.get("/api/alerts/m1").status_code == 401


class TestReplies:
    def test_reply_appears_on_the_inquiry_and_counts_as_read(self, store, schema):
        headers = store.login()
        store.send_ok(inquiry())

        response = reply(store, headers)

        assert response.status_code == 201
        validator_for(schema, "Reply").validate(response.json())
        found = store.dashboard(headers)["inquiries"][0]
        assert found["read"] is True
        assert [item["body"] for item in found["replies"]] == ["확인했습니다"]
        assert found["replies"][0]["delivered"] is False

    def test_replies_keep_the_order_they_were_sent(self, store, clock):
        headers = store.login()
        store.send_ok(inquiry())

        reply(store, headers, body="첫 번째")
        clock.now += timedelta(minutes=1)
        reply(store, headers, body="두 번째")

        assert [item["body"] for item in store.dashboard(headers)["inquiries"][0]["replies"]] == ["첫 번째", "두 번째"]

    @pytest.mark.parametrize("body", ["", "   ", "가" * 501])
    def test_empty_or_too_long_reply_is_rejected(self, store, body):
        headers = store.login()
        store.send_ok(inquiry())

        assert reply(store, headers, body=body).status_code == 422

    def test_unknown_inquiry_is_not_found(self, store):
        assert reply(store, store.login()).status_code == 404

    def test_other_store_cannot_reply(self, make_store):
        owner, other = make_store("owner"), make_store("other")
        owner.send_ok(inquiry())

        assert reply(other, other.login()).status_code == 404
        assert pull(owner) == []

    def test_device_receives_waiting_replies(self, store, schema):
        headers = store.login()
        store.send_ok(inquiry())
        reply(store, headers)

        replies = pull(store)

        assert [item["inquiryId"] for item in replies] == ["q1"]
        validator_for(schema, "WaitingReply").validate(replies[0])

    def test_reply_is_sent_again_until_the_device_confirms_it(self, store):
        headers = store.login()
        store.send_ok(inquiry())
        reply(store, headers)

        assert len(pull(store)) == 1
        assert len(pull(store)) == 1

    def test_delivered_reply_is_not_sent_again_and_shows_as_delivered(self, store):
        headers = store.login()
        store.send_ok(inquiry())
        reply_id = reply(store, headers).json()["id"]

        response = store.client.post(
            f"/ingest/replies/{reply_id}/delivered",
            headers={"X-Device-Key": store.device_key},
        )

        assert response.status_code == 204
        assert pull(store) == []
        assert store.dashboard(headers)["inquiries"][0]["replies"][0]["delivered"] is True

    def test_device_of_another_store_cannot_confirm_delivery(self, make_store):
        owner, other = make_store("owner"), make_store("other")
        owner.send_ok(inquiry())
        reply_id = reply(owner, owner.login()).json()["id"]

        response = other.client.post(
            f"/ingest/replies/{reply_id}/delivered",
            headers={"X-Device-Key": other.device_key},
        )

        assert response.status_code == 404
        assert len(pull(owner)) == 1

    def test_pulling_replies_requires_a_device_key(self, store):
        assert store.client.post("/ingest/replies/pull").status_code == 401

    def test_pulling_replies_counts_as_a_signal(self, store):
        headers = store.login()

        pull(store)

        assert store.dashboard(headers)["integration"]["status"] == "online"

    def test_simulator_receives_the_reply_and_confirms_it(self, store):
        headers = store.login()
        store.send_ok(inquiry())
        reply(store, headers)
        device = Device(transport_for(store))

        assert [item["body"] for item in device.receive_replies()] == ["확인했습니다"]
        assert device.receive_replies() == []

    def test_clearing_dev_data_also_clears_replies(self, store, db_path):
        store.send_ok(inquiry())
        reply(store, store.login())

        conn = connect(db_path)
        try:
            clear(conn)
            assert conn.execute("SELECT COUNT(*) FROM inquiry_replies").fetchone()[0] == 0
        finally:
            conn.close()


class TestStoreName:
    def test_owner_can_rename_the_store(self, store):
        headers = store.login()

        response = store.client.patch("/api/store", json={"name": "  새 매장  "}, headers=headers)

        assert response.status_code == 204
        assert store.dashboard(headers)["store"]["name"] == "새 매장"

    @pytest.mark.parametrize("name", ["", "   ", "가" * 101])
    def test_invalid_name_is_rejected(self, store, name):
        assert store.client.patch("/api/store", json={"name": name}, headers=store.login()).status_code == 422

    def test_only_the_owners_store_changes(self, make_store):
        owner, other = make_store("owner"), make_store("other")

        owner.client.patch("/api/store", json={"name": "새 매장"}, headers=owner.login())

        assert other.dashboard(other.login())["store"]["name"] == "other"

    def test_requires_login(self, store):
        assert store.client.patch("/api/store", json={"name": "새 매장"}).status_code == 401


class TestNotificationSettings:
    SETTINGS = {"push": True, "alert": False, "door": True, "inquiry": False, "camera": True, "sound": False}

    def save(self, store, headers, settings):
        return store.client.put("/api/notification-settings", json=settings, headers=headers)

    def test_defaults_keep_push_off_until_the_owner_allows_it(self, store):
        settings = store.dashboard(store.login())["notificationSettings"]

        assert settings == {"push": False, "alert": True, "door": True, "inquiry": True, "camera": True, "sound": True}

    def test_settings_are_saved(self, store):
        headers = store.login()

        assert self.save(store, headers, self.SETTINGS).status_code == 204

        assert store.dashboard(headers)["notificationSettings"] == self.SETTINGS

    def test_saving_again_replaces_the_settings(self, store):
        headers = store.login()
        self.save(store, headers, self.SETTINGS)

        self.save(store, headers, self.SETTINGS | {"alert": True})

        assert store.dashboard(headers)["notificationSettings"]["alert"] is True

    def test_each_store_has_its_own_settings(self, make_store):
        owner, other = make_store("owner"), make_store("other")

        self.save(owner, owner.login(), self.SETTINGS)

        assert other.dashboard(other.login())["notificationSettings"]["alert"] is True

    @pytest.mark.parametrize("change", [{"extra": True}, {"push": "yes"}])
    def test_invalid_settings_are_rejected(self, store, change):
        assert self.save(store, store.login(), self.SETTINGS | change).status_code == 422

    def test_missing_setting_is_rejected(self, store):
        settings = {key: value for key, value in self.SETTINGS.items() if key != "push"}

        assert self.save(store, store.login(), settings).status_code == 422


class TestNotices:
    def add(self, db_path, title, when=NOW):
        conn = connect(db_path)
        try:
            repository.add_notice(conn, title, "내용", when)
        finally:
            conn.close()

    def test_no_notices_by_default(self, store):
        assert store.client.get("/api/notices", headers=store.login()).json() == []

    def test_newest_notice_comes_first(self, store, db_path, schema):
        self.add(db_path, "오래된 공지", NOW - timedelta(days=1))
        self.add(db_path, "새 공지")

        notices = store.client.get("/api/notices", headers=store.login()).json()

        assert [notice["title"] for notice in notices] == ["새 공지", "오래된 공지"]
        for notice in notices:
            validator_for(schema, "Notice").validate(notice)

    def test_every_store_sees_the_same_notices(self, make_store, db_path):
        first, second = make_store("first"), make_store("second")
        self.add(db_path, "공지")

        assert len(first.client.get("/api/notices", headers=first.login()).json()) == 1
        assert len(second.client.get("/api/notices", headers=second.login()).json()) == 1

    def test_requires_login(self, store):
        assert store.client.get("/api/notices").status_code == 401

    def test_only_recent_notices_are_returned(self, store, db_path):
        for index in range(repository.MAX_NOTICES + 1):
            self.add(db_path, f"공지 {index}", NOW + timedelta(minutes=index))

        assert len(store.client.get("/api/notices", headers=store.login()).json()) == repository.MAX_NOTICES

    def test_publish_command_creates_the_database_if_needed(self, tmp_path):
        path = tmp_path / "nested" / "notices.db"

        publish(str(path), "제목", "내용", datetime(2026, 11, 2, tzinfo=UTC))

        conn = connect(path)
        try:
            assert [row["title"] for row in repository.get_notices(conn)] == ["제목"]
        finally:
            conn.close()


class TestDeviceKeyIssue:
    def issue(self, store, headers):
        return store.client.post("/api/devices", headers=headers)

    def test_owner_gets_a_key_that_sends_to_their_store(self, store):
        headers = store.login()

        key = self.issue(store, headers).json()["deviceKey"]
        response = store.client.post("/ingest/events", json=movement(), headers={"X-Device-Key": key})

        assert response.status_code == 202
        assert len(store.dashboard(headers)["alerts"]) == 1

    def test_issued_key_cannot_reach_another_store(self, make_store):
        mine, other = make_store("mine"), make_store("other")
        key = self.issue(mine, mine.login()).json()["deviceKey"]

        mine.client.post("/ingest/events", json=movement(), headers={"X-Device-Key": key})

        assert other.dashboard(other.login())["alerts"] == []

    def test_login_is_required(self, store):
        assert store.client.post("/api/devices").status_code == 401

    def test_original_device_keeps_working(self, store):
        self.issue(store, store.login())

        store.send_ok(movement())

    def test_key_is_not_stored_in_plain_text(self, store, db_path):
        key = self.issue(store, store.login()).json()["deviceKey"]

        conn = connect(db_path)
        try:
            stored = [row["key_hash"] for row in conn.execute("SELECT key_hash FROM devices")]
        finally:
            conn.close()

        assert key not in stored

    def test_issuing_is_limited_per_store(self, make_store):
        limited, other = make_store("limited"), make_store("other")
        headers = limited.login()
        for _ in range(DEVICE_KEY_LIMIT_PER_STORE):
            assert self.issue(limited, headers).status_code == 201

        assert self.issue(limited, headers).status_code == 429
        assert self.issue(other, other.login()).status_code == 201

    def test_limit_ends_after_the_window(self, store, clock):
        headers = store.login()
        for _ in range(DEVICE_KEY_LIMIT_PER_STORE):
            self.issue(store, headers)

        clock.now += timedelta(hours=1, minutes=1)

        assert self.issue(store, store.login()).status_code == 201
