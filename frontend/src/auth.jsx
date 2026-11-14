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
const DESKTOP_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const AUTH_CHECK_RETRY_DELAYS_MS = [0, 1200, 2500];

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  return (
    navigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  );
}

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
          clearAuthToken();
          setEmployee(null);
          return false;
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

  useEffect(() => {
    if (!employee || isMobileDevice()) return undefined;

    let timeoutId;
    let lastActivityAt = Date.now();
    let lastPointerMoveAt = 0;
    let loggingOut = false;

    const clearTimer = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const expireIfIdle = () => {
      if (loggingOut) return;
      const remaining = DESKTOP_IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt);
      if (remaining > 0) {
        timeoutId = window.setTimeout(expireIfIdle, remaining);
        return;
      }
      loggingOut = true;
      void logout();
    };

    const recordActivity = () => {
      if (loggingOut) return;
      lastActivityAt = Date.now();
      clearTimer();
      timeoutId = window.setTimeout(expireIfIdle, DESKTOP_IDLE_TIMEOUT_MS);
    };

    const handlePointerMove = () => {
      const now = Date.now();
      // Avoid resetting the timer for every pointer-move event.
      if (now - lastPointerMoveAt < 1000) return;
      lastPointerMoveAt = now;
      recordActivity();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") expireIfIdle();
    };

    window.addEventListener("pointerdown", recordActivity, true);
    window.addEventListener("keydown", recordActivity, true);
    window.addEventListener("wheel", recordActivity, { passive: true, capture: true });
    window.addEventListener("scroll", recordActivity, { passive: true, capture: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("touchstart", recordActivity, { passive: true, capture: true });
    window.addEventListener("touchmove", recordActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    timeoutId = window.setTimeout(expireIfIdle, DESKTOP_IDLE_TIMEOUT_MS);

    return () => {
      clearTimer();
      window.removeEventListener("pointerdown", recordActivity, true);
      window.removeEventListener("keydown", recordActivity, true);
      window.removeEventListener("wheel", recordActivity, true);
      window.removeEventListener("scroll", recordActivity, true);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchstart", recordActivity, true);
      window.removeEventListener("touchmove", recordActivity, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [employee]);

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
