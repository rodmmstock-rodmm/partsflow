import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, PageHeader } from "../components/Common";

const empty = { name: "", detail: "", maker: "", quantity: 0, min_quantity: 0, unit: "" };
export default function Tooling() {
  const auth = useAuth();
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("items");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [withdrawItem, setWithdrawItem] = useState(null);
  const [withdraw, setWithdraw] = useState({ quantity: 1, requester_id: "", reason: "LOST", remark: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      const [i, h, o] = await Promise.all([apiGet("/tooling/items/", { forceRefresh: true }), apiGet("/tooling/history/", { forceRefresh: true }), apiGet("/options/")]);
      setItems(i.results || []); setHistory(h.results || []); setEmployees(o.employees || []);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function save(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (editing) await apiPatch(`/tooling/items/${editing.id}/`, form);
      else await apiPost("/tooling/items/", form);
      setEditing(null); setForm(empty); setFormOpen(false); setSuccess("บันทึกข้อมูล Tooling แล้ว"); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitWithdraw(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await apiPost(`/tooling/items/${withdrawItem.id}/withdraw/`, withdraw);
      setWithdrawItem(null); setWithdraw({ quantity: 1, requester_id: "", reason: "LOST", remark: "" }); setSuccess("บันทึกการเบิกแล้ว"); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(item) {
    if (!window.confirm(`ยืนยันปิดใช้งาน ${item.name}?`)) return;
    try { await apiDelete(`/tooling/items/${item.id}/`); await load(); } catch (e) { setError(e.message); }
  }
  const shown = items.filter(x => !filter || `${x.name} ${x.detail} ${x.maker}`.toLowerCase().includes(filter.toLowerCase()));
  const canManage = auth.can("can_add_tooling") || auth.can("can_edit_tooling");
  return <>
    <PageHeader title="Tooling" subtitle="รายการอุปกรณ์ที่มีสต็อกและสามารถเบิกตัดจำนวนได้" actions={auth.can("can_add_tooling") ? <button className="btn primary" onClick={() => {setEditing(null);setForm(empty);setFormOpen(true);setTab("items");}}>+ เพิ่มอุปกรณ์</button> : null} />
    <Alert>{error}</Alert><Alert type="success">{success}</Alert>
    <div className="toolbar" style={{marginBottom:16}}>
      <button className={tab==="items"?"btn primary":"btn ghost"} onClick={()=>setTab("items")}>รายการอุปกรณ์ ({items.length})</button>
      <button className={tab==="history"?"btn primary":"btn ghost"} onClick={()=>setTab("history")}>ประวัติการเบิก ({history.length})</button>
      {tab==="items" && <input className="search-input" placeholder="ค้นหาอุปกรณ์..." value={filter} onChange={e=>setFilter(e.target.value)} />}
    </div>
    {tab==="items" ? <>
      {(editing || formOpen) && <section className="panel"><h3>{editing?"แก้ไขอุปกรณ์":"เพิ่มอุปกรณ์"}</h3><form onSubmit={save} className="form-grid">
        <label className="field"><span>ชื่ออุปกรณ์ *</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="field"><span>Maker</span><input value={form.maker} onChange={e=>setForm({...form,maker:e.target.value})}/></label>
        <label className="field span2"><span>รายละเอียด</span><input value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})}/></label>
        <label className="field"><span>จำนวนคงเหลือ</span><input type="number" min="0" required value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label className="field"><span>จำนวนขั้นต่ำ (Min)</span><input type="number" min="0" required value={form.min_quantity} onChange={e=>setForm({...form,min_quantity:e.target.value})}/></label>
        <label className="field"><span>หน่วย</span><input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label>
        <div className="field"><span>&nbsp;</span><div><button className="btn primary" disabled={busy}>{busy?"กำลังบันทึก...":"บันทึก"}</button> <button type="button" className="btn ghost" onClick={()=>{setEditing(null);setForm(empty);setFormOpen(false)}}>ยกเลิก</button></div></div>
      </form></section>}
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>ชื่ออุปกรณ์</th><th>รายละเอียด</th><th>Maker</th><th>คงเหลือ</th><th>Min</th><th>หน่วย</th><th>จัดการ</th></tr></thead><tbody>
        {shown.map(x=><tr key={x.id}><td><b>{x.name}</b></td><td>{x.detail||"-"}</td><td>{x.maker||"-"}</td><td className={x.low_stock?"text-danger":""}><b>{x.quantity}</b></td><td>{x.min_quantity}</td><td>{x.unit||"-"}</td><td><div className="toolbar"><button className="btn primary" onClick={()=>{setWithdrawItem(x);setWithdraw({quantity:1,requester_id:auth.employee?.id||"",reason:"LOST",remark:""})}}>เบิก</button>{auth.can("can_edit_tooling")&&<button className="btn ghost" onClick={()=>{setEditing(x);setForm({...x});setFormOpen(true);}}>แก้ไข</button>}{auth.can("can_delete_tooling")&&<button className="btn ghost" onClick={()=>remove(x)}>ปิดใช้งาน</button>}</div></td></tr>)}
        {!shown.length&&<tr><td colSpan="7">ไม่พบรายการ Tooling</td></tr>}
      </tbody></table></div></section>
    </> : <section className="panel"><div className="toolbar"><button className="btn ghost" onClick={()=>setFilter("")}>ทั้งหมด</button><button className="btn ghost" onClick={()=>setFilter("LOST")}>หาย</button><button className="btn ghost" onClick={()=>setFilter("DAMAGED")}>ชำรุด</button></div><div className="table-wrap"><table><thead><tr><th>วันที่</th><th>อุปกรณ์</th><th>จำนวน</th><th>ผู้เบิก</th><th>เหตุผล</th><th>หมายเหตุ</th></tr></thead><tbody>{history.filter(x=>!["LOST","DAMAGED"].includes(filter)||x.reason===filter).map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString("th-TH")}</td><td>{x.item_name}</td><td>{x.quantity}</td><td>{x.requester_name}</td><td>{x.reason_label}</td><td>{x.remark||"-"}</td></tr>)}{!history.length&&<tr><td colSpan="6">ยังไม่มีประวัติการเบิก</td></tr>}</tbody></table></div></section>}
    {withdrawItem && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true"><h3>เบิก {withdrawItem.name}</h3><form onSubmit={submitWithdraw} className="form-grid">
      <label className="field"><span>จำนวนที่เบิก *</span><input type="number" min="1" max={withdrawItem.quantity} required value={withdraw.quantity} onChange={e=>setWithdraw({...withdraw,quantity:e.target.value})}/><small>คงเหลือ {withdrawItem.quantity} {withdrawItem.unit}</small></label>
      <label className="field"><span>ผู้เบิก *</span><select required value={withdraw.requester_id} onChange={e=>setWithdraw({...withdraw,requester_id:e.target.value})}><option value="">เลือกพนักงาน</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_code} - {e.name}</option>)}</select></label>
      <label className="field"><span>เหตุผล *</span><select value={withdraw.reason} onChange={e=>setWithdraw({...withdraw,reason:e.target.value})}><option value="LOST">หาย</option><option value="DAMAGED">ชำรุด</option></select></label>
      <label className="field span2"><span>Remark</span><textarea value={withdraw.remark} onChange={e=>setWithdraw({...withdraw,remark:e.target.value})}/></label>
      <div className="field span2"><button className="btn primary" disabled={busy}>ยืนยันเบิก</button> <button type="button" className="btn ghost" onClick={()=>setWithdrawItem(null)}>ยกเลิก</button></div>
    </form></section></div>}
  </>;
}
