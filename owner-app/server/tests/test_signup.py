from concurrent.futures import ThreadPoolExecutor

import pytest

from keeper.db import connect

from .conftest import movement

SINCE = {"since": "2026-10-23T00:00:00+09:00"}


def signup_body(**overrides) -> dict:
    return {
        "email": "new@keeper.test",
        "password": "test-password",
        "storeName": "역삼 무인점",
        **overrides,
    }


def signup(client, **overrides):
    return client.post("/api/auth/signup", json=signup_body(**overrides))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_signup_creates_a_store_and_logs_the_owner_in(client):
    response = signup(client)

    assert response.status_code == 201
    dashboard = client.get("/api/dashboard", params=SINCE, headers=bearer(response.json()["token"])).json()
    assert dashboard["store"] == {"name": "역삼 무인점"}


def test_new_store_starts_empty_and_waiting(client):
    token = signup(client).json()["token"]

    dashboard = client.get("/api/dashboard", params=SINCE, headers=bearer(token)).json()

    assert dashboard["integration"]["status"] == "waiting"
    assert dashboard["alerts"] == dashboard["cameras"] == dashboard["inquiries"] == dashboard["clips"] == []


def test_issued_device_key_connects_the_store_device(client):
    body = signup(client).json()

    response = client.post("/ingest/events", json=movement(), headers={"X-Device-Key": body["deviceKey"]})

    assert response.status_code == 202
    dashboard = client.get("/api/dashboard", params=SINCE, headers=bearer(body["token"])).json()
    assert dashboard["integration"]["status"] == "online"
    assert len(dashboard["alerts"]) == 1


def test_owner_can_log_in_again_with_the_new_account(client):
    signup(client)

    response = client.post("/api/auth/login", json={"email": "new@keeper.test", "password": "test-password"})

    assert response.status_code == 200


def test_two_new_stores_do_not_see_each_other(client):
    first = signup(client, email="first@keeper.test").json()
    second = signup(client, email="second@keeper.test").json()
    client.post("/ingest/events", json=movement(), headers={"X-Device-Key": first["deviceKey"]})

    dashboard = client.get("/api/dashboard", params=SINCE, headers=bearer(second["token"])).json()

    assert dashboard["alerts"] == []


def test_each_store_gets_its_own_device_key(client):
    first = signup(client, email="first@keeper.test").json()
    second = signup(client, email="second@keeper.test").json()

    assert first["deviceKey"] != second["deviceKey"]


def test_duplicate_email_is_rejected(client):
    signup(client)

    response = signup(client, storeName="두 번째 매장")

    assert response.status_code == 409
    assert response.json()["detail"] == "이미 가입된 이메일입니다."


def test_email_is_not_case_sensitive(client):
    signup(client, email="Owner@Keeper.Test")

    assert signup(client, email="owner@keeper.test").status_code == 409
    assert client.post(
        "/api/auth/login",
        json={"email": "OWNER@keeper.test", "password": "test-password"},
    ).status_code == 200


def test_rejected_duplicate_leaves_no_store_behind(client, db_path):
    signup(client)
    signup(client, storeName="두 번째 매장")

    conn = connect(db_path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM stores").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0] == 1
    finally:
        conn.close()


def test_simultaneous_signups_with_one_email_create_one_account(client, db_path):
    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = list(pool.map(lambda _: signup(client).status_code, range(6)))

    assert codes.count(201) == 1
    assert codes.count(409) == 5
    conn = connect(db_path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM stores").fetchone()[0] == 1
    finally:
        conn.close()


def test_secrets_are_not_stored_in_plain_text(client, db_path):
    body = signup(client).json()

    conn = connect(db_path)
    try:
        stored = [
            value
            for table in ("owners", "devices", "sessions")
            for row in conn.execute(f"SELECT * FROM {table}").fetchall()
            for value in tuple(row)
        ]
    finally:
        conn.close()

    assert "test-password" not in stored
    assert body["deviceKey"] not in stored
    assert body["token"] not in stored


def test_password_is_not_returned(client):
    assert "test-password" not in signup(client).text


@pytest.mark.parametrize(
    "change",
    [
        {"email": "not-an-email"},
        {"email": "a@b"},
        {"email": "a b@keeper.test"},
        {"email": ""},
        {"password": "short"},
        {"password": "x" * 201},
        {"storeName": ""},
        {"storeName": "   "},
        {"storeName": "x" * 101},
        {"extra": "field"},
    ],
)
def test_invalid_signups_are_rejected(client, db_path, change):
    assert signup(client, **change).status_code == 422

    conn = connect(db_path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM stores").fetchone()[0] == 0
    finally:
        conn.close()


def test_store_name_and_email_are_trimmed(client):
    token = signup(client, email="  spaced@keeper.test  ", storeName="  역삼 무인점  ").json()["token"]

    dashboard = client.get("/api/dashboard", params=SINCE, headers=bearer(token)).json()

    assert dashboard["store"]["name"] == "역삼 무인점"
    assert client.post(
        "/api/auth/login",
        json={"email": "spaced@keeper.test", "password": "test-password"},
    ).status_code == 200
