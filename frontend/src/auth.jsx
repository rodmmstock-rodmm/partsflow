import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  apiGet,
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
    const data = await apiGet("/auth/me/");
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
    const data = await apiPost(
      "/auth/login/",
      { employee_code: code }
    );

    if (!data.token) {
      throw new Error(
        "Server ไม่ได้ส่ง Authentication Token กลับมา"
      );
    }

    setAuthToken(data.token);
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
