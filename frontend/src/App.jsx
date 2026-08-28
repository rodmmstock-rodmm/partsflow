import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import SafetyStock from "./pages/SafetyStock";
import Orders from "./pages/Orders";
import FastOrders from "./pages/FastOrders";
import Vendors from "./pages/Vendors";
import Machines from "./pages/Machines";
import RoleSettings from "./pages/RoleSettings";
import Login from "./pages/Login";
import MobileShell from "./mobile/MobileShell";

const NAV = [
  ["/", "Dashboard Stock", "▦", "can_view_dashboard"],
  ["/history", "History", "↕", "can_view_history"],
  ["/safety-stock", "Safety Stock", "!", "can_view_safety_stock"],
  ["/orders", "Order", "🛒", "can_view_orders"],
  ["/order-steps", "Order Step", "▤", "can_view_orders"],
  ["/fast-orders", "Fast Order", "⚡", "can_view_orders"],
  ["/vendors", "Vendor", "◫", "can_view_suppliers"],
  ["/machines", "Machines", "⚙", "can_view_machines"],
  ["/settings/roles", "Role & Permissions", "🔐", "can_manage_roles"],
];

function useIsMobile(){
  const [mobile,setMobile]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 767px)").matches);
  useEffect(()=>{const m=window.matchMedia("(max-width: 767px)");const fn=e=>setMobile(e.matches);fn(m);m.addEventListener?.("change",fn);return()=>m.removeEventListener?.("change",fn)},[]);
  return mobile;
}
function Protected({ permission, children }) { const auth = useAuth(); if (auth.loading) return <div className="auth-loading">กำลังตรวจสอบสิทธิ์...</div>; if (!auth.authenticated) return <Navigate to="/login" replace />; if (permission && !auth.can(permission)) return <Navigate to="/" replace />; return children; }
function DesktopShell() {
  const auth = useAuth(); const navigate = useNavigate(); const visible = NAV.filter(([, , , permission]) => auth.can(permission));
  async function logout() { await auth.logout(); navigate("/login", { replace: true }); }
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-logo">PF</div><div><strong>PartsFlow</strong><span>Spare Parts & Purchasing</span></div></div><nav className="nav-list">{visible.map(([to,label,icon])=><NavLink key={to} to={to} end={to==="/"} className={({isActive})=>isActive?"nav-link active":"nav-link"}><span className="nav-icon">{icon}</span><span>{label}</span></NavLink>)}</nav><div className="sidebar-user"><div><strong>{auth.employee?.name}</strong><span>{auth.employee?.employee_code} · {auth.employee?.role||"No Role"}</span></div><button className="icon-btn" onClick={logout}>⏻</button></div></aside><main className="main-content"><Routes><Route path="/" element={<Protected permission="can_view_dashboard"><Dashboard/></Protected>}/><Route path="/history" element={<Protected permission="can_view_history"><History/></Protected>}/><Route path="/safety-stock" element={<Protected permission="can_view_safety_stock"><SafetyStock/></Protected>}/><Route path="/orders" element={<Protected permission="can_view_orders"><Orders mode="orders"/></Protected>}/><Route path="/order-steps" element={<Protected permission="can_view_orders"><Orders mode="steps"/></Protected>}/><Route path="/fast-orders" element={<Protected permission="can_view_orders"><FastOrders/></Protected>}/><Route path="/vendors" element={<Protected permission="can_view_suppliers"><Vendors/></Protected>}/><Route path="/machines" element={<Protected permission="can_view_machines"><Machines/></Protected>}/><Route path="/settings/roles" element={<Protected permission="can_manage_roles"><RoleSettings/></Protected>}/></Routes></main></div>;
}
function ResponsiveShell(){return useIsMobile()?<MobileShell/>:<DesktopShell/>}
export default function App(){return <Routes><Route path="/login" element={<Login/>}/><Route path="/*" element={<Protected><ResponsiveShell/></Protected>}/></Routes>}
