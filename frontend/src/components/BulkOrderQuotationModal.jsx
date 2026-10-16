import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";
import { Alert, Modal, SearchableSelect } from "./Common";

function vendorLabel(vendor) {
  if (!vendor) return "";
  return `${vendor.code ? `${vendor.code} · ` : ""}${vendor.name || ""}`;
}

export default function BulkOrderQuotationModal({
  mode,
  orders,
  options,
  onClose,
  onSaved,
}) {
  const [vendorId, setVendorId] = useState("");
  const [vendorLists, setVendorLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const selectedVendor = (options.vendors || []).find(
    (vendor) => String(vendor.id) === String(vendorId)
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all(
      orders.map(async (order) => {
        const data = await apiGet(`/orders/${order.id}/vendors/`, {
          cache: false,
          forceRefresh: true,
        });
        return [String(order.id), data.results || []];
      })
    )
      .then((entries) => {
        if (active) setVendorLists(Object.fromEntries(entries));
      })
      .catch((err) => {
        if (active) setError(`โหลด Order Quotation ไม่สำเร็จ: ${err.message}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orders]);

  const previewRows = useMemo(() => orders.map((order) => {
    const vendors = vendorLists[String(order.id)] || [];
    const match = vendors.find(
      (row) => String(row.vendor_id) === String(vendorId)
    );
    return {
      ...order,
      vendors,
      alreadyAdded: !!match,
      hasVendor: vendors.some(
        (row) => String(row.vendor_id) === String(vendorId)
      ),
      currentVendorOrder: order.vendor_id
        ? (options.vendors || []).find(
            (vendor) => String(vendor.id) === String(order.vendor_id)
          )
        : null,
    };
  }), [orders, vendorLists, vendorId, options.vendors]);

  const missingVendorOrders = previewRows.filter((row) => !row.hasVendor);
  const canSave = Boolean(
    vendorId &&
    !loading &&
    !busy &&
    !error &&
    (mode === "quotation" || (previewRows.length > 0 && missingVendorOrders.length === 0))
  );

  async function save() {
    if (!selectedVendor || !canSave) return;
    setBusy(true);
    setError("");
    const successes = [];
    const failures = [];

    for (const row of previewRows) {
      try {
        if (mode === "quotation") {
          if (row.alreadyAdded) {
            successes.push({ order: row, skipped: true });
            continue;
          }
          await apiPost(`/orders/${row.id}/vendors/`, { vendor_id: vendorId });
          successes.push({ order: row, skipped: false });
        } else {
          if (String(row.vendor_id || "") === String(vendorId)) {
            successes.push({ order: row, unchanged: true });
            continue;
          }
          await apiPatch(`/orders/${row.id}/purchase/`, { vendor_id: vendorId });
          successes.push({ order: row, unchanged: false });
        }
      } catch (err) {
        failures.push(`${row.order_number}: ${err.message}`);
      }
    }

    setResult({
      successCount: successes.filter((row) => !row.skipped && !row.unchanged).length,
      skippedCount: successes.filter((row) => row.skipped || row.unchanged).length,
      failures,
    });
    setBusy(false);
  }

  const title = mode === "quotation" ? "Order Quotation" : "Vendor Order";
  const actionLabel = mode === "quotation" ? "เพิ่ม Vendor ใน Order Quotation" : "บันทึก Vendor Order";

  if (result) {
    return (
      <Modal title={`${title} · ผลการบันทึก`} onClose={onClose} wide>
        <div className={result.failures.length ? "alert warning" : "alert success"}>
          สำเร็จ ${result.successCount} รายการ · ไม่ต้องเปลี่ยนแปลง ${result.skippedCount} รายการ
          {result.failures.length ? ` · ไม่สำเร็จ ${result.failures.length} รายการ` : ""}
        </div>
        {result.failures.length > 0 && (
          <div className="alert danger">
            {result.failures.map((message) => <div key={message}>{message}</div>)}
          </div>
        )}
        <div className="modal-actions">
          <button
            className="btn primary"
            type="button"
            onClick={() => onSaved?.()}
          >
            เสร็จสิ้น
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${title} · ${orders.length} Order`} onClose={onClose} wide>
      <div className="form-grid">
        <label className="field span2">
          <span>Vendor *</span>
          <SearchableSelect
            required
            value={vendorId}
            options={options.vendors || []}
            onChange={setVendorId}
            getLabel={vendorLabel}
            getSearchText={(vendor) => `${vendor.code || ""} ${vendor.name || ""} ${vendor.email || ""} ${vendor.contact_person || ""}`}
            placeholder="พิมพ์ชื่อหรือรหัส Vendor"
          />
        </label>
      </div>

      <Alert>{error}</Alert>
      {loading ? (
        <div className="empty">กำลังตรวจสอบ Order Quotation ของรายการที่เลือก...</div>
      ) : vendorId ? (
        <>
          {mode === "quotation" ? (
            <div className="alert info">
              ตรวจสอบรายการก่อนบันทึก: Vendor ที่มีอยู่แล้วจะไม่ถูกเพิ่มซ้ำ ระบบจะไม่ส่งอีเมลอัตโนมัติ
            </div>
          ) : (
            <>
              {missingVendorOrders.length ? (
                <div className="alert warning">
                  Vendor นี้ยังไม่อยู่ใน Order Quotation ของ ${missingVendorOrders.length} รายการ จึงยังบันทึก Vendor Order ไม่ได้ กรุณาเพิ่ม Vendor ใน Order Quotation ก่อน
                </div>
              ) : (
                <div className="alert info">
                  ตรวจสอบแล้วว่า Vendor อยู่ใน Order Quotation ของทุกรายการ ระบบจะแสดงตัวอย่างด้านล่างก่อนบันทึก
                </div>
              )}
            </>
          )}
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Part ID</th>
                  <th>Vendor Order ปัจจุบัน</th>
                  <th>ผลที่จะเกิดขึ้น</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.order_number}</b></td>
                    <td>{row.item_id || "-"}</td>
                    <td>{row.currentVendorOrder ? vendorLabel(row.currentVendorOrder) : (row.vendor_name || "-")}</td>
                    <td>
                      {mode === "quotation"
                        ? row.alreadyAdded
                          ? "มี Vendor นี้แล้ว · ไม่เพิ่มซ้ำ"
                          : `เพิ่ม ${vendorLabel(selectedVendor)} ใน Order Quotation`
                        : missingVendorOrders.some((item) => item.id === row.id)
                          ? "ยังไม่มี Vendor ใน Order Quotation"
                          : String(row.vendor_id || "") === String(vendorId)
                            ? "ใช้ Vendor นี้อยู่แล้ว"
                            : `เปลี่ยนเป็น ${vendorLabel(selectedVendor)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty">เลือก Vendor เพื่อดูตัวอย่างก่อนบันทึก</div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" disabled={!canSave} onClick={save}>
          {busy ? "กำลังบันทึก..." : actionLabel}
        </button>
      </div>
    </Modal>
  );
}
