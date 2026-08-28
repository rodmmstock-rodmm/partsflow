import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import MobileDashboard from "./MobileDashboard";
import MobileHistory from "./MobileHistory";
import MobileSafetyStock from "./MobileSafetyStock";
import MobileOrders from "./MobileOrders";
import MobileOrderSteps from "./MobileOrderSteps";
import MobileFastOrders from "./MobileFastOrders";
import MobileVendors from "./MobileVendors";
import MobileMachines from "./MobileMachines";
import MobileRoles from "./MobileRoles";

const NAV=[
 ["/","Stock","▦","can_view_dashboard"],["/history","History","↕","can_view_history"],["/safety-stock","Safety","!","can_view_safety_stock"],["/orders","Order","🛒","can_view_orders"],["/order-steps","Steps","▤","can_view_orders"],["/fast-orders","Fast","⚡","can_view_orders"],["/vendors","Vendor","◫","can_view_suppliers"],["/machines","Machine","⚙","can_view_machines"],["/settings/roles","Roles","🔐","can_manage_roles"]
];
function Protected({permission,children}){const auth=useAuth();if(permission&&!auth.can(permission))return <Navigate to="/" replace/>;return children}
export default function MobileShell(){const auth=useAuth(),navigate=useNavigate();const visible=NAV.filter(([, , ,p])=>auth.can(p));async function logout(){await auth.logout();navigate("/login",{replace:true})}return <div className="mobile-app-shell"><header className="m-topbar"><div className="m-brand"><div className="brand-logo small">PF</div><div><strong>PartsFlow</strong><span>{auth.employee?.name} · {auth.employee?.role}</span></div></div><button onClick={logout}>⏻</button></header><main className="m-main"><Routes><Route path="/" element={<Protected permission="can_view_dashboard"><MobileDashboard/></Protected>}/><Route path="/history" element={<Protected permission="can_view_history"><MobileHistory/></Protected>}/><Route path="/safety-stock" element={<Protected permission="can_view_safety_stock"><MobileSafetyStock/></Protected>}/><Route path="/orders" element={<Protected permission="can_view_orders"><MobileOrders/></Protected>}/><Route path="/order-steps" element={<Protected permission="can_view_orders"><MobileOrderSteps/></Protected>}/><Route path="/fast-orders" element={<Protected permission="can_view_orders"><MobileFastOrders/></Protected>}/><Route path="/vendors" element={<Protected permission="can_view_suppliers"><MobileVendors/></Protected>}/><Route path="/machines" element={<Protected permission="can_view_machines"><MobileMachines/></Protected>}/><Route path="/settings/roles" element={<Protected permission="can_manage_roles"><MobileRoles/></Protected>}/></Routes></main><nav className="m-bottom-nav">{visible.map(([to,label,icon])=><NavLink key={to} to={to} end={to==="/"} className={({isActive})=>isActive?"active":""}><span>{icon}</span><small>{label}</small></NavLink>)}</nav></div>}
