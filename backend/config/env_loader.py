"""
PartsFlow backend .env loader.

Loads backend/.env automatically when the Django config package is imported.
Existing OS environment variables always take precedence.
"""
import os
from pathlib import Path


def _strip_optional_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_backend_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"

    if not env_path.exists():
        return

    try:
        content = env_path.read_text(encoding="utf-8")
    except OSError:
        return

    for raw_line in content.splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        if line.startswith("export "):
            line = line[7:].lstrip()

        key, value = line.split("=", 1)
        key = key.strip()

        if not key:
            continue

        value = _strip_optional_quotes(value)

        # Do not overwrite environment variables supplied by the OS/host.
        os.environ.setdefault(key, value)
