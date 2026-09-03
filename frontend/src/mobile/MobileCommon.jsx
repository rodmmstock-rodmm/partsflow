import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api";
import { Alert, Modal, PartImage, SearchableSelect, fmt } from "../components/Common";

export function MobilePage({ title, subtitle, actions, children }) {
  return <div className="m-page">
    <div className="m-page-head">
      <div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>
      {actions&&<div className="m-page-actions">{actions}</div>}
    </div>
    {children}
  </div>;
}

export function MobileSearch({ value, onChange, placeholder="ค้นหา..." }) {
  return <div className="m-search"><span>⌕</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value&&<button type="button" onClick={()=>onChange("")}>×</button>}</div>;
}

export function MobileLoading({ text="กำลังโหลด..." }) { return <div className="m-loading">{text}</div>; }
export function MobileEmpty({ text="ไม่พบข้อมูล" }) { return <div className="m-empty">{text}</div>; }

export function StockBadge({ row }) {
  const cls=row.stock_status||((Number(row.stock_qty||0)<=0)?"out":(Number(row.stock_qty||0)<Number(row.min_stock||0)?"low":"normal"));
  return <span className={`m-stock-badge ${cls}`}>{row.stock_status_label||cls}</span>;
}

export function MobileStockModal({ mode, part, employee, onClose, onSaved }) {
  const issue=mode==="issue";
  const [qty,setQty]=useState(1);
  const [requesterId,setRequesterId]=useState("");
  const [machineId,setMachineId]=useState("");
  const [note,setNote]=useState("");
  const [options,setOptions]=useState({employees:[],machines:[]});
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(issue);

  useEffect(()=>{
    if(!issue)return;
    apiGet("/options/").then(o=>setOptions(o||{})).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },[issue]);

  const after=useMemo(()=>{
    const stock=Number(part.stock_qty||0), amount=Number(qty||0);
    return issue?stock-amount:stock+amount;
  },[part.stock_qty,qty,issue]);

  async function submit(e){
    e.preventDefault(); setError("");
    const amount=Number(qty);
    if(!Number.isInteger(amount)||amount<=0){setError("จำนวนต้องเป็นจำนวนเต็มมากกว่า 0");return;}
    if(issue&&amount>Number(part.stock_qty||0)){setError("จำนวนเบิกมากกว่าสต็อกคงเหลือ");return;}
    if(issue&&!requesterId){setError("กรุณาเลือกผู้เบิกจากรายการ");return;}
    if(issue&&!machineId){setError("กรุณาเลือกเครื่องจักรจากรายการ");return;}
    setBusy(true);
    try{
      const payload={part_id:part.id,quantity:amount,note};
      if(issue){payload.requester_id=requesterId;payload.machine_id=machineId;}
      await apiPost(issue?"/stock/issue/":"/stock/receive/",payload);
      onSaved?.();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }

  return <Modal title={issue?"เบิกอะไหล่":"รับเข้าอะไหล่"} onClose={onClose}>
    <form className="m-stock-form" onSubmit={submit}>
      <div className="m-part-hero">
        <div className="m-part-image"><PartImage src={part.image_url||part.image_path} fallbackSrc={part.image_fallback_url} alt={part.name}/></div>
        <div><b>{part.sku}</b><h3>{part.name}</h3><p>{part.description||"-"}</p><small>{part.location_code||"ไม่ระบุ Location"}</small></div>
      </div>
      <div className="m-stock-preview"><div><span>คงเหลือ</span><strong>{fmt(part.stock_qty)} {part.unit_code}</strong></div><div><span>หลังทำรายการ</span><strong className={after<0?"text-danger":""}>{fmt(after)} {part.unit_code}</strong></div></div>
      <label className="field"><span>จำนวน *</span><input inputMode="numeric" type="number" min="1" step="1" required value={qty} onChange={e=>setQty(e.target.value)}/></label>
      {issue&&<>
        <label className="field"><span>ผู้เบิก *</span><SearchableSelect required value={requesterId} options={(options.employees||[]).filter(x=>x.active!==false)} onChange={setRequesterId} disabled={loading} getLabel={x=>x.name} getSearchText={x=>`${x.employee_code||""} ${x.name||""} ${x.department||""}`} placeholder="พิมพ์ชื่อพนักงาน"/></label>
        <label className="field"><span>เครื่องจักร *</span><SearchableSelect required value={machineId} options={(options.machines||[]).filter(x=>x.active!==false)} onChange={setMachineId} disabled={loading} getLabel={x=>x.code} getSearchText={x=>`${x.code||""} ${x.name||""} ${x.location||""}`} placeholder="พิมพ์รหัส Machine"/></label>
      </>}
      <label className="field"><span>ผู้บันทึก</span><input readOnly value={employee?.name||""}/></label>
      <label className="field"><span>หมายเหตุ</span><textarea rows="2" value={note} onChange={e=>setNote(e.target.value)}/></label>
      <Alert>{error}</Alert>
      <button className={`m-confirm-btn ${issue?"issue":"receive"}`} disabled={busy||loading}>{busy?"กำลังบันทึก...":issue?"ยืนยันการเบิก":"ยืนยันการรับเข้า"}</button>
    </form>
  </Modal>;
}
