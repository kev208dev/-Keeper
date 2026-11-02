"""배포 환경에서만 드러나는 동작을 검증한다."""

import sqlite3
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from keeper import repository
from keeper.backup import back_up
from keeper.db import MIGRATIONS, connect, init_db
from keeper.main import LOGIN_LIMIT_PER_EMAIL, LOGIN_LIMIT_PER_IP, SIGNUP_LIMIT_PER_IP, create_app

from .conftest import movement


def wrong_login(client, email="a@keeper.test"):
    return client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})


def signup(client, index):
    return client.post(
        "/api/auth/signup",
        json={"email": f"owner{index}@keeper.test", "password": "test-password", "storeName": "매장"},
    )


@pytest.fixture
def web_dir(tmp_path):
    directory = tmp_path / "web"
    (directory / "assets").mkdir(parents=True)
    (directory / "index.html").write_text("<title>#Keeper</title>", encoding="utf-8")
    (directory / "assets" / "app.js").write_text("console.log('app')", encoding="utf-8")
    return directory


@pytest.fixture
def production_client(tmp_path, web_dir):
    return TestClient(create_app(tmp_path / "prod.db", static_dir=web_dir, production=True))


class TestLoginLimit:
    def test_repeated_failures_are_blocked_even_with_the_right_password(self, store):
        for _ in range(LOGIN_LIMIT_PER_EMAIL):
            assert wrong_login(store.client, store.email).status_code == 401

        blocked = store.client.post("/api/auth/login", json={"email": store.email, "password": store.password})

        assert blocked.status_code == 429

    def test_email_case_does_not_bypass_the_limit(self, store):
        for _ in range(LOGIN_LIMIT_PER_EMAIL):
            wrong_login(store.client, store.email)

        assert wrong_login(store.client, store.email.upper()).status_code == 429

    def test_block_ends_after_the_window(self, store, clock):
        for _ in range(LOGIN_LIMIT_PER_EMAIL):
            wrong_login(store.client, store.email)

        clock.now += timedelta(minutes=16)

        assert store.client.post(
            "/api/auth/login", json={"email": store.email, "password": store.password}
        ).status_code == 200

    def test_success_resets_the_failure_count(self, store):
        for _ in range(LOGIN_LIMIT_PER_EMAIL - 1):
            wrong_login(store.client, store.email)
        store.login()

        for _ in range(LOGIN_LIMIT_PER_EMAIL - 1):
            assert wrong_login(store.client, store.email).status_code == 401
        store.login()

    def test_other_accounts_are_not_blocked_by_one_accounts_failures(self, make_store):
        victim, other = make_store("victim"), make_store("other")
        for _ in range(LOGIN_LIMIT_PER_EMAIL):
            wrong_login(victim.client, victim.email)

        other.login()

    def test_guessing_across_many_accounts_is_limited_by_ip(self, client):
        for index in range(LOGIN_LIMIT_PER_IP):
            assert wrong_login(client, f"guess{index}@keeper.test").status_code == 401

        assert wrong_login(client, "another@keeper.test").status_code == 429

    def test_old_attempt_records_are_cleaned_up(self, store, clock, db_path):
        wrong_login(store.client, store.email)
        clock.now += timedelta(days=2)
        wrong_login(store.client, "new@keeper.test")

        conn = connect(db_path)
        try:
            remaining = conn.execute("SELECT key FROM auth_attempts").fetchall()
        finally:
            conn.close()

        assert all(store.email not in row["key"] for row in remaining)


class TestSignupLimit:
    def test_mass_signups_from_one_ip_are_blocked(self, client):
        for index in range(SIGNUP_LIMIT_PER_IP):
            assert signup(client, index).status_code == 201

        assert signup(client, 99).status_code == 429

    def test_blocked_signup_creates_nothing(self, client, db_path):
        for index in range(SIGNUP_LIMIT_PER_IP + 1):
            signup(client, index)

        conn = connect(db_path)
        try:
            assert conn.execute("SELECT COUNT(*) FROM stores").fetchone()[0] == SIGNUP_LIMIT_PER_IP
        finally:
            conn.close()

    def test_signup_opens_again_after_the_window(self, client, clock):
        for index in range(SIGNUP_LIMIT_PER_IP):
            signup(client, index)

        clock.now += timedelta(hours=1, minutes=1)

        assert signup(client, 99).status_code == 201


