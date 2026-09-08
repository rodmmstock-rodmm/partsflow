import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, SearchableSelect, fmt, formatDMY, money } from "../components/Common";
import RFQComposeModal from "../components/RFQComposeModal";
import { useOptions } from "../optionsContext";

const ORDER_TABS = [
  ["normal", "Order Normal"],
  ["updates", "รายการที่ต้องอัพเดต"],
  ["confirm", "Wait Confirm Order"],
  ["completed", "Completed Order"],
  ["cancelled", "Cancelled Order"],
  ["deleted", "Deleted Order"],
];

const STEP_STATUS_OPTIONS = [
  { value: "WAIT_QUOTATION", label: "รอขอราคา" },
  { value: "WAIT_CONFIRM", label: "รอ Confirm" },
  { value: "ORDERING", label: "กำลังสั่งของ" },
  { value: "COMPLETED", label: "ของมาครบแล้ว" },
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

const MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

const ORDER_IMPORT_HEADERS = [
  "ORDER NUMBER",
  "DATE",
  "FACTORY",
  "MACHINE NAME",
  "JOB",
  "URGENT STATUS",
  "PENDING DATA DATE",
  "PART ID",
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
  "CURRENCY",
  "VENDOR ORDER",
  "LEAD TIME",
  "ISSUE PR DATE",
  "DUE DATE",
  "VENDOR CONFIRM DATE",
  "PERSON IN CHARGE OF ORDER",
];

const STEP_HEADERS = [
  "DATE",
  "FACTORY",
  "MACHINE NAME",
  "PART ID",
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
  "CURRENCY",
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
  quotationMode = false,
  canEditOrderDate = false,
  onClose,
  onSaved,
}) {
  const edit = !!order?.id;
  const stockLocked = !!order?.received_at && !!order?.stock_received;
  const today = new Date().toISOString().slice(0, 10);
  const projectJob = project?.department || "";
  const isProjectOrder = !!project;
  const isQuotationOrder =
    quotationMode || order?.procurement_phase === "QUOTATION";

  const initial = {
    date: order?.date || today,
    factory: order?.factory || "MM-4",
    machine_id: order?.machine_id || "",
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
    drawing_path: order?.drawing_path || "",
    ordered_by_id: order?.ordered_by_id || employee?.id || "",
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
      const machine = (options.machines || []).find(
        (x) => String(x.id) === String(form.machine_id)
      );
      const ordered = (options.employees || []).find(
        (x) => String(x.id) === String(form.ordered_by_id)
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
        drawing_path: form.drawing_path,
        ordered_by_id: ordered.id,
        procurement_phase: isQuotationOrder ? "QUOTATION" : "PURCHASE",
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
          ? isQuotationOrder
            ? "แก้ไขรายการขอราคา"
            : "แก้ไข Order Information"
          : project
            ? isQuotationOrder
              ? `เพิ่มรายการขอราคา · ${project.name} · Step ${step?.step_no || "-"}`
              : `เพิ่ม Order · ${project.name} · Step ${step?.step_no || "-"}`
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
            {isQuotationOrder ? " · ช่วงขอราคา (ยังไม่ใช่ Order จริง)" : ""}
          </div>
        )}
        {stockLocked && (
          <div className="alert success">
            รายการนี้รับเข้า Stock แล้ว: Part ID, JOB และ AMOUNT ถูกล็อก
          </div>
        )}

        <div className="form-grid three">
          <label className="field">
            <span>DATE *</span>
            <input
              type="date"
              readOnly={!canEditOrderDate}
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
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
            <SearchableSelect
              required
              value={form.machine_id}
              options={options.machines || []}
              onChange={(value) => set("machine_id", value)}
              getLabel={(x) => x.code}
              getSearchText={(x) => `${x.code || ""} ${x.name || ""} ${x.location || ""}`}
              placeholder="พิมพ์รหัส Machine"
            />
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
            <span>Part ID (ไม่บังคับ)</span>
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
            <SearchableSelect
              required
              value={form.ordered_by_id}
              options={options.employees || []}
              onChange={(value) => set("ordered_by_id", value)}
              getLabel={(x) => x.name}
              getSearchText={(x) => `${x.employee_code || ""} ${x.name || ""} ${x.department || ""}`}
              placeholder="พิมพ์ชื่อพนักงาน"
            />
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

          <label className="field span3">
            <span>Drawing Path (ที่เก็บไฟล์ในเครื่อง/เซิร์ฟเวอร์)</span>
            <input
              value={form.drawing_path}
              onChange={(e) => set("drawing_path", e.target.value)}
              placeholder="เช่น \\\\server\\drawings\\project01\\part-A.pdf"
            />
            <span className="field-help">
              ใส่ path ไปยังไฟล์ drawing ที่เก็บไว้ในเครื่อง/เซิร์ฟเวอร์ของบริษัท (ไม่ใช่การอัปโหลดไฟล์ แค่บันทึกที่อยู่ไฟล์ไว้อ้างอิง)
            </span>
          </label>
        </div>

        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" disabled={busy}>
            {busy
              ? "กำลังบันทึก..."
              : isQuotationOrder
                ? "บันทึกรายการขอราคา"
                : "บันทึก Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PurchaseModal({
  order,
  options,
  quotationOnly = false,
  onClose,
  onChanged,
}) {
  const [local, setLocal] = useState({ ...order });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [rfqs, setRfqs] = useState([]);
  const [rfqLoading, setRfqLoading] = useState(true);
  const set = (k, v) => setLocal((x) => ({ ...x, [k]: v }));
  const isQuotationOnly =
    quotationOnly || order.procurement_phase === "QUOTATION";

  useEffect(() => {
    let active = true;
    setRfqLoading(true);
    apiGet(`/rfqs/?order_id=${order.id}&full=true`, { cache: false, forceRefresh: true })
      .then((data) => active && setRfqs(data.results || []))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setRfqLoading(false));
    return () => { active = false; };
  }, [order.id]);

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

  if (isQuotationOnly) {
    return (
      <Modal
        title={`Quotation · ${order.order_number}`}
        onClose={onClose}
        wide
      >
        <p className="helper">
          รายการนี้ยังอยู่ในช่วงขอราคา และยังไม่ถูกนับเป็น Order จริง
        </p>
        <div className="quotation-rfq-list">
          {rfqLoading ? (
            <span>กำลังโหลด...</span>
          ) : rfqs.length ? (
            rfqs.map((rfq) => (
              <div key={rfq.id}>
                <b>{rfq.rfq_number}</b>
                <span>{rfq.vendor || "รอระบุ Vendor"}</span>
                <span>
                  ส่ง {rfq.sent_at ? formatDMY(rfq.sent_at, true) : "-"}
                  {` · ${rfq.sent_by || "-"}`}
                </span>
                {rfq.po_balance?.quotation_received_at ? (
                  <span>
                    รับราคา {rfq.po_balance.quotation_received_at} · {rfq.po_balance.price || "-"} {rfq.po_balance.currency || "THB"}
                    {rfq.po_balance.lead_time_days != null
                      ? ` · Lead time ${rfq.po_balance.lead_time_days} วัน`
                      : ""}
                  </span>
                ) : (
                  <span>ยังไม่ได้รับใบเสนอราคา</span>
                )}
                {(rfq.email_link || rfq.gmail_link) && (
                  <a
                    href={rfq.email_link || rfq.gmail_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    เปิดลิงก์อีเมล
                  </a>
                )}
              </div>
            ))
          ) : (
            <span>ยังไม่มีรายการขอราคา</span>
          )}
        </div>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>ปิด</button>
        </div>
      </Modal>
    );
  }

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
        <div className="purchase-field quotation-history">
          <label>Quotation · รายการขอราคา</label>
          <div className="quotation-rfq-list">
            {rfqLoading ? (
              <span>กำลังโหลด...</span>
            ) : rfqs.length ? (
              rfqs.map((rfq) => (
                <div key={rfq.id}>
                  <b>{rfq.rfq_number}</b>
                  <span>{rfq.vendor || "รอระบุ Vendor"}</span>
                  <span>{rfq.sent_at ? formatDMY(rfq.sent_at, true) : "-"}</span>
                  <span>{rfq.sent_by || "-"}</span>
                  {(rfq.email_link || rfq.gmail_link) && <a href={rfq.email_link || rfq.gmail_link} target="_blank" rel="noreferrer">เปิดอีเมล</a>}
                </div>
              ))
            ) : (
              <span>ยังไม่มีรายการขอราคา</span>
            )}
            {local.quotation && (
              <div className="legacy-quotation">
                <b>ข้อมูล Quotation เดิม</b>
                <span>{local.quotation}</span>
              </div>
            )}
          </div>
        </div>

        <div className="purchase-field">
          <label>VENDOR ORDER</label>
          <div>
            <SearchableSelect
              value={local.vendor_id || ""}
              options={options.vendors || []}
              onChange={(value) => {
                set("vendor_id", value);
              }}
              getLabel={(x) => `${x.code ? `${x.code} · ` : ""}${x.name}`}
              getSearchText={(x) => `${x.code || ""} ${x.name || ""} ${x.email || ""} ${x.contact_person || ""}`}
              placeholder="พิมพ์ชื่อหรือรหัส Vendor"
            />
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
            <b>{local.currency || "THB"}</b>
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
            {local.currency || "THB"} {money(Number(local.amount || 0) * Number(local.price_per_unit || 0))}
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
          <SearchableSelect
            value={local.person_in_charge_id || ""}
            options={options.employees || []}
            onChange={(value) => set("person_in_charge_id", value)}
            getLabel={(x) => x.name}
            getSearchText={(x) => `${x.employee_code || ""} ${x.name || ""} ${x.department || ""}`}
            placeholder="พิมพ์ชื่อพนักงาน"
          />
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

function DeletedOrderTable({ rows, onRestore, restoringId }) {
  return (
    <div className="table-wrap">
      <table className="order-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>ORDER NO</th>
            <th>DATE</th>
            <th>MACHINE</th>
            <th>PART NAME</th>
            <th>AMOUNT</th>
            <th>สถานะก่อนลบ</th>
            <th>ลบโดย</th>
            <th>ลบเมื่อ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="sticky-action">
                <button
                  className="mini primary"
                  disabled={restoringId === o.id}
                  onClick={() => onRestore(o)}
                >
                  {restoringId === o.id ? "กำลังกู้คืน..." : "กู้คืน"}
                </button>
              </td>
              <td>
                <b>{o.order_number}</b>
              </td>
              <td>{formatDMY(o.date)}</td>
              <td>{o.machine_code || o.machine_name || "-"}</td>
              <td>{o.part_name}</td>
              <td>{fmt(o.amount)}</td>
              <td>{o.lifecycle_status}</td>
              <td>{o.deleted_by || "-"}</td>
              <td>
                {o.deleted_at
                  ? formatDMY(o.deleted_at, true)
                  : "-"}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={9} className="empty">
                ไม่มี Order ที่ถูกลบ
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditableCell({
  value,
  display,
  canEdit,
  type = "text",
  options,
  getLabel,
  getSearchText,
  placeholder,
  onSave,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && type !== "searchable" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing, type]);

  const shownText = display !== undefined ? display : value || "-";

  if (!canEdit) {
    return <span>{shownText}</span>;
  }

  async function commit(nextValue) {
    if (saving) return;
    const finalValue = nextValue === undefined ? draft : nextValue;
    if (String(finalValue ?? "") === String(value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(finalValue);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <span
        className="editable-cell"
        style={{
          cursor: "pointer",
          display: "inline-block",
          minWidth: 24,
          minHeight: 18,
        }}
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
        title="คลิกเพื่อแก้ไข"
      >
        {shownText}
      </span>
    );
  }

  if (type === "searchable") {
    return (
      <div style={{ minWidth: 150 }} onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setEditing(false);
        }
      }}>
        <SearchableSelect
          value={draft}
          options={options || []}
          onChange={(val) => {
            setDraft(val);
            commit(val);
          }}
          getLabel={getLabel}
          getSearchText={getSearchText}
          placeholder={placeholder}
        />
      </div>
    );
  }

  if (type === "select") {
    return (
      <select
        ref={inputRef}
        value={draft}
        disabled={saving}
        style={{ fontSize: 12, padding: "3px 4px", border: "1px solid #7c3aed", borderRadius: 4 }}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setEditing(false)}
      >
        {(options || []).map((opt) =>
          typeof opt === "string" ? (
            <option key={opt} value={opt}>{opt || "-"}</option>
          ) : (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          )
        )}
      </select>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      disabled={saving}
      placeholder={placeholder}
      style={{
        width: type === "number" ? 70 : type === "date" ? 130 : 130,
        padding: "2px 4px",
        fontSize: 12,
        border: "1px solid #7c3aed",
        borderRadius: 4,
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
    />
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
  onInlineSave,
  onInlinePurchaseSave,
  options,
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
            <th>Part ID</th>
            <th>Part Name</th>
            <th>Part Detail</th>
            <th>MAKER</th>
            <th>AMOUNT</th>
            <th>UNIT</th>
            <th>REMARK</th>
            <th>DRAWING</th>
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
                <td>
                  <EditableCell
                    value={o.date}
                    display={formatDMY(o.date)}
                    type="date"
                    canEdit={auth.can("can_edit_order_date")}
                    onSave={(val) => onInlineSave(o, "date", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.factory}
                    display={o.factory === "MM-11" ? "Phase11" : "Phase4"}
                    type="select"
                    options={[
                      { value: "MM-4", label: "Phase4" },
                      { value: "MM-11", label: "Phase11" },
                    ]}
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "factory", val)}
                  />
                </td>
                <td>{o.group_order || "-"}</td>
                <td style={{ minWidth: 100 }}>
                  <EditableCell
                    value={o.machine_id}
                    display={o.machine_name || o.machine_code || "-"}
                    type="searchable"
                    options={options.machines || []}
                    getLabel={(x) => x.code}
                    getSearchText={(x) => `${x.code || ""} ${x.name || ""}`}
                    placeholder="พิมพ์รหัส Machine"
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "machine_id", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.job}
                    display={<b>{o.job || "-"}</b>}
                    type="text"
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "job", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.urgent_status}
                    type="select"
                    options={["", ...URGENT]}
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "urgent_status", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.pending_data_date}
                    display={formatDMY(o.pending_data_date)}
                    type="date"
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "pending_data_date", val)}
                  />
                </td>
                <td style={{ minWidth: 110 }}>
                  <EditableCell
                    value={o.part_id}
                    display={<b>{o.item_id || "-"}</b>}
                    type="searchable"
                    options={options.parts || []}
                    getLabel={(x) => `${x.sku} · ${x.name}`}
                    getSearchText={(x) => `${x.sku || ""} ${x.name || ""}`}
                    placeholder="พิมพ์ Part ID / ชื่อ"
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "part_id", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.part_name}
                    type="text"
                    canEdit={auth.can("can_edit_order_info") && !o.part_id}
                    onSave={(val) => onInlineSave(o, "part_name", val)}
                  />
                </td>
                <td className="detail-cell">
                  <EditableCell
                    value={o.part_detail}
                    type="text"
                    canEdit={auth.can("can_edit_order_info") && !o.part_id}
                    onSave={(val) => onInlineSave(o, "part_detail", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.maker}
                    type="text"
                    canEdit={auth.can("can_edit_order_info") && !o.part_id}
                    onSave={(val) => onInlineSave(o, "maker", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.amount}
                    type="number"
                    canEdit={
                      auth.can("can_edit_order_info") &&
                      !(o.received_at && o.stock_received)
                    }
                    onSave={(val) => onInlineSave(o, "amount", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.unit}
                    type="text"
                    canEdit={auth.can("can_edit_order_info") && !o.part_id}
                    onSave={(val) => onInlineSave(o, "unit", val)}
                  />
                </td>
                <td style={{ minWidth: 90 }}>
                  <EditableCell
                    value={o.remark}
                    type="text"
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "remark", val)}
                  />
                </td>
                <td style={{ minWidth: 110 }}>
                  <EditableCell
                    value={o.drawing_path}
                    type="text"
                    placeholder="Path ไฟล์ Drawing"
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "drawing_path", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.quotation}
                    display={
                      o.rfq_count ? (
                        <span className="status info">RFQ {fmt(o.rfq_count)}</span>
                      ) : (
                        o.quotation || "-"
                      )
                    }
                    type="text"
                    canEdit={auth.can("can_edit_purchase_info") && !o.rfq_count}
                    onSave={(val) => onInlinePurchaseSave(o, "quotation", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.po_number}
                    type="text"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "po_number", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.price_per_unit}
                    display={`${o.currency || "THB"} ${money(o.price_per_unit)}`}
                    type="number"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "price_per_unit", val)}
                  />
                </td>
                <td>{o.currency || "THB"} {money(o.price_total)}</td>
                <td style={{ minWidth: 100 }}>
                  <EditableCell
                    value={o.vendor_id}
                    display={o.vendor_name || "-"}
                    type="searchable"
                    options={options.vendors || []}
                    getLabel={(x) => x.name}
                    getSearchText={(x) => `${x.code || ""} ${x.name || ""}`}
                    placeholder="พิมพ์ชื่อ Vendor"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "vendor_id", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.lead_time_days}
                    display={o.lead_time_days == null ? "-" : `${o.lead_time_days} DAY`}
                    type="number"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "lead_time_days", val)}
                  />
                </td>
                <td style={{ minWidth: 100 }}>
                  <EditableCell
                    value={o.ordered_by_id}
                    display={o.ordered_by || "-"}
                    type="searchable"
                    options={options.employees || []}
                    getLabel={(x) => x.name}
                    getSearchText={(x) => `${x.employee_code || ""} ${x.name || ""}`}
                    placeholder="พิมพ์ชื่อพนักงาน"
                    canEdit={auth.can("can_edit_order_info")}
                    onSave={(val) => onInlineSave(o, "ordered_by_id", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.issue_pr_date}
                    display={formatDMY(o.issue_pr_date)}
                    type="date"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "issue_pr_date", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.due_date}
                    display={formatDMY(o.due_date)}
                    type="date"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "due_date", val)}
                  />
                </td>
                <td>
                  <EditableCell
                    value={o.vendor_confirm_date}
                    display={formatDMY(o.vendor_confirm_date)}
                    type="date"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "vendor_confirm_date", val)}
                  />
                </td>
                <td>
                  {o.received_at
                    ? formatDMY(o.received_at, true)
                    : "-"}
                </td>
                <td style={{ minWidth: 100 }}>
                  <EditableCell
                    value={o.person_in_charge_id}
                    display={o.person_in_charge || "-"}
                    type="searchable"
                    options={options.employees || []}
                    getLabel={(x) => x.name}
                    getSearchText={(x) => `${x.employee_code || ""} ${x.name || ""}`}
                    placeholder="พิมพ์ชื่อพนักงาน"
                    canEdit={auth.can("can_edit_purchase_info")}
                    onSave={(val) => onInlinePurchaseSave(o, "person_in_charge_id", val)}
                  />
                </td>
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

