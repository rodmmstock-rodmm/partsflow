import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, fmt } from "../components/Common";
import SafetyOrderModal from "../components/SafetyOrderModal";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

export default function MobileSafetyStock(){
  const auth=useAuth();
  const [rows,setRows]=useState([]),[selected,setSelected]=useState(new Set()),[q,setQ]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[success,setSuccess]=useState(""),[review,setReview]=useState(false);

  async function load(force=false){
    setLoading(true);setError("");
    try{
      const d=await apiGet("/safety-stock/",{forceRefresh:force});
      setRows(d.results||[]);
      setSelected(new Set());
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }

  useEffect(()=>{load()},[]);

  const shown=useMemo(()=>rows.filter(x=>!q||`${x.sku} ${x.name} ${x.description} ${x.maker_name} ${x.last_machine}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
  const selectedRows=useMemo(()=>rows.filter(x=>selected.has(x.id)),[rows,selected]);
  const allShownSelected=shown.length>0&&shown.every(x=>selected.has(x.id));

  function toggle(id){setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})}
  function toggleShown(){setSelected(s=>{const n=new Set(s);shown.forEach(x=>allShownSelected?n.delete(x.id):n.add(x.id));return n})}
  function openReview(){setError("");setSuccess("");if(!selectedRows.length){setError("กรุณาเลือกรายการที่จะสร้าง Order อย่างน้อย 1 รายการ");return}setReview(true)}

  return <MobilePage title="Safety Stock" subtitle={`${rows.length} รายการที่ต้องสั่ง`} actions={<button className="m-icon-action" onClick={()=>load(true)}>↻</button>}>
    <Alert>{error}</Alert><Alert type="success">{success}</Alert>
    <MobileSearch value={q} onChange={setQ} placeholder="ค้นหา Item / Part / Maker / Machine..."/>

    {!loading&&shown.length>0&&<div className="m-safety-toolbar">
      <button type="button" className="m-safety-select-all" onClick={toggleShown}>{allShownSelected?"ยกเลิกที่แสดง":"เลือกทั้งหมดที่แสดง"}</button>
      {auth.can("can_add_order")&&<button type="button" className="m-safety-order-btn" disabled={!selected.size} onClick={openReview}>🛒 Order ({selected.size})</button>}
    </div>}

    {loading?<MobileLoading/>:shown.length===0?<MobileEmpty/>:<div className="m-card-list">{shown.map(x=><article className={`m-safety-card ${selected.has(x.id)?"selected":""}`} key={x.id}>
      <label className="m-safety-select"><input type="checkbox" checked={selected.has(x.id)} onChange={()=>toggle(x.id)}/><span>เลือกเพื่อสร้าง Order</span></label>
      <div className="m-row-between"><div><b>{x.sku}</b><h3>{x.name}</h3></div><span className="m-danger-pill">ต่ำกว่า Min</span></div>
      <p>{x.description||"-"}</p>
      <div className="m-stock-triplet"><div><span>คงเหลือ</span><b className="text-danger">{fmt(x.stock_qty)}</b></div><div><span>Min</span><b>{fmt(x.min_stock)}</b></div><div><span>ควร Order</span><b>{fmt(x.order_qty)}</b></div></div>
      <div className="m-part-meta"><span>{x.maker_name||"-"}</span><span>ล่าสุด: {x.last_machine||"-"}</span><span>{x.unit_code}</span></div>
    </article>)}</div>}

    {review&&<SafetyOrderModal rows={selectedRows} employee={auth.employee} onClose={()=>setReview(false)} onSaved={async result=>{setReview(false);setSuccess(`สร้าง Order สำเร็จ ${result.created_count||selectedRows.length} รายการ`);await load(true)}}/>}
  </MobilePage>;
}
