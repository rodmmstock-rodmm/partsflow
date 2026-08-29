import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert } from "../components/Common";
import { MachineModal } from "../pages/Machines";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

export default function MobileMachines(){
  const auth=useAuth();
  const[rows,setRows]=useState([]),[q,setQ]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[modal,setModal]=useState(undefined);
  async function load(force=false){setLoading(true);setError("");try{const d=await apiGet("/machines/",{forceRefresh:force});setRows(d.results||[])}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const shown=useMemo(()=>rows.filter(x=>!q||`${x.code} ${x.name} ${x.dept_code} ${x.work_code} ${x.location}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
  async function remove(x){if(!confirm(`ยืนยันลบ Machine ${x.code}?`))return;try{await apiDelete(`/machines/${x.id}/`);await load(true)}catch(e){setError(e.message)}}
  return <MobilePage title="Machines" subtitle="Machine Master" actions={<div className="m-page-actions">{auth.can("can_manage_machines")&&<button className="m-icon-action" onClick={()=>setModal(null)}>＋</button>}<button className="m-icon-action" onClick={()=>load(true)}>↻</button></div>}>
    <Alert>{error}</Alert><MobileSearch value={q} onChange={setQ} placeholder="Machine / Dept / Work Code..."/>
    {loading?<MobileLoading/>:shown.length===0?<MobileEmpty/>:<div className="m-card-list">{shown.map(x=><article className="m-master-card" key={x.id}><div className="m-row-between"><div><b>{x.code}</b><h3>{x.name}</h3></div><span className={`status ${x.active?"success":"muted"}`}>{x.active?"Active":"Inactive"}</span></div><div className="m-info-grid"><span>Dept Code<b>{x.dept_code||"-"}</b></span><span>Work Code<b>{x.work_code||"-"}</b></span><span>Location<b>{x.location||"-"}</b></span><span>Type<b>{x.machine_type||"-"}</b></span></div>{auth.can("can_manage_machines")&&<div className="m-card-actions"><button onClick={()=>setModal(x)}>แก้ไข</button><button className="danger" onClick={()=>remove(x)}>ลบ</button></div>}</article>)}</div>}
    {modal!==undefined&&<MachineModal row={modal} onClose={()=>setModal(undefined)} onSaved={()=>{setModal(undefined);load(true)}}/>}
  </MobilePage>
}
