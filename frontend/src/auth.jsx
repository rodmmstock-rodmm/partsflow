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

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  return (
    navigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  );
}

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const data = await apiAuthMe();
    if (data.token) {
      setAuthToken(data.token, data.remember_mobile === true);
    }
    setEmployee(data.employee);
    return data.employee;
  }

  useEffect(() => {
    if (!getAuthToken()) {
      setEmployee(null);
      setLoading(false);
      return;
    }

    refresh()
      .catch(() => {
        clearAuthToken();
        setEmployee(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function login(code) {
    const data = await apiLogin(code);

    if (!data.token) {
      throw new Error(
        "Server ไม่ได้ส่ง Authentication Token กลับมา"
      );
    }

    setAuthToken(data.token, data.remember_mobile === true);
    setEmployee(data.employee);

    return data.employee;
  }

  async function logout() {
    // Remove the local session immediately; the server-side logout is best effort.
    const request = apiPost("/auth/logout/").catch(() => {});
    clearAuthToken();
    setEmployee(null);
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
      // Avoid resetting the timer for every mouse-move event.
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
    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    timeoutId = window.setTimeout(expireIfIdle, DESKTOP_IDLE_TIMEOUT_MS);

    return () => {
      clearTimer();
      window.removeEventListener("pointerdown", recordActivity, true);
      window.removeEventListener("keydown", recordActivity, true);
      window.removeEventListener("wheel", recordActivity, true);
      window.removeEventListener("scroll", recordActivity, true);
      window.removeEventListener("mousemove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [employee]);

  const value = useMemo(
    () => ({
      employee,
      loading,
      authenticated: !!employee,
      login,
      logout,
      refresh,
      can: (key) =>
        !!employee?.permissions?.[key],
    }),
    [employee, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
