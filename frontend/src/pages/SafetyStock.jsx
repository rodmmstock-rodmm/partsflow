import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, PageHeader, fmt, stockDisplay } from "../components/Common";
import SafetyOrderModal from "../components/SafetyOrderModal";

export default function SafetyStock(){
  const auth=useAuth();
  const [rows,setRows]=useState([]), [selected,setSelected]=useState(new Set()), [q,setQ]=useState(""), [error,setError]=useState(""), [success,setSuccess]=useState(""), [loading,setLoading]=useState(true), [orderReview,setOrderReview]=useState(false);
  async function load(force=false){setLoading(true);setError("");try{const d=await apiGet("/safety-stock/",{forceRefresh:force});setRows(d.results||[]);setSelected(new Set())}catch(err){setError(err.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const shown=useMemo(()=>rows.filter(x=>!q||`${x.sku} ${x.name} ${x.description} ${x.maker_name} ${x.last_machine}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
  const selectedRows=useMemo(()=>rows.filter(x=>selected.has(x.id)),[rows,selected]);
  function toggle(id){setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})}
  function toggleAll(){setSelected(s=>{const shownIds=new Set(shown.map(x=>x.id));const allSelected=shown.length>0&&shown.every(x=>s.has(x.id));const n=new Set(s);shownIds.forEach(id=>allSelected?n.delete(id):n.add(id));return n})}
  function exportExcel(){const data=selectedRows;if(!data.length){setError("กรุณาเลือกรายการที่ต้องการ Export อย่างน้อย 1 รายการ");return}const out=data.map(x=>({"เครื่องจักรล่าสุดที่เบิก":x.last_machine||"","Part ID":x.sku,"Part Name":x.name,"Part Detail":x.description||"","Maker":x.maker_name||"","จำนวนที่ต้องสั่ง":x.order_qty,"Unit":x.unit_code||""}));const ws=XLSX.utils.json_to_sheet(out);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Safety Stock");const d=new Date();const p=n=>String(n).padStart(2,"0");XLSX.writeFile(wb,`safety_stock_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}.xlsx`)}
  function openOrderReview(){setError("");setSuccess("");if(!selectedRows.length){setError("กรุณาเลือกรายการที่จะสร้าง Order อย่างน้อย 1 รายการ");return}setOrderReview(true)}
  return <>
    <PageHeader title="Safety Stock" subtitle="รายการต่ำกว่า Min ที่ยังไม่มี Active Order" actions={<>{auth.can("can_add_order")&&<button className="btn primary" onClick={openOrderReview} disabled={!selected.size}>🛒 สร้าง Order ({selected.size})</button>}<button className="btn ghost" onClick={exportExcel}>Export Excel ({selected.size})</button></>}/>
    <Alert>{error}</Alert><Alert type="success">{success}</Alert>
    <div className="kpi-grid one"><div className="kpi-card danger"><span>รายการที่ต้องสั่ง</span><strong>{fmt(rows.length)}</strong></div></div>
    <section className="panel"><div className="toolbar"><input className="search-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา Part ID / Part / Maker / Machine..."/><button className="btn ghost" onClick={()=>load(true)}>รีเฟรช</button></div>{loading?<div className="empty">กำลังโหลด...</div>:<div className="table-wrap"><table><thead><tr><th><input type="checkbox" checked={shown.length>0&&shown.every(x=>selected.has(x.id))} onChange={toggleAll}/></th><th>Part ID</th><th>Part Name</th><th>Part Detail</th><th>Maker</th><th>เครื่องจักรล่าสุดที่เบิก</th><th>จำนวนคงเหลือ</th><th>จำนวน Min</th><th>จำนวนที่ Order</th><th>Unit</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td><input type="checkbox" checked={selected.has(x.id)} onChange={()=>toggle(x.id)}/></td><td><b>{x.sku}</b></td><td>{x.name}</td><td className="detail-cell">{x.description||"-"}</td><td>{x.maker_name||"-"}</td><td>{x.last_machine||"-"}</td><td className="text-danger"><b>{stockDisplay(x)}</b></td><td>{fmt(x.min_stock)}</td><td><b>{fmt(x.order_qty)}</b></td><td>{x.unit_code}</td></tr>)}</tbody></table></div>}</section>
    {orderReview&&<SafetyOrderModal rows={selectedRows} employee={auth.employee} onClose={()=>setOrderReview(false)} onSaved={async result=>{setOrderReview(false);setSuccess(`สร้าง Order สำเร็จ ${result.created_count||selectedRows.length} รายการ`);await load(true)}}/>}
  </>
}

