import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiGet } from "./api";
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

// /options/ returns every active Employee, Machine, Vendor, Part (2,000+
// rows, fully serialized with stock/image data), Location, and Unit in the
// system. Before this provider, every page (Dashboard, History, Orders,
// Spare Sets, and most mobile pages) fetched this independently on every
// mount, so navigating between a handful of pages could re-download the
// entire master-data set several times in a few minutes. Fetching it once
// per login session here and sharing it through context cuts that down to
// a single load, which is the single biggest lever we have on Supabase
// egress for this app.
export function OptionsProvider({ children }) {
  const { authenticated } = useAuth();
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchedRef = useRef(false);

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

  const value = useMemo(
    () => ({
      options,
      loading,
      error,
      // Call after creating/editing a Machine, Vendor, Employee, etc.
      // elsewhere if a page needs the dropdown lists to reflect it
      // immediately, rather than waiting for the next full page reload.
      refreshOptions: () => load(true),
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
