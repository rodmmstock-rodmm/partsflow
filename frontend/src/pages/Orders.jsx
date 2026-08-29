import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, fmt, money } from "../components/Common";

const ORDER_TABS = [
  ["normal", "Order Normal"],
  ["updates", "รายการที่ต้องอัพเดต"],
  ["confirm", "Wait Confirm Order"],
  ["completed", "Completed Order"],
  ["cancelled", "Cancelled Order"],
];

const STATUS = [
  "New Order",
  "Wait Quotation",
  "Wait Issue P/R",
  "Wait for Item",
  "Complete Order",
];

const URGENT = [
  "งานด่วนเครื่องหยุด",
  "งานด่วนเครื่องไม่หยุด",
  "งานด่วน + ค้าง DATA",
];

const STEP_HEADERS = [
  "DATE",
  "FACTORY",
  "MACHINE NAME",
  "ITEM ID",
  "PART NAME",
  "PART DETAIL",
  "MAKER",
  "AMOUNT",
  "UNIT",
  "REMARK",
  "ORDERED BY",
  "QUOTATION",
  "PO NUMBER",
  "PRICE PER UNIT",
  "VENDOR ORDER",
  "LEAD TIME",
  "ISSUE PR DATE",
  "DUE DATE",
  "VENDOR CONFIRM DATE",
  "PERSON IN CHARGE OF ORDER",
];

function findLabel(list, text, kind) {
  const t = String(text || "").trim().toLowerCase();
  return (list || []).find((x) => {
    const label =
      kind === "employee"
        ? `${x.name}`
        : kind === "machine"
          ? `${x.name}`
          : kind === "part"
            ? `${x.sku} · ${x.name}`
            : `${x.code} · ${x.name}`;
    const code =
      kind === "employee"
        ? x.employee_code
        : kind === "part"
          ? x.sku
          : x.code;
    return (
      label.toLowerCase() === t ||
      String(code || "").toLowerCase() === t ||
      String(x.name || "").toLowerCase() === t
    );
  });
}

function displayOrderStatus(order) {
  if (order?.lifecycle_status === "WAIT_CONFIRM") {
    return "Wait Confirm Order";
  }
  return order?.display_status || order?.status || "New Order";
}

function statusClass(status) {
  if (status === "Complete Order") return "success";
  if (status === "Wait for Item") return "warning";
  if (status === "Wait Confirm Order") return "confirm";
  if (status === "Wait Issue P/R") return "info";
  if (status === "Wait Quotation") return "info";
  return "muted";
}

