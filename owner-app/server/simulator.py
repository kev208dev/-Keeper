"""실제 장비 없이 관리용 앱처럼 동작한다. 실제 관리용 앱과 같은 경로로 서버에 보낸다.

이벤트를 시간 순서대로 보내고, 그동안 생존 신호도 함께 보낸다. 개발 중에만 쓴다.

    python simulator.py              시나리오를 한 번 실행한다
    python simulator.py --speed 5    5배 빠르게 실행한다
    python simulator.py --stay       끝난 뒤에도 Ctrl+C를 누를 때까지 연결을 유지한다
    python simulator.py --email 주소  회원가입한 매장으로 보낸다 (issue_device_key.py를 먼저 실행)
"""

import argparse
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

CREDENTIALS_PATH = Path(__file__).resolve().parent / "dev-credentials.local.json"
DEVICE_KEYS_PATH = Path(__file__).resolve().parent / "dev-device-keys.local.json"
SERVER_URL = "http://127.0.0.1:8000"
KST = timezone(timedelta(hours=9))
HEARTBEAT_SECONDS = 60
RETRY_COUNT = 3
RETRY_SECONDS = 1

CAMERAS = {
    "cam-01": ("카메라 01", "매장 입구"),
    "cam-02": ("카메라 02", "상품 진열대"),
    "cam-03": ("카메라 03", "냉동고 구역"),
}

Transport = Callable[[str, dict | None], tuple[int, dict | None]]


class DeviceError(Exception):
    pass


def http_transport(url: str, device_key: str) -> Transport:
    def send(path: str, body: dict | None) -> tuple[int, dict | None]:
        request = urllib.request.Request(
            f"{url}{path}",
            data=json.dumps(body or {}).encode(),
            headers={"Content-Type": "application/json", "X-Device-Key": device_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            return error.code, None

    return send


class Device:
    """관리용 앱의 전송부. 응답을 못 받으면 같은 eventId로 다시 보낸다."""

    def __init__(self, transport: Transport, sleep: Callable[[float], None] = time.sleep) -> None:
        self.transport = transport
        self.sleep = sleep

    def _post(self, path: str, body: dict | None) -> tuple[int, dict | None]:
        for attempt in range(RETRY_COUNT):
            try:
                status, payload = self.transport(path, body)
            except OSError:
                if attempt < RETRY_COUNT - 1:
                    self.sleep(RETRY_SECONDS)
                continue
            if status == 401:
                raise DeviceError("기기 키가 맞지 않습니다. seed.py로 만든 키인지 확인하세요.")
            return status, payload
        raise DeviceError("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.")

    def heartbeat(self) -> None:
        self._post("/ingest/heartbeat", None)

    def send(self, event: dict) -> str:
        status, payload = self._post("/ingest/events", event)
        if status != 202 or payload is None:
            raise DeviceError(f"{event['type']} 이벤트가 거부되었습니다. (응답 코드 {status})")
        return payload["status"]


@dataclass
class Step:
    delay: float
    message: str
    build: Callable[[datetime], dict]


def iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds")


def camera_event(event_id: str, camera_id: str, status: str, now: datetime) -> dict:
    name, location = CAMERAS[camera_id]
    return {
        "eventId": event_id,
        "type": "camera.status",
        "occurredAt": iso(now),
        "cameraId": camera_id,
        "name": name,
        "location": location,
        "status": status,
    }


def build_steps(run_id: str) -> list[Step]:
    """한 번의 시나리오. run_id가 달라야 다시 실행해도 새 이벤트로 집계된다."""

    def event_id(name: str) -> str:
        return f"sim-{run_id}-{name}"

    movement_id = event_id("movement")
    door_id = event_id("door")

    def movement(now: datetime) -> dict:
        return {
            "eventId": movement_id,
            "type": "alert.movement",
            "occurredAt": iso(now),
            "cameraId": "cam-02",
            "from": "입구 진열대",
            "to": "매장 입구",
            "unpaid": True,
        }

    def door_open(now: datetime) -> dict:
        return {
            "eventId": door_id,
            "type": "alert.door_open",
            "occurredAt": iso(now),
            "cameraId": "cam-03",
            "openedAt": iso(now - timedelta(minutes=10)),
            "limitMinutes": 35,
        }

    def damage(now: datetime) -> dict:
        return {
            "eventId": event_id("damage"),
            "type": "alert.product_damage",
            "occurredAt": iso(now),
            "cameraId": "cam-02",
            "product": None,
        }

    def clip(now: datetime) -> dict:
        return {
            "eventId": event_id("clip"),
            "type": "clip.ready",
            "occurredAt": iso(now),
            "alertEventId": movement_id,
            "duration": "00:14",
        }

    def inquiry(name: str, title: str, note: str, line: str, status: str) -> Callable[[datetime], dict]:
        return lambda now: {
            "eventId": event_id(name),
            "type": "inquiry.created",
            "occurredAt": iso(now),
            "title": title,
            "note": note,
            "transcript": [f"고객: {title}", line],
            "status": status,
        }

    def door_closed(now: datetime) -> dict:
        return {
            "eventId": event_id("door-closed"),
            "type": "door.closed",
            "occurredAt": iso(now),
            "alertEventId": door_id,
        }

    return [
        *[
            Step(
                1,
                f"{CAMERAS[camera_id][0]} 연결",
                lambda now, camera_id=camera_id: camera_event(event_id(f"{camera_id}-on"), camera_id, "connected", now),
            )
            for camera_id in CAMERAS
        ],
        Step(5, "상품 이동 감지 (미결제)", movement),
        Step(5, "상품 이동 영상 클립 생성", clip),
        Step(4, "응답을 못 받은 상황을 가정해 같은 이벤트 재전송", movement),
        Step(5, "냉장고 문 장시간 개방 감지", door_open),
        Step(6, "상품 훼손 의심 감지 (상품 식별 실패)", damage),
        Step(
            6,
            "고객 문의 접수 (AI가 해결 못 해 점주에게 전달)",
            inquiry(
                "inquiry-forwarded",
                "결제했는데 문이 안 열려요",
                "AI 상담에서 해결되지 않아 점주에게 전달됨",
                "AI: 해결하지 못해 점주님께 전달했습니다.",
                "forwarded",
            ),
        ),
        Step(
            6,
            "고객 문의 접수 (AI가 해결)",
            inquiry(
                "inquiry-ai",
                "영수증은 어디서 받나요?",
                "AI가 영수증 출력 방법을 안내함",
                "AI: 키오스크의 결제 내역에서 출력할 수 있어요.",
                "ai_resolved",
            ),
        ),
        Step(6, "카메라 02 연결 끊김", lambda now: camera_event(event_id("cam-02-off"), "cam-02", "disconnected", now)),
        Step(12, "카메라 02 연결 복구", lambda now: camera_event(event_id("cam-02-back"), "cam-02", "connected", now)),
        Step(6, "냉장고 문 닫힘", door_closed),
    ]


def run_scenario(
    device: Device,
    speed: float = 1,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], datetime] = lambda: datetime.now(KST),
    log: Callable[[str], None] = print,
    run_id: str | None = None,
) -> list[str]:
    results = []
    for step in build_steps(run_id or uuid4().hex[:8]):
        sleep(step.delay / speed)
        result = device.send(step.build(clock()))
        results.append(result)
        log(f"{step.message} → {'반영' if result == 'accepted' else '중복이라 무시됨'}")
    return results


