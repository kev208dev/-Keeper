import os
import sqlite3
from hashlib import sha256
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AwareDatetime

from . import repository
from .db import connect, init_db
from .schemas import (
    ConfirmRequest,
    IngestEvent,
    LoginRequest,
    NotificationSettings,
    ReplyRequest,
    SignupRequest,
    StoreUpdateRequest,
)

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "keeper.db"
DEFAULT_MEDIA_ROOT = Path(__file__).resolve().parent.parent / "media"
MAX_MEDIA_BYTES = 1024 * 1024 * 1024
VIDEO_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
}
SESSION_TTL = timedelta(days=30)
MAX_PERIOD_DAYS = 31

LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_LIMIT_PER_EMAIL = 10
LOGIN_LIMIT_PER_IP = 50
SIGNUP_WINDOW = timedelta(hours=1)
SIGNUP_LIMIT_PER_IP = 10
DEVICE_KEY_WINDOW = timedelta(hours=1)
DEVICE_KEY_LIMIT_PER_STORE = 10

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "style-src 'self' https://cdn.jsdelivr.net",
        "font-src https://cdn.jsdelivr.net",
        "img-src 'self' data:",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
    ]
)

bearer = HTTPBearer(auto_error=False)


def utc_now() -> datetime:
    return datetime.now(UTC)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def too_many_requests() -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "시도가 너무 많습니다. 잠시 후 다시 시도하세요.")


