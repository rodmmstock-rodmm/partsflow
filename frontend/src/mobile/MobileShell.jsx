import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { NotificationBell } from "../components/Common";
import MobileDashboard from "./MobileDashboard";
import MobileHistory from "./MobileHistory";
import MobileSafetyStock from "./MobileSafetyStock";
import MobileSpareSets from "./MobileSpareSets";
import MobileOrders from "./MobileOrders";
import MobileOrderSteps from "./MobileOrderSteps";
import OrderStatusDashboard from "../pages/OrderStatusDashboard";
import MobileFastOrders from "./MobileFastOrders";
import MobileVendors from "./MobileVendors";
import MobileMachines from "./MobileMachines";
import MobileRoles from "./MobileRoles";
import POBalance from "../pages/POBalance";

const NAV = [
  ["/", "Stock", "box", "can_view_dashboard"],
  ["/history", "History", "clock", "can_view_history"],
  ["/safety-stock", "Safety", "alert", "can_view_safety_stock"],
  ["/orders", "Order", "cart", "can_view_orders"],
  ["/order-steps", "Steps", "steps", "can_view_order_step"],
  ["/order-status", "Dashboard", "chart", "can_view_order_status"],
  ["/po-balance", "PO", "mail", "can_view_po_balance"],
  ["/fast-orders", "Fast", "zap", "can_view_orders"],
  ["/vendors", "Vendor", "vendor", "can_view_suppliers"],
  ["/machines", "Machine", "gear", "can_view_machines"],
  ["/settings/roles", "Roles", "shield", "can_manage_roles"],
];

const ICON_SPRITE = (
  <svg style={{ display: "none" }} aria-hidden="true">
    <symbol id="ic-box" viewBox="0 0 24 24"><path d="M21 8L12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></symbol>
    <symbol id="ic-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></symbol>
    <symbol id="ic-alert" viewBox="0 0 24 24"><path d="M10.6 3.9L2.4 18a1.8 1.8 0 001.6 2.7h16a1.8 1.8 0 001.6-2.7L13.4 3.9a1.8 1.8 0 00-2.8 0z"/><path d="M12 9.5v4"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-cart" viewBox="0 0 24 24"><circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="20" r="1.1" fill="currentColor" stroke="none"/><path d="M2.5 3h2l2.3 12a1.8 1.8 0 001.8 1.5h8.4a1.8 1.8 0 001.8-1.4L21 7.5H6.2"/></symbol>
    <symbol id="ic-steps" viewBox="0 0 24 24"><rect x="6" y="3.2" width="12" height="17.6" rx="2"/><path d="M9.3 3.2v-.4a1 1 0 011-1h3.4a1 1 0 011 1v.4"/><path d="M9 9.5h6M9 13h6M9 16.5h3.5"/></symbol>
    <symbol id="ic-chart" viewBox="0 0 24 24"><path d="M12 3a9 9 0 100 18 9 9 0 000-18z"/><path d="M12 3v9l6.4-4.9A9 9 0 0012 3z"/></symbol>
    <symbol id="ic-mail" viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></symbol>
    <symbol id="ic-vendor" viewBox="0 0 24 24"><rect x="4.5" y="3" width="15" height="18" rx="1.2"/><path d="M9 7.3h.9M14.1 7.3h.9M9 11.3h.9M14.1 11.3h.9M9 15.3h.9M14.1 15.3h.9"/><path d="M10.2 21v-3.4h3.6V21"/></symbol>
    <symbol id="ic-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5c.1.6.1 1.2 0 1.8l1.7 1.3-1.5 2.6-2-.6a7 7 0 01-1.6.9l-.3 2.1H10.3l-.3-2.1a7 7 0 01-1.6-.9l-2 .6-1.5-2.6L6.6 15c-.1-.6-.1-1.2 0-1.8L4.9 11.9l1.5-2.6 2 .6c.5-.4 1-.7 1.6-.9l.3-2.1h3.4l.3 2.1c.6.2 1.1.5 1.6.9l2-.6 1.5 2.6z"/></symbol>
    <symbol id="ic-shield" viewBox="0 0 24 24"><path d="M12 2.5l7.5 3.4v5.3c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.9L12 2.5z"/><path d="M9 12l2 2 4-4.2"/></symbol>
    <symbol id="ic-zap" viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></symbol>
    <symbol id="ic-power" viewBox="0 0 24 24"><path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1011.4 0"/></symbol>
  </svg>
);

function Protected({ permission, children }) {
  const auth = useAuth();
  if (permission && !auth.can(permission)) return <Navigate to="/" replace />;
  return children;
}

export default function MobileShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const visible = NAV.filter(([, , , p]) => auth.can(p));

  async function logout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="mobile-app-shell">
      {ICON_SPRITE}
      <header className="m-topbar">
        <div className="m-brand">
          <div className="brand-logo small">PF</div>
          <div>
            <strong>PartsFlow</strong>
            <span>{auth.employee?.name} · {auth.employee?.role}</span>
          </div>
        </div>
        <div className="m-topbar-actions">
          <NotificationBell compact />
          <button onClick={logout} aria-label="ออกจากระบบ">
            <svg className="nav-icon"><use href="#ic-power" /></svg>
          </button>
        </div>
      </header>

      <main className="m-main">
        <Routes>
          <Route path="/" element={<Protected permission="can_view_dashboard"><MobileDashboard /></Protected>} />
          <Route path="/spare-sets" element={<Protected permission="can_view_dashboard"><MobileSpareSets /></Protected>} />
          <Route path="/history" element={<Protected permission="can_view_history"><MobileHistory /></Protected>} />
          <Route path="/safety-stock" element={<Protected permission="can_view_safety_stock"><MobileSafetyStock /></Protected>} />
          <Route path="/orders" element={<Protected permission="can_view_orders"><MobileOrders /></Protected>} />
          <Route path="/po-balance" element={<Protected permission="can_view_po_balance"><POBalance /></Protected>} />
          <Route path="/order-steps" element={<Protected permission="can_view_order_step"><MobileOrderSteps /></Protected>} />
          <Route path="/order-status" element={<Protected permission="can_view_order_status"><OrderStatusDashboard /></Protected>} />
          <Route path="/fast-orders" element={<Protected permission="can_view_orders"><MobileFastOrders /></Protected>} />
          <Route path="/vendors" element={<Protected permission="can_view_suppliers"><MobileVendors /></Protected>} />
          <Route path="/machines" element={<Protected permission="can_view_machines"><MobileMachines /></Protected>} />
          <Route path="/settings/roles" element={<Protected permission="can_manage_roles"><MobileRoles /></Protected>} />
        </Routes>
      </main>

      <nav className="m-bottom-nav">
        {visible.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <svg className="m-nav-icon"><use href={`#ic-${icon}`} /></svg>
            <small>{label}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
