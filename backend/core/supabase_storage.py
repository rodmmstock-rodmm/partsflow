"""Supabase Storage helpers for PartsFlow part images.

Google Drive remains the source/backup. Supabase Storage is the delivery/CDN
layer used by the web UI.

The object path is deterministic from Part.image_path, so no database migration
is required and existing Part.image_path values stay unchanged.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import PurePosixPath
from urllib.parse import quote

import requests

from .drive_images import normalize_drive_relative_path


DEFAULT_BUCKET = "parts-images"
DEFAULT_CACHE_SECONDS = 60 * 60 * 24 * 365


class SupabaseStorageConfigError(RuntimeError):
    pass


class SupabaseStorageRequestError(RuntimeError):
    pass


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def supabase_url() -> str:
    return _env("SUPABASE_URL").rstrip("/")


def bucket_name() -> str:
    return _env("SUPABASE_STORAGE_BUCKET", DEFAULT_BUCKET) or DEFAULT_BUCKET


def storage_enabled() -> bool:
    return _truthy(_env("SUPABASE_IMAGE_STORAGE_ENABLED", "false")) and bool(
        supabase_url()
    )


def admin_key() -> str:
    # Prefer the newer Supabase Secret Key. Keep legacy service_role support.
    return _env("SUPABASE_SECRET_KEY") or _env("SUPABASE_SERVICE_ROLE_KEY")


def require_public_config() -> tuple[str, str]:
    base = supabase_url()
    bucket = bucket_name()
    if not base:
        raise SupabaseStorageConfigError(
            "ยังไม่ได้กำหนด SUPABASE_URL ใน backend/.env"
        )
    if not bucket:
        raise SupabaseStorageConfigError(
            "ยังไม่ได้กำหนด SUPABASE_STORAGE_BUCKET ใน backend/.env"
        )
    return base, bucket


def require_admin_config() -> tuple[str, str, str]:
    base, bucket = require_public_config()
    key = admin_key()
    if not key:
        raise SupabaseStorageConfigError(
            "ยังไม่ได้กำหนด SUPABASE_SECRET_KEY "
            "(หรือ legacy SUPABASE_SERVICE_ROLE_KEY) ใน backend/.env"
        )
    return base, bucket, key


def image_path_version(value: str) -> str:
    normalized = normalize_drive_relative_path(value)
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:20]


def storage_object_path(value: str) -> str:
    """Map DATA1_Images/... to an immutable-ish Storage path.

    The path changes whenever Part.image_path changes. Two Parts that reference
    the same Drive source path share one Storage object.
    """
    normalized = normalize_drive_relative_path(value)
    if not normalized:
        return ""

    version = image_path_version(normalized)
    filename = PurePosixPath(normalized).name
    return f"drive-source/{version}/{filename}"


def _quoted_object_path(object_path: str) -> str:
    return quote(str(object_path or "").lstrip("/"), safe="/-_.~")


def public_url_for_object(object_path: str, *, with_version: bool = True) -> str:
    if not object_path:
        return ""

    base, bucket = require_public_config()
    url = (
        f"{base}/storage/v1/object/public/"
        f"{quote(bucket, safe='-_.~')}/{_quoted_object_path(object_path)}"
    )

    if with_version:
        version = PurePosixPath(object_path).parts[-2] if "/" in object_path else ""
        if version:
            url = f"{url}?v={quote(version, safe='-_.~')}"
    return url


def public_image_url(image_path: str) -> str:
    object_path = storage_object_path(image_path)
    if not object_path:
        return ""
    try:
        return public_url_for_object(object_path)
    except SupabaseStorageConfigError:
        return ""


def _admin_headers(key: str, content_type: str | None = None) -> dict:
    # Supabase's API gateway accepts the API key in `apikey`; keeping the
    # Authorization header also preserves legacy service_role compatibility.
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "User-Agent": "PartsFlow-Backend/1.0",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def public_object_status(object_path: str, timeout: int = 12) -> int:
    """Return HTTP status without downloading the full image."""
    url = public_url_for_object(object_path, with_version=False)

    try:
        response = requests.head(
            url,
            allow_redirects=True,
            timeout=timeout,
            headers={"User-Agent": "PartsFlow-Backend/1.0"},
        )
    except requests.RequestException as exc:
        raise SupabaseStorageRequestError(
            f"เชื่อมต่อ Supabase Storage ไม่สำเร็จ: {exc}"
        ) from exc

    # Some proxies/CDNs may reject HEAD. Fall back to a one-byte ranged GET.
    if response.status_code == 405:
        try:
            response = requests.get(
                url,
                headers={
                    "Range": "bytes=0-0",
                    "User-Agent": "PartsFlow-Backend/1.0",
                },
                stream=True,
                timeout=timeout,
            )
        except requests.RequestException as exc:
            raise SupabaseStorageRequestError(
                f"เชื่อมต่อ Supabase Storage ไม่สำเร็จ: {exc}"
            ) from exc

    return response.status_code


def public_object_exists(object_path: str, timeout: int = 12) -> bool:
    status = public_object_status(object_path, timeout=timeout)

    if status in {200, 206}:
        return True
    if status == 404:
        return False
    if status in {401, 403}:
        raise SupabaseStorageConfigError(
            "Bucket ของ Supabase Storage ยังไม่เป็น Public "
            "หรือ URL/สิทธิ์ไม่ถูกต้อง"
        )
    if 500 <= status <= 599:
        raise SupabaseStorageRequestError(
            f"Supabase Storage ตอบกลับ HTTP {status}"
        )

    return False


def upload_object(
    object_path: str,
    payload: bytes,
    *,
    content_type: str = "application/octet-stream",
    upsert: bool = False,
    timeout: int = 90,
) -> dict:
    base, bucket, key = require_admin_config()
    url = (
        f"{base}/storage/v1/object/"
        f"{quote(bucket, safe='-_.~')}/{_quoted_object_path(object_path)}"
    )

    headers = _admin_headers(key, content_type)
    headers["x-upsert"] = "true" if upsert else "false"
    headers["cache-control"] = str(DEFAULT_CACHE_SECONDS)

    try:
        response = requests.post(
            url,
            data=payload,
            headers=headers,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise SupabaseStorageRequestError(
            f"Upload ไป Supabase Storage ไม่สำเร็จ: {exc}"
        ) from exc

    if response.status_code in {200, 201}:
        try:
            return response.json()
        except ValueError:
            return {"status": response.status_code}

    # Existing object is not an error for an idempotent migration.
    if response.status_code in {400, 409} and (
        "exist" in response.text.lower()
        or "duplicate" in response.text.lower()
        or "already" in response.text.lower()
    ):
        return {
            "status": response.status_code,
            "already_exists": True,
        }

    message = response.text.strip()
    if len(message) > 500:
        message = message[:500] + "..."

    raise SupabaseStorageRequestError(
        f"Supabase Storage upload HTTP {response.status_code}: {message}"
    )
