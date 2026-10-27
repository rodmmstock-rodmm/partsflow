# PartsFlow: Safe plan to reduce Supabase part-image storage

Status: planning and local-tool preparation only. No production data was changed, and no image was uploaded, overwritten, or deleted.

## Goal

Reduce the size of images served by the existing Supabase Storage bucket while preserving the current PartsFlow application flow and keeping full-resolution originals in Google Drive.

## Code inspection (main at commit 988bf473aa6bd8d40b761709d1018a084a991203)

- `backend/core/management/commands/sync_part_images_to_supabase.py` syncs Google Drive images to Supabase. It has a dry-run mode by default; `--apply` uploads. `--force` allows re-uploading existing objects and must not be used for routine runs.
- `backend/core/supabase_storage.py` uploads bytes to the configured bucket (default `parts-images`) and uses deterministic object paths derived from `Part.image_path`. Existing `Part.image_path` values can remain unchanged if the same object paths are replaced with compressed content.
- `backend/core/web_api.py:image_payload` serves Supabase public URLs when Storage is enabled and keeps the existing `/api/parts/<id>/image/` Google Drive fallback URL.
- The current upload helper sends the supplied bytes unchanged; it does not resize or recompress images before upload.
- The sync command sets Content-Type from Google Drive MIME type, so the compression implementation must set the correct output MIME type and file extension/object path consistently. Simply converting JPEG/PNG bytes to WebP at the same path is unsafe because the extension and metadata may no longer match.

## Existing read-only inventory snapshot

The prior read-only Storage metadata query found 1,352 objects in bucket `parts-images`, about 910.76 MB in total: 852 JPEG (~664.69 MB), 426 PNG (~240.29 MB), and 74 WebP (~5.77 MB). The snapshot flagged 163 files at least 2 MB and 8 files over 5 MB. This is metadata-based inventory, not a compression test; exact savings cannot be estimated reliably until actual image bytes are processed. Similar filenames are not confirmed content duplicates without checksum comparison.

## Local dry-run utility

A no-network, no-Supabase-write estimator is included at `scripts/estimate_part_image_compression.py`. It scans a local folder containing a read-only copy of images, writes a CSV report, and never changes source files. It uses same-format output (JPEG→JPEG, PNG→PNG, WebP→WebP); PNG optimization is lossless. JPEG/WebP quality defaults to 88. This first utility intentionally does not resize images or change formats, to reduce compatibility risk.

Example from a trusted local copy of the images:

```bash
python -m pip install Pillow
python scripts/estimate_part_image_compression.py ./parts-images-copy --report ./reports/image-compression-dry-run.csv
```

Optional: save only smaller candidate files in a separate directory for visual review. This still does not upload anything or overwrite the source:

```bash
python scripts/estimate_part_image_compression.py ./parts-images-copy --report ./reports/image-compression-dry-run.csv --write-candidates ./parts-images-candidates
```

The CSV is generated on the machine where the command runs. A real image-by-image dry-run report has not yet been generated because the actual object bytes have not been exported to a local working folder. The existing 910.76 MB inventory alone cannot tell us the true savings.

## Proposed implementation

### Phase 0 — read-only inventory and backup (no production writes)

1. Export a CSV inventory of all `parts-images` objects: object path, byte size, MIME type, created/updated timestamp, and HTTP availability.
2. Export the current `Part.id`, SKU, `image_path`, and calculated Supabase object path mapping. Do not export secrets or tokens.
3. Verify the Google Drive source exists for every path and record the Drive file ID, MIME type, size and modified time where available.
4. Save reports to a dated, access-controlled location and verify the files can be opened. Keep Google Drive originals unchanged.
5. Record baseline Storage usage and counts. Do not treat object-name duplicates as content duplicates without comparing hashes.

### Phase 1 — dry-run compression report

1. Download/copy images to a controlled local folder without changing Drive or Storage originals.
2. Run the local estimator above and review the CSV for errors, files that become larger, and estimated savings.
3. Visually compare representative candidates against originals at full resolution, especially product labels, small fittings, edges, and transparency.
4. The first pass is same-format only and does not resize. Any resize or lossy PNG/WebP conversion must be a separate, reviewed proposal.
5. Do not upload anything in this phase.

### Phase 2 — compatibility design

Prefer a conservative first rollout that keeps existing URLs and object paths stable: recompress into the existing format and extension (JPEG→JPEG, PNG→PNG), with correct content-type metadata. Avoid changing PNG to WebP in place.

If WebP is chosen later, use a new versioned path/extension and an explicit URL mapping or versioned image field. Do not change the existing path-to-object algorithm without a separate compatibility migration and rollback plan.

### Phase 3 — controlled pilot (requires separate explicit approval)

1. Choose 5–10 low-risk SKUs, confirm their Google Drive originals and export a mapping report.
2. Upload compressed bytes to the existing object path only after verifying the bucket's overwrite behavior and object metadata. The current upload helper defaults to `upsert=False`; an approved implementation must handle replacement explicitly and safely.
3. Before replacement, preserve the original Storage object bytes in a temporary private backup location or export them to a controlled backup, and verify its checksum. Keep Drive originals untouched.
4. Verify HTTP status, Content-Type, Content-Length, image decode, dimensions, and browser display on desktop/mobile. Test thumbnails, detail modal/lightbox, stock cards, and fallback to `/api/parts/<id>/image/`.
5. Compare before/after screenshots for representative product images and measure byte savings.
6. Do not expand the pilot unless all checks pass and rollback has been rehearsed.

### Phase 4 — batch rollout (requires separate explicit approval)

- Process in small batches with rate limits and retries; log each object and checksum.
- Use an idempotent manifest and skip objects already processed with the expected output hash.
- Preserve the current object path and `Part.image_path` values for the first release.
- After each batch, verify sample and aggregate URL health, error rates, content types and storage totals.
- Never delete or purge old objects automatically. This plan does not authorize deletion.

## Backup and rollback

- Google Drive is the authoritative full-resolution source and must remain unchanged.
- Keep a pre-change object inventory and checksums; back up the exact current Supabase object bytes before any overwrite.
- Maintain a manifest mapping object path → original hash/size/MIME type → compressed hash/size/MIME type.
- If a regression occurs, stop the batch immediately and restore the backed-up original bytes and MIME type to the same object paths. Confirm URLs, content type and browser rendering afterward.
- Do not modify database schema or `Part.image_path` for the initial same-format approach.
- Never commit credentials, OAuth token JSON, service-role/secret keys, private image exports, or customer data to Git.

## Acceptance checks

- All existing image URLs return HTTP 200 (or known expected behavior) before and after.
- Correct Content-Type and decodable image bytes for every processed object.
- No changes to inventory, transactions, SKUs, or `Part.image_path` values.
- Product image details remain visually faithful; no unexpected crop, rotation, transparency loss, or text/detail changes.
- Desktop/mobile lists, detail modal, zoom/lightbox and Drive fallback work.
- Compression savings are measured from actual byte counts.
- Rollback test passes on the pilot before batch rollout.

## Explicit safety boundary

This PR adds documentation and a local-only estimator. The estimator makes no network calls and cannot access Supabase or Google Drive. No production sync command was run; no `--apply` or `--force` was used; no Storage objects were uploaded, rewritten, or deleted; no Supabase rows were edited; and no production environment variables were changed. A separate explicit approval is required before any production write or live pilot.
