import { useState } from "react";
import { apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, SearchableSelect, fmt } from "./Common";

export default function SpareSetIssueModal({ rows, options, onClose, onSaved }) {
  const auth = useAuth();
  const [quantities, setQuantities] = useState(() => Object.fromEntries(rows.map((row) => [row.id, String(row.quantity || 1)])));
  const [requesterId, setRequesterId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canSelectRequester = auth.can("can_select_issue_requester");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (canSelectRequester && !requesterId) throw new Error("กรุณาเลือกผู้เบิกจากรายการ");
      const items = rows.map((row) => ({ set_item_id: row.id, quantity: quantities[row.id] }));
      await apiPost("/spare-sets/bulk-issue/", {
        items,
        ...(canSelectRequester ? { requester_id: requesterId } : {}),
        note,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`เบิกอะไหล่ที่เลือก (${rows.length} รายการ)`} onClose={onClose} wide>
      <form onSubmit={submit}>
        {canSelectRequester && (
          <label className="field">
            <span>ผู้เบิก *</span>
            <SearchableSelect
              required
              value={requesterId}
              options={(options.employees || []).filter((item) => item.active !== false)}
              onChange={setRequesterId}
              getLabel={(item) => item.name}
              getSearchText={(item) => `${item.employee_code || ""} ${item.name || ""} ${item.department || ""}`}
              placeholder="พิมพ์ชื่อพนักงาน"
            />
          </label>
        )}
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Part ID</th><th>Part Name</th><th>Machine</th><th>Stock</th><th>จำนวนเบิก</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><b>{row.sku}</b></td>
                  <td>{row.name}</td>
                  <td>{row.machine_code}</td>
                  <td>{fmt(row.stock_qty)} {row.unit_code}</td>
                  <td><input type="number" min="0.01" step="any" required value={quantities[row.id]} onChange={(event) => setQuantities((prev) => ({ ...prev, [row.id]: event.target.value }))} style={{ width: 100 }} /> {row.unit_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Remark</span>
          <textarea rows="2" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn danger" disabled={busy}>{busy ? "กำลังบันทึกการเบิก..." : "ยืนยันเบิกทั้งหมด"}</button>
        </div>
      </form>
    </Modal>
  );
}
