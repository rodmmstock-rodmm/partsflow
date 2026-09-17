import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { Alert, Modal, SearchableSelect, money } from "./Common";

function displayOrderStatus(order) {
  if (order?.lifecycle_status === "WAIT_CONFIRM") return "Wait Confirm Order";
  return order?.display_status || order?.status || "New Order";
}

function vendorLabel(item) {
  if (!item) return "";
  return `${item.code ? `${item.code} · ` : ""}${item.name}`;
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

export default function NormalPurchaseModal({ order, options, onClose, onChanged }) {
  const [local, setLocal] = useState({ ...order });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [quotationVendors, setQuotationVendors] = useState([]);
  const [savedVendorId, setSavedVendorId] = useState(order.vendor_id || "");
  const [quotationVendorId, setQuotationVendorId] = useState("");
  const [quotationLoading, setQuotationLoading] = useState(true);
  const [quotationBusy, setQuotationBusy] = useState(false);
  const set = (key, value) => setLocal((current) => ({ ...current, [key]: value }));

  const availableQuotationVendors = useMemo(() => {
    const used = new Set(quotationVendors.map((row) => String(row.vendor_id)));
    return (options.vendors || []).filter((item) => !used.has(String(item.id)));
  }, [options.vendors, quotationVendors]);

  const vendorOrderOptions = useMemo(() => quotationVendors.map((row) => {
    const master = (options.vendors || []).find(
      (item) => String(item.id) === String(row.vendor_id)
    );
    return master || {
      id: row.vendor_id,
      code: row.vendor_code,
      name: row.vendor_name,
      email: row.vendor_email || "",
      contact_person: row.vendor_contact || "",
    };
  }), [options.vendors, quotationVendors]);

  async function refreshOrder() {
    try {
      const result = await apiGet(`/orders/${order.id}/`, { cache: false, forceRefresh: true });
      setLocal(result);
      setSavedVendorId(result.vendor_id || "");
      onChanged?.(result);
    } catch {
      onChanged?.(local);
    }
  }

  async function loadQuotationVendors() {
    setQuotationLoading(true);
    try {
      const data = await apiGet(`/orders/${order.id}/vendors/`, { cache: false, forceRefresh: true });
      setQuotationVendors(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setQuotationLoading(false);
    }
  }

  useEffect(() => {
    loadQuotationVendors();
  }, [order.id]);

  async function addQuotationVendor() {
    if (!quotationVendorId) {
      setError("กรุณาเลือก Vendor สำหรับ Order Quotation");
      return;
    }
    setQuotationBusy(true);
    setError("");
    try {
      await apiPost(`/orders/${order.id}/vendors/`, { vendor_id: quotationVendorId });
      setQuotationVendorId("");
      await loadQuotationVendors();
      await refreshOrder();
    } catch (err) {
      setError(err.message);
    } finally {
      setQuotationBusy(false);
    }
  }

  async function removeQuotationVendor(row) {
    if (!window.confirm(`นำ ${row.vendor_code} · ${row.vendor_name} ออกจาก Order Quotation นี้?`)) return;
    setQuotationBusy(true);
    setError("");
    try {
      await apiDelete(`/orders/${order.id}/vendors/${row.id}/`);
      await loadQuotationVendors();
      await refreshOrder();
    } catch (err) {
      setError(err.message);
    } finally {
      setQuotationBusy(false);
    }
  }

  async function saveField(key, payload) {
    setBusy(key);
    setError("");
    try {
      const result = await apiPatch(`/orders/${order.id}/purchase/`, payload);
      setLocal(result);
      setSavedVendorId(result.vendor_id || "");
      onChanged?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const vendor = vendorOrderOptions.find(
    (item) => String(item.id) === String(local.vendor_id || "")
  );
  const savedVendor = vendorOrderOptions.find(
    (item) => String(item.id) === String(savedVendorId)
  );
  const person = (options.employees || []).find((item) => item.id === local.person_in_charge_id);

  async function removeVendorOrder() {
    if (!savedVendorId || busy) return;
    const label = savedVendor
      ? vendorLabel(savedVendor)
      : [local.vendor_code, local.vendor_name].filter(Boolean).join(" · ") || "Vendor ที่เลือก";
    if (!window.confirm(
      `ลบ ${label} ออกจาก VENDOR ORDER?\n\nVendor รายนี้จะยังอยู่ใน ORDER QUOTATION`
    )) return;
    await saveField("vendor", { vendor_id: "" });
  }
  const hasPrice = Number(local.price_per_unit || 0) > 0;
  const hasLeadTime = local.lead_time_days !== null && local.lead_time_days !== undefined && local.lead_time_days !== "";

  return (
    <Modal title={`Purchase Information · ${order.order_number}`} onClose={onClose} wide>
      <div className="section-label">2. Purchase Information</div>
      <p className="helper">
        เพิ่ม Vendor ที่กำลังขอราคาไว้ใน ORDER QUOTATION ได้หลายราย แล้วเลือก Vendor ที่สั่งจริงใน VENDOR ORDER ด้านล่าง
      </p>

      <div className="purchase-list">
        <div className="purchase-field quotation-history">
          <label>ORDER QUOTATION · Vendor ที่ขอราคา</label>
          <div>
            <SearchableSelect
              value={quotationVendorId}
              options={availableQuotationVendors}
              onChange={setQuotationVendorId}
              getLabel={vendorLabel}
              getSearchText={(item) => `${item.code || ""} ${item.name || ""} ${item.email || ""} ${item.contact_person || ""}`}
              placeholder="พิมพ์ชื่อหรือรหัส Vendor"
            />
            <div className="quotation-rfq-list">
              {quotationLoading ? (
                <span>กำลังโหลด Vendor...</span>
              ) : quotationVendors.length ? (
                quotationVendors.map((row) => (
                  <div key={row.id}>
                    <b>{row.vendor_code ? `${row.vendor_code} · ` : ""}{row.vendor_name}</b>
                    <span>เพิ่มเมื่อ {formatAddedAt(row.added_at)}</span>
                    <span>เพิ่มโดย {row.added_by || "-"}</span>
                    <button
                      className="mini danger"
                      type="button"
                      disabled={quotationBusy}
                      onClick={() => removeQuotationVendor(row)}
                    >
                      ลบ
                    </button>
                  </div>
                ))
              ) : (
                <span>ยังไม่มี Vendor ใน Order Quotation</span>
              )}
            </div>
          </div>
          <button
            className="mini primary"
            type="button"
            disabled={quotationBusy || !quotationVendorId}
            onClick={addQuotationVendor}
          >
            {quotationBusy ? "..." : "+ เพิ่ม Vendor"}
          </button>
        </div>

        <div className="purchase-field">
          <label>VENDOR ORDER</label>
          <div>
            <SearchableSelect
              value={local.vendor_id || ""}
              options={vendorOrderOptions}
              onChange={(value) => set("vendor_id", value)}
              getLabel={vendorLabel}
              getSearchText={(item) => `${item.code || ""} ${item.name || ""} ${item.email || ""} ${item.contact_person || ""}`}
              placeholder={quotationVendors.length ? "เลือก Vendor จาก ORDER QUOTATION" : "เพิ่ม Vendor ใน ORDER QUOTATION ก่อน"}
              disabled={quotationLoading || !quotationVendors.length}
            />
            <span className="field-help">
              เลือกได้เฉพาะ Vendor ที่อยู่ใน ORDER QUOTATION · การลบ Vendor Order จะไม่ลบประวัติการขอราคา
            </span>
          </div>
          <div className="purchase-vendor-actions">
            <button
              className="mini"
              type="button"
              disabled={!!busy || quotationLoading || !quotationVendors.length || !local.vendor_id}
              onClick={() => saveField("vendor", { vendor_id: local.vendor_id })}
            >
              {busy === "vendor" ? "..." : vendor ? "แก้ไข" : "+ เพิ่ม"}
            </button>
            {savedVendorId && (
              <button
                className="mini danger"
                type="button"
                disabled={!!busy}
                onClick={removeVendorOrder}
              >
                {busy === "vendor" ? "..." : "ลบ Vendor Order"}
              </button>
            )}
          </div>
        </div>

        <div className="purchase-field po-group">
          <label>PO / ISSUE PR / DUE DATE</label>
          <input placeholder="PO Number" value={local.po_number || ""} onChange={(e) => set("po_number", e.target.value)} />
          <input type="date" value={local.issue_pr_date || ""} onChange={(e) => set("issue_pr_date", e.target.value)} />
          <input type="date" value={local.due_date || ""} onChange={(e) => set("due_date", e.target.value)} />
          <button
            className="mini"
            onClick={() => saveField("po", {
              po_number: local.po_number,
              issue_pr_date: local.issue_pr_date,
              due_date: local.due_date,
            })}
          >
            {busy === "po" ? "..." : "บันทึก 3 ช่อง"}
          </button>
        </div>

        <div className="purchase-field">
          <label>PRICE PER UNIT *</label>
          <div className="input-suffix">
            <input
              type="number"
              min="0.0001"
              step="0.01"
              value={local.price_per_unit ?? ""}
              onChange={(e) => set("price_per_unit", e.target.value)}
              placeholder="ระบุราคา"
            />
            <b>{local.currency || "THB"}</b>
          </div>
          <button
            className="mini"
            disabled={!hasPrice}
            onClick={() => saveField("price", { price_per_unit: local.price_per_unit })}
          >
            {busy === "price" ? "..." : "บันทึก"}
          </button>
        </div>

        <div className="purchase-field readonly">
          <label>PRICE TOTAL</label>
          <strong>
            {local.currency || "THB"} {money(Number(local.amount || 0) * Number(local.price_per_unit || 0))}
          </strong>
          <span>AMOUNT × Price / Unit</span>
        </div>

        <div className="purchase-field">
          <label>LEAD TIME *</label>
          <div className="input-suffix">
            <input
              type="number"
              min="0"
              value={local.lead_time_days ?? ""}
              onChange={(e) => set("lead_time_days", e.target.value)}
              placeholder="ระบุ Lead Time"
            />
            <b>DAY</b>
          </div>
          <button
            className="mini"
            disabled={!hasLeadTime}
            onClick={() => saveField("lead", { lead_time_days: local.lead_time_days })}
          >
            {busy === "lead" ? "..." : "บันทึก"}
          </button>
          <span className="field-help">สถานะจะเป็น Wait Issue P/R เมื่อมี VENDOR ORDER, Price Per Unit และ Lead Time ครบ</span>
        </div>

        <div className="purchase-field">
          <label>VENDOR CONFIRM DATE</label>
          <input type="date" value={local.vendor_confirm_date || ""} onChange={(e) => set("vendor_confirm_date", e.target.value)} />
          <button className="mini" onClick={() => saveField("confirm", { vendor_confirm_date: local.vendor_confirm_date })}>
            {busy === "confirm" ? "..." : "บันทึก"}
          </button>
        </div>

        <div className="purchase-field">
          <label>PERSON IN CHARGE OF ORDER</label>
          <SearchableSelect
            value={local.person_in_charge_id || ""}
            options={options.employees || []}
            onChange={(value) => set("person_in_charge_id", value)}
            getLabel={(item) => item.name}
            getSearchText={(item) => `${item.employee_code || ""} ${item.name || ""} ${item.department || ""}`}
            placeholder="พิมพ์ชื่อพนักงาน"
          />
          <button className="mini" onClick={() => saveField("pic", { person_in_charge_id: local.person_in_charge_id })}>
            {busy === "pic" ? "..." : person ? "แก้ไข" : "+ เพิ่ม"}
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>
      <div className="system-box">
        <div><span>WORKFLOW STATUS</span><strong>{local.status}</strong></div>
        <div><span>LIFECYCLE</span><strong>{local.lifecycle_status || "ACTIVE"}</strong></div>
        <div><span>DISPLAY STATUS</span><strong>{displayOrderStatus(local)}</strong></div>
        <div><span>EDIT DATA STATUS</span><strong>{local.edit_data_status || "-"}</strong></div>
        <div><span>GROUP ORDER</span><strong>{local.group_order || "-"}</strong></div>
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>ปิด</button>
      </div>
    </Modal>
  );
}

