import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!auth.loading && auth.authenticated) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await auth.login(code);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="login-logo">PF</div>
          <div className="login-name">PartsFlow</div>
          <div className="login-subtitle">Spare Parts & Purchasing Management</div>
        </div>
        <label className="field">
          <span>Employee Code</span>
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="กรอกรหัสพนักงาน" />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary full" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ..." : "Login"}</button>
        <p className="login-note">ระบบใช้ Employee Code สำหรับเข้าสู่ระบบ</p>
      </form>
    </div>
  );
}
