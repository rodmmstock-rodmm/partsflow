// Development uses the same-origin Vite proxy. Production must always use
// the Railway service that owns the PartsFlow production database.
const PRODUCTION_API_BASE = "https://partsflow-production.up.railway.app/api";
const API_BASE = import.meta.env.DEV ? "/api" : PRODUCTION_API_BASE;

const TOKEN_KEY = "partsflow_auth_token";

// -----------------------------------------------------------------------------
// Lightweight client-side API cache
// -----------------------------------------------------------------------------
const apiCache = new Map();
const inFlightGets = new Map();

const DEFAULT_GET_TTL = 60 * 1000;

function normalizePath(path) {
  return String(path || "");
}

function getCacheTtl(path) {
  const p = normalizePath(path).toLowerCase();
  if (
    p.includes("/suppliers") ||
    p.includes("/vendor") ||
    p.includes("/machines") ||
    p.includes("/employees") ||
    p.includes("/roles") ||
    p.includes("/role")
  ) return 5 * 60 * 1000;

  if (p.includes("/history") || p.includes("/orders") || p.includes("/order")) {
    return 30 * 1000;
  }
  return DEFAULT_GET_TTL;
}

function canCacheGet(path) {
  const p = normalizePath(path).toLowerCase();
  if (p.includes("/auth/") || p.includes("/oauth/")) return false;
  return true;
}

function readCache(path) {
  const entry = apiCache.get(path);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    apiCache.delete(path);
    return undefined;
  }
  return entry.data;
}

function writeCache(path, data) {
  apiCache.set(path, { data, expiresAt: Date.now() + getCacheTtl(path) });
}

export function invalidateApiCache(prefixes = null) {
  if (!prefixes) {
    apiCache.clear();
    return;
  }
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  for (const key of apiCache.keys()) {
    if (list.some((prefix) => key.startsWith(prefix))) apiCache.delete(key);
  }
}

export function clearApiCache() {
  apiCache.clear();
  inFlightGets.clear();
}

export function getAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function clearAuthToken() {
  setAuthToken("");
  clearApiCache();
}

async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Never let the browser/CDN reuse an old operational API response. PartsFlow
  // already owns its short-lived in-memory GET cache above, so HTTP caching here
  // only creates a second stale-data layer after production imports/deploys.
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    cache: "no-store",
    headers,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
  }
  return data;
}

export async function apiGet(path, options = {}) {
  const useCache = options.cache !== false && canCacheGet(path);
  if (useCache && !options.forceRefresh) {
    const cached = readCache(path);
    if (cached !== undefined) return cached;
    if (inFlightGets.has(path)) return inFlightGets.get(path);
  }

  const requestPromise = apiRequest(path)
    .then((data) => {
      if (useCache) writeCache(path, data);
      return data;
    })
    .finally(() => {
      inFlightGets.delete(path);
    });

  if (useCache) inFlightGets.set(path, requestPromise);
  return requestPromise;
}

async function mutationRequest(path, method, body) {
  const data = await apiRequest(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  invalidateApiCache();
  return data;
}

export const apiPost = (path, body = {}) => mutationRequest(path, "POST", body);
export const apiPut = (path, body = {}) => mutationRequest(path, "PUT", body);
export const apiPatch = (path, body = {}) => mutationRequest(path, "PATCH", body);
export const apiDelete = (path) => mutationRequest(path, "DELETE");

export async function apiUpload(path, formData) {
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    headers,
    cache: "no-store",
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
  }
  invalidateApiCache();
  return data;
}
