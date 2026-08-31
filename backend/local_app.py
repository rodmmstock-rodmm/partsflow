import mimetypes
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path


def runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def bundle_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent.parent


APP_ROOT = runtime_root()
DATA_DIR = APP_ROOT / "data"
BACKUP_DIR = APP_ROOT / "backups"
DATA_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "partsflow_local.sqlite3"
FRONTEND_DIR = bundle_root() / "frontend_dist"

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ["DEBUG"] = "1"
os.environ["PARTSFLOW_LOCAL_DB"] = str(DB_PATH)
os.environ["ALLOWED_HOSTS"] = "127.0.0.1,localhost"
os.environ.setdefault("DJANGO_SECRET_KEY", "partsflow-local-edition")

import django  # noqa: E402

django.setup()

from django.core.management import call_command  # noqa: E402
from django.core.wsgi import get_wsgi_application  # noqa: E402
from waitress import serve  # noqa: E402


class FrontendMiddleware:
    def __init__(self, django_app, frontend_dir: Path):
        self.django_app = django_app
        self.frontend_dir = frontend_dir

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "/") or "/"
        if path.startswith("/api/") or path.startswith("/admin/") or path.startswith("/static/"):
            return self.django_app(environ, start_response)

        relative = path.lstrip("/")
        candidate = (self.frontend_dir / relative).resolve() if relative else self.frontend_dir / "index.html"
        try:
            candidate.relative_to(self.frontend_dir.resolve())
        except ValueError:
            candidate = self.frontend_dir / "index.html"

        if not candidate.is_file():
            candidate = self.frontend_dir / "index.html"

        if not candidate.is_file():
            body = b"PartsFlow Local frontend bundle not found."
            start_response("500 Internal Server Error", [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(body))),
            ])
            return [body]

        content = candidate.read_bytes()
        content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        if candidate.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        start_response("200 OK", [
            ("Content-Type", content_type),
            ("Content-Length", str(len(content))),
            ("Cache-Control", "no-store" if candidate.suffix == ".html" else "public, max-age=31536000, immutable"),
        ])
        return [content]


def open_browser_later(url: str):
    time.sleep(1.2)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main():
    print("=" * 62)
    print("PartsFlow Local Edition")
    print(f"Database : {DB_PATH}")
    print("URL      : http://127.0.0.1:8765")
    print("Internet : not required for local operation")
    print("=" * 62)
    print("Preparing local database...")
    call_command("migrate", interactive=False, verbosity=1)
    print("Database ready.")

    django_app = get_wsgi_application()
    app = FrontendMiddleware(django_app, FRONTEND_DIR)
    url = "http://127.0.0.1:8765"
    threading.Thread(target=open_browser_later, args=(url,), daemon=True).start()
    print("PartsFlow is running. Close this window to stop the local server.")
    serve(app, host="127.0.0.1", port=8765, threads=8)


if __name__ == "__main__":
    main()
