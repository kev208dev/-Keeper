# shop_keeper
경기미래창업

무인매장 점주용 앱 #Keeper입니다. 점주 앱(React)과 서버(FastAPI)로 구성되고, 무인 매장의 관리용 앱이 서버로 이벤트를 보냅니다.

## 실행

먼저 프로젝트 폴더에서 패키지를 설치합니다.

```bash
npm install
```

### 화면만 보기

서버 없이 연동 전 빈 화면을 봅니다. 지어낸 데이터는 표시하지 않습니다.

```bash
npm run dev:preview
```

### 서버와 함께 실행

Python 3.12 이상이 필요합니다. 처음 한 번 `server` 폴더에서 설치와 개발용 매장 생성을 합니다.

```bash
python -m venv .venv
```

```bash
.venv/Scripts/python -m pip install -r requirements-dev.txt
```

```bash
.venv/Scripts/python seed.py
```

앱의 회원가입으로 매장을 직접 만들 수도 있습니다. 가입하면 관리용 앱에 넣을 기기 키가 한 번 표시됩니다.

`seed.py`는 매장과 계정만 만들고 이벤트는 만들지 않습니다. 계정과 관리용 앱 키는 `server/dev-credentials.local.json`에 저장되며, 이 파일은 저장소에 올라가지 않습니다.

그다음 터미널 두 개를 열어 `server` 폴더에서 서버를, 프로젝트 폴더에서 앱을 실행합니다.

```bash
.venv/Scripts/python -m uvicorn asgi:app --port 8000
```

```bash
npm run dev
```

### 시뮬레이터

관리용 앱이 아직 없을 때는 시뮬레이터로 연동 흐름을 시험합니다. 실제 관리용 앱과 같은 경로로 이상행동, 문의, 카메라 끊김과 복구, 재전송을 보냅니다.

웹에서 쓰는 방법이 가장 간단합니다. 앱 주소 뒤에 `/simulator.html`을 붙여 엽니다. 개발 중에는 `http://localhost:5173/simulator.html`이고, 배포한 뒤에도 같은 경로로 열립니다.

- **로그인:** 점주 앱과 같은 계정을 씁니다. 기기 키는 페이지가 알아서 발급받습니다.
- **보내기:** 전체 시나리오를 실행하거나, 이벤트와 카메라 상태를 버튼으로 하나씩 보냅니다.
- **연결 상태:** 페이지를 열어 둔 동안 점주 앱에 운영 중으로 표시되고, 닫으면 5분 뒤 연결 끊김으로 바뀝니다.
- **답변:** 점주 앱에서 보낸 고객 문의 답변이 페이지에 표시됩니다.

터미널 시뮬레이터 `simulator.py`와 웹 페이지를 함께 켜면 답변을 먼저 가져간 쪽에만 표시됩니다.

터미널에서 쓰려면 서버가 실행 중인 상태에서 프로젝트 폴더의 `server` 폴더로 이동한 뒤 실행합니다. 다른 폴더에서 실행하면 `.venv/Scripts/python`을 찾지 못합니다. 약 1분에 걸쳐 시나리오를 보냅니다.

```bash
cd server
```

```bash
.venv/Scripts/python simulator.py
```

`--speed 5`로 빠르게 실행하고, `--stay`로 끝난 뒤에도 연결을 유지할 수 있습니다. `--stay`로 켜 두면 점주 앱에서 보낸 고객 문의 답변이 터미널에 표시됩니다.

기본 실행은 `seed.py`로 만든 개발용 매장으로 보냅니다. 회원가입한 매장으로 보내려면 그 이메일로 개발용 키를 한 번 만든 뒤 `--email`을 붙입니다.

```bash
.venv/Scripts/python issue_device_key.py 이메일
```

```bash
.venv/Scripts/python simulator.py --email 이메일
```

시험 데이터를 지우고 연동 전 상태로 돌아가려면 아래 명령을 실행합니다. 모든 매장의 이벤트가 지워지고 매장과 계정은 남습니다.

```bash
.venv/Scripts/python clear_dev_data.py
```

## 배포

`Dockerfile` 하나로 배포합니다. 서버 하나가 API, 점주 앱, 시뮬레이터를 함께 제공하므로 주소가 하나입니다. 배포한 주소가 `https://keeper-xxxx.onrender.com`이라면 점주 앱은 그 주소 그대로, 시뮬레이터는 뒤에 `/simulator.html`을 붙여 엽니다.

### Render에 배포하기

저장소의 `render.yaml`에 서버 종류, 지역(싱가포르), 영구 저장소, 상태 확인 경로가 들어 있습니다.

1. Render에 가입하고 GitHub 계정을 연결합니다.
2. 대시보드에서 **New > Blueprint**를 고르고 이 저장소를 선택합니다.
3. 유료 인스턴스와 저장소 요금을 확인하고 결제 정보를 입력한 뒤 만듭니다. 영구 저장소는 무료 인스턴스에서 쓸 수 없습니다.
4. 배포가 끝나면 `onrender.com` 주소가 생깁니다. 처음 DB는 비어 있으므로 점주 앱에서 회원가입부터 합니다.

