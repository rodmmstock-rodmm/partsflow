import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  apiAuthMe,
  apiLogin,
  apiPost,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "./api";

const AuthContext = createContext(null);
const AUTH_CHECK_RETRY_DELAYS_MS = [0, 1200, 2500];

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authCheckFailed, setAuthCheckFailed] = useState(false);

  async function refresh() {
    const data = await apiAuthMe();
    if (data.token) {
      setAuthToken(data.token, data.remember_mobile === true);
    }
    setEmployee(data.employee);
    setAuthCheckFailed(false);
    return data.employee;
  }

  // A temporary network/Render error must not destroy a still-valid local
  // token. Only an explicit 401 is treated as an expired/invalid session.
  async function verifySession() {
    setAuthCheckFailed(false);

    if (!getAuthToken()) {
      setEmployee(null);
      return false;
    }

    for (let attempt = 0; attempt < AUTH_CHECK_RETRY_DELAYS_MS.length; attempt += 1) {
      const delay = AUTH_CHECK_RETRY_DELAYS_MS[attempt];
      if (delay) await wait(delay);

      try {
        const data = await apiAuthMe();
        if (!data?.employee) {
          // A malformed/incomplete success response is not proof that the
          // session is invalid. Retry it like any other transient failure.
          throw new Error("Server returned an incomplete session response");
        }
        if (data.token) {
          setAuthToken(data.token, data.remember_mobile === true);
        }
        setEmployee(data.employee);
        setAuthCheckFailed(false);
        return true;
      } catch (error) {
        if (error?.status === 401) {
          clearAuthToken();
          setEmployee(null);
          return false;
        }
        // Retry transient failures. Keep the token if the backend is still
        // unavailable so a later retry/reload can restore the same session.
      }
    }

    setAuthCheckFailed(true);
    return false;
  }

  useEffect(() => {
    if (!getAuthToken()) {
      setEmployee(null);
      setLoading(false);
      return undefined;
    }

    verifySession().finally(() => {
      setLoading(false);
    });
    return undefined;
  }, []);

  async function retryAuth() {
    setLoading(true);
    try {
      return await verifySession();
    } finally {
      setLoading(false);
    }
  }

  async function login(code) {
    const data = await apiLogin(code);

    if (!data.token) {
      throw new Error(
        "Server ไม่ได้ส่ง Authentication Token กลับมา"
      );
    }

    setAuthToken(data.token, data.remember_mobile === true);
    setEmployee(data.employee);
    setAuthCheckFailed(false);

    return data.employee;
  }

  async function logout() {
    // Remove the local session immediately; the server-side logout is best effort.
    const request = apiPost("/auth/logout/").catch(() => {});
    clearAuthToken();
    setEmployee(null);
    setAuthCheckFailed(false);
    await request;
  }

  const value = useMemo(
    () => ({
      employee,
      loading,
      authenticated: !!employee,
      authCheckFailed,
      retryAuth,
      login,
      logout,
      refresh,
      can: (key) => !!employee?.permissions?.[key],
    }),
    [employee, loading, authCheckFailed]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
