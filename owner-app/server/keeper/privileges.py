"""배포 컨테이너에서 관리자 권한을 버리고 서버 전용 계정으로 실행한다.

Render 같은 호스팅 서비스는 영구 저장소를 관리자 소유로 붙인다. 그래서 컨테이너는 관리자로 시작해
저장소 소유권만 고친 뒤 바로 서버 계정으로 바꾼다. 개발 PC처럼 서버 계정이 없으면 아무것도 하지 않는다.
"""

import os
from pathlib import Path

SERVICE_USER = "keeper"


def is_root() -> bool:
    return hasattr(os, "getuid") and os.getuid() == 0


def take_data_dir(data_dir: Path, user: str = SERVICE_USER) -> None:
    """저장소와 그 안의 파일을 서버 계정 소유로 바꾼다. 관리자로 실행한 명령이 남긴 파일도 함께 고친다."""
    import pwd

    account = pwd.getpwnam(user)
    data_dir.mkdir(parents=True, exist_ok=True)
    for path in [data_dir, *data_dir.rglob("*")]:
        os.chown(path, account.pw_uid, account.pw_gid, follow_symlinks=False)


def drop_root(user: str = SERVICE_USER) -> None:
    if not is_root():
        return
    import pwd

    try:
        account = pwd.getpwnam(user)
    except KeyError:
        return
    os.setgroups([])
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)
