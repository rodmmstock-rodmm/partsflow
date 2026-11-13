# PartsFlow image cache (Cloudflare Workers)

This Worker is an optional, reversible image-delivery layer. Supabase Storage
remains the source of image files; Google Drive remains the original/backup.
No image is copied, moved, deleted, or rewritten by this Worker.

## How it works

1. PartsFlow returns a versioned URL under `/image/drive-source/<sha>/<filename>`.
2. Cloudflare Workers Cache checks its lower and upper (tiered) caches before
   invoking the Worker.
3. On a cache miss, the Worker fetches that exact object from the configured
   public Supabase Storage bucket.
4. Successful image responses receive a one-year immutable cache policy. The
   URL includes a version marker derived from the source path, so a changed
   source path receives a different cache key.
5. 404s, origin errors, invalid paths, and non-image responses are never cached.

When an existing Storage object is rewritten in place (rather than receiving a
new object path), bump the backend URL marker from `imgopt1` to `imgopt2` in
`public_url_for_object` and `public_image_url`. The Worker accepts numbered
`imgoptN` markers so the new URL bypasses the old cached bytes.

The Worker does not accept arbitrary origin URLs, does not forward browser
Authorization/Cookie headers, and only serves the expected
`drive-source/<20-hex>/<filename>` object layout.

## Free-plan cost guardrails

- Use a Cloudflare **Workers Free** account/usage plan only. Do not enable or
  select Workers Paid.
- Workers Free currently includes 100,000 inbound requests per day. Requests
  served from Workers Cache still count toward this request allowance; cache
  hits avoid Worker CPU execution, not the request count.
- If the Free daily request allowance is exceeded, the Free plan limit applies.
  Do not upgrade to Paid to resolve a 429.
- Cloudflare documents no separate bandwidth/egress charge for Workers. The
  Worker-to-origin fetch is a subrequest and is not billed as an inbound Worker
  request.
- Verify the Cloudflare account's plan and billing settings before deployment.
  This repository change alone does not activate Cloudflare or create charges.

## Local test

From this directory:

```sh
npm install
npm test
npm run dev
```

Set local variables in an untracked `.dev.vars` file:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_STORAGE_BUCKET=parts-images
```

## Deploy the Worker (manual and gated)

The repository has a separate manual GitHub Actions workflow:
`.github/workflows/deploy-cloudflare-image-cache.yml`. It is deliberately
not triggered by normal pushes or merges, so merging code cannot deploy or
change the live PartsFlow image path automatically.

Before running it:

1. Verify in Cloudflare that the account is on **Workers Free**, not Workers
   Paid. Do not upgrade or enable a paid plan to proceed.
2. In GitHub repository Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN`: a Cloudflare API token scoped to this account with
     permission to edit Workers Scripts and read account settings.
   - `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
   Secret values must never be committed or pasted into chat.
3. Open Actions → **Deploy Cloudflare image cache Worker** → Run workflow.
   The required confirmation checkbox explicitly confirms the Workers Free
   plan and authorizes this optional Worker deployment.
4. After the first deployment creates `partsflow-image-cache`, open that
   Worker in Cloudflare and add `SUPABASE_URL` as a Worker variable using the
   Supabase project origin URL. The bucket variable is already configured as
   `parts-images` in `wrangler.jsonc`.
5. Test one known image URL twice. Confirm that the response is an image and
   inspect `CF-Cache-Status` for the miss/hit behavior.
6. Do not change PartsFlow's Render environment until the endpoint is verified.

The workflow only deploys the standalone image Worker. It does not modify the
existing `partsflow` Static Assets deployment, Supabase, Render, database,
Storage objects, billing, or the production image URL setting.

## Enable / rollback in PartsFlow

After the Worker is deployed and verified, set the optional Render backend
environment variable:

```dotenv
SUPABASE_IMAGE_PROXY_URL=https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
```

The backend will then return Worker URLs for Stock, Tooling, and Gauge images.
Leave this variable unset to immediately restore the existing direct Supabase
image URLs. Database, Storage uploads, image compression, and Google Drive
backup behavior are unchanged.

Do not enable this variable before the Worker endpoint has passed the image
and cache checks. A Preview-only rollout should be used first.
