import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, fmt, money } from "../components/Common";

const blankPart = {
  sku: "", name: "", description: "", maker_name: "", category_id: "", unit_code: "",
  supplier_id: "", location_id: "", image_path: "", min_stock: 0,
  max_stock: 0, reorder_qty: 0, vendor_lead_time_days: 0,
  purchasing_lead_time_days: 0, last_purchase_price: 0, critical: false,
  active: true, remark: "",
};

function PartModal({ part, options, onClose, onSaved }) {
  const [form, setForm] = useState(part ? { ...blankPart, ...part } : blankPart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = !!part?.id;
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = edit
        ? await apiPatch(`/parts/${part.id}/`, form)
        : await apiPost("/parts/", form);
      onSaved(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <Modal title={edit ? "แก้ไขข้อมูลอะไหล่" : "เพิ่มรายการอะไหล่"} onClose={onClose} wide>
    <form onSubmit={save}>
      <div className="form-grid three">
        <label className="field"><span>Item ID *</span><input value={form.sku} onChange={e=>set("sku",e.target.value)} required /></label>
        <label className="field span2"><span>Part Name *</span><input value={form.name} onChange={e=>set("name",e.target.value)} required /></label>
        <label className="field span3"><span>Part Detail</span><textarea rows="2" value={form.description} onChange={e=>set("description",e.target.value)} /></label>
        <label className="field"><span>Maker</span><input value={form.maker_name} onChange={e=>set("maker_name",e.target.value)} /></label>
        <label className="field"><span>Category</span><select value={form.category_id||""} onChange={e=>set("category_id",e.target.value)}><option value="">-</option>{(options.categories||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field"><span>Unit</span><input list="unit-list" value={form.unit_code} onChange={e=>set("unit_code",e.target.value)} /><datalist id="unit-list">{(options.units||[]).map(x=><option key={x.id} value={x.code}/>)}</datalist></label>
        <label className="field"><span>Vendor</span><select value={form.supplier_id||""} onChange={e=>set("supplier_id",e.target.value)}><option value="">-</option>{(options.vendors||[]).map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
        <label className="field"><span>Location</span><select value={form.location_id||""} onChange={e=>set("location_id",e.target.value)}><option value="">-</option>{(options.locations||[]).map(x=><option key={x.id} value={x.id}>{x.code}</option>)}</select></label>
        <label className="field"><span>Min</span><input type="number" step="any" value={form.min_stock} onChange={e=>set("min_stock",e.target.value)} /></label>
        <label className="field"><span>Max</span><input type="number" step="any" value={form.max_stock} onChange={e=>set("max_stock",e.target.value)} /></label>
        <label className="field"><span>จำนวนที่ Order</span><input type="number" step="any" value={form.reorder_qty} onChange={e=>set("reorder_qty",e.target.value)} /></label>
        <label className="field"><span>Vendor Lead Time</span><div className="input-suffix"><input type="number" min="0" value={form.vendor_lead_time_days} onChange={e=>set("vendor_lead_time_days",e.target.value)} /><b>DAY</b></div></label>
        <label className="field"><span>Purchasing Lead Time</span><div className="input-suffix"><input type="number" min="0" value={form.purchasing_lead_time_days} onChange={e=>set("purchasing_lead_time_days",e.target.value)} /><b>DAY</b></div></label>
        <label className="field"><span>Last Purchase Price</span><div className="input-suffix"><input type="number" min="0" step="0.01" value={form.last_purchase_price} onChange={e=>set("last_purchase_price",e.target.value)} /><b>฿</b></div></label>
        <label className="field span3"><span>Image URL / Google Drive Path</span><input value={form.image_path} onChange={e=>set("image_path",e.target.value)} /></label>
        <label className="field span3"><span>Remark</span><textarea rows="2" value={form.remark} onChange={e=>set("remark",e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={!!form.critical} onChange={e=>set("critical",e.target.checked)}/> Critical Part</label>
        <label className="check"><input type="checkbox" checked={!!form.active} onChange={e=>set("active",e.target.checked)}/> Active</label>
      </div>
      <Alert>{error}</Alert>
      <div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy}>{busy?"กำลังบันทึก...":"บันทึก"}</button></div>
    </form>
  </Modal>;
}

function StockModal({ mode, part, options, employee, onClose, onSaved }) {
  const [qty, setQty] = useState("");
  const [requester, setRequester] = useState("");
  const [machine, setMachine] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const issue = mode === "issue";

  function findByLabel(list, label, kind) {
    const t = label.trim().toLowerCase();
    return list.find(x => {
      const s = kind === "employee" ? `${x.name}` : `${x.code} · ${x.name}`;
      return s.toLowerCase() === t || String(kind === "employee" ? x.employee_code : x.code).toLowerCase() === t;
    });
  }

  async function save(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const payload = { part_id: part.id, quantity: qty, note };
      if (issue) {
        const emp = findByLabel(options.employees||[], requester, "employee");
        const mc = findByLabel(options.machines||[], machine, "machine");
        if (!emp) throw new Error("กรุณาเลือกผู้เบิกจากรายการ");
        if (!mc) throw new Error("กรุณาเลือกเครื่องจักรจากรายการ");
        payload.requester_id = emp.id; payload.machine_id = mc.id;
      }
      await apiPost(issue ? "/stock/issue/" : "/stock/receive/", payload);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <Modal title={issue?"เบิกอะไหล่":"รับอะไหล่เข้าสต็อก"} onClose={onClose}>
    <form onSubmit={save}>
      <div className="part-preview"><div className="part-thumb">{part.image_path?<img src={part.image_path} alt=""/>:"📦"}</div><div><strong>{part.sku}</strong><h3>{part.name}</h3><p>{part.description||"-"}</p><small>Stock {fmt(part.stock_qty)} {part.unit_code}</small></div></div>
      <div className="form-grid">
        <label className="field"><span>จำนวน *</span><input type="number" min="0.0001" step="any" required value={qty} onChange={e=>setQty(e.target.value)} /></label>
        {issue && <>
          <label className="field"><span>ผู้เบิก *</span><input list="emp-stock" value={requester} onChange={e=>setRequester(e.target.value)} placeholder="พิมพ์ค้นหา..."/><datalist id="emp-stock">{(options.employees||[]).map(x=><option key={x.id} value={`${x.name}`}/>)}</datalist></label>
          <label className="field span2"><span>เครื่องจักร *</span><input list="mc-stock" value={machine} onChange={e=>setMachine(e.target.value)} placeholder="พิมพ์ค้นหา..."/><datalist id="mc-stock">{(options.machines||[]).map(x=><option key={x.id} value={`${x.code} · ${x.name}`}/>)}</datalist></label>
        </>}
        <label className="field span2"><span>ผู้บันทึก</span><input readOnly value={employee?.name||""} /></label>
        <label className="field span2"><span>Remark</span><textarea rows="2" value={note} onChange={e=>setNote(e.target.value)} /></label>
      </div>
      <Alert>{error}</Alert><div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className={`btn ${issue?"danger":"success"}`} disabled={busy}>{busy?"กำลังบันทึก...":issue?"ยืนยันการเบิก":"ยืนยันการรับเข้า"}</button></div>
    </form>
  </Modal>;
}

function AdjustModal({ part, onClose, onSaved }) {
  const [actual, setActual] = useState(part.stock_qty);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = Number(actual||0) - Number(part.stock_qty||0);
  async function save(e){e.preventDefault();setBusy(true);setError("");try{await apiPost("/stock/adjust/",{part_id:part.id,actual_quantity:actual,reason});onSaved();}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <Modal title="ปรับยอด Stock" onClose={onClose}><form onSubmit={save}><div className="metric-inline"><div><span>ยอดในระบบ</span><strong>{fmt(part.stock_qty)}</strong></div><div><span>ยอดตรวจนับจริง</span><strong>{fmt(actual)}</strong></div><div><span>ผลต่าง</span><strong>{diff>0?"+":""}{fmt(diff)}</strong></div></div><label className="field"><span>ยอดตรวจนับจริง *</span><input type="number" min="0" step="any" value={actual} onChange={e=>setActual(e.target.value)} /></label><label className="field"><span>เหตุผล *</span><textarea required rows="3" value={reason} onChange={e=>setReason(e.target.value)} /></label><Alert>{error}</Alert><div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy}>ยืนยันปรับยอด</button></div></form></Modal>
}

export default function Dashboard(){
  const auth=useAuth();
  const [kpi,setKpi]=useState({}); const [parts,setParts]=useState([]); const [options,setOptions]=useState({});
  const [q,setQ]=useState(""); const [warehouse,setWarehouse]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(true);
  const [partModal,setPartModal]=useState(null); const [stockModal,setStockModal]=useState(null); const [adjust,setAdjust]=useState(null);
  async function load(){setLoading(true);setError("");try{const [d,p,o]=await Promise.all([apiGet("/dashboard/"),apiGet("/parts/"),apiGet("/options/")]);setKpi(d.kpi||{});setParts(p.results||[]);setOptions(o||{});}catch(err){setError(err.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const rows=useMemo(()=>parts.filter(x=>(!warehouse||x.warehouse===warehouse)&&(!q||`${x.sku} ${x.name} ${x.description} ${x.maker_name} ${x.location_code}`.toLowerCase().includes(q.toLowerCase()))),[parts,q,warehouse]);
  return <>
    <PageHeader title="Dashboard Stock" subtitle="Part & Stock ในหน้าเดียว" actions={auth.can("can_edit_parts")&&<button className="btn primary" onClick={()=>setPartModal({})}>+ เพิ่มรายการอะไหล่</button>}/>
    <Alert>{error}</Alert>
    <div className="kpi-grid three"><div className="kpi-card"><span>จำนวนรายการอะไหล่</span><strong>{fmt(kpi.parts)}</strong></div><div className="kpi-card danger"><span>Safety Stock</span><strong>{fmt(kpi.safety_stock)}</strong><small>ต่ำกว่า Min และยังไม่ได้สั่ง</small></div><div className="kpi-card warning"><span>Safety Stock currently Order</span><strong>{fmt(kpi.safety_stock_ordered)}</strong><small>ต่ำกว่า Min แต่มี Order อยู่</small></div></div>
    <section className="panel"><div className="toolbar"><input className="search-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา Location / Item ID / Part Name / Detail / Maker..."/><select value={warehouse} onChange={e=>setWarehouse(e.target.value)}><option value="">คลังทั้งหมด</option><option value="MM-4">Phase4</option><option value="MM-11">Phase11</option></select><button className="btn ghost" onClick={load}>รีเฟรช</button></div>
      {loading?<div className="empty">กำลังโหลด...</div>:<div className="table-wrap"><table><thead><tr><th>รูป</th><th>Warehouse</th><th>Location</th><th>Item ID</th><th>Part Name</th><th>Part Detail</th><th>Maker</th><th>Stock</th><th>Unit</th><th>Min</th><th>จำนวนที่ Order</th><th>Vendor</th><th>ราคา</th><th>Action</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><div className="table-thumb">{p.image_path?<img src={p.image_path} alt=""/>:"📦"}</div></td><td>{p.warehouse_label}</td><td>{p.location_code||"-"}</td><td><b>{p.sku}</b></td><td>{p.name}</td><td className="detail-cell">{p.description||"-"}</td><td>{p.maker_name||"-"}</td><td className={Number(p.stock_qty)<Number(p.min_stock)?"text-danger":""}><b>{fmt(p.stock_qty)}</b></td><td>{p.unit_code}</td><td>{fmt(p.min_stock)}</td><td>{fmt(p.reorder_qty)}</td><td>{p.supplier_name||"-"}</td><td>{money(p.last_purchase_price)}</td><td><div className="row-actions">{auth.can("can_edit_parts")&&<button className="mini" onClick={()=>setPartModal(p)}>แก้ไข</button>}{auth.can("can_adjust_stock")&&<button className="mini" onClick={()=>setAdjust(p)}>ปรับยอด</button>}{auth.can("can_issue_stock")&&<button className="mini danger" onClick={()=>setStockModal({mode:"issue",part:p})}>เบิก</button>}{auth.can("can_receive_stock")&&<button className="mini success" onClick={()=>setStockModal({mode:"receive",part:p})}>รับเข้า</button>}</div></td></tr>)}</tbody></table></div>}
    </section>
    {partModal!==null&&<PartModal part={partModal.id?partModal:null} options={options} onClose={()=>setPartModal(null)} onSaved={()=>{setPartModal(null);load()}}/>}
    {stockModal&&<StockModal {...stockModal} options={options} employee={auth.employee} onClose={()=>setStockModal(null)} onSaved={()=>{setStockModal(null);load()}}/>}
    {adjust&&<AdjustModal part={adjust} onClose={()=>setAdjust(null)} onSaved={()=>{setAdjust(null);load()}}/>}
  </>;
}
