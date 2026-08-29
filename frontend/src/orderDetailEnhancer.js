import { apiGet } from "./api";

const INSTALLED_KEY = "__partsflowOrderDetailEnhancerInstalled";
const MODAL_ID = "partsflow-order-detail-modal";
const STYLE_ID = "partsflow-order-detail-style";
const ORDER_TARGET_SELECTOR =
  "table.order-table tbody tr, article.m-order-card, article.m-step-order";
const INTERACTIVE_SELECTOR =
  "button,input,select,textarea,a,label,summary,details,[role=button]";

const ORDER_FIELDS = [
  { key: null, label: "DATE", value: (d) => d.date },
  {
    key: "factory",
    label: "FACTORY",
    value: (d) => (d.factory === "MM-11" ? "Phase11" : "Phase4"),
  },
  {
    key: "machine",
    label: "MACHINE",
    value: (d) => joinCodeName(d.machine_code, d.machine_name),
  },
  { key: "job", label: "JOB", value: (d) => d.job },
  { key: "urgent_status", label: "Urgent", value: (d) => d.urgent_status },
  {
    key: "pending_data_date",
    label: "วันที่งานค้าง",
    value: (d) => d.pending_data_date,
  },
  { key: "item_id", label: "Item ID", value: (d) => d.item_id },
  { key: "part_name", label: "Part Name", value: (d) => d.part_name },
  {
    key: "part_detail",
    label: "Part Detail",
    value: (d) => d.part_detail,
    wide: true,
  },
  { key: "maker", label: "MAKER", value: (d) => d.maker },
  { key: "amount", label: "AMOUNT", value: (d) => d.amount },
  { key: "unit", label: "UNIT", value: (d) => d.unit },
  {
    key: "ordered_by",
    label: "ORDERED BY",
    value: (d) => joinCodeName(d.ordered_by_code, d.ordered_by),
  },
  {
    key: "remark",
    label: "REMARK",
    value: (d) => d.remark,
    wide: true,
  },
];

const PURCHASE_FIELDS = [
  { key: "quotation", label: "QUOTATION", value: (d) => d.quotation },
  { key: "po_number", label: "PO NUMBER", value: (d) => d.po_number },
  {
    key: "price_per_unit",
    label: "PRICE PER UNIT",
    value: (d) => moneyValue(d.price_per_unit),
  },
  {
    key: null,
    label: "TOTAL",
    value: (d) => moneyValue(d.price_total),
  },
  {
    key: "vendor",
    label: "VENDOR ORDER",
    value: (d) => joinCodeName(d.vendor_code, d.vendor_name),
  },
  {
    key: "lead_time_days",
    label: "LEAD TIME",
    value: (d) =>
      d.lead_time_days === null || d.lead_time_days === undefined
        ? ""
        : `${d.lead_time_days} DAY`,
  },
  {
    key: "issue_pr_date",
    label: "ISSUE PR DATE",
    value: (d) => d.issue_pr_date,
  },
  { key: "due_date", label: "DUE DATE", value: (d) => d.due_date },
  {
    key: "vendor_confirm_date",
    label: "VENDOR CONFIRM DATE",
    value: (d) => d.vendor_confirm_date,
  },
  {
    key: "person_in_charge",
    label: "PERSON IN CHARGE",
    value: (d) =>
      joinCodeName(d.person_in_charge_code, d.person_in_charge),
  },
];

