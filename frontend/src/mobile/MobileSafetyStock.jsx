import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, fmt, stockDisplay } from "../components/Common";
import SafetyOrderModal from "../components/SafetyOrderModal";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

export default function MobileSafetyStock(){
  const auth=useAuth();
  const [rows,setRows]=useState([]),[toolingRows,setToolingRows]=useState([]),[selected,setSelected]=useState(new Set()),[q,setQ]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[toolingError,setToolingError]=useState(""),[success,setSuccess]=useState(""),[review,setReview]=useState(false);

  async function load(force=false){
    setLoading(true);setError("");setToolingError("");
    const [partsResult,toolingResult]=await Promise.allSettled([apiGet("/safety-stock/",{forceRefresh:force}),apiGet("/tooling/safety-stock/",{forceRefresh:force})]);
    if(partsResult.status==="fulfilled"){setRows(partsResult.value.results||[]);setSelected(new Set())}else{setError(partsResult.reason?.message||"โหลด Safety Stock อะไหล่ไม่สำเร็จ")}
    if(toolingResult.status==="fulfilled"){setToolingRows((toolingResult.value.results||[]).filter(x=>Number(x.quantity)<Number(x.min_quantity)))}else{setToolingRows([]);setToolingError(toolingResult.reason?.message||"โหลดข้อมูล Tooling ไม่สำเร็จ")}
    setLoading(false);
  }

  useEffect(()=>{load()},[]);

  const shown=useMemo(()=>rows.filter(x=>!q||`${x.sku} ${x.name} ${x.description} ${x.maker_name} ${x.last_machine}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
  const selectedRows=useMemo(()=>rows.filter(x=>selected.has(x.id)),[rows,selected]);
  const allShownSelected=shown.length>0&&shown.every(x=>selected.has(x.id));

  function toggle(id){setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})}
  function toggleShown(){setSelected(s=>{const n=new Set(s);shown.forEach(x=>allShownSelected?n.delete(x.id):n.add(x.id));return n})}
  function openReview(){setError("");setSuccess("");if(!selectedRows.length){setError("กรุณาเลือกรายการที่จะสร้าง Order อย่างน้อย 1 รายการ");return}setReview(true)}

  return <MobilePage title="Safety Stock" subtitle={`${rows.length} รายการที่ต้องสั่ง`} actions={<button className="m-icon-action" onClick={()=>load(true)}>↻</button>}>
    <Alert>{error}</Alert><Alert>{toolingError ? `โหลดข้อมูล Tooling ไม่สำเร็จ: ${toolingError}` : ""}</Alert><Alert type="success">{success}</Alert>
    <MobileSearch value={q} onChange={setQ} placeholder="ค้นหา Item / Part / Maker / Machine..."/>

    {!loading&&shown.length>0&&<div className="m-safety-toolbar">
      <button type="button" className="m-safety-select-all" onClick={toggleShown}>{allShownSelected?"ยกเลิกที่แสดง":"เลือกทั้งหมดที่แสดง"}</button>
      {auth.can("can_add_order")&&<button type="button" className="m-safety-order-btn" disabled={!selected.size} onClick={openReview}>🛒 Order ({selected.size})</button>}
    </div>}

    {loading?<MobileLoading/>:shown.length===0&&toolingRows.filter(x=>!q||`${x.name} ${x.detail} ${x.maker}`.toLowerCase().includes(q.toLowerCase())).length===0?<MobileEmpty/>:shown.length>0?<div className="m-card-list">{shown.map(x=><article className={`m-safety-card ${selected.has(x.id)?"selected":""}`} key={x.id}>
      <label className="m-safety-select"><input type="checkbox" checked={selected.has(x.id)} onChange={()=>toggle(x.id)}/><span>เลือกเพื่อสร้าง Order</span></label>
      <div className="m-row-between"><div><b>{x.sku}</b><h3>{x.name}</h3></div><span className="m-danger-pill">ต่ำกว่า Min</span></div>
      <p>{x.description||"-"}</p>
      <div className="m-stock-triplet"><div><span>คงเหลือ</span><b className="text-danger">{stockDisplay(x)}</b></div><div><span>Min</span><b>{fmt(x.min_stock)}</b></div><div><span>ควร Order</span><b>{fmt(x.order_qty)}</b></div></div>
      <div className="m-part-meta"><span>{x.maker_name||"-"}</span><span>ล่าสุด: {x.last_machine||"-"}</span><span>{x.unit_code}</span></div>
    </article>)}</div>:null}

    {toolingRows.filter(x=>!q||`${x.name} ${x.detail} ${x.maker}`.toLowerCase().includes(q.toLowerCase())).length>0&&<section className="panel"><h3>Tooling ต่ำกว่า Min</h3><p className="muted">แสดงแยกจากอะไหล่ และไม่สามารถนำไปสร้าง Order อะไหล่ได้</p><div className="m-card-list">{toolingRows.filter(x=>!q||`${x.name} ${x.detail} ${x.maker}`.toLowerCase().includes(q.toLowerCase())).map(x=><article className="m-safety-card" key={x.id}><div className="m-row-between"><div><span className="badge">Tooling</span><h3>{x.name}</h3></div><span className="m-danger-pill">ต่ำกว่า Min</span></div><p>{x.detail||"-"}</p><div className="m-stock-triplet"><div><span>คงเหลือ</span><b className="text-danger">{fmt(x.quantity)}</b></div><div><span>Min</span><b>{fmt(x.min_quantity)}</b></div><div><span>หน่วย</span><b>{x.unit||"-"}</b></div></div><div className="m-part-meta"><span>{x.maker||"-"}</span></div></article>)}</div></section>}{review&&<SafetyOrderModal rows={selectedRows} employee={auth.employee} onClose={()=>setReview(false)} onSaved={async result=>{setReview(false);setSuccess(`สร้าง Order สำเร็จ ${result.created_count||selectedRows.length} รายการ`);await load(true)}}/>}
  </MobilePage>;
}
