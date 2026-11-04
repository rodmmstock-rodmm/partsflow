import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, formatDMY } from "../components/Common";

const blankKey = { vehicle_number: "", label: "", remark: "" };
const dateTimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function ToolingKeys() {
  const auth = useAuth();
  const [keys, setKeys] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("keys");
  const [query, setQuery] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [keyForm, setKeyForm] = useState(null);
  const [borrowTarget, setBorrowTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [editLoan, setEditLoan] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [borrowForm, setBorrowForm] = useState({ borrower_employee_id: "", remark: "" });
  const [returnRemark, setReturnRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canEdit = auth.can("can_edit_tooling_keys");
  const canDelete = auth.can("can_delete_tooling_keys");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (tab === "history" && outstandingOnly) params.set("outstanding", "true");
      const [keyData, historyData] = await Promise.all([
        apiGet("/tooling-keys/"),
        apiGet(`/tooling-keys/history/?${params.toString()}`),
      ]);
      setKeys(keyData.results || []);
      setEmployees(keyData.employees || []);
      setHistory(historyData.results || []);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [query, outstandingOnly]);

  const counts = useMemo(() => ({
    total: keys.length,
    available: keys.filter((key) => key.status === "AVAILABLE").length,
    borrowed: keys.filter((key) => key.status === "BORROWED").length,
  }), [keys]);

  async function saveKey(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      if (keyForm.id) await apiPatch(`/tooling-keys/${keyForm.id}/`, keyForm);
      else await apiPost("/tooling-keys/", keyForm);
      setKeyForm(null); setSuccess("บันทึกรายการกุญแจแล้ว"); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function borrowKey(e) {
    e.preventDefault();
    if (!borrowTarget) return;
    setBusy(true); setError("");
    try {
      await apiPost(`/tooling-keys/${borrowTarget.id}/borrow/`, borrowForm);
      setBorrowTarget(null); setBorrowForm({ borrower_employee_id: "", remark: "" });
      setSuccess("บันทึกการยืมกุญแจแล้ว"); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function returnKey(e) {
    e.preventDefault();
    if (!returnTarget) return;
    setBusy(true); setError("");
    try {
      await apiPost(`/tooling-keys/${returnTarget.id}/return/`, { remark: returnRemark });
      setReturnTarget(null); setReturnRemark("");
      setSuccess("บันทึกการคืนกุญแจแล้ว"); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveHistory(e) {
    e.preventDefault();
    if (!editLoan) return;
    setBusy(true); setError("");
    try {
      await apiPatch(`/tooling-keys/history/${editLoan.id}/`, {
        borrower_employee_id: editLoan.borrower_employee_id,
        borrowed_at: editLoan.borrowed_at,
        returned_at: editLoan.returned_at,
        returned_by_employee_id: editLoan.returned_by_employee_id,
        borrow_remark: editLoan.borrow_remark,
        return_remark: editLoan.return_remark,
      });
      setEditLoan(null); setSuccess("แก้ไขประวัติการยืม-คืนแล้ว"); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    setBusy(true); setError("");
    try {
      if (confirmTarget.type === "key") await apiDelete(`/tooling-keys/${confirmTarget.row.id}/`);
      else await apiDelete(`/tooling-keys/history/${confirmTarget.row.id}/`);
      setConfirmTarget(null); setSuccess("ดำเนินการเรียบร้อยแล้ว"); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="ยืม-คืนกุญแจไขรถเครื่องมือ" subtitle="จัดการกุญแจประจำรถ บันทึกการยืม-คืน และตรวจสอบประวัติย้อนหลัง" />
      <Alert>{error}</Alert>
      {success && <div className="alert success" role="status">{success}<button type="button" onClick={() => setSuccess("")} aria-label="ปิด">×</button></div>}
      <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 12, marginBottom: 18 }}>
        <div className="panel"><small>กุญแจทั้งหมด</small><h2>{counts.total}</h2></div>
        <div className="panel"><small>กุญแจว่าง</small><h2 style={{ color: "#16834a" }}>{counts.available}</h2></div>
        <div className="panel"><small>กำลังถูกยืม</small><h2 style={{ color: "#b7791f" }}>{counts.borrowed}</h2></div>
      </div>

      <div className="tab-row page-tabs">
        <button className={tab === "keys" ? "tab active" : "tab"} onClick={() => setTab("keys")}>รายการกุญแจ</button>
        <button className={tab === "history" ? "tab active" : "tab"} onClick={() => setTab("history")}>ประวัติการยืม-คืน</button>
        <div style={{ flex: 1 }} />
        {tab === "keys" && canEdit && <button className="btn primary" onClick={() => setKeyForm({ ...blankKey })}>＋ เพิ่มกุญแจ</button>}
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาหมายเลขรถ / ผู้ยืม / รายละเอียด..." />
          {tab === "history" && <label className="checkbox-inline"><input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} /> แสดงเฉพาะที่ยังไม่คืน</label>}
          <button className="btn ghost" onClick={load}>รีเฟรช</button>
        </div>
      </div>

      {loading ? <div className="panel empty">กำลังโหลดข้อมูล...</div> : tab === "keys" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 12 }}>
          {keys.filter((key) => !query || `${key.vehicle_number} ${key.label} ${key.current_loan?.borrower_name || ""}`.toLowerCase().includes(query.toLowerCase())).map((key) => (
            <article className="panel" key={key.id} style={{ display: "flex", flexDirection: "column", gap: 12, opacity: key.active ? 1 : .65 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div><small>รถเครื่องมือ</small><h2 style={{ margin: "4px 0" }}>หมายเลข {key.vehicle_number}</h2><div>{key.label}</div></div>
                <span className={`status ${key.status === "BORROWED" ? "warning" : "success"}`}>{key.status === "BORROWED" ? "กำลังถูกยืม" : "ว่าง"}</span>
              </div>
              {key.current_loan ? <div style={{ background: "var(--surface-muted,#f8fafc)", borderRadius: 10, padding: 12 }}>
                <small>ผู้ถือกุญแจปัจจุบัน</small><strong style={{ display: "block", marginTop: 3 }}>{key.current_loan.borrower_name}</strong>
                <small>ยืมเมื่อ {formatDMY(key.current_loan.borrowed_at, true)}</small>
                {key.current_loan.borrow_remark && <p style={{ margin: "6px 0 0" }}>{key.current_loan.borrow_remark}</p>}
              </div> : <div style={{ color: "var(--muted,#64748b)", fontSize: 13 }}>ยังไม่มีผู้ยืม</div>}
              {key.remark && <small>{key.remark}</small>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
                {key.active && key.status === "AVAILABLE" && <button className="btn primary" onClick={() => { setBorrowTarget(key); setBorrowForm({ borrower_employee_id: auth.employee?.id || "", remark: "" }); }}>ยืมกุญแจ</button>}
                {key.active && key.status === "BORROWED" && <button className="btn primary" onClick={() => { setReturnTarget(key); setReturnRemark(""); }}>คืนกุญแจ</button>}
                {canEdit && <button className="btn ghost" onClick={() => setKeyForm({ id: key.id, vehicle_number: key.vehicle_number, label: key.label, remark: key.remark })}>แก้ไข</button>}
                {canDelete && key.active && <button className="btn danger" onClick={() => setConfirmTarget({ type: "key", row: key })}>ลบรายการ</button>}
              </div>
            </article>
          ))}
          {!keys.length && <div className="panel empty">ยังไม่มีรายการกุญแจ กรุณาเพิ่มรายการกุญแจรถเครื่องมือ</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 12 }}>
          {history.map((loan) => <article className="panel" key={loan.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong>รถเครื่องมือหมายเลข {loan.vehicle_number}</strong>
              <span className={`status ${loan.is_outstanding ? "warning" : "success"}`}>{loan.is_outstanding ? "ยังไม่คืน" : "คืนแล้ว"}</span>
            </div>
            <div><small>ผู้ยืม</small><strong style={{ display: "block" }}>{loan.borrower_name}</strong></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><small>วันเวลาที่ยืม</small><div>{formatDMY(loan.borrowed_at, true)}</div></div>
              <div><small>วันเวลาที่คืน</small><div>{loan.returned_at ? formatDMY(loan.returned_at, true) : "-"}</div></div>
            </div>
            <div><small>ผู้คืน</small><div>{loan.returned_by_name || "-"}</div></div>
            {(loan.borrow_remark || loan.return_remark) && <div style={{ color: "var(--muted,#64748b)", fontSize: 13 }}>{[loan.borrow_remark, loan.return_remark].filter(Boolean).join(" / ")}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
              {canEdit && <button className="btn ghost" onClick={() => setEditLoan({ ...loan, borrowed_at: dateTimeLocal(loan.borrowed_at), returned_at: dateTimeLocal(loan.returned_at) })}>แก้ไขประวัติ</button>}
              {canDelete && !loan.is_outstanding && <button className="btn danger" onClick={() => setConfirmTarget({ type: "history", row: loan })}>ลบประวัติ</button>}
            </div>
          </article>)}
          {!history.length && <div className="panel empty">ไม่พบประวัติการยืม-คืน</div>}
        </div>
      )}

      {keyForm && <Modal title={keyForm.id ? "แก้ไขรายการกุญแจ" : "เพิ่มกุญแจรถเครื่องมือ"} onClose={() => setKeyForm(null)}>
        <form onSubmit={saveKey}>
          <label className="field"><span>หมายเลขรถเครื่องมือ *</span><input required type="number" min="1" max="999" value={keyForm.vehicle_number} onChange={(e) => setKeyForm({ ...keyForm, vehicle_number: e.target.value })} /></label>
          <label className="field"><span>ชื่อรายการกุญแจ</span><input value={keyForm.label} onChange={(e) => setKeyForm({ ...keyForm, label: e.target.value })} placeholder="กุญแจรถเครื่องมือ 1" /></label>
          <label className="field"><span>หมายเหตุ</span><textarea value={keyForm.remark} onChange={(e) => setKeyForm({ ...keyForm, remark: e.target.value })} /></label>
          <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setKeyForm(null)}>ยกเลิก</button><button className="btn primary" disabled={busy}>บันทึก</button></div>
        </form>
      </Modal>}

      {borrowTarget && <Modal title={`ยืมกุญแจรถเครื่องมือหมายเลข ${borrowTarget.vehicle_number}`} onClose={() => setBorrowTarget(null)}>
        <form onSubmit={borrowKey}>
          <label className="field"><span>ชื่อผู้ยืม *</span><select required value={borrowForm.borrower_employee_id} onChange={(e) => setBorrowForm({ ...borrowForm, borrower_employee_id: e.target.value })}><option value="">เลือกพนักงาน</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
          <label className="field"><span>หมายเหตุ</span><textarea value={borrowForm.remark} onChange={(e) => setBorrowForm({ ...borrowForm, remark: e.target.value })} /></label>
          <p className="field-help">ระบบจะบันทึกวันและเวลาที่ยืมให้อัตโนมัติ</p>
          <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setBorrowTarget(null)}>ยกเลิก</button><button className="btn primary" disabled={busy}>ยืนยันการยืม</button></div>
        </form>
      </Modal>}

      {returnTarget && <Modal title={`คืนกุญแจรถเครื่องมือหมายเลข ${returnTarget.vehicle_number}`} onClose={() => setReturnTarget(null)}>
        <p>ผู้ยืมปัจจุบัน: <strong>{returnTarget.current_loan?.borrower_name || "-"}</strong></p>
        <label className="field"><span>หมายเหตุการคืน</span><textarea value={returnRemark} onChange={(e) => setReturnRemark(e.target.value)} /></label>
        <p className="field-help">ระบบจะบันทึกชื่อผู้คืนเป็นผู้ใช้งานที่เข้าสู่ระบบและบันทึกวันเวลาปัจจุบัน</p>
        <div className="modal-actions"><button className="btn ghost" onClick={() => setReturnTarget(null)}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={returnKey}>ยืนยันการคืน</button></div>
      </Modal>}

      {editLoan && <Modal title={`แก้ไขประวัติ · รถหมายเลข ${editLoan.vehicle_number}`} onClose={() => setEditLoan(null)}>
        <form onSubmit={saveHistory}>
          <label className="field"><span>ผู้ยืม *</span><select required value={editLoan.borrower_employee_id} onChange={(e) => setEditLoan({ ...editLoan, borrower_employee_id: e.target.value })}><option value="">เลือกพนักงาน</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
          <label className="field"><span>วันเวลาที่ยืม</span><input type="datetime-local" required value={editLoan.borrowed_at} onChange={(e) => setEditLoan({ ...editLoan, borrowed_at: e.target.value })} /></label>
          <label className="field"><span>วันเวลาที่คืน (เว้นว่างหากยังไม่คืน)</span><input type="datetime-local" value={editLoan.returned_at} onChange={(e) => setEditLoan({ ...editLoan, returned_at: e.target.value })} /></label>
          <label className="field"><span>ผู้คืน</span><select value={editLoan.returned_by_employee_id || ""} disabled={!editLoan.returned_at} onChange={(e) => setEditLoan({ ...editLoan, returned_by_employee_id: e.target.value })}><option value="">เลือกพนักงานผู้คืน</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select><small className="field-help">เลือกจากรายชื่อพนักงานที่ลงทะเบียนไว้</small></label>
          <label className="field"><span>หมายเหตุการยืม</span><textarea value={editLoan.borrow_remark} onChange={(e) => setEditLoan({ ...editLoan, borrow_remark: e.target.value })} /></label>
          <label className="field"><span>หมายเหตุการคืน</span><textarea value={editLoan.return_remark} onChange={(e) => setEditLoan({ ...editLoan, return_remark: e.target.value })} /></label>
          <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setEditLoan(null)}>ยกเลิก</button><button className="btn primary" disabled={busy}>บันทึกประวัติ</button></div>
        </form>
      </Modal>}

      {confirmTarget && <Modal title="ยืนยันการลบ" onClose={() => setConfirmTarget(null)}>
        <p>{confirmTarget.type === "key" ? `ยืนยันปิดใช้งานรายการกุญแจรถหมายเลข ${confirmTarget.row.vehicle_number}?` : `ยืนยันลบประวัติการยืมกุญแจรถหมายเลข ${confirmTarget.row.vehicle_number}?`}</p>
        <p className="field-help">ระบบจะเก็บ Audit Log ของการดำเนินการนี้ และไม่ลบข้อมูลถาวรจากฐานข้อมูล</p>
        <div className="modal-actions"><button className="btn ghost" onClick={() => setConfirmTarget(null)}>ยกเลิก</button><button className="btn danger" disabled={busy} onClick={confirmDelete}>ยืนยัน</button></div>
      </Modal>}
    </>
  );
}
