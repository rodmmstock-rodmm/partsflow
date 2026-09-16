import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { OptionsProvider } from "./optionsContext";
import ProductionApprovedUi from "./ProductionApprovedUi";
import { installOrderSelectedExcelExport } from "./orderSelectedExcelExport";
import { installOrderDetailEnhancer } from "./orderDetailEnhancer";
import { installDrawingPathEnhancer } from "./drawingPathEnhancer";
import "./styles.css";
import "./searchable-select.css";
import "./order-focus-v8.css";
import "./order-v9.css";
import "./order-v9-refine.css";
import "./production-approved-theme.css";
import "./production-order-step-theme.css";
import "./production-theme-final.css";
import "./order-v10.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProductionApprovedUi />
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
installDrawingPathEnhancer();
