const permissionKeys = [
  "can_view_dashboard","can_view_parts","can_edit_parts","can_adjust_stock","can_receive_stock","can_issue_stock",
  "can_view_history","can_edit_history","can_delete_history","can_view_safety_stock","can_view_orders","can_view_order_updates",
  "can_add_order","can_edit_order_info","can_edit_order_date","can_edit_purchase_info","can_receive_order","can_cancel_order",
  "can_delete_order","can_update_edit_data","can_manage_order_projects","can_confirm_order_step","can_create_order_from_quotation",
  "can_view_deleted_orders","can_view_suppliers","can_manage_suppliers","can_view_machines","can_manage_machines","can_view_employees",
  "can_add_employees","can_edit_employees","can_view_audit_log","can_manage_roles","can_view_field_stamps"
];

const permissions = Object.fromEntries(permissionKeys.map((key) => [key, true]));

export const designLabEmployee = {
  id: 1,
  employee_code: "DL001",
  name: "Design Lab Admin",
  email: "designlab@example.local",
  department: "Maintenance",
  role: "ADMIN",
  active: true,
  permissions,
};

const employees = [
  designLabEmployee,
  { id: 2, employee_code: "MT102", name: "Somchai Maintenance", email: "somchai@example.local", department: "Maintenance", role: "TECHNICIAN", active: true },
  { id: 3, employee_code: "PC205", name: "Narin Purchasing", email: "narin@example.local", department: "Purchasing", role: "PURCHASE", active: true },
];

const machines = [
  { id: 1, code: "MC-CUT-01", name: "Cutting Machine 01", dept_code: "MT", work_code: "CUT", location: "Phase4", machine_type: "Cutting", active: true },
  { id: 2, code: "MC-PRS-02", name: "Press Machine 02", dept_code: "MT", work_code: "PRESS", location: "Phase11", machine_type: "Press", active: true },
  { id: 3, code: "MC-PMP-03", name: "Pump Station 03", dept_code: "UT", work_code: "PUMP", location: "Phase4", machine_type: "Utility", active: true },
];

const vendors = [
  { id: 1, code: "V001", name: "Siam Industrial Supply", contact: "K. May", contact_person: "K. May", phone: "02-000-1001", email: "sales@siam.example", active: true, contacts: [] },
  { id: 2, code: "V002", name: "Motion Parts Thailand", contact: "K. Ton", contact_person: "K. Ton", phone: "02-000-1002", email: "quote@motion.example", active: true, contacts: [] },
  { id: 3, code: "V003", name: "Precision Bearing Co.", contact: "K. Beam", contact_person: "K. Beam", phone: "02-000-1003", email: "sales@bearing.example", active: true, contacts: [] },
];

let parts = [
  { id: 1, sku: "BRG-6205", name: "Bearing 6205 ZZ", description: "Deep groove ball bearing 25x52x15 mm", maker_name: "NSK", unit_code: "EA", location_code: "A-01-02", warehouse_code: "MM-4", stock_qty: 2, min_stock: 5, reorder_qty: 6, last_purchase_price: 285, critical: true, active: true, image_url: "", image_path: "" },
  { id: 2, sku: "BELT-A42", name: "V-Belt A42", description: "Industrial V-belt for cutting machine", maker_name: "Bando", unit_code: "EA", location_code: "B-03-01", warehouse_code: "MM-4", stock_qty: 8, min_stock: 4, reorder_qty: 4, last_purchase_price: 190, critical: false, active: true, image_url: "", image_path: "" },
  { id: 3, sku: "SEN-PROX-M18", name: "Proximity Sensor M18", description: "Inductive proximity sensor 10-30VDC", maker_name: "Omron", unit_code: "EA", location_code: "C-02-04", warehouse_code: "MM-11", stock_qty: 1, min_stock: 3, reorder_qty: 4, last_purchase_price: 1450, critical: true, active: true, image_url: "", image_path: "" },
  { id: 4, sku: "SEAL-35-47", name: "Oil Seal 35x47x7", description: "NBR rotary shaft seal", maker_name: "NOK", unit_code: "EA", location_code: "A-04-03", warehouse_code: "MM-11", stock_qty: 14, min_stock: 6, reorder_qty: 6, last_purchase_price: 120, critical: false, active: true, image_url: "", image_path: "" },
  { id: 5, sku: "CONT-18A", name: "Magnetic Contactor 18A", description: "3P contactor 220VAC coil", maker_name: "Schneider", unit_code: "EA", location_code: "E-01-01", warehouse_code: "MM-4", stock_qty: 0, min_stock: 2, reorder_qty: 3, last_purchase_price: 1780, critical: true, active: true, image_url: "", image_path: "" },
];

