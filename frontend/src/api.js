import { designLabDownload, designLabRequest, designLabUpload } from "./designLabMock";

// PartsFlow Design Lab is intentionally isolated from every real backend.
// This branch never calls Render, Railway, Supabase, or the Production database.
export const DESIGN_LAB = true;

const TOKEN_KEY = "partsflow_design_lab_auth_token";
const apiCache = new Map();
const inFlightGets = new Map();
const DEFAULT_GET_TTL = 5 * 1000;

function normalizePath(path) {
  return String(path || "");
}

function getCacheTtl(path) {
  const p = normalizePath(path).toLowerCase();
  if (p.includes("/history") || p.includes("/orders") || p.includes("/order")) return 2 * 1000;
  return DEFAULT_GET_TTL;
}

function canCacheGet(path) {
  const p = normalizePath(path).toLowerCase();
  return !p.includes("/auth/");
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
    // Ignore storage errors in prototype mode.
  }
}

export function clearAuthToken() {
  setAuthToken("");
  clearApiCache();
}

async function apiRequest(path, options = {}) {
  // Critical safety boundary: Design Lab requests terminate in the local mock
  // adapter and never reach fetch().
  return designLabRequest(path, options);
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
  const data = await designLabUpload(path, formData);
  invalidateApiCache();
  return data;
}

export async function apiDownload(path, fallbackName = "design-lab-download.txt") {
  return designLabDownload(fallbackName);
}
