import { useMemo, useState } from "react";
import { apiPatch, apiPost } from "../api";
import { Alert, Modal } from "./Common";

function partLabel(p) { return `${p.sku} · ${p.name}`; }
function findPart(parts, value) {
  const t = String(value || "").trim().toLowerCase();
  return (parts || []).find(p => partLabel(p).toLowerCase() === t || String(p.sku).toLowerCase() === t);
}

export default function SpareSetModal({ spareSet, options, onClose, onSaved }) {
  const edit = !!spareSet?.id;
  const initialItems = (spareSet?.items || []).map(x => ({
    partText: `${x.sku} · ${x.name}`,
    part_id: x.part_id,
    quantity: x.quantity || 1,
    remark: x.remark || "",
  }));
  const [form, setForm] = useState({
    machine_id: spareSet?.machine_id || "",
    name: spareSet?.name || "",
    description: spareSet?.description || "",
    active: spareSet?.active !== false,
    items: initialItems.length ? initialItems : [{ partText: "", part_id: "", quantity: 1, remark: "" }],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parts = options.parts || [];
  const machines = options.machines || [];
  const duplicateIds = useMemo(() => {
    const seen = new Set(), dup = new Set();
    form.items.forEach(x => { if (!x.part_id) return; seen.has(x.part_id) ? dup.add(x.part_id) : seen.add(x.part_id); });
    return dup;
  }, [form.items]);

  function set(k, v) { setForm(x => ({ ...x, [k]: v })); }
  function updateItem(index, patch) {
    setForm(x => ({ ...x, items: x.items.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  }
  function changePart(index, value) {
    const part = findPart(parts, value);
    updateItem(index, { partText: value, part_id: part?.id || "" });
  }
  function addItem() {
    setForm(x => ({ ...x, items: [...x.items, { partText: "", part_id: "", quantity: 1, remark: "" }] }));
  }
  function removeItem(index) {
    setForm(x => ({ ...x, items: x.items.filter((_, i) => i !== index) }));
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!form.machine_id) return setError("กรุณาเลือกเครื่องจักร");
    if (!form.name.trim()) return setError("กรุณาระบุชื่อ Set");
    if (form.items.some(x => !x.part_id)) return setError("กรุณาเลือกอะไหล่จากรายการให้ครบ");
    if (duplicateIds.size) return setError("มีอะไหล่ซ้ำใน Set");
    if (form.items.some(x => Number(x.quantity) <= 0)) return setError("จำนวนต่อ Set ต้องมากกว่า 0");

    const payload = {
      machine_id: form.machine_id,
      name: form.name.trim(),
      description: form.description.trim(),
      active: !!form.active,
      items: form.items.map(x => ({ part_id: x.part_id, quantity: x.quantity, remark: x.remark || "" })),
    };
    setBusy(true);
    try {
      const result = edit
        ? await apiPatch(`/spare-sets/${spareSet.id}/`, payload)
        : await apiPost("/spare-sets/", payload);
      onSaved(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <Modal title={edit ? "แก้ไข Machine Spare Set" : "สร้าง Machine Spare Set"} onClose={onClose} wide>
    <form onSubmit={save}>
      <div className="form-grid three">
        <label className="field span2"><span>Machine *</span><select value={form.machine_id} onChange={e => set("machine_id", e.target.value)} required><option value="">เลือกเครื่องจักร</option>{machines.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)}/> Active</label>
        <label className="field span3"><span>ชื่อ Set *</span><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="เช่น PM 6 Months / Overhaul / Emergency Spare" required/></label>
        <label className="field span3"><span>รายละเอียด Set</span><textarea rows="2" value={form.description} onChange={e => set("description", e.target.value)} placeholder="อธิบายการใช้งานของ Set นี้"/></label>
      </div>

      <div className="section-head spare-set-items-head"><div><h2>รายการอะไหล่ใน Set</h2><p>เลือกอะไหล่และกำหนดจำนวนที่ใช้ต่อ 1 Set</p></div><button type="button" className="btn ghost" onClick={addItem}>+ เพิ่มอะไหล่</button></div>
      <div className="spare-set-editor-list">
        {form.items.map((row, index) => <div className={`spare-set-editor-row ${row.part_id && duplicateIds.has(row.part_id) ? "duplicate" : ""}`} key={index}>
          <div className="spare-set-editor-no">{index + 1}</div>
          <label className="field spare-set-part-field"><span>อะไหล่ *</span><input list="spare-set-parts" value={row.partText} onChange={e => changePart(index, e.target.value)} placeholder="Item ID · Part Name"/></label>
          <label className="field"><span>จำนวน / Set *</span><input type="number" min="0.01" step="0.01" value={row.quantity} onChange={e => updateItem(index, { quantity: e.target.value })}/></label>
          <label className="field"><span>Remark</span><input value={row.remark} onChange={e => updateItem(index, { remark: e.target.value })}/></label>
          <button type="button" className="mini danger spare-set-remove" onClick={() => removeItem(index)} disabled={form.items.length === 1}>ลบ</button>
        </div>)}
      </div>
      <datalist id="spare-set-parts">{parts.map(p => <option key={p.id} value={partLabel(p)}/>)}</datalist>

      <Alert>{error}</Alert>
      <div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก Set"}</button></div>
    </form>
  </Modal>;
}
