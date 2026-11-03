"""배포 컨테이너의 시작점. 저장소 권한을 고치고 서버 계정으로 바꾼 뒤 서버를 띄운다.

    python -m keeper.serve

호스팅 서비스가 정한 PORT를 쓰고, 앞단 프록시가 알려주는 실제 접속 IP를 읽는다.
"""

import os
from pathlib import Path

from .privileges import drop_root, is_root, take_data_dir


def main() -> None:
    if is_root():
        take_data_dir(Path(os.environ["KEEPER_DB_PATH"]).parent)
    drop_root()
    port = os.environ.get("PORT", "8000")
    os.execvp("uvicorn", ["uvicorn", "asgi:app", "--host", "0.0.0.0", "--port", port, "--proxy-headers"])


if __name__ == "__main__":
    main()
