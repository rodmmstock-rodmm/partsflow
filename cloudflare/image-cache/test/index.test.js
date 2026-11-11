import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const HASH = "0123456789abcdefabcd";
const PATH = `/image/drive-source/${HASH}/part%20photo.jpg?v=imgopt1-${HASH}`;
const ENV = {
  SUPABASE_URL: "https://example-project.supabase.co",
  SUPABASE_STORAGE_BUCKET: "parts-images",
};

test("rejects paths outside the approved immutable image layout", async () => {
  const response = await worker.fetch(
    new Request("https://images.example.workers.dev/image/other/abc/photo.jpg?v=anything"),
    ENV,
  );
  assert.equal(response.status, 400);
});

test("rejects a mismatched cache-busting version", async () => {
  const response = await worker.fetch(
    new Request(`https://images.example.workers.dev${PATH.replace(HASH, "aaaaaaaaaaaaaaaaaaaa")}`),
    ENV,
  );
  assert.equal(response.status, 400);
});

test("accepts a bumped optimizer version for an in-place image rewrite", async (t) => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("image-bytes", {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const bumpedPath = PATH.replace("imgopt1-", "imgopt2-");
  const response = await worker.fetch(
    new Request("https://images.example.workers.dev" + bumpedPath),
    ENV,
  );

  assert.equal(response.status, 200);
  assert.equal(called, true);
});

test("rejects methods other than GET and HEAD", async () => {
  const response = await worker.fetch(
    new Request("https://images.example.workers.dev" + PATH, { method: "POST" }),
    ENV,
  );
  assert.equal(response.status, 405);
});

test("fetches only the configured public Supabase bucket and returns cache headers", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  let requestedHeaders;

  globalThis.fetch = async (request) => {
    requestedUrl = new URL(request.url);
    requestedHeaders = request.headers;
    return new Response("image-bytes", {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": "11",
        ETag: '"fixture-etag"',
      },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(
    new Request("https://images.example.workers.dev" + PATH, {
      headers: { Authorization: "Bearer must-not-reach-origin" },
    }),
    ENV,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("ETag"), '"fixture-etag"');
  assert.equal(await response.text(), "image-bytes");
  assert.equal(
    requestedUrl.toString(),
    "https://example-project.supabase.co/storage/v1/object/public/parts-images/drive-source/" + HASH + "/part%20photo.jpg",
  );
  assert.equal(requestedUrl.search, "");
  assert.equal(requestedHeaders.has("authorization"), false);
});

test("does not cache missing images", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(
    new Request("https://images.example.workers.dev" + PATH),
    ENV,
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("does not cache non-image origin responses", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>blocked</html>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(
    new Request("https://images.example.workers.dev" + PATH),
    ENV,
  );

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("returns an empty body for HEAD requests", async (t) => {
  const originalFetch = globalThis.fetch;
  let method;
  globalThis.fetch = async (request) => {
    method = request.method;
    return new Response(null, {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(
    new Request("https://images.example.workers.dev" + PATH, { method: "HEAD" }),
    ENV,
  );

  assert.equal(method, "HEAD");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(await response.text(), "");
});
