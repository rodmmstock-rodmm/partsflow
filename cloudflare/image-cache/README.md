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

## Deployment (manual, after account-plan verification)

1. Confirm the Cloudflare account is on Workers Free, not Workers Paid.
2. Add `SUPABASE_URL` as a Worker variable in the Cloudflare dashboard or with
   Wrangler. The bucket name is already set to `parts-images`.
3. From this directory, run `npx wrangler deploy`.
4. Test the deployed `/image/...` endpoint twice. Confirm the first response
   is a cache miss and the second is a cache hit using `CF-Cache-Status`.
5. Do not change PartsFlow's Render environment until the endpoint is verified.

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
