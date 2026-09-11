import React from "react";
import ReactDOM from "react-dom/client";
import { createPortal } from "react-dom";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "./App";
import { apiGet } from "./api";
import { AuthProvider } from "./auth";
import { OptionsProvider } from "./optionsContext";
import { installOrderSelectedExcelExport } from "./orderSelectedExcelExport";
import { installOrderDetailEnhancer } from "./orderDetailEnhancer";
import "./styles.css";
import "./searchable-select.css";
import "./order-focus-v8.css";
import "./order-v9.css";
import "./order-v9-refine.css";

const DESIGN_LAB_JOB_CARDS = ["REPAIR", "MODIFY", "AUTOMATION", "PM", "GENERAL"];

function DesignLabLayoutStyle() {
  return (
    <style>{`
      @media (min-width: 768px) {
        .hamburger-btn,
        .sidebar-backdrop,
        .sidebar-close {
          display: none !important;
        }

        .sidebar,
        .sidebar.open {
          transform: translateX(0) !important;
          box-shadow: 8px 0 28px rgba(27, 36, 48, 0.035);
        }

        .main-content {
          margin-left: 256px !important;
          padding: 32px !important;
          max-width: none !important;
          width: calc(100% - 256px);
        }
      }
    `}</style>
  );
}

function DesignLabOrderJobKpi() {
  const { pathname } = useLocation();
  const [host, setHost] = React.useState(null);
  const [counts, setCounts] = React.useState(() =>
    Object.fromEntries(DESIGN_LAB_JOB_CARDS.map((job) => [job, 0]))
  );

  React.useEffect(() => {
    if (pathname !== "/orders") {
      document.getElementById("design-lab-job-kpi-host")?.remove();
      setHost(null);
      return undefined;
    }

    let stopped = false;
    const root = document.getElementById("root");

    const syncHost = () => {
      if (stopped) return;
      const target = document.querySelector(".order-kpi-v9");
      let node = document.getElementById("design-lab-job-kpi-host");

      if (!target) {
        node?.remove();
        setHost(null);
        return;
      }

      if (!node) {
        node = document.createElement("div");
        node.id = "design-lab-job-kpi-host";
      }

      if (target.nextElementSibling !== node) {
        target.insertAdjacentElement("afterend", node);
      }
      setHost(node);
    };

    syncHost();
    const observer = new MutationObserver(syncHost);
    if (root) observer.observe(root, { childList: true, subtree: true });

    return () => {
      stopped = true;
      observer.disconnect();
      document.getElementById("design-lab-job-kpi-host")?.remove();
      setHost(null);
    };
  }, [pathname]);

  React.useEffect(() => {
    if (pathname !== "/orders") return undefined;
    let active = true;

    async function loadJobCounts() {
      try {
        const datasets = await Promise.all([
          apiGet("/orders/?view=normal", { cache: false, forceRefresh: true }),
          apiGet("/orders/?view=completed", { cache: false, forceRefresh: true }),
          apiGet("/orders/?view=cancelled", { cache: false, forceRefresh: true }),
        ]);

        const unique = new Map();
        datasets.forEach((data) => {
          (data?.results || []).forEach((order) => unique.set(String(order.id), order));
        });

        const next = Object.fromEntries(DESIGN_LAB_JOB_CARDS.map((job) => [job, 0]));
        unique.forEach((order) => {
          const job = String(order?.job || "").trim().toUpperCase();
          if (Object.prototype.hasOwnProperty.call(next, job)) next[job] += 1;
        });

        if (active) setCounts(next);
      } catch {
        // Design Lab stays usable even if a mock response is temporarily unavailable.
      }
    }

    loadJobCounts();
    return () => {
      active = false;
    };
  }, [pathname]);

  if (pathname !== "/orders" || !host) return null;

  return createPortal(
    <div className="kpi-grid five compact">
      {DESIGN_LAB_JOB_CARDS.map((job) => (
        <div className="kpi-card" key={job}>
          <span>{job}</span>
          <strong>{Number(counts[job] || 0).toLocaleString("th-TH")}</strong>
        </div>
      ))}
    </div>,
    host
  );
}

function DesignLabBadge() {
  return (
    <div
      title="Prototype only · ใช้ Mock Data · ไม่เชื่อม Production Database"
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 10px",
        border: "1px solid #d98a54",
        borderRadius: 999,
        background: "rgba(255,249,242,.96)",
        color: "#7a3c17",
        boxShadow: "0 4px 16px rgba(72,44,20,.14)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".04em",
        backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#c1622b" }} />
      DESIGN LAB · MOCK DATA
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <DesignLabLayoutStyle />
      <DesignLabBadge />
      <DesignLabOrderJobKpi />
      <AuthProvider>
        <OptionsProvider>
          <App />
        </OptionsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

installOrderSelectedExcelExport();
installOrderDetailEnhancer();
