const API_BASE = "https://partsflow-production.up.railway.app/api";
const BUILD_MARKER = "order-probe-20260829-1720";

function getToken() {
  try {
    return sessionStorage.getItem("partsflow_auth_token") || "";
  } catch {
    return "";
  }
}

async function jsonFetch(path, token = "") {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    cache: "no-store",
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

function isOrderPage() {
  return window.location.pathname === "/orders";
}

function mountProbe(text, ok) {
  let node = document.getElementById("partsflow-order-runtime-probe");
  if (!node) {
    node = document.createElement("div");
    node.id = "partsflow-order-runtime-probe";
    node.style.position = "fixed";
    node.style.left = "12px";
    node.style.right = "12px";
    node.style.top = "12px";
    node.style.zIndex = "999999";
    node.style.padding = "10px 12px";
    node.style.borderRadius = "10px";
    node.style.font = "12px/1.4 system-ui, sans-serif";
    node.style.boxShadow = "0 6px 24px rgba(0,0,0,.18)";
    node.style.wordBreak = "break-word";
    document.body.appendChild(node);
  }
  node.style.background = ok ? "#ecfdf5" : "#fff7ed";
  node.style.color = ok ? "#065f46" : "#9a3412";
  node.style.border = ok ? "1px solid #a7f3d0" : "1px solid #fed7aa";
  node.textContent = text;
}

async function runProbe() {
  if (!isOrderPage()) return;
  const token = getToken();
  try {
    const [check, me, orders] = await Promise.all([
      jsonFetch("/production-check/"),
      jsonFetch("/auth/me/", token),
      jsonFetch("/orders/?view=normal&q=&urgency=all&job=&status=", token),
    ]);

    const imported = check.data?.imported_order_count ?? "?";
    const dbTotal = check.data?.order_count ?? "?";
    const employee = me.data?.employee?.employee_code || "?";
    const results = Array.isArray(orders.data?.results)
      ? orders.data.results.length
      : "?";
    const apiCount = orders.data?.count ?? "?";
    const kpiTotal = orders.data?.kpi?.total ?? "?";
    const ok = orders.status === 200 && Number(results) > 0;

    mountProbe(
      `${BUILD_MARKER} | host=${window.location.host} | api=${API_BASE} | emp=${employee} | db=${dbTotal} | imported=${imported} | orders_http=${orders.status} | results=${results} | count=${apiCount} | kpi_total=${kpiTotal}`,
      ok
    );
  } catch (error) {
    mountProbe(
      `${BUILD_MARKER} | host=${window.location.host} | api=${API_BASE} | probe_error=${error?.message || error}`,
      false
    );
  }
}

export function installOrderRuntimeProbe() {
  const schedule = () => window.setTimeout(runProbe, 900);
  schedule();
  window.addEventListener("popstate", schedule);
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = (...args) => {
    const result = originalPushState(...args);
    schedule();
    return result;
  };
  history.replaceState = (...args) => {
    const result = originalReplaceState(...args);
    schedule();
    return result;
  };
}
