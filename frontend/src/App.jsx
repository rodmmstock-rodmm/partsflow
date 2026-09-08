import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import SafetyStock from "./pages/SafetyStock";
import SpareSets from "./pages/SpareSets";
import Orders from "./pages/Orders";
import FastOrders from "./pages/FastOrders";
import Vendors from "./pages/Vendors";
import Machines from "./pages/Machines";
import RoleSettings from "./pages/RoleSettings";
import POBalance from "./pages/POBalance";
import Login from "./pages/Login";
import MobileShell from "./mobile/MobileShell";

const NAV = [
  ["/", "Dashboard Stock", "box", "can_view_dashboard"],
  ["/history", "History", "clock", "can_view_history"],
  ["/safety-stock", "Safety Stock", "alert", "can_view_safety_stock"],
  ["/orders", "Order", "cart", "can_view_orders"],
  ["/order-steps", "Order Step", "steps", "can_view_orders"],
  ["/po-balance", "PO Balance", "mail", "can_view_orders"],
  ["/fast-orders", "Fast Order", "zap", "can_view_orders"],
  ["/vendors", "Vendor", "vendor", "can_view_suppliers"],
  ["/machines", "Machines", "gear", "can_view_machines"],
  ["/settings/roles", "Role & Permissions", "shield", "can_manage_roles"],
];

const ICON_SPRITE = (
  <svg style={{ display: "none" }} aria-hidden="true">
    <symbol id="ic-box" viewBox="0 0 24 24"><path d="M21 8L12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></symbol>
    <symbol id="ic-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></symbol>
    <symbol id="ic-alert" viewBox="0 0 24 24"><path d="M10.6 3.9L2.4 18a1.8 1.8 0 001.6 2.7h16a1.8 1.8 0 001.6-2.7L13.4 3.9a1.8 1.8 0 00-2.8 0z"/><path d="M12 9.5v4"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-cart" viewBox="0 0 24 24"><circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="20" r="1.1" fill="currentColor" stroke="none"/><path d="M2.5 3h2l2.3 12a1.8 1.8 0 001.8 1.5h8.4a1.8 1.8 0 001.8-1.4L21 7.5H6.2"/></symbol>
    <symbol id="ic-steps" viewBox="0 0 24 24"><rect x="6" y="3.2" width="12" height="17.6" rx="2"/><path d="M9.3 3.2v-.4a1 1 0 011-1h3.4a1 1 0 011 1v.4"/><path d="M9 9.5h6M9 13h6M9 16.5h3.5"/></symbol>
    <symbol id="ic-mail" viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></symbol>
    <symbol id="ic-vendor" viewBox="0 0 24 24"><rect x="4.5" y="3" width="15" height="18" rx="1.2"/><path d="M9 7.3h.9M14.1 7.3h.9M9 11.3h.9M14.1 11.3h.9M9 15.3h.9M14.1 15.3h.9"/><path d="M10.2 21v-3.4h3.6V21"/></symbol>
    <symbol id="ic-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5c.1.6.1 1.2 0 1.8l1.7 1.3-1.5 2.6-2-.6a7 7 0 01-1.6.9l-.3 2.1H10.3l-.3-2.1a7 7 0 01-1.6-.9l-2 .6-1.5-2.6L6.6 15c-.1-.6-.1-1.2 0-1.8L4.9 11.9l1.5-2.6 2 .6c.5-.4 1-.7 1.6-.9l.3-2.1h3.4l.3 2.1c.6.2 1.1.5 1.6.9l2-.6 1.5 2.6z"/></symbol>
    <symbol id="ic-shield" viewBox="0 0 24 24"><path d="M12 2.5l7.5 3.4v5.3c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.9L12 2.5z"/><path d="M9 12l2 2 4-4.2"/></symbol>
    <symbol id="ic-zap" viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></symbol>
    <symbol id="ic-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></symbol>
  </svg>
);

function useIsMobile(){
  const [mobile,setMobile]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 767px)").matches);
  useEffect(()=>{const m=window.matchMedia("(max-width: 767px)");const fn=e=>setMobile(e.matches);fn(m);m.addEventListener?.("change",fn);return()=>m.removeEventListener?.("change",fn)},[]);
  return mobile;
}
function Protected({ permission, children }) { const auth = useAuth(); if (auth.loading) return <div className="auth-loading">กำลังตรวจสอบสิทธิ์...</div>; if (!auth.authenticated) return <Navigate to="/login" replace />; if (permission && !auth.can(permission)) return <Navigate to="/" replace />; return children; }
function DesktopShell() {
  const auth = useAuth(); const navigate = useNavigate(); const visible = NAV.filter(([, , , permission]) => auth.can(permission));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  async function logout() { await auth.logout(); navigate("/login", { replace: true }); }
  return <div className="app-shell">
    {ICON_SPRITE}
    {!sidebarOpen && <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="เปิดเมนู">☰</button>}
    {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
    <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
      <div className="brand">
        <div className="brand-logo">PF</div>
        <div><strong>PartsFlow</strong><span>Spare Parts & Purchasing</span></div>
        <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู">✕</button>
      </div>
      <nav className="nav-list">{visible.map(([to,label,icon])=><NavLink key={to} to={to} end={to==="/"} onClick={()=>setSidebarOpen(false)} className={({isActive})=>isActive?"nav-link active":"nav-link"}><svg className="nav-icon"><use href={`#ic-${icon}`}/></svg><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-user"><div><strong>{auth.employee?.name}</strong><span>{auth.employee?.employee_code} · {auth.employee?.role||"No Role"}</span></div><button className="icon-btn" onClick={logout}>⏻</button></div>
    </aside>
    <main className="main-content"><Routes><Route path="/" element={<Protected permission="can_view_dashboard"><Dashboard/></Protected>}/><Route path="/spare-sets" element={<Protected permission="can_view_dashboard"><SpareSets/></Protected>}/><Route path="/history" element={<Protected permission="can_view_history"><History/></Protected>}/><Route path="/safety-stock" element={<Protected permission="can_view_safety_stock"><SafetyStock/></Protected>}/><Route path="/orders" element={<Protected permission="can_view_orders"><Orders mode="orders"/></Protected>}/><Route path="/po-balance" element={<Protected permission="can_view_orders"><POBalance/></Protected>}/><Route path="/order-steps" element={<Protected permission="can_view_orders"><Orders mode="steps"/></Protected>}/><Route path="/fast-orders" element={<Protected permission="can_view_orders"><FastOrders/></Protected>}/><Route path="/vendors" element={<Protected permission="can_view_suppliers"><Vendors/></Protected>}/><Route path="/machines" element={<Protected permission="can_view_machines"><Machines/></Protected>}/><Route path="/settings/roles" element={<Protected permission="can_manage_roles"><RoleSettings/></Protected>}/></Routes></main>
  </div>;
}
function ResponsiveShell(){return useIsMobile()?<MobileShell/>:<DesktopShell/>}
export default function App(){return <Routes><Route path="/login" element={<Login/>}/><Route path="/*" element={<Protected><ResponsiveShell/></Protected>}/></Routes>}
