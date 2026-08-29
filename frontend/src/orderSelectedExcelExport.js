import * as XLSX from "xlsx";

const BUTTON_ID = "partsflow-order-selected-export";
const INSTALLED_KEY = "__partsflowOrderSelectedExcelExportInstalled";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function currentPageTitle() {
  return cleanText(document.querySelector(".page-header h1")?.textContent);
}

function orderTable() {
  return document.querySelector("table.order-table");
}

function selectedOrderRows(table = orderTable()) {
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).filter((row) => {
    const checkbox = row.querySelector('td:first-child input[type="checkbox"]');
    return !!checkbox?.checked;
  });
}

function cellText(cell) {
  const select = cell?.querySelector("select");
  if (select) {
    return cleanText(select.options?.[select.selectedIndex]?.textContent);
  }
  return cleanText(cell?.textContent);
}

function exportSelectedOrders() {
  const table = orderTable();
  const rows = selectedOrderRows(table);
  if (!table || !rows.length) return;

  const headers = Array.from(table.querySelectorAll("thead tr th"))
    .slice(1)
    .map((cell) => cleanText(cell.textContent));

  const data = rows.map((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    const orderNo = cleanText(cells[0]?.querySelector("b")?.textContent);
    return [orderNo, ...cells.slice(1).map(cellText)];
  });

  const aoa = [["ORDER NO", ...headers], ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = aoa[0].map((_, columnIndex) => {
    const width = aoa.reduce((max, row) => {
      const length = cleanText(row[columnIndex]).length;
      return Math.max(max, length);
    }, 0);
    return { wch: Math.min(Math.max(width + 2, 10), 42) };
  });

  if (ws["!ref"]) {
    ws["!autofilter"] = { ref: ws["!ref"] };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Selected Orders");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `partsflow_orders_selected_${date}.xlsx`);
}

function findBulkToolbar() {
  return Array.from(document.querySelectorAll(".toolbar.wrap")).find((node) =>
    cleanText(node.textContent).includes("เลือกแล้ว")
  );
}

function removeButton() {
  document.getElementById(BUTTON_ID)?.remove();
}

function syncButton() {
  // Order Step already has its own project export controls. Add this helper only
  // to the normal Order page requested by the user.
  if (currentPageTitle() !== "Order") {
    removeButton();
    return;
  }

  const table = orderTable();
  const toolbar = findBulkToolbar();
  if (!table || !toolbar) {
    removeButton();
    return;
  }

  const count = selectedOrderRows(table).length;
  let button = document.getElementById(BUTTON_ID);

  if (!button) {
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "btn ghost";
    button.addEventListener("click", exportSelectedOrders);

    const summary = toolbar.querySelector("strong");
    if (summary?.nextSibling) toolbar.insertBefore(button, summary.nextSibling);
    else toolbar.appendChild(button);
  }

  const label = `⬇ Export Excel (${count})`;
  const title = count
    ? `Export ${count} รายการที่เลือกเป็นไฟล์ Excel`
    : "เลือกรายการ Order ก่อน Export";

  button.disabled = count === 0;
  if (button.textContent !== label) button.textContent = label;
  if (button.title !== title) button.title = title;
}

export function installOrderSelectedExcelExport() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;

  let pendingFrame = 0;
  const scheduleSync = () => {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = 0;
      syncButton();
    });
  };

  document.addEventListener("change", (event) => {
    if (event.target?.matches?.('input[type="checkbox"]')) scheduleSync();
  });

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });

  scheduleSync();
}
