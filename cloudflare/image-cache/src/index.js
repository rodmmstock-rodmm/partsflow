const CACHE_CONTROL = "public, max-age=31536000, immutable";
const IMAGE_PATH_PREFIX = "/image/";

function errorResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseImagePath(pathname, version) {
  if (!pathname.startsWith(IMAGE_PATH_PREFIX)) return null;

  let parts;
  try {
    parts = pathname
      .slice(IMAGE_PATH_PREFIX.length)
      .split("/")
      .map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }

  if (parts.length !== 3) return null;
  const [folder, digest, filename] = parts;

  if (folder !== "drive-source") return null;
  if (!/^[a-f0-9]{20}$/i.test(digest)) return null;
  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(filename)
  ) {
    return null;
  }
  if (!/^imgopt[0-9]+-[a-f0-9]{20}$/i.test(version) || !version.endsWith(`-${digest}`)) return null;

  return parts;
}

function buildOriginUrl(env, parts) {
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("SUPABASE_URL must be an HTTPS URL without credentials");
  }
  if (base.pathname !== "/" && base.pathname !== "") {
    throw new Error("SUPABASE_URL must be the project origin URL");
  }

  const bucket = String(env.SUPABASE_STORAGE_BUCKET || "parts-images").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(bucket)) {
    throw new Error("Invalid Supabase Storage bucket name");
  }

  const objectPath = parts.map((part) => encodeURIComponent(part)).join("/");
  base.pathname = `/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
  base.search = "";
  base.hash = "";
  return base;
}

function imageResponse(originResponse, requestMethod) {
  const contentType = originResponse.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return errorResponse("Origin did not return an image", 502);
  }

  const headers = new Headers({
    "Cache-Control": originResponse.status === 200 && requestMethod === "GET"
      ? CACHE_CONTROL
      : "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });

  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
  ]) {
    const value = originResponse.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(requestMethod === "HEAD" ? null : originResponse.body, {
    status: originResponse.status,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse("Method not allowed", 405);
    }

    const parts = parseImagePath(url.pathname, url.searchParams.get("v") || "");
    if (!parts) return errorResponse("Invalid image path or version", 400);

    if (!env.SUPABASE_URL) {
      return errorResponse("Image origin is not configured", 500);
    }

    let originUrl;
    try {
      originUrl = buildOriginUrl(env, parts);
    } catch {
      return errorResponse("Image origin configuration is invalid", 500);
    }

    const headers = new Headers();
    if (request.headers.has("range")) {
      headers.set("Range", request.headers.get("range"));
    }

    let originResponse;
    try {
      originResponse = await fetch(
        new Request(originUrl.toString(), {
          method: request.method,
          headers,
          redirect: "manual",
        }),
      );
    } catch (error) {
      // Keep the browser response generic, but preserve a bounded diagnostic in
      // Workers Runtime Logs so origin connectivity failures can be identified.
      console.error("[image-cache] origin fetch failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: String(error?.message ?? error).slice(0, 300),
        originHost: originUrl.hostname,
        path: url.pathname,
        cfRay: request.headers.get("cf-ray") || undefined,
      });
      return errorResponse("Unable to retrieve image from origin", 502);
    }

    if (originResponse.status !== 200 && originResponse.status !== 206) {
      return errorResponse(
        originResponse.status === 404 ? "Image not found" : "Image origin error",
        originResponse.status === 404 ? 404 : 502,
      );
    }

    return imageResponse(originResponse, request.method);
  },
};
