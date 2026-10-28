import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import { useAuth } from "../auth";
import { useFeedback } from "../feedback";

const PHASES = [
  { value: "PHASE4", label: "Phase 4" },
  { value: "PHASE11", label: "Phase 11" },
];

export default function ClothRollIssueForm() {
  const auth = useAuth();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [data, setData] = useState({ stocks: [], employees: [], current_employee_id: "" });
  const [phase, setPhase] = useState("PHASE4");
  const [quantity, setQuantity] = useState("1");
  const [borrowerId, setBorrowerId] = useState("");
  const [machineName, setMachineName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setError("");
    try {
      const result = await apiGet("/cloth-rolls/issue-form/", { cache: false, forceRefresh: true });
      setData(result);
      setBorrowerId((current) => current || result.current_employee_id || "");
    } catch (err) {
      setError(err.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedStock = useMemo(
    () => data.stocks.find((stock) => stock.phase === phase),
    [data.stocks, phase]
  );

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError("กรุณาระบุจำนวนเป็นเลขจำนวนเต็มอย่างน้อย 1 ม้วน");
      return;
    }
    if (!borrowerId) {
      setError("กรุณาเลือกชื่อผู้เบิก");
      return;
    }
    if (selectedStock && qty > Number(selectedStock.quantity || 0)) {
      setError(`เศษผ้าไม่เพียงพอ คงเหลือ ${Number(selectedStock.quantity || 0).toLocaleString("th-TH")} ม้วน`);
      return;
    }

    setBusy(true);
    try {
      const result = await apiPost("/cloth-rolls/transactions/", {
        phase,
        transaction_type: "OUT",
        quantity: String(qty),
        borrower_employee_id: borrowerId,
        machine_name: machineName.trim(),
        source: "WEB",
      });
      setData((current) => ({
        ...current,
        stocks: current.stocks.map((stock) =>
          stock.phase === result.stock.phase ? result.stock : stock
        ),
      }));
      setQuantity("1");
      setMachineName("");
      setSuccess(`บันทึกการเบิกสำเร็จ คงเหลือ ${Number(result.stock.quantity || 0).toLocaleString("th-TH")} ม้วน`);
      feedback.showToast("บันทึกการเบิกเศษผ้าสำเร็จ", "success");
    } catch (err) {
      setError(err.message || "บันทึกการเบิกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="cloth-issue-standalone">
      <style>{`
        .cloth-issue-standalone{min-height:100dvh;box-sizing:border-box;padding:24px 16px 40px;background:#f4f7fb;color:#18334d;font-family:inherit}
        .cloth-issue-wrap{width:100%;max-width:560px;margin:0 auto}
        .cloth-issue-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 22px}
        .cloth-issue-brand{display:flex;align-items:center;gap:11px;min-width:0}
        .cloth-issue-logo{width:42px;height:42px;display:grid;place-items:center;flex:0 0 auto;border-radius:13px;background:#e1effb;color:#28669e;font-weight:800;letter-spacing:-.04em}
        .cloth-issue-brand strong{display:block;font-size:15px;line-height:1.4;color:#244766}
        .cloth-issue-brand span{display:block;font-size:12px;color:#7890a7}
        .cloth-issue-logout{border:1px solid #d9e4ee;border-radius:10px;background:#fff;color:#456681;padding:9px 12px;font:inherit;font-size:12px;cursor:pointer}
        .cloth-issue-card{background:#fff;border:1px solid #dce6ef;border-radius:20px;overflow:hidden;box-shadow:0 12px 36px rgba(35,73,108,.07)}
        .cloth-issue-heading{padding:25px 26px 21px;border-bottom:1px solid #e8eef4;background:linear-gradient(135deg,#f7fbff,#fff)}
        .cloth-issue-eyebrow{font-size:11px;letter-spacing:.1em;font-weight:750;color:#6591b8;margin-bottom:8px}
        .cloth-issue-heading h1{font-size:25px;line-height:1.3;letter-spacing:-.03em;margin:0;color:#204b70}
        .cloth-issue-heading p{margin:8px 0 0;font-size:13px;line-height:1.6;color:#71879a}
        .cloth-issue-form{padding:24px 26px 27px}
        .cloth-issue-field{display:flex;flex-direction:column;gap:8px;margin-bottom:18px}
        .cloth-issue-field label{font-size:13px;font-weight:650;color:#385873}
        .cloth-issue-field select,.cloth-issue-field input{box-sizing:border-box;width:100%;min-height:47px;border:1px solid #cfdeea;border-radius:11px;padding:11px 13px;background:#fff;color:#24435e;font:inherit;font-size:15px;outline:none}
        .cloth-issue-field select:focus,.cloth-issue-field input:focus{border-color:#6ea5d2;box-shadow:0 0 0 3px rgba(70,139,194,.13)}
        .cloth-issue-balance{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;margin:-2px 0 20px;border:1px solid #dcebf7;border-radius:12px;background:#f5faff}
        .cloth-issue-balance span{font-size:12px;color:#66829a}
        .cloth-issue-balance strong{font-size:19px;font-variant-numeric:tabular-nums;color:#2d6595}
        .cloth-issue-submit{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:49px;border:0;border-radius:12px;background:#397fba;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 5px 12px rgba(57,127,186,.2);transition:background .15s,transform .15s}
        .cloth-issue-submit:hover:not(:disabled){background:#2f6fa7;transform:translateY(-1px)}
        .cloth-issue-submit:disabled{opacity:.6;cursor:wait}
        .cloth-issue-alert{margin:0 0 16px;padding:11px 13px;border-radius:10px;font-size:13px;line-height:1.55}
        .cloth-issue-alert.error{background:#fff1f2;border:1px solid #fecdd3;color:#be123c}
        .cloth-issue-alert.success{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}
        .cloth-issue-foot{text-align:center;margin-top:16px;font-size:11px;color:#8aa0b3}
        @media(max-width:480px){.cloth-issue-standalone{padding:14px 11px 28px}.cloth-issue-top{margin-bottom:15px}.cloth-issue-heading{padding:21px 18px 18px}.cloth-issue-heading h1{font-size:23px}.cloth-issue-form{padding:20px 18px 22px}.cloth-issue-card{border-radius:16px}.cloth-issue-logout{padding:8px 9px}}
      `}</style>

      <div className="cloth-issue-wrap">
        <header className="cloth-issue-top">
          <div className="cloth-issue-brand">
            <div className="cloth-issue-logo">PF</div>
            <div><strong>PartsFlow</strong><span>{auth.employee?.name || "ผู้ใช้งาน"} · {auth.employee?.role || "เข้าสู่ระบบแล้ว"}</span></div>
          </div>
          <button className="cloth-issue-logout" type="button" onClick={logout}>ออกจากระบบ</button>
        </header>

        <section className="cloth-issue-card">
          <div className="cloth-issue-heading">
            <div className="cloth-issue-eyebrow">CLOTH ROLL WITHDRAWAL</div>
            <h1>ฟอร์มเบิกจ่ายเศษผ้า</h1>
            <p>กรอกข้อมูลการเบิกเพื่อบันทึกลงระบบคลังเศษผ้าโดยตรง</p>
          </div>

          <form className="cloth-issue-form" onSubmit={submit}>
            {error && <div className="cloth-issue-alert error" role="alert">{error}</div>}
            {success && <div className="cloth-issue-alert success" role="status">{success}</div>}

            <div className="cloth-issue-field">
              <label htmlFor="cloth-issue-phase">Phase ที่ต้องการเบิก</label>
              <select id="cloth-issue-phase" value={phase} onChange={(event) => setPhase(event.target.value)} disabled={loading || busy}>
                {PHASES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <div className="cloth-issue-balance">
              <span>ยอดคงเหลือปัจจุบัน</span>
              <strong>{loading ? "กำลังโหลด…" : `${Number(selectedStock?.quantity || 0).toLocaleString("th-TH")} ม้วน`}</strong>
            </div>

            <div className="cloth-issue-field">
              <label htmlFor="cloth-issue-quantity">จำนวนที่ต้องการเบิก (ม้วน)</label>
              <input id="cloth-issue-quantity" type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={loading || busy} required />
            </div>

            <div className="cloth-issue-field">
              <label htmlFor="cloth-issue-machine">Machine</label>
              <input id="cloth-issue-machine" type="text" maxLength="120" value={machineName} onChange={(event) => setMachineName(event.target.value)} disabled={loading || busy} placeholder="ระบุชื่อ Machine (ถ้ามี)" />
            </div>

            <div className="cloth-issue-field">
              <label htmlFor="cloth-issue-borrower">ชื่อผู้เบิก</label>
              <select id="cloth-issue-borrower" value={borrowerId} onChange={(event) => setBorrowerId(event.target.value)} disabled={loading || busy} required>
                <option value="">เลือกชื่อผู้เบิก</option>
                {data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </div>

            <button className="cloth-issue-submit" type="submit" disabled={loading || busy || !data.stocks.length}>
              {busy ? "กำลังบันทึก…" : "ยืนยันการเบิกเศษผ้า"}
            </button>
          </form>
        </section>
        <div className="cloth-issue-foot">ระบบเบิกจ่ายใช้บัญชี PartsFlow เดิม · ข้อมูลบันทึกในคลังเดิม</div>
      </div>
    </main>
  );
}
