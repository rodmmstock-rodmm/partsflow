"""Google Drive image resolver for PartsFlow using OAuth 2.0 user credentials.

Supported Part.image_path example:
    DATA1_Images/G3D00001.PIC.113206.jpg

Credentials are obtained once through the PartsFlow OAuth endpoints and stored
outside source control in backend/google-drive-token.json.
"""

from __future__ import annotations

import io
import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple

from django.core.cache import cache

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"
DEFAULT_ROOT_NAME = "DATA1_Images"


class DriveImageConfigError(RuntimeError):
    pass


class DriveImageNotFound(FileNotFoundError):
    pass


def normalize_drive_relative_path(value: str) -> str:
    """Return normalized DATA1_Images/... path, or empty string if not relative."""
    raw = str(value or "").strip().replace("\\", "/")
    raw = re.sub(r"/+", "/", raw).lstrip("/")
    if not raw:
        return ""
    if raw.lower().startswith("http://") or raw.lower().startswith("https://"):
        return ""
    if raw.lower().startswith("www.") or raw.startswith("//"):
        return ""
    if raw == DEFAULT_ROOT_NAME:
        return ""
    if not raw.lower().startswith(DEFAULT_ROOT_NAME.lower() + "/"):
        return ""

    parts = [p for p in raw.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        return ""
    if len(parts) < 2:
        return ""
    parts[0] = DEFAULT_ROOT_NAME
    return "/".join(parts)


def is_drive_relative_path(value: str) -> bool:
    return bool(normalize_drive_relative_path(value))


def _backend_dir() -> Path:
    # .../backend/core/drive_images.py -> .../backend
    return Path(__file__).resolve().parents[1]


def _path_from_env(name: str, default_name: str) -> Path:
    configured = os.getenv(name, "").strip()
    path = Path(configured).expanduser() if configured else _backend_dir() / default_name
    if not path.is_absolute():
        path = (_backend_dir() / path).resolve()
    return path


def oauth_client_file() -> Path:
    """OAuth web-client JSON downloaded from Google Cloud Console."""
    path = _path_from_env("GOOGLE_DRIVE_OAUTH_CLIENT_FILE", "google-oauth-client.json")
    if not path.exists():
        raise DriveImageConfigError(
            "ไม่พบ OAuth client JSON. วางไฟล์เป็น backend/google-oauth-client.json "
            "หรือกำหนด GOOGLE_DRIVE_OAUTH_CLIENT_FILE"
        )
    return path


def oauth_token_file() -> Path:
    return _path_from_env("GOOGLE_DRIVE_OAUTH_TOKEN_FILE", "google-drive-token.json")


def oauth_redirect_uri() -> str:
    value = os.getenv("GOOGLE_DRIVE_OAUTH_REDIRECT_URI", "").strip()
    if not value:
        raise DriveImageConfigError(
            "ยังไม่ได้กำหนด GOOGLE_DRIVE_OAUTH_REDIRECT_URI ใน backend/.env"
        )
    return value


def root_folder_id() -> str:
    value = os.getenv("GOOGLE_DRIVE_IMAGE_FOLDER_ID", "").strip()
    if not value:
        raise DriveImageConfigError(
            "ยังไม่ได้กำหนด GOOGLE_DRIVE_IMAGE_FOLDER_ID สำหรับโฟลเดอร์ DATA1_Images"
        )
    return value


def save_oauth_token_json(token_json: str) -> Path:
    path = oauth_token_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token_json, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    drive_service.cache_clear()
    return path


def oauth_connected() -> bool:
    return oauth_token_file().exists()


def _load_user_credentials():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
    except ImportError as exc:
        raise DriveImageConfigError(
            "ยังไม่ได้ติดตั้ง google-api-python-client/google-auth/google-auth-oauthlib"
        ) from exc

    token_path = oauth_token_file()
    if not token_path.exists():
        raise DriveImageConfigError(
            "Google Drive ยังไม่ได้เชื่อม OAuth. ให้เปิด /api/drive/oauth/start/ "
            "ผ่าน URL ของ Frontend หลัง Login"
        )

    try:
        credentials = Credentials.from_authorized_user_file(
            str(token_path), scopes=[DRIVE_SCOPE]
        )
    except Exception as exc:
        raise DriveImageConfigError(f"อ่าน Google OAuth token ไม่สำเร็จ: {exc}") from exc

    if credentials.expired:
        if not credentials.refresh_token:
            raise DriveImageConfigError(
                "OAuth token หมดอายุและไม่มี refresh token กรุณาเชื่อม Google Drive ใหม่"
            )
        try:
            credentials.refresh(Request())
            save_oauth_token_json(credentials.to_json())
        except Exception as exc:
            raise DriveImageConfigError(
                f"ต่ออายุ Google OAuth token ไม่สำเร็จ: {exc} กรุณาเชื่อมใหม่"
            ) from exc

    if not credentials.valid:
        raise DriveImageConfigError("Google OAuth token ไม่พร้อมใช้งาน กรุณาเชื่อมใหม่")

    return credentials


@lru_cache(maxsize=1)
def drive_service():
    try:
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise DriveImageConfigError(
            "ยังไม่ได้ติดตั้ง google-api-python-client"
        ) from exc

    credentials = _load_user_credentials()
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def _escape_q(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


def _find_child(parent_id: str, name: str, *, folder: bool) -> Optional[dict]:
    mime_clause = (
        f" and mimeType = '{DRIVE_FOLDER_MIME}'"
        if folder
        else f" and mimeType != '{DRIVE_FOLDER_MIME}'"
    )
    q = (
        f"'{_escape_q(parent_id)}' in parents and "
        f"name = '{_escape_q(name)}' and trashed = false{mime_clause}"
    )
    response = (
        drive_service()
        .files()
        .list(
            q=q,
            fields="files(id,name,mimeType,size,modifiedTime)",
            pageSize=20,
            spaces="drive",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    rows = response.get("files", [])
    return rows[0] if rows else None


def resolve_drive_file(value: str) -> Tuple[str, str, str]:
    """Resolve a DATA1_Images/... path to (file_id, mime_type, name)."""
    normalized = normalize_drive_relative_path(value)
    if not normalized:
        raise DriveImageNotFound("รูปแบบ Drive path ไม่ถูกต้อง")

    cache_key = "partsflow:drive-image:" + normalized.lower()
    cached = cache.get(cache_key)
    if cached:
        return tuple(cached)

    relative_parts = normalized.split("/")[1:]
    parent_id = root_folder_id()

    for folder_name in relative_parts[:-1]:
        row = _find_child(parent_id, folder_name, folder=True)
        if not row:
            raise DriveImageNotFound(f"ไม่พบโฟลเดอร์ย่อยใน Drive: {folder_name}")
        parent_id = row["id"]

    filename = relative_parts[-1]
    row = _find_child(parent_id, filename, folder=False)
    if not row:
        raise DriveImageNotFound(f"ไม่พบไฟล์ใน Google Drive: {normalized}")

    result = (
        row["id"],
        row.get("mimeType") or "application/octet-stream",
        row.get("name") or filename,
    )
    cache.set(cache_key, result, timeout=60 * 60 * 12)
    return result


def download_drive_file(file_id: str) -> bytes:
    try:
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError as exc:
        raise DriveImageConfigError(
            "ยังไม่ได้ติดตั้ง google-api-python-client"
        ) from exc

    request = drive_service().files().get_media(
        fileId=file_id, supportsAllDrives=True
    )
    output = io.BytesIO()
    downloader = MediaIoBaseDownload(output, request, chunksize=1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return output.getvalue()