`main` 브랜치에 푸시할 때마다 자동으로 다시 배포됩니다. 배포하는 몇 초 동안은 접속이 끊깁니다.

### 직접 실행하기

```bash
docker build -t keeper .
```

```bash
docker run -p 8000:8000 -v keeper-data:/data keeper
```

호스팅 서비스에 올릴 때 지켜야 할 것은 다음과 같습니다.

- **영구 저장소:** 컨테이너의 `/data` 폴더를 영구 저장소에 연결합니다. 연결하지 않으면 재시작할 때 모든 데이터가 사라집니다.
- **서버는 한 대만:** SQLite를 쓰므로 같은 DB로 서버를 두 대 이상 띄우면 안 됩니다. 여러 대가 필요해지면 PostgreSQL로 옮겨야 합니다.
- **HTTPS:** 호스팅 서비스의 HTTPS를 켭니다. 비밀번호와 기기 키가 오가므로 HTTP로 운영하면 안 됩니다.
- **프록시:** `FORWARDED_ALLOW_IPS=*`는 호스팅 서비스의 프록시 뒤에 있을 때만 안전합니다. 서버를 인터넷에 직접 노출한다면 값을 바꿔야 합니다.
- **백업:** Render는 영구 저장소를 하루 한 번 자동으로 스냅숏하고 7일간 보관합니다. 따로 백업하려면 서버 셸에서 `python -m keeper.backup /data/backups`를 실행하고, 백업 파일을 다른 곳에도 보관합니다.
- **실행 계정:** 컨테이너는 관리자로 시작해 저장소 권한만 고친 뒤 `keeper` 계정으로 서버를 실행합니다. 셸에서 실행하는 공지와 백업 명령도 스스로 `keeper` 계정으로 바뀝니다.
- **상태 확인:** 호스팅 서비스의 상태 확인 경로는 `/health`입니다.
- **공지사항:** `python -m keeper.notices "제목" "내용"`으로 등록합니다. 모든 매장의 점주에게 같은 공지가 보입니다.

설정 항목은 `.env.example`에 있습니다. DB 구조를 바꿀 때는 `server/keeper/db.py`의 `MIGRATIONS` 맨 뒤에 추가합니다.

개발용 스크립트(`seed.py`, `simulator.py`, `clear_dev_data.py`, `issue_device_key.py`)는 배포 이미지에 들어가지 않습니다.

## 테스트

```bash
npm test
```

```bash
npm run test:coverage
```

`server` 폴더에서 서버 테스트를 실행합니다.

```bash
.venv/Scripts/python -m pytest
```

## 구조

- `contract/`: 서버와 앱이 함께 지키는 데이터 형식. 양쪽 테스트가 모두 이 파일로 검증합니다.
- `server/keeper/`: 서버. 데이터는 매장별로 분리됩니다.
- `src/pages/`: 화면
- `src/components/`: 하단 메뉴, 아이콘, 공통 요소
- `src/simulator/`, `simulator.html`: 시뮬레이터 웹 페이지
- `src/domain/`: 집계와 상태 규칙. 화면의 숫자는 모두 여기서 계산합니다.
- `src/api/`: 서버 연결(`httpApi.ts`)과 서버 없는 빈 화면(`previewApi.ts`)
- `src/test/fixtures.ts`: 테스트 전용 예시 데이터. 앱 코드에서는 쓸 수 없습니다.
- `src/design.css`: 디자인 시안의 스타일을 그대로 옮긴 파일
- `src/styles.css`: 시안에 없는 앱 전용 스타일

## 관리용 앱 연동

관리용 앱은 `POST /ingest/events`로 이벤트를 보내고, `X-Device-Key` 헤더에 매장별 키를 넣습니다. 형식은 `contract/keeper.schema.json`, 종류별 예시는 `contract/examples/events.json`에 있습니다.

- 이벤트가 없어도 1분마다 `POST /ingest/heartbeat`를 보냅니다. 5분 동안 신호가 없으면 점주 앱에 연결이 끊겼다고 표시됩니다. 한 번도 연결된 적 없는 매장은 연동 대기로 표시됩니다.
- 이벤트마다 고유한 `eventId`를 넣습니다. 같은 `eventId`를 다시 보내면 한 번만 반영되므로, 응답을 받지 못했을 때 안심하고 재전송할 수 있습니다.
- 카메라는 `camera.status` 이벤트를 처음 보낼 때 등록되고, 이후에는 상태가 갱신됩니다.
- `door.closed`와 `clip.ready`가 원본 알림보다 먼저 도착하면 404를 받습니다. 원본 알림을 보낸 뒤 다시 보내면 됩니다.
- 점주가 고객 문의에 보낸 답변은 `POST /ingest/replies/pull`로 가져옵니다. 키오스크에 표시한 뒤 `POST /ingest/replies/{id}/delivered`를 보내면 점주 앱에 전달 완료로 표시됩니다. 전달 완료를 보내기 전까지는 같은 답변이 다시 내려오므로, 응답을 받지 못해도 답변을 잃지 않습니다.

서버가 실행 중이면 `http://127.0.0.1:8000/docs`에서 API 전체를 볼 수 있습니다.
