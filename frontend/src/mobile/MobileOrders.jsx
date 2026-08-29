import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, fmt, money } from "../components/Common";
import { OrderInfoModal, PurchaseModal } from "../pages/Orders";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

const TABS=[["normal","Active"],["updates","Update"],["confirm","Wait"],["completed","Complete"],["cancelled","Cancelled"]];
function lifeLabel(x){if(x.lifecycle_status==="WAIT_CONFIRM")return "Wait Confirm";if(x.lifecycle_status==="CANCELLED")return "Cancelled";if(x.lifecycle_status==="COMPLETED")return "Completed";return x.display_status||x.status||"Active"}
export default function MobileOrders(){
  const auth=useAuth();
  const[rows,setRows]=useState([]),[kpi,setKpi]=useState({}),[options,setOptions]=useState({}),[q,setQ]=useState(""),[status,setStatus]=useState(""),[job,setJob]=useState(""),[urgency,setUrgency]=useState("all"),[tab,setTab]=useState("normal"),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(""),[editor,setEditor]=useState(null),[purchase,setPurchase]=useState(null);

  async function load(force=false){
    setLoading(true);
    setError("");
    try{
      const p=new URLSearchParams({view:tab,q:"",urgency,job,status});
      const d=await apiGet(`/orders/?${p}`,{forceRefresh:force,cache:false});
      setRows(d.results||[]);
      setKpi(d.kpi||{});
    }catch(e){
      setRows([]);
      setKpi({});
      setError(e.message);
      setLoading(false);
      return;
    }

    // Master/options data is useful for edit modals, but it must never block
    // the Order list itself. The previous Promise.all made a slow/failed
    // /options/ request discard a perfectly valid /orders/ response on mobile.
    try{
      const o=await apiGet("/options/",{forceRefresh:force});
      setOptions(o||{});
    }catch(e){
      setOptions({});
      // Keep the successfully loaded Orders visible. Editing can be retried
      // after options become available instead of showing an empty Order page.
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load()},[tab,status,job,urgency]);
  const shown=useMemo(()=>rows.filter(x=>!q||`${x.order_number} ${x.item_id} ${x.part_name} ${x.machine_name} ${x.machine_code} ${x.vendor_name} ${x.po_number}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
  async function act(row,action){if(busy)return;let ok=true,reason="";if(action==="receive")ok=confirm(`ยืนยันรับ ${row.order_number}?`);if(action==="wait")ok=confirm(`เปลี่ยน ${row.order_number} เป็น Wait Confirm?`);if(action==="cancelwait")ok=confirm(`ยกเลิก Wait Confirm ${row.order_number}?`);if(action==="cancel"){ok=confirm(`ยกเลิก ${row.order_number}?`);if(ok)reason=prompt("เหตุผลการยกเลิก","")||""}if(action==="restore")ok=confirm(`คืนรายการ ${row.order_number}?`);if(action==="delete")ok=confirm(`ลบ ${row.order_number} ถาวร?`);if(action==="update")ok=confirm(`ยืนยันอัพเดตข้อมูล ${row.order_number}?`);if(!ok)return;setBusy(row.id+action);setError("");try{if(action==="receive")await apiPost(`/orders/${row.id}/receive/`,{});if(action==="wait")await apiPost(`/orders/${row.id}/wait-confirm/`,{wait_confirm:true});if(action==="cancelwait")await apiPost(`/orders/${row.id}/wait-confirm/`,{wait_confirm:false});if(action==="cancel")await apiPost(`/orders/${row.id}/cancel/`,{cancel:true,reason});if(action==="restore")await apiPost(`/orders/${row.id}/cancel/`,{cancel:false});if(action==="delete")await apiDelete(`/orders/${row.id}/delete/`);if(action==="update")await apiPost(`/orders/${row.id}/update-data/`,{});await load(true)}catch(e){setError(e.message)}finally{setBusy("")}}
  return <MobilePage title="Order" subtitle="จัดการ Order ครบจากมือถือ" actions={<div className="m-page-actions">{auth.can("can_add_order")&&tab==="normal"&&<button className="m-icon-action" onClick={()=>setEditor({order:null})}>＋</button>}<button className="m-icon-action" onClick={()=>load(true)}>↻</button></div>}>
    <Alert>{error}</Alert>
    <div className="m-kpi-row"><div><span>ทั้งหมด</span><b>{fmt(kpi.total||rows.length)}</b></div><div className="warning"><span>เร่งด่วน</span><b>{fmt(kpi.urgent||0)}</b></div><div className="danger"><span>ค้าง DATA</span><b>{fmt(kpi.pending||0)}</b></div></div>
    <div className="m-segment wide">{TABS.map(([k,l])=><button key={k} className={tab===k?"active":""} onClick={()=>{setTab(k);setQ("");setStatus("");setUrgency("all")}}>{l}</button>)}</div>
    <MobileSearch value={q} onChange={setQ} placeholder="Order / Item / Part / Machine / PO..."/>
    {tab==="normal"&&<div className="m-filter-row m-filter-row-wide"><select value={urgency} onChange={e=>setUrgency(e.target.value)}><option value="all">สถานะงานด่วน: ทั้งหมด</option><option value="urgent">งานด่วน</option><option value="urgent_pending">งานด่วน + ค้าง DATA</option><option value="pending">งานค้าง DATA</option><option value="normal">รายการทั่วไป</option></select><select value={job} onChange={e=>setJob(e.target.value)}><option value="">ทุก JOB</option><option>REPAIR</option><option>MODIFY</option><option>AUTOMATION</option><option>PM</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">ทุกสถานะ</option><option>New Order</option><option>Wait Quotation</option><option>Wait Issue P/R</option><option>Wait for Item</option></select></div>}
    {loading?<MobileLoading/>:shown.length===0?<MobileEmpty/>:<div className="m-card-list">{shown.map(o=><article className="m-order-card" key={o.id}><div className="m-row-between"><div><b>{o.order_number}</b><small>{o.date||o.order_date||""}</small></div><span className={`m-order-life ${String(o.lifecycle_status||o.status).toLowerCase().replaceAll("_","-")}`}>{lifeLabel(o)}</span></div><div className="m-order-item"><b>{o.item_id||"-"}</b><h3>{o.part_name||"-"}</h3><p>{o.part_detail||o.detail||"-"}</p></div><div className="m-info-grid"><span>จำนวน<b>{fmt(o.amount)} {o.unit_text||o.unit||""}</b></span><span>Machine<b>{o.machine_code||o.machine_name||"-"}</b></span><span>PO<b>{o.po_number||o.po||"-"}</b></span><span>Vendor<b>{o.vendor_name||o.vendor||"-"}</b></span></div>{o.price_per_unit||o.price?<div className="m-order-value">฿ {money(Number(o.price_per_unit||o.price||0)*Number(o.amount||0))}</div>:null}<div className="m-order-actions">{auth.can("can_edit_order_info")&&["ACTIVE","WAIT_CONFIRM"].includes(o.lifecycle_status)&&<button onClick={()=>setEditor({order:o})}>แก้ Order</button>}{auth.can("can_edit_purchase_info")&&["ACTIVE","WAIT_CONFIRM"].includes(o.lifecycle_status)&&<button onClick={()=>setPurchase(o)}>Purchase</button>}{o.lifecycle_status==="ACTIVE"&&auth.can("can_edit_purchase_info")&&<button onClick={()=>act(o,"wait")} disabled={!!busy}>Wait Confirm</button>}{o.lifecycle_status==="WAIT_CONFIRM"&&auth.can("can_edit_purchase_info")&&<button onClick={()=>act(o,"cancelwait")} disabled={!!busy}>ยกเลิก Wait</button>}{["ACTIVE","WAIT_CONFIRM"].includes(o.lifecycle_status)&&auth.can("can_receive_order")&&<button className="receive" onClick={()=>act(o,"receive")} disabled={!!busy}>รับของ</button>}{["ACTIVE","WAIT_CONFIRM"].includes(o.lifecycle_status)&&auth.can("can_cancel_order")&&<button className="danger" onClick={()=>act(o,"cancel")} disabled={!!busy}>ยกเลิก</button>}{o.lifecycle_status==="CANCELLED"&&auth.can("can_cancel_order")&&<button onClick={()=>act(o,"restore")}>คืนรายการ</button>}{tab==="updates"&&auth.can("can_update_edit_data")&&<button onClick={()=>act(o,"update")}>Update Data</button>}{auth.can("can_delete_order")&&<button className="danger" onClick={()=>act(o,"delete")}>ลบ</button>}</div></article>)}</div>}
    {editor&&<OrderInfoModal order={editor.order} project={null} step={null} options={options} employee={auth.employee} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);load(true)}}/>}
    {purchase&&<PurchaseModal order={purchase} options={options} onClose={()=>setPurchase(null)} onChanged={r=>{setPurchase(r);load(true)}}/>}
  </MobilePage>
}
