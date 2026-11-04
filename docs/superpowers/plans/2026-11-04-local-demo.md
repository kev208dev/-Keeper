# Keeper Local Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MacBook, Android kiosk, owner phone, and CCTV file can demonstrate Keeper's three end-to-end flows locally.

**Architecture:** Extend the existing FastAPI/SQLite event system with device-targeted replies and authenticated media, add a local OpenCV/ffmpeg analyzer, connect the existing React UI to real videos, and build a native Android app around the existing Supertonic engine. Keep every new capability behind the current store/device authentication boundaries.

**Tech Stack:** Python 3.12+, FastAPI, SQLite, OpenCV, ffmpeg, React/TypeScript/Vite, Java Android API 26+, ONNX Runtime/Supertonic 3, shell scripts.

**Spec:** `docs/superpowers/specs/2026-11-04-local-demo-design.md`

## Global Constraints

- Android 8.0/API 26 or newer; landscape-first native app.
- No cloud service or public static CCTV path.
- Preserve existing APIs and owner UI design where compatible.
- Never infer theft or non-payment without POS data; analysis emits `확인 필요` evidence.
- Demo data uses a separate database and media root; real CCTV/model weights stay out of Git.
- Device/store secrets are never hardcoded.

## Review Focus

- A simulator with the same store key cannot pull or ACK a tablet-targeted reply.
- Media IDs from another store and path traversal attempts return the same safe failure.
- Network retry reuses the inquiry event ID and does not duplicate the inquiry.
- Missing/corrupt video and absent ffmpeg produce actionable errors without false events.
- App restart recovers the pending inquiry and only ACKs after rendering the reply.

---

### Task 1: Device-targeted replies and authenticated media

**Files:**
- Modify: `owner-app/server/keeper/db.py`, `schemas.py`, `repository.py`, `main.py`
- Modify: `owner-app/contract/keeper.schema.json`
- Test: `owner-app/server/tests/test_kiosk_media.py`, existing server tests

**Interfaces:**
- Consumes: existing device key and event ingest APIs.
- Produces: `deviceId` targeting, `mediaId` clip contract, owner/device upload and authenticated download endpoints.

- [ ] Write API tests for targeted pull/ACK, legacy compatibility, duplicate events, store isolation, upload/download, and unsafe filenames.
- [ ] Run the focused tests and verify missing schema/routes fail.
- [ ] Add additive SQLite migration and repository operations.
- [ ] Add Pydantic fields and FastAPI routes with streamed file responses and bounded upload sizes.
- [ ] Run focused and complete server suites.
- [ ] Commit `feat(server): add targeted replies and protected media`.

### Task 2: File video analyzer and clip creation

**Files:**
- Create: `owner-app/server/keeper/video_analysis.py`, `owner-app/server/tests/test_video_analysis.py`
- Modify: `owner-app/server/requirements*.txt`, `.gitignore`

**Interfaces:**
- Consumes: MP4/MOV path, ROI JSON, server URL, device key, camera ID.
- Produces: camera status, analysis movement events, protected clip uploads, `clip.ready` events, machine-readable run report.

- [ ] Write failing tests using a generated moving-shape/person-like fixture for ROI transitions, centroid tracking, and ffmpeg clip bounds.
- [ ] Verify failures before implementation.
- [ ] Implement capture sampling, HOG detector abstraction, centroid tracker, ROI transition policy, HTTP client, and ffmpeg clip extraction.
- [ ] Run focused and complete server suites.
- [ ] Commit `feat(video): analyze local recordings and attach clips`.

### Task 3: Owner app real video and simulator controls

**Files:**
- Modify: `owner-app/src/api/{types,httpApi,previewApi}.ts`, domain types/rules, `CameraPreview.tsx`, CCTV/detail pages, `OwnerApp.tsx`
- Modify: `owner-app/src/simulator/{SimulatorApp,deviceApi,events}.tsx`, CSS
- Test: API/page/simulator tests

**Interfaces:**
- Consumes: dashboard `mediaId`, protected media API, simulator device ID and upload API.
- Produces: authenticated playable Blob URLs, source/evidence labels, manual step/pause/restart/interval controls and file upload.

- [ ] Add failing component and API tests for real `<video>`, media errors, source labels, consumer ID and delayed ACK.
- [ ] Verify expected failures.
- [ ] Implement media Blob lifecycle and minimal UI changes in the existing design system.
- [ ] Implement simulator consumer separation, video upload, manual scenario cursor, pause/restart and adjustable interval.
- [ ] Run `npm test -- --run` and `npm run build`.
- [ ] Commit `feat(owner): play protected video and control demo scenarios`.

### Task 4: Native Android kiosk with shared Supertonic engine

**Files:**
- Create: `kiosk-android` Gradle app, manifest/resources, Java UI/network/state classes and tests
- Create: `tts/android/app/src/main/java/io/keeper/tts/KeeperTtsEngine.java`
- Modify: TTS/Android build documentation and model preparation script as needed

**Interfaces:**
- Consumes: ingest events/reply APIs, shared Supertonic source/assets.
- Produces: API 26 debug APK; home/inquiry/voice/reply/settings flows; display-before-ACK polling and offline TTS.

- [ ] Write failing JVM tests for retry identity, pending inquiry persistence, reply deduplication and ACK ordering.
- [ ] Verify test failures.
- [ ] Add Gradle project and pure Java kiosk state/network layer.
- [ ] Add native landscape immersive UI and developer settings.
- [ ] Extract a public cached, serialized Supertonic wrapper and integrate it through shared source/assets.
- [ ] Run Gradle unit tests, lint and `assembleDebug`; record APK hash or exact environment blocker.
- [ ] Commit `feat(kiosk): add native Android kiosk with offline Supertonic`.

### Task 5: macOS demo automation, integration proof and docs

**Files:**
- Create: `scripts/{setup-macos,start-demo,reset-demo,check-demo}.sh`
- Create/modify: `README.md`, `docs/{LOCAL_DEMO,ANDROID_KIOSK,CCTV_TEST,DEMO_SCENARIO,TEST_RESULTS}.md`
- Create: end-to-end integration test and safe generated sample video utility

**Interfaces:**
- Consumes: all previous task commands and endpoints.
- Produces: one-command demo environment, safe reset, health diagnosis, reproducible test report.

- [ ] Write failing integration/script behavior tests for separate DB, reset scope and full inquiry/media flows.
- [ ] Implement scripts with PID/log handling, local IP discovery and checks.
- [ ] Run real API integration from seed through reply delivery, analysis alert, media playback authorization, camera disconnect/recovery and reset.
- [ ] Update all requested documentation with only verified states.
- [ ] Run full Python, React, Android-available, shell and integration verification; inspect git diff for secrets/large files.
- [ ] Commit `docs(demo): add macOS runner and verified demo guide`.

## Self-review

The five tasks cover every priority in the request while explicitly leaving smartphone live streaming and real-device accuracy as documented extensions. Interfaces use consistent `deviceId` and `mediaId` names. Each production behavior starts with a focused failing test; scripts and prose are verified by execution rather than source-text assertions.
