import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api";
import { Alert, Modal, SearchableSelect } from "./Common";
import { useFeedback } from "../feedback";

function vendorLabel(vendor) {
  if (!vendor) return "";
  return `${vendor.code ? `${vendor.code} · ` : ""}${vendor.name}`;
}

function formatAddedAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderVendorModal({ order, options, onClose, onChanged }) {
  const { confirm } = useFeedback();
  const [rows, setRows] = useState([]);
  const [vendorId, setVendorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const available = useMemo(() => {
    const used = new Set(rows.map((row) => String(row.vendor_id)));
    return (options.vendors || []).filter((vendor) => !used.has(String(vendor.id)));
  }, [options.vendors, rows]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet(`/orders/${order.id}/vendors/`, { cache: false, forceRefresh: true });
      setRows(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [order.id]);

  async function addVendor() {
    if (!vendorId) {
      setError("กรุณาเลือก Vendor");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost(`/orders/${order.id}/vendors/`, { vendor_id: vendorId });
      setVendorId("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeVendor(row) {
    const ok = await confirm(`นำ ${row.vendor_code} · ${row.vendor_name} ออกจาก Order นี้?`, {
      confirmLabel: "นำออก",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await apiDelete(`/orders/${order.id}/vendors/${row.id}/`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Vendor · ${order.order_number}`} onClose={onClose} wide>
      <div className="section-label">Vendor สำหรับ Normal Order</div>
      <p className="helper">
        เพิ่ม Vendor ได้หลายราย วันที่เพิ่มจะถูกบันทึกอัตโนมัติจากเวลาที่กดเพิ่ม และระบบ RFQ/ติดตามราคาจะใช้เฉพาะ Order Step
      </p>

      <div className="form-grid three">
        <label className="field span2">
          <span>เพิ่ม Vendor</span>
          <SearchableSelect
            value={vendorId}
            options={available}
            onChange={setVendorId}
            getLabel={vendorLabel}
            getSearchText={(vendor) => `${vendor.code || ""} ${vendor.name || ""} ${vendor.email || ""} ${vendor.contact_person || ""}`}
            placeholder="พิมพ์ชื่อหรือรหัส Vendor"
          />
        </label>
        <div className="field">
          <span>&nbsp;</span>
          <button className="btn primary" type="button" disabled={busy || !vendorId} onClick={addVendor}>
            {busy ? "กำลังบันทึก..." : "+ เพิ่ม Vendor"}
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>วันที่เพิ่ม</th>
              <th>เพิ่มโดย</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <b>{row.vendor_code || "-"}</b>
                  <div>{row.vendor_name || "-"}</div>
                </td>
                <td>{formatAddedAt(row.added_at)}</td>
                <td>{row.added_by || "-"}</td>
                <td>
                  <button className="mini danger" type="button" disabled={busy} onClick={() => removeVendor(row)}>
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr><td colSpan="4" className="empty">ยังไม่มี Vendor ใน Order นี้</td></tr>
            )}
            {loading && (
              <tr><td colSpan="4" className="empty">กำลังโหลด Vendor...</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="modal-actions">
        <button className="btn ghost" type="button" onClick={onClose}>ปิด</button>
      </div>
    </Modal>
  );
}
