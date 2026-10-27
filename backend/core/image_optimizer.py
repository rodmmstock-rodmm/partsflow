"""Conservative optimization for uploaded product photos.

Keeps the original format and transparency, preserves aspect ratio, and avoids
rewriting an image when the optimized payload would be larger.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError


MAX_IMAGE_EDGE = 1600
JPEG_QUALITY = 82
WEBP_QUALITY = 82


def optimize_part_image(payload: bytes, content_type: str) -> tuple[bytes, str]:
    """Return (optimized bytes, content type); animated GIFs remain untouched."""
    normalized_type = str(content_type or "").lower().split(";", 1)[0].strip()
    if normalized_type == "image/jpg":
        normalized_type = "image/jpeg"
    if normalized_type == "image/gif":
        return payload, normalized_type

    format_by_type = {
        "image/jpeg": "JPEG",
        "image/jpg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
    }
    image_format = format_by_type.get(normalized_type)
    if not image_format:
        raise ValueError("รองรับเฉพาะ JPG, PNG, WEBP และ GIF")

    try:
        with Image.open(BytesIO(payload)) as source:
            source.load()
            image = ImageOps.exif_transpose(source)
            if image.width > MAX_IMAGE_EDGE or image.height > MAX_IMAGE_EDGE:
                image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)

            output = BytesIO()
            if image_format == "JPEG":
                if image.mode not in ("RGB", "L"):
                    background = Image.new("RGB", image.size, "white")
                    if "A" in image.getbands():
                        background.paste(image, mask=image.getchannel("A"))
                    else:
                        background.paste(image.convert("RGB"))
                    image = background
                image.save(
                    output, format="JPEG", quality=JPEG_QUALITY,
                    optimize=True, progressive=True, exif=b"",
                )
            elif image_format == "WEBP":
                image.save(output, format="WEBP", quality=WEBP_QUALITY, method=6)
            else:
                image.save(output, format="PNG", optimize=True)

            optimized = output.getvalue()
            return (optimized, normalized_type) if len(optimized) < len(payload) else (payload, normalized_type)
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("ไฟล์รูปภาพไม่ถูกต้องหรืออ่านไม่ได้") from exc
