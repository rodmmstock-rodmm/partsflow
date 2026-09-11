import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { OptionsProvider } from "./optionsContext";
import { installOrderSelectedExcelExport } from "./orderSelectedExcelExport";
import { installOrderDetailEnhancer } from "./orderDetailEnhancer";
import "./styles.css";
import "./searchable-select.css";
import "./order-focus-v8.css";
import "./order-v9.css";
import "./order-v9-refine.css";

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