let orders = [
  { id: 101, order_number: "ORD-2609-0048", date: "2026-09-11", factory: "MM-4", machine_code: "MC-CUT-01", machine_name: "Cutting Machine 01", job: "REPAIR", urgent_status: "เครื่องหยุด", pending_data_date: "2026-09-10", item_id: "BRG-6205", part_name: "Bearing 6205 ZZ", part_detail: "Deep groove ball bearing 25x52x15 mm", maker: "NSK", amount: 4, unit: "EA", ordered_by_code: "MT102", ordered_by: "Somchai Maintenance", remark: "เปลี่ยน bearing ด้าน drive", quotation: "QT-2609-088", po_number: "", price_per_unit: 285, price_total: 1140, vendor_code: "V003", vendor_name: "Precision Bearing Co.", lead_time_days: 5, issue_pr_date: "2026-09-11", due_date: "2026-09-16", vendor_confirm_date: "2026-09-11", person_in_charge_code: "PC205", person_in_charge: "Narin Purchasing", display_status: "Wait Quotation", status: "Wait Quotation", lifecycle_status: "ACTIVE", edit_data_status: "UPDATED", usage_status: "USE", cancel_status: false, cancel_reason: "", completion_note: "", recorded_by_code: "MT102", recorded_by: "Somchai Maintenance", created_at: "2026-09-11T01:15:00Z", updated_at: "2026-09-11T03:30:00Z" },
  { id: 102, order_number: "ORD-2609-0047", date: "2026-09-10", factory: "MM-11", machine_code: "MC-PRS-02", machine_name: "Press Machine 02", job: "REPAIR", urgent_status: "เครื่องไม่หยุด", pending_data_date: "", item_id: "SEN-PROX-M18", part_name: "Proximity Sensor M18", part_detail: "Inductive proximity sensor 10-30VDC", maker: "Omron", amount: 2, unit: "EA", ordered_by_code: "MT102", ordered_by: "Somchai Maintenance", remark: "", quotation: "", po_number: "", price_per_unit: 1450, price_total: 2900, vendor_code: "V001", vendor_name: "Siam Industrial Supply", lead_time_days: 7, issue_pr_date: "", due_date: "", vendor_confirm_date: "", person_in_charge_code: "PC205", person_in_charge: "Narin Purchasing", display_status: "New Order", status: "New Order", lifecycle_status: "WAIT_CONFIRM", edit_data_status: "PENDING", usage_status: "USE", cancel_status: false, cancel_reason: "", completion_note: "", recorded_by_code: "MT102", recorded_by: "Somchai Maintenance", created_at: "2026-09-10T02:10:00Z", updated_at: "2026-09-10T02:10:00Z" },
  { id: 103, order_number: "ORD-2609-0046", date: "2026-09-09", factory: "MM-4", machine_code: "MC-PMP-03", machine_name: "Pump Station 03", job: "SPARE", urgent_status: "", pending_data_date: "", item_id: "SEAL-35-47", part_name: "Oil Seal 35x47x7", part_detail: "NBR rotary shaft seal", maker: "NOK", amount: 10, unit: "EA", ordered_by_code: "DL001", ordered_by: "Design Lab Admin", remark: "Stock spare", quotation: "QT-2609-076", po_number: "PO-2609-113", price_per_unit: 120, price_total: 1200, vendor_code: "V002", vendor_name: "Motion Parts Thailand", lead_time_days: 3, issue_pr_date: "2026-09-09", due_date: "2026-09-12", vendor_confirm_date: "2026-09-09", person_in_charge_code: "PC205", person_in_charge: "Narin Purchasing", display_status: "Wait for Item", status: "Wait for Item", lifecycle_status: "ACTIVE", edit_data_status: "UPDATED", usage_status: "USE", cancel_status: false, cancel_reason: "", completion_note: "", recorded_by_code: "DL001", recorded_by: "Design Lab Admin", created_at: "2026-09-09T03:00:00Z", updated_at: "2026-09-09T04:00:00Z" },
  { id: 104, order_number: "ORD-2609-0045", date: "2026-09-08", factory: "MM-4", machine_code: "MC-CUT-01", machine_name: "Cutting Machine 01", job: "REPAIR", urgent_status: "", pending_data_date: "", item_id: "BELT-A42", part_name: "V-Belt A42", part_detail: "Industrial V-belt for cutting machine", maker: "Bando", amount: 4, unit: "EA", ordered_by_code: "MT102", ordered_by: "Somchai Maintenance", remark: "", quotation: "QT-2609-061", po_number: "PO-2609-100", price_per_unit: 190, price_total: 760, vendor_code: "V001", vendor_name: "Siam Industrial Supply", lead_time_days: 2, issue_pr_date: "2026-09-08", due_date: "2026-09-10", vendor_confirm_date: "2026-09-08", person_in_charge_code: "PC205", person_in_charge: "Narin Purchasing", display_status: "Complete Order", status: "Complete Order", lifecycle_status: "COMPLETED", edit_data_status: "UPDATED", usage_status: "USE", cancel_status: false, cancel_reason: "", completion_note: "รับของครบแล้ว", received_at: "2026-09-10T04:30:00Z", recorded_by_code: "MT102", recorded_by: "Somchai Maintenance", created_at: "2026-09-08T01:40:00Z", updated_at: "2026-09-10T04:30:00Z" },
  { id: 105, order_number: "ORD-2609-0044", date: "2026-09-07", factory: "MM-4", machine_code: "MC-PRS-02", machine_name: "Press Machine 02", job: "REPAIR", urgent_status: "", pending_data_date: "", item_id: "CONT-18A", part_name: "Magnetic Contactor 18A", part_detail: "3P contactor 220VAC coil", maker: "Schneider", amount: 2, unit: "EA", ordered_by_code: "MT102", ordered_by: "Somchai Maintenance", remark: "", quotation: "", po_number: "", price_per_unit: 1780, price_total: 3560, vendor_code: "", vendor_name: "", lead_time_days: null, issue_pr_date: "", due_date: "", vendor_confirm_date: "", person_in_charge_code: "", person_in_charge: "", display_status: "Cancelled", status: "Cancelled", lifecycle_status: "CANCELLED", edit_data_status: "PENDING", usage_status: "NOT_USED", cancel_status: true, cancel_reason: "Machine plan changed", completion_note: "", recorded_by_code: "MT102", recorded_by: "Somchai Maintenance", created_at: "2026-09-07T02:00:00Z", updated_at: "2026-09-07T06:00:00Z" },
];

