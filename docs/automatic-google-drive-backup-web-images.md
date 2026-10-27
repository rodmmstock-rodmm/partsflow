# Automatic Google Drive backup for web-uploaded part images

## Proposed behavior

- A web upload is written to Supabase Storage first, preserving the current image-delivery path.
- PartsFlow then copies the original uploaded bytes into `DATA1_Images/WebUploads/<SKU>/<sha256-prefix>.<ext>` in Google Drive.
- The Drive copy is verified by reading its metadata and checking byte size and MD5 checksum.
- The upload never overwrites an existing Drive file with different contents.
- If the Drive backup fails, the image remains available from Supabase and the API response/audit event reports `image_backup.status = pending`.

## Google authorization

The current OAuth scope is read-only. This change requests the Google Drive `drive` scope so the app can create the backup folders and files under the configured `GOOGLE_DRIVE_IMAGE_FOLDER_ID`. This is broader than read-only access. An administrator must review the scope and re-authorize through the existing PartsFlow Drive OAuth flow after deployment. Do not copy OAuth tokens or client secrets into source control.

## Limits in this PR

A failed backup is reported as pending but is not yet queued for automatic retry. A future retry worker/management command should retry pending audit events idempotently. Do not treat a pending status as a verified backup.

## Validation before merge

- Run backend tests and formatting/lint checks.
- In a non-production/test environment, authorize Drive with the new scope and upload a test image.
- Verify the Supabase image still displays, the Drive file exists in the expected folder, and the API reports `verified: true`.
- Test an OAuth permission failure and confirm the image still displays with a pending backup status.
- Only enable on production after the PR is reviewed and approved.