const WORKFLOW_FIELDS = [
  {
    key: "status",
    label: "STATUS",
    value: (d) => d.display_status || d.status,
  },
  {
    key: "lifecycle_status",
    label: "LIFECYCLE",
    value: (d) => d.lifecycle_status,
  },
  {
    key: "edit_data_status",
    label: "EDIT DATA",
    value: (d) => d.edit_data_status,
  },
  {
    key: "received_at",
    label: "RECEIVED AT",
    value: (d) => dateTimeValue(d.received_at),
  },
  {
    key: "usage_status",
    label: "USE / NOT USED",
    value: (d) => (d.usage_status === "NOT_USED" ? "ไม่ได้ใช้" : "ใช้"),
  },
  {
    key: "cancel_status",
    label: "CANCEL STATUS",
    value: (d) => (d.cancel_status ? "Cancelled" : "-"),
  },
  {
    key: "cancel_reason",
    label: "CANCEL REASON",
    value: (d) => d.cancel_reason,
    wide: true,
  },
  {
    key: "completion_note",
    label: "COMPLETION NOTE",
    value: (d) => d.completion_note,
    wide: true,
  },
];

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function joinCodeName(code, name) {
  const c = cleanText(code);
  const n = cleanText(name);
  if (c && n) return `${c} · ${n}`;
  return c || n;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function dateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pf-order-detail-card{max-width:1180px;max-height:88vh;overflow:auto}
    .pf-order-detail-summary{display:flex;gap:12px;flex-wrap:wrap;padding:10px 12px;margin-bottom:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:12px}
    .pf-order-detail-summary b{color:#0f172a}
    .pf-order-detail-section{margin-top:16px}
    .pf-order-detail-section>h3{font-size:13px;margin:0 0 9px;color:#334155}
    .pf-order-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    .pf-order-detail-field{min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#fff}
    .pf-order-detail-field.wide{grid-column:span 3}
    .pf-order-detail-label{display:block;font-size:10px;font-weight:700;letter-spacing:.04em;color:#64748b;margin-bottom:5px}
    .pf-order-detail-value{font-size:13px;color:#0f172a;white-space:pre-wrap;overflow-wrap:anywhere}
    .pf-order-stamp{margin-top:7px;padding-top:7px;border-top:1px dashed #cbd5e1;font-size:10px;color:#7c3aed}
    .pf-order-stamp details{margin-top:5px;color:#475569}
    .pf-order-stamp summary{cursor:pointer;color:#6d28d9;font-weight:600}
    .pf-order-stamp-history{display:grid;gap:6px;margin-top:6px}
    .pf-order-stamp-entry{padding:7px;border-radius:8px;background:#f8fafc;color:#475569}
    .pf-order-stamp-change{display:block;margin-top:3px;color:#334155;overflow-wrap:anywhere}
    @media(max-width:760px){.pf-order-detail-card{max-height:90vh}.pf-order-detail-grid{grid-template-columns:1fr}.pf-order-detail-field.wide{grid-column:span 1}}
  `;
  document.head.appendChild(style);
}

function stampBlock(stamps) {
  if (!Array.isArray(stamps) || !stamps.length) return null;

  const wrap = el("div", "pf-order-stamp");
  const latest = stamps[0];
  const who = cleanText(latest.employee_code) || "ไม่ทราบรหัส";
  wrap.appendChild(
    el(
      "div",
      "",
      `แก้ไขล่าสุด ${who} · ${dateTimeValue(latest.created_at)}`
    )
  );

  const details = el("details");
  const summary = el("summary", "", `ดูประวัติการแก้ไข ${stamps.length} ครั้ง`);
  details.appendChild(summary);
  const history = el("div", "pf-order-stamp-history");

  stamps.forEach((stamp) => {
    const item = el("div", "pf-order-stamp-entry");
    const employee = [stamp.employee_code, stamp.employee_name]
      .filter(Boolean)
      .join(" · ");
    item.appendChild(
      el(
        "div",
        "",
        `${employee || "ไม่ทราบผู้แก้ไข"} · ${dateTimeValue(stamp.created_at)}`
      )
    );
    item.appendChild(
      el(
        "span",
        "pf-order-stamp-change",
        `${displayValue(stamp.old)} → ${displayValue(stamp.new)}`
      )
    );
    history.appendChild(item);
  });

  details.appendChild(history);
  wrap.appendChild(details);
  return wrap;
}

function fieldCard(definition, data) {
  const card = el(
    "div",
    `pf-order-detail-field${definition.wide ? " wide" : ""}`
  );
  card.appendChild(el("span", "pf-order-detail-label", definition.label));
  card.appendChild(
    el("div", "pf-order-detail-value", displayValue(definition.value(data)))
  );

  if (data.can_view_field_stamps && definition.key) {
    const stamp = stampBlock(data.field_stamps?.[definition.key]);
    if (stamp) card.appendChild(stamp);
  }
  return card;
}

function section(title, definitions, data) {
  const sectionNode = el("section", "pf-order-detail-section");
  sectionNode.appendChild(el("h3", "", title));
  const grid = el("div", "pf-order-detail-grid");
  definitions.forEach((definition) =>
    grid.appendChild(fieldCard(definition, data))
  );
  sectionNode.appendChild(grid);
  return sectionNode;
}

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function showOrderDetail(data) {
  closeModal();
  ensureStyles();

  const backdrop = el("div", "modal-backdrop");
  backdrop.id = MODAL_ID;
  const card = el("div", "modal-card wide pf-order-detail-card");
  const head = el("div", "modal-head");
  head.appendChild(el("h2", "", `Order Detail · ${data.order_number || "-"}`));
  const close = el("button", "icon-btn", "×");
  close.type = "button";
  close.setAttribute("aria-label", "ปิดรายละเอียด Order");
  close.addEventListener("click", closeModal);
  head.appendChild(close);
  card.appendChild(head);

  const summary = el("div", "pf-order-detail-summary");
  const recorder = joinCodeName(data.recorded_by_code, data.recorded_by);
  const summaryItems = [
    `ผู้บันทึกเริ่มต้น: ${recorder || "-"}`,
    `สร้าง: ${dateTimeValue(data.created_at) || "-"}`,
    `อัปเดตล่าสุด: ${dateTimeValue(data.updated_at) || "-"}`,
  ];
  summaryItems.forEach((text) => summary.appendChild(el("span", "", text)));
  card.appendChild(summary);

  card.appendChild(section("1. Order Information", ORDER_FIELDS, data));
  card.appendChild(section("2. Purchase Information", PURCHASE_FIELDS, data));
  card.appendChild(section("3. Workflow / Lifecycle", WORKFLOW_FIELDS, data));

  const actions = el("div", "modal-actions");
  const done = el("button", "btn ghost", "ปิด");
  done.type = "button";
  done.addEventListener("click", closeModal);
  actions.appendChild(done);
  card.appendChild(actions);

  card.addEventListener("mousedown", (event) => event.stopPropagation());
  backdrop.addEventListener("mousedown", closeModal);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

function orderNumberFromTarget(target) {
  if (target.matches("table.order-table tbody tr")) {
    return cleanText(target.querySelector("td:first-child b")?.textContent);
  }
  return cleanText(
    target.querySelector(".m-row-between b")?.textContent ||
      target.querySelector("b")?.textContent
  );
}

async function openTarget(target) {
  const orderNumber = orderNumberFromTarget(target);
  if (!orderNumber) return;
  try {
    const data = await apiGet(
      `/orders/detail-by-number/${encodeURIComponent(orderNumber)}/`,
      { forceRefresh: true, cache: false }
    );
    showOrderDetail(data);
  } catch (error) {
    window.alert(`เปิดรายละเอียด Order ไม่สำเร็จ: ${error.message}`);
  }
}

function syncOrderTargets() {
  document.querySelectorAll(ORDER_TARGET_SELECTOR).forEach((target) => {
    target.style.cursor = "pointer";
    target.title = "คลิกเพื่อดูรายละเอียด Order";
    if (!target.hasAttribute("tabindex")) target.tabIndex = 0;
    if (!target.hasAttribute("role")) target.setAttribute("role", "button");
  });
}

function hideDashboardDetailButtons() {
  document
    .querySelectorAll("table.dashboard-stock-table .row-actions button")
    .forEach((button) => {
      if (cleanText(button.textContent) === "รายละเอียด") {
        button.style.display = "none";
        button.tabIndex = -1;
        button.setAttribute("aria-hidden", "true");
      }
    });
}

function syncEnhancements() {
  syncOrderTargets();
  hideDashboardDetailButtons();
}

export function installOrderDetailEnhancer() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;

  ensureStyles();

  document.addEventListener("click", (event) => {
    if (event.target.closest(INTERACTIVE_SELECTOR)) return;
    const target = event.target.closest(ORDER_TARGET_SELECTOR);
    if (!target) return;
    openTarget(target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById(MODAL_ID)) {
      closeModal();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest(INTERACTIVE_SELECTOR)) return;
    const target = event.target.closest(ORDER_TARGET_SELECTOR);
    if (!target || event.target !== target) return;
    event.preventDefault();
    openTarget(target);
  });

  const root = document.getElementById("root");
  if (root) {
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncEnhancements();
      });
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  syncEnhancements();
}
