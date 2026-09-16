import { apiGet } from "./api";

const INSTALLED_KEY = "__partsflowDrawingPathEnhancerInstalled";
const MODAL_ID = "partsflow-order-detail-modal";
const DETAIL_FIELD_CLASS = "pf-order-detail-drawing-field";
const LEGACY_BUTTON_CLASS = "pf-open-drawing-folder";

function cleanPath(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parentPath(value) {
  const path = cleanPath(value);
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (!url.pathname.endsWith("/")) {
        const parts = url.pathname.split("/");
        const last = parts[parts.length - 1] || "";
        if (last.includes(".")) {
          parts.pop();
          url.pathname = `${parts.join("/") || "/"}/`;
        }
      }
      return url.toString();
    } catch {
      return path;
    }
  }

  const trimmed = path.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/);
  const last = segments[segments.length - 1] || "";
  if (!last.includes(".")) return trimmed;

  return trimmed
    .slice(0, Math.max(0, trimmed.length - last.length))
    .replace(/[\\/]+$/, "");
}

function toOpenUrl(folder) {
  const value = cleanPath(folder);
  if (!value) return "";
  if (/^(https?|file):\/\//i.test(value)) return encodeURI(value);
  if (/^\\\\/.test(value)) {
    return encodeURI(`file://${value.replace(/^\\\\/, "").replace(/\\/g, "/")}`);
  }
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return encodeURI(`file:///${value.replace(/\\/g, "/")}`);
  }
  return encodeURI(`file:///${value.replace(/\\/g, "/")}`);
}

export function openDrawingFolder(rawPath) {
  const folder = parentPath(rawPath);
  if (!folder) {
    window.alert("ยังไม่ได้ระบุ Drawing Path");
    return;
  }

  const url = toOpenUrl(folder);
  try {
    const opened = window.open(url, "_blank");
    if (opened) {
      try {
        opened.opener = null;
      } catch {
        // Ignore browser-specific opener restrictions.
      }
      return;
    }
  } catch {
    // Fall through to the browser-policy message below.
  }

  if (/^file:\/\//i.test(url)) {
    window.alert(
      "เบราว์เซอร์บล็อกการเปิด file:// จากหน้าเว็บ HTTPS โดยตรง กรุณาอนุญาต File URL/Local Intranet สำหรับ PartsFlow ใน Browser ของบริษัท"
    );
  } else {
    window.alert("ไม่สามารถเปิด Drawing Path นี้ได้จาก Browser");
  }
}

function orderNumberFromDetail(modal) {
  const title = cleanText(modal.querySelector(".modal-head h2")?.textContent);
  const prefix = "Order Detail ·";
  if (title.startsWith(prefix)) return cleanText(title.slice(prefix.length));
  const index = title.indexOf("·");
  return index >= 0 ? cleanText(title.slice(index + 1)) : "";
}

function buildDrawingField(data) {
  const field = document.createElement("div");
  field.className = `pf-order-detail-field wide ${DETAIL_FIELD_CLASS}`;

  const label = document.createElement("span");
  label.className = "pf-order-detail-label";
  label.textContent = "DRAWING PATH";
  field.appendChild(label);

  const value = document.createElement("div");
  value.className = "pf-order-detail-value";
  value.textContent = cleanPath(data.drawing_path) || "-";
  field.appendChild(value);

  if (cleanPath(data.drawing_path)) {
    const action = document.createElement("div");
    action.style.marginTop = "9px";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn ghost";
    button.textContent = "📂 เปิด Folder";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDrawingFolder(data.drawing_path);
    });

    action.appendChild(button);
    field.appendChild(action);
  }

  return field;
}

async function enhanceOrderDetail() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal || modal.querySelector(`.${DETAIL_FIELD_CLASS}`)) return;
  if (modal.dataset.pfDrawingPathLoading === "1") return;

  const grid = modal.querySelector(".pf-order-detail-section .pf-order-detail-grid");
  const orderNumber = orderNumberFromDetail(modal);
  if (!grid || !orderNumber) return;

  modal.dataset.pfDrawingPathLoading = "1";
  try {
    const data = await apiGet(
      `/orders/detail-by-number/${encodeURIComponent(orderNumber)}/`,
      { forceRefresh: true, cache: false }
    );
    if (!document.body.contains(modal)) return;
    if (!modal.querySelector(`.${DETAIL_FIELD_CLASS}`)) {
      grid.appendChild(buildDrawingField(data));
    }
  } catch (error) {
    console.warn("PartsFlow: unable to load Drawing Path for Order Detail", error);
  } finally {
    delete modal.dataset.pfDrawingPathLoading;
  }
}

function removeLegacyEditButtons() {
  document.querySelectorAll(`.${LEGACY_BUTTON_CLASS}`).forEach((button) => button.remove());
}

function syncDrawingPathUi() {
  removeLegacyEditButtons();
  enhanceOrderDetail();
}

export function installDrawingPathEnhancer() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;

  syncDrawingPathUi();
  const observer = new MutationObserver(syncDrawingPathUi);
  observer.observe(document.body, { childList: true, subtree: true });
}