const history = [
  { id: 1, transaction_date: "2026-09-11T03:10:00Z", date: "11/09/2026", time: "10:10", type: "OUT", item_id: "BRG-6205", part_name: "Bearing 6205 ZZ", part_detail: "Deep groove ball bearing", maker: "NSK", location: "A-01-02", machine: "MC-CUT-01", requester: "Somchai Maintenance", requester_id: 2, recorder: "Design Lab Admin", recorder_id: 1, quantity: 2, unit: "EA", remark: "Repair" },
  { id: 2, transaction_date: "2026-09-10T04:20:00Z", date: "10/09/2026", time: "11:20", type: "IN", item_id: "BELT-A42", part_name: "V-Belt A42", part_detail: "Industrial V-belt", maker: "Bando", location: "B-03-01", machine: "", requester: "", recorder: "Narin Purchasing", recorder_id: 3, quantity: 6, unit: "EA", remark: "PO-2609-100" },
  { id: 3, transaction_date: "2026-09-09T05:00:00Z", date: "09/09/2026", time: "12:00", type: "ADJUSTMENT", item_id: "SEAL-35-47", part_name: "Oil Seal 35x47x7", part_detail: "NBR rotary shaft seal", maker: "NOK", location: "A-04-03", machine: "", requester: "", recorder: "Design Lab Admin", recorder_id: 1, quantity: 1, unit: "EA", remark: "Cycle count" },
];

