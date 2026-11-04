#!/usr/bin/env python3
"""Exercise the running demo through HTTP, including a generated real MP4 and clip."""

import argparse
import json
import sys
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "owner-app" / "server"))

from keeper.video_analysis import VideoZone, analyze_video, extract_clip, probe_video  # noqa: E402


class BrightFixtureDetector:
    """Deterministic detector only for the generated integration fixture, never for real CCTV."""

    def detect(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        points = cv2.findNonZero((gray > 180).astype(np.uint8))
        if points is None:
            return []
        x, y, width, height = cv2.boundingRect(points)
        return [(x, y, width, height, 0.99)]


class Api:
    def __init__(self, base: str, headers: dict[str, str] | None = None):
        self.base = base.rstrip("/")
        self.headers = headers or {}

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        json_body=None,
        body: bytes | None = None,
        raw: bool = False,
    ):
        headers = dict(self.headers)
        if json_body is not None:
            body = json.dumps(json_body, ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        request = Request(self.base + path, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=20) as response:
                payload = response.read()
                decoded = None if raw or not payload else json.loads(payload)
                return response.status, decoded, payload
        except (HTTPError, URLError) as error:
            detail = error.read().decode("utf-8", "replace") if isinstance(error, HTTPError) else str(error)
            raise RuntimeError(f"{method} {path}: {detail}") from error


def make_video(path: Path) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 10, (320, 180))
    if not writer.isOpened():
        raise RuntimeError("OpenCV가 MP4 fixture를 만들 수 없습니다.")
    try:
        for frame_index in range(70):
            frame = np.zeros((180, 320, 3), dtype=np.uint8)
            x = 15 + frame_index * 4
            cv2.rectangle(frame, (x, 65), (x + 28, 145), (255, 255, 255), -1)
            writer.write(frame)
    finally:
        writer.release()


def event(event_id: str, kind: str, **fields) -> dict:
    from datetime import datetime

    return {"eventId": event_id, "type": kind, "occurredAt": datetime.now().astimezone().isoformat(), **fields}


