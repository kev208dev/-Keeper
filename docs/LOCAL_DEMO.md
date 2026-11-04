# macOS 로컬 시연

## 1. 준비

MacBook과 Android 태블릿, 점주 스마트폰을 같은 Wi-Fi에 연결합니다. Python 3.12+, Node.js/npm, ffmpeg/ffprobe가 필요합니다. Node 25는 현재 테스트 도구의 지원 범위가 아니므로 Node 24 LTS를 사용합니다. Homebrew를 쓴다면 먼저 설치할 수 있습니다.

```bash
brew install python@3.12 node@24 ffmpeg
```

저장소 루트에서 프로젝트 전용 Python 환경, Python/Node 의존성, React 정적 빌드와 시연 계정을 준비합니다.

```bash
./scripts/setup-macos.sh
```

이 스크립트는 시스템 명령을 확인하고 `owner-app/server/.venv`, `owner-app/node_modules`, `owner-app/dist`, `.demo/keeper.db`를 준비합니다. 실제 데이터베이스나 기존 개발 DB는 건드리지 않습니다.

## 2. 시작과 접속

```bash
./scripts/start-demo.sh
```

FastAPI가 `0.0.0.0:8000`에서 API, 점주 앱, 시뮬레이터를 함께 제공합니다. 스크립트가 출력한 주소를 사용합니다.

- MacBook: `http://127.0.0.1:8000/`
- 스마트폰 점주 앱: `http://<MacBook Wi-Fi IP>:8000/`
- 웹 시뮬레이터: `http://<MacBook Wi-Fi IP>:8000/simulator.html`
- API 문서: `http://127.0.0.1:8000/docs`

스마트폰이나 태블릿에서 `localhost`를 입력하면 그 기기 자신을 가리키므로 사용할 수 없습니다. macOS 방화벽이 묻는 경우 Python의 수신 연결을 허용합니다.

로그인 이메일·비밀번호와 Android에 입력할 기기 키는 다음 명령으로 확인합니다. 화면 공유 중에는 기기 키를 노출하지 마세요.

```bash
owner-app/server/.venv/bin/python scripts/demo_data.py show
```

서버 PID와 로그는 각각 `.demo/server.pid`, `.demo/server.log`에 있습니다. 실행 중에는 macOS `caffeinate`가 서버 PID를 감시해 시스템 절전을 막습니다. 정상 종료는 다음 명령을 사용합니다.

```bash
./scripts/stop-demo.sh
```

## 3. 확인과 초기화

빠른 상태 확인:

```bash
./scripts/check-demo.sh
```

실제 HTTP 문의/답변/ACK, 생성 MP4, ROI 이동 분석, ffmpeg 클립, 보호 미디어, 카메라 끊김·복구까지 실행:

```bash
./scripts/check-demo.sh --full
```

촬영 전 이벤트와 미디어만 비우고 매장 계정은 유지합니다.

```bash
./scripts/reset-demo.sh
```

초기화 도구는 경로가 저장소의 `.demo` 바로 아래인지 검사합니다. 다른 DB나 디렉터리를 인수로 넘겨 삭제할 수 없도록 제한되어 있습니다.

## 4. 환경 변수

- `KEEPER_PORT=8080 ./scripts/start-demo.sh`: 포트 변경
- `KEEPER_PORT=8080 ./scripts/check-demo.sh`: 같은 포트 점검
- `KEEPER_SETUP_CHECK_ONLY=1 ./scripts/setup-macos.sh`: 설치 없이 시스템 명령만 확인

시연 DB·미디어는 `.demo`에만 저장되고 `.gitignore`로 제외됩니다.
