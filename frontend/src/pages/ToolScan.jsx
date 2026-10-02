import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import { Alert } from "../components/Common";

function formatDateTime(iso) {
  if (!iso) return "-";
  return iso.slice(0, 16).replace("T", " ");
}

export default function ToolScan() {
  const { code } = useParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tool, setTool] = useState(null);
  const [currentLoan, setCurrentLoan] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // "borrowed" | "returned" | null

  const [borrowerEmployeeId, setBorrowerEmployeeId] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [returnerName, setReturnerName] = useState("");
  const [returnNote, setReturnNote] = useState("");

  async function load() {
    setLoading(true);
    setNotFound(false);
    setError("");
    try {
      const d = await apiGet(`/tools/public/${encodeURIComponent(code)}/`);
      setTool(d.tool);
      setCurrentLoan(d.current_loan || null);
      setEmployees(d.employees || []);
    } catch (err) {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function pickEmployee(id) {
    setBorrowerEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp) setBorrowerName(emp.name);
  }

  async function submitBorrow(e) {
    e.preventDefault();
    if (!borrowerName.trim()) {
      setError("กรุณาระบุชื่อผู้เบิก");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost(`/tools/public/${encodeURIComponent(code)}/borrow/`, {
        borrower_name: borrowerName.trim(),
        borrower_employee_id: borrowerEmployeeId || undefined,
        purpose: purpose.trim(),
        expected_return_date: expectedReturnDate || undefined,
      });
      setDone("borrowed");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReturn(e) {
    e.preventDefault();
    if (!returnerName.trim()) {
      setError("กรุณาระบุชื่อผู้คืน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost(`/tools/public/${encodeURIComponent(code)}/return/`, {
        returned_by_name: returnerName.trim(),
        return_note: returnNote.trim(),
      });
      setDone("returned");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-scan-page">
      <div className="tool-scan-card">
        <div className="tool-scan-brand">PartsFlow · ยืม-คืนอุปกรณ์</div>

        {loading ? (
          <div className="empty">กำลังโหลด...</div>
        ) : notFound ? (
          <div className="tool-scan-error">
            <div className="tool-scan-error-icon">✕</div>
            <p>ไม่พบอุปกรณ์นี้ในระบบ</p>
            <small>Code: {code}</small>
          </div>
        ) : done === "borrowed" ? (
          <div className="tool-scan-success">
            <div className="tool-scan-success-icon">✓</div>
            <h2>เบิกอุปกรณ์สำเร็จ</h2>
            <p>
              {tool.code} · {tool.name}
            </p>
            <small>ผู้เบิก: {borrowerName}</small>
          </div>
        ) : done === "returned" ? (
          <div className="tool-scan-success">
            <div className="tool-scan-success-icon">✓</div>
            <h2>คืนอุปกรณ์สำเร็จ</h2>
            <p>
              {tool.code} · {tool.name}
            </p>
            <small>ผู้คืน: {returnerName}</small>
          </div>
        ) : (
          <>
            <div className="tool-scan-info">
              <h2>{tool.name}</h2>
              <div className="tool-scan-code">{tool.code}</div>
              {tool.category && <div className="tool-scan-meta">ประเภท: {tool.category}</div>}
              {tool.location && <div className="tool-scan-meta">เก็บที่: {tool.location}</div>}
              <span className={`status ${tool.status === "BORROWED" ? "warning" : "success"}`}>
                {tool.status_label}
              </span>
            </div>

            <Alert>{error}</Alert>

            {tool.status === "AVAILABLE" ? (
              <form onSubmit={submitBorrow} className="tool-scan-form">
                <div className="section-label">แบบฟอร์มเบิกอุปกรณ์</div>
                {employees.length > 0 && (
                  <label className="field">
                    <span>เลือกชื่อจากรายชื่อพนักงาน (ถ้ามี)</span>
                    <select
                      value={borrowerEmployeeId}
                      onChange={(e) => pickEmployee(e.target.value)}
                    >
                      <option value="">-- ไม่เลือก / พิมพ์ชื่อเอง --</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.employee_code} · {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>ชื่อผู้เบิก *</span>
                  <input
                    required
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    placeholder="พิมพ์ชื่อผู้เบิก"
                  />
                </label>
                <label className="field">
                  <span>วัตถุประสงค์ / งานที่ใช้</span>
                  <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
                </label>
                <label className="field">
                  <span>กำหนดคืน (ถ้ามี)</span>
                  <input
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                  />
                </label>
                <button className="btn primary full tool-scan-submit" disabled={busy}>
                  {busy ? "กำลังบันทึก..." : "ยืนยันเบิกอุปกรณ์"}
                </button>
              </form>
            ) : (
              <form onSubmit={submitReturn} className="tool-scan-form">
                <div className="section-label">แบบฟอร์มคืนอุปกรณ์</div>
                {currentLoan && (
                  <div className="tool-scan-current-loan">
                    <span>ผู้ยืมปัจจุบัน: {currentLoan.borrower_name}</span>
                    <span>เบิกเมื่อ: {formatDateTime(currentLoan.borrowed_at)}</span>
                    {currentLoan.purpose && <span>งาน: {currentLoan.purpose}</span>}
                  </div>
                )}
                <label className="field">
                  <span>ชื่อผู้คืน *</span>
                  <input
                    required
                    value={returnerName}
                    onChange={(e) => setReturnerName(e.target.value)}
                    placeholder="พิมพ์ชื่อผู้คืน"
                  />
                </label>
                <label className="field">
                  <span>หมายเหตุ (ถ้ามี)</span>
                  <textarea rows="2" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
                </label>
                <button className="btn primary full tool-scan-submit" disabled={busy}>
                  {busy ? "กำลังบันทึก..." : "ยืนยันคืนอุปกรณ์"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
