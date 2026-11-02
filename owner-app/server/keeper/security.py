import hashlib
import hmac
import secrets

SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1, "maxmem": 64 * 1024 * 1024}


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, dklen=32, **SCRYPT_PARAMS)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"{salt.hex()}:{_scrypt(password, salt).hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, expected = stored.split(":")
    return hmac.compare_digest(_scrypt(password, bytes.fromhex(salt)).hex(), expected)


# 없는 이메일도 같은 시간이 걸리게 해서 계정 존재 여부가 드러나지 않게 한다
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


def new_secret() -> str:
    return secrets.token_urlsafe(32)


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()
