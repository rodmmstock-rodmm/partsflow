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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
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
