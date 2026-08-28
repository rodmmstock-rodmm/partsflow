import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Login from "./pages/Login";
import Machines from "./pages/Machines";
import Parts from "./pages/Parts";
import RoleSettings from "./pages/RoleSettings";
import Suppliers from "./pages/Suppliers";

const NAV = [
  ["/","Dashboard","📊","can_view_dashboard"],
  ["/parts","Parts","🧰","can_view_parts"],
  ["/inventory","Inventory","📦","can_view_parts"],
  ["/suppliers","Suppliers","🏢","can_view_suppliers"],
  ["/machines","Machines","⚙️","can_view_machines"],
  ["/settings/roles","Role & Permissions","🔐","can_manage_roles"],
];

function Protected({ permission, children }) {
  const auth = useAuth();
  if (auth.loading) return <div className="pf-auth-loading">กำลังตรวจสอบสิทธิ์...</div>;
  if (!auth.authenticated) return <Navigate to="/login" replace />;
  if (permission && !auth.can(permission)) return <Navigate to="/" replace />;
  return children;
}

function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const visible = NAV.filter(([, , , p]) => auth.can(p));
  async function logout(){ await auth.logout(); navigate("/login",{replace:true}); }

  return <div className="pf-ref-shell">
    <aside className="pf-ref-sidebar">
      <div className="pf-ref-sidebar-brand">
        <div className="pf-ref-brand-logo">PF</div>
        <div><strong>PartsFlow</strong><span>ระบบจัดการสต๊อกและจัดซื้อ</span></div>
      </div>
      <nav className="pf-ref-nav">
        {visible.map(([to,label,icon]) => <NavLink key={to} to={to} end={to==="/"} className={({isActive})=>isActive?"pf-ref-nav-link active":"pf-ref-nav-link"}><span>{icon}</span>{label}</NavLink>)}
      </nav>
      <div className="pf-ref-sidebar-user">
        <div><strong>{auth.employee?.name}</strong><span>{auth.employee?.role || "No Role"}</span></div>
        <button onClick={logout} title="ออกจากระบบ">⏻</button>
      </div>
    </aside>

    <header className="pf-ref-mobile-topbar">
      <div className="pf-ref-mobile-user"><div className="pf-ref-brand-logo small">PF</div><div><strong>{auth.employee?.name}</strong><span>{auth.employee?.role}</span></div></div>
      <button onClick={logout}>⏻</button>
    </header>

    <main className="pf-ref-main">
      <Routes>
        <Route path="/" element={<Protected permission="can_view_dashboard"><Dashboard/></Protected>} />
        <Route path="/parts" element={<Protected permission="can_view_parts"><Parts/></Protected>} />
        <Route path="/inventory" element={<Protected permission="can_view_parts"><Inventory/></Protected>} />
        <Route path="/suppliers" element={<Protected permission="can_view_suppliers"><Suppliers/></Protected>} />
        <Route path="/machines" element={<Protected permission="can_view_machines"><Machines/></Protected>} />
        <Route path="/settings/roles" element={<Protected permission="can_manage_roles"><RoleSettings/></Protected>} />
      </Routes>
    </main>

    <nav className="pf-ref-mobile-nav">
      {visible.slice(0,5).map(([to,label,icon]) => <NavLink key={to} to={to} end={to==="/"} className={({isActive})=>isActive?"pf-ref-mobile-link active":"pf-ref-mobile-link"}><span>{icon}</span><small>{label}</small></NavLink>)}
    </nav>
  </div>;
}

export default function App(){
  return <Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/*" element={<Protected><Shell/></Protected>}/>
  </Routes>;
}
