import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, fmt, formatDMY, money } from "../components/Common";
import { OrderInfoModal, PurchaseModal } from "../pages/Orders";
import RFQComposeModal from "../components/RFQComposeModal";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

const TABS = [
  ["normal", "Active"],
  ["updates", "Update"],
  ["confirm", "Wait"],
  ["completed", "Complete"],
  ["cancelled", "Cancelled"],
  ["deleted", "Deleted"],
];
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function pad(value) {
  return String(value).padStart(2, "0");
}

function monthRange(year, month) {
  const last = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(last)}`,
  };
}

function orderStatus(order) {
  if (order.lifecycle_status === "WAIT_CONFIRM") return "Wait Confirm Order";
  if (order.lifecycle_status === "CANCELLED") return "Cancelled";
  if (order.lifecycle_status === "COMPLETED") return "Complete Order";
  return order.display_status || order.status || "New Order";
}

function isAdmin(employee) {
  return ["admin", "administrator"].includes(
    String(employee?.role || "").trim().toLowerCase()
  );
}

function MobileOrderDetail({ order, auth, admin, tab, busy, onClose, onEdit, onPurchase, onAction }) {
  return (
    <Modal title={`รายละเอียด Order · ${order.order_number}`} onClose={onClose}>
      <div className="m-order-detail-v9">
        <div className="m-order-detail-hero-v9">
          <span>{order.item_id || "-"}</span>
          <h3>{order.part_name || "-"}</h3>
          <p>{order.part_detail || "-"}</p>
          <b>{fmt(order.amount)} {order.unit || ""}</b>
          <strong>{orderStatus(order)}</strong>
        </div>

        <div className="m-order-detail-grid-v9">
          <div><span>วันที่</span><b>{formatDMY(order.date)}</b></div>
          <div><span>Factory</span><b>{order.factory === "MM-11" ? "Phase11" : "Phase4"}</b></div>
          <div><span>Machine</span><b>{order.machine_name || order.machine_code || "-"}</b></div>
          <div><span>Job</span><b>{order.job || "-"}</b></div>
          <div><span>Maker</span><b>{order.maker || "-"}</b></div>
          <div><span>Vendor</span><b>{order.vendor_name || "-"}</b></div>
          <div><span>PO</span><b>{order.po_number || "-"}</b></div>
          <div><span>RFQ</span><b>{order.rfq_count ? `RFQ ${fmt(order.rfq_count)}` : (order.quotation || "-")}</b></div>
          <div><span>ราคาต่อหน่วย</span><b>{order.price_per_unit ? `${order.currency || "THB"} ${money(order.price_per_unit)}` : "-"}</b></div>
          <div><span>ราคารวม</span><b>{order.price_total ? `${order.currency || "THB"} ${money(order.price_total)}` : "-"}</b></div>
          <div><span>Issue PR</span><b>{formatDMY(order.issue_pr_date)}</b></div>
          <div><span>Due date</span><b>{formatDMY(order.due_date)}</b></div>
          <div><span>PIC</span><b>{order.person_in_charge || "-"}</b></div>
          <div><span>ผู้สั่ง</span><b>{order.ordered_by || "-"}</b></div>
        </div>

        {order.remark && <div className="m-order-note-v9"><span>Remark</span><p>{order.remark}</p></div>}

        {admin && (
          <div className="m-order-admin-v9">
            <b>Admin · Workflow / Internal</b>
            <span>Workflow: {order.status || "-"}</span>
            <span>Lifecycle: {order.lifecycle_status || "-"}</span>
            <span>Edit status: {order.edit_data_status || "-"}</span>
            <span>Group: {order.group_order || "-"}</span>
          </div>
        )}

        <div className="m-order-actions">
          {tab === "updates" && auth.can("can_update_edit_data") && (
            <button onClick={() => onAction(order, "update")} disabled={!!busy}>Update Data</button>
          )}
          {auth.can("can_edit_order_info") && ["ACTIVE", "WAIT_CONFIRM"].includes(order.lifecycle_status) && (
            <button onClick={() => onEdit(order)}>แก้ Order</button>
          )}
          {auth.can("can_edit_purchase_info") && ["ACTIVE", "WAIT_CONFIRM"].includes(order.lifecycle_status) && (
            <button onClick={() => onPurchase(order)}>Purchase</button>
          )}
          {order.lifecycle_status === "ACTIVE" && auth.can("can_edit_purchase_info") && (
            <button onClick={() => onAction(order, "wait")} disabled={!!busy}>Wait Confirm</button>
          )}
          {order.lifecycle_status === "WAIT_CONFIRM" && auth.can("can_edit_purchase_info") && (
            <button onClick={() => onAction(order, "cancelwait")} disabled={!!busy}>ยกเลิก Wait</button>
          )}
          {["ACTIVE", "WAIT_CONFIRM"].includes(order.lifecycle_status) && auth.can("can_receive_order") && (
            <button className="receive" onClick={() => onAction(order, "receive")} disabled={!!busy}>รับของ</button>
          )}
          {["ACTIVE", "WAIT_CONFIRM"].includes(order.lifecycle_status) && auth.can("can_cancel_order") && (
            <button className="danger" onClick={() => onAction(order, "cancel")} disabled={!!busy}>ยกเลิก</button>
          )}
          {order.lifecycle_status === "CANCELLED" && auth.can("can_cancel_order") && (
            <button onClick={() => onAction(order, "restore")} disabled={!!busy}>คืนรายการ</button>
          )}
          {tab === "deleted" && auth.can("can_view_deleted_orders") && (
            <button onClick={() => onAction(order, "restore_deleted")} disabled={!!busy}>กู้คืน</button>
          )}
          {auth.can("can_delete_order") && tab !== "deleted" && (
            <button className="danger" onClick={() => onAction(order, "delete")} disabled={!!busy}>ลบ</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function MobileOrders() {
  const auth = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [rows, setRows] = useState([]);
  const [kpi, setKpi] = useState({});
  const [options, setOptions] = useState({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [job, setJob] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [tab, setTab] = useState("normal");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editor, setEditor] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [rfqCompose, setRfqCompose] = useState(false);
  const range = useMemo(() => monthRange(year, month), [year, month]);
  const admin = isAdmin(auth.employee);

  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({
        view: tab,
        q: "",
        urgency,
        job,
        status,
        date_from: range.from,
        date_to: range.to,
      });
      const data = await apiGet(`/orders/?${p}`, { forceRefresh: force, cache: false });
      setRows(data.results || []);
      setKpi(data.kpi || {});
    } catch (err) {
      setRows([]);
      setKpi({});
      setError(err.message);
    }

    try {
      const data = await apiGet("/options/", { forceRefresh: force });
      setOptions(data || {});
    } catch {
      setOptions({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelected(new Set());
    setDetail(null);
    load();
  }, [tab, status, job, urgency, range.from, range.to]);

  const shown = useMemo(
    () => rows.filter((order) =>
      !q || `${order.order_number} ${order.item_id} ${order.part_name}`
        .toLowerCase()
        .includes(q.toLowerCase())
    ),
    [rows, q]
  );
  const selectedRows = shown.filter((order) => selected.has(order.id));

  function toggle(id, checked) {
    setSelected((current) => {
      const next = new Set(current);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function act(row, action) {
    if (busy) return;
    let ok = true;
    let reason = "";
    if (action === "receive") ok = confirm(`ยืนยันรับ ${row.order_number}?`);
    if (action === "wait") ok = confirm(`เปลี่ยน ${row.order_number} เป็น Wait Confirm?`);
    if (action === "cancelwait") ok = confirm(`ยกเลิก Wait Confirm ${row.order_number}?`);
    if (action === "cancel") {
      ok = confirm(`ยกเลิก ${row.order_number}?`);
      if (ok) reason = prompt("เหตุผลการยกเลิก", "") || "";
    }
    if (action === "restore") ok = confirm(`คืนรายการ ${row.order_number}?`);
    if (action === "restore_deleted") ok = confirm(`กู้คืน ${row.order_number}?`);
    if (action === "delete") ok = confirm(`ลบ ${row.order_number} ถาวร?`);
    if (action === "update") ok = confirm(`ยืนยันอัปเดตข้อมูล ${row.order_number}?`);
    if (!ok) return;

    setBusy(row.id + action);
    setError("");
    try {
      if (action === "receive") await apiPost(`/orders/${row.id}/receive/`, {});
      if (action === "wait") await apiPost(`/orders/${row.id}/wait-confirm/`, { wait_confirm: true });
      if (action === "cancelwait") await apiPost(`/orders/${row.id}/wait-confirm/`, { wait_confirm: false });
      if (action === "cancel") await apiPost(`/orders/${row.id}/cancel/`, { cancel: true, reason });
      if (action === "restore") await apiPost(`/orders/${row.id}/cancel/`, { cancel: false });
      if (action === "restore_deleted") await apiPost(`/orders/${row.id}/restore/`, {});
      if (action === "delete") await apiDelete(`/orders/${row.id}/delete/`);
      if (action === "update") await apiPost(`/orders/${row.id}/update-data/`, {});
      setDetail(null);
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <MobilePage
      title="Order"
      subtitle={`${MONTHS[month]} ${year} · โหลดเฉพาะเดือนที่เลือก`}
      actions={(
        <div className="m-page-actions">
          {auth.can("can_add_order") && tab === "normal" && (
            <button className="m-icon-action" onClick={() => setEditor({ order: null })}>＋</button>
          )}
          <button className="m-icon-action" onClick={() => load(true)}>↻</button>
        </div>
      )}
    >
      <Alert>{error}</Alert>

      <div className="m-kpi-row">
        <div><span>เดือนนี้</span><b>{fmt(kpi.total || rows.length)}</b></div>
        <div className="warning"><span>เร่งด่วน</span><b>{fmt(kpi.urgent || 0)}</b></div>
        <div className="danger"><span>ค้าง DATA</span><b>{fmt(kpi.pending || 0)}</b></div>
      </div>

      <div className="m-segment wide">
        {TABS.filter(([key]) =>
          (key !== "updates" || auth.can("can_view_order_updates")) &&
          (key !== "deleted" || auth.can("can_view_deleted_orders"))
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(key);
              setQ("");
              setStatus("");
              setUrgency("all");
              setSelected(new Set());
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="m-month-nav-v9">
        <div>
          <button onClick={() => setYear((value) => value - 1)}>‹</button>
          <b>{year}</b>
          <button onClick={() => setYear((value) => value + 1)}>›</button>
        </div>
        <div className="m-month-tabs-v9">
          {MONTHS.map((label, index) => (
            <button
              key={label}
              className={month === index ? "active" : ""}
              onClick={() => setMonth(index)}
            >
              {label}
              {year === now.getFullYear() && index === now.getMonth() && <small>ปัจจุบัน</small>}
            </button>
          ))}
        </div>
      </div>

      <MobileSearch value={q} onChange={setQ} placeholder="Order / Part ID / Part..." />

      {tab === "normal" && (
        <div className="m-filter-row m-filter-row-wide">
          <select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="all">สถานะงานด่วน: ทั้งหมด</option>
            <option value="urgent">งานด่วน</option>
            <option value="urgent_pending">งานด่วน + ค้าง DATA</option>
            <option value="pending">งานค้าง DATA</option>
            <option value="normal">รายการทั่วไป</option>
          </select>
          <select value={job} onChange={(event) => setJob(event.target.value)}>
            <option value="">ทุก JOB</option>
            <option>REPAIR</option><option>MODIFY</option><option>AUTOMATION</option><option>PM</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option>New Order</option><option>Wait Quotation</option><option>Wait Issue P/R</option><option>Wait for Item</option>
          </select>
        </div>
      )}

      {selectedRows.length > 0 && (
        <div className="m-rfq-selection">
          <b>เลือกแล้ว {selectedRows.length} รายการ</b>
          <button onClick={() => setRfqCompose(true)}>บันทึกขอราคา</button>
          <button onClick={() => setSelected(new Set())}>ล้าง</button>
        </div>
      )}

      {loading ? (
        <MobileLoading text={`กำลังโหลด ${MONTHS[month]} ${year}...`} />
      ) : shown.length === 0 ? (
        <MobileEmpty text="ไม่พบ Order ในเดือนนี้" />
      ) : (
        <div className="m-card-list">
          {shown.map((order) => (
            <article className={`m-order-card m-order-card-v9 ${selected.has(order.id) ? "selected" : ""}`} key={order.id}>
              {auth.can("can_edit_purchase_info") && ["ACTIVE", "WAIT_CONFIRM"].includes(order.lifecycle_status) && (
                <label className="m-rfq-check">
                  <input
                    type="checkbox"
                    checked={selected.has(order.id)}
                    onChange={(event) => toggle(order.id, event.target.checked)}
                  />
                  เลือก
                </label>
              )}
              <div className="m-row-between">
                <b>{order.order_number}</b>
                <span className={`m-order-life ${String(order.lifecycle_status || order.status).toLowerCase().replaceAll("_", "-")}`}>
                  {orderStatus(order)}
                </span>
              </div>
              <div className="m-order-item">
                <b>{order.item_id || "-"}</b>
                <h3>{order.part_name || "-"}</h3>
              </div>
              <div className="m-order-main-v9">
                <span>จำนวน <b>{fmt(order.amount)} {order.unit || ""}</b></span>
                <button onClick={() => setDetail(order)}>รายละเอียด</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {detail && (
        <MobileOrderDetail
          order={detail}
          auth={auth}
          admin={admin}
          tab={tab}
          busy={busy}
          onClose={() => setDetail(null)}
          onEdit={(order) => { setDetail(null); setEditor({ order }); }}
          onPurchase={(order) => { setDetail(null); setPurchase(order); }}
          onAction={act}
        />
      )}
      {editor && (
        <OrderInfoModal
          order={editor.order}
          project={null}
          step={null}
          options={options}
          employee={auth.employee}
          canEditOrderDate={auth.can("can_edit_order_date")}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(true); }}
        />
      )}
      {purchase && (
        <PurchaseModal
          order={purchase}
          options={options}
          onClose={() => setPurchase(null)}
          onChanged={(result) => { setPurchase(result); load(true); }}
        />
      )}
      {rfqCompose && (
        <RFQComposeModal
          orders={selectedRows}
          options={options}
          onClose={() => setRfqCompose(false)}
          onRecorded={() => { setRfqCompose(false); setSelected(new Set()); load(true); }}
        />
      )}
    </MobilePage>
  );
}
