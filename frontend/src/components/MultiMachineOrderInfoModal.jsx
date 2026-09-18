import { useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";
import { Alert, Modal, SearchableSelect } from "./Common";

const URGENT = [
  "งานด่วนเครื่องหยุด",
  "งานด่วนเครื่องไม่หยุด",
  "งานด่วน + ค้าง DATA",
];

function isoToDMY(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function maskDMY(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function dmyToISO(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

export default function MultiMachineOrderInfoModal({
  order,
  options,
  employee,
  canEditOrderDate = false,
  onClose,
  onSaved,
}) {
  const edit = !!order?.id;
  const stockLocked = !!order?.received_at && !!order?.stock_received;
  const today = new Date().toISOString().slice(0, 10);
  const initialDate = order?.date || today;

  const initialMachineIds = Array.isArray(order?.machine_ids) && order.machine_ids.length
    ? order.machine_ids.map(String)
    : order?.machine_id
      ? [String(order.machine_id)]
      : [];

  const [form, setForm] = useState({
    date: initialDate,
    factory: order?.factory || "MM-4",
    machine_ids: initialMachineIds,
    job: order?.job || "",
    urgent_status: order?.urgent_status || "",
    pending_data_date: order?.pending_data_date || "",
    partText: order?.part_id ? `${order.item_id} · ${order.part_name}` : "",
    part_id: order?.part_id || "",
    part_name: order?.part_name || "",
    part_detail: order?.part_detail || "",
    maker: order?.maker || "",
    amount: order?.amount || 1,
    unit: order?.unit || "",
    remark: order?.remark || "",
    drawing_path: order?.drawing_path || "",
    ordered_by_id: order?.ordered_by_id || employee?.id || "",
  });
  const [dateText, setDateText] = useState(isoToDMY(initialDate));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeDate = (value) => {
    const displayValue = maskDMY(value);
    setDateText(displayValue);
    set("date", dmyToISO(displayValue));
  };
  const machines = options?.machines || [];
  const selectedMachines = useMemo(
    () => form.machine_ids
      .map((id) => machines.find((machine) => String(machine.id) === String(id)))
      .filter(Boolean),
    [form.machine_ids, machines]
  );
  const remainingMachines = useMemo(
    () => machines.filter((machine) => !form.machine_ids.includes(String(machine.id))),
    [machines, form.machine_ids]
  );

  function addMachine(value) {
    const id = String(value || "");
    if (!id) return;
    setForm((current) => current.machine_ids.includes(id)
      ? current
      : { ...current, machine_ids: [...current.machine_ids, id] });
  }

  function removeMachine(id) {
    setForm((current) => ({
      ...current,
      machine_ids: current.machine_ids.filter((value) => String(value) !== String(id)),
    }));
  }

  function partChange(part) {
    if (part) {
      setForm((current) => ({
        ...current,
        partText: `${part.sku} · ${part.name}`,
        part_id: part.id,
        part_name: part.name,
        part_detail: part.description || "",
        maker: part.maker_name || "",
        unit: part.unit_code || "",
      }));
    } else {
      setForm((current) => ({ ...current, partText: "", part_id: "" }));
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!form.date) {
        throw new Error("กรุณากรอก DATE รูปแบบ dd/mm/yyyy ให้ถูกต้อง");
      }
      if (!form.machine_ids.length) {
        throw new Error("กรุณาเลือก MACHINE NAME อย่างน้อย 1 รายการ");
      }

      const selected = form.machine_ids
        .map((id) => machines.find((machine) => String(machine.id) === String(id)))
        .filter(Boolean);
      if (selected.length !== form.machine_ids.length) {
        throw new Error("มี MACHINE NAME บางรายการไม่ถูกต้อง กรุณาเลือกใหม่");
      }

      const ordered = (options?.employees || []).find(
        (item) => String(item.id) === String(form.ordered_by_id)
      );
      if (!ordered) throw new Error("กรุณาเลือกชื่อผู้สั่งจากรายการ");
      if (!form.job) throw new Error("กรุณาเลือก JOB");

      const machineIds = selected.map((machine) => String(machine.id));
      const payload = {
        date: form.date,
        factory: form.factory,
        machine_id: machineIds[0],
        machine_ids: machineIds,
        job: form.job,
        urgent_status: form.urgent_status,
        pending_data_date: form.pending_data_date,
        part_id: form.part_id,
        part_name: form.part_name,
        part_detail: form.part_detail,
        maker: form.maker,
        amount: form.amount,
        unit: form.unit,
        remark: form.remark,
        drawing_path: form.drawing_path,
        ordered_by_id: ordered.id,
        procurement_phase: "PURCHASE",
      };

      const result = edit
        ? await apiPatch(`/orders/${order.id}/info/`, payload)
        : await apiPost("/orders/", payload);
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={edit ? "แก้ไข Order Information" : "เพิ่ม Order"} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="section-label">1. Order Information</div>
        <Alert>{error}</Alert>
        {stockLocked && (
          <div className="alert success">
            รายการนี้รับเข้า Stock แล้ว: Part ID, JOB และ AMOUNT ถูกล็อก
          </div>
        )}

        <div className="form-grid three">
          <label className="field">
            <span>DATE *</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/yyyy"
              maxLength={10}
              readOnly={!canEditOrderDate}
              value={dateText}
              onChange={(event) => changeDate(event.target.value)}
              aria-label="DATE รูปแบบ dd/mm/yyyy"
            />
          </label>

          <label className="field">
            <span>FACTORY *</span>
            <select value={form.factory} onChange={(event) => set("factory", event.target.value)}>
              <option value="MM-4">Phase4</option>
              <option value="MM-11">Phase11</option>
            </select>
          </label>

          <label className="field">
            <span>JOB *</span>
            <select
              required
              disabled={stockLocked}
              value={form.job}
              onChange={(event) => set("job", event.target.value)}
            >
              <option value="">เลือก JOB</option>
              {(options?.jobs || []).map((job) => (
                <option key={job} value={job}>{job}</option>
              ))}
            </select>
          </label>

          <div className="field span3">
            <span>MACHINE NAME * (เลือกได้มากกว่า 1 เครื่อง)</span>
            <div className="order-machine-picker">
              {selectedMachines.length > 0 && (
                <div className="order-machine-selected">
                  {selectedMachines.map((machine, index) => (
                    <span className="order-machine-chip" key={machine.id}>
                      <b>{machine.code}</b>
                      {machine.name && <span>{machine.name}</span>}
                      {index === 0 && <small className="order-machine-primary">เครื่องหลัก</small>}
                      <button
                        type="button"
                        aria-label={`ลบ ${machine.code}`}
                        onClick={() => removeMachine(machine.id)}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <SearchableSelect
                value=""
                options={remainingMachines}
                onChange={(value) => addMachine(value)}
                getLabel={(machine) => `${machine.code}${machine.name ? ` · ${machine.name}` : ""}`}
                getSearchText={(machine) => `${machine.code || ""} ${machine.name || ""} ${machine.location || ""}`}
                placeholder="พิมพ์รหัส Machine เพื่อเพิ่ม"
                emptyText="ไม่พบ Machine หรือเลือกไว้แล้ว"
              />
            </div>
            <span className="field-help">
              เลือกได้หลายเครื่อง · เครื่องแรกเป็นเครื่องหลักสำหรับ workflow เดิมของระบบ
            </span>
          </div>

          <label className="field">
            <span>สถานะงานด่วน</span>
            <select
              value={form.urgent_status}
              onChange={(event) => set("urgent_status", event.target.value)}
            >
              <option value="">-</option>
              {URGENT.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          <label className="field">
            <span>วันที่งานค้าง</span>
            <input
              type="date"
              value={form.pending_data_date}
              onChange={(event) => set("pending_data_date", event.target.value)}
            />
          </label>

          <div />

          <label className="field span3">
            <span>Part ID (ไม่บังคับ)</span>
            <SearchableSelect
              disabled={stockLocked}
              value={form.part_id}
              initialLabel={form.partText}
              onSearch={async (text) => {
                if (!text.trim()) return [];
                const data = await apiGet(
                  `/parts/?q=${encodeURIComponent(text.trim())}&page_size=15`
                );
                return data.results || [];
              }}
              onChange={(_, part) => partChange(part)}
              getLabel={(part) => `${part.sku} · ${part.name}`}
              getSearchText={(part) => `${part.sku || ""} ${part.name || ""}`}
              placeholder="พิมพ์ Part ID หรือชื่อ Part"
            />
          </label>

          <label className="field">
            <span>Part Name *</span>
            <input
              required
              value={form.part_name}
              readOnly={!!form.part_id}
              onChange={(event) => set("part_name", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Part Detail *</span>
            <input
              required
              value={form.part_detail}
              readOnly={!!form.part_id}
              onChange={(event) => set("part_detail", event.target.value)}
            />
          </label>

          <label className="field">
            <span>MAKER *</span>
            <input
              required
              value={form.maker}
              readOnly={!!form.part_id}
              onChange={(event) => set("maker", event.target.value)}
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
              onChange={(event) => set("amount", event.target.value)}
            />
          </label>

          <label className="field">
            <span>UNIT *</span>
            <select
              value={form.unit}
              disabled={!!form.part_id}
              onChange={(event) => set("unit", event.target.value)}
              required
            >
              <option value="">-</option>
              {(options?.units || []).map((unit) => (
                <option key={unit.id} value={unit.code}>{unit.code}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>ORDERED BY *</span>
            <SearchableSelect
              required
              value={form.ordered_by_id}
              options={options?.employees || []}
              onChange={(value) => set("ordered_by_id", value)}
              getLabel={(item) => item.name}
              getSearchText={(item) => `${item.employee_code || ""} ${item.name || ""}`}
              placeholder="พิมพ์ชื่อหรือรหัสพนักงาน"
            />
          </label>

          <label className="field span3">
            <span>REMARK</span>
            <textarea
              rows="2"
              value={form.remark}
              onChange={(event) => set("remark", event.target.value)}
            />
          </label>

          <label className="field span3">
            <span>Drawing Path (ที่เก็บไฟล์ในเครื่อง/เซิร์ฟเวอร์)</span>
            <input
              value={form.drawing_path}
              onChange={(event) => set("drawing_path", event.target.value)}
              placeholder="เช่น \\server\drawings\project01\part-A.pdf"
            />
            <span className="field-help">
              บันทึกที่อยู่ไฟล์ Drawing เพื่ออ้างอิง โดยไม่ได้อัปโหลดไฟล์เข้า PartsFlow
            </span>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "กำลังบันทึก..." : edit ? "บันทึกการแก้ไข" : "สร้าง Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
