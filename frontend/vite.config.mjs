import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PRODUCTION_API_BASE = "https://partsflow-production.up.railway.app/api";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(PRODUCTION_API_BASE),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
