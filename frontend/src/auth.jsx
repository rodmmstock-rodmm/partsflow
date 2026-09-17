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
    try {
      await apiPost("/auth/logout/");
    } catch {
      // Token will still be removed locally.
    } finally {
      clearAuthToken();
      setEmployee(null);
    }
  }

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
