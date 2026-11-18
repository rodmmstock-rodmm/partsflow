#!/usr/bin/env python3
"""Read-only image compression estimator for PartsFlow.

Default mode only scans local files and writes a CSV report. It never uploads,
overwrites, deletes, or changes Supabase/Google Drive data.
Optional --write-candidates saves separate compressed copies under a new folder.
Requires Pillow: python -m pip install Pillow
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
from pathlib import Path
from PIL import Image, ImageOps

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def encode_candidate(image: Image.Image, suffix: str, quality: int) -> bytes:
    buffer = io.BytesIO()
    suffix = suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        if image.mode not in ("RGB", "L"):
            if "A" in image.getbands():
                background = Image.new("RGB", image.size, "white")
                background.paste(image.convert("RGBA"), mask=image.convert("RGBA").getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
        image.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
    elif suffix == ".webp":
        image.save(buffer, format="WEBP", quality=quality, method=6)
    elif suffix == ".png":
        # Lossless only: PNG is not converted to another format or reduced in color depth.
        image.save(buffer, format="PNG", optimize=True, compress_level=9)
    else:
        raise ValueError(f"Unsupported image extension: {suffix}")
    return buffer.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Folder containing a downloaded/read-only image copy")
    parser.add_argument("--report", type=Path, default=Path("image-compression-dry-run.csv"))
    parser.add_argument("--quality", type=int, default=88, help="JPEG/WebP quality (default: 88)")
    parser.add_argument("--write-candidates", type=Path, default=None,
                        help="Optional separate output folder; never writes into source")
    args = parser.parse_args()

    if not args.source.is_dir():
        parser.error(f"Source folder does not exist: {args.source}")
    if not 1 <= args.quality <= 100:
        parser.error("--quality must be between 1 and 100")
    source = args.source.resolve()
    output = args.write_candidates.resolve() if args.write_candidates else None
    if output and (output == source or source in output.parents or output in source.parents):
        parser.error("Candidate output must be a separate folder, not the source or a parent/child of it")

    rows = []
    for path in sorted(source.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        try:
            original_size = path.stat().st_size
            with Image.open(path) as opened:
                opened.verify()
            with Image.open(path) as opened:
                image = ImageOps.exif_transpose(opened)
                image.load()
                candidate = encode_candidate(image.copy(), path.suffix, args.quality)
            candidate_size = len(candidate)
            savings = original_size - candidate_size
            rows.append({
                "relative_path": path.relative_to(source).as_posix(),
                "format": path.suffix.lower(),
                "width": image.width,
                "height": image.height,
                "original_bytes": original_size,
                "candidate_bytes": candidate_size,
                "estimated_savings_bytes": max(0, savings),
                "estimated_savings_percent": round(max(0, savings) / original_size * 100, 2) if original_size else 0,
                "candidate_larger": candidate_size >= original_size,
                "status": "OK",
            })
            if output and candidate_size < original_size:
                target = output / path.relative_to(source)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(candidate)
        except Exception as exc:
            rows.append({
                "relative_path": path.relative_to(source).as_posix(),
                "format": path.suffix.lower(),
                "width": "",
                "height": "",
                "original_bytes": path.stat().st_size if path.exists() else "",
                "candidate_bytes": "",
                "estimated_savings_bytes": "",
                "estimated_savings_percent": "",
                "candidate_larger": "",
                "status": f"ERROR: {type(exc).__name__}: {exc}",
            })

    args.report.parent.mkdir(parents=True, exist_ok=True)
    fields = ["relative_path", "format", "width", "height", "original_bytes",
              "candidate_bytes", "estimated_savings_bytes", "estimated_savings_percent",
              "candidate_larger", "status"]
    with args.report.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    valid = [row for row in rows if row["status"] == "OK"]
    total_original = sum(int(row["original_bytes"]) for row in valid)
    total_candidate = sum(int(row["candidate_bytes"]) for row in valid)
    estimated = sum(int(row["estimated_savings_bytes"]) for row in valid)
    print(f"Images scanned: {len(rows)} (valid: {len(valid)}, errors: {len(rows) - len(valid)})")
    print(f"Original bytes: {total_original}")
    print(f"Candidate bytes: {total_candidate}")
    print(f"Estimated savings (positive-only): {estimated} bytes")
    print(f"Estimated savings rate: {estimated / total_original * 100:.2f}%" if total_original else "Estimated savings rate: n/a")
    print(f"CSV report: {args.report.resolve()}")
    if output:
        print(f"Separate candidate copies (smaller files only): {output}")
    print("Safety: no network calls; no Supabase/Drive writes; source files are not changed.")
    return 1 if len(rows) - len(valid) else 0


if __name__ == "__main__":
    sys.exit(main())
