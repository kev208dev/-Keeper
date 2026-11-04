"""Local CCTV file analysis for the Keeper demo.

The built-in detector only identifies people and ROI transitions. It deliberately does not
infer theft or payment state. OpenCV is Apache-2.0 licensed; ffmpeg remains a separately
installed system dependency whose codec licensing depends on the local build.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

import cv2
import numpy as np


Detection = tuple[int, int, int, int, float]


@dataclass(frozen=True)
class VideoZone:
    name: str
    polygon: tuple[tuple[int, int], ...]

    def contains(self, point: tuple[int, int]) -> bool:
        contour = np.asarray(self.polygon, dtype=np.int32)
        return cv2.pointPolygonTest(contour, point, False) >= 0


@dataclass(frozen=True)
class Transition:
    track_id: int
    from_zone: str
    to_zone: str
    at_seconds: float
    confidence: float


@dataclass(frozen=True)
class VideoMetadata:
    duration_seconds: float
    width: int
    height: int
    fps: float


@dataclass(frozen=True)
class AnalysisReport:
    source: str
    duration_seconds: float
    frames_processed: int
    transitions: tuple[Transition, ...]


class ObjectDetector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]: ...


@dataclass
class _Track:
    detection: Detection
    missing: int = 0

    @property
    def centroid(self) -> tuple[int, int]:
        x, y, width, height, _ = self.detection
        return x + width // 2, y + height // 2


class CentroidTracker:
    def __init__(self, max_distance: float = 90, max_missing: int = 4) -> None:
        self.max_distance = max_distance
        self.max_missing = max_missing
        self._tracks: dict[int, _Track] = {}
        self._next_id = 1

    def update(self, detections: list[Detection]) -> dict[int, Detection]:
        unmatched = set(range(len(detections)))
        visible: dict[int, Detection] = {}
        for track_id, track in list(self._tracks.items()):
            best_index: int | None = None
            best_distance = math.inf
            for index in unmatched:
                x, y, width, height, _ = detections[index]
                centroid = (x + width // 2, y + height // 2)
                distance = math.dist(track.centroid, centroid)
                if distance < best_distance:
                    best_index, best_distance = index, distance
            if best_index is not None and best_distance <= self.max_distance:
                track.detection = detections[best_index]
                track.missing = 0
                unmatched.remove(best_index)
                visible[track_id] = track.detection
            else:
                track.missing += 1
                if track.missing > self.max_missing:
                    del self._tracks[track_id]

        for index in sorted(unmatched):
            track_id = self._next_id
            self._next_id += 1
            track = _Track(detections[index])
            self._tracks[track_id] = track
            visible[track_id] = track.detection
        return visible


@dataclass
class _ZoneState:
    current: str | None = None
    candidate: str | None = None
    count: int = 0


class RoiTransitionDetector:
    def __init__(self, zones: list[VideoZone], stable_frames: int = 2) -> None:
        if stable_frames < 1:
            raise ValueError("stable_frames must be positive")
        self.zones = zones
        self.stable_frames = stable_frames
        self._states: dict[int, _ZoneState] = {}

    def _zone_at(self, point: tuple[int, int]) -> str | None:
        return next((zone.name for zone in self.zones if zone.contains(point)), None)

    def observe(
        self,
        track_id: int,
        point: tuple[int, int],
        at_seconds: float,
        confidence: float,
    ) -> Transition | None:
        zone = self._zone_at(point)
        state = self._states.setdefault(track_id, _ZoneState())
        if zone == state.current:
            state.candidate, state.count = None, 0
            return None
        if zone != state.candidate:
            state.candidate, state.count = zone, 1
        else:
            state.count += 1
        if state.count < self.stable_frames:
            return None

        previous = state.current
        state.current, state.candidate, state.count = zone, None, 0
        if previous is None or zone is None:
            return None
        return Transition(track_id, previous, zone, at_seconds, confidence)


class HogPersonDetector:
    """OpenCV's bundled, pre-trained HOG/SVM pedestrian detector."""

    def __init__(self, hit_threshold: float = 0.0) -> None:
        self.hit_threshold = hit_threshold
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect(self, frame: np.ndarray) -> list[Detection]:
        boxes, weights = self.hog.detectMultiScale(
            frame,
            hitThreshold=self.hit_threshold,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.05,
        )
        return [
            (int(x), int(y), int(width), int(height), max(0.0, min(1.0, float(weight))))
            for (x, y, width, height), weight in zip(boxes, weights, strict=True)
        ]