export function OrderInfoModal({
  order,
  project,
  step,
  options,
  employee,
  onClose,
  onSaved,
}) {
  const edit = !!order?.id;
  const stockLocked = !!order?.received_at && !!order?.stock_received;
  const today = new Date().toISOString().slice(0, 10);
  const projectJob = project?.department || "";
  const isProjectOrder = !!project;

  const initial = {
    date: order?.date || today,
    factory: order?.factory || "MM-4",
    machineText: order?.machine_id ? `${order.machine_name}` : "",
    job: order?.job || projectJob || "",
    urgent_status: order?.urgent_status || "",
    pending_data_date: order?.pending_data_date || "",
    partText: order?.part_id
      ? `${order.item_id} · ${order.part_name}`
      : "",
    part_id: order?.part_id || "",
    part_name: order?.part_name || "",
    part_detail: order?.part_detail || "",
    maker: order?.maker || "",
    amount: order?.amount || 1,
    unit: order?.unit || "",
    remark: order?.remark || "",
    orderedByText: order?.ordered_by_id
      ? `${order.ordered_by || ""}`
      : employee?.name || "",
  };

  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));

  function partChange(value) {
    const part = findLabel(options.parts, value, "part");
    if (part) {
      setForm((x) => ({
        ...x,
        partText: value,
        part_id: part.id,
        part_name: part.name,
        part_detail: part.description || "",
        maker: part.maker_name || "",
        unit: part.unit_code || "",
      }));
    } else {
      setForm((x) => ({ ...x, partText: value, part_id: "" }));
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const machine = findLabel(options.machines, form.machineText, "machine");
      const ordered = findLabel(
        options.employees,
        form.orderedByText,
        "employee"
      );
      if (!machine) throw new Error("กรุณาเลือก MACHINE NAME จากรายการ");
      if (!ordered) throw new Error("กรุณาเลือกชื่อผู้สั่งจากรายการ");

      const payload = {
        date: form.date,
        factory: form.factory,
        machine_id: machine.id,
        job: isProjectOrder ? projectJob : form.job,
        urgent_status: isProjectOrder ? "" : form.urgent_status,
        pending_data_date: isProjectOrder
          ? (project?.pending_data_date || "")
          : form.pending_data_date,
        part_id: form.part_id,
        part_name: form.part_name,
        part_detail: form.part_detail,
        maker: form.maker,
        amount: form.amount,
        unit: form.unit,
        remark: form.remark,
        ordered_by_id: ordered.id,
      };

      let result;
      if (edit) {
        result = await apiPatch(`/orders/${order.id}/info/`, payload);
      } else if (project?.id && step?.id) {
        result = await apiPost(
          `/order-projects/${project.id}/steps/${step.id}/orders/`,
          payload
        );
      } else if (project?.id) {
        throw new Error("กรุณาเลือก Step ก่อนเพิ่ม Order");
      } else {
        result = await apiPost("/orders/", payload);
      }
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={
        edit
          ? "แก้ไข Order Information"
          : project
            ? `เพิ่ม Order · ${project.name} · Step ${step?.step_no || "-"}`
            : "เพิ่ม Order"
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <div className="section-label">1. Order Information</div>
        {project && !edit && (
          <div className="alert success">
            รายการนี้จะถูกเพิ่มเข้า Project {project.name} ({project.department})
            {step ? ` · Step ${step.step_no}` : ""}
          </div>
        )}
        {stockLocked && (
          <div className="alert success">
            รายการนี้รับเข้า Stock แล้ว: Item ID, JOB และ AMOUNT ถูกล็อก
          </div>
        )}

        <div className="form-grid three">
          <label className="field">
            <span>DATE *</span>
            <input type="date" readOnly value={form.date} />
          </label>

          <label className="field">
            <span>FACTORY *</span>
            <select
              value={form.factory}
              onChange={(e) => set("factory", e.target.value)}
            >
              <option value="MM-4">Phase4</option>
              <option value="MM-11">Phase11</option>
            </select>
          </label>

          <label className="field">
            <span>MACHINE NAME *</span>
            <input
              list="ord-machines"
              value={form.machineText}
              onChange={(e) => set("machineText", e.target.value)}
            />
            <datalist id="ord-machines">
              {(options.machines || []).map((x) => (
                <option key={x.id} value={x.name} />
              ))}
            </datalist>
          </label>

          {isProjectOrder ? (
            <>
              <label className="field">
                <span>JOB</span>
                <input
                  readOnly
                  value={projectJob}
                />
              </label>
              <label className="field">
                <span>วันที่งานค้างของ Project</span>
                <input
                  type="date"
                  readOnly
                  value={project?.pending_data_date || ""}
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>JOB *</span>
                <select
                  required
                  disabled={stockLocked}
                  value={form.job}
                  onChange={(e) => set("job", e.target.value)}
                >
                  <option value="">เลือก JOB</option>
                  {(options.jobs || []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>สถานะงานด่วน</span>
                <select
                  value={form.urgent_status}
                  onChange={(e) => set("urgent_status", e.target.value)}
                >
                  <option value="">-</option>
                  {URGENT.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>วันที่งานค้าง</span>
                <input
                  type="date"
                  value={form.pending_data_date}
                  onChange={(e) => set("pending_data_date", e.target.value)}
                />
              </label>
            </>
          )}

          <label className="field span3">
            <span>Item ID (ไม่บังคับ)</span>
            <input
              disabled={stockLocked}
              list="ord-parts"
              value={form.partText}
              onChange={(e) => partChange(e.target.value)}
            />
            <datalist id="ord-parts">
              {(options.parts || []).map((x) => (
                <option key={x.id} value={`${x.sku} · ${x.name}`} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>Part Name *</span>
            <input
              required
              value={form.part_name}
              readOnly={!!form.part_id}
              onChange={(e) => set("part_name", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Part Detail *</span>
            <input
              required
              value={form.part_detail}
              readOnly={!!form.part_id}
              onChange={(e) => set("part_detail", e.target.value)}
            />
          </label>

          <label className="field">
            <span>MAKER *</span>
            <input
              required
              value={form.maker}
              readOnly={!!form.part_id}
              onChange={(e) => set("maker", e.target.value)}
            />
          </label>

          <label className="field">
            <span>AMOUNT *</span>
            <input
              disabled={stockLocked}
              type="number"
              min="1"
              step="1"
              required
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </label>

          <label className="field">
            <span>UNIT *</span>
            <select
              value={form.unit}
              disabled={!!form.part_id}
              onChange={(e) => set("unit", e.target.value)}
              required
            >
              <option value="">-</option>
              {(options.units || []).map((x) => (
                <option key={x.id} value={x.code}>
                  {x.code}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>ชื่อผู้สั่ง *</span>
            <input
              list="ord-employees"
              value={form.orderedByText}
              onChange={(e) => set("orderedByText", e.target.value)}
            />
            <datalist id="ord-employees">
              {(options.employees || []).map((x) => (
                <option key={x.id} value={x.name} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>ชื่อผู้บันทึก</span>
            <input readOnly value={employee?.name || ""} />
          </label>

          <label className="field span3">
            <span>Remark</span>
            <textarea
              rows="2"
              value={form.remark}
              onChange={(e) => set("remark", e.target.value)}
            />
          </label>
        </div>

        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "กำลังบันทึก..." : "บันทึก Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PurchaseModal({ order, options, onClose, onChanged }) {
  const [local, setLocal] = useState({ ...order });
  const [vendorText, setVendorText] = useState(
    order.vendor_id ? `${order.vendor_code} · ${order.vendor_name}` : ""
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const set = (k, v) => setLocal((x) => ({ ...x, [k]: v }));

  async function saveField(key, payload) {
    setBusy(key);
    setError("");
    try {
      const result = await apiPatch(`/orders/${order.id}/purchase/`, payload);
      setLocal(result);
      onChanged(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const vendor = (options.vendors || []).find((x) => x.id === local.vendor_id);
  const person = (options.employees || []).find(
    (x) => x.id === local.person_in_charge_id
  );

  return (
    <Modal
      title={`Purchase Information · ${order.order_number}`}
      onClose={onClose}
      wide
    >
      <div className="section-label">2. Purchase Information</div>
      <p className="helper">
        ลำดับ Workflow: Quotation → Vendor Order → PO Number + ISSUE PR DATE +
        DUE DATE
      </p>

      <div className="purchase-list">
        <div className="purchase-field">
          <label>Quotation</label>
          <input
            value={local.quotation || ""}
            onChange={(e) => set("quotation", e.target.value)}
          />
          <button
            className="mini"
            onClick={() => saveField("quotation", { quotation: local.quotation })}
          >
            {busy === "quotation" ? "..." : "บันทึก"}
          </button>
        </div>

        <div className="purchase-field">
          <label>VENDOR ORDER</label>
          <div>
            <input
              list="purchase-vendors"
              value={vendorText}
              onChange={(e) => {
                setVendorText(e.target.value);
                const v = findLabel(options.vendors, e.target.value, "vendor");
                set("vendor_id", v?.id || "");
              }}
            />
            <datalist id="purchase-vendors">
              {(options.vendors || []).map((x) => (
                <option key={x.id} value={`${x.code} · ${x.name}`} />
              ))}
            </datalist>
          </div>
          <button
            className="mini"
            onClick={() => saveField("vendor", { vendor_id: local.vendor_id })}
          >
            {vendor ? "แก้ไข" : "+ เพิ่ม"}
          </button>
        </div>

        <div className="purchase-field po-group">
          <label>PO / ISSUE PR / DUE DATE</label>
          <input
            placeholder="PO Number"
            value={local.po_number || ""}
            onChange={(e) => set("po_number", e.target.value)}
          />
          <input
            type="date"
            value={local.issue_pr_date || ""}
            onChange={(e) => set("issue_pr_date", e.target.value)}
          />
          <input
            type="date"
            value={local.due_date || ""}
            onChange={(e) => set("due_date", e.target.value)}
          />
          <button
            className="mini"
            onClick={() =>
              saveField("po", {
                po_number: local.po_number,
                issue_pr_date: local.issue_pr_date,
                due_date: local.due_date,
              })
            }
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
            <b>฿</b>
          </div>
          <button
            className="mini"
            onClick={() =>
              saveField("price", { price_per_unit: local.price_per_unit })
            }
          >
            บันทึก
          </button>
        </div>

        <div className="purchase-field readonly">
          <label>PRICE TOTAL</label>
          <strong>
            ฿ {money(Number(local.amount || 0) * Number(local.price_per_unit || 0))}
          </strong>
          <span>AMOUNT × Price / Unit</span>
        </div>

        <div className="purchase-field">
          <label>LEAD TIME</label>
          <div className="input-suffix">
            <input
              type="number"
              min="0"
              value={local.lead_time_days ?? ""}
              onChange={(e) => set("lead_time_days", e.target.value)}
            />
            <b>DAY</b>
          </div>
          <button
            className="mini"
            onClick={() =>
              saveField("lead", { lead_time_days: local.lead_time_days })
            }
          >
            บันทึก
          </button>
        </div>

        <div className="purchase-field">
          <label>VENDOR CONFIRM DATE</label>
          <input
            type="date"
            value={local.vendor_confirm_date || ""}
            onChange={(e) => set("vendor_confirm_date", e.target.value)}
          />
          <button
            className="mini"
            onClick={() =>
              saveField("confirm", {
                vendor_confirm_date: local.vendor_confirm_date,
              })
            }
          >
            บันทึก
          </button>
        </div>

        <div className="purchase-field">
          <label>PERSON IN CHARGE OF ORDER</label>
          <select
            value={local.person_in_charge_id || ""}
            onChange={(e) => set("person_in_charge_id", e.target.value)}
          >
            <option value="">-</option>
            {(options.employees || []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <button
            className="mini"
            onClick={() =>
              saveField("pic", {
                person_in_charge_id: local.person_in_charge_id,
              })
            }
          >
            {person ? "แก้ไข" : "+ เพิ่ม"}
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>
      <div className="system-box">
        <div>
          <span>WORKFLOW STATUS</span>
          <strong>{local.status}</strong>
        </div>
        <div>
          <span>LIFECYCLE</span>
          <strong>{local.lifecycle_status || "ACTIVE"}</strong>
        </div>
        <div>
          <span>DISPLAY STATUS</span>
          <strong>{displayOrderStatus(local)}</strong>
        </div>
        <div>
          <span>EDIT DATA STATUS</span>
          <strong>{local.edit_data_status || "-"}</strong>
        </div>
        <div>
          <span>GROUP ORDER</span>
          <strong>{local.group_order || "-"}</strong>
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          ปิด
        </button>
      </div>
    </Modal>
  );
}

function OrderTable({
  rows,
  auth,
  selected,
  onToggle,
  onToggleAll,
  onEdit,
  onPurchase,
  onUpdate,
  onUsage,
}) {
  const allSelected =
    rows.length > 0 && rows.every((o) => selected.has(o.id));

  return (
    <div className="table-wrap">
      <table className="order-table">
        <thead>
          <tr>
            <th>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(rows, e.target.checked)}
                />
                เลือก / Action
              </label>
            </th>
            <th>DATE</th>
            <th>FACTORY</th>
            <th>GROUP ORDER</th>
            <th>MACHINE</th>
            <th>JOB</th>
            <th>Urgent</th>
            <th>วันที่ค้าง</th>
            <th>Item ID</th>
            <th>Part Name</th>
            <th>Part Detail</th>
            <th>MAKER</th>
            <th>AMOUNT</th>
            <th>UNIT</th>
            <th>Quotation</th>
            <th>PO</th>
            <th>Price/Unit</th>
            <th>Total</th>
            <th>Vendor</th>
            <th>Lead Time</th>
            <th>Ordered By</th>
            <th>Issue PR</th>
            <th>Due</th>
            <th>Vendor Confirm</th>
            <th>Receive</th>
            <th>PIC</th>
            <th>STATUS</th>
            <th>LIFECYCLE</th>
            <th>Edit Data</th>
            {onUsage && <th>ใช้/ไม่ได้ใช้</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const selectedRow = selected.has(o.id);
            const shownStatus = displayOrderStatus(o);
            return (
              <tr
                key={o.id}
                style={selectedRow ? { background: "#f5f3ff" } : undefined}
              >
                <td className="sticky-action">
                  <div
                    style={{
                      display: "flex",
                      gap: 7,
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRow}
                      onChange={(e) => onToggle(o.id, e.target.checked)}
                    />
                    <b style={{ fontSize: 9, color: "#94a3b8" }}>
                      {o.order_number}
                    </b>
                  </div>
                  <div className="row-actions">
                    {auth.can("can_edit_order_info") && (
                      <button className="mini" onClick={() => onEdit(o)}>
                        ข้อมูล
                      </button>
                    )}
                    {auth.can("can_edit_purchase_info") && (
                      <button className="mini" onClick={() => onPurchase(o)}>
                        Purchase
                      </button>
                    )}
                    {onUpdate && auth.can("can_update_edit_data") && (
                      <button className="mini primary" onClick={() => onUpdate(o)}>
                        อัพเดต
                      </button>
                    )}
                  </div>
                </td>
                <td>{o.date}</td>
                <td>{o.factory === "MM-11" ? "Phase11" : "Phase4"}</td>
                <td>{o.group_order || "-"}</td>
                <td>{o.machine_name || o.machine_code || "-"}</td>
                <td><b>{o.job}</b></td>
                <td>{o.urgent_status || "-"}</td>
                <td>{o.pending_data_date || "-"}</td>
                <td><b>{o.item_id || "-"}</b></td>
                <td>{o.part_name}</td>
                <td className="detail-cell">{o.part_detail}</td>
                <td>{o.maker}</td>
                <td>{fmt(o.amount)}</td>
                <td>{o.unit}</td>
                <td>{o.quotation || "-"}</td>
                <td>{o.po_number || "-"}</td>
                <td>{money(o.price_per_unit)}</td>
                <td>{money(o.price_total)}</td>
                <td>{o.vendor_name || "-"}</td>
                <td>
                  {o.lead_time_days == null ? "-" : `${o.lead_time_days} DAY`}
                </td>
                <td>{o.ordered_by || "-"}</td>
                <td>{o.issue_pr_date || "-"}</td>
                <td>{o.due_date || "-"}</td>
                <td>{o.vendor_confirm_date || "-"}</td>
                <td>
                  {o.received_at
                    ? new Date(o.received_at).toLocaleString("th-TH")
                    : "-"}
                </td>
                <td>{o.person_in_charge || "-"}</td>
                <td>
                  <span className={`status ${statusClass(shownStatus)}`}>
                    {shownStatus}
                  </span>
                </td>
                <td>
                  <span
                    className={`status ${
                      o.lifecycle_status === "COMPLETED"
                        ? "success"
                        : o.lifecycle_status === "CANCELLED"
                          ? "danger"
                          : o.lifecycle_status === "WAIT_CONFIRM"
                            ? "confirm"
                            : "muted"
                    }`}
                  >
                    {o.lifecycle_status || "ACTIVE"}
                  </span>
                </td>
                <td>{o.edit_data_status || "-"}</td>
                {onUsage && (
                  <td>
                    <select
                      value={o.usage_status}
                      onChange={(e) => onUsage(o, e.target.value)}
                    >
                      <option value="USED">ใช้</option>
                      <option value="NOT_USED">ไม่ได้ใช้</option>
                    </select>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BulkActions({ rows, auth, busy, onRun, onClear }) {
  const count = rows.length;
  const canWait = rows.some((o) => o.lifecycle_status === "ACTIVE");
  const canCancelWait = rows.some(
    (o) => o.lifecycle_status === "WAIT_CONFIRM"
  );
  const canReceive = rows.some((o) =>
    ["ACTIVE", "WAIT_CONFIRM"].includes(o.lifecycle_status)
  );
  const canCancel = canReceive;
  const canRestore = rows.some((o) => o.lifecycle_status === "CANCELLED");

  return (
    <div
      className="toolbar wrap"
      style={{
        padding: 10,
        marginBottom: 12,
        border: "1px solid #ede9fe",
        borderRadius: 12,
        background: "#faf5ff",
      }}
    >
      <strong style={{ fontSize: 11, marginRight: 4 }}>
        เลือกแล้ว {fmt(count)} รายการ
      </strong>

      {auth.can("can_edit_purchase_info") && (
        <>
          <button
            className="btn warning"
            disabled={!count || busy || !canWait}
            onClick={() => onRun("wait_confirm")}
          >
            รอ Confirm
          </button>
          <button
            className="btn ghost"
            disabled={!count || busy || !canCancelWait}
            onClick={() => onRun("cancel_wait_confirm")}
          >
            ยกเลิกรอ Confirm
          </button>
        </>
      )}

      {auth.can("can_receive_order") && (
        <button
          className="btn success"
          disabled={!count || busy || !canReceive}
          onClick={() => onRun("receive")}
        >
          รับของ
        </button>
      )}

      {auth.can("can_cancel_order") && (
        <>
          <button
            className="btn warning"
            disabled={!count || busy || !canCancel}
            onClick={() => onRun("cancel")}
          >
            ยกเลิก Order
          </button>
          {canRestore && (
            <button
              className="btn ghost"
              disabled={!count || busy}
              onClick={() => onRun("restore")}
            >
              คืนรายการ
            </button>
          )}
        </>
      )}

      {auth.can("can_delete_order") && (
        <button
          className="btn danger"
          disabled={!count || busy}
          onClick={() => onRun("delete")}
        >
          ลบ
        </button>
      )}

      {count > 0 && (
        <button className="btn ghost" disabled={busy} onClick={onClear}>
          ล้างการเลือก
        </button>
      )}

      {busy && <small>กำลังดำเนินการ...</small>}
    </div>
  );
}

export function ProjectModal({
  department,
  options,
  employee,
  onClose,
  onSaved,
}) {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState(employee?.id || "");
  const [pendingDataDate, setPendingDataDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost("/order-projects/", {
        name,
        department,
        owner_id: ownerId,
        pending_data_date: pendingDataDate,
        description,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="สร้าง Project Order" onClose={onClose}>
      <form onSubmit={save}>
        <div className="alert success">
          Project นี้จะอยู่ใน{" "}
          {department === "MODIFY" ? "Modify" : "Automation"}
          {" "}ตามหน้าที่เลือกอยู่
        </div>

        <label className="field">
          <span>Project Name *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span>เจ้าของ Project *</span>
          <select
            required
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">เลือกเจ้าของ Project</option>
            {(options.employees || []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.employee_code}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>วันที่งานค้าง</span>
          <input
            type="date"
            value={pendingDataDate}
            onChange={(e) => setPendingDataDate(e.target.value)}
          />
          <small className="field-help">
            วันที่นี้จะใช้กับ Order ทุก Step ใน Project
          </small>
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            rows="3"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <Alert>{error}</Alert>

        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "กำลังสร้าง..." : "สร้าง Project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizedExcelRow(row) {
  const map = {};
  for (const [key, value] of Object.entries(row || {})) {
    map[normalizeHeader(key)] = value;
  }
  return map;
}

function readCell(row, ...aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

export default function Orders({ mode = "orders" }) {
  const auth = useAuth();
  const stepPage = mode === "steps";
  const [tab, setTab] = useState(stepPage ? "step" : "normal");
  const [options, setOptions] = useState({});
  const [rows, setRows] = useState([]);
  const [kpi, setKpi] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [job, setJob] = useState("");
  const [status, setStatus] = useState("");

  const [editor, setEditor] = useState(null);
  const [purchase, setPurchase] = useState(null);

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [projectModal, setProjectModal] = useState(false);
  const [projectDepartment, setProjectDepartment] = useState("MODIFY");
  const [projectSearch, setProjectSearch] = useState("");

  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importTargetStep, setImportTargetStep] = useState(null);
  const fileRef = useRef(null);

  async function loadOptions() {
    try {
      setOptions(await apiGet("/options/"));
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadOrders(forceRefresh = false) {
    if (tab === "step") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view: tab,
        q,
        urgency,
        job,
        status,
      });
      const data = await apiGet(`/orders/?${params}`, { forceRefresh });
      setRows(data.results || []);
      setKpi(data.kpi || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects(forceRefresh = false) {
    setLoading(true);
    try {
      const data = await apiGet(
        `/order-projects/?department=${projectDepartment}`,
        { forceRefresh }
      );
      const nextProjects = data.results || [];
      setProjects(nextProjects);

      const still =
        selectedProject &&
        nextProjects.find((x) => x.id === selectedProject.id);

      if (still) {
        setSelectedProject(still);
        const detail = await apiGet(`/order-projects/${still.id}/`, {
          forceRefresh,
        });
        setProjectDetail(detail);
      } else {
        setSelectedProject(null);
        setProjectDetail(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function selectProject(project, forceRefresh = false) {
    setSelectedProject(project);
    setSelected(new Set());
    try {
      setProjectDetail(
        await apiGet(`/order-projects/${project.id}/`, { forceRefresh })
      );
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    setTab(stepPage ? "step" : "normal");
    setSelected(new Set());
  }, [stepPage]);

  useEffect(() => {
    setSelected(new Set());
    if (stepPage || tab === "step") loadProjects();
    else loadOrders();
  }, [
    stepPage,
    tab,
    urgency,
    job,
    status,
    projectDepartment,
  ]);

  useEffect(() => {
    setSelectedProject(null);
    setProjectDetail(null);
    setSelected(new Set());
  }, [projectDepartment]);

  async function refresh() {
    setSelected(new Set());
    if (tab === "step") await loadProjects(true);
    else await loadOrders(true);
  }

  function toggleSelected(id, checked) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(tableRows, checked) {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of tableRows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  const shownProjects = useMemo(() => {
    const needle = projectSearch.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.owner_name || ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [projects, projectSearch]);

  const allVisibleOrders = useMemo(() => {
    if (tab !== "step") return rows;
    return (projectDetail?.steps || []).flatMap((step) => step.orders || []);
  }, [tab, rows, projectDetail]);

  const selectedRows = useMemo(
    () => allVisibleOrders.filter((o) => selected.has(o.id)),
    [allVisibleOrders, selected]
  );

  function eligibleRows(action) {
    if (action === "wait_confirm") {
      return selectedRows.filter((o) => o.lifecycle_status === "ACTIVE");
    }
    if (action === "cancel_wait_confirm") {
      return selectedRows.filter((o) => o.lifecycle_status === "WAIT_CONFIRM");
    }
    if (action === "receive" || action === "cancel") {
      return selectedRows.filter((o) =>
        ["ACTIVE", "WAIT_CONFIRM"].includes(o.lifecycle_status)
      );
    }
    if (action === "restore") {
      return selectedRows.filter((o) => o.lifecycle_status === "CANCELLED");
    }
    return selectedRows;
  }

  async function runBulk(action) {
    const targets = eligibleRows(action);
    if (!targets.length) {
      setError("รายการที่เลือกไม่มีรายการที่สามารถใช้ Action นี้ได้");
      return;
    }

    let reason = "";
    const labels = {
      wait_confirm: "เปลี่ยนเป็น Wait Confirm",
      cancel_wait_confirm: "ยกเลิก Wait Confirm",
      receive: "รับของ",
      cancel: "ยกเลิก Order",
      restore: "คืนรายการ",
      delete: "ลบ",
    };

    if (
      !window.confirm(
        `ยืนยัน ${labels[action]} จำนวน ${targets.length} รายการ?`
      )
    ) {
      return;
    }

    if (action === "cancel") {
      reason = window.prompt("เหตุผลการยกเลิก (ไม่บังคับ)", "") ?? "";
    }

    setBulkBusy(true);
    setError("");
    const failures = [];

    for (const order of targets) {
      try {
        if (action === "wait_confirm") {
          await apiPost(`/orders/${order.id}/wait-confirm/`, {
            wait_confirm: true,
          });
        } else if (action === "cancel_wait_confirm") {
          await apiPost(`/orders/${order.id}/wait-confirm/`, {
            wait_confirm: false,
          });
        } else if (action === "receive") {
          await apiPost(`/orders/${order.id}/receive/`, {});
        } else if (action === "cancel") {
          await apiPost(`/orders/${order.id}/cancel/`, {
            cancel: true,
            reason,
          });
        } else if (action === "restore") {
          await apiPost(`/orders/${order.id}/cancel/`, { cancel: false });
        } else if (action === "delete") {
          await apiDelete(`/orders/${order.id}/delete/`);
        }
      } catch (err) {
        failures.push(`${order.order_number}: ${err.message}`);
      }
    }

    const skipped = selectedRows.length - targets.length;
    if (failures.length) {
      setError(
        `สำเร็จ ${targets.length - failures.length} รายการ` +
          (skipped ? ` · ข้าม ${skipped} รายการ` : "") +
          ` · ไม่สำเร็จ ${failures.length}: ${failures.slice(0, 4).join(" | ")}`
      );
    } else if (skipped) {
      setError(
        `ดำเนินการสำเร็จ ${targets.length} รายการ · ข้าม ${skipped} รายการที่สถานะไม่รองรับ`
      );
    }

    setBulkBusy(false);
    await refresh();
  }

  async function updateData(order) {
    const label =
      order.edit_data_status === "รออัพเดต Wait Quotation"
        ? "Update การขอราคาแล้ว"
        : order.edit_data_status === "รออัพเดต Wait for Item"
          ? "Update รอของมาแล้ว"
          : "Update รับของเรียบร้อยแล้ว";
    if (!window.confirm(`${label} ?`)) return;
    try {
      await apiPost(`/orders/${order.id}/update-data/`, {});
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function usage(order, value) {
    try {
      await apiPatch(`/orders/${order.id}/usage/`, { usage_status: value });
      await loadProjects(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function excelDate(value) {
    if (!value) return "";
    if (typeof value === "number") {
      const d = XLSX.SSF.parse_date_code(value);
      if (!d) return "";
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(
        2,
        "0"
      )}`;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const text = String(value).trim();
    const dmY = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmY) {
      return `${dmY[3]}-${dmY[2].padStart(2, "0")}-${dmY[1].padStart(
        2,
        "0"
      )}`;
    }
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(
        2,
        "0"
      )}`;
    }
    return text;
  }

  async function createStep() {
    if (!selectedProject) return;
    setError("");
    try {
      await apiPost(`/order-projects/${selectedProject.id}/steps/`, {});
      await selectProject(selectedProject, true);
      await loadProjects(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteStep(step) {
    if (!selectedProject || !step) return;
    if (
      !window.confirm(
        `ยืนยันลบ Step ${step.step_no}?\n\n` +
          `Step ที่ยังมี Order อยู่จะไม่สามารถลบได้`
      )
    ) {
      return;
    }

    setError("");
    try {
      await apiDelete(
        `/order-projects/${selectedProject.id}/steps/${step.id}/`
      );
      setSelected(new Set());
      await selectProject(selectedProject, true);
      await loadProjects(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function chooseImportStep(step) {
    setImportTargetStep(step);
    window.setTimeout(() => fileRef.current?.click(), 0);
  }

  function downloadStepTemplate() {
    const example = {
      DATE: new Date().toISOString().slice(0, 10),
      FACTORY: "Phase4",
      "MACHINE NAME": "ใส่ชื่อ Machine ที่มีในระบบ",
      "ITEM ID": "",
      "PART NAME": "กรอกเมื่อไม่มี Item ID",
      "PART DETAIL": "กรอกเมื่อไม่มี Item ID",
      MAKER: "กรอกเมื่อไม่มี Item ID",
      AMOUNT: 1,
      UNIT: "EA",
      REMARK: "",
      "ORDERED BY": auth.employee?.name || "",
      QUOTATION: "",
      "PO NUMBER": "",
      "PRICE PER UNIT": "",
      "VENDOR ORDER": "",
      "LEAD TIME": "",
      "ISSUE PR DATE": "",
      "DUE DATE": "",
      "VENDOR CONFIRM DATE": "",
      "PERSON IN CHARGE OF ORDER": "",
    };

    const ws = XLSX.utils.json_to_sheet([example], { header: STEP_HEADERS });
    const guide = XLSX.utils.aoa_to_sheet([
      ["PartsFlow Order Step Import"],
      ["ให้แก้ไขแถวตัวอย่างเป็นข้อมูลจริงก่อน Import"],
      ["MACHINE NAME ต้องตรงกับชื่อหรือ Code ในระบบ"],
      ["JOB ถูกกำหนดจาก Modify / Automation ของ Project อัตโนมัติ"],
      ["วันที่งานค้างถูกกำหนดจาก Project อัตโนมัติ"],
      ["ไม่ต้องใส่ JOB / สถานะงานด่วน / วันที่งานค้างในไฟล์ Import"],
      ["ITEM ID ถ้ามี ระบบจะดึง Part Name / Detail / Maker / Unit จาก Part Master"],
      ["ถ้าใส่ Vendor Order ต้องมี Quotation ก่อน"],
      ["PO NUMBER + ISSUE PR DATE + DUE DATE ต้องใส่ครบทั้ง 3 ช่อง"],
      ["วันที่รองรับ yyyy-mm-dd หรือ dd/mm/yyyy"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Template");
    XLSX.utils.book_append_sheet(wb, guide, "วิธีใช้");
    XLSX.writeFile(
      wb,
      `order_step_${projectDepartment.toLowerCase()}_template.xlsx`
    );
  }

  async function importExcel(step, file) {
    if (!selectedProject || !step || !file) return;
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rawRows.length) {
        throw new Error("ไม่พบข้อมูลในไฟล์ Excel");
      }

      const normalized = rawRows
        .map(normalizedExcelRow)
        .map((r) => ({
          date: excelDate(readCell(r, "DATE", "ORDER DATE")),
          factory: String(readCell(r, "FACTORY", "WAREHOUSE") || "Phase4")
            .toLowerCase()
            .includes("11")
            ? "MM-11"
            : "MM-4",
          machine: readCell(r, "MACHINE NAME", "MACHINE", "M/C"),
          item_id: readCell(r, "ITEM ID", "ITEM", "PART NO"),
          part_name: readCell(r, "PART NAME"),
          part_detail: readCell(r, "PART DETAIL", "DESCRIPTION"),
          maker: readCell(r, "MAKER", "MANUFACTURER"),
          amount: readCell(r, "AMOUNT", "QTY", "QUANTITY") || 0,
          unit: readCell(r, "UNIT"),
          remark: readCell(r, "REMARK", "NOTE"),
          ordered_by: readCell(r, "ORDERED BY", "ORDER BY"),
          quotation: readCell(r, "QUOTATION", "QUOTE"),
          po_number: readCell(r, "PO NUMBER", "PO NO", "PO"),
          price_per_unit: readCell(r, "PRICE PER UNIT", "UNIT PRICE"),
          vendor_order: readCell(r, "VENDOR ORDER", "VENDOR", "SUPPLIER"),
          lead_time_days: readCell(r, "LEAD TIME", "LEAD TIME DAYS"),
          issue_pr_date: excelDate(readCell(r, "ISSUE PR DATE", "PR DATE")),
          due_date: excelDate(readCell(r, "DUE DATE")),
          vendor_confirm_date: excelDate(
            readCell(r, "VENDOR CONFIRM DATE", "CONFIRM DATE")
          ),
          person_in_charge: readCell(
            r,
            "PERSON IN CHARGE OF ORDER",
            "PERSON IN CHARGE",
            "PIC"
          ),
        }))
        .filter((r) =>
          Object.values(r).some((value) => String(value || "").trim() !== "")
        );

      if (!normalized.length) {
        throw new Error("ไม่มีแถวข้อมูลสำหรับ Import");
      }

      const result = await apiPost(
        `/order-projects/${selectedProject.id}/steps/${step.id}/import/`,
        { filename: file.name, rows: normalized }
      );

      if (result.errors?.length) {
        const details = result.errors
          .slice(0, 5)
          .map((x) => `แถว ${x.row}: ${x.error}`)
          .join(" | ");
        setError(
          `Import สำเร็จ ${result.created} รายการ · ข้าม ${result.errors.length} แถว · ${details}`
        );
      }

      await loadProjects(true);
      const current = selectedProject;
      if (current) await selectProject(current, true);
    } catch (err) {
      setError(err.message);
    } finally {
      setImportTargetStep(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function projectExportRows(sourceRows) {
    return sourceRows.map((o) => ({
      PROJECT: projectDetail?.project?.name || "",
      OWNER: projectDetail?.project?.owner_name || "",
      STEP: o.step_no || "",
      DATE: o.date,
      FACTORY: o.factory === "MM-11" ? "Phase11" : "Phase4",
      "MACHINE NAME": o.machine_name || o.machine_code || "",
      JOB: o.job,
      "ITEM ID": o.item_id || "",
      "PART NAME": o.part_name,
      "PART DETAIL": o.part_detail,
      MAKER: o.maker,
      AMOUNT: o.amount,
      UNIT: o.unit,
      REMARK: o.remark,
      "ORDERED BY": o.ordered_by,
      QUOTATION: o.quotation,
      "PO NUMBER": o.po_number,
      "PRICE PER UNIT": o.price_per_unit,
      TOTAL: o.price_total,
      "VENDOR ORDER": o.vendor_name,
      "LEAD TIME": o.lead_time_days ?? "",
      "ISSUE PR DATE": o.issue_pr_date,
      "DUE DATE": o.due_date,
      "VENDOR CONFIRM DATE": o.vendor_confirm_date,
      "PERSON IN CHARGE OF ORDER": o.person_in_charge,
      STATUS: displayOrderStatus(o),
      LIFECYCLE: o.lifecycle_status,
      "RECEIVED AT": o.received_at || "",
    }));
  }

  function exportProjectOrders(kind) {
    if (!projectDetail?.project) return;

    let exportRows = [];
    let label = "active";

    if (kind === "selected") {
      exportRows = allVisibleOrders.filter((o) => selected.has(o.id));
      label = "selected";
      if (!exportRows.length) {
        setError("กรุณาเลือกรายการที่ต้องการ Export ก่อน");
        return;
      }
    } else {
      // Active export includes received/completed as requested.
      // WAIT_CONFIRM and CANCELLED are not included.
      exportRows = allVisibleOrders.filter((o) =>
        ["ACTIVE", "COMPLETED"].includes(o.lifecycle_status)
      );
      if (!exportRows.length) {
        setError("ไม่มีรายการ Active / Completed สำหรับ Export");
        return;
      }
    }

    const ws = XLSX.utils.json_to_sheet(projectExportRows(exportRows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Project Orders");

    const safeName = String(projectDetail.project.name || "project")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .slice(0, 60);

    XLSX.writeFile(
      wb,
      `${safeName}_${label}.xlsx`
    );
  }

  async function deleteProject() {
    if (!selectedProject) return;

    if (
      !window.confirm(
        `ยืนยันลบ Project "${selectedProject.name}" ?\n\n` +
          `Project จะหายจาก Order Step และ Order ของ Project นี้จะถูกซ่อนออกจากหน้า Order`
      )
    ) {
      return;
    }

    setError("");
    try {
      await apiDelete(`/order-projects/${selectedProject.id}/`);
      setSelectedProject(null);
      setProjectDetail(null);
      setSelected(new Set());
      await loadProjects(true);
    } catch (err) {
      setError(err.message);
    }
  }

  const updateCount = tab === "updates" ? rows.length : 0;

  const kpiBlocks = tab !== "step" && (
    <>
      <div className="kpi-grid four">
        <div className="kpi-card">
          <span>จำนวนออเดอร์ทั้งหมด</span>
          <strong>{fmt(kpi.total)}</strong>
        </div>
        <div className="kpi-card danger">
          <span>งานด่วน</span>
          <strong>{fmt(kpi.urgent)}</strong>
        </div>
        <div className="kpi-card warning">
          <span>งานด่วน + ค้าง DATA</span>
          <strong>{fmt(kpi.urgent_pending)}</strong>
        </div>
        <div className="kpi-card info">
          <span>งานค้าง DATA</span>
          <strong>{fmt(kpi.pending)}</strong>
        </div>
      </div>
      <div className="kpi-grid five compact">
        <div className="kpi-card"><span>REPAIR</span><strong>{fmt(kpi.repair)}</strong></div>
        <div className="kpi-card"><span>MODIFY</span><strong>{fmt(kpi.modify)}</strong></div>
        <div className="kpi-card"><span>AUTOMATION</span><strong>{fmt(kpi.automation)}</strong></div>
        <div className="kpi-card"><span>PM</span><strong>{fmt(kpi.pm)}</strong></div>
        <div className="kpi-card"><span>GENERAL</span><strong>{fmt(kpi.general)}</strong></div>
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title={stepPage ? "Order Step" : "Order"}
        subtitle={
          stepPage
            ? "Project Order แยก Modify / Automation และจัดการตาม Step"
            : "Order Normal, Wait Confirm, Completed และ Cancelled"
        }
        actions={
          !stepPage && tab === "normal" && auth.can("can_add_order") ? (
            <button
              className="btn primary"
              onClick={() => setEditor({ order: null, project: null })}
            >
              + เพิ่ม Order ปกติ
            </button>
          ) : null
        }
      />

      <Alert>{error}</Alert>
      {kpiBlocks}

      {!stepPage && (
      <div className="tab-row page-tabs">
        {ORDER_TABS.map(([key, label]) => (
          <button
            key={key}
            className={`tab ${tab === key ? "active" : ""}`}
            onClick={() => {
              setTab(key);
              setQ("");
              setError("");
              setSelected(new Set());
            }}
          >
            {label}
            {key === "updates" && updateCount > 0 ? ` (${updateCount})` : ""}
          </button>
        ))}
      </div>
      )}

      {!stepPage && tab !== "step" && (
        <section className="panel">
          <div className="toolbar wrap">
            <input
              className="search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา Order / Item ID / Part / Machine / ผู้สั่ง..."
            />

            {tab === "normal" && (
              <>
                <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                  <option value="all">สถานะติดตาม: ทั้งหมด</option>
                  <option value="urgent">งานด่วน</option>
                  <option value="urgent_pending">งานด่วน + ค้างดาต้า</option>
                  <option value="pending">งานค้างดาต้า</option>
                  <option value="normal">รายการทั่วไป</option>
                </select>
                <select value={job} onChange={(e) => setJob(e.target.value)}>
                  <option value="">JOB: ทั้งหมด</option>
                  <option value="REPAIR">REPAIR</option>
                  <option value="MODIFY">MODIFY</option>
                  <option value="AUTOMATION">AUTOMATION</option>
                  <option value="PM">PM</option>
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">STATUS: ทั้งหมด</option>
                  {STATUS.filter((x) => x !== "Complete Order").map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </>
            )}

            <button className="btn ghost" onClick={() => loadOrders(true)}>
              ค้นหา
            </button>
          </div>

          <BulkActions
            rows={selectedRows}
            auth={auth}
            busy={bulkBusy}
            onRun={runBulk}
            onClear={() => setSelected(new Set())}
          />

          {loading ? (
            <div className="empty">กำลังโหลด...</div>
          ) : (
            <OrderTable
              rows={rows}
              auth={auth}
              selected={selected}
              onToggle={toggleSelected}
              onToggleAll={toggleAll}
              onEdit={(order) => setEditor({ order, project: null })}
              onPurchase={setPurchase}
              onUpdate={tab === "updates" ? updateData : null}
            />
          )}
        </section>
      )}

      {(stepPage || tab === "step") && (
        <>
          <div className="order-department-switch">
            <button
              className={`department-card ${
                projectDepartment === "MODIFY" ? "active" : ""
              }`}
              onClick={() => setProjectDepartment("MODIFY")}
            >
              <strong>Modify</strong>
              <span>Project งานดัดแปลง / ปรับปรุงเครื่องจักร</span>
            </button>
            <button
              className={`department-card ${
                projectDepartment === "AUTOMATION" ? "active" : ""
              }`}
              onClick={() => setProjectDepartment("AUTOMATION")}
            >
              <strong>Automation</strong>
              <span>Project งาน Automation / Control</span>
            </button>
          </div>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>
                  {projectDepartment === "MODIFY"
                    ? "Modify Projects"
                    : "Automation Projects"}
                </h2>
                <p>ค้นหาจากชื่อ Project หรือชื่อเจ้าของ แล้วเลือกจาก Dropdown</p>
              </div>

              {auth.can("can_manage_order_projects") && (
                <button
                  className="btn primary"
                  onClick={() => setProjectModal(true)}
                >
                  + Project
                </button>
              )}
            </div>

            <div className="toolbar wrap">
              <input
                className="search-input"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="ค้นหา Project / เจ้าของ Project..."
              />

              <select
                value={selectedProject?.id || ""}
                onChange={(e) => {
                  const project = shownProjects.find(
                    (x) => x.id === e.target.value
                  );
                  if (project) selectProject(project);
                  else {
                    setSelectedProject(null);
                    setProjectDetail(null);
                  }
                }}
                style={{ minWidth: 320 }}
              >
                <option value="">เลือก Project...</option>
                {shownProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {" · "}
                    {project.owner_name || "ไม่ระบุเจ้าของ"}
                    {" · "}
                    {project.step_count} Step
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="project-content">
              {!selectedProject ? (
                <div className="empty">
                  เลือก Project หรือสร้าง Project ใหม่ใน {projectDepartment === "MODIFY" ? "Modify" : "Automation"}
                </div>
              ) : projectDetail ? (
                <>
                  <div className="page-header project-head">
                    <div>
                      <h1>{projectDetail.project.name}</h1>
                      <p>
                        เจ้าของ:{" "}
                        <b>{projectDetail.project.owner_name || "-"}</b>
                        {" · "}
                        วันที่งานค้าง:{" "}
                        <b>{projectDetail.project.pending_data_date || "-"}</b>
                      </p>
                      <p>
                        {projectDetail.project.description ||
                          `${projectDepartment} Project Order`}
                      </p>
                    </div>
                    <div className="page-actions" style={{ flexWrap: "wrap" }}>
                      {auth.can("can_manage_order_projects") && (
                        <button className="btn primary" onClick={createStep}>
                          + เพิ่ม Step
                        </button>
                      )}
                      <button
                        className="btn ghost"
                        onClick={() => exportProjectOrders("active")}
                      >
                        ⬇ Export Active
                      </button>
                      <button
                        className="btn ghost"
                        disabled={!selected.size}
                        onClick={() => exportProjectOrders("selected")}
                      >
                        ⬇ Export ที่เลือก ({selected.size})
                      </button>
                      <button className="btn ghost" onClick={downloadStepTemplate}>
                        ⬇ เทมเพลต Excel
                      </button>
                      {auth.can("can_manage_order_projects") && (
                        <button className="btn danger" onClick={deleteProject}>
                          ลบ Project
                        </button>
                      )}
                      <input
                        ref={fileRef}
                        hidden
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) =>
                          importExcel(importTargetStep, e.target.files?.[0])
                        }
                      />
                    </div>
                  </div>

                  <div className="kpi-grid three">
                    <div className="kpi-card">
                      <span>รายการที่ใช้ (Active + Completed)</span>
                      <strong>{fmt(projectDetail.project.used_items)}</strong>
                    </div>
                    <div className="kpi-card warning">
                      <span>ราคาอะไหล่ทั้งหมด (ไม่รวม Cancelled)</span>
                      <strong>฿ {money(projectDetail.project.total_order_value)}</strong>
                    </div>
                    <div className="kpi-card success">
                      <span>ราคาอะไหล่ที่ใช้ (ไม่รวม Wait Confirm / Cancelled)</span>
                      <strong>฿ {money(projectDetail.project.used_value)}</strong>
                    </div>
                  </div>

                  <BulkActions
                    rows={selectedRows}
                    auth={auth}
                    busy={bulkBusy}
                    onRun={runBulk}
                    onClear={() => setSelected(new Set())}
                  />

                  {projectDetail.steps.length ? (
                    projectDetail.steps.map((step) => (
                      <div className="panel" key={step.id}>
                        <div className="section-head">
                          <div>
                            <h2>Step {step.step_no}</h2>
                            <p>{step.import_filename || "Manual Step"}</p>
                          </div>

                          <div
                            className="page-actions"
                            style={{ flexWrap: "wrap", justifyContent: "flex-end" }}
                          >
                            <span className="status info">
                              {step.orders.length} รายการ
                            </span>

                            {auth.can("can_add_order") && (
                              <button
                                className="mini primary"
                                onClick={() =>
                                  setEditor({
                                    order: null,
                                    project: projectDetail.project,
                                    step,
                                  })
                                }
                              >
                                + เพิ่ม Order
                              </button>
                            )}

                            {auth.can("can_manage_order_projects") && (
                              <>
                                <button
                                  className="mini primary"
                                  onClick={() => chooseImportStep(step)}
                                >
                                  Import Excel
                                </button>
                                <button
                                  className="mini danger"
                                  onClick={() => deleteStep(step)}
                                >
                                  ลบ Step
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <OrderTable
                          rows={step.orders}
                          auth={auth}
                          selected={selected}
                          onToggle={toggleSelected}
                          onToggleAll={toggleAll}
                          onEdit={(order) =>
                            setEditor({ order, project: projectDetail.project })
                          }
                          onPurchase={setPurchase}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      Project นี้ยังไม่มี Step — กด “+ เพิ่ม Step” ก่อน แล้วจึงเพิ่ม Order หรือ Import Excel ภายใน Step
                    </div>
                  )}
                </>
              ) : (
                <div className="empty">กำลังโหลด Project...</div>
              )}
            </section>
        </>
      )}

      {editor && (
        <OrderInfoModal
          order={editor.order}
          project={editor.project}
          step={editor.step}
          options={options}
          employee={auth.employee}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      )}

      {purchase && (
        <PurchaseModal
          order={purchase}
          options={options}
          onClose={() => setPurchase(null)}
          onChanged={(result) => {
            setPurchase(result);
            refresh();
          }}
        />
      )}

      {projectModal && (
        <ProjectModal
          department={projectDepartment}
          options={options}
          employee={auth.employee}
          onClose={() => setProjectModal(false)}
          onSaved={async () => {
            setProjectModal(false);
            await loadProjects(true);
          }}
        />
      )}
    </>
  );
}
