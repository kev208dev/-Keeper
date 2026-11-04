from pathlib import Path

import cv2
import numpy as np
import pytest

from keeper.video_analysis import (
    CentroidTracker,
    RoiTransitionDetector,
    VideoZone,
    analyze_video,
    build_movement_event,
    extract_clip,
    probe_video,
)


def zones() -> list[VideoZone]:
    return [
        VideoZone("진열대", ((0, 0), (79, 0), (79, 119), (0, 119))),
        VideoZone("출입구", ((80, 0), (159, 0), (159, 119), (80, 119))),
    ]


def write_moving_video(path: Path, seconds: int = 4, fps: int = 10) -> None:
    writer = cv2.VideoWriter(
        str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (160, 120)
    )
    assert writer.isOpened()
    for frame_index in range(seconds * fps):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        x = min(130, 10 + frame_index * 4)
        cv2.rectangle(frame, (x, 35), (x + 20, 95), (255, 255, 255), -1)
        writer.write(frame)
    writer.release()


class BrightRectangleDetector:
    def detect(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        points = cv2.findNonZero((gray > 200).astype(np.uint8))
        if points is None:
            return []
        x, y, width, height = cv2.boundingRect(points)
        return [(x, y, width, height, 0.91)]


def test_centroid_tracker_keeps_identity_for_nearby_detection():
    tracker = CentroidTracker(max_distance=40, max_missing=2)

    first = tracker.update([(10, 10, 20, 40, 0.8)])
    second = tracker.update([(18, 12, 20, 40, 0.9)])
    far = tracker.update([(130, 10, 20, 40, 0.7)])

    assert list(first) == [1]
    assert list(second) == [1]
    assert list(far) == [2]


def test_roi_transition_requires_stable_observations_in_each_zone():
    detector = RoiTransitionDetector(zones(), stable_frames=2)

    assert detector.observe(1, (30, 60), 0.0, 0.8) is None
    assert detector.observe(1, (32, 60), 0.1, 0.9) is None
    assert detector.observe(1, (100, 60), 1.0, 0.7) is None
    transition = detector.observe(1, (105, 60), 1.1, 0.8)

    assert transition is not None
    assert transition.track_id == 1
    assert transition.from_zone == "진열대"
    assert transition.to_zone == "출입구"
    assert transition.at_seconds == pytest.approx(1.1)
    assert transition.confidence == pytest.approx(0.8)


def test_analyze_generated_video_finds_roi_movement(tmp_path: Path):
    source = tmp_path / "moving.mp4"
    write_moving_video(source)

    report = analyze_video(
        source,
        zones(),
        detector=BrightRectangleDetector(),
        sample_every=2,
        stable_frames=2,
    )

    assert report.frames_processed == 20
    assert report.duration_seconds == pytest.approx(4.0, abs=0.2)
    assert len(report.transitions) == 1
    assert report.transitions[0].from_zone == "진열대"
    assert report.transitions[0].to_zone == "출입구"


def test_analysis_event_is_evidence_not_unpaid_claim():
    event = build_movement_event(
        event_id="analysis-1",
        camera_id="cam-01",
        from_zone="진열대",
        to_zone="출입구",
        confidence=0.73,
        occurred_at="2026-11-04T12:00:00+09:00",
    )

    assert event["type"] == "alert.movement"
    assert event["unpaid"] is False
    assert event["source"] == "analysis"
    assert event["confidence"] == 0.73
    assert "결제" not in event["reason"]
    assert "확인" in event["reason"]


def test_ffmpeg_extracts_bounded_real_clip(tmp_path: Path):
    source = tmp_path / "source.mp4"
    clip = tmp_path / "clip.mp4"
    write_moving_video(source, seconds=4)

    extract_clip(source, clip, event_seconds=2.0, before_seconds=1.0, after_seconds=1.0)
    metadata = probe_video(clip)

    assert clip.is_file()
    assert clip.stat().st_size > 0
    assert metadata.duration_seconds == pytest.approx(2.0, abs=0.25)
    assert metadata.width == 160
    assert metadata.height == 120
