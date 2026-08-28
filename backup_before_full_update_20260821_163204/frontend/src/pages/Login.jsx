import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [employeeCode, setEmployeeCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!auth.loading && auth.authenticated) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    const code = employeeCode.trim();
    if (!code) return setError("กรุณากรอกรหัสพนักงาน");
    setSubmitting(true); setError("");
    try {
      await auth.login(code);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "ไม่สามารถเข้าสู่ระบบได้");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="pf-ref-login">
      <section className="pf-ref-login-card">
        <div className="pf-ref-login-brand">
          <div className="pf-ref-login-logo">PF</div>
          <div className="pf-ref-login-name">PartsFlow</div>
          <div className="pf-ref-login-subtitle">ระบบจัดการสต๊อกและจัดซื้ออะไหล่</div>
        </div>

        <form onSubmit={submit}>
          <label htmlFor="employee-code">รหัสพนักงาน</label>
          <input
            id="employee-code"
            autoFocus
            autoComplete="username"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            placeholder="กรอกรหัสพนักงานของคุณ"
          />
          {error && <div className="pf-ref-login-error">{error}</div>}
          <button type="submit" disabled={submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
          <p className="pf-ref-login-note">ใช้รหัสพนักงานที่ได้รับสิทธิ์ในระบบ PartsFlow เท่านั้น</p>
        </form>
      </section>
    </main>
  );
}
