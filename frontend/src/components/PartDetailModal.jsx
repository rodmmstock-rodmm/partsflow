import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { Alert, Modal, PartImage, fmt, money } from "./Common";

function dateText(value, withTime = false) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("th-TH", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

function Info({ label, children }) {
  return <div className="part-detail-info"><span>{label}</span><b>{children ?? "-"}</b></div>;
}

function Section({ title, count, children }) {
  return <section className="part-detail-section">
    <div className="part-detail-section-head"><h3>{title}</h3>{count !== undefined && <span>{count} รายการ</span>}</div>
    {children}
  </section>;
}

export default function PartDetailModal({ part, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    apiGet(`/parts/${part.id}/`, { forceRefresh: true })
      .then((data) => alive && setDetail(data))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [part.id]);

  const p = detail || part;
  return <Modal title={`รายละเอียดอะไหล่ · ${p.sku || ""}`} onClose={onClose} wide>
    <Alert>{error}</Alert>
    {loading ? <div className="empty">กำลังโหลดรายละเอียด...</div> : <div className="part-detail-shell">
      <div className="part-detail-hero">
        <div className="part-detail-image"><PartImage src={p.image_url || p.image_path} fallbackSrc={p.image_fallback_url} alt={p.name}/></div>
        <div className="part-detail-title">
          <div className="m-card-code">{p.sku}</div>
          <h2>{p.name}</h2>
          <p>{p.description || "-"}</p>
          <div className="part-detail-badges">
            <span className={`stock-state ${p.stock_status || "normal"}`}>{p.stock_status_label || "normal"}</span>
            {p.critical && <span className="status danger">Critical</span>}
            <span className={`status ${p.active ? "success" : "muted"}`}>{p.active ? "Active" : "Inactive"}</span>
          </div>
        </div>
        <div className="part-detail-stock">
          <span>Stock คงเหลือ</span>
          <strong>{fmt(p.stock_qty)}</strong>
          <small>{p.unit_code || ""} · Min {fmt(p.min_stock)}</small>
        </div>
      </div>

      <Section title="ข้อมูลหลัก">
        <div className="part-detail-grid">
          <Info label="Warehouse">{p.warehouse_label || p.warehouse || "-"}</Info>
          <Info label="Location">{p.location_code || "-"}</Info>
          <Info label="Maker">{p.maker_name || "-"}</Info>
          <Info label="Category">{p.category_name || "-"}</Info>
          <Info label="Unit">{p.unit_code || "-"}</Info>
          <Info label="Vendor หลัก">{p.supplier_name || "-"}</Info>
          <Info label="Min Stock">{fmt(p.min_stock)}</Info>
          <Info label="จำนวนที่ Order">{fmt(p.reorder_qty)}</Info>
          <Info label="Vendor Lead Time">{fmt(p.vendor_lead_time_days)} วัน</Info>
          <Info label="Purchasing Lead Time">{fmt(p.purchasing_lead_time_days)} วัน</Info>
          <Info label="Total Lead Time">{fmt(p.total_lead_time_days)} วัน</Info>
          <Info label="Last Purchase Price">฿ {money(p.last_purchase_price)}</Info>
        </div>
        {p.remark && <div className="part-detail-note"><b>Remark</b><p>{p.remark}</p></div>}
      </Section>

      <Section title="Stock แยกตาม Location" count={(p.inventory_locations || []).length}>
        {(p.inventory_locations || []).length === 0 ? <div className="empty compact">ไม่มีข้อมูล</div> :
          <div className="detail-table-wrap"><table><thead><tr><th>Warehouse</th><th>Location</th><th>Stock</th><th>Updated</th></tr></thead><tbody>
            {p.inventory_locations.map(x => <tr key={x.id}><td>{x.warehouse || "-"}</td><td>{x.location_code || "-"}</td><td><b>{fmt(x.quantity)}</b> {p.unit_code}</td><td>{dateText(x.updated_at, true)}</td></tr>)}
          </tbody></table></div>}
      </Section>

      <Section title="เครื่องจักรที่ใช้อะไหล่นี้" count={(p.machines || []).length}>
        {(p.machines || []).length === 0 ? <div className="empty compact">ยังไม่ได้ผูก Machine</div> :
          <div className="detail-table-wrap"><table><thead><tr><th>Machine</th><th>ชื่อเครื่อง</th><th>Qty / Machine</th><th>Position</th><th>Critical</th></tr></thead><tbody>
            {p.machines.map(x => <tr key={x.id}><td><b>{x.code}</b></td><td>{x.name}</td><td>{fmt(x.quantity_per_machine)}</td><td>{x.position || "-"}</td><td>{x.is_critical ? "Yes" : "-"}</td></tr>)}
          </tbody></table></div>}
      </Section>

      <Section title="Vendor / Supplier" count={(p.suppliers || []).length}>
        {(p.suppliers || []).length === 0 ? <div className="empty compact">ยังไม่มี Supplier Link</div> :
          <div className="detail-table-wrap"><table><thead><tr><th>Vendor</th><th>Supplier Part No.</th><th>ราคา</th><th>Lead Time</th><th>MOQ</th><th>Preferred</th></tr></thead><tbody>
            {p.suppliers.map(x => <tr key={x.id}><td><b>{x.code}</b> · {x.name}</td><td>{x.supplier_part_no || "-"}</td><td>{x.currency} {money(x.unit_price)}</td><td>{fmt(x.lead_time_days)} วัน</td><td>{fmt(x.minimum_order_qty)}</td><td>{x.is_preferred ? "✓" : "-"}</td></tr>)}
          </tbody></table></div>}
      </Section>

      <Section title="Machine Spare Sets ที่ใช้อะไหล่นี้" count={(p.spare_sets || []).length}>
        {(p.spare_sets || []).length === 0 ? <div className="empty compact">ยังไม่ได้อยู่ใน Spare Set</div> :
          <div className="detail-table-wrap"><table><thead><tr><th>Machine</th><th>ชื่อเครื่อง</th><th>Set</th><th>Qty / Set</th><th>Remark</th></tr></thead><tbody>
            {p.spare_sets.map((x, index) => <tr key={`${x.id}-${index}`}><td><b>{x.machine_code}</b></td><td>{x.machine_name || "-"}</td><td>{x.name}</td><td>{fmt(x.quantity)} {p.unit_code}</td><td>{x.remark || "-"}</td></tr>)}
          </tbody></table></div>}
      </Section>

      <Section title="Order ล่าสุด" count={(p.recent_orders || []).length}>
        {(p.recent_orders || []).length === 0 ? <div className="empty compact">ยังไม่มี Order</div> :
          <div className="detail-table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Machine</th><th>Qty</th><th>Status</th><th>PO</th><th>Vendor</th></tr></thead><tbody>
            {p.recent_orders.map(x => <tr key={x.id}><td>{x.date || "-"}</td><td><b>{x.order_number}</b></td><td>{x.machine_code || x.machine_name || "-"}</td><td>{fmt(x.amount)}</td><td>{x.status}</td><td>{x.po_number || "-"}</td><td>{x.vendor_name || "-"}</td></tr>)}
          </tbody></table></div>}
      </Section>

      <Section title="ประวัติ Stock ล่าสุด" count={(p.recent_transactions || []).length}>
        {(p.recent_transactions || []).length === 0 ? <div className="empty compact">ยังไม่มี Transaction</div> :
          <div className="detail-table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Machine</th><th>ผู้เบิก</th><th>ผู้บันทึก</th><th>Remark</th></tr></thead><tbody>
            {p.recent_transactions.map(x => <tr key={x.id}><td>{dateText(x.transaction_date, true)}</td><td>{x.transaction_type}</td><td><b>{fmt(x.quantity)}</b></td><td>{x.machine_code || "-"}</td><td>{x.employee || "-"}</td><td>{x.recorded_by || "-"}</td><td>{x.remark || "-"}</td></tr>)}
          </tbody></table></div>}
      </Section>

      <Section title="ประวัติราคา" count={(p.price_history || []).length}>
        {(p.price_history || []).length === 0 ? <div className="empty compact">ยังไม่มี Price History</div> :
          <div className="detail-table-wrap"><table><thead><tr><th>Date</th><th>Vendor</th><th>ราคา/หน่วย</th><th>Source</th></tr></thead><tbody>
            {p.price_history.map(x => <tr key={x.id}><td>{x.purchase_date || "-"}</td><td>{x.supplier_name || "-"}</td><td>{x.currency} {money(x.unit_price)}</td><td>{x.source_type || "-"} {x.source_id || ""}</td></tr>)}
          </tbody></table></div>}
      </Section>
    </div>}
  </Modal>;
}
