import { useState } from "react";
import { apiPatch } from "../api";
import { Alert, Modal, SearchableSelect, money } from "./Common";

function displayOrderStatus(order) {
  if (order?.lifecycle_status === "WAIT_CONFIRM") return "Wait Confirm Order";
  return order?.display_status || order?.status || "New Order";
}

export default function NormalPurchaseModal({ order, options, onClose, onChanged }) {
  const [local, setLocal] = useState({ ...order });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const set = (key, value) => setLocal((current) => ({ ...current, [key]: value }));

  async function saveField(key, payload) {
    setBusy(key);
    setError("");
    try {
      const result = await apiPatch(`/orders/${order.id}/purchase/`, payload);
      setLocal(result);
      onChanged?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const vendor = (options.vendors || []).find((item) => item.id === local.vendor_id);
  const person = (options.employees || []).find((item) => item.id === local.person_in_charge_id);

  return (
    <Modal title={`Purchase Information · ${order.order_number}`} onClose={onClose} wide>
      <div className="section-label">2. Purchase Information</div>
      <p className="helper">
        Normal Order ใช้รายชื่อ Vendor หลายรายแยกจากหน้านี้ แล้วเลือก Vendor ที่สั่งจริงใน VENDOR ORDER
      </p>

      <div className="purchase-list">
        <div className="purchase-field">
          <label>VENDOR ORDER</label>
          <div>
            <SearchableSelect
              value={local.vendor_id || ""}
              options={options.vendors || []}
              onChange={(value) => set("vendor_id", value)}
              getLabel={(item) => `${item.code ? `${item.code} · ` : ""}${item.name}`}
              getSearchText={(item) => `${item.code || ""} ${item.name || ""} ${item.email || ""} ${item.contact_person || ""}`}
              placeholder="พิมพ์ชื่อหรือรหัส Vendor"
            />
          </div>
          <button className="mini" onClick={() => saveField("vendor", { vendor_id: local.vendor_id })}>
            {busy === "vendor" ? "..." : vendor ? "แก้ไข" : "+ เพิ่ม"}
          </button>
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
          <label>PRICE PER UNIT</label>
          <div className="input-suffix">
            <input
              type="number"
              min="0"
              step="0.01"
              value={local.price_per_unit || 0}
              onChange={(e) => set("price_per_unit", e.target.value)}
            />
            <b>{local.currency || "THB"}</b>
          </div>
          <button className="mini" onClick={() => saveField("price", { price_per_unit: local.price_per_unit })}>
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
          <label>LEAD TIME</label>
          <div className="input-suffix">
            <input type="number" min="0" value={local.lead_time_days ?? ""} onChange={(e) => set("lead_time_days", e.target.value)} />
            <b>DAY</b>
          </div>
          <button className="mini" onClick={() => saveField("lead", { lead_time_days: local.lead_time_days })}>
            {busy === "lead" ? "..." : "บันทึก"}
          </button>
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
