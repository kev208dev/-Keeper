# CCTV 녹화 영상 테스트

## 지원 형식과 정확한 범위

서버는 MP4, MOV, M4V, WebM 등록과 인증된 재생을 지원합니다. 분석 CLI는 OpenCV가 읽을 수 있는 로컬 영상 파일을 샘플링하고, OpenCV HOG 사람 탐지 → 중심점 추적 → ROI 안정 전환 → ffmpeg 실제 클립 생성 → API 등록 순서로 처리합니다.

이 파이프라인은 사람 이동과 영상 근거를 제공할 뿐 결제나 절도를 판정하지 않습니다. 상품 훼손·냉장고 문 상태도 전용 모델/상태 입력이 없으면 자동 확정하지 않습니다.

## ROI 파일

픽셀 좌표의 다각형을 시계 방향 또는 반시계 방향으로 작성합니다.

```json
{
  "zones": [
    {"name": "입구 진열대", "polygon": [[0, 0], [640, 0], [640, 1080], [0, 1080]]},
    {"name": "냉동고 구역", "polygon": [[640, 0], [1920, 0], [1920, 1080], [640, 1080]]}
  ]
}
```

영상 해상도에 맞춰 좌표를 조정합니다. 카메라가 흔들리거나 사람이 너무 작으면 HOG가 탐지하지 못할 수 있으므로 고정 카메라·밝은 영상·전신이 보이는 구도를 권장합니다.

## 실제 파일 분석

서버를 시작하고 `.demo/credentials.json`의 기기 키를 사용합니다.

```bash
cd owner-app/server
.venv/bin/python -m keeper.video_analysis /absolute/path/store.mp4 \
  --roi /absolute/path/roi.json \
  --server http://127.0.0.1:8000 \
  --device-key '발급된-기기-키' \
  --camera-id cam-01 \
  --camera-name '입구 카메라' \
  --camera-location '출입구' \
  --report ../../.demo/analysis-report.json
```

전환이 있으면 원본 앞뒤 구간을 H.264 MP4로 자르고, 보호된 기기 업로드 API에 저장한 뒤 `clip.ready.mediaId`로 연결합니다. 점주 앱 CCTV/알림 상세의 `<video controls>`에서 인증된 Blob URL로 재생합니다.

## 재현 가능한 생성 영상 검증

외부 저작물이 아닌 직접 생성한 MP4로 전체 파일·API 연결을 확인합니다.

```bash
./scripts/start-demo.sh
./scripts/check-demo.sh --full
```

이 검증은 밝은 사각형 fixture용 결정적 detector를 사용해 ROI/추적/클립/API 배선을 검증합니다. 실제 HOG 사람 탐지 정확도를 검증한 것으로 해석하면 안 됩니다. HOG 자체와 실제 VideoCapture/ffmpeg는 별도 자동 테스트를 통과합니다.

## 라이선스

- `opencv-python-headless`: Apache-2.0
- 현재 Homebrew `ffmpeg` formula: GPL-3.0-or-later(포함 codec에 따라 배포 조건 확인 필요)
- 실제 매장 CCTV 영상: 저장소에 커밋하지 않고 촬영·사용 권한을 확인

스마트폰 실시간 RTSP/WebRTC 입력은 이번 완료 범위에 포함되지 않습니다. 파일 입력과 API 경계가 스트림 어댑터 확장 지점입니다.