const QUOTATION_STAGE_LABELS = {
  DRAFT: "ยังไม่บันทึกขอราคา",
  WAIT_QUOTATION: "รอใบเสนอราคา",
  QUOTATION_RECEIVED: "ได้รับราคาแล้ว",
  READY_TO_CREATE_ORDER: "พร้อมสร้าง Order",
  PARTIALLY_CREATED: "สร้าง Order บางส่วนแล้ว",
  CREATED_TO_ORDER_STEP: "สร้าง Order ครบแล้ว",
};

function QuotationTable({
  rows,
  auth,
  selected,
  onToggle,
  onToggleAll,
  onEdit,
  onQuotation,
}) {
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));

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
                  onChange={(event) => onToggleAll(rows, event.target.checked)}
                />
                เลือก / Action
              </label>
            </th>
            <th>DATE</th>
            <th>GROUP ORDER</th>
            <th>MACHINE</th>
            <th>Part ID</th>
            <th>Part Name</th>
            <th>Part Detail</th>
            <th>MAKER</th>
            <th>AMOUNT</th>
            <th>UNIT</th>
            <th>RFQ</th>
            <th>สถานะขอราคา</th>
            <th>สร้าง Order แล้ว</th>
            <th>คงเหลือ</th>
            <th>ผู้ขอ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stage = row.quotation_stage_status || "DRAFT";
            return (
              <tr
                key={row.id}
                style={selected.has(row.id) ? { background: "#f5f3ff" } : undefined}
              >
                <td className="sticky-action">
                  <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={(event) => onToggle(row.id, event.target.checked)}
                    />
                    <b style={{ fontSize: 9, color: "#94a3b8" }}>
                      {row.order_number}
                    </b>
                  </div>
                  <div className="row-actions">
                    {auth.can("can_edit_order_info") && (
                      <button className="mini" onClick={() => onEdit(row)}>
                        ข้อมูล
                      </button>
                    )}
                    <button className="mini" onClick={() => onQuotation(row)}>
                      Quotation
                    </button>
                  </div>
                </td>
                <td>{row.date}</td>
                <td>{row.group_order || "-"}</td>
                <td>{row.machine_name || row.machine_code || "-"}</td>
                <td><b>{row.item_id || "-"}</b></td>
                <td>{row.part_name}</td>
                <td className="detail-cell">{row.part_detail}</td>
                <td>{row.maker}</td>
                <td>{fmt(row.amount)}</td>
                <td>{row.unit}</td>
                <td>{row.rfq_count ? fmt(row.rfq_count) : "-"}</td>
                <td>
                  <span className={`status ${stage.includes("CREATED") ? "success" : stage === "DRAFT" ? "muted" : "info"}`}>
                    {QUOTATION_STAGE_LABELS[stage] || stage}
                  </span>
                </td>
                <td>{fmt(row.converted_quantity)}</td>
                <td>{fmt(row.remaining_quantity)}</td>
                <td>{row.ordered_by || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function QuotationConversionModal({ project, rows, onClose, onSaved }) {
  const [preview, setPreview] = useState(null);
  const [choices, setChoices] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setError("");
    apiPost(`/order-projects/${project.id}/quotation-conversion-preview/`, {
      quotation_order_ids: rows.map((row) => row.id),
    })
      .then((data) => {
        if (!active) return;
        const initial = {};
        for (const row of data.results || []) {
          const ready = (row.quotes || []).find((quote) => quote.ready);
          initial[row.id] = {
            rfq_id: ready?.id || "",
            amount: row.remaining_quantity || 0,
            price_per_unit: ready?.price ?? "",
            currency: ready?.currency || "THB",
          };
        }
        setPreview(data);
        setChoices(initial);
      })
      .catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, [project.id, rows]);

  function setChoice(orderId, key, value) {
    setChoices((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] || {}), [key]: value },
    }));
  }

  function chooseQuote(row, rfqId) {
    const quote = (row.quotes || []).find((item) => item.id === rfqId);
    setChoices((current) => ({
      ...current,
      [row.id]: {
        ...(current[row.id] || {}),
        rfq_id: rfqId,
        price_per_unit: quote?.price ?? "",
        currency: quote?.currency || "THB",
      },
    }));
  }

  async function submit(event) {
    event.preventDefault();
    const items = (preview?.results || []).map((row) => ({
      quotation_order_id: row.id,
      rfq_id: choices[row.id]?.rfq_id || "",
      amount: Number(choices[row.id]?.amount || 0),
      price_per_unit: choices[row.id]?.price_per_unit,
      currency: choices[row.id]?.currency || "THB",
    }));
    if (items.some((item) =>
      !item.rfq_id ||
      item.amount <= 0 ||
      item.price_per_unit === "" ||
      Number(item.price_per_unit) < 0
    )) {
      setError("กรุณาเลือกใบเสนอราคา ระบุจำนวน และราคาต่อหน่วยให้ครบทุกรายการ");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiPost(
        `/order-projects/${project.id}/quotation-convert/`,
        { items }
      );
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="สร้างไปยัง Order Step" onClose={onClose} wide>
      <p className="helper">
        เลือกใบเสนอราคาและจำนวนที่จะสั่ง ระบบจะสร้าง Order จริงใหม่โดยเก็บรายการขอราคาเดิมไว้
      </p>
      {preview?.employee && (
        <div className="alert success">
          ผู้ดำเนินการ: {preview.employee.employee_code} · {preview.employee.name}
        </div>
      )}
      <form onSubmit={submit}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Part ID / Part</th>
                <th>จำนวนคงเหลือ</th>
                <th>ใบเสนอราคาที่เลือก *</th>
                <th>ราคาต่อหน่วย / สกุลเงิน *</th>
                <th>จำนวนสร้าง Order *</th>
              </tr>
            </thead>
            <tbody>
              {(preview?.results || []).map((row) => {
                const readyQuotes = (row.quotes || []).filter((quote) => quote.ready);
                return (
                  <tr key={row.id}>
                    <td>
                      <b>{row.item_id || "-"}</b>
                      <div>{row.part_name}</div>
                      <small>{row.part_detail}</small>
                    </td>
                    <td>{fmt(row.remaining_quantity)} {row.unit}</td>
                    <td>
                      <select
                        required
                        value={choices[row.id]?.rfq_id || ""}
                        onChange={(event) => chooseQuote(row, event.target.value)}
                      >
                        <option value="">เลือก Vendor / ใบเสนอราคา</option>
                        {readyQuotes.map((quote) => (
                          <option key={quote.id} value={quote.id}>
                            {quote.rfq_number} · {quote.vendor} · {money(quote.price)} {quote.currency || "THB"}
                            {quote.lead_time_days != null ? ` · ${quote.lead_time_days} วัน` : ""}
                          </option>
                        ))}
                      </select>
                      {!readyQuotes.length && (
                        <small className="field-help">ยังไม่มีใบเสนอราคาที่บันทึก Vendor, วันที่รับ และราคาไว้ครบ</small>
                      )}
                    </td>
                    <td>
                      <div className="input-suffix">
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          required
                          value={choices[row.id]?.price_per_unit ?? ""}
                          onChange={(event) => setChoice(row.id, "price_per_unit", event.target.value)}
                        />
                        <input
                          style={{ maxWidth: 76 }}
                          maxLength="10"
                          required
                          value={choices[row.id]?.currency || "THB"}
                          onChange={(event) => setChoice(row.id, "currency", event.target.value.toUpperCase())}
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        max={row.remaining_quantity}
                        step="1"
                        required
                        value={choices[row.id]?.amount ?? ""}
                        onChange={(event) => setChoice(row.id, "amount", event.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!preview && !error && <div className="empty">กำลังตรวจสอบใบเสนอราคา...</div>}
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" disabled={busy || !preview}>
            {busy ? "กำลังสร้าง..." : "ยืนยันสร้าง Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}


function MonthlyOrderTables({ rows, auth, selected, onToggle, onToggleAll, onEdit, onPurchase, onInlineSave, onInlinePurchaseSave, options, dateBasis = "lifecycle" }) {
  const [openYears, setOpenYears] = useState({});
  const [openMonths, setOpenMonths] = useState({});
  const groups = useMemo(() => {
    const years = new Map();
    for (const row of rows) {
      const raw = dateBasis === "order"
        ? (row.date || row.order_date || row.created_at)
        : (row.cancelled_at || row.completed_at || row.received_at || row.date || row.order_date || row.updated_at);
      const d = raw ? new Date(raw) : null;
      const valid = d && !Number.isNaN(d.getTime());
      const year = valid ? String(d.getFullYear()) : String(row.date || "").slice(0, 4) || "ไม่ระบุปี";
      const mi = valid ? d.getMonth() : Math.max(0, Number(String(row.date || "").slice(5, 7)) - 1 || 0);
      const key = `${year}-${String(mi + 1).padStart(2, "0")}`;
      if (!years.has(year)) years.set(year, new Map());
      const months = years.get(year);
      if (!months.has(key)) months.set(key, { key, label: MONTHS_TH[mi] || key, rows: [] });
      months.get(key).rows.push(row);
    }
    return Array.from(years.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([year, months]) => ({ year, months: Array.from(months.values()).sort((a, b) => b.key.localeCompare(a.key)) }));
  }, [rows, dateBasis]);

  useEffect(() => {
    if (!groups.length) return;
    const y = groups[0];
    const m = y.months[0];
    setOpenYears((prev) => Object.keys(prev).length ? prev : { [y.year]: true });
    if (m) setOpenMonths((prev) => Object.keys(prev).length ? prev : { [m.key]: true });
  }, [groups]);

  if (!groups.length) return <div className="empty">ไม่พบข้อมูล</div>;
  return <div className="history-groups">{groups.map((y) => <section className="history-year" key={y.year}>
    <button className="history-collapse year" onClick={() => setOpenYears((x) => ({ ...x, [y.year]: !x[y.year] }))}><span>{openYears[y.year] ? "▾" : "▸"} ปี {y.year}</span><b>{y.months.reduce((n, m) => n + m.rows.length, 0)} รายการ</b></button>
    {openYears[y.year] && <div className="history-months">{y.months.map((m) => <section className="history-month" key={m.key}>
      <button className="history-collapse month" onClick={() => setOpenMonths((x) => ({ ...x, [m.key]: !x[m.key] }))}><span>{openMonths[m.key] ? "▾" : "▸"} {m.label}</span><b>{m.rows.length} รายการ</b></button>
      {openMonths[m.key] && <OrderTable rows={m.rows} auth={auth} selected={selected} onToggle={onToggle} onToggleAll={onToggleAll} onEdit={onEdit} onPurchase={onPurchase} onInlineSave={onInlineSave} onInlinePurchaseSave={onInlinePurchaseSave} options={options} />}
    </section>)}</div>}
  </section>)}</div>;
}


function MonthlyProjectList({ projects, onSelect }) {
  const [openYears, setOpenYears] = useState({});
  const [openMonths, setOpenMonths] = useState({});
  const groups = useMemo(() => {
    const years = new Map();
    for (const project of projects) {
      const raw = project.created_at || project.pending_data_date;
      const d = raw ? new Date(raw) : null;
      const valid = d && !Number.isNaN(d.getTime());
      const year = valid ? String(d.getFullYear()) : "ไม่ระบุปี";
      const mi = valid ? d.getMonth() : 0;
      const key = valid
        ? `${year}-${String(mi + 1).padStart(2, "0")}`
        : `${year}-00`;
      if (!years.has(year)) years.set(year, new Map());
      const months = years.get(year);
      if (!months.has(key)) {
        months.set(key, {
          key,
          label: valid ? (MONTHS_TH[mi] || key) : "ไม่ระบุเดือน",
          projects: [],
        });
      }
      months.get(key).projects.push(project);
    }
    return Array.from(years.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([year, months]) => ({
        year,
        months: Array.from(months.values()).sort((a, b) => b.key.localeCompare(a.key)),
      }));
  }, [projects]);

  useEffect(() => {
    if (!groups.length) return;
    const y = groups[0];
    const m = y.months[0];
    setOpenYears((prev) => Object.keys(prev).length ? prev : { [y.year]: true });
    if (m) setOpenMonths((prev) => Object.keys(prev).length ? prev : { [m.key]: true });
  }, [groups]);

  if (!groups.length) return <div className="empty">ไม่พบ Project</div>;

  return (
    <div className="history-groups">
      {groups.map((y) => (
        <section className="history-year" key={y.year}>
          <button
            className="history-collapse year"
            onClick={() => setOpenYears((x) => ({ ...x, [y.year]: !x[y.year] }))}
          >
            <span>{openYears[y.year] ? "▾" : "▸"} ปี {y.year}</span>
            <b>{y.months.reduce((n, m) => n + m.projects.length, 0)} Project</b>
          </button>
          {openYears[y.year] && (
            <div className="history-months">
              {y.months.map((m) => (
                <section className="history-month" key={m.key}>
                  <button
                    className="history-collapse month"
                    onClick={() => setOpenMonths((x) => ({ ...x, [m.key]: !x[m.key] }))}
                  >
                    <span>{openMonths[m.key] ? "▾" : "▸"} {m.label}</span>
                    <b>{m.projects.length} Project</b>
                  </button>
                  {openMonths[m.key] && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>PROJECT</th>
                            <th>OWNER</th>
                            <th>CREATED</th>
                            <th>STEP</th>
                            <th>ขอราคา</th>
                            <th>ORDER จริง</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.projects.map((project) => (
                            <tr
                              key={project.id}
                              role="button"
                              tabIndex={0}
                              title="กดเพื่อเปิด Project"
                              style={{ cursor: "pointer" }}
                              onClick={() => onSelect(project)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelect(project);
                                }
                              }}
                            >
                              <td><b>{project.name}</b></td>
                              <td>{project.owner_name || "-"}</td>
                              <td>{project.created_at ? formatDMY(project.created_at) : "-"}</td>
                              <td>{fmt(project.step_count)}</td>
                              <td>{fmt(project.quotation_items)}</td>
                              <td>{fmt(project.total_items)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function BulkActions({ rows, auth, busy, onRun, onClear, onRfq }) {
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
  const canRfq = count > 0 && rows.every((o) =>
    ["ACTIVE", "WAIT_CONFIRM"].includes(o.lifecycle_status)
  );

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
            className="btn primary"
            disabled={!canRfq || busy}
            onClick={onRfq}
          >
            บันทึกขอราคา
          </button>
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

function QuotationBulkActions({
  rows,
  auth,
  busy,
  onRfq,
  onConvert,
  onDelete,
  onClear,
}) {
  const count = rows.length;
  const canRfq = count > 0 && rows.every((row) =>
    ["ACTIVE", "WAIT_CONFIRM"].includes(row.lifecycle_status)
  );
  const canConvert =
    count > 0 && rows.every((row) => Number(row.remaining_quantity || 0) > 0);

  return (
    <div
      className="toolbar wrap"
      style={{
        padding: 10,
        marginBottom: 12,
        border: "1px solid #dbeafe",
        borderRadius: 12,
        background: "#eff6ff",
      }}
    >
      <strong style={{ fontSize: 11, marginRight: 4 }}>
        เลือกแล้ว {fmt(count)} รายการ
      </strong>
      {auth.can("can_edit_purchase_info") && (
        <button
          className="btn primary"
          disabled={!canRfq || busy}
          onClick={onRfq}
        >
          บันทึกขอราคา
        </button>
      )}
      {auth.can("can_create_order_from_quotation") && (
        <button
          className="btn success"
          disabled={!canConvert || busy}
          onClick={onConvert}
        >
          สร้างไปยัง Order Step
        </button>
      )}
      {auth.can("can_delete_order") && (
        <button
          className="btn danger"
          disabled={!count || busy}
          onClick={onDelete}
        >
          ลบรายการขอราคา
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
          <SearchableSelect
            required
            value={ownerId}
            options={options.employees || []}
            onChange={setOwnerId}
            getLabel={(x) => x.name}
            getSearchText={(x) => `${x.employee_code || ""} ${x.name || ""} ${x.department || ""}`}
            placeholder="พิมพ์ชื่อพนักงาน"
          />
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
  const { options } = useOptions();
  const [rows, setRows] = useState([]);
  const [kpi, setKpi] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [job, setJob] = useState("");
  const [status, setStatus] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const [editor, setEditor] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [rfqCompose, setRfqCompose] = useState(false);

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [projectModal, setProjectModal] = useState(false);
  const [projectDepartment, setProjectDepartment] = useState("MODIFY");
  const [projectPhase, setProjectPhase] = useState("quotation");
  const [projectSearch, setProjectSearch] = useState("");
  const [conversionRows, setConversionRows] = useState(null);

  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importTargetStep, setImportTargetStep] = useState(null);
  const fileRef = useRef(null);
  const orderImportFileRef = useRef(null);
  const [orderImportBusy, setOrderImportBusy] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [showAllDates, setShowAllDates] = useState(false);
  const [dateRangeInfo, setDateRangeInfo] = useState(null);

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
      if (showAllDates) params.set("date_range", "all");
      const data = await apiGet(`/orders/?${params}`, { forceRefresh });
      setRows(data.results || []);
      setKpi(data.kpi || {});
      setLastLoadedAt(new Date());
      setDateRangeInfo(
        data.date_range_limited
          ? { from: data.date_from }
          : null
      );
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
    const timer = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [qInput]);

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
    showAllDates,
  ]);

  useEffect(() => {
    setSelectedProject(null);
    setProjectDetail(null);
    setSelected(new Set());
  }, [projectDepartment]);

  useEffect(() => {
    setSelected(new Set());
  }, [projectPhase]);

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
    const key = projectPhase === "quotation" ? "quotation_orders" : "orders";
    return (projectDetail?.steps || []).flatMap((step) => step[key] || []);
  }, [tab, rows, projectDetail, projectPhase]);

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

  async function inlineSave(order, field, value) {
    setError("");
    try {
      const updated = await apiPatch(`/orders/${order.id}/info/`, {
        [field]: value,
      });
      setRows((current) =>
        current.map((r) => (r.id === order.id ? updated : r))
      );
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function inlinePurchaseSave(order, field, value) {
    setError("");
    try {
      const updated = await apiPatch(`/orders/${order.id}/purchase/`, {
        [field]: value,
      });
      setRows((current) =>
        current.map((r) => (r.id === order.id ? updated : r))
      );
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function quickAddOrder() {
    setError("");
    try {
      const created = await apiPost("/orders/quick-add/", {});
      setRows((current) => [created, ...current]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function restoreOrder(order) {
    if (
      !window.confirm(
        `กู้คืน Order ${order.order_number} กลับมาใช้งาน ?\n` +
          `Order จะกลับไปแสดงในแท็บสถานะเดิมของมันตามปกติ`
      )
    )
      return;
    setRestoringId(order.id);
    setError("");
    try {
      await apiPost(`/orders/${order.id}/restore/`, {});
      await loadOrders(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoringId(null);
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

  async function updateStepStatus(step, status) {
    if (!selectedProject || !step) return;
    setError("");
    try {
      await apiPatch(
        `/order-projects/${selectedProject.id}/steps/${step.id}/status/`,
        { status }
      );
      await selectProject(selectedProject, true);
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
      "PART ID": "",
      "PART NAME": "กรอกเมื่อไม่มี Part ID",
      "PART DETAIL": "กรอกเมื่อไม่มี Part ID",
      MAKER: "กรอกเมื่อไม่มี Part ID",
      AMOUNT: 1,
      UNIT: "EA",
      REMARK: "",
      "ORDERED BY": auth.employee?.name || "",
      QUOTATION: "",
      "PO NUMBER": "",
      "PRICE PER UNIT": "",
      CURRENCY: "THB",
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
      ["PART ID ถ้ามี ระบบจะดึง Part Name / Detail / Maker / Unit จาก Part Master"],
      ["ถ้าใส่ Vendor Order ต้องมี Quotation ก่อน"],
      ["PO NUMBER + ISSUE PR DATE + DUE DATE ต้องใส่ครบทั้ง 3 ช่อง"],
      ["วันที่รองรับ yyyy-mm-dd หรือ dd/mm/yyyy"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Template");
    XLSX.utils.book_append_sheet(wb, guide, "วิธีใช้");
    XLSX.writeFile(
      wb,
      `order_step_${projectDepartment.toLowerCase()}_${projectPhase}_template.xlsx`
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
          item_id: readCell(r, "PART ID", "ITEM ID", "ITEM", "PART NO"),
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
          currency: readCell(r, "CURRENCY") || "THB",
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
        {
          filename: file.name,
          procurement_phase:
            projectPhase === "quotation" ? "QUOTATION" : "PURCHASE",
          rows: normalized,
        }
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

  function downloadOrderImportTemplate() {
    const example = {
      "ORDER NUMBER": "เว้นว่าง = สร้างใหม่ · ใส่เลข Order เดิม = ลบของเดิมแล้วแทนที่ด้วยแถวนี้",
      DATE: new Date().toISOString().slice(0, 10),
      FACTORY: "Phase4",
      "MACHINE NAME": "ใส่รหัสหรือชื่อ Machine ที่มีในระบบ",
      JOB: "REPAIR",
      "URGENT STATUS": "",
      "PENDING DATA DATE": "",
      "PART ID": "",
      "PART NAME": "กรอกเมื่อไม่มี Part ID",
      "PART DETAIL": "กรอกเมื่อไม่มี Part ID",
      MAKER: "กรอกเมื่อไม่มี Part ID",
      AMOUNT: 1,
      UNIT: "EA",
      REMARK: "",
      "ORDERED BY": auth.employee?.name || "",
      QUOTATION: "",
      "PO NUMBER": "",
      "PRICE PER UNIT": "",
      CURRENCY: "THB",
      "VENDOR ORDER": "",
      "LEAD TIME": "",
      "ISSUE PR DATE": "",
      "DUE DATE": "",
      "VENDOR CONFIRM DATE": "",
      "PERSON IN CHARGE OF ORDER": "",
    };

    const ws = XLSX.utils.json_to_sheet([example], { header: ORDER_IMPORT_HEADERS });
    const guide = XLSX.utils.aoa_to_sheet([
      ["PartsFlow Order Import / Replace"],
      ["ให้แก้ไขแถวตัวอย่างเป็นข้อมูลจริงก่อน Import"],
      ["ORDER NUMBER เว้นว่างไว้ = ระบบจะสร้าง Order ใหม่ให้"],
      ["ORDER NUMBER ที่ตรงกับ Order เดิมในระบบ = ลบของเดิมแล้วแทนที่ด้วยข้อมูลแถวนี้ (ใช้เลข Order เดิม)"],
      ["MACHINE NAME ต้องตรงกับรหัสหรือชื่อในระบบ"],
      ["JOB จำเป็นต้องใส่ (REPAIR / MODIFY / AUTOMATION / PM หรืออื่น ๆ)"],
      ["PART ID ถ้ามี ระบบจะดึง Part Name / Detail / Maker / Unit จาก Part Master"],
      ["ถ้าใส่ Vendor Order ต้องมี Quotation ก่อน"],
      ["PO NUMBER + ISSUE PR DATE + DUE DATE ต้องใส่ครบทั้ง 3 ช่อง"],
      ["วันที่รองรับ yyyy-mm-dd หรือ dd/mm/yyyy"],
      ["Import ได้สูงสุดครั้งละ 1000 แถว"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Template");
    XLSX.utils.book_append_sheet(wb, guide, "วิธีใช้");
    XLSX.writeFile(wb, `orders_import_template.xlsx`);
  }

  function chooseOrderImport() {
    window.setTimeout(() => orderImportFileRef.current?.click(), 0);
  }

  async function importOrdersExcel(file) {
    if (!file) return;
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
          order_number: readCell(r, "ORDER NUMBER", "ORDER NO"),
          date: excelDate(readCell(r, "DATE", "ORDER DATE")),
          factory: String(readCell(r, "FACTORY", "WAREHOUSE") || "Phase4")
            .toLowerCase()
            .includes("11")
            ? "MM-11"
            : "MM-4",
          machine: readCell(r, "MACHINE NAME", "MACHINE", "M/C"),
          job: readCell(r, "JOB"),
          urgent_status: readCell(r, "URGENT STATUS", "สถานะงานด่วน"),
          pending_data_date: excelDate(
            readCell(r, "PENDING DATA DATE", "วันที่งานค้าง")
          ),
          item_id: readCell(r, "PART ID", "ITEM ID", "ITEM", "PART NO"),
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
          currency: readCell(r, "CURRENCY") || "THB",
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

      const replaceCount = normalized.filter((r) => r.order_number).length;
      const newCount = normalized.length - replaceCount;
      if (
        !window.confirm(
          `พบ ${normalized.length} แถวในไฟล์\n` +
            `- ${replaceCount} แถวมี ORDER NUMBER ตรงกับ Order เดิม จะลบของเดิมแล้วแทนที่ด้วยข้อมูลใหม่\n` +
            `- ${newCount} แถวไม่มี ORDER NUMBER ตรงกับของเดิม จะสร้างเป็น Order ใหม่\n\n` +
            `การลบของเดิมไม่สามารถย้อนกลับได้ ยืนยันการ Import ?`
        )
      ) {
        return;
      }

      setOrderImportBusy(true);
      const result = await apiPost("/orders/import/", {
        filename: file.name,
        rows: normalized,
      });

      const parts = [];
      if (result.replaced) parts.push(`แทนที่ ${result.replaced} รายการ`);
      if (result.created) parts.push(`สร้างใหม่ ${result.created} รายการ`);
      if (result.errors?.length) {
        const details = result.errors
          .slice(0, 5)
          .map((x) => `แถว ${x.row}: ${x.error}`)
          .join(" | ");
        parts.push(`ข้าม ${result.errors.length} แถว · ${details}`);
      }
      setError(parts.join(" · ") || "Import สำเร็จ");

      await loadOrders(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setOrderImportBusy(false);
      if (orderImportFileRef.current) orderImportFileRef.current.value = "";
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
      "PART ID": o.item_id || "",
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
      CURRENCY: o.currency || "THB",
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

  const kpiBlocks = tab !== "step" && tab !== "deleted" && (
    <>
      <div className="kpi-grid five">
        <div className="kpi-card">
          <span>จำนวนออเดอร์ทั้งหมด</span>
          <strong>{fmt(kpi.total)}</strong>
        </div>
        <div className="kpi-card danger">
          <span>งานด่วนเครื่องหยุด</span>
          <strong>{fmt(kpi.urgent_stop)}</strong>
        </div>
        <div className="kpi-card warning">
          <span>งานด่วนเครื่องไม่หยุด</span>
          <strong>{fmt(kpi.urgent_no_stop)}</strong>
        </div>
        <div className="kpi-card info">
          <span>งานค้าง DATA</span>
          <strong>{fmt(kpi.pending)}</strong>
        </div>
        <div className="kpi-card">
          <span>Wait Confirm Order</span>
          <strong>{fmt(kpi.wait_confirm)}</strong>
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
            <>
              <button className="btn ghost" onClick={quickAddOrder}>
                + เพิ่มแถวว่าง
              </button>
              <button
                className="btn primary"
                onClick={() => setEditor({ order: null, project: null })}
              >
                + เพิ่ม Order ปกติ
              </button>
            </>
          ) : null
        }
      />

      <Alert>{error}</Alert>
      {kpiBlocks}

      {dateRangeInfo && !showAllDates && (
        <div
          className="toolbar wrap"
          style={{
            padding: "8px 12px",
            marginBottom: 10,
            border: "1px solid #fde68a",
            background: "#fffbeb",
            borderRadius: 10,
            fontSize: 13,
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span>
            แสดงเฉพาะ Order ตั้งแต่ {dateRangeInfo.from} เป็นต้นมา (120 วันล่าสุด)
            เพื่อลดการใช้งานฐานข้อมูล
          </span>
          <button
            className="btn ghost"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setShowAllDates(true)}
          >
            ดูข้อมูลทั้งหมด
          </button>
        </div>
      )}
      {showAllDates && (
        <div
          className="toolbar wrap"
          style={{
            padding: "8px 12px",
            marginBottom: 10,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            borderRadius: 10,
            fontSize: 13,
            color: "#1e40af",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span>กำลังแสดง Order ทั้งหมดทุกช่วงเวลา (ใช้ข้อมูลมากกว่าปกติ)</span>
          <button
            className="btn ghost"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setShowAllDates(false)}
          >
            กลับไป 120 วันล่าสุด
          </button>
        </div>
      )}

      {!stepPage && (
      <div className="tab-row page-tabs">
        {ORDER_TABS.filter(
          ([key]) =>
            (key !== "updates" || auth.can("can_view_order_updates")) &&
            (key !== "deleted" || auth.can("can_view_deleted_orders"))
        ).map(([key, label]) => (
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
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="ค้นหา Order / Part ID / Part / Machine / ผู้สั่ง..."
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
            {lastLoadedAt && (
              <span style={{ fontSize: 12, color: "#94a3b8", alignSelf: "center" }}>
                อัปเดตล่าสุด {lastLoadedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}

            {tab === "normal" &&
              auth.can("can_add_order") &&
              auth.can("can_delete_order") && (
                <>
                  <button className="btn ghost" onClick={downloadOrderImportTemplate}>
                    ⬇ Template
                  </button>
                  <button
                    className="btn ghost"
                    onClick={chooseOrderImport}
                    disabled={orderImportBusy}
                  >
                    {orderImportBusy ? "กำลัง Import..." : "⬆ Import Excel"}
                  </button>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    ref={orderImportFileRef}
                    style={{ display: "none" }}
                    onChange={(e) => importOrdersExcel(e.target.files?.[0])}
                  />
                </>
              )}
          </div>

          {tab !== "deleted" && (
            <BulkActions
              rows={selectedRows}
              auth={auth}
              busy={bulkBusy}
              onRun={runBulk}
              onClear={() => setSelected(new Set())}
              onRfq={() => setRfqCompose(true)}
            />
          )}

          {loading ? (
            <div className="empty">กำลังโหลด...</div>
          ) : tab === "deleted" ? (
            <DeletedOrderTable
              rows={rows}
              onRestore={restoreOrder}
              restoringId={restoringId}
            />
          ) : (
            ["normal", "completed", "cancelled"].includes(tab) ? (
              <MonthlyOrderTables
                rows={rows}
                auth={auth}
                selected={selected}
                onToggle={toggleSelected}
                onToggleAll={toggleAll}
                onEdit={(order) => setEditor({ order, project: null })}
                onPurchase={setPurchase}
                onInlineSave={inlineSave}
                onInlinePurchaseSave={inlinePurchaseSave}
                options={options}
                dateBasis={tab === "normal" ? "order" : "lifecycle"}
              />
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
                onInlineSave={inlineSave}
                onInlinePurchaseSave={inlinePurchaseSave}
                options={options}
              />
            )
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

          {!selectedProject && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>
                    {projectDepartment === "MODIFY"
                      ? "Modify Projects"
                      : "Automation Projects"}
                  </h2>
                  <p>เลือก Project จากรายการที่แยกตามเดือน / ปี</p>
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
              </div>

              <MonthlyProjectList
                projects={shownProjects}
                onSelect={selectProject}
              />
            </section>
          )}

          {selectedProject && (
          <section className="project-content">
              {projectDetail ? (
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
                      <button
                        className="btn ghost"
                        onClick={() => {
                          setSelectedProject(null);
                          setProjectDetail(null);
                          setSelected(new Set());
                        }}
                      >
                        ← กลับรายการ Project
                      </button>
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

                  <div className="tab-row page-tabs">
                    <button
                      className={`tab ${projectPhase === "quotation" ? "active" : ""}`}
                      onClick={() => setProjectPhase("quotation")}
                    >
                      ช่วงขอราคา ({fmt(projectDetail.project.quotation_items)})
                    </button>
                    <button
                      className={`tab ${projectPhase === "purchase" ? "active" : ""}`}
                      onClick={() => setProjectPhase("purchase")}
                    >
                      Order Step / สั่งซื้อจริง ({fmt(projectDetail.project.total_items)})
                    </button>
                  </div>

                  {projectPhase === "quotation" ? (
                    <div className="kpi-grid three">
                      <div className="kpi-card info">
                        <span>รอใบเสนอราคา</span>
                        <strong>{fmt(projectDetail.project.quotation_waiting)}</strong>
                      </div>
                      <div className="kpi-card warning">
                        <span>ได้รับราคา / พร้อมสร้าง Order</span>
                        <strong>{fmt(projectDetail.project.quotation_received)}</strong>
                      </div>
                      <div className="kpi-card success">
                        <span>สร้าง Order ครบแล้ว</span>
                        <strong>{fmt(projectDetail.project.quotation_converted)}</strong>
                      </div>
                    </div>
                  ) : (
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
                  )}

                  {projectPhase === "quotation" ? (
                    <QuotationBulkActions
                      rows={selectedRows}
                      auth={auth}
                      busy={bulkBusy}
                      onRfq={() => setRfqCompose(true)}
                      onConvert={() => setConversionRows([...selectedRows])}
                      onDelete={() => runBulk("delete")}
                      onClear={() => setSelected(new Set())}
                    />
                  ) : (
                    <BulkActions
                      rows={selectedRows}
                      auth={auth}
                      busy={bulkBusy}
                      onRun={runBulk}
                      onClear={() => setSelected(new Set())}
                      onRfq={() => setRfqCompose(true)}
                    />
                  )}

                  {projectDetail.steps.length ? (
                    projectDetail.steps.map((step) => {
                      const phaseRows = projectPhase === "quotation"
                        ? (step.quotation_orders || [])
                        : (step.orders || []);
                      return (
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
                            {auth.can("can_manage_order_projects") ? (
                              <select
                                value={step.status || "WAIT_QUOTATION"}
                                onChange={(e) =>
                                  updateStepStatus(step, e.target.value)
                                }
                                style={{ fontSize: 11 }}
                              >
                                {STEP_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="status info">
                                {step.status_label || "รอขอราคา"}
                              </span>
                            )}
                            <span className="status info">
                              {phaseRows.length} รายการ
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
                                {projectPhase === "quotation"
                                  ? "+ เพิ่มรายการขอราคา"
                                  : "+ เพิ่ม Order"}
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
                        {projectPhase === "quotation" ? (
                          <QuotationTable
                            rows={phaseRows}
                            auth={auth}
                            selected={selected}
                            onToggle={toggleSelected}
                            onToggleAll={toggleAll}
                            onEdit={(order) =>
                              setEditor({ order, project: projectDetail.project })
                            }
                            onQuotation={setPurchase}
                          />
                        ) : (
                          <OrderTable
                            rows={phaseRows}
                            auth={auth}
                            selected={selected}
                            onToggle={toggleSelected}
                            onToggleAll={toggleAll}
                            onEdit={(order) =>
                              setEditor({ order, project: projectDetail.project })
                            }
                            onPurchase={setPurchase}
                          />
                        )}
                      </div>
                    );})
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
          )}
        </>
      )}

      {editor && (
        <OrderInfoModal
          order={editor.order}
          project={editor.project}
          step={editor.step}
          options={options}
          employee={auth.employee}
          quotationMode={
            !!editor.project &&
            (editor.order?.procurement_phase === "QUOTATION" || projectPhase === "quotation")
          }
          canEditOrderDate={auth.can("can_edit_order_date")}
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

      {rfqCompose && (
        <RFQComposeModal
          orders={selectedRows}
          options={options}
          onClose={() => setRfqCompose(false)}
          onRecorded={async () => {
            setRfqCompose(false);
            setSelected(new Set());
            await refresh();
          }}
        />
      )}

      {conversionRows && selectedProject && (
        <QuotationConversionModal
          project={selectedProject}
          rows={conversionRows}
          onClose={() => setConversionRows(null)}
          onSaved={async () => {
            setConversionRows(null);
            setSelected(new Set());
            await refresh();
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
