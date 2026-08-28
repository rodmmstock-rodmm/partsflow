"""Google Drive image resolver for PartsFlow.

Supports Part.image_path values such as:
    DATA1_Images/G3D00001.PIC.113206.jpg

The backend reads the image from Google Drive using a read-only service account,
so the Drive folder does not need to be public.
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
    """Return normalized DATA1_Images/... path, or an empty string if not relative."""
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


def _credentials_info():
    inline = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "").strip()
    if inline:
        try:
            return "info", json.loads(inline)
        except json.JSONDecodeError as exc:
            raise DriveImageConfigError(
                "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ไม่ใช่ JSON ที่ถูกต้อง"
            ) from exc

    configured = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", "").strip()
    path = Path(configured).expanduser() if configured else _backend_dir() / "google-service-account.json"
    if not path.is_absolute():
        path = (_backend_dir() / path).resolve()
    if not path.exists():
        raise DriveImageConfigError(
            "ไม่พบ Google Drive service account JSON. "
            "วางไฟล์ไว้ที่ backend/google-service-account.json หรือกำหนด "
            "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE"
        )
    return "file", str(path)


def root_folder_id() -> str:
    value = os.getenv("GOOGLE_DRIVE_IMAGE_FOLDER_ID", "").strip()
    if not value:
        raise DriveImageConfigError(
            "ยังไม่ได้กำหนด GOOGLE_DRIVE_IMAGE_FOLDER_ID สำหรับโฟลเดอร์ DATA1_Images"
        )
    return value


@lru_cache(maxsize=1)
def drive_service():
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise DriveImageConfigError(
            "ยังไม่ได้ติดตั้ง google-api-python-client/google-auth"
        ) from exc

    kind, source = _credentials_info()
    if kind == "info":
        credentials = service_account.Credentials.from_service_account_info(
            source, scopes=[DRIVE_SCOPE]
        )
    else:
        credentials = service_account.Credentials.from_service_account_file(
            source, scopes=[DRIVE_SCOPE]
        )
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

    result = (row["id"], row.get("mimeType") or "application/octet-stream", row.get("name") or filename)
    cache.set(cache_key, result, timeout=60 * 60 * 12)
    return result


def download_drive_file(file_id: str) -> bytes:
    try:
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError as exc:
        raise DriveImageConfigError(
            "ยังไม่ได้ติดตั้ง google-api-python-client"
        ) from exc

    request = drive_service().files().get_media(fileId=file_id, supportsAllDrives=True)
    output = io.BytesIO()
    downloader = MediaIoBaseDownload(output, request, chunksize=1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return output.getvalue()
