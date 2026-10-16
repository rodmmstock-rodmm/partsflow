import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api";
import { Alert, Modal, PartImage, SearchableSelect, fmt, isNoCountSku, stockDisplay } from "../components/Common";
import { useOptions } from "../optionsContext";

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
  // Prefer server-provided status and label when available.
  // Backend uses statuses like: "normal", "low_stock", "out_of_stock", "ordering_now".
  // Compute a fallback status in the same naming convention when backend did not provide one.
  const sku = String(row?.sku || "").trim().toUpperCase();
  const hasServerStatus = !!row?.stock_status;

  const computedStatus = (() => {
    if (sku.startsWith("N")) return "normal"; // no-count items
    const qty = Number(row?.stock_qty || 0);
    const min = Number(row?.min_stock || 0);
    if (qty <= 0) return "out_of_stock";
    if (min > 0 && qty < min) return "low_stock";
    return "normal";
  })();

  const cls = row?.stock_status || computedStatus;

  const label = row?.stock_status_label || (
    cls === "normal" ? "ปกติ"
    : cls === "low_stock" ? "ควรสั่งซื้อ"
    : cls === "out_of_stock" ? "หมดในสต็อก"
    : cls === "ordering_now" ? "กำลังสั่ง"
    : cls
  );

  return <span className={`m-stock-badge ${cls}`}>{label}</span>;
}

export function MobileStockModal({ mode, part, employee, onClose, onSaved }) {
  const issue=mode==="issue";
  const noCount=isNoCountSku(part.sku);
  const [qty,setQty]=useState(1);
  const [requesterId,setRequesterId]=useState("");
  const [machineId,setMachineId]=useState("");
  const [note,setNote]=useState("");
  const {options}=useOptions();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(issue);

  useEffect(()=>{
    if(!issue)return;
    setLoading(false);
  },[issue]);

  const after=useMemo(()=>{
    const stock=Number(part.stock_qty||0), amount=Number(qty||0);
    return issue?(noCount?stock:stock-amount):stock+amount;
  },[part.stock_qty,qty,issue,noCount]);

  async function submit(e){
    e.preventDefault(); setError("");
    const amount=Number(qty);
    if(!Number.isInteger(amount)||amount<=0){setError("จำนวนต้องเป็นจำนวนเต็มมากกว่า 0");return;}
    if(issue&&!noCount&&amount>Number(part.stock_qty||0)){setError("จำนวนเบิกมากกว่าสต็อกคงเหลือ");return;}
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
      <div className="m-stock-preview"><div><span>คงเหลือ</span><strong>{stockDisplay(part)} {part.unit_code}</strong></div><div><span>หลังทำรายการ</span><strong>{fmt(after)}</strong></div></div>
      <label className="field"><span>จำนวน *</span><input inputMode="numeric" type="number" min="1" step="1" required value={qty} onChange={e=>setQty(e.target.value)}/></label>
      {issue&&<>
        <label className="field"><span>ผู้เบิก *</span><SearchableSelect required value={requesterId} options={(options.employees||[]).filter(x=>x.active!==false)} onChange={setRequesterId} getLabel={i=>i.name} getSearchText={i=>`${i.employee_code||""} ${i.name||""} ${i.department||""}`} placeholder="พิมพ์ชื่อพนักงาน"/></label>
        <label className="field"><span>เครื่องจักร *</span><SearchableSelect required value={machineId} options={(options.machines||[]).filter(x=>x.active!==false)} onChange={setMachineId} getLabel={i=>i.code} getSearchText={i=>`${i.code||""} ${i.name||""} ${i.location||""}`} placeholder="พิมพ์รหัส Machine"/></label>
      </>}
      <label className="field"><span>ผู้บันทึก</span><input readOnly value={employee?.name||""}/></label>
      <label className="field"><span>หมายเหตุ</span><textarea rows="2" value={note} onChange={e=>setNote(e.target.value)}/></label>
      <Alert>{error}</Alert>
      <button className={`m-confirm-btn ${issue?"issue":"receive"}`} disabled={busy||loading}>{busy?"กำลังบันทึก...":issue?"ยืนยันการเบิก":"ยืนยันการรับเข้า"}</button>
    </form>
  </Modal>;
}

export function MobileAdjustModal({ part, employee, onClose, onSaved }) {
  const [actual,setActual]=useState(part.stock_qty??0);
  const [reason,setReason]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const current=Number(part.stock_qty||0);
  const actualNumber=Number(actual);
  const difference=Number.isFinite(actualNumber)?actualNumber-current:0;

  async function submit(e){
    e.preventDefault();setError("");
    if(actual===""||!Number.isFinite(actualNumber)||actualNumber<0){setError("ยอดตรวจนับจริงต้องไม่น้อยกว่า 0");return;}
    if(difference===0){setError("ยอดตรวจนับจริงเท่ากับยอดในระบบ ไม่มีรายการให้ปรับ");return;}
    if(!reason.trim()){setError("กรุณาระบุเหตุผลในการปรับยอด");return;}
    setBusy(true);
    try{
      await apiPost("/stock/adjust/",{part_id:part.id,actual_quantity:actualNumber,reason:reason.trim()});
      onSaved?.();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }

  return <Modal title="ปรับยอด Stock" onClose={onClose}>
    <form className="m-stock-form" onSubmit={submit}>
      <div className="m-part-hero">
        <div className="m-part-image"><PartImage src={part.image_url||part.image_path} fallbackSrc={part.image_fallback_url} alt={part.name}/></div>
        <div><b>{part.sku}</b><h3>{part.name}</h3><p>{part.description||"-"}</p><small>{part.location_code||"ไม่ระบุ Location"}</small></div>
      </div>
      <div className="m-stock-preview"><div><span>ยอดในระบบ</span><strong>{stockDisplay(part)} {part.unit_code}</strong></div><div><span>ผลต่าง</span><strong className={difference>0?"positive":"negative"}>{difference>0?"+":""}{fmt(difference)}</strong></div></div>
      <label className="field"><span>ยอดตรวจนับจริง *</span><input inputMode="decimal" type="number" min="0" step="any" required value={actual} onChange={e=>setActual(e.target.value)}/></label>
      <label className="field"><span>เหตุผลในการปรับยอด *</span><textarea rows="3" required value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="field"><span>ผู้บันทึก</span><input readOnly value={employee?.name||""}/></label>
      <Alert>{error}</Alert>
      <button type="submit" className="m-confirm-btn adjust" disabled={busy}>{busy?"กำลังบันทึก...":"ยืนยันการปรับยอด"}</button>
    </form>
  </Modal>;
}