def keep_alive(device: Device, stop: threading.Event, interval: float) -> None:
    while not stop.wait(interval):
        try:
            device.heartbeat()
        except DeviceError:
            continue


def load_device_key(
    email: str | None,
    credentials_path: Path = CREDENTIALS_PATH,
    keys_path: Path = DEVICE_KEYS_PATH,
) -> str:
    if email is None:
        if not credentials_path.exists():
            raise DeviceError(f"{credentials_path.name} 파일이 없습니다. seed.py를 먼저 실행하세요.")
        return json.loads(credentials_path.read_text(encoding="utf-8"))["deviceKey"]

    keys = json.loads(keys_path.read_text(encoding="utf-8")) if keys_path.exists() else {}
    device_key = keys.get(email.strip().lower())
    if device_key is None:
        raise DeviceError(f"{email}의 키가 없습니다. issue_device_key.py {email} 를 먼저 실행하세요.")
    return device_key


def main() -> int:
    parser = argparse.ArgumentParser(description="#Keeper 관리용 앱 시뮬레이터")
    parser.add_argument("--speed", type=float, default=1, help="시나리오 재생 속도")
    parser.add_argument("--stay", action="store_true", help="끝난 뒤에도 연결 유지")
    parser.add_argument("--url", default=SERVER_URL, help="서버 주소")
    parser.add_argument("--email", help="회원가입한 점주의 매장으로 보낸다")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    try:
        device_key = load_device_key(args.email)
    except DeviceError as error:
        print(error)
        return 1

    device = Device(http_transport(args.url, device_key))
    stop = threading.Event()
    heartbeat = threading.Thread(target=keep_alive, args=(device, stop, HEARTBEAT_SECONDS), daemon=True)

    try:
        device.heartbeat()
        print("관리용 앱 시작 → 연동 대기가 운영 정상으로 바뀝니다")
        heartbeat.start()
        run_scenario(device, speed=args.speed)
        if args.stay:
            print("시나리오 끝. 연결을 유지합니다. Ctrl+C로 종료하세요.")
            stop.wait()
        else:
            print("시나리오 끝. 신호가 멈췄으니 5분 뒤 점주 앱에 연결 끊김이 표시됩니다.")
    except DeviceError as error:
        print(error)
        return 1
    except KeyboardInterrupt:
        print("종료합니다.")
    finally:
        stop.set()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
