import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader } from "../components/Common";

export const PERMISSIONS = [
  ["can_view_dashboard", "View Dashboard Stock", "Stock"],
  ["can_view_parts", "View Part & Stock", "Stock"],
  ["can_edit_parts", "Add / Edit Part", "Stock"],
  ["can_adjust_stock", "Adjust Stock", "Stock"],
  ["can_receive_stock", "Receive Stock", "Stock"],
  ["can_issue_stock", "Issue Stock", "Stock"],
  ["can_view_history", "View History", "History"],
  ["can_edit_history", "Edit History", "History"],
  ["can_delete_history", "Delete History", "History"],
  ["can_view_safety_stock", "View Safety Stock", "Safety Stock"],
  ["can_view_orders", "View Order", "Order"],
  ["can_add_order", "Add Order", "Order"],
  ["can_edit_order_info", "Edit Order Information", "Order"],
  ["can_edit_purchase_info", "Edit Purchase Information", "Order"],
  ["can_receive_order", "Receive Order", "Order"],
  ["can_cancel_order", "Cancel / Restore Order", "Order"],
  ["can_delete_order", "Delete Order", "Order"],
  ["can_update_edit_data", "Update Data Workflow", "Order"],
  ["can_manage_order_projects", "Manage Order Project / Step", "Order Step"],
  ["can_view_suppliers", "View Vendor", "Vendor"],
  ["can_manage_suppliers", "Add / Edit / Delete Vendor", "Vendor"],
  ["can_view_machines", "View Machines", "Machine"],
  ["can_manage_machines", "Add / Edit / Delete Machines", "Machine"],
  ["can_view_employees", "View Employees", "Employee"],
  ["can_add_employees", "Add Employee", "Employee"],
  ["can_edit_employees", "Edit Employee", "Employee"],
  ["can_view_audit_log", "View Audit Log", "Audit"],
  ["can_manage_roles", "Manage Roles & Permissions", "Admin"],
];

export function EmployeeModal({ row, roles, onClose, onSaved }) {
  const [form,setForm]=useState(row||{employee_code:"",name:"",department:"",role:"",active:true});
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const set=(k,v)=>setForm(x=>({...x,[k]:v}));
  async function save(e){e.preventDefault();setBusy(true);setError("");try{row?await apiPatch(`/employees/${row.id}/`,{...form,role:(form.role||"").trim().toUpperCase()}):await apiPost("/employees/",{...form,role:(form.role||"").trim().toUpperCase()});onSaved()}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <Modal title={row?"แก้ไขข้อมูลพนักงาน":"เพิ่มพนักงาน"} onClose={onClose}><form onSubmit={save}><div className="form-grid"><label className="field"><span>Employee Code *</span><input required value={form.employee_code} onChange={e=>set("employee_code",e.target.value)}/></label><label className="field"><span>ชื่อพนักงาน *</span><input required value={form.name} onChange={e=>set("name",e.target.value)}/></label><label className="field"><span>Department</span><input value={form.department||""} onChange={e=>set("department",e.target.value)}/></label><label className="field"><span>Role</span><select value={form.role||""} onChange={e=>set("role",e.target.value)}><option value="">-</option>{roles.filter(r=>r.active).map(r=><option key={r.id} value={r.role_name}>{r.display_name||r.role_name}</option>)}</select></label><label className="check"><input type="checkbox" checked={!!form.active} onChange={e=>set("active",e.target.checked)}/> Active</label></div><Alert>{error}</Alert><div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy}>บันทึก</button></div></form></Modal>
}

export function NewRoleModal({ onClose, onSaved }){const[name,setName]=useState("");const[display,setDisplay]=useState("");const[error,setError]=useState("");async function save(e){e.preventDefault();setError("");try{await apiPost("/roles/",{role_name:name.trim().toUpperCase(),display_name:display});onSaved()}catch(err){setError(err.message)}}return <Modal title="เพิ่ม Role" onClose={onClose}><form onSubmit={save}><label className="field"><span>Role Name *</span><input required value={name} onChange={e=>setName(e.target.value)} placeholder="PURCHASE"/></label><label className="field"><span>Display Name</span><input value={display} onChange={e=>setDisplay(e.target.value)}/></label><Alert>{error}</Alert><div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className="btn primary">เพิ่ม Role</button></div></form></Modal>}