def analyze_video(
    source: str | Path,
    zones: list[VideoZone],
    detector: ObjectDetector | None = None,
    sample_every: int = 5,
    stable_frames: int = 2,
) -> AnalysisReport:
    if sample_every < 1:
        raise ValueError("sample_every must be positive")
    path = Path(source)
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError(f"영상을 열 수 없습니다: {path}")
    fps = capture.get(cv2.CAP_PROP_FPS)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if not math.isfinite(fps) or fps <= 0:
        capture.release()
        raise ValueError("영상 FPS 정보를 읽을 수 없습니다.")

    object_detector = detector or HogPersonDetector()
    tracker = CentroidTracker()
    transitions = RoiTransitionDetector(zones, stable_frames)
    found: list[Transition] = []
    processed = 0
    frame_index = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % sample_every == 0:
                processed += 1
                for track_id, detection in tracker.update(object_detector.detect(frame)).items():
                    x, y, width, height, confidence = detection
                    movement = transitions.observe(
                        track_id,
                        (x + width // 2, y + height // 2),
                        frame_index / fps,
                        confidence,
                    )
                    if movement is not None:
                        found.append(movement)
            frame_index += 1
    finally:
        capture.release()
    duration = (total_frames or frame_index) / fps
    return AnalysisReport(str(path), duration, processed, tuple(found))


def probe_video(path: str | Path) -> VideoMetadata:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate:format=duration",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise RuntimeError("ffprobe가 없습니다. macOS에서는 brew install ffmpeg를 실행하세요.") from error
    except subprocess.CalledProcessError as error:
        raise ValueError(f"영상 정보를 읽지 못했습니다: {error.stderr.strip()}") from error
    payload = json.loads(result.stdout)
    if not payload.get("streams"):
        raise ValueError("재생 가능한 영상 스트림이 없습니다.")
    stream = payload["streams"][0]
    numerator, denominator = (int(part) for part in stream["r_frame_rate"].split("/"))
    return VideoMetadata(
        float(payload["format"]["duration"]),
        int(stream["width"]),
        int(stream["height"]),
        numerator / denominator,
    )


def extract_clip(
    source: str | Path,
    destination: str | Path,
    event_seconds: float,
    before_seconds: float = 5,
    after_seconds: float = 5,
) -> Path:
    metadata = probe_video(source)
    start = max(0.0, event_seconds - before_seconds)
    finish = min(metadata.duration_seconds, event_seconds + after_seconds)
    if finish <= start:
        raise ValueError("클립 구간이 영상 범위 밖입니다.")
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(source),
        "-t",
        f"{finish - start:.3f}",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(target),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise RuntimeError("ffmpeg가 없습니다. macOS에서는 brew install ffmpeg를 실행하세요.") from error
    except subprocess.CalledProcessError as error:
        target.unlink(missing_ok=True)
        raise RuntimeError(f"감지 클립 생성에 실패했습니다: {error.stderr.strip()}") from error
    if not target.is_file() or target.stat().st_size == 0:
        raise RuntimeError("ffmpeg가 빈 클립을 만들었습니다.")
    return target


def build_movement_event(
    event_id: str,
    camera_id: str,
    from_zone: str,
    to_zone: str,
    confidence: float,
    occurred_at: str,
) -> dict:
    return {
        "eventId": event_id,
        "type": "alert.movement",
        "occurredAt": occurred_at,
        "cameraId": camera_id,
        "from": from_zone,
        "to": to_zone,
        "unpaid": False,
        "source": "analysis",
        "confidence": round(confidence, 4),
        "reason": "사람 추적 대상이 관심 구역 사이를 이동해 영상 확인이 필요합니다.",
    }


class KeeperClient:
    def __init__(self, base_url: str, device_key: str, device_id: str = "video-analyzer") -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-Device-Key": device_key, "X-Device-Id": device_id}

    def _request(self, path: str, body: bytes, content_type: str) -> dict:
        request = Request(
            self.base_url + path,
            data=body,
            method="POST",
            headers={**self.headers, "Content-Type": content_type},
        )
        try:
            with urlopen(request, timeout=30) as response:
                data = response.read()
        except (HTTPError, URLError) as error:
            detail = error.read().decode("utf-8", "replace") if isinstance(error, HTTPError) else str(error)
            raise RuntimeError(f"Keeper API 요청 실패: {detail}") from error
        return json.loads(data) if data else {}

    def send_event(self, event: dict) -> dict:
        return self._request(
            "/ingest/events",
            json.dumps(event, ensure_ascii=False).encode("utf-8"),
            "application/json",
        )

    def upload_clip(self, camera_id: str, path: Path) -> dict:
        query = urlencode({"cameraId": camera_id, "kind": "clip", "filename": path.name})
        return self._request(f"/ingest/media?{query}", path.read_bytes(), "video/mp4")


def load_zones(path: str | Path) -> list[VideoZone]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    zones = payload.get("zones") if isinstance(payload, dict) else payload
    if not isinstance(zones, list) or not zones:
        raise ValueError("ROI JSON에는 하나 이상의 zones 배열이 필요합니다.")
    return [
        VideoZone(
            str(item["name"]),
            tuple((int(point[0]), int(point[1])) for point in item["polygon"]),
        )
        for item in zones
    ]


def run_pipeline(
    source: Path,
    zones: list[VideoZone],
    client: KeeperClient,
    camera_id: str,
    camera_name: str,
    camera_location: str,
    sample_every: int,
) -> dict:
    now = datetime.now().astimezone().isoformat()
    client.send_event(
        {
            "eventId": f"analysis-{uuid4().hex}-camera-on",
            "type": "camera.status",
            "occurredAt": now,
            "cameraId": camera_id,
            "name": camera_name,
            "location": camera_location,
            "status": "connected",
        }
    )
    report = analyze_video(source, zones, sample_every=sample_every)
    sent: list[dict] = []
    with tempfile.TemporaryDirectory(prefix="keeper-clips-") as folder:
        for transition in report.transitions:
            alert_id = f"analysis-{uuid4().hex}"
            occurred_at = datetime.now().astimezone().isoformat()
            event = build_movement_event(
                alert_id,
                camera_id,
                transition.from_zone,
                transition.to_zone,
                transition.confidence,
                occurred_at,
            )
            client.send_event(event)
            clip_path = extract_clip(
                source, Path(folder) / f"{alert_id}.mp4", transition.at_seconds
            )
            media = client.upload_clip(camera_id, clip_path)
            duration = probe_video(clip_path).duration_seconds
            client.send_event(
                {
                    "eventId": f"{alert_id}-clip",
                    "type": "clip.ready",
                    "occurredAt": occurred_at,
                    "alertEventId": alert_id,
                    "duration": f"{int(duration) // 60:02}:{int(round(duration)) % 60:02}",
                    "mediaId": media["id"],
                }
            )
            sent.append({"alertId": alert_id, "mediaId": media["id"], **asdict(transition)})
    return {**asdict(report), "transitions": sent}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Keeper 로컬 CCTV 영상 분석")
    parser.add_argument("video", type=Path)
    parser.add_argument("--roi", type=Path, required=True)
    parser.add_argument("--server", default="http://127.0.0.1:8000")
    parser.add_argument("--device-key", required=True)
    parser.add_argument("--device-id", default="video-analyzer")
    parser.add_argument("--camera-id", default="cam-01")
    parser.add_argument("--camera-name", default="카메라 01")
    parser.add_argument("--camera-location", default="매장")
    parser.add_argument("--sample-every", type=int, default=5)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    result = run_pipeline(
        args.video,
        load_zones(args.roi),
        KeeperClient(args.server, args.device_key, args.device_id),
        args.camera_id,
        args.camera_name,
        args.camera_location,
        args.sample_every,
    )
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
