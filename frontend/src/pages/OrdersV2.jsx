import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { apiDelete, apiGet, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, PageHeader, fmt, formatDMY } from "../components/Common";
import MultiMachineOrderInfoModal from "../components/MultiMachineOrderInfoModal";
import RFQComposeModal from "../components/RFQComposeModal";
import { useOptions } from "../optionsContext";
import { openOrderDetailByNumber } from "../orderDetailEnhancer";
import { PurchaseModal } from "./Orders";

const ORDER_TABS = [
  ["normal", "Order Normal"],
  ["updates", "ต้องอัปเดต"],
  ["confirm", "Wait Confirm"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["deleted", "Deleted"],
];
const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const STATUS = ["New Order","Wait Quotation","Wait Issue P/R","Wait for Item"];
const URGENCY = [
  ["all", "ติดตาม: ทั้งหมด"],
  ["urgent", "งานด่วน"],
  ["urgent_pending", "งานด่วน + ค้าง DATA"],
  ["pending", "งานค้าง DATA"],
  ["normal", "รายการทั่วไป"],
];

const ORDER_EXPORT_HEADERS = [
  "ORDER NUMBER",
  "DATE",
  "FACTORY",
  "MACHINE NAME",
  "JOB",
  "URGENT STATUS",
  "PENDING DATA DATE",
  "PART ID",
  "PART NAME",
  "PART DETAIL",
  "MAKER",
  "AMOUNT",
  "UNIT",
  "REMARK",
  "DRAWING PATH",
  "ORDERED BY",
  "QUOTATION",
  "VENDOR ORDER",
  "PO NUMBER",
  "PRICE PER UNIT",
  "PRICE TOTAL",
  "CURRENCY",
  "LEAD TIME",
  "ISSUE PR DATE",
  "DUE DATE",
  "VENDOR CONFIRM DATE",
  "PERSON IN CHARGE OF ORDER",
];

function pad(n){ return String(n).padStart(2,"0"); }
function monthRange(year, month){
  const last = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(last)}`,
  };
}
function displayStatus(order){
  if(order?.lifecycle_status === "WAIT_CONFIRM") return "Wait Confirm Order";
  if(order?.lifecycle_status === "CANCELLED") return "Cancelled";
  if(order?.lifecycle_status === "COMPLETED") return "Complete Order";
  return order?.display_status || order?.status || "New Order";
}
function statusClass(status){
  if(status === "Complete Order") return "success";
  if(status === "Cancelled") return "danger";
  if(status === "Wait for Item") return "warning";
  if(status === "Wait Confirm Order") return "confirm";
  if(status === "Wait Issue P/R" || status === "Wait Quotation") return "info";
  return "muted";
}
function isAdmin(employee){
  return ["admin","administrator"].includes(String(employee?.role || "").trim().toLowerCase());
}
function normalizeHeader(value){
  return String(value || "").replace(/\u00a0/g," ").trim().replace(/\s+/g," ").toUpperCase();
}
function normalizedRow(row){
  const out={}; Object.entries(row||{}).forEach(([k,v])=>{out[normalizeHeader(k)]=v;}); return out;
}
function cell(row,...aliases){
  for(const a of aliases){ const k=normalizeHeader(a); if(row[k]!==undefined && row[k]!==null && row[k]!=="") return row[k]; }
  return "";
}
function excelDate(value){
  if(!value) return "";
  if(typeof value === "number"){
    const d=XLSX.SSF.parse_date_code(value); if(!d) return "";
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const text=String(value).trim();
  const dmy=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(dmy) return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
  return text.slice(0,10);
}

function CompactOrderTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onDetail,
  onEdit,
  onPurchase,
  onUpdate,
  tab,
  auth,
  onRestore,
  onPermanentDelete,
}){
  const all=rows.length>0 && rows.every(x=>selected.has(x.id));
  if(!rows.length) return <div className="empty">ไม่พบ Order ในเดือนนี้</div>;
  return <div className="table-wrap order-table-v9-wrap"><table className="order-table-v9">
    <thead><tr>
      <th><input type="checkbox" checked={all} onChange={e=>onToggleAll(rows,e.target.checked)} /></th>
      <th>ORDER</th>
      <th>DATE</th>
      <th>อะไหล่ที่สั่ง</th>
      <th>จำนวน</th>
      <th>สถานะงานด่วน</th>
      <th>วันที่ค้าง DATA</th>
      <th>สถานะการสั่ง</th>
      <th></th>
    </tr></thead>
    <tbody>{rows.map(o=>{const s=displayStatus(o); return <tr key={o.id} className={selected.has(o.id)?"selected":""}>
      <td><input type="checkbox" checked={selected.has(o.id)} onChange={e=>onToggle(o.id,e.target.checked)} /></td>
      <td><b className="mono-cell">{o.order_number}</b></td>
      <td className="mono-cell">{o.date ? formatDMY(o.date) : "-"}</td>
      <td className="part-main-v9"><b>{o.item_id || "-"}</b><strong>{o.part_name || "-"}</strong></td>
      <td><b>{fmt(o.amount)} {o.unit || ""}</b></td>
      <td className="urgent-cell-v9">{o.urgent_status ? <span className="urgent-badge-v9">{o.urgent_status}</span> : <span className="muted-text-v9">-</span>}</td>
      <td className="pending-date-v9">{o.pending_data_date ? formatDMY(o.pending_data_date) : "-"}</td>
      <td><span className={`status ${statusClass(s)}`}>{s}</span></td>
      <td className="order-actions-v9">
        <button className="mini primary" onClick={()=>onDetail(o)}>รายละเอียด</button>
        {tab==="updates"&&auth.can("can_update_edit_data")&&<button className="mini" onClick={()=>onUpdate(o)}>อัปเดตข้อมูล</button>}
        {["normal","confirm"].includes(tab)&&auth.can("can_edit_order_info")&&<button className="mini" onClick={()=>onEdit(o)}>แก้ Order</button>}
        {["normal","confirm"].includes(tab)&&auth.can("can_edit_purchase_info")&&<button className="mini" onClick={()=>onPurchase(o)}>Purchase</button>}
        {tab==="deleted"&&auth.can("can_view_deleted_orders")&&<button className="mini" onClick={()=>onRestore(o)}>กู้คืน</button>}
        {tab==="deleted"&&auth.can("can_view_deleted_orders")&&auth.can("can_delete_order")&&<button className="mini danger" onClick={()=>onPermanentDelete(o)}>ลบถาวร</button>}
      </td>
    </tr>;})}</tbody>
  </table></div>;
}

function BulkBar({ rows, auth, busy, onRun, onClear, onRfq }){
  if(!rows.length) return null;
  const canWait=rows.some(x=>x.lifecycle_status==="ACTIVE");
  const canCancelWait=rows.some(x=>x.lifecycle_status==="WAIT_CONFIRM");
  const canAct=rows.some(x=>["ACTIVE","WAIT_CONFIRM"].includes(x.lifecycle_status));
  const canRestore=rows.some(x=>x.lifecycle_status==="CANCELLED");
  return <div className="bulk-v9"><b>เลือกแล้ว {rows.length} รายการ</b>
    {auth.can("can_edit_purchase_info")&&<>
      <button className="btn primary" disabled={busy||!canAct} onClick={onRfq}>บันทึกขอราคา</button>
      <button className="btn warning" disabled={busy||!canWait} onClick={()=>onRun("wait_confirm")}>รอ Confirm</button>
      <button className="btn ghost" disabled={busy||!canCancelWait} onClick={()=>onRun("cancel_wait_confirm")}>ยกเลิก Wait</button>
    </>}
    {auth.can("can_receive_order")&&<button className="btn success" disabled={busy||!canAct} onClick={()=>onRun("receive")}>รับของ</button>}
    {auth.can("can_cancel_order")&&<>
      <button className="btn warning" disabled={busy||!canAct} onClick={()=>onRun("cancel")}>ยกเลิก Order</button>
      {canRestore&&<button className="btn ghost" disabled={busy} onClick={()=>onRun("restore")}>คืนรายการ</button>}
    </>}
    {auth.can("can_delete_order")&&<button className="btn danger" disabled={busy} onClick={()=>onRun("delete")}>ลบ</button>}
    <button className="btn ghost" disabled={busy} onClick={onClear}>ล้างการเลือก</button>
  </div>;
}

export default function OrdersV2(){
  const auth=useAuth();
  const {options}=useOptions();
  const now=new Date();
  const [tab,setTab]=useState("normal");
  const [year,setYear]=useState(now.getFullYear());
  const [month,setMonth]=useState(now.getMonth());
  const [rows,setRows]=useState([]);
  const [kpi,setKpi]=useState({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [qInput,setQInput]=useState("");
  const [q,setQ]=useState("");
  const [urgency,setUrgency]=useState("all");
  const [job,setJob]=useState("");
  const [status,setStatus]=useState("");
  const [lastLoadedAt,setLastLoadedAt]=useState(null);
  const [selected,setSelected]=useState(()=>new Set());
  const [bulkBusy,setBulkBusy]=useState(false);
  const [editor,setEditor]=useState(null);
  const [purchase,setPurchase]=useState(null);
  const [rfqCompose,setRfqCompose]=useState(false);
  const [importBusy,setImportBusy]=useState(false);
  const [exportBusy,setExportBusy]=useState(false);
  const fileRef=useRef(null);
  const admin=isAdmin(auth.employee);
  const range=useMemo(()=>monthRange(year,month),[year,month]);
  const selectedRows=useMemo(()=>rows.filter(x=>selected.has(x.id)),[rows,selected]);

  useEffect(()=>{const t=setTimeout(()=>setQ(qInput.trim()),350);return()=>clearTimeout(t);},[qInput]);

  async function load(force=false){
    setLoading(true); setError("");
    try{
      const p=new URLSearchParams({view:tab,q,urgency,job,status,date_from:range.from,date_to:range.to});
      const data=await apiGet(`/orders/?${p}`,{forceRefresh:force,cache:false});
      setRows(data.results||[]); setKpi(data.kpi||{}); setLastLoadedAt(new Date());
    }catch(e){setError(e.message);setRows([]);setKpi({});}
    finally{setLoading(false);}
  }
  useEffect(()=>{setSelected(new Set());load();},[tab,q,urgency,job,status,range.from,range.to]);

  function toggle(id,checked){setSelected(cur=>{const next=new Set(cur);checked?next.add(id):next.delete(id);return next;});}
  function toggleAll(tableRows,checked){setSelected(cur=>{const next=new Set(cur);tableRows.forEach(r=>checked?next.add(r.id):next.delete(r.id));return next;});}

  function targets(action){
    if(action==="wait_confirm") return selectedRows.filter(x=>x.lifecycle_status==="ACTIVE");
    if(action==="cancel_wait_confirm") return selectedRows.filter(x=>x.lifecycle_status==="WAIT_CONFIRM");
    if(action==="receive"||action==="cancel") return selectedRows.filter(x=>["ACTIVE","WAIT_CONFIRM"].includes(x.lifecycle_status));
    if(action==="restore") return selectedRows.filter(x=>x.lifecycle_status==="CANCELLED");
    return selectedRows;
  }
  async function runBulk(action){
    const list=targets(action); if(!list.length){setError("รายการที่เลือกไม่มีรายการที่รองรับ Action นี้");return;}
    const labels={wait_confirm:"เปลี่ยนเป็น Wait Confirm",cancel_wait_confirm:"ยกเลิก Wait Confirm",receive:"รับของ",cancel:"ยกเลิก Order",restore:"คืนรายการ",delete:"ลบ"};
    if(!window.confirm(`ยืนยัน ${labels[action]} ${list.length} รายการ?`)) return;
    const reason=action==="cancel"?(window.prompt("เหตุผลการยกเลิก (ไม่บังคับ)","")||""):"";
    setBulkBusy(true); setError(""); const fail=[];
    for(const o of list){try{
      if(action==="wait_confirm") await apiPost(`/orders/${o.id}/wait-confirm/`,{wait_confirm:true});
      if(action==="cancel_wait_confirm") await apiPost(`/orders/${o.id}/wait-confirm/`,{wait_confirm:false});
      if(action==="receive") await apiPost(`/orders/${o.id}/receive/`,{});
      if(action==="cancel") await apiPost(`/orders/${o.id}/cancel/`,{cancel:true,reason});
      if(action==="restore") await apiPost(`/orders/${o.id}/cancel/`,{cancel:false});
      if(action==="delete") await apiDelete(`/orders/${o.id}/delete/`);
    }catch(e){fail.push(`${o.order_number}: ${e.message}`);}}
    if(fail.length) setError(`ไม่สำเร็จ ${fail.length} รายการ · ${fail.slice(0,3).join(" | ")}`);
    setBulkBusy(false); setSelected(new Set()); await load(true);
  }
  async function restoreOrder(order){
    if(!window.confirm(`กู้คืน Order ${order.order_number}?`)) return;
    try{await apiPost(`/orders/${order.id}/restore/`,{});await load(true);}catch(e){setError(e.message);}
  }
  async function permanentDeleteOrder(order){
    if(!window.confirm(`ลบ Order ${order.order_number} ออกจากฐานข้อมูลถาวร?\n\nการกระทำนี้ไม่สามารถกู้คืนได้`)) return;
    const typed=window.prompt(`เพื่อยืนยันอีกครั้ง กรุณาพิมพ์ Order Number\n${order.order_number}`,"");
    if(typed===null) return;
    if(String(typed).trim()!==String(order.order_number||"").trim()){
      setError("Order Number ที่พิมพ์ไม่ตรง ยกเลิกการลบถาวร");
      return;
    }
    try{
      await apiDelete(`/orders/${order.id}/permanent-delete/`);
      setSelected(cur=>{const next=new Set(cur);next.delete(order.id);return next;});
      await load(true);
    }catch(e){setError(e.message);}
  }
  async function updateData(order){
    if(!window.confirm(`ยืนยันอัปเดตข้อมูล ${order.order_number}?`)) return;
    try{await apiPost(`/orders/${order.id}/update-data/`,{});await load(true);}catch(e){setError(e.message);}
  }

  async function exportSelectedOrders(){
    if(!selectedRows.length){setError("กรุณาเลือกรายการ Order ที่ต้องการ Export");return;}
    setExportBusy(true); setError("");
    try{
      const rfqGroups=await Promise.all(selectedRows.map(async order=>{
        try{
          const data=await apiGet(`/rfqs/?order_id=${order.id}&full=true`,{cache:false,forceRefresh:true});
          return data.results||[];
        }catch{
          return [];
        }
      }));
      const exportRows=selectedRows.map((o,index)=>{
        const rfqNumbers=[...new Set((rfqGroups[index]||[]).map(r=>r.rfq_number).filter(Boolean))];
        const vendor=o.vendor_code&&o.vendor_name?`${o.vendor_code} · ${o.vendor_name}`:(o.vendor_name||o.vendor_code||"");
        return {
          "ORDER NUMBER":o.order_number||"",
          DATE:o.date||"",
          FACTORY:o.factory||"",
          "MACHINE NAME":o.machine_codes||o.machine_code||o.machine_names||o.machine_name||"",
          JOB:o.job||"",
          "URGENT STATUS":o.urgent_status||"",
          "PENDING DATA DATE":o.pending_data_date||"",
          "PART ID":o.item_id||"",
          "PART NAME":o.part_name||"",
          "PART DETAIL":o.part_detail||"",
          MAKER:o.maker||"",
          AMOUNT:o.amount??"",
          UNIT:o.unit||"",
          REMARK:o.remark||"",
          "DRAWING PATH":o.drawing_path||"",
          "ORDERED BY":o.ordered_by||"",
          QUOTATION:rfqNumbers.join(", ")||o.quotation||"",
          "VENDOR ORDER":vendor,
          "PO NUMBER":o.po_number||"",
          "PRICE PER UNIT":o.price_per_unit??"",
          "PRICE TOTAL":o.price_total??(Number(o.amount||0)*Number(o.price_per_unit||0)),
          CURRENCY:o.currency||"THB",
          "LEAD TIME":o.lead_time_days??"",
          "ISSUE PR DATE":o.issue_pr_date||"",
          "DUE DATE":o.due_date||"",
          "VENDOR CONFIRM DATE":o.vendor_confirm_date||"",
          "PERSON IN CHARGE OF ORDER":o.person_in_charge||"",
        };
      });
      const ws=XLSX.utils.json_to_sheet(exportRows,{header:ORDER_EXPORT_HEADERS});
      ws["!cols"]=ORDER_EXPORT_HEADERS.map(header=>({wch:Math.min(Math.max(header.length+2,14),34)}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"Orders");
      const stamp=new Date();
      const filename=`orders_export_${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.xlsx`;
      XLSX.writeFile(wb,filename);
    }catch(e){
      setError(`Export ไม่สำเร็จ: ${e.message}`);
    }finally{
      setExportBusy(false);
    }
  }

  function downloadTemplate(){
    const example={"ORDER NUMBER":"",DATE:range.from,FACTORY:"Phase4","MACHINE NAME":"",JOB:"REPAIR","URGENT STATUS":"","PENDING DATA DATE":"","PART ID":"","PART NAME":"","PART DETAIL":"",MAKER:"",AMOUNT:1,UNIT:"EA",REMARK:"","ORDERED BY":auth.employee?.name||"",QUOTATION:"","PO NUMBER":"","PRICE PER UNIT":"","CURRENCY":"THB","VENDOR ORDER":"","LEAD TIME":"","ISSUE PR DATE":"","DUE DATE":"","VENDOR CONFIRM DATE":"","PERSON IN CHARGE OF ORDER":""};
    const ws=XLSX.utils.json_to_sheet([example]); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Import Template"); XLSX.writeFile(wb,"orders_import_template.xlsx");
  }
  async function importExcel(file){
    if(!file)return; setImportBusy(true);setError("");
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false});
      const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
      const normalized=raw.map(normalizedRow).map(r=>({
        order_number:cell(r,"ORDER NUMBER","ORDER NO"),date:excelDate(cell(r,"DATE","ORDER DATE")),factory:String(cell(r,"FACTORY","WAREHOUSE")||"Phase4").toLowerCase().includes("11")?"MM-11":"MM-4",machine:cell(r,"MACHINE NAME","MACHINE","M/C"),job:cell(r,"JOB"),urgent_status:cell(r,"URGENT STATUS","สถานะงานด่วน"),pending_data_date:excelDate(cell(r,"PENDING DATA DATE","วันที่งานค้าง")),item_id:cell(r,"PART ID","ITEM ID","ITEM","PART NO"),part_name:cell(r,"PART NAME"),part_detail:cell(r,"PART DETAIL","DESCRIPTION"),maker:cell(r,"MAKER","MANUFACTURER"),amount:cell(r,"AMOUNT","QTY","QUANTITY")||0,unit:cell(r,"UNIT"),remark:cell(r,"REMARK","NOTE"),ordered_by:cell(r,"ORDERED BY","ORDER BY"),quotation:cell(r,"QUOTATION","QUOTE"),po_number:cell(r,"PO NUMBER","PO NO","PO"),price_per_unit:cell(r,"PRICE PER UNIT","UNIT PRICE"),currency:cell(r,"CURRENCY")||"THB",vendor_order:cell(r,"VENDOR ORDER","VENDOR","SUPPLIER"),lead_time_days:cell(r,"LEAD TIME","LEAD TIME DAYS"),issue_pr_date:excelDate(cell(r,"ISSUE PR DATE","PR DATE")),due_date:excelDate(cell(r,"DUE DATE")),vendor_confirm_date:excelDate(cell(r,"VENDOR CONFIRM DATE","CONFIRM DATE")),person_in_charge:cell(r,"PERSON IN CHARGE OF ORDER","PERSON IN CHARGE","PIC")
      })).filter(r=>Object.values(r).some(v=>String(v||"").trim()!==""));
      if(!normalized.length) throw new Error("ไม่มีข้อมูลสำหรับ Import");
      if(!window.confirm(`พบ ${normalized.length} แถว ยืนยัน Import?`)) return;
      const result=await apiPost("/orders/import/",{filename:file.name,rows:normalized});
      setError(`Import สำเร็จ ${result.created||0} · แทนที่ ${result.replaced||0}${result.errors?.length?` · ข้าม ${result.errors.length}`:""}`);
      await load(true);
    }catch(e){setError(e.message);}finally{setImportBusy(false);if(fileRef.current)fileRef.current.value="";}
  }

  return <>
    <PageHeader
      title="Order"
      subtitle={`แสดงข้อมูล ${MONTHS_TH[month]} ${year} · โหลดเฉพาะเดือนที่เลือก`}
      actions={tab==="normal"&&auth.can("can_add_order")?<>
        <button className="btn primary" onClick={()=>setEditor({order:null})}>+ เพิ่ม Order</button>
        {auth.can("can_delete_order")&&<button className="btn ghost" disabled={importBusy} onClick={()=>fileRef.current?.click()}>{importBusy?"กำลัง Import...":"⬆ Import Excel"}</button>}
        <input hidden ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e=>importExcel(e.target.files?.[0])}/>
      </>:null}
    />
    <Alert>{error}</Alert>

    {tab!=="deleted"&&<div className="kpi-grid five order-kpi-v9">
      <div className="kpi-card"><span>Order ที่กำลังสั่ง</span><strong>{fmt(kpi.total)}</strong></div>
      <div className="kpi-card danger"><span>ด่วนเครื่องหยุด</span><strong>{fmt(kpi.urgent_stop)}</strong></div>
      <div className="kpi-card warning"><span>ด่วนเครื่องไม่หยุด</span><strong>{fmt(kpi.urgent_no_stop)}</strong></div>
      <div className="kpi-card info"><span>งานค้าง DATA</span><strong>{fmt(kpi.pending)}</strong></div>
      <div className="kpi-card"><span>Wait Confirm</span><strong>{fmt(kpi.wait_confirm)}</strong></div>
    </div>}

    <div className="order-nav-v9">
      <div className="order-status-tabs-v9">{ORDER_TABS.filter(([key])=>(key!=="updates"||auth.can("can_view_order_updates"))&&(key!=="deleted"||auth.can("can_view_deleted_orders"))).map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>{setTab(key);setQInput("");setQ("");setSelected(new Set());}}>{label}</button>)}</div>
      <div className="order-month-head-v9"><button onClick={()=>setYear(y=>y-1)}>‹</button><b>{year}</b><button onClick={()=>setYear(y=>y+1)}>›</button><span>เลือกเดือนเพื่อโหลดข้อมูล</span></div>
      <div className="order-month-tabs-v9">{MONTHS_TH.map((label,i)=><button key={label} className={month===i?"active":""} onClick={()=>setMonth(i)}><span>{label}</span>{year===now.getFullYear()&&i===now.getMonth()&&<small>ปัจจุบัน</small>}</button>)}</div>
    </div>

    <section className="panel order-panel-v9">
      <div className="order-filter-v9">
        <input className="search-input" value={qInput} onChange={e=>setQInput(e.target.value)} placeholder="ค้นหา Order / Part ID / Part / Machine / ผู้สั่ง..." />
        {tab==="normal"&&<>
          <select value={urgency} onChange={e=>setUrgency(e.target.value)}>{URGENCY.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
          <select value={job} onChange={e=>setJob(e.target.value)}><option value="">JOB: ทั้งหมด</option><option>REPAIR</option><option>MODIFY</option><option>AUTOMATION</option><option>PM</option></select>
          <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">STATUS: ทั้งหมด</option>{STATUS.map(x=><option key={x}>{x}</option>)}</select>
        </>}
        <button className="btn ghost" onClick={()=>load(true)}>↻ รีเฟรช</button>
        {tab==="normal"&&auth.can("can_add_order")&&auth.can("can_delete_order")&&<button className="btn ghost" onClick={downloadTemplate}>⬇ Template</button>}
        <button className="btn ghost" disabled={!selectedRows.length||exportBusy} onClick={exportSelectedOrders}>{exportBusy?"กำลัง Export...":`⬇ Export Order${selectedRows.length?` (${selectedRows.length})`:""}`}</button>
        {lastLoadedAt&&<span>อัปเดต {lastLoadedAt.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</span>}
      </div>

      {tab!=="deleted"&&<BulkBar rows={selectedRows} auth={auth} busy={bulkBusy} onRun={runBulk} onClear={()=>setSelected(new Set())} onRfq={()=>setRfqCompose(true)}/>}      
      {loading?<div className="empty">กำลังโหลด {MONTHS_TH[month]} {year}...</div>:<CompactOrderTable
        rows={rows}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        onDetail={o=>openOrderDetailByNumber(o.order_number,admin)}
        onEdit={o=>setEditor({order:o})}
        onPurchase={o=>setPurchase(o)}
        onUpdate={updateData}
        tab={tab}
        auth={auth}
        onRestore={restoreOrder}
        onPermanentDelete={permanentDeleteOrder}
      />}
    </section>

    {editor&&<MultiMachineOrderInfoModal order={editor.order} options={options} employee={auth.employee} canEditOrderDate={auth.can("can_edit_order_date")} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);load(true);}}/>}
    {purchase&&<PurchaseModal order={purchase} options={options} onClose={()=>setPurchase(null)} onChanged={r=>{setPurchase(r);load(true);}}/>}
    {rfqCompose&&<RFQComposeModal orders={selectedRows} options={options} onClose={()=>setRfqCompose(false)} onRecorded={()=>{setRfqCompose(false);setSelected(new Set());load(true);}}/>}
  </>;
}
