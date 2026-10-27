"""Verified Google Drive backup for images uploaded through PartsFlow."""
import hashlib
import io

from .drive_images import (
    DRIVE_FOLDER_MIME,
    DriveImageConfigError,
    _find_child,
    drive_service,
    root_folder_id,
)


def _get_or_create_folder(parent_id: str, name: str) -> str:
    found = _find_child(parent_id, name, folder=True)
    if found:
        return found["id"]
    try:
        result = drive_service().files().create(
            body={
                "name": name,
                "mimeType": DRIVE_FOLDER_MIME,
                "parents": [parent_id],
            },
            fields="id,name,mimeType",
            supportsAllDrives=True,
        ).execute()
    except Exception as exc:
        raise DriveImageConfigError(
            "สร้างโฟลเดอร์สำรองใน Google Drive ไม่สำเร็จ"
        ) from exc
    if not result.get("id"):
        raise DriveImageConfigError("Google Drive ไม่ส่งรหัสโฟลเดอร์กลับมา")
    return result["id"]


def backup_web_upload(
    *, sku_folder: str, filename: str, payload: bytes, content_type: str
) -> dict:
    """Upload a non-overwriting backup and verify it using size + MD5."""
    try:
        from googleapiclient.http import MediaIoBaseUpload
    except ImportError as exc:
        raise DriveImageConfigError(
            "ยังไม่ได้ติดตั้ง google-api-python-client"
        ) from exc

    parent_id = _get_or_create_folder(root_folder_id(), "WebUploads")
    parent_id = _get_or_create_folder(parent_id, sku_folder)
    expected_md5 = hashlib.md5(payload).hexdigest()

    existing = _find_child(parent_id, filename, folder=False)
    if existing:
        metadata = drive_service().files().get(
            fileId=existing["id"],
            fields="id,name,size,md5Checksum,mimeType",
            supportsAllDrives=True,
        ).execute()
        if (
            str(metadata.get("size", "")) != str(len(payload))
            or str(metadata.get("md5Checksum", "")).lower() != expected_md5
        ):
            raise DriveImageConfigError(
                "Google Drive มีไฟล์ชื่อเดียวกันแต่เนื้อหาไม่ตรงกัน "
                "จึงไม่เขียนทับไฟล์เดิม"
            )
        return {
            "status": "backed_up",
            "file_id": metadata["id"],
            "verified": True,
            "already_exists": True,
        }

    try:
        media = MediaIoBaseUpload(
            io.BytesIO(payload),
            mimetype=content_type or "application/octet-stream",
            resumable=True,
        )
        created = drive_service().files().create(
            body={"name": filename, "parents": [parent_id]},
            media_body=media,
            fields="id,name,size,md5Checksum,mimeType",
            supportsAllDrives=True,
        ).execute()
        verified = drive_service().files().get(
            fileId=created["id"],
            fields="id,name,size,md5Checksum,mimeType",
            supportsAllDrives=True,
        ).execute()
    except Exception as exc:
        raise DriveImageConfigError(
            "อัปโหลดหรืออ่านข้อมูลยืนยันจาก Google Drive ไม่สำเร็จ"
        ) from exc

    if (
        str(verified.get("size", "")) != str(len(payload))
        or str(verified.get("md5Checksum", "")).lower() != expected_md5
    ):
        raise DriveImageConfigError(
            "ไฟล์สำรองใน Google Drive ไม่ผ่านการตรวจสอบ checksum"
        )
    return {
        "status": "backed_up",
        "file_id": verified["id"],
        "verified": True,
        "already_exists": False,
    }
