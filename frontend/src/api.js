// Development must always use the same-origin Vite proxy.
// This deliberately ignores a stale VITE_API_BASE_URL exported in the terminal,
// so Codespaces never jumps directly to the forwarded Django :8000 origin.
const CONFIGURED_API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const API_BASE = import.meta.env.DEV ? "/api" : CONFIGURED_API_BASE;

const TOKEN_KEY = "partsflow_auth_token";

// -----------------------------------------------------------------------------
// Lightweight client-side API cache
// -----------------------------------------------------------------------------
// Goal:
// - Prevent the same GET endpoint from being fetched again every time the user
//   moves between React pages.
// - Deduplicate simultaneous requests to the same URL.
// - Automatically invalidate cached GET data after POST/PATCH/PUT/DELETE.
// - Keep authentication endpoints uncached.
//
// This is an in-memory cache, so it survives normal SPA navigation but clears
// automatically on a full browser reload.
const apiCache = new Map();
const inFlightGets = new Map();

const DEFAULT_GET_TTL = 60 * 1000; // 60 seconds

function normalizePath(path) {
  return String(path || "");
}

function getCacheTtl(path) {
  const p = normalizePath(path).toLowerCase();

  // Reference/master data changes less frequently.
  if (
    p.includes("/suppliers") ||
    p.includes("/vendor") ||
    p.includes("/machines") ||
    p.includes("/employees") ||
    p.includes("/roles") ||
    p.includes("/role")
  ) {
    return 5 * 60 * 1000; // 5 minutes
  }

  // Operational pages should refresh more often.
  if (
    p.includes("/history") ||
    p.includes("/orders") ||
    p.includes("/order")
  ) {
    return 30 * 1000; // 30 seconds
  }

  // Dashboard / parts / inventory / safety stock.
  return DEFAULT_GET_TTL;
}

function canCacheGet(path) {
  const p = normalizePath(path).toLowerCase();

  // Never cache authentication state or OAuth flow endpoints.
  if (p.includes("/auth/") || p.includes("/oauth/")) {
    return false;
  }

  return true;
}

function readCache(path) {
  const entry = apiCache.get(path);

  if (!entry) {
    return undefined;
  }

  if (Date.now() >= entry.expiresAt) {
    apiCache.delete(path);
    return undefined;
  }

  return entry.data;
}

function writeCache(path, data) {
  apiCache.set(path, {
    data,
    expiresAt: Date.now() + getCacheTtl(path),
  });
}

export function invalidateApiCache(prefixes = null) {
  // No prefixes = safely clear all cached GET responses.
  if (!prefixes) {
    apiCache.clear();
    return;
  }

  const list = Array.isArray(prefixes) ? prefixes : [prefixes];

  for (const key of apiCache.keys()) {
    if (list.some((prefix) => key.startsWith(prefix))) {
      apiCache.delete(key);
    }
  }
}

export function clearApiCache() {
  apiCache.clear();
  inFlightGets.clear();
}

// -----------------------------------------------------------------------------
// Authentication token
// -----------------------------------------------------------------------------
export function getAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors.
  }
}

export function clearAuthToken() {
  setAuthToken("");
  clearApiCache();
}

// -----------------------------------------------------------------------------
// Base request
// -----------------------------------------------------------------------------
async function apiRequest(path, options = {}) {
  const token = getAuthToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.error ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

// -----------------------------------------------------------------------------
// GET with cache + request deduplication
// -----------------------------------------------------------------------------
export async function apiGet(path, options = {}) {
  const useCache =
    options.cache !== false &&
    canCacheGet(path);

  if (useCache && !options.forceRefresh) {
    const cached = readCache(path);

    if (cached !== undefined) {
      return cached;
    }

    // If the same GET is already running, reuse that Promise instead of
    // sending another network request.
    if (inFlightGets.has(path)) {
      return inFlightGets.get(path);
    }
  }

  const requestPromise = apiRequest(path)
    .then((data) => {
      if (useCache) {
        writeCache(path, data);
      }
      return data;
    })
    .finally(() => {
      inFlightGets.delete(path);
    });

  if (useCache) {
    inFlightGets.set(path, requestPromise);
  }

  return requestPromise;
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------
// For safety, mutations invalidate cached GET data. This ensures stock,
// history, order, supplier, machine, etc. do not show stale values after edit.
async function mutationRequest(path, method, body) {
  const data = await apiRequest(path, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  });

  invalidateApiCache();
  return data;
}

export const apiPost = (path, body = {}) =>
  mutationRequest(path, "POST", body);

export const apiPut = (path, body = {}) =>
  mutationRequest(path, "PUT", body);

export const apiPatch = (path, body = {}) =>
  mutationRequest(path, "PATCH", body);

export const apiDelete = (path) =>
  mutationRequest(path, "DELETE");


// -----------------------------------------------------------------------------
// Multipart upload
// -----------------------------------------------------------------------------
// Do not set Content-Type manually. The browser must add the multipart boundary.
export async function apiUpload(path, formData) {
  const token = getAuthToken();

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    headers,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.error ||
      `HTTP ${response.status}`
    );
  }

  invalidateApiCache();
  return data;
}

export { apiRequest };