def assert_status(actual, expected, label: str) -> None:
    if actual != expected:
        raise RuntimeError(f"{label}: expected {expected}, got {actual}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="http://127.0.0.1:8000")
    parser.add_argument("--credentials", type=Path, default=ROOT / ".demo" / "credentials.json")
    args = parser.parse_args()
    credentials = json.loads(args.credentials.read_text(encoding="utf-8"))
    anonymous = Api(args.server)
    try:
        Api("http://127.0.0.1:1").request("/health")
        raise RuntimeError("닫힌 포트의 네트워크 오류를 감지하지 못했습니다.")
    except RuntimeError as expected_network_error:
        if "닫힌 포트" in str(expected_network_error):
            raise
    assert_status(anonymous.request("/health")[0], 200, "network recovery")
    status, login, _ = anonymous.request(
        "/api/auth/login",
        method="POST",
        json_body={"email": credentials["email"], "password": credentials["password"]},
    )
    assert_status(status, 200, "owner login")
    owner = Api(args.server, {"Authorization": f"Bearer {login['token']}"})
    device_id = "integration-tablet"
    device = Api(
        args.server,
        {"X-Device-Key": credentials["deviceKey"], "X-Device-Id": device_id},
    )
    run_id = uuid4().hex[:10]

    inquiry_id = f"verify-{run_id}-inquiry"
    inquiry = event(
        inquiry_id,
        "inquiry.created",
        title="통합 테스트 문의",
        note="실제 HTTP 문의 흐름",
        transcript=["고객: 통합 테스트 문의입니다."],
        status="forwarded",
        deviceId=device_id,
    )
    assert device.request("/ingest/events", method="POST", json_body=inquiry)[1]["status"] == "accepted"
    assert device.request("/ingest/events", method="POST", json_body=inquiry)[1]["status"] == "duplicate"
    _, reply, _ = owner.request(
        f"/api/inquiries/{quote(inquiry_id)}/replies",
        method="POST",
        json_body={"body": "통합 테스트 답변입니다."},
    )
    simulator = Api(
        args.server,
        {"X-Device-Key": credentials["deviceKey"], "X-Device-Id": "web-simulator"},
    )
    assert simulator.request("/ingest/replies/pull", method="POST", json_body={})[1] == []
    waiting = device.request("/ingest/replies/pull", method="POST", json_body={})[1]
    assert [item["id"] for item in waiting] == [reply["id"]]
    assert_status(
        device.request(f"/ingest/replies/{quote(reply['id'])}/delivered", method="POST", json_body={})[0],
        204,
        "reply ACK",
    )

    camera_id = f"verify-{run_id}-camera"
    camera_fields = {"cameraId": camera_id, "name": "통합 테스트 카메라", "location": "입구"}
    device.request(
        "/ingest/events",
        method="POST",
        json_body=event(f"verify-{run_id}-camera-on", "camera.status", status="connected", **camera_fields),
    )

    with tempfile.TemporaryDirectory(prefix="keeper-verify-", dir=ROOT / ".demo") as folder:
        work = Path(folder)
        video = work / "fixture.mp4"
        clip_path = work / "clip.mp4"
        make_video(video)
        report = analyze_video(
            video,
            [
                VideoZone("진열대", ((0, 0), (160, 0), (160, 180), (0, 180))),
                VideoZone("출입구", ((160, 0), (320, 0), (320, 180), (160, 180))),
            ],
            detector=BrightFixtureDetector(),
            sample_every=1,
            stable_frames=2,
        )
        if not report.transitions:
            raise RuntimeError("생성 영상에서 ROI 이동을 찾지 못했습니다.")
        transition = report.transitions[0]
        extract_clip(video, clip_path, transition.at_seconds, before_seconds=1, after_seconds=1)

        query = urlencode({"filename": video.name})
        _, recording, _ = owner.request(
            f"/api/cameras/{quote(camera_id)}/recordings?{query}", method="POST", body=video.read_bytes()
        )
        movement_id = f"verify-{run_id}-movement"
        device.request(
            "/ingest/events",
            method="POST",
            json_body=event(
                movement_id,
                "alert.movement",
                cameraId=camera_id,
                **{
                    "from": transition.from_zone,
                    "to": transition.to_zone,
                    "unpaid": False,
                    "source": "analysis",
                    "confidence": transition.confidence,
                    "reason": "생성된 통합 테스트 영상의 밝은 객체가 ROI 사이를 이동함",
                },
            ),
        )
        clip_query = urlencode({"cameraId": camera_id, "kind": "clip", "filename": clip_path.name})
        _, uploaded_clip, _ = device.request(
            f"/ingest/media?{clip_query}", method="POST", body=clip_path.read_bytes()
        )
        duration = max(1, round(probe_video(clip_path).duration_seconds))
        device.request(
            "/ingest/events",
            method="POST",
            json_body=event(
                f"verify-{run_id}-clip",
                "clip.ready",
                alertEventId=movement_id,
                duration=f"{duration // 60:02}:{duration % 60:02}",
                mediaId=uploaded_clip["id"],
            ),
        )
        assert owner.request(f"/api/media/{quote(recording['id'])}", raw=True)[2] == video.read_bytes()
        assert owner.request(f"/api/media/{quote(uploaded_clip['id'])}", raw=True)[2] == clip_path.read_bytes()

    device.request(
        "/ingest/events",
        method="POST",
        json_body=event(f"verify-{run_id}-camera-off", "camera.status", status="disconnected", **camera_fields),
    )
    device.request(
        "/ingest/events",
        method="POST",
        json_body=event(f"verify-{run_id}-camera-back", "camera.status", status="connected", **camera_fields),
    )
    _, dashboard, _ = owner.request("/api/dashboard?since=2000-01-01T00:00:00%2B09:00")
    camera = next(item for item in dashboard["cameras"] if item["id"] == camera_id)
    alert = next(item for item in dashboard["alerts"] if item["id"] == movement_id)
    assert camera["status"] == "connected"
    assert alert["source"] == "analysis" and alert["unpaid"] is False
    assert any(item.get("mediaId") == uploaded_clip["id"] for item in dashboard["clips"])
    print(
        json.dumps(
            {
                "status": "passed",
                "runId": run_id,
                "inquiryId": inquiry_id,
                "alertId": movement_id,
                "recordingMediaId": recording["id"],
                "clipMediaId": uploaded_clip["id"],
                "videoTransitions": len(report.transitions),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