export default function RoleSettings(){
  const auth=useAuth(); const[roles,setRoles]=useState([]); const[employees,setEmployees]=useState([]); const[logs,setLogs]=useState([]); const[tab,setTab]=useState("roles"); const[error,setError]=useState(""); const[msg,setMsg]=useState(""); const[empModal,setEmpModal]=useState(undefined); const[roleModal,setRoleModal]=useState(false); const[q,setQ]=useState("");
  async function load(){setError("");try{const tasks=[apiGet("/roles/")];if(auth.can("can_view_employees"))tasks.push(apiGet("/employees/"));if(auth.can("can_view_audit_log"))tasks.push(apiGet("/audit-logs/"));const out=await Promise.all(tasks);setRoles(out[0].results||[]);let i=1;if(auth.can("can_view_employees")){setEmployees(out[i].results||[]);i++}if(auth.can("can_view_audit_log"))setLogs(out[i]?.results||[])}catch(err){setError(err.message)}}
  useEffect(()=>{load()},[]);
  function toggle(id,key,value){setRoles(xs=>xs.map(r=>r.id===id?{...r,permissions:{...r.permissions,[key]:value}}:r))}
  async function saveRole(r){try{await apiPatch(`/roles/${r.id}/`,{permissions:r.permissions,display_name:r.display_name,active:r.active});setMsg(`บันทึก ${r.role_name} แล้ว`);await auth.refresh()}catch(err){setError(err.message)}}
  const groups=useMemo(()=>[...new Set(PERMISSIONS.map(x=>x[2]))],[]);
  const shownEmployees=employees.filter(x=>!q||`${x.employee_code} ${x.name} ${x.department} ${x.role}`.toLowerCase().includes(q.toLowerCase()));
  return <><PageHeader title="Role & Permissions" subtitle="จัดการสิทธิ์ Role, รายชื่อพนักงาน และ Audit Log"/><Alert type="success">{msg}</Alert><Alert>{error}</Alert><div className="tab-row page-tabs"><button className={`tab ${tab==="roles"?"active":""}`} onClick={()=>setTab("roles")}>Roles & Permissions</button>{auth.can("can_view_employees")&&<button className={`tab ${tab==="employees"?"active":""}`} onClick={()=>setTab("employees")}>รายชื่อพนักงาน</button>}{auth.can("can_view_audit_log")&&<button className={`tab ${tab==="logs"?"active":""}`} onClick={()=>setTab("logs")}>Audit Log</button>}</div>
  {tab==="roles"&&<section className="panel"><div className="section-head"><h2>Role Permission Matrix</h2><button className="btn primary" onClick={()=>setRoleModal(true)}>+ เพิ่ม Role</button></div><div className="role-grid">{roles.map(r=><div className="role-card" key={r.id}><div className="role-title"><div><strong>{r.display_name||r.role_name}</strong><small>{r.role_name}</small></div><span className={`status ${r.active?"success":"muted"}`}>{r.active?"Active":"Inactive"}</span></div>{groups.map(g=><div className="permission-group" key={g}><h4>{g}</h4>{PERMISSIONS.filter(x=>x[2]===g).map(([key,label])=><label className="permission-row" key={key}><span>{label}</span><input type="checkbox" checked={!!r.permissions[key]} onChange={e=>toggle(r.id,key,e.target.checked)}/></label>)}</div>)}<button className="btn primary full" onClick={()=>saveRole(r)}>Save permissions</button></div>)}</div></section>}
  {tab==="employees"&&<section className="panel"><div className="section-head"><div><h2>Employees</h2><p>Login ด้วย Employee Code</p></div>{auth.can("can_add_employees")&&<button className="btn primary" onClick={()=>setEmpModal(null)}>+ เพิ่มพนักงาน</button>}</div><div className="toolbar"><input className="search-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา Employee Code / Name / Department / Role..."/></div><div className="table-wrap"><table><thead><tr><th>Employee Code</th><th>Name</th><th>Department</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{shownEmployees.map(e=><tr key={e.id}><td><b>{e.employee_code}</b></td><td>{e.name}</td><td>{e.department||"-"}</td><td>{e.role||"-"}</td><td><span className={`status ${e.active?"success":"muted"}`}>{e.active?"Active":"Inactive"}</span></td><td>{auth.can("can_edit_employees")&&<button className="mini" onClick={()=>setEmpModal(e)}>แก้ไขข้อมูลพนักงาน</button>}</td></tr>)}</tbody></table></div></section>}
  {tab==="logs"&&<section className="panel"><div className="table-wrap"><table><thead><tr><th>Date Time</th><th>Employee</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{new Date(l.created_at).toLocaleString("th-TH")}</td><td>{l.employee?`${l.employee.employee_code} · ${l.employee.name}`:"-"}</td><td><b>{l.action}</b></td><td>{l.entity} {l.entity_id}</td><td><pre className="log-detail">{JSON.stringify(l.detail,null,2)}</pre></td></tr>)}</tbody></table></div></section>}
  {empModal!==undefined&&<EmployeeModal row={empModal} roles={roles} onClose={()=>setEmpModal(undefined)} onSaved={()=>{setEmpModal(undefined);load()}}/>}{roleModal&&<NewRoleModal onClose={()=>setRoleModal(false)} onSaved={()=>{setRoleModal(false);load()}}/>}</>
}