let fastOrders = [
  { id: 1, name: "Bearing Cutting", item_id: "BRG-6205", part_name: "Bearing 6205 ZZ", factory: "MM-4", machine_code: "MC-CUT-01", machine_name: "Cutting Machine 01", job: "SPARE", remark: "Fast moving" },
  { id: 2, name: "Sensor Press", item_id: "SEN-PROX-M18", part_name: "Proximity Sensor M18", factory: "MM-11", machine_code: "MC-PRS-02", machine_name: "Press Machine 02", job: "SPARE", remark: "Keep ready" },
];

const roles = [
  { id: 1, role_name: "ADMIN", display_name: "Administrator", active: true, permissions: { ...permissions } },
  { id: 2, role_name: "PURCHASE", display_name: "Purchasing", active: true, permissions: { ...permissions, can_manage_roles: false } },
  { id: 3, role_name: "TECHNICIAN", display_name: "Technician", active: true, permissions: { ...permissions, can_manage_roles: false, can_manage_suppliers: false } },
];

const spareSets = [
  { id: 1, name: "Cutting Emergency Set", description: "อะไหล่หลักสำหรับ Cutting Machine 01", machine_code: "MC-CUT-01", machine_name: "Cutting Machine 01", readiness_status: "SHORTAGE", shortage_item_count: 1, available_sets: 0, ready_item_count: 2, item_count: 3, readiness_percent: 67, items: [
    { id: 11, sku: "BRG-6205", name: "Bearing 6205 ZZ", maker_name: "NSK", location_code: "A-01-02", quantity: 2, unit_code: "EA", stock_qty: 2, enough_for_one_set: true, available_sets: 1, shortage_qty: 0 },
    { id: 12, sku: "BELT-A42", name: "V-Belt A42", maker_name: "Bando", location_code: "B-03-01", quantity: 2, unit_code: "EA", stock_qty: 8, enough_for_one_set: true, available_sets: 4, shortage_qty: 0 },
    { id: 13, sku: "CONT-18A", name: "Magnetic Contactor 18A", maker_name: "Schneider", location_code: "E-01-01", quantity: 1, unit_code: "EA", stock_qty: 0, enough_for_one_set: false, available_sets: 0, shortage_qty: 1 },
  ]},
  { id: 2, name: "Press Sensor Set", description: "Sensors and seals for Press Machine 02", machine_code: "MC-PRS-02", machine_name: "Press Machine 02", readiness_status: "READY", shortage_item_count: 0, available_sets: 1, ready_item_count: 2, item_count: 2, readiness_percent: 100, items: [
    { id: 21, sku: "SEN-PROX-M18", name: "Proximity Sensor M18", maker_name: "Omron", location_code: "C-02-04", quantity: 1, unit_code: "EA", stock_qty: 1, enough_for_one_set: true, available_sets: 1, shortage_qty: 0 },
    { id: 22, sku: "SEAL-35-47", name: "Oil Seal 35x47x7", maker_name: "NOK", location_code: "A-04-03", quantity: 2, unit_code: "EA", stock_qty: 14, enough_for_one_set: true, available_sets: 7, shortage_qty: 0 },
  ]},
];

