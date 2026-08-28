import { useEffect, useRef, useState } from "react";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, PartImage, fmt } from "../components/Common";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch, MobileStockModal, StockBadge } from "./MobileCommon";

export default function MobileDashboard(){
  const auth=useAuth();
  const [kpi,setKpi]=useState({}); const [parts,setParts]=useState([]); const [q,setQ]=useState(""); const [dq,setDq]=useState("");
  const [warehouse,setWarehouse]=useState(""); const [view,setView]=useState("active"); const [page,setPage]=useState(1); const [meta,setMeta]=useState({});
  const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [stock,setStock]=useState(null); const timer=useRef(null);
  useEffect(()=>{clearTimeout(timer.current);timer.current=setTimeout(()=>{setPage(1);setDq(q.trim())},300);return()=>clearTimeout(timer.current)},[q]);
  async function load(force=false){setLoading(true);setError("");try{const p=new URLSearchParams({page:String(page),page_size:"20",active:view==="active"?"true":"false"});if(dq)p.set("q",dq);if(warehouse)p.set("warehouse",warehouse);const [d,r]=await Promise.all([apiGet("/dashboard/",{forceRefresh:force}),apiGet(`/parts/?${p}`,{forceRefresh:force})]);setKpi(d.kpi||{});setParts(r.results||[]);setMeta(r||{});}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[page,dq,warehouse,view]);
  return <MobilePage title="Stock" subtitle="ค้นหา · เบิก · รับเข้า แบบมือถือ" actions={<button className="m-icon-action" onClick={()=>load(true)}>↻</button>}>
    <Alert>{error}</Alert>
    <div className="m-kpi-row"><div><span>Parts</span><b>{fmt(kpi.parts)}</b></div><div className="danger"><span>ต่ำกว่า Min</span><b>{fmt(kpi.safety_stock)}</b></div><div className="warning"><span>กำลัง Order</span><b>{fmt(kpi.safety_stock_ordered)}</b></div></div>
    <MobileSearch value={q} onChange={setQ} placeholder="Item ID / Part / Detail / Location..."/>
    <div className="m-filter-row"><select value={warehouse} onChange={e=>{setWarehouse(e.target.value);setPage(1)}}><option value="">ทุกคลัง</option><option value="MM-4">Phase4</option><option value="MM-11">Phase11</option></select><div className="m-segment"><button className={view==="active"?"active":""} onClick={()=>{setView("active");setPage(1)}}>Active</button><button className={view==="inactive"?"active":""} onClick={()=>{setView("inactive");setPage(1)}}>Inactive</button></div></div>
    {loading?<MobileLoading/>:parts.length===0?<MobileEmpty/>:<div className="m-card-list">{parts.map(p=><article className="m-part-card" key={p.id}>
      <div className="m-part-card-top"><div className="m-card-thumb"><PartImage src={p.image_url||p.image_path} fallbackSrc={p.image_fallback_url} alt={p.name}/></div><div className="m-card-main"><div className="m-card-code">{p.sku}</div><h3>{p.name}</h3><p>{p.description||"-"}</p></div><StockBadge row={p}/></div>
      <div className="m-part-meta"><span>📍 {p.location_code||"-"}</span><span>{p.warehouse_label||"-"}</span><span>{p.maker_name||"-"}</span></div>
      <div className="m-stock-line"><span>คงเหลือ</span><strong>{fmt(p.stock_qty)} <small>{p.unit_code}</small></strong><span>Min {fmt(p.min_stock)}</span></div>
      {view==="active"&&<div className="m-action-grid">{auth.can("can_issue_stock")&&<button className="m-action issue" onClick={()=>setStock({mode:"issue",part:p})}>− เบิก</button>}{auth.can("can_receive_stock")&&<button className="m-action receive" onClick={()=>setStock({mode:"receive",part:p})}>＋ รับเข้า</button>}</div>}
    </article>)}</div>}
    <div className="m-pagination"><button disabled={!meta.has_previous||loading} onClick={()=>setPage(x=>Math.max(1,x-1))}>← ก่อนหน้า</button><span>{meta.page||1} / {meta.total_pages||1}</span><button disabled={!meta.has_next||loading} onClick={()=>setPage(x=>x+1)}>ถัดไป →</button></div>
    {stock&&<MobileStockModal {...stock} employee={auth.employee} onClose={()=>setStock(null)} onSaved={async()=>{setStock(null);await load(true)}}/>}
  </MobilePage>;
}