class TestWebApp:
    def test_home_serves_the_app(self, production_client):
        response = production_client.get("/")

        assert response.status_code == 200
        assert "#Keeper" in response.text

    def test_built_assets_are_served(self, production_client):
        assert production_client.get("/assets/app.js").status_code == 200

    def test_api_still_works_alongside_the_app(self, production_client):
        assert production_client.get("/health").json() == {"status": "ok"}
        assert production_client.get("/api/dashboard", params={"since": "2026-10-23T00:00:00+09:00"}).status_code == 401

    def test_files_outside_the_web_folder_are_not_served(self, production_client):
        assert production_client.get("/../prod.db").status_code == 404
        assert production_client.get("/%2e%2e/prod.db").status_code == 404

    def test_server_without_a_web_folder_is_api_only(self, client):
        assert client.get("/").status_code == 404


class TestProductionSettings:
    def test_api_docs_are_hidden(self, production_client):
        assert production_client.get("/docs").status_code == 404
        assert production_client.get("/openapi.json").status_code == 404

    def test_api_docs_stay_available_in_development(self, client):
        assert client.get("/docs").status_code == 200

    def test_security_headers_are_sent(self, production_client):
        headers = production_client.get("/").headers

        assert headers["X-Content-Type-Options"] == "nosniff"
        assert headers["X-Frame-Options"] == "DENY"
        assert headers["Referrer-Policy"] == "no-referrer"
        assert "max-age" in headers["Strict-Transport-Security"]
        assert "default-src 'self'" in headers["Content-Security-Policy"]

    def test_https_is_not_forced_in_development(self, client):
        assert "Strict-Transport-Security" not in client.get("/health").headers

    def test_settings_come_from_the_environment(self, tmp_path, web_dir, monkeypatch):
        monkeypatch.setenv("KEEPER_ENV", "production")
        monkeypatch.setenv("KEEPER_DB_PATH", str(tmp_path / "nested" / "folder" / "env.db"))
        monkeypatch.setenv("KEEPER_STATIC_DIR", str(web_dir))

        client = TestClient(create_app())

        assert (tmp_path / "nested" / "folder" / "env.db").exists()
        assert client.get("/").status_code == 200
        assert client.get("/docs").status_code == 404


class TestMigrations:
    def test_new_database_reaches_the_latest_version(self, tmp_path):
        path = tmp_path / "new.db"

        init_db(path)

        conn = connect(path)
        try:
            assert conn.execute("PRAGMA user_version").fetchone()[0] == len(MIGRATIONS)
        finally:
            conn.close()

    def test_restarting_keeps_existing_data(self, store, db_path):
        store.send_ok(movement())

        init_db(db_path)

        assert len(store.dashboard(store.login())["alerts"]) == 1

    def test_database_from_before_versioning_is_upgraded_without_losing_data(self, tmp_path):
        path = tmp_path / "old.db"
        conn = connect(path)
        conn.executescript(MIGRATIONS[0])
        conn.execute("INSERT INTO stores (id, name) VALUES ('s1', '기존 매장')")
        conn.close()

        init_db(path)

        conn = connect(path)
        try:
            assert conn.execute("SELECT name FROM stores").fetchone()["name"] == "기존 매장"
            assert conn.execute("SELECT COUNT(*) FROM auth_attempts").fetchone()[0] == 0
        finally:
            conn.close()


class TestBackup:
    NOW = datetime(2026, 11, 2, 3, 0, tzinfo=UTC)

    def test_backup_contains_the_data_and_can_be_opened(self, store, db_path, tmp_path):
        store.send_ok(movement())

        target = back_up(db_path, tmp_path / "backups", self.NOW)

        conn = sqlite3.connect(target)
        try:
            assert conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0] == 1
            assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        finally:
            conn.close()

    def test_only_recent_backups_are_kept(self, store, db_path, tmp_path):
        for day in range(5):
            back_up(db_path, tmp_path / "backups", self.NOW + timedelta(days=day), keep=3)

        names = sorted(path.name for path in (tmp_path / "backups").glob("*.db"))

        assert names == ["keeper-20261104-030000.db", "keeper-20261105-030000.db", "keeper-20261106-030000.db"]

    def test_backup_works_while_the_server_is_writing(self, store, db_path, tmp_path):
        conn = connect(db_path)
        try:
            repository.mark_device_seen(conn, store.device_key, self.NOW)
            target = back_up(db_path, tmp_path / "backups", self.NOW)
        finally:
            conn.close()

        assert target.exists()