const poBalances = [
  { id: 501, rfq_number: "RFQ-2609-021", vendor: "Precision Bearing Co.", vendor_id: 3, recipient_email: "sales@bearing.example", sent_at: "2026-09-11T02:00:00Z", sent_by: "Narin Purchasing", group_order: "G-2609-09", job: "REPAIR", subject: "RFQ - Bearing 6205 ZZ", to_emails: ["sales@bearing.example"], cc_emails: ["designlab@example.local"], email_link: "", gmail_link: "", items: [{ id: 101, order_number: "ORD-2609-0048", item_id: "BRG-6205", part_name: "Bearing 6205 ZZ", part_detail: "Deep groove ball bearing", amount: 4, unit: "EA" }], po_balance: { quotation_received_at: "", price: "", currency: "THB", lead_time_days: "", vendor_delivery_date: "", actual_delivery_date: "", note: "" }, messages: [] },
];

const options = {
  employees,
  machines,
  vendors,
  parts,
  locations: [{ id: 1, code: "A-01-02" }, { id: 2, code: "B-03-01" }, { id: 3, code: "C-02-04" }],
  units: [{ id: 1, code: "EA" }, { id: 2, code: "SET" }, { id: 3, code: "M" }],
  jobs: [{ id: 1, code: "REPAIR" }, { id: 2, code: "SPARE" }],
  warehouses: [{ id: 1, code: "MM-4", name: "Phase4" }, { id: 2, code: "MM-11", name: "Phase11" }],
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function parse(path) {
  const [pathname, query = ""] = String(path || "").split("?");
  return { pathname, params: new URLSearchParams(query) };
}

function orderList(params) {
  const view = params.get("view") || "normal";
  let result = orders.filter((o) => {
    if (view === "completed") return o.lifecycle_status === "COMPLETED";
    if (view === "cancelled") return o.lifecycle_status === "CANCELLED";
    if (view === "confirm") return o.lifecycle_status === "WAIT_CONFIRM";
    if (view === "updates") return o.edit_data_status === "PENDING" && o.lifecycle_status !== "CANCELLED";
    if (view === "deleted") return false;
    return ["ACTIVE", "WAIT_CONFIRM"].includes(o.lifecycle_status);
  });
  const q = (params.get("q") || "").toLowerCase();
  if (q) result = result.filter((o) => `${o.order_number} ${o.item_id} ${o.part_name} ${o.machine_name}`.toLowerCase().includes(q));
  return {
    results: result,
    kpi: { month_total: orders.length, urgent_stop: 1, urgent_running: 1, pending_data: 1, wait_confirm: 1 },
  };
}

export async function designLabRequest(path, optionsArg = {}) {
  const method = String(optionsArg.method || "GET").toUpperCase();
  const body = optionsArg.body ? JSON.parse(optionsArg.body) : {};
  const { pathname, params } = parse(path);

  if (pathname === "/auth/login/") return clone({ token: "design-lab-token", employee: designLabEmployee });
  if (pathname === "/auth/logout/") return clone({ ok: true });
  if (pathname === "/auth/me/") return clone({ employee: designLabEmployee });
  if (pathname === "/options/") return clone({ ...options, parts });

  if (method === "GET" && pathname === "/dashboard/") {
    return { kpi: { parts: parts.length, safety_stock: 3, safety_stock_ordered: 1 } };
  }
  if (method === "GET" && pathname === "/parts/") {
    const active = params.get("active");
    const q = (params.get("q") || "").toLowerCase();
    let result = parts.filter((p) => active === null || String(p.active) === active);
    if (q) result = result.filter((p) => `${p.sku} ${p.name} ${p.description} ${p.maker_name} ${p.location_code}`.toLowerCase().includes(q));
    return clone({ results: result, count: result.length, page: 1, page_size: 50, total_pages: 1, has_next: false, has_previous: false });
  }
  if (method === "GET" && /^\/parts\/\d+\/$/.test(pathname)) {
    const id = Number(pathname.split("/")[2]);
    return clone(parts.find((p) => p.id === id) || parts[0]);
  }
  if (method !== "GET" && (pathname === "/parts/" || /^\/parts\/\d+\/$/.test(pathname))) {
    const id = Number(pathname.split("/")[2]) || Math.max(...parts.map((p) => p.id)) + 1;
    const existing = parts.find((p) => p.id === id);
    if (existing) Object.assign(existing, body);
    else parts.push({ id, stock_qty: 0, active: true, ...body });
    return clone(parts.find((p) => p.id === id));
  }

  if (method === "GET" && pathname === "/history/") return clone({ results: history });
  if (method === "GET" && pathname === "/safety-stock/") {
    return clone({ results: parts.filter((p) => Number(p.stock_qty) < Number(p.min_stock)).map((p) => ({ ...p, order_qty: p.reorder_qty, last_machine: p.id === 1 ? "MC-CUT-01" : "MC-PRS-02" })) });
  }
  if (method === "GET" && pathname === "/spare-sets/") return clone({ results: spareSets });
  if (method === "GET" && pathname === "/fast-orders/") return clone({ results: fastOrders });
  if (method === "GET" && pathname === "/suppliers/") return clone({ results: vendors });
  if (method === "GET" && pathname === "/machines/") return clone({ results: machines });
  if (method === "GET" && pathname === "/employees/") return clone({ results: employees });
  if (method === "GET" && pathname === "/roles/") return clone({ results: roles });
  if (method === "GET" && pathname === "/audit-logs/") return clone({ results: [
    { id: 1, created_at: "2026-09-11T03:00:00Z", employee: designLabEmployee, action: "UPDATE", entity: "Order", entity_id: 101, detail: { field: "status", from: "New Order", to: "Wait Quotation" } },
    { id: 2, created_at: "2026-09-11T02:00:00Z", employee: designLabEmployee, action: "CREATE", entity: "Vendor", entity_id: 3, detail: { code: "V003" } },
  ]});

  if (method === "GET" && pathname === "/orders/") return clone(orderList(params));
  if (method === "GET" && pathname.startsWith("/orders/detail-by-number/")) {
    const number = decodeURIComponent(pathname.split("/").filter(Boolean).pop());
    const found = orders.find((o) => o.order_number === number) || orders[0];
    return clone({ ...found, can_view_field_stamps: true, field_stamps: { status: [{ employee_name: "Design Lab Admin", created_at: "2026-09-11T03:30:00Z", old: "New Order", new: found.display_status }] } });
  }
  if (method !== "GET" && pathname.startsWith("/orders/")) {
    const id = Number(pathname.split("/")[2]);
    const found = orders.find((o) => o.id === id);
    if (found) {
      if (pathname.endsWith("/wait-confirm/")) found.lifecycle_status = body.wait_confirm === false ? "ACTIVE" : "WAIT_CONFIRM";
      if (pathname.endsWith("/receive/")) { found.lifecycle_status = "COMPLETED"; found.display_status = "Complete Order"; }
      if (pathname.endsWith("/cancel/")) { found.lifecycle_status = body.cancel === false ? "ACTIVE" : "CANCELLED"; found.cancel_status = body.cancel !== false; found.cancel_reason = body.reason || ""; }
      if (pathname.endsWith("/restore/")) found.lifecycle_status = "ACTIVE";
      if (pathname.endsWith("/update-data/")) found.edit_data_status = "UPDATED";
    }
    return clone(found || { ok: true });
  }

  if (method === "GET" && pathname === "/po-balances/") return clone({ results: poBalances });
  if (method === "GET" && /^\/po-balances\/\d+\/$/.test(pathname)) return clone(poBalances[0]);
  if (method === "GET" && pathname.startsWith("/rfqs/")) return clone(poBalances[0]);

  if (method !== "GET" && pathname.includes("/fast-orders/") && pathname.endsWith("/order/")) {
    return clone({ order_number: "ORD-2609-DL01", item_id: "BRG-6205", amount: body.amount || 1 });
  }

  if (method !== "GET") return clone({ ok: true, id: Date.now(), ...body });

  // Order Step and any newly added page can still render safely without touching Production.
  // Unknown GET endpoints intentionally return an empty result set instead of making a network request.
  return clone({ results: [] });
}

export async function designLabUpload(path, formData) {
  const first = parts[0];
  return clone({ ...first, image_url: "", image_path: "" });
}

export async function designLabDownload(fallbackName = "design-lab-download.txt") {
  const blob = new Blob(["PartsFlow Design Lab mock download\nNo Production data was accessed."], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
