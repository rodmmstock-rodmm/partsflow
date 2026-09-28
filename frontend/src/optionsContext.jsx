import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiGet, onApiWrite } from "./api";
import { useAuth } from "./auth";

const OptionsContext = createContext(null);

const EMPTY_OPTIONS = {
  employees: [],
  machines: [],
  vendors: [],
  parts: [],
  locations: [],
  units: [],
  jobs: [],
  warehouses: [],
};

// /options/ returns every active Employee, Machine, Vendor (with contacts),
// Location, and Unit in the system. Before this provider, every page (Dashboard, History, Orders,
// Spare Sets, and most mobile pages) fetched this independently on every
// mount, so navigating between a handful of pages could re-download the
// entire master-data set several times in a few minutes. Fetching it once
// per login session here and sharing it through context cuts that down to
// a single load, which is the single biggest lever we have on Supabase
// egress for this app.
// Writes to these resources change what /options/ returns.
const MASTER_DATA_PREFIXES = ["/suppliers", "/machines", "/employees"];

const normalizeWarehouse = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  return ["MM-11", "PHASE11", "PHASE 11"].includes(raw) ? "MM-11" : "MM-4";
};

// Decide whether a successful write means the shared lists are now stale.
function writeAffectsOptions(change, options) {
  const path = String(change.path || "").split("?")[0].toLowerCase();
  if (MASTER_DATA_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }
  if (path === "/parts" || path.startsWith("/parts/")) {
    // Saving a part can create a brand-new Location, or change the warehouse
    // of an existing one. Only then do the location lists need a reload.
    const body = change.body || {};
    const code = String(body.location_code || "").trim().toLowerCase();
    if (!code) return false;
    const known = (options.locations || []).find(
      (loc) => String(loc.code || "").toLowerCase() === code
    );
    if (!known) return true;
    return (
      Boolean(body.warehouse) &&
      normalizeWarehouse(known.warehouse) !== normalizeWarehouse(body.warehouse)
    );
  }
  return false;
}

export function OptionsProvider({ children }) {
  const { authenticated } = useAuth();
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchedRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const refreshingRef = useRef(false);
  const queuedRef = useRef(false);

  // Background reload after someone adds/edits master data. Deliberately does
  // not touch `loading`: open forms and disabled buttons must not flicker, and
  // on failure the previous lists simply stay in place.
  async function refresh() {
    if (refreshingRef.current) {
      queuedRef.current = true; // coalesce bursts of writes into one more fetch
      return;
    }
    refreshingRef.current = true;
    try {
      do {
        queuedRef.current = false;
        const data = await apiGet("/options/", { forceRefresh: true });
        if (data) setOptions(data);
      } while (queuedRef.current);
    } catch {
      // keep showing the last good lists
    } finally {
      refreshingRef.current = false;
    }
  }

  async function load(force = false) {
    if (fetchedRef.current && !force) return;
    fetchedRef.current = true;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/options/");
      setOptions(data || EMPTY_OPTIONS);
    } catch (err) {
      setError(err.message);
      fetchedRef.current = false; // allow retry on next consumer mount
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authenticated) {
      load();
    } else {
      // Logged out: drop cached master data and reset so the next login
      // (possibly a different employee/session) fetches fresh.
      fetchedRef.current = false;
      setOptions(EMPTY_OPTIONS);
      setLoading(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return undefined;
    return onApiWrite((change) => {
      if (writeAffectsOptions(change, optionsRef.current)) refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const value = useMemo(
    () => ({
      options,
      loading,
      error,
      // Vendor / Machine / Employee (and Location-creating Part) writes now
      // trigger this automatically; kept for callers that want to force it.
      refreshOptions: () => refresh(),
    }),
    [options, loading, error]
  );

  return (
    <OptionsContext.Provider value={value}>
      {children}
    </OptionsContext.Provider>
  );
}

export const useOptions = () => useContext(OptionsContext);