def create_app(
    db_path: str | Path | None = None,
    clock: Callable[[], datetime] = utc_now,
    static_dir: str | Path | None = None,
    production: bool | None = None,
    media_root: str | Path | None = None,
    max_media_bytes: int = MAX_MEDIA_BYTES,
) -> FastAPI:
    path = db_path or os.environ.get("KEEPER_DB_PATH", DEFAULT_DB_PATH)
    static_dir = static_dir or os.environ.get("KEEPER_STATIC_DIR")
    media_path = Path(media_root or os.environ.get("KEEPER_MEDIA_ROOT", DEFAULT_MEDIA_ROOT)).resolve()
    if production is None:
        production = os.environ.get("KEEPER_ENV") == "production"

    init_db(path)
    app = FastAPI(
        title="Keeper API",
        docs_url=None if production else "/docs",
        redoc_url=None,
        openapi_url=None if production else "/openapi.json",
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
            response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
        return response

    def get_conn():
        conn = connect(path)
        try:
            yield conn
        finally:
            conn.close()

    def owner_store(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> str:
        store_id = credentials and repository.store_for_token(conn, credentials.credentials, clock())
        if not store_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "로그인이 필요합니다.")
        return store_id

    def device_store(
        x_device_key: str | None = Header(default=None),
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> str:
        store_id = x_device_key and repository.store_for_device(conn, x_device_key)
        if not store_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "등록되지 않은 기기입니다.")
        return store_id

    def normalized_device_id(value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or len(value) > 100:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "기기 ID 형식이 올바르지 않습니다.")
        return value

    async def save_media_file(
        request: Request,
        conn: sqlite3.Connection,
        store_id: str,
        camera_id: str,
        kind: str,
        filename: str,
    ) -> dict:
        if Path(filename).name != filename or "\\" in filename:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "안전하지 않은 파일 이름입니다.")
        extension = Path(filename).suffix.lower()
        content_type = VIDEO_CONTENT_TYPES.get(extension)
        if content_type is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "지원하지 않는 영상 형식입니다.")
        if not repository.camera_exists(conn, store_id, camera_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "카메라를 찾을 수 없습니다.")

        camera_folder = sha256(camera_id.encode("utf-8")).hexdigest()[:16]
        relative = Path(store_id) / camera_folder / f"{uuid4().hex}{extension}"
        destination = (media_path / relative).resolve()
        if not destination.is_relative_to(media_path):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "안전하지 않은 저장 경로입니다.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".part")
        size = 0
        try:
            with temporary.open("wb") as output:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > max_media_bytes:
                        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "영상 파일이 너무 큽니다.")
                    output.write(chunk)
            if size == 0:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "빈 영상 파일은 등록할 수 없습니다.")
            temporary.replace(destination)
            return repository.add_media(
                conn,
                store_id,
                camera_id,
                kind,
                relative.as_posix(),
                content_type,
                size,
                clock(),
            )
        except BaseException:
            temporary.unlink(missing_ok=True)
            destination.unlink(missing_ok=True)
            raise

    @app.get("/health")
    def health(conn: sqlite3.Connection = Depends(get_conn)):
        conn.execute("SELECT 1 FROM stores LIMIT 1").fetchone()
        return {"status": "ok"}

    @app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
    def signup(body: SignupRequest, request: Request, conn: sqlite3.Connection = Depends(get_conn)):
        now = clock()
        ip_key = f"signup-ip:{client_ip(request)}"
        if repository.too_many_attempts(conn, ip_key, now, SIGNUP_LIMIT_PER_IP, SIGNUP_WINDOW):
            raise too_many_requests()
        repository.record_attempt(conn, ip_key, now)
        try:
            _, device_key = repository.create_store(conn, body.storeName, body.email, body.password)
        except repository.EmailTaken:
            raise HTTPException(status.HTTP_409_CONFLICT, "이미 가입된 이메일입니다.") from None
        token = repository.login(conn, body.email, body.password, now, SESSION_TTL)
        return {"token": token, "deviceKey": device_key}

    @app.post("/api/auth/login")
    def login(body: LoginRequest, request: Request, conn: sqlite3.Connection = Depends(get_conn)):
        now = clock()
        email_key = f"login-email:{repository.normalize_email(body.email)}"
        ip_key = f"login-ip:{client_ip(request)}"
        if repository.too_many_attempts(
            conn, email_key, now, LOGIN_LIMIT_PER_EMAIL, LOGIN_WINDOW
        ) or repository.too_many_attempts(conn, ip_key, now, LOGIN_LIMIT_PER_IP, LOGIN_WINDOW):
            raise too_many_requests()
        token = repository.login(conn, body.email, body.password, now, SESSION_TTL)
        if not token:
            repository.record_attempt(conn, email_key, now)
            repository.record_attempt(conn, ip_key, now)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.")
        repository.clear_attempts(conn, email_key)
        return {"token": token}

    @app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        if credentials:
            repository.logout(conn, credentials.credentials)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/dashboard")
    def dashboard(
        since: AwareDatetime = Query(),
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        return repository.get_dashboard(conn, store_id, since, clock())

    @app.get("/api/alerts")
    def alerts_in_period(
        start: date = Query(),
        end: date = Query(),
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        if start > end:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "시작일은 종료일보다 늦을 수 없습니다.")
        if (end - start).days + 1 > MAX_PERIOD_DAYS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"기간은 최대 {MAX_PERIOD_DAYS}일까지 선택할 수 있습니다.",
            )
        return repository.get_alerts_in_period(conn, store_id, start, end)

    # 다른 매장의 항목은 존재 여부도 알 수 없도록 없는 항목과 똑같이 404로 답한다
    @app.get("/api/alerts/{alert_id}")
    def alert_detail(
        alert_id: str,
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        detail = repository.get_alert(conn, store_id, alert_id)
        if detail is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "알림을 찾을 수 없습니다.")
        return detail

    @app.post("/api/cameras/{camera_id}/recordings", status_code=status.HTTP_201_CREATED)
    async def upload_recording(
        camera_id: str,
        request: Request,
        filename: str = Query(min_length=1, max_length=255),
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        return await save_media_file(request, conn, store_id, camera_id, "recording", filename)

    @app.get("/api/media/{media_id}")
    def media_file(
        media_id: str,
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        media = repository.get_media(conn, store_id, media_id)
        if media is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "영상을 찾을 수 없습니다.")
        target = (media_path / media["relativePath"]).resolve()
        if not target.is_relative_to(media_path) or not target.is_file():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "영상을 찾을 수 없습니다.")
        return FileResponse(
            target,
            media_type=media["contentType"],
            filename=target.name,
            content_disposition_type="inline",
        )

    @app.post("/api/alerts/{alert_id}/confirm", status_code=status.HTTP_204_NO_CONTENT)
    def confirm_alert(
        alert_id: str,
        body: ConfirmRequest | None = None,
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        resolution = body.resolution if body else "confirmed"
        if not repository.confirm_alert(conn, store_id, alert_id, resolution):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "알림을 찾을 수 없습니다.")

    @app.post("/api/inquiries/{inquiry_id}/read", status_code=status.HTTP_204_NO_CONTENT)
    def read_inquiry(
        inquiry_id: str,
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        if not repository.mark_inquiry_read(conn, store_id, inquiry_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "문의를 찾을 수 없습니다.")

    @app.post("/api/inquiries/{inquiry_id}/replies", status_code=status.HTTP_201_CREATED)
    def reply_inquiry(
        inquiry_id: str,
        body: ReplyRequest,
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        reply = repository.add_reply(conn, store_id, inquiry_id, body.body, clock())
        if reply is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "문의를 찾을 수 없습니다.")
        return reply

    @app.patch("/api/store", status_code=status.HTTP_204_NO_CONTENT)
    def update_store(
        body: StoreUpdateRequest,
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        repository.rename_store(conn, store_id, body.name)

    @app.put("/api/notification-settings", status_code=status.HTTP_204_NO_CONTENT)
    def update_notification_settings(
        body: NotificationSettings,
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        repository.save_notification_settings(conn, store_id, body.model_dump())

    @app.get("/api/notices")
    def notices(
        _store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        return repository.get_notices(conn)

    # 시뮬레이터 페이지가 점주 로그인만으로 관리용 앱처럼 동작하도록 그 매장의 기기 키를 내준다
    @app.post("/api/devices", status_code=status.HTTP_201_CREATED)
    def issue_device(
        store_id: str = Depends(owner_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        now = clock()
        limit_key = f"device-key:{store_id}"
        if repository.too_many_attempts(conn, limit_key, now, DEVICE_KEY_LIMIT_PER_STORE, DEVICE_KEY_WINDOW):
            raise too_many_requests()
        repository.record_attempt(conn, limit_key, now)
        return {"deviceKey": repository.issue_device(conn, store_id)}

    @app.post("/ingest/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
    def heartbeat(
        x_device_key: str | None = Header(default=None),
        _store_id: str = Depends(device_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        repository.mark_device_seen(conn, x_device_key, clock())

    @app.post("/ingest/events", status_code=status.HTTP_202_ACCEPTED)
    def ingest(
        event: IngestEvent,
        x_device_key: str | None = Header(default=None),
        store_id: str = Depends(device_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        repository.mark_device_seen(conn, x_device_key, clock())
        try:
            accepted = repository.ingest_event(conn, store_id, event)
        except (repository.UnknownAlert, repository.UnknownMedia):
            # 순서가 뒤바뀐 경우 처리 기록이 남지 않으므로 관리용 앱이 다시 보낼 수 있다
            raise HTTPException(status.HTTP_404_NOT_FOUND, "연결할 알림을 찾을 수 없습니다.") from None
        return {"status": "accepted" if accepted else "duplicate"}

    @app.post("/ingest/media", status_code=status.HTTP_201_CREATED)
    async def upload_device_media(
        request: Request,
        camera_id: str = Query(alias="cameraId", min_length=1, max_length=100),
        kind: str = Query(pattern="^clip$"),
        filename: str = Query(min_length=1, max_length=255),
        store_id: str = Depends(device_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        return await save_media_file(request, conn, store_id, camera_id, kind, filename)

    # 전달 확인을 따로 받아, 응답이 끊겨도 답변을 잃지 않고 다시 가져갈 수 있게 한다
    @app.post("/ingest/replies/pull")
    def pull_replies(
        x_device_key: str | None = Header(default=None),
        x_device_id: str | None = Header(default=None),
        store_id: str = Depends(device_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        repository.mark_device_seen(conn, x_device_key, clock())
        return repository.get_waiting_replies(conn, store_id, normalized_device_id(x_device_id))

    @app.post("/ingest/replies/{reply_id}/delivered", status_code=status.HTTP_204_NO_CONTENT)
    def reply_delivered(
        reply_id: str,
        x_device_id: str | None = Header(default=None),
        store_id: str = Depends(device_store),
        conn: sqlite3.Connection = Depends(get_conn),
    ):
        if not repository.mark_reply_delivered(
            conn, store_id, reply_id, normalized_device_id(x_device_id)
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "답변을 찾을 수 없습니다.")

    # API 경로가 먼저 처리되도록 맨 마지막에 연결한다
    if static_dir:
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="web")

    return app
